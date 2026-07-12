import os
import sys
import time
import socket
import uuid
import random
import threading
from datetime import datetime, timezone
import concurrent.futures
import json
import structlog

from app.config import settings
from app.core.enums import JobStatus, WorkerStatus, ExecutionStatus
from app.worker.db import get_conn
from app.worker.tasks import TASK_REGISTRY

logger = structlog.get_logger()


class CustomWorker:
    def __init__(self):
        self.worker_id = uuid.uuid4()
        self.hostname = socket.gethostname()
        self.pid = os.getpid()
        self.name = f"worker-{self.hostname}-{self.pid}"
        self.concurrency = settings.WORKER_DEFAULT_CONCURRENCY
        self.active_jobs = 0
        self.active_jobs_lock = threading.Lock()
        
        self.running = False
        self.executor = concurrent.futures.ThreadPoolExecutor(max_workers=self.concurrency)
        self.heartbeat_thread = None

    def register_worker(self):
        """Insert this worker process row in the database."""
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO workers (id, name, hostname, status, concurrency, current_job_count, started_at, last_heartbeat_at, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (id) DO UPDATE 
                    SET status = EXCLUDED.status, last_heartbeat_at = EXCLUDED.last_heartbeat_at;
                    """,
                    (
                        str(self.worker_id),
                        self.name,
                        self.hostname,
                        WorkerStatus.ONLINE.value,
                        self.concurrency,
                        0,
                        datetime.now(timezone.utc),
                        datetime.now(timezone.utc),
                        datetime.now(timezone.utc),
                        datetime.now(timezone.utc),
                    )
                )
            conn.commit()
            logger.info("Worker registered successfully", id=self.worker_id, name=self.name)
        except Exception as e:
            logger.error("Failed to register worker", error=str(e))
            sys.exit(1)
        finally:
            conn.close()

    def send_heartbeat(self):
        """Periodically runs to update worker's heartbeat and report metrics."""
        while self.running:
            conn = get_conn()
            try:
                now = datetime.now(timezone.utc)
                with self.active_jobs_lock:
                    active = self.active_jobs

                # Update workers table
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        UPDATE workers
                        SET last_heartbeat_at = %s, current_job_count = %s, updated_at = %s
                        WHERE id = %s;
                        """,
                        (now, active, now, str(self.worker_id))
                    )

                    # Insert heartbeat record
                    cur.execute(
                        """
                        INSERT INTO worker_heartbeats (id, worker_id, active_job_count, created_at)
                        VALUES (%s, %s, %s, %s);
                        """,
                        (str(uuid.uuid4()), str(self.worker_id), active, now)
                    )
                conn.commit()
            except Exception as e:
                logger.error("Heartbeat post failed", error=str(e))
            finally:
                conn.close()
            time.sleep(settings.WORKER_HEARTBEAT_INTERVAL_SECONDS)

    def claim_next_job(self):
        """
        Locks and claims the next eligible job atomically using FOR UPDATE SKIP LOCKED.
        Uses PostgreSQL transaction safety.
        """
        conn = get_conn()
        try:
            now = datetime.now(timezone.utc)
            lock_token = uuid.uuid4()
            
            with conn.cursor() as cur:
                # Core claiming atomic query
                cur.execute(
                    """
                    UPDATE jobs
                    SET status = %s,
                        claimed_by_worker_id = %s,
                        claimed_at = %s,
                        started_at = %s,
                        attempt_count = attempt_count + 1,
                        lock_token = %s,
                        updated_at = %s
                    WHERE id = (
                        SELECT j.id
                        FROM jobs j
                        JOIN queues q ON j.queue_id = q.id
                        WHERE j.status IN ('queued', 'scheduled')
                          AND (j.run_at IS NULL OR j.run_at <= %s)
                          AND q.is_paused = FALSE
                        ORDER BY j.priority ASC, j.created_at ASC
                        LIMIT 1
                        FOR UPDATE SKIP LOCKED
                    )
                    RETURNING id, name, queue_id, handler, payload, attempt_count, max_retries, batch_id;
                    """,
                    (
                        JobStatus.CLAIMED.value,
                        str(self.worker_id),
                        now,
                        now,
                        str(lock_token),
                        now,
                        now
                    )
                )
                
                claimed = cur.fetchone()
                if claimed:
                    conn.commit()
                    return claimed
            
        except Exception as e:
            logger.error("Error claiming job from queue", error=str(e))
        finally:
            conn.close()
        return None

    def execute_job(self, job_row):
        """Invoked in ThreadPoolExecutor to run task logic."""
        job_id = job_row["id"]
        handler = job_row["handler"]
        payload = json.loads(job_row["payload"]) if isinstance(job_row["payload"], str) else job_row["payload"]
        attempt = job_row["attempt_count"]
        max_retries = job_row["max_retries"]
        queue_id = job_row["queue_id"]
        batch_id = job_row["batch_id"]

        logger.info("Executing job", job_id=job_id, attempt=attempt, handler=handler)
        
        execution_id = uuid.uuid4()
        conn = get_conn()
        
        # 1. Register starting execution and logs
        try:
            now = datetime.now(timezone.utc)
            with conn.cursor() as cur:
                # Update status to RUNNING in jobs
                cur.execute(
                    "UPDATE jobs SET status = %s, updated_at = %s WHERE id = %s;",
                    (JobStatus.RUNNING.value, now, str(job_id))
                )
                
                # Insert JobExecution
                cur.execute(
                    """
                    INSERT INTO job_executions (id, job_id, attempt_number, status, worker_id, started_at, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s);
                    """,
                    (str(execution_id), str(job_id), attempt, ExecutionStatus.STARTED.value, str(self.worker_id), now, now)
                )

                # Insert JobLog
                cur.execute(
                    """
                    INSERT INTO job_logs (id, job_id, level, message, created_at)
                    VALUES (%s, %s, %s, %s, %s);
                    """,
                    (str(uuid.uuid4()), str(job_id), "info", f"Job claimed by worker {self.name}. Execution attempt #{attempt} started.", now)
                )
            conn.commit()
        except Exception as e:
            logger.error("Failed executing job init queries", error=str(e))
            conn.close()
            with self.active_jobs_lock:
                self.active_jobs -= 1
            return

        # 2. Run payload handler
        success = False
        error_msg = None
        result_msg = None
        
        task_func = TASK_REGISTRY.get(handler)
        start_time = time.time()
        
        try:
            if not task_func:
                raise ImportError(f"Handler path '{handler}' is not registered on this worker.")
            
            # Execute task function
            result_msg = task_func(payload)
            success = True
        except Exception as e:
            error_msg = str(e)
            logger.warn("Job handler execution failed", job_id=job_id, error=error_msg)

        duration = round(time.time() - start_time, 3)

        # 3. Handle Completion or Retry/DLQ
        now = datetime.now(timezone.utc)
        try:
            with conn.cursor() as cur:
                if success:
                    # Update Job status to COMPLETED
                    cur.execute(
                        "UPDATE jobs SET status = %s, completed_at = %s, updated_at = %s WHERE id = %s;",
                        (JobStatus.COMPLETED.value, now, now, str(job_id))
                    )
                    
                    # Update JobExecution to SUCCEEDED
                    cur.execute(
                        "UPDATE job_executions SET status = %s, finished_at = %s WHERE id = %s;",
                        (ExecutionStatus.SUCCEEDED.value, now, str(execution_id))
                    )

                    # Write Log
                    cur.execute(
                        """
                        INSERT INTO job_logs (id, job_id, level, message, created_at)
                        VALUES (%s, %s, %s, %s, %s);
                        """,
                        (str(uuid.uuid4()), str(job_id), "info", f"Job completed successfully in {duration}s. Output: {result_msg}", now)
                    )

                    # Update BatchJob counter if linked
                    if batch_id:
                        cur.execute(
                            """
                            UPDATE batch_jobs 
                            SET completed_jobs = completed_jobs + 1, updated_at = %s 
                            WHERE id = %s
                            RETURNING total_jobs, completed_jobs, failed_jobs;
                            """,
                            (now, str(batch_id))
                        )
                        b_info = cur.fetchone()
                        if b_info and (b_info["completed_jobs"] + b_info["failed_jobs"] == b_info["total_jobs"]):
                            b_status = "completed_with_errors" if b_info["failed_jobs"] > 0 else "completed"
                            cur.execute(
                                "UPDATE batch_jobs SET status = %s WHERE id = %s;",
                                (b_status, str(batch_id))
                            )
                else:
                    # Job Failed - Assess Retry policy
                    if attempt < max_retries:
                        # Exponential Backoff formulation: 10 * 2^attempt seconds
                        backoff_sec = 10 * (2 ** attempt)
                        run_at = datetime.now(timezone.utc) + timer_delta(backoff_sec)
                        
                        # Requeue Job
                        cur.execute(
                            "UPDATE jobs SET status = %s, run_at = %s, updated_at = %s WHERE id = %s;",
                            (JobStatus.QUEUED.value, run_at, now, str(job_id))
                        )
                        
                        # Fail Execution
                        cur.execute(
                            "UPDATE job_executions SET status = %s, finished_at = %s, error_message = %s WHERE id = %s;",
                            (ExecutionStatus.FAILED.value, now, error_msg, str(execution_id))
                        )

                        # Write Log
                        cur.execute(
                            """
                            INSERT INTO job_logs (id, job_id, level, message, created_at)
                            VALUES (%s, %s, %s, %s, %s);
                            """,
                            (str(uuid.uuid4()), str(job_id), "warning", f"Attempt failed: {error_msg}. Requeuing for retry in {backoff_sec}s.", now)
                        )
                    else:
                        # Max retries exhausted - DLQ Move
                        cur.execute(
                            "UPDATE jobs SET status = %s, updated_at = %s WHERE id = %s;",
                            (JobStatus.DEAD_LETTER.value, now, str(job_id))
                        )

                        cur.execute(
                            "UPDATE job_executions SET status = %s, finished_at = %s, error_message = %s WHERE id = %s;",
                            (ExecutionStatus.FAILED.value, now, error_msg, str(execution_id))
                        )

                        # Write DeadLetterEntry
                        cur.execute(
                            """
                            INSERT INTO dead_letter_entries (id, job_id, queue_id, handler, payload_snapshot, reason, total_attempts, moved_at)
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s);
                            """,
                            (
                                str(uuid.uuid4()),
                                str(job_id),
                                str(queue_id),
                                handler,
                                json.dumps(payload),
                                f"Max retries ({max_retries}) exhausted. Last error: {error_msg}",
                                attempt,
                                now
                            )
                        )

                        cur.execute(
                            """
                            INSERT INTO job_logs (id, job_id, level, message, created_at)
                            VALUES (%s, %s, %s, %s, %s);
                            """,
                            (str(uuid.uuid4()), str(job_id), "error", f"Job failed permanently after {attempt} attempts. Relocated to DLQ.", now)
                        )

                        # Update BatchJob counter if linked
                        if batch_id:
                            cur.execute(
                                """
                                UPDATE batch_jobs 
                                SET failed_jobs = failed_jobs + 1, updated_at = %s 
                                WHERE id = %s
                                RETURNING total_jobs, completed_jobs, failed_jobs;
                                """,
                                (now, str(batch_id))
                            )
                            b_info = cur.fetchone()
                            if b_info and (b_info["completed_jobs"] + b_info["failed_jobs"] == b_info["total_jobs"]):
                                cur.execute(
                                    "UPDATE batch_jobs SET status = %s WHERE id = %s;",
                                    ("completed_with_errors", str(batch_id))
                                )
            
            conn.commit()
        except Exception as e:
            logger.error("Error finalizing job outcome", job_id=job_id, error=str(e))
        finally:
            conn.close()
            with self.active_jobs_lock:
                self.active_jobs -= 1

    def run(self):
        """Start the worker daemon loop."""
        self.running = True
        
        # 1. Register worker
        self.register_worker()
        
        # 2. Start heartbeat thread
        self.heartbeat_thread = threading.Thread(target=self.send_heartbeat, daemon=True)
        self.heartbeat_thread.start()

        logger.info("Worker polling loop started. Waiting for jobs...")
        
        # 3. Polling loop
        while self.running:
            with self.active_jobs_lock:
                active = self.active_jobs
            
            if active < self.concurrency:
                job_row = self.claim_next_job()
                if job_row:
                    with self.active_jobs_lock:
                        self.active_jobs += 1
                    
                    # Submit to execution thread pool
                    self.executor.submit(self.execute_job, job_row)
                    continue  # Poll immediately for more work
            
            time.sleep(settings.WORKER_POLL_INTERVAL_SECONDS)

    def shutdown(self):
        """Gracefully shut down the worker thread pools and mark status offline."""
        logger.info("Shutting down worker process...")
        self.running = False
        
        # Shutdown executor
        self.executor.shutdown(wait=True)
        
        # Update database status
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE workers SET status = %s, last_heartbeat_at = %s, updated_at = %s WHERE id = %s;",
                    (WorkerStatus.OFFLINE.value, datetime.now(timezone.utc), datetime.now(timezone.utc), str(self.worker_id))
                )
            conn.commit()
            logger.info("Worker marked offline. Shutdown complete.")
        except Exception as e:
            logger.error("Failed to mark worker offline on close", error=str(e))
        finally:
            conn.close()


def timer_delta(seconds):
    from datetime import timedelta
    return timedelta(seconds=seconds)


if __name__ == "__main__":
    worker = CustomWorker()
    try:
        worker.run()
    except KeyboardInterrupt:
        worker.shutdown()
