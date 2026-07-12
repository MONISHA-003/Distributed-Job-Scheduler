import time
import random
import structlog
from app.services.email import send_welcome_email

logger = structlog.get_logger()


def process_uploads(payload: dict) -> str:
    """Simulates file processing and scanning workload."""
    file_count = payload.get("file_count", 3)
    logger.info("Starting upload processing task", files=file_count)
    for i in range(1, file_count + 1):
        time.sleep(1)  # Simulate active execution workload
        logger.info("Scanned and uploaded file", index=i)
    return f"Successfully processed {file_count} uploads."


def send_email(payload: dict) -> str:
    """Sends a system notification email."""
    recipient = payload.get("recipient", "user@example.com")
    subject = payload.get("subject", "System alert")
    name = payload.get("name", "User")
    
    logger.info("Executing send_email task", recipient=recipient)
    time.sleep(1.5)
    
    # If it is a welcome email request, trigger it
    if "welcome" in subject.lower():
        send_welcome_email(recipient, name)
    
    return f"Email sent successfully to {recipient} with subject '{subject}'."


def db_backup(payload: dict) -> str:
    """Simulates a database backup operation."""
    tables = payload.get("tables", ["all"])
    logger.info("Initializing database backup task", tables=tables)
    time.sleep(3)
    return f"DB Backup created for tables: {', '.join(tables)}."


def gen_analytics(payload: dict) -> str:
    """Generates analytics report. Intermittently fails to demonstrate retries and DLQ."""
    fail_chance = payload.get("fail_chance", 0.5)
    logger.info("Running analytics generation")
    time.sleep(2)
    
    if random.random() < fail_chance:
        logger.warn("Analytics run encountered structural schema error!")
        raise ValueError("Data pipeline connection failed: DB Timeout during aggregation.")
        
    return "Analytics report generated and saved."


def crm_sync(payload: dict) -> str:
    """Simulates sync with external CRM API."""
    records = payload.get("records", 15)
    logger.info("Running CRM sync", records=records)
    time.sleep(2.5)
    return f"CRM contact cards synchronised: {records} cards updated."


# Task Registry Mapping
TASK_REGISTRY = {
    "app.worker.tasks.process_uploads": process_uploads,
    "app.worker.tasks.send_email": send_email,
    "app.worker.tasks.db_backup": db_backup,
    "app.worker.tasks.gen_analytics": gen_analytics,
    "app.worker.tasks.crm_sync": crm_sync,
}
