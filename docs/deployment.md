# Deployment Specification Guide

This guide outlines two professional approaches to deploying the Distributed Job Scheduler in a production-inspired cloud environment.

---

## Option 1: VPS Deployment with Docker Compose (Recommended)
This approach keeps your exact container setup (FastAPI, React, Postgres, Redis, Worker, Mailhog) running together on a single cloud Virtual Private Server (VPS) such as **DigitalOcean**, **AWS EC2**, or **Google Compute Engine**.

### Step 1: Provision a Server
1. Create a server (e.g., DigitalOcean Droplet or AWS EC2 t3.micro instance) running **Ubuntu 22.04 LTS**.
2. Configure security groups/firewall to expose the following ports:
   - `80` / `443` (HTTP/HTTPS)
   - `5173` (Frontend Client)
   - `8000` (FastAPI Server)
   - `8025` (Mailhog Web Inbox)

### Step 2: Install Docker and Compose
SSH into your server and run:
```bash
# Update package list
sudo apt-get update

# Install Docker
sudo apt-get install -y docker.io docker-compose

# Start and enable Docker service
sudo systemctl start docker
sudo systemctl enable docker
```

### Step 3: Clone and Configure Project
1. Clone your git repository to the server:
   ```bash
   git clone <your-repository-url> job-scheduler
   cd job-scheduler
   ```
2. Create your production environment file:
   ```bash
   cp .env.example .env
   ```
3. Edit `.env` to configure your credentials (e.g., change `JWT_SECRET_KEY` and set your public server IP for CORS origins):
   ```ini
   CORS_ORIGINS='["http://<your-server-ip>:5173"]'
   ```

### Step 4: Run the Stack
Rebuild and run the orchestration services in detached daemon mode:
```bash
sudo docker compose up --build -d
```
Your full stack is now live! 
- Access the frontend at: `http://<your-server-ip>:5173`
- Access Mailhog at: `http://<your-server-ip>:8025`

---

## Option 2: Managed Cloud Deployment (PaaS via Railway or Render)
For a serverless setup, you can deploy each service independently. This is highly scalable but requires splitting your database and cache layers out of Docker Compose.

### 1. Database (PostgreSQL) & Cache (Redis)
- **Railway**: Click **New Project** -> **Provision PostgreSQL** and **Provision Redis**.
- **Render**: Click **New** -> **PostgreSQL** and **New** -> **Redis**.
- Save the connection strings provided by the platform (e.g. `DATABASE_URL` and `REDIS_URL`).

### 2. FastAPI Backend
1. Create a Web Service on Railway/Render linked to your repository.
2. Set the build context to the root and specify:
   - **Dockerfile Path**: `backend/Dockerfile`
   - **Environment Variables**:
     - `DATABASE_URL`: (Your provisioned Postgres connection URL)
     - `DATABASE_URL_SYNC`: (Standard psycopg2 equivalent of your URL)
     - `REDIS_URL`: (Your provisioned Redis connection URL)
     - `CORS_ORIGINS`: `["https://<your-frontend-domain>.vercel.app"]`
3. Expose port `8000`.

### 3. Background Worker
1. Create a background worker service on Render or a standard service on Railway.
2. **Dockerfile Path**: `backend/Dockerfile`
3. **Start Command**: `python -m app.worker.main`
4. Bind the same `DATABASE_URL`, `DATABASE_URL_SYNC`, and `REDIS_URL` env vars.

### 4. Vite React Frontend
1. Host the React frontend on **Vercel** or **Netlify** (static file hosting is completely free).
2. Configure the Build settings:
   - **Build Command**: `npm run build`
   - **Publish Directory**: `dist`
3. In `App.tsx`, change `http://localhost:8000` to your deployed backend URL.
