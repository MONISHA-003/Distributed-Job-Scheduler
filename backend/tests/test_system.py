import pytest
from httpx import AsyncClient, ASGITransport
import uuid

from app.main import app


@pytest.mark.asyncio
async def test_complete_system_flow():
    """
    Test the complete user onboarding, project management, queue config, 
    and job submission pipeline.
    """
    test_email = f"engineer-{uuid.uuid4().hex[:6]}@example.com"
    test_password = "securepassword123"
    test_name = "System Engineer"

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. AUTHENTICATION & ONBOARDING
        signup_res = await ac.post(
            "/api/v1/auth/signup",
            json={
                "email": test_email,
                "password": test_password,
                "full_name": test_name
            }
        )
        assert signup_res.status_code == 201
        tokens = signup_res.json()
        assert "access_token" in tokens
        access_token = tokens["access_token"]
        headers = {"Authorization": f"Bearer {access_token}"}

        # Fetch profile
        me_res = await ac.get("/api/v1/auth/me", headers=headers)
        assert me_res.status_code == 200
        profile = me_res.json()
        assert profile["email"] == test_email
        assert len(profile["memberships"]) > 0
        org_id = profile["memberships"][0]["organization_id"]

        # 2. PROJECT MANAGEMENT
        # Create new project under user's organization
        proj_res = await ac.post(
            "/api/v1/projects/",
            headers=headers,
            json={
                "name": "Production Job Cluster",
                "organization_id": org_id
            }
        )
        assert proj_res.status_code == 201
        project = proj_res.json()

        # 3. QUEUE CONFIGURATION
        # Create Queue
        queue_res = await ac.post(
            f"/api/v1/queues/projects/{project['id']}/queues",
            headers=headers,
            json={
                "name": "critical-tasks",
                "priority": 2,
                "concurrency_limit": 8
            }
        )
        assert queue_res.status_code == 201
        queue = queue_res.json()

        # Pause and resume
        pause_res = await ac.post(f"/api/v1/queues/queues/{queue['id']}/pause", headers=headers)
        assert pause_res.status_code == 200
        assert pause_res.json()["is_paused"] is True

        resume_res = await ac.post(f"/api/v1/queues/queues/{queue['id']}/resume", headers=headers)
        assert resume_res.status_code == 200
        assert resume_res.json()["is_paused"] is False

        # 4. JOB LIFECYCLE SUBMISSION
        job_res = await ac.post(
            f"/api/v1/jobs/queues/{queue['id']}/jobs",
            headers=headers,
            json={
                "name": "Process Client Payments",
                "job_type": "immediate",
                "payload": {"amount": 250},
                "handler": "app.worker.tasks.process_uploads",
                "priority": 1
            }
        )
        assert job_res.status_code == 201
        job = job_res.json()
        assert job["status"] == "queued"
        assert job["name"] == "Process Client Payments"
