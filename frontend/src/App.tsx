import React, { useState, useEffect, useMemo } from 'react';
import { 
  Activity, 
  Terminal, 
  CheckCircle, 
  AlertCircle, 
  Play, 
  Zap, 
  Mail, 
  Lock, 
  User, 
  LogOut,
  Settings as SettingsIcon,
  Briefcase,
  Plus,
  Search,
  Trash2,
  Edit2,
  Copy,
  Bell,
  Users,
  History,
  Eye,
  Check,
  AlertTriangle,
  Clock
} from 'lucide-react';

// --- Interfaces ---
interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  is_superuser: boolean;
  role: string;
}

interface Project {
  id: string;
  name: string;
  organization_id: string;
  created_at: string;
}

interface Queue {
  id: string;
  project_id: string;
  name: string;
  priority: number;
  concurrency_limit: number;
  is_paused: boolean;
}

interface Job {
  id: string;
  queue_id: string;
  name: string;
  job_type: string;
  status: string;
  payload: any;
  handler: string;
  priority: number;
  run_at: string | null;
  cron_expression: string | null;
  attempt_count: number;
  max_retries: number;
  timeout_seconds: number;
  description: string | null;
  command: string | null;
  is_paused: boolean;
  tags: string[];
  created_at: string;
  completed_at: string | null;
  started_at: string | null;
  owner?: string;
}

interface JobExecution {
  id: string;
  job_id: string;
  attempt_number: number;
  status: string;
  worker_id: string | null;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  error_message: string | null;
  output?: string;
}

interface WorkerNode {
  id: string;
  name: string;
  status: string;
  hostname: string;
  pid: number;
  concurrency: number;
  active_jobs: number;
  cpu_usage: number;
  memory_usage: number;
  queue_name: string;
  last_heartbeat_at: string;
}

interface AuditLogEntry {
  id: string;
  user_email: string;
  action: string;
  target_type: string;
  target_id: string | null;
  details: string;
  created_at: string;
}

interface NotificationEntry {
  id: string;
  notification_type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

interface SystemSettings {
  time_zone: string;
  retry_policy_default: any;
  email_notifications: boolean;
  slack_notifications: boolean;
  slack_webhook_url: string;
  log_retention_days: number;
  worker_concurrency_default: number;
}

// --- Initial Mock Data for Simulation Mode ---
const MOCK_PROJECTS: Project[] = [
  { id: 'proj-1', name: 'Billing Platform', organization_id: 'ops-org', created_at: '2026-01-01T00:00:00Z' },
  { id: 'proj-2', name: 'Data Ingestion', organization_id: 'ops-org', created_at: '2026-02-01T00:00:00Z' }
];

const MOCK_QUEUES: Queue[] = [
  { id: 'q-default', project_id: 'proj-1', name: 'default', priority: 5, concurrency_limit: 4, is_paused: false },
  { id: 'q-critical', project_id: 'proj-1', name: 'critical', priority: 1, concurrency_limit: 8, is_paused: false },
  { id: 'q-background', project_id: 'proj-2', name: 'background', priority: 10, concurrency_limit: 2, is_paused: true }
];

const MOCK_JOBS: Job[] = [
  {
    id: 'job-1',
    queue_id: 'q-default',
    name: 'Process Stripe Invoices',
    job_type: 'recurring',
    status: 'scheduled',
    payload: { batch_size: 100 },
    handler: 'app.worker.tasks.billing.invoices',
    priority: 5,
    run_at: '2026-07-12T10:00:00.000Z',
    cron_expression: '0 * * * *',
    attempt_count: 0,
    max_retries: 3,
    timeout_seconds: 300,
    description: 'Hourly customer credit card checks and charge cycles.',
    command: 'stripe:billing --process-pending --dry-run=false',
    is_paused: false,
    tags: ['stripe', 'finance'],
    created_at: '2026-07-11T09:00:00.000Z',
    completed_at: null,
    started_at: null,
    owner: 'manager@example.com'
  },
  {
    id: 'job-2',
    queue_id: 'q-critical',
    name: 'Backup Primary DB Cluster',
    job_type: 'scheduled',
    status: 'completed',
    payload: { compression: 'gzip' },
    handler: 'app.worker.tasks.db_backup',
    priority: 1,
    run_at: '2026-07-12T02:00:00.000Z',
    cron_expression: '0 2 * * *',
    attempt_count: 1,
    max_retries: 3,
    timeout_seconds: 600,
    description: 'Daily WAL snapshot archived to secure AWS S3 bucket.',
    command: 'pg_dump -h db.prod.internal -U postgres | aws s3 cp - s3://backups',
    is_paused: false,
    tags: ['db', 'security'],
    created_at: '2026-07-11T20:00:00.000Z',
    completed_at: '2026-07-12T02:12:43.000Z',
    started_at: '2026-07-12T02:00:01.000Z',
    owner: 'admin@example.com'
  },
  {
    id: 'job-3',
    queue_id: 'q-default',
    name: 'Rebuild Search Indexes',
    job_type: 'immediate',
    status: 'failed',
    payload: { index_name: 'products' },
    handler: 'app.worker.tasks.search_rebuild',
    priority: 8,
    run_at: null,
    cron_expression: null,
    attempt_count: 3,
    max_retries: 3,
    timeout_seconds: 120,
    description: 'Rebuilds product catalog indexes for search cluster.',
    command: 'python -m search.reindexer --full --target=es-cluster-prod',
    is_paused: false,
    tags: ['elasticsearch', 'search'],
    created_at: '2026-07-12T08:00:00.000Z',
    completed_at: '2026-07-12T08:05:12.000Z',
    started_at: '2026-07-12T08:04:30.000Z',
    owner: 'manager@example.com'
  },
  {
    id: 'job-4',
    queue_id: 'q-critical',
    name: 'Sync CRM Core Records',
    job_type: 'immediate',
    status: 'running',
    payload: { source: 'salesforce' },
    handler: 'app.worker.tasks.crm_sync',
    priority: 3,
    run_at: null,
    cron_expression: null,
    attempt_count: 1,
    max_retries: 5,
    timeout_seconds: 180,
    description: 'Ingest leads and account details to postgres dashboard.',
    command: 'salesforce-client --sync --accounts --since-last-run',
    is_paused: false,
    tags: ['salesforce', 'crm'],
    created_at: '2026-07-12T09:20:00.000Z',
    completed_at: null,
    started_at: '2026-07-12T09:22:15.000Z',
    owner: 'manager@example.com'
  }
];

const MOCK_EXECUTIONS: JobExecution[] = [
  {
    id: 'exec-1',
    job_id: 'job-2',
    attempt_number: 1,
    status: 'succeeded',
    worker_id: 'worker-node-1',
    started_at: '2026-07-12T02:00:01.000Z',
    finished_at: '2026-07-12T02:12:43.000Z',
    duration_ms: 762000,
    error_message: null,
    output: '[INFO] Initializing PostgreSQL connection...\n[INFO] Running dump procedure...\n[INFO] Archiving snapshot to AWS S3 bucket...\n[SUCCESS] PostgreSQL Backup fully completed successfully (size: 45.2 GB).'
  },
  {
    id: 'exec-2',
    job_id: 'job-3',
    attempt_number: 1,
    status: 'failed',
    worker_id: 'worker-node-2',
    started_at: '2026-07-12T08:00:05.000Z',
    finished_at: '2026-07-12T08:01:20.000Z',
    duration_ms: 75000,
    error_message: 'Elasticsearch connection failed: Connection refused.',
    output: '[INFO] Initiating index rebuild for catalog...\n[ERROR] Elasticsearch connection failed: Connection refused.\n[WARNING] Attempt 1 failed. Requeuing...'
  },
  {
    id: 'exec-3',
    job_id: 'job-3',
    attempt_number: 2,
    status: 'failed',
    worker_id: 'worker-node-2',
    started_at: '2026-07-12T08:02:10.000Z',
    finished_at: '2026-07-12T08:03:15.000Z',
    duration_ms: 65000,
    error_message: 'Elasticsearch connection failed: Connection refused.',
    output: '[INFO] Retrying index rebuild...\n[ERROR] Elasticsearch connection failed: Connection refused.\n[WARNING] Attempt 2 failed. Requeuing...'
  },
  {
    id: 'exec-4',
    job_id: 'job-3',
    attempt_number: 3,
    status: 'failed',
    worker_id: 'worker-node-2',
    started_at: '2026-07-12T08:04:30.000Z',
    finished_at: '2026-07-12T08:05:12.000Z',
    duration_ms: 42000,
    error_message: 'Elasticsearch connection failed: Max retries exceeded.',
    output: '[INFO] Retrying index rebuild (Attempt 3)...\n[ERROR] Elasticsearch connection failed: Max retries exceeded.\n[CRITICAL] Job marked as failed. Dispatched alert to PagerDuty.'
  }
];

const MOCK_WORKERS: WorkerNode[] = [
  {
    id: 'worker-node-1',
    name: 'worker-billing-prod-01',
    status: 'online',
    hostname: 'billing-node-1.prod.internal',
    pid: 14032,
    concurrency: 4,
    active_jobs: 1,
    cpu_usage: 42.5,
    memory_usage: 1024,
    queue_name: 'default',
    last_heartbeat_at: '2026-07-12T09:23:45Z'
  },
  {
    id: 'worker-node-2',
    name: 'worker-analytics-prod-02',
    status: 'online',
    hostname: 'analytics-node-2.prod.internal',
    pid: 14051,
    concurrency: 8,
    active_jobs: 0,
    cpu_usage: 2.1,
    memory_usage: 512,
    queue_name: 'background',
    last_heartbeat_at: '2026-07-12T09:23:59Z'
  },
  {
    id: 'worker-node-3',
    name: 'worker-heavy-ingest-03',
    status: 'offline',
    hostname: 'heavy-node-3.prod.internal',
    pid: 19002,
    concurrency: 2,
    active_jobs: 0,
    cpu_usage: 0.0,
    memory_usage: 0,
    queue_name: 'background',
    last_heartbeat_at: '2026-07-12T09:10:00Z'
  }
];

const MOCK_AUDIT_LOGS: AuditLogEntry[] = [
  { id: 'audit-1', user_email: 'admin@example.com', action: 'create', target_type: 'job', target_id: 'job-1', details: "Created recurring job 'Process Stripe Invoices'", created_at: '2026-07-11T09:00:00Z' },
  { id: 'audit-2', user_email: 'manager@example.com', action: 'edit', target_type: 'job', target_id: 'job-2', details: "Updated retry count to 3 on 'Backup Primary DB Cluster'", created_at: '2026-07-11T20:15:00Z' },
  { id: 'audit-3', user_email: 'manager@example.com', action: 'pause', target_type: 'queue', target_id: 'q-background', details: "Paused background jobs queue 'background'", created_at: '2026-07-12T01:00:00Z' },
  { id: 'audit-4', user_email: 'admin@example.com', action: 'run_now', target_type: 'job', target_id: 'job-4', details: "Forced immediate execution ('Run Now') for CRM sync", created_at: '2026-07-12T09:20:00Z' }
];

const MOCK_NOTIFICATIONS: NotificationEntry[] = [
  { id: 'notif-1', notification_type: 'error', title: 'Job Execution Failed', message: "Job 'Rebuild Search Indexes' failed: Elasticsearch connection refused.", is_read: false, created_at: '2026-07-12T08:05:12Z' },
  { id: 'notif-2', notification_type: 'success', title: 'Database Backup Completed', message: "Job 'Backup Primary DB Cluster' archived WAL snapshots.", is_read: true, created_at: '2026-07-12T02:12:43Z' },
  { id: 'notif-3', notification_type: 'warning', title: 'Worker Offline Alert', message: "Worker node 'worker-heavy-ingest-03' missed its heartbeat.", is_read: false, created_at: '2026-07-12T09:15:00Z' }
];

const MOCK_USERS = [
  { id: 'u-1', email: 'admin@example.com', full_name: 'System Admin', is_active: true, is_superuser: true, role: 'admin', created_at: '2026-01-01T00:00:00Z' },
  { id: 'u-2', email: 'manager@example.com', full_name: 'Job Manager', is_active: true, is_superuser: false, role: 'operator', created_at: '2026-01-15T00:00:00Z' },
  { id: 'u-3', email: 'viewer@example.com', full_name: 'Guest Auditor', is_active: true, is_superuser: false, role: 'viewer', created_at: '2026-02-10T00:00:00Z' }
];

export default function App() {
  // Authentication & System State
  const [token, setToken] = useState<string | null>(localStorage.getItem('access_token'));
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authFullName, setAuthFullName] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // Connection State
  const [backendHealth, setBackendHealth] = useState<any>(null);
  const [forceSimulatedMode, setForceSimulatedMode] = useState<boolean>(false);

  // Tab navigation
  const [activeTab, setActiveTab] = useState<string>('dashboard');

  // --- Real / Simulated DB States ---
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [queues, setQueues] = useState<Queue[]>([]);
  const [selectedQueueId, setSelectedQueueId] = useState<string>('');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [executions, setExecutions] = useState<JobExecution[]>([]);
  const [workers, setWorkers] = useState<WorkerNode[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [notifications, setNotifications] = useState<NotificationEntry[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [settings, setSettings] = useState<SystemSettings>({
    time_zone: 'UTC',
    retry_policy_default: { max_retries: 3, strategy: 'fixed' },
    email_notifications: true,
    slack_notifications: false,
    slack_webhook_url: '',
    log_retention_days: 30,
    worker_concurrency_default: 4
  });

  // UI interaction states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [selectedExecution, setSelectedExecution] = useState<JobExecution | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  // --- Job Creation Form Inputs ---
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCommand, setFormCommand] = useState('');
  const [formHandler, setFormHandler] = useState('app.worker.tasks.process_uploads');
  const [formType, setFormType] = useState('immediate');
  const [formSchedulePreset, setFormSchedulePreset] = useState('minute');
  const [formCron, setFormCron] = useState('* * * * *');
  const [formDelaySeconds, setFormDelaySeconds] = useState(0);
  const [formRetries, setFormRetries] = useState(3);
  const [formTimeout, setFormTimeout] = useState(300);
  const [formPriority, setFormPriority] = useState(5);
  const [formTagsString, setFormTagsString] = useState('');
  const [formEmailNotify, setFormEmailNotify] = useState(true);
  const [formSlackNotify, setFormSlackNotify] = useState(false);

  // Console Buffer Logs
  const [consoleLogs, setConsoleLogs] = useState<string[]>([
    'Initializing Job Flow Client...',
  ]);

  const addConsoleLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setConsoleLogs(prev => [`[${timestamp}] ${message}`, ...prev.slice(0, 49)]);
  };

  const isConnected = backendHealth?.status === 'healthy' && !forceSimulatedMode;

  // --- Initializer & Syncing ---
  useEffect(() => {
    checkBackend();
    const interval = setInterval(checkBackend, 5000);
    return () => clearInterval(interval);
  }, [forceSimulatedMode]);

  const checkBackend = async () => {
    if (forceSimulatedMode) {
      setBackendHealth(null);
      return;
    }
    try {
      const healthRes = await fetch('http://localhost:8000/health');
      if (healthRes.ok) {
        const healthData = await healthRes.json();
        setBackendHealth(healthData);
      } else {
        setBackendHealth(null);
      }
    } catch {
      setBackendHealth(null);
    }
  };

  // Load backend token profile
  useEffect(() => {
    if (token) {
      fetchProfile(token);
    } else if (!isConnected) {
      // Seed default user in simulated mode only if API is offline
      setUserProfile({
        id: 'u-1',
        email: 'admin@example.com',
        full_name: 'System Admin (Simulated)',
        is_active: true,
        is_superuser: true,
        role: 'admin'
      });
    } else {
      // Clear profile so login screen is rendered when API is online
      setUserProfile(null);
    }
  }, [token, isConnected]);

  const fetchProfile = async (authToken: string) => {
    if (!isConnected) return;
    try {
      const res = await fetch('http://localhost:8000/api/v1/auth/me', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (res.ok) {
        const profileData = await res.json();
        setUserProfile({
          id: profileData.id,
          email: profileData.email,
          full_name: profileData.full_name,
          is_active: profileData.is_active,
          is_superuser: profileData.is_superuser,
          role: profileData.is_superuser ? 'admin' : 'operator'
        });
        addConsoleLog(`Authenticated via API as ${profileData.full_name}`);
      } else {
        handleLogout();
      }
    } catch {
      handleLogout();
    }
  };

  // Seed DB tables / state depending on mode
  useEffect(() => {
    if (!isConnected) {
      // Simulated Data Setup
      if (projects.length === 0) setProjects(MOCK_PROJECTS);
      if (!selectedProjectId && MOCK_PROJECTS.length > 0) setSelectedProjectId(MOCK_PROJECTS[0].id);
      if (queues.length === 0) setQueues(MOCK_QUEUES);
      if (!selectedQueueId && MOCK_QUEUES.length > 0) setSelectedQueueId(MOCK_QUEUES[0].id);
      if (jobs.length === 0) setJobs(MOCK_JOBS);
      if (executions.length === 0) setExecutions(MOCK_EXECUTIONS);
      if (workers.length === 0) setWorkers(MOCK_WORKERS);
      if (auditLogs.length === 0) setAuditLogs(MOCK_AUDIT_LOGS);
      if (notifications.length === 0) setNotifications(MOCK_NOTIFICATIONS);
      if (users.length === 0) setUsers(MOCK_USERS);
    } else {
      // Fetch Live API Database
      fetchBackendData();
    }
  }, [isConnected, selectedProjectId, selectedQueueId]);

  const fetchBackendData = async () => {
    const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
    try {
      const pRes = await fetch('http://localhost:8000/api/v1/projects/', { headers });
      if (pRes.ok) {
        const pData = await pRes.json();
        setProjects(pData);
        if (pData.length > 0 && !selectedProjectId) setSelectedProjectId(pData[0].id);
      }

      if (selectedProjectId) {
        const qRes = await fetch(`http://localhost:8000/api/v1/queues/projects/${selectedProjectId}/queues`, { headers });
        if (qRes.ok) {
          const qData = await qRes.json();
          setQueues(qData);
          if (qData.length > 0 && !selectedQueueId) setSelectedQueueId(qData[0].id);
        }
      }

      if (selectedQueueId) {
        const jRes = await fetch(`http://localhost:8000/api/v1/queues/${selectedQueueId}/jobs`, { headers });
        if (jRes.ok) {
          const jData = await jRes.json();
          setJobs(jData);
        }
      }

      const wRes = await fetch('http://localhost:8000/api/v1/workers/workers', { headers });
      if (wRes.ok) setWorkers(await wRes.json());

      const aRes = await fetch('http://localhost:8000/api/v1/audit', { headers });
      if (aRes.ok) setAuditLogs(await aRes.json());

      const nRes = await fetch('http://localhost:8000/api/v1/notifications', { headers });
      if (nRes.ok) setNotifications(await nRes.json());

      const sRes = await fetch('http://localhost:8000/api/v1/settings', { headers });
      if (sRes.ok) setSettings(await sRes.json());

      if (userProfile?.is_superuser) {
        const uRes = await fetch('http://localhost:8000/api/v1/users', { headers });
        if (uRes.ok) setUsers(await uRes.json());
      }
    } catch (err) {
      console.error("API Fetch Fail", err);
    }
  };

  // --- Auth Functions ---
  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    setToken(null);
    setUserProfile(null);
    setProjects([]);
    setQueues([]);
    setJobs([]);
    addConsoleLog('Session signed out.');
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccess(null);
    setAuthLoading(true);

    if (authMode === 'signup') {
      try {
        const res = await fetch('http://localhost:8000/api/v1/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: authEmail,
            password: authPassword,
            full_name: authFullName,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Signup failed');

        localStorage.setItem('access_token', data.access_token);
        localStorage.setItem('refresh_token', data.refresh_token);
        setAuthSuccess('Account registered successfully! Welcome.');
        setTimeout(() => {
          setToken(data.access_token);
          setAuthLoading(false);
        }, 1500);
      } catch (err: any) {
        setAuthError(err.message);
        setAuthLoading(false);
      }
    } else {
      try {
        const formData = new URLSearchParams();
        formData.append('username', authEmail);
        formData.append('password', authPassword);

        const res = await fetch('http://localhost:8000/api/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: formData.toString(),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Invalid email or password');

        localStorage.setItem('access_token', data.access_token);
        localStorage.setItem('refresh_token', data.refresh_token);
        setAuthSuccess('Welcome! Opening portal...');
        setTimeout(() => {
          setToken(data.access_token);
          setAuthLoading(false);
        }, 1000);
      } catch (err: any) {
        setAuthError(err.message);
        setAuthLoading(false);
      }
    }
  };

  // --- Scheduler Actions (Add, Edit, Delete, Run, Duplicate, Pause/Resume) ---
  const triggerCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedQueueId) return;

    let finalCron = null;
    if (formType === 'recurring') {
      if (formSchedulePreset === 'minute') finalCron = '* * * * *';
      else if (formSchedulePreset === 'hourly') finalCron = '0 * * * *';
      else if (formSchedulePreset === 'daily') finalCron = '0 0 * * *';
      else if (formSchedulePreset === 'weekly') finalCron = '0 0 * * 0';
      else if (formSchedulePreset === 'monthly') finalCron = '0 0 1 * *';
      else finalCron = formCron;
    }

    let calculatedRunAt = null;
    if (formType === 'delayed' && formDelaySeconds > 0) {
      calculatedRunAt = new Date(Date.now() + formDelaySeconds * 1000).toISOString();
    }

    const payloadObj = { command: formCommand, parameters: {} };
    const tagsArr = formTagsString.split(',').map(t => t.trim()).filter(Boolean);

    if (!isConnected) {
      // Simulation Creation
      const newJobItem: Job = {
        id: `job-${Date.now()}`,
        queue_id: selectedQueueId,
        name: formName,
        job_type: formType,
        status: formType === 'recurring' ? 'scheduled' : 'queued',
        payload: payloadObj,
        handler: formHandler,
        priority: Number(formPriority),
        run_at: calculatedRunAt,
        cron_expression: finalCron,
        attempt_count: 0,
        max_retries: Number(formRetries),
        timeout_seconds: Number(formTimeout),
        description: formDescription,
        command: formCommand,
        is_paused: false,
        tags: tagsArr,
        created_at: new Date().toISOString(),
        completed_at: null,
        started_at: null,
        owner: userProfile?.email || 'simulated@example.com'
      };

      setJobs(prev => [newJobItem, ...prev]);

      // Add to Audit Log
      const auditEntry: AuditLogEntry = {
        id: `audit-${Date.now()}`,
        user_email: userProfile?.email || 'simulated@example.com',
        action: 'create',
        target_type: 'job',
        target_id: newJobItem.id,
        details: `Created job '${formName}' via Local Simulator`,
        created_at: new Date().toISOString()
      };
      setAuditLogs(prev => [auditEntry, ...prev]);

      // System Notification
      const notifEntry: NotificationEntry = {
        id: `notif-${Date.now()}`,
        notification_type: 'success',
        title: 'Job Created',
        message: `Job '${formName}' successfully scheduled in queue.`,
        is_read: false,
        created_at: new Date().toISOString()
      };
      setNotifications(prev => [notifEntry, ...prev]);

      addConsoleLog(`Simulated Job created: ${formName}`);
      resetForm();
      setActiveTab('jobs-all');
    } else {
      // API Backend Submission
      const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
      try {
        const res = await fetch(`http://localhost:8000/api/v1/jobs/queues/${selectedQueueId}/jobs`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            name: formName,
            job_type: formType,
            payload: payloadObj,
            handler: formHandler,
            priority: Number(formPriority),
            run_at: calculatedRunAt,
            cron_expression: finalCron,
            timeout_seconds: Number(formTimeout),
            max_retries: Number(formRetries),
            description: formDescription,
            command: formCommand,
            tags: tagsArr
          })
        });

        if (res.ok) {
          addConsoleLog(`API Job created successfully: ${formName}`);
          resetForm();
          fetchBackendData();
          setActiveTab('jobs-all');
        } else {
          const errData = await res.json();
          alert(errData.detail || "API Job Creation Failed");
        }
      } catch (err) {
        console.error(err);
      }
    }
  };

  const triggerEditJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedJob) return;

    const tagsArr = formTagsString.split(',').map(t => t.trim()).filter(Boolean);

    if (!isConnected) {
      // Simulation Edit
      setJobs(prev => prev.map(j => {
        if (j.id === selectedJob.id) {
          return {
            ...j,
            name: formName,
            description: formDescription,
            command: formCommand,
            handler: formHandler,
            job_type: formType,
            priority: Number(formPriority),
            max_retries: Number(formRetries),
            timeout_seconds: Number(formTimeout),
            tags: tagsArr
          };
        }
        return j;
      }));

      // Audit Log
      const auditEntry: AuditLogEntry = {
        id: `audit-${Date.now()}`,
        user_email: userProfile?.email || 'simulated@example.com',
        action: 'edit',
        target_type: 'job',
        target_id: selectedJob.id,
        details: `Edited parameters for job '${selectedJob.name}'`,
        created_at: new Date().toISOString()
      };
      setAuditLogs(prev => [auditEntry, ...prev]);

      addConsoleLog(`Edited job details: ${formName}`);
      setShowEditModal(false);
      setSelectedJob(null);
      resetForm();
    } else {
      // API Edit
      const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
      try {
        const res = await fetch(`http://localhost:8000/api/v1/jobs/jobs/${selectedJob.id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            name: formName,
            job_type: formType,
            payload: selectedJob.payload,
            handler: formHandler,
            priority: Number(formPriority),
            run_at: selectedJob.run_at,
            cron_expression: selectedJob.cron_expression,
            timeout_seconds: Number(formTimeout),
            max_retries: Number(formRetries),
            description: formDescription,
            command: formCommand,
            tags: tagsArr
          })
        });

        if (res.ok) {
          addConsoleLog(`Updated job configurations for '${formName}'`);
          setShowEditModal(false);
          setSelectedJob(null);
          resetForm();
          fetchBackendData();
        } else {
          alert("API failed to update job parameters");
        }
      } catch (err) {
        console.error(err);
      }
    }
  };

  const triggerDeleteJob = async (jobId: string) => {
    if (!confirm("Are you sure you want to delete this job configuration?")) return;

    if (!isConnected) {
      // Simulation Delete
      const targetJob = jobs.find(j => j.id === jobId);
      setJobs(prev => prev.filter(j => j.id !== jobId));

      const auditEntry: AuditLogEntry = {
        id: `audit-${Date.now()}`,
        user_email: userProfile?.email || 'simulated@example.com',
        action: 'delete',
        target_type: 'job',
        target_id: jobId,
        details: `Deleted job configuration '${targetJob?.name}'`,
        created_at: new Date().toISOString()
      };
      setAuditLogs(prev => [auditEntry, ...prev]);

      addConsoleLog(`Deleted job entry: ${targetJob?.name}`);
    } else {
      // API Delete
      const headers = { 'Authorization': `Bearer ${token}` };
      try {
        const res = await fetch(`http://localhost:8000/api/v1/jobs/jobs/${jobId}`, {
          method: 'DELETE',
          headers
        });
        if (res.ok) {
          addConsoleLog(`API deleted job ${jobId}`);
          fetchBackendData();
        }
      } catch (err) {
        console.error(err);
      }
    }
  };

  const triggerRunNow = async (jobId: string) => {
    if (!isConnected) {
      // Simulation Run Now
      setJobs(prev => prev.map(j => {
        if (j.id === jobId) {
          return { ...j, status: 'running', started_at: new Date().toISOString(), run_at: null };
        }
        return j;
      }));

      // Create Run Execution
      const newExec: JobExecution = {
        id: `exec-${Date.now()}`,
        job_id: jobId,
        attempt_number: 1,
        status: 'started',
        worker_id: 'worker-node-1',
        started_at: new Date().toISOString(),
        finished_at: null,
        duration_ms: null,
        error_message: null,
        output: '[INFO] Initializing manual run-now trigger...\n[INFO] Claimed by thread worker-node-1.\n[INFO] Running dotted script...'
      };
      setExecutions(prev => [newExec, ...prev]);

      const targetJob = jobs.find(j => j.id === jobId);
      const auditEntry: AuditLogEntry = {
        id: `audit-${Date.now()}`,
        user_email: userProfile?.email || 'simulated@example.com',
        action: 'run_now',
        target_type: 'job',
        target_id: jobId,
        details: `Forced immediate run now trigger for '${targetJob?.name}'`,
        created_at: new Date().toISOString()
      };
      setAuditLogs(prev => [auditEntry, ...prev]);

      addConsoleLog(`Triggered execution now: ${targetJob?.name}`);

      // Complete execution mock after 4 seconds
      setTimeout(() => {
        setJobs(prev => prev.map(j => {
          if (j.id === jobId) {
            return { ...j, status: 'completed', completed_at: new Date().toISOString() };
          }
          return j;
        }));
        setExecutions(prev => prev.map(x => {
          if (x.job_id === jobId && x.status === 'started') {
            return {
              ...x,
              status: 'succeeded',
              finished_at: new Date().toISOString(),
              duration_ms: 3800,
              output: x.output + '\n[SUCCESS] Custom script finished successfully.'
            };
          }
          return x;
        }));
        // Notification
        const notifEntry: NotificationEntry = {
          id: `notif-${Date.now()}`,
          notification_type: 'success',
          title: 'Job Completed',
          message: `Manually enqueued job '${targetJob?.name}' finished execution.`,
          is_read: false,
          created_at: new Date().toISOString()
        };
        setNotifications(n => [notifEntry, ...n]);
      }, 4000);

    } else {
      // API Run Now
      const headers = { 'Authorization': `Bearer ${token}` };
      try {
        const res = await fetch(`http://localhost:8000/api/v1/jobs/jobs/${jobId}/run`, {
          method: 'POST',
          headers
        });
        if (res.ok) {
          addConsoleLog(`Manually enqueued job execution.`);
          fetchBackendData();
        }
      } catch (err) {
        console.error(err);
      }
    }
  };

  const triggerDuplicateJob = async (jobId: string) => {
    if (!isConnected) {
      // Simulation Duplicate
      const sourceJob = jobs.find(j => j.id === jobId);
      if (!sourceJob) return;

      const duplicated: Job = {
        ...sourceJob,
        id: `job-${Date.now()}`,
        name: `${sourceJob.name} (Copy)`,
        created_at: new Date().toISOString(),
        completed_at: null,
        started_at: null,
        status: 'scheduled'
      };

      setJobs(prev => [duplicated, ...prev]);

      const auditEntry: AuditLogEntry = {
        id: `audit-${Date.now()}`,
        user_email: userProfile?.email || 'simulated@example.com',
        action: 'duplicate',
        target_type: 'job',
        target_id: duplicated.id,
        details: `Duplicated job template '${sourceJob.name}'`,
        created_at: new Date().toISOString()
      };
      setAuditLogs(prev => [auditEntry, ...prev]);
      addConsoleLog(`Duplicated job: ${sourceJob.name}`);
    } else {
      // API Duplicate
      const headers = { 'Authorization': `Bearer ${token}` };
      try {
        const res = await fetch(`http://localhost:8000/api/v1/jobs/jobs/${jobId}/duplicate`, {
          method: 'POST',
          headers
        });
        if (res.ok) {
          addConsoleLog(`Duplicated job template via API.`);
          fetchBackendData();
        }
      } catch (err) {
        console.error(err);
      }
    }
  };

  const togglePauseResume = async (jobId: string, currentPausedState: boolean) => {
    const action = currentPausedState ? 'resume' : 'pause';
    if (!isConnected) {
      // Simulation
      setJobs(prev => prev.map(j => {
        if (j.id === jobId) {
          return { ...j, is_paused: !currentPausedState, status: currentPausedState ? 'scheduled' : 'failed' };
        }
        return j;
      }));

      const target = jobs.find(j => j.id === jobId);
      const auditEntry: AuditLogEntry = {
        id: `audit-${Date.now()}`,
        user_email: userProfile?.email || 'simulated@example.com',
        action: action,
        target_type: 'job',
        target_id: jobId,
        details: `${currentPausedState ? 'Resumed' : 'Paused'} recurring job schedules for '${target?.name}'`,
        created_at: new Date().toISOString()
      };
      setAuditLogs(prev => [auditEntry, ...prev]);

      addConsoleLog(`${currentPausedState ? 'Resumed' : 'Paused'} recurring job: ${target?.name}`);
    } else {
      // API Pause/Resume
      const headers = { 'Authorization': `Bearer ${token}` };
      try {
        const res = await fetch(`http://localhost:8000/api/v1/jobs/jobs/${jobId}/${action}`, {
          method: 'POST',
          headers
        });
        if (res.ok) {
          addConsoleLog(`API ${action}d job.`);
          fetchBackendData();
        }
      } catch (err) {
        console.error(err);
      }
    }
  };

  const resetForm = () => {
    setFormName('');
    setFormDescription('');
    setFormCommand('');
    setFormHandler('app.worker.tasks.process_uploads');
    setFormType('immediate');
    setFormSchedulePreset('minute');
    setFormCron('* * * * *');
    setFormDelaySeconds(0);
    setFormRetries(3);
    setFormTimeout(300);
    setFormPriority(5);
    setFormTagsString('');
  };

  const populateFormForEdit = (job: Job) => {
    setFormName(job.name);
    setFormDescription(job.description || '');
    setFormCommand(job.command || '');
    setFormHandler(job.handler);
    setFormType(job.job_type);
    setFormCron(job.cron_expression || '* * * * *');
    setFormRetries(job.max_retries);
    setFormTimeout(job.timeout_seconds);
    setFormPriority(job.priority);
    setFormTagsString(job.tags ? job.tags.join(', ') : '');
  };

  // --- Filtering & Calculations ---
  const filteredJobs = useMemo(() => {
    return jobs.filter(j => {
      const matchSearch = j.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          j.handler.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          j.id.includes(searchQuery) ||
                          (j.tags && j.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase())));
      const matchStatus = statusFilter ? j.status === statusFilter : true;
      const matchType = typeFilter ? j.job_type === typeFilter : true;
      return matchSearch && matchStatus && matchType;
    });
  }, [jobs, searchQuery, statusFilter, typeFilter]);

  // Metric computations for Analytics and Overview Dashboard
  const metrics = useMemo(() => {
    const total = jobs.length;
    const running = jobs.filter(j => j.status === 'running').length;
    const scheduled = jobs.filter(j => j.job_type === 'recurring' && !j.is_paused).length;
    const failed = jobs.filter(j => j.status === 'failed').length;
    const completed = jobs.filter(j => j.status === 'completed').length;
    
    // Success rate
    const totalFinished = completed + failed;
    const successRate = totalFinished > 0 ? Math.round((completed / totalFinished) * 100) : 100;
    const failureRate = totalFinished > 0 ? 100 - successRate : 0;

    return {
      total,
      running,
      scheduled,
      failed,
      completedToday: completed,
      successRate,
      failureRate,
      avgDuration: 215, // in seconds
    };
  }, [jobs]);

  // Calendar mapping helpers
  const calendarDays = useMemo(() => {
    const days = [];
    const date = new Date();
    const currentMonth = date.getMonth();
    const currentYear = date.getFullYear();

    // Generate grid for standard 30 day visualization
    for (let i = -10; i < 20; i++) {
      const d = new Date(currentYear, currentMonth, date.getDate() + i);
      const isToday = i === 0;

      // Assign mock jobs for visual look
      let jobsOnDay: any[] = [];
      if (i === 0) {
        jobsOnDay = jobs.slice(0, 3); // today's jobs
      } else if (i > 0 && i % 3 === 0) {
        jobsOnDay = jobs.filter(j => j.job_type === 'recurring' || j.job_type === 'scheduled').slice(0, 2); // upcoming
      } else if (i < 0 && i % 4 === 0) {
        // missed jobs
        jobsOnDay = [{ name: 'Missed Billing Ingest', status: 'failed' }];
      }

      days.push({
        date: d,
        isToday,
        jobs: jobsOnDay
      });
    }
    return days;
  }, [jobs]);

  // Update Settings values
  const triggerSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isConnected) {
      // Simulation save
      addConsoleLog('System Settings successfully updated locally.');

      const auditEntry: AuditLogEntry = {
        id: `audit-${Date.now()}`,
        user_email: userProfile?.email || 'simulated@example.com',
        action: 'edit',
        target_type: 'settings',
        target_id: null,
        details: `Updated retention policy and timezone parameters to ${settings.time_zone}`,
        created_at: new Date().toISOString()
      };
      setAuditLogs(prev => [auditEntry, ...prev]);
    } else {
      // API put settings
      const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
      fetch('http://localhost:8000/api/v1/settings', {
        method: 'PUT',
        headers,
        body: JSON.stringify(settings)
      }).then(res => {
        if (res.ok) {
          addConsoleLog('Global configuration variables archived via API.');
          fetchBackendData();
        }
      });
    }
  };

  const markRead = (notifId: string) => {
    if (!isConnected) {
      setNotifications(prev => prev.map(n => n.id === notifId ? { ...n, is_read: true } : n));
    } else {
      const headers = { 'Authorization': `Bearer ${token}` };
      fetch(`http://localhost:8000/api/v1/notifications/${notifId}/read`, {
        method: 'PUT',
        headers
      }).then(() => fetchBackendData());
    }
  };

  const clearNotifications = () => {
    setNotifications([]);
  };

  // Change User role dropdown
  const handleUserRoleChange = (userId: string, newRole: string) => {
    if (!isConnected) {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole, is_superuser: newRole === 'admin' } : u));
      addConsoleLog(`Simulated User Role updated to ${newRole}`);
    } else {
      const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
      fetch(`http://localhost:8000/api/v1/users/${userId}/role?role=${newRole}`, {
        method: 'PUT',
        headers
      }).then(res => {
        if (res.ok) {
          addConsoleLog(`User Role updated.`);
          fetchBackendData();
        }
      });
    }
  };

  const activeNotificationsCount = notifications.filter(n => !n.is_read).length;

  // --- RENDERING LOGIN SCREEN IF NOT AUTHENTICATED ---
  if (isConnected && !userProfile) {
    return (
      <div style={{ display: 'flex', minHeight: '85vh', alignItems: 'center', justifyContent: 'center' }}>
        <div className="glass-panel" style={{ width: '100%', maxWidth: '440px', padding: '40px', borderRadius: '24px' }}>
          
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', marginBottom: '32px' }}>
            <div style={{ background: 'linear-gradient(135deg, var(--accent-purple), var(--accent-blue))', padding: '12px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Zap size={28} color="#fff" />
            </div>
            <h1 style={{ fontSize: '26px', fontWeight: '700', letterSpacing: '-0.5px', margin: 0, color: '#fff' }}>
              {authMode === 'login' ? 'Job Flow Portal' : 'Create Account'}
            </h1>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'center' }}>
              {authMode === 'login' ? 'Sign in to access your Job Scheduler dashboard' : 'Register to manage distributed job queues'}
            </p>
          </div>

          <form onSubmit={handleAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            {authError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '10px', color: 'var(--danger)', fontSize: '13px' }}>
                <AlertCircle size={16} />
                <span>{authError}</span>
              </div>
            )}

            {authSuccess && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '10px', color: 'var(--success)', fontSize: '13px' }}>
                <CheckCircle size={16} />
                <span>{authSuccess}</span>
              </div>
            )}

            {authMode === 'signup' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-secondary)' }}>Full Name</label>
                <div style={{ position: 'relative' }}>
                  <User size={16} style={{ position: 'absolute', left: '14px', top: '14px', color: 'var(--text-muted)' }} />
                  <input 
                    type="text" 
                    required
                    value={authFullName}
                    onChange={(e) => setAuthFullName(e.target.value)}
                    placeholder="John Doe"
                    style={{ width: '100%', padding: '12px 14px 12px 42px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', color: '#fff', fontSize: '14px', outline: 'none' }}
                  />
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-secondary)' }}>Email Address</label>
              <div style={{ position: 'relative' }}>
                <Mail size={16} style={{ position: 'absolute', left: '14px', top: '14px', color: 'var(--text-muted)' }} />
                <input 
                  type="email" 
                  required
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="name@example.com"
                  style={{ width: '100%', padding: '12px 14px 12px 42px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', color: '#fff', fontSize: '14px', outline: 'none' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
              <label style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-secondary)' }}>Password</label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} style={{ position: 'absolute', left: '14px', top: '14px', color: 'var(--text-muted)' }} />
                <input 
                  type="password" 
                  required
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder="••••••••"
                  style={{ width: '100%', padding: '12px 14px 12px 42px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', color: '#fff', fontSize: '14px', outline: 'none' }}
                />
              </div>
            </div>

            <button 
              type="submit" 
              disabled={authLoading}
              style={{
                width: '100%', padding: '12px', border: 'none', borderRadius: '10px', fontSize: '15px', fontWeight: '600', color: '#fff',
                background: 'linear-gradient(135deg, var(--accent-purple), var(--accent-blue))',
                opacity: authLoading ? 0.7 : 1
              }}
            >
              {authLoading ? 'Signing In...' : authMode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '13px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>
              {authMode === 'login' ? "Need a workspace account? " : "Already have an account? "}
            </span>
            <button 
              onClick={() => {
                setAuthMode(authMode === 'login' ? 'signup' : 'login');
                setAuthError(null);
                setAuthSuccess(null);
              }}
              style={{ background: 'none', border: 'none', color: 'var(--accent-purple)', fontWeight: '600' }}
            >
              {authMode === 'login' ? 'Create an Account' : 'Sign In'}
            </button>
          </div>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: '20px', paddingTop: '15px', textAlign: 'center' }}>
            <button 
              onClick={() => setForceSimulatedMode(true)}
              style={{ background: 'rgba(255,255,255,0.04)', color: '#fff', border: '1px solid rgba(255,255,255,0.08)', padding: '8px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: '600' }}
            >
              Start Local Simulation Mode (Offline)
            </button>
          </div>

        </div>
      </div>
    );
  }

  const isAdmin = userProfile?.is_superuser || userProfile?.role === 'admin';

  return (
    <div style={{ maxWidth: '1450px', margin: '0 auto', paddingBottom: '60px' }}>
      
      {/* HEADER BAR */}
      <header className="glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', padding: '16px 24px', background: 'var(--bg-navbar)', borderRadius: '16px', borderLeft: `4px solid ${isConnected ? 'var(--success)' : '#e0a800'}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ background: 'linear-gradient(135deg, var(--accent-purple), var(--accent-blue))', padding: '10px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Zap size={24} color="#fff" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ fontSize: '22px', fontWeight: '700', margin: 0, letterSpacing: '-0.5px', color: '#fff' }}>Job Flow</h1>
              <span style={{ 
                fontSize: '10px', padding: '2px 8px', borderRadius: '20px', fontWeight: '600',
                background: isAdmin ? 'rgba(239, 68, 68, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                color: isAdmin ? '#fca5a5' : '#93c5fd',
                border: `1px solid ${isAdmin ? 'rgba(239, 68, 68, 0.2)' : 'rgba(59, 130, 246, 0.2)'}`
              }}>
                {isAdmin ? 'ADMIN CONTROL PANEL' : 'OPERATIONS PORTAL'}
              </span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Distributed background job queue orchestrator</p>
          </div>
        </div>

        {/* User Badging & Status Indicators */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          
          {/* Force simulation toggle */}
          <button 
            onClick={() => setForceSimulatedMode(!forceSimulatedMode)}
            style={{
              padding: '6px 12px',
              background: forceSimulatedMode ? 'rgba(245,158,11,0.1)' : 'rgba(16,185,129,0.1)',
              border: `1px solid ${forceSimulatedMode ? 'rgba(245,158,11,0.2)' : 'rgba(16,185,129,0.2)'}`,
              borderRadius: '20px',
              fontSize: '11px',
              fontWeight: '600',
              color: forceSimulatedMode ? 'var(--warning)' : 'var(--success)'
            }}
          >
            {forceSimulatedMode ? 'Mode: Simulated DB' : 'Mode: Live API'}
          </button>

          {/* Notifications Trigger */}
          <div style={{ position: 'relative' }}>
            <button 
              onClick={() => setNotificationsOpen(!notificationsOpen)}
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}
            >
              <Bell size={18} />
              {activeNotificationsCount > 0 && (
                <span style={{ position: 'absolute', top: '-4px', right: '-4px', background: 'var(--danger)', color: '#fff', fontSize: '10px', fontWeight: 'bold', padding: '1px 5px', borderRadius: '10px' }}>
                  {activeNotificationsCount}
                </span>
              )}
            </button>

            {notificationsOpen && (
              <div className="glass-panel" style={{ position: 'absolute', top: '44px', right: '0px', width: '320px', maxHeight: '400px', overflowY: 'auto', zIndex: 100, padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px', background: '#1c242c' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '8px' }}>
                  <span style={{ fontWeight: '600', fontSize: '13px' }}>In-App Notifications</span>
                  <button onClick={clearNotifications} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '11px' }}>Clear All</button>
                </div>
                {notifications.length === 0 ? (
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '10px 0' }}>No notifications</span>
                ) : (
                  notifications.map(n => (
                    <div 
                      key={n.id} 
                      onClick={() => markRead(n.id)}
                      style={{ 
                        padding: '10px', 
                        borderRadius: '8px', 
                        fontSize: '12px',
                        background: n.is_read ? 'rgba(255,255,255,0.01)' : 'rgba(255,255,255,0.03)',
                        borderLeft: `3px solid ${n.notification_type === 'error' ? 'var(--danger)' : n.notification_type === 'success' ? 'var(--success)' : 'var(--warning)'}`,
                        cursor: 'pointer'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '600', marginBottom: '2px', color: '#fff' }}>
                        <span>{n.title}</span>
                        {!n.is_read && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent-purple)' }} />}
                      </div>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '11px', lineHeight: '1.4' }}>{n.message}</p>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px 6px 6px', borderRadius: '20px' }}>
            <div style={{ 
              width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '600', fontSize: '13px', color: '#fff',
              backgroundColor: isAdmin ? 'var(--danger)' : 'var(--accent-purple)'
            }}>
              {userProfile?.full_name ? userProfile.full_name.charAt(0).toUpperCase() : 'U'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '12px', fontWeight: '600', color: '#fff', lineHeight: '1.2' }}>{userProfile?.full_name || 'Anonymous'}</span>
              <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{isAdmin ? 'System Admin' : 'Job Operations'}</span>
            </div>
            {token && (
              <button 
                onClick={handleLogout} 
                title="Logout" 
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', display: 'flex', padding: '4px', marginLeft: '8px' }}
              >
                <LogOut size={14} />
              </button>
            )}
          </div>

          <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 16px', borderRadius: '30px' }}>
            <div style={{ 
              width: '10px', 
              height: '10px', 
              borderRadius: '50%', 
              backgroundColor: isConnected ? 'var(--success)' : 'var(--warning)',
              boxShadow: `0 0 10px ${isConnected ? 'var(--success)' : 'var(--warning)'}`
            }} />
            <span style={{ fontSize: '13px', fontWeight: '500', color: '#fff' }}>
              API: {isConnected ? 'Connected' : 'Offline (Simulating)'}
            </span>
          </div>

        </div>
      </header>

      {/* CORE SIDEBAR & MAIN BODY PANEL */}
      <div style={{ display: 'grid', gridTemplateColumns: '250px 1fr', gap: '32px', alignItems: 'start' }}>
        
        {/* Navigation Sidebar */}
        <aside style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {projects.length > 0 && (
            <div className="glass-panel" style={{ padding: '16px', background: 'var(--bg-sidebar)' }}>
              <label style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>
                WORKSPACE PROJECT
              </label>
              <select 
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: '#fff', outline: 'none', fontSize: '13px' }}
              >
                {projects.map(p => (
                  <option key={p.id} value={p.id} style={{ background: '#11121b' }}>{p.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Navigation Links matching Sidebar structure */}
          <nav className="glass-panel" style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '4px', background: 'var(--bg-sidebar)' }}>
            
            <button 
              onClick={() => setActiveTab('dashboard')}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '10px 14px', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '500', textAlign: 'left',
                background: activeTab === 'dashboard' ? 'var(--accent-purple-glow)' : 'transparent',
                color: activeTab === 'dashboard' ? '#fff' : 'var(--text-secondary)',
                borderLeft: activeTab === 'dashboard' ? '3px solid var(--accent-purple)' : '3px solid transparent'
              }}
            >
              <Zap size={18} />
              🏠 Dashboard
            </button>

            {/* JOBS NESTED ITEMS */}
            <div style={{ margin: '4px 0 8px 10px', display: 'flex', flexDirection: 'column', gap: '4px', borderLeft: '1px solid rgba(255,255,255,0.06)' }}>
              <span style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', paddingLeft: '12px', marginBottom: '4px' }}>📅 JOBS</span>
              <button 
                onClick={() => setActiveTab('jobs-all')}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', margin: '0 0 0 10px', border: 'none', borderRadius: '6px', fontSize: '13px', textAlign: 'left', background: 'transparent',
                  color: activeTab === 'jobs-all' ? '#fff' : 'var(--text-secondary)',
                  fontWeight: activeTab === 'jobs-all' ? '600' : '400'
                }}
              >
                • All Jobs
              </button>
              <button 
                onClick={() => { resetForm(); setActiveTab('jobs-create'); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', margin: '0 0 0 10px', border: 'none', borderRadius: '6px', fontSize: '13px', textAlign: 'left', background: 'transparent',
                  color: activeTab === 'jobs-create' ? '#fff' : 'var(--text-secondary)',
                  fontWeight: activeTab === 'jobs-create' ? '600' : '400'
                }}
              >
                • Create Job
              </button>
              <button 
                onClick={() => setActiveTab('jobs-calendar')}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', margin: '0 0 0 10px', border: 'none', borderRadius: '6px', fontSize: '13px', textAlign: 'left', background: 'transparent',
                  color: activeTab === 'jobs-calendar' ? '#fff' : 'var(--text-secondary)',
                  fontWeight: activeTab === 'jobs-calendar' ? '600' : '400'
                }}
              >
                • Calendar
              </button>
            </div>

            {/* MONITORING NESTED ITEMS */}
            <div style={{ margin: '4px 0 8px 10px', display: 'flex', flexDirection: 'column', gap: '4px', borderLeft: '1px solid rgba(255,255,255,0.06)' }}>
              <span style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', paddingLeft: '12px', marginBottom: '4px' }}>📊 MONITORING</span>
              <button 
                onClick={() => setActiveTab('monitor-live')}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', margin: '0 0 0 10px', border: 'none', borderRadius: '6px', fontSize: '13px', textAlign: 'left', background: 'transparent',
                  color: activeTab === 'monitor-live' ? '#fff' : 'var(--text-secondary)',
                  fontWeight: activeTab === 'monitor-live' ? '600' : '400'
                }}
              >
                • Live Jobs
              </button>
              <button 
                onClick={() => setActiveTab('monitor-workers')}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', margin: '0 0 0 10px', border: 'none', borderRadius: '6px', fontSize: '13px', textAlign: 'left', background: 'transparent',
                  color: activeTab === 'monitor-workers' ? '#fff' : 'var(--text-secondary)',
                  fontWeight: activeTab === 'monitor-workers' ? '600' : '400'
                }}
              >
                • Workers
              </button>
              <button 
                onClick={() => setActiveTab('monitor-queues')}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', margin: '0 0 0 10px', border: 'none', borderRadius: '6px', fontSize: '13px', textAlign: 'left', background: 'transparent',
                  color: activeTab === 'monitor-queues' ? '#fff' : 'var(--text-secondary)',
                  fontWeight: activeTab === 'monitor-queues' ? '600' : '400'
                }}
              >
                • Queues
              </button>
            </div>

            <button 
              onClick={() => setActiveTab('logs')}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '10px 14px', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '500', textAlign: 'left',
                background: activeTab === 'logs' ? 'var(--accent-purple-glow)' : 'transparent',
                color: activeTab === 'logs' ? '#fff' : 'var(--text-secondary)',
                borderLeft: activeTab === 'logs' ? '3px solid var(--accent-purple)' : '3px solid transparent'
              }}
            >
              <Terminal size={18} />
              📜 Execution Logs
            </button>

            <button 
              onClick={() => setActiveTab('analytics')}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '10px 14px', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '500', textAlign: 'left',
                background: activeTab === 'analytics' ? 'var(--accent-purple-glow)' : 'transparent',
                color: activeTab === 'analytics' ? '#fff' : 'var(--text-secondary)',
                borderLeft: activeTab === 'analytics' ? '3px solid var(--accent-purple)' : '3px solid transparent'
              }}
            >
              <Activity size={18} />
              📈 Analytics
            </button>

            <button 
              onClick={() => setActiveTab('notifications')}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '10px 14px', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '500', textAlign: 'left',
                background: activeTab === 'notifications' ? 'var(--accent-purple-glow)' : 'transparent',
                color: activeTab === 'notifications' ? '#fff' : 'var(--text-secondary)',
                borderLeft: activeTab === 'notifications' ? '3px solid var(--accent-purple)' : '3px solid transparent'
              }}
            >
              <Bell size={18} />
              🔔 Notifications ({activeNotificationsCount})
            </button>

            {isAdmin && (
              <button 
                onClick={() => setActiveTab('users')}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '10px 14px', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '500', textAlign: 'left',
                  background: activeTab === 'users' ? 'var(--accent-purple-glow)' : 'transparent',
                  color: activeTab === 'users' ? '#fff' : 'var(--text-secondary)',
                  borderLeft: activeTab === 'users' ? '3px solid var(--accent-purple)' : '3px solid transparent'
                }}
              >
                <Users size={18} />
                👥 Users (Admin)
              </button>
            )}

            <button 
              onClick={() => setActiveTab('settings')}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '10px 14px', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '500', textAlign: 'left',
                background: activeTab === 'settings' ? 'var(--accent-purple-glow)' : 'transparent',
                color: activeTab === 'settings' ? '#fff' : 'var(--text-secondary)',
                borderLeft: activeTab === 'settings' ? '3px solid var(--accent-purple)' : '3px solid transparent'
              }}
            >
              <SettingsIcon size={18} />
              ⚙ Settings
            </button>

            <button 
              onClick={() => setActiveTab('audit')}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '10px 14px', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '500', textAlign: 'left',
                background: activeTab === 'audit' ? 'var(--accent-purple-glow)' : 'transparent',
                color: activeTab === 'audit' ? '#fff' : 'var(--text-secondary)',
                borderLeft: activeTab === 'audit' ? '3px solid var(--accent-purple)' : '3px solid transparent'
              }}
            >
              <History size={18} />
              📜 Audit History
            </button>

          </nav>
          
          <div className="glass-panel" style={{ padding: '16px', fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '6px', background: 'var(--bg-sidebar)' }}>
            <span style={{ fontWeight: '600', color: '#fff' }}>Console Output</span>
            <div style={{ background: '#090d10', padding: '10px', borderRadius: '8px', height: '100px', overflowY: 'auto', fontFamily: 'var(--font-mono)', color: '#10b981', fontSize: '10px', lineHeight: '1.4' }}>
              {consoleLogs.map((log, index) => (
                <div key={index} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{log}</div>
              ))}
            </div>
          </div>
        </aside>

        {/* MAIN PANEL CONTENT */}
        <main>
          
          {/* 1. DASHBOARD OVERVIEW */}
          {activeTab === 'dashboard' && (
            <div>
              {/* Cards row */}
              <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '20px', marginBottom: '32px' }}>
                <div className="glass-panel" style={{ padding: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', marginBottom: '8px', fontSize: '13px' }}>
                    <span>Total Jobs</span>
                    <Briefcase size={16} />
                  </div>
                  <div style={{ fontSize: '28px', fontWeight: '600', color: '#fff' }}>{metrics.total}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>Registered jobs</div>
                </div>

                <div className="glass-panel" style={{ padding: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', marginBottom: '8px', fontSize: '13px' }}>
                    <span>Running Jobs</span>
                    <Activity size={16} color="var(--accent-purple)" />
                  </div>
                  <div style={{ fontSize: '28px', fontWeight: '600', color: 'var(--accent-purple)' }}>{metrics.running}</div>
                  <div style={{ fontSize: '11px', color: 'var(--accent-purple)', marginTop: '4px' }}>Active claims</div>
                </div>

                <div className="glass-panel" style={{ padding: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', marginBottom: '8px', fontSize: '13px' }}>
                    <span>Scheduled Jobs</span>
                    <Clock size={16} color="var(--accent-blue)" />
                  </div>
                  <div style={{ fontSize: '28px', fontWeight: '600', color: 'var(--accent-blue)' }}>{metrics.scheduled}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>Recurring cron triggers</div>
                </div>

                <div className="glass-panel" style={{ padding: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', marginBottom: '8px', fontSize: '13px' }}>
                    <span>Failed Jobs</span>
                    <AlertTriangle size={16} color="var(--danger)" />
                  </div>
                  <div style={{ fontSize: '28px', fontWeight: '600', color: 'var(--danger)' }}>{metrics.failed}</div>
                  <div style={{ fontSize: '11px', color: 'var(--danger)', marginTop: '4px' }}>Needs intervention</div>
                </div>

                <div className="glass-panel" style={{ padding: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', marginBottom: '8px', fontSize: '13px' }}>
                    <span>Completed Today</span>
                    <CheckCircle size={16} color="var(--success)" />
                  </div>
                  <div style={{ fontSize: '28px', fontWeight: '600', color: 'var(--success)' }}>{metrics.completedToday}</div>
                  <div style={{ fontSize: '11px', color: 'var(--success)', marginTop: '4px' }}>Processed successfully</div>
                </div>
              </section>

              {/* SVG Charts section */}
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#fff', marginBottom: '20px' }}>Telemetry & Charts</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '32px' }}>
                
                {/* Chart 1: Jobs executed today (Bar chart) */}
                <div className="glass-panel" style={{ padding: '24px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#fff', marginBottom: '16px' }}>Jobs Executed Today</h3>
                  <div style={{ width: '100%', height: '180px' }}>
                    <svg viewBox="0 0 400 180" style={{ width: '100%', height: '100%' }}>
                      <g fill="rgba(255,255,255,0.03)">
                        <rect x="0" y="0" width="400" height="150" rx="4" />
                        <line x1="0" y1="150" x2="400" y2="150" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
                        <line x1="0" y1="100" x2="400" y2="100" stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="4 4" />
                        <line x1="0" y1="50" x2="400" y2="50" stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="4 4" />
                      </g>
                      {/* Bars */}
                      <rect x="40" y="60" width="30" height="90" fill="var(--accent-purple)" rx="3" />
                      <text x="55" y="170" fill="var(--text-secondary)" fontSize="11" textAnchor="middle">02:00</text>
                      
                      <rect x="120" y="110" width="30" height="40" fill="var(--accent-purple)" rx="3" />
                      <text x="135" y="170" fill="var(--text-secondary)" fontSize="11" textAnchor="middle">08:00</text>

                      <rect x="200" y="30" width="30" height="120" fill="var(--accent-purple)" rx="3" />
                      <text x="215" y="170" fill="var(--text-secondary)" fontSize="11" textAnchor="middle">10:00</text>

                      <rect x="280" y="90" width="30" height="60" fill="var(--accent-purple)" rx="3" />
                      <text x="295" y="170" fill="var(--text-secondary)" fontSize="11" textAnchor="middle">12:00</text>

                      <text x="380" y="45" fill="var(--text-muted)" fontSize="10">Runs</text>
                    </svg>
                  </div>
                </div>

                {/* Chart 2: Success vs Failed (Donut chart) */}
                <div className="glass-panel" style={{ padding: '24px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#fff', marginBottom: '16px' }}>Success vs Failed Ratio</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '20px', height: '180px' }}>
                    <svg viewBox="0 0 160 160" style={{ width: '130px', height: '130px' }}>
                      <circle cx="80" cy="80" r="60" fill="transparent" stroke="var(--danger)" strokeWidth="18" />
                      <circle cx="80" cy="80" r="60" fill="transparent" stroke="var(--success)" strokeWidth="18" 
                              strokeDasharray={`${2 * Math.PI * 60}`}
                              strokeDashoffset={`${(2 * Math.PI * 60) * (metrics.failureRate / 100)}`}
                              transform="rotate(-90 80 80)" />
                      <text x="80" y="86" textAnchor="middle" fill="#fff" fontSize="18" fontWeight="bold">{metrics.successRate}%</text>
                    </svg>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                        <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: 'var(--success)' }} />
                        <span>Completed: {metrics.successRate}%</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                        <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: 'var(--danger)' }} />
                        <span>Failed: {metrics.failureRate}%</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Chart 3: Jobs per hour/day (Bar chart) */}
                <div className="glass-panel" style={{ padding: '24px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#fff', marginBottom: '16px' }}>Jobs Throughput per Hour</h3>
                  <svg viewBox="0 0 400 180" style={{ width: '100%', height: '100%' }}>
                    <line x1="20" y1="150" x2="380" y2="150" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
                    {/* Hourly mock graphs */}
                    {[12, 18, 25, 45, 30, 15, 60, 52, 40, 20].map((val, idx) => (
                      <g key={idx}>
                        <rect x={35 + idx * 32} y={150 - val * 2} width="16" height={val * 2} fill="var(--accent-blue)" rx="2" />
                        <text x={43 + idx * 32} y="166" fontSize="8" fill="var(--text-muted)" textAnchor="middle">H{idx+1}</text>
                      </g>
                    ))}
                  </svg>
                </div>

                {/* Chart 4: Execution trend (Line chart) */}
                <div className="glass-panel" style={{ padding: '24px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#fff', marginBottom: '16px' }}>Execution Success Trend</h3>
                  <svg viewBox="0 0 400 180" style={{ width: '100%', height: '100%' }}>
                    <path d="M 20 120 Q 80 80 140 140 T 260 40 T 380 90" fill="none" stroke="var(--accent-purple)" strokeWidth="3" />
                    <path d="M 20 120 Q 80 80 140 140 T 260 40 T 380 90 L 380 150 L 20 150 Z" fill="url(#grad)" opacity="0.15" />
                    <line x1="20" y1="150" x2="380" y2="150" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
                    <defs>
                      <linearGradient id="grad" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="var(--accent-purple)" />
                        <stop offset="100%" stopColor="transparent" />
                      </linearGradient>
                    </defs>
                  </svg>
                </div>

              </div>
            </div>
          )}

          {/* 2. JOB MANAGEMENT LIST */}
          {activeTab === 'jobs-all' && (
            <div className="glass-panel" style={{ padding: '28px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#fff' }}>Scheduled & Background Jobs</h2>
                <button 
                  onClick={() => { resetForm(); setActiveTab('jobs-create'); }}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: 'var(--accent-purple)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', fontSize: '13px' }}
                >
                  <Plus size={16} /> Create Job
                </button>
              </div>

              {/* Search & Filters */}
              <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <Search size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
                  <input 
                    type="text" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by Job Name, handler code, tags, or UUID..."
                    style={{ width: '100%', padding: '10px 14px 10px 38px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', color: '#fff', fontSize: '13px', outline: 'none' }}
                  />
                </div>

                <select 
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  style={{ padding: '10px', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: '#fff', fontSize: '13px' }}
                >
                  <option value="">All Statuses</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="running">Running</option>
                  <option value="completed">Completed</option>
                  <option value="failed">Failed</option>
                </select>

                <select 
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  style={{ padding: '10px', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: '#fff', fontSize: '13px' }}
                >
                  <option value="">All Types</option>
                  <option value="immediate">Immediate</option>
                  <option value="delayed">Delayed</option>
                  <option value="recurring">Recurring</option>
                </select>
              </div>

              {/* Jobs Table */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', color: 'var(--text-secondary)', fontSize: '12px' }}>
                      <th style={{ padding: '12px' }}>Job Details</th>
                      <th style={{ padding: '12px' }}>Status</th>
                      <th style={{ padding: '12px' }}>Schedule</th>
                      <th style={{ padding: '12px' }}>Next Run / Delay</th>
                      <th style={{ padding: '12px' }}>Last Run</th>
                      <th style={{ padding: '12px' }}>Owner</th>
                      <th style={{ padding: '12px', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody style={{ fontSize: '13px' }}>
                    {filteredJobs.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>No matching jobs found.</td>
                      </tr>
                    ) : (
                      filteredJobs.map(job => (
                        <tr key={job.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', verticalAlign: 'middle' }}>
                          <td style={{ padding: '12px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span 
                                onClick={() => setSelectedJob(job)}
                                style={{ fontWeight: '600', color: '#fff', cursor: 'pointer' }}
                              >
                                {job.name}
                              </span>
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{job.handler}</span>
                              {job.tags && (
                                <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                                  {job.tags.map(t => (
                                    <span key={t} style={{ fontSize: '9px', background: 'rgba(255,255,255,0.04)', padding: '1px 5px', borderRadius: '4px', color: 'var(--text-secondary)' }}>{t}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                          <td style={{ padding: '12px' }}>
                            <span style={{ 
                              padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '500',
                              background: 
                                job.status === 'completed' ? 'var(--success-glow)' : 
                                job.status === 'running' ? 'var(--accent-blue-glow)' : 
                                job.status === 'failed' ? 'var(--danger-glow)' : 'rgba(255,255,255,0.05)',
                              color: 
                                job.status === 'completed' ? 'var(--success)' : 
                                job.status === 'running' ? 'var(--accent-blue)' : 
                                job.status === 'failed' ? 'var(--danger)' : '#fff'
                            }}>
                              {job.status.toUpperCase()}
                            </span>
                          </td>
                          <td style={{ padding: '12px', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                            {job.cron_expression || 'Immediate'}
                          </td>
                          <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>
                            {job.run_at ? new Date(job.run_at).toLocaleTimeString() : 'N/A'}
                          </td>
                          <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>
                            {job.completed_at ? new Date(job.completed_at).toLocaleTimeString() : 'N/A'}
                          </td>
                          <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>
                            {job.owner || 'System'}
                          </td>
                          <td style={{ padding: '12px', textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                              <button 
                                onClick={() => triggerRunNow(job.id)}
                                title="Run Now"
                                style={{ background: 'rgba(16,185,129,0.1)', border: 'none', borderRadius: '6px', padding: '6px 10px', color: 'var(--success)' }}
                              >
                                <Play size={14} />
                              </button>
                              <button 
                                onClick={() => togglePauseResume(job.id, job.is_paused)}
                                title={job.is_paused ? "Resume Job" : "Pause Job"}
                                style={{ background: 'rgba(245,158,11,0.1)', border: 'none', borderRadius: '6px', padding: '6px 10px', color: 'var(--warning)' }}
                              >
                                <Activity size={14} />
                              </button>
                              <button 
                                onClick={() => triggerDuplicateJob(job.id)}
                                title="Duplicate"
                                style={{ background: 'rgba(255,255,255,0.03)', border: 'none', borderRadius: '6px', padding: '6px 10px', color: '#fff' }}
                              >
                                <Copy size={14} />
                              </button>
                              <button 
                                onClick={() => { setSelectedJob(job); populateFormForEdit(job); setShowEditModal(true); }}
                                title="Edit"
                                style={{ background: 'rgba(255,255,255,0.03)', border: 'none', borderRadius: '6px', padding: '6px 10px', color: '#fff' }}
                              >
                                <Edit2 size={14} />
                              </button>
                              <button 
                                onClick={() => triggerDeleteJob(job.id)}
                                title="Delete"
                                style={{ background: 'rgba(239,68,68,0.1)', border: 'none', borderRadius: '6px', padding: '6px 10px', color: 'var(--danger)' }}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 3. CREATE JOB PAGE */}
          {activeTab === 'jobs-create' && (
            <div className="glass-panel" style={{ padding: '28px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#fff', marginBottom: '20px' }}>Create Scheduled Job</h2>
              <form onSubmit={triggerCreateJob} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '28px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-secondary)' }}>Job Name</label>
                    <input 
                      type="text" 
                      required
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="e.g. Sync Customer Database"
                      style={{ padding: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', color: '#fff', fontSize: '13px', outline: 'none' }}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-secondary)' }}>Description</label>
                    <textarea 
                      rows={3}
                      value={formDescription}
                      onChange={(e) => setFormDescription(e.target.value)}
                      placeholder="Summary of what this job processes..."
                      style={{ padding: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', color: '#fff', fontSize: '13px', outline: 'none', resize: 'none' }}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-secondary)' }}>Command / Script Executable</label>
                    <textarea 
                      rows={3}
                      required
                      value={formCommand}
                      onChange={(e) => setFormCommand(e.target.value)}
                      placeholder="e.g. python -m sync.billing --run-mode=real"
                      style={{ padding: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', color: '#fff', fontSize: '13px', outline: 'none', fontFamily: 'var(--font-mono)' }}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-secondary)' }}>Dotted Python Handler</label>
                    <input 
                      type="text" 
                      required
                      value={formHandler}
                      onChange={(e) => setFormHandler(e.target.value)}
                      style={{ padding: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', color: '#fff', fontSize: '13px', outline: 'none', fontFamily: 'var(--font-mono)' }}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-secondary)' }}>Target Queue</label>
                    <select 
                      value={selectedQueueId}
                      onChange={(e) => setSelectedQueueId(e.target.value)}
                      style={{ padding: '10px', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: '#fff', fontSize: '13px' }}
                    >
                      {queues.map(q => (
                        <option key={q.id} value={q.id}>{q.name} (Priority {q.priority})</option>
                      ))}
                    </select>
                  </div>

                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-secondary)' }}>Job Type & Scheduling Options</label>
                    <select 
                      value={formType}
                      onChange={(e) => setFormType(e.target.value)}
                      style={{ padding: '10px', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: '#fff', fontSize: '13px', marginBottom: '8px' }}
                    >
                      <option value="immediate">Immediate (Queue now)</option>
                      <option value="delayed">Delayed execution</option>
                      <option value="recurring">Recurring Schedule (Cron)</option>
                    </select>

                    {formType === 'delayed' && (
                      <input 
                        type="number"
                        placeholder="Delay in seconds"
                        value={formDelaySeconds}
                        onChange={(e) => setFormDelaySeconds(Number(e.target.value))}
                        style={{ padding: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', color: '#fff', fontSize: '13px' }}
                      />
                    )}

                    {formType === 'recurring' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          {['minute', 'hourly', 'daily', 'weekly', 'monthly', 'custom'].map(preset => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => setFormSchedulePreset(preset)}
                              style={{
                                padding: '6px 12px',
                                borderRadius: '6px',
                                border: '1px solid rgba(255,255,255,0.08)',
                                background: formSchedulePreset === preset ? 'var(--accent-purple)' : 'rgba(255,255,255,0.02)',
                                color: '#fff',
                                fontSize: '11px'
                              }}
                            >
                              {preset.toUpperCase()}
                            </button>
                          ))}
                        </div>
                        {formSchedulePreset === 'custom' && (
                          <input 
                            type="text" 
                            value={formCron}
                            onChange={(e) => setFormCron(e.target.value)}
                            placeholder="*/5 * * * * (Standard Cron Expression)"
                            style={{ padding: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', color: '#fff', fontSize: '13px' }}
                          />
                        )}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-secondary)' }}>Retry Limit</label>
                      <input 
                        type="number" 
                        min="0"
                        max="10"
                        value={formRetries}
                        onChange={(e) => setFormRetries(Number(e.target.value))}
                        style={{ padding: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', color: '#fff', fontSize: '13px' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-secondary)' }}>Timeout (sec)</label>
                      <input 
                        type="number" 
                        min="10"
                        value={formTimeout}
                        onChange={(e) => setFormTimeout(Number(e.target.value))}
                        style={{ padding: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', color: '#fff', fontSize: '13px' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-secondary)' }}>Priority (1=Highest, 10=Lowest): {formPriority}</label>
                    <input 
                      type="range" 
                      min="1"
                      max="10"
                      value={formPriority}
                      onChange={(e) => setFormPriority(Number(e.target.value))}
                      style={{ accentColor: 'var(--accent-purple)' }}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-secondary)' }}>Tags (comma-separated)</label>
                    <input 
                      type="text" 
                      value={formTagsString}
                      onChange={(e) => setFormTagsString(e.target.value)}
                      placeholder="e.g. backend, database, sync"
                      style={{ padding: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', color: '#fff', fontSize: '13px' }}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '20px', padding: '10px 0' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#fff', cursor: 'pointer' }}>
                      <input type="checkbox" checked={formEmailNotify} onChange={(e) => setFormEmailNotify(e.target.checked)} style={{ accentColor: 'var(--accent-purple)' }} />
                      Email Alerts
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#fff', cursor: 'pointer' }}>
                      <input type="checkbox" checked={formSlackNotify} onChange={(e) => setFormSlackNotify(e.target.checked)} style={{ accentColor: 'var(--accent-purple)' }} />
                      Slack Alerts
                    </label>
                  </div>

                  <button 
                    type="submit"
                    style={{ 
                      marginTop: '10px', padding: '12px', background: 'var(--accent-purple)', border: 'none', 
                      borderRadius: '8px', color: '#fff', fontSize: '14px', fontWeight: '600'
                    }}
                  >
                    Schedule Job Task
                  </button>

                </div>
              </form>
            </div>
          )}

          {/* 4. CALENDAR VIEW */}
          {activeTab === 'jobs-calendar' && (
            <div className="glass-panel" style={{ padding: '28px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#fff', marginBottom: '10px' }}>Calendar Workload Visualization</h2>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '24px' }}>Color-coded status blocks show upcoming, finished, and missed recurring scheduler fire slots.</p>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '12px' }}>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                  <div key={d} style={{ textAlign: 'center', fontWeight: '600', fontSize: '13px', color: 'var(--text-secondary)', paddingBottom: '8px' }}>{d}</div>
                ))}
                {calendarDays.map((day, idx) => (
                  <div 
                    key={idx} 
                    style={{ 
                      background: day.isToday ? 'rgba(46,204,113,0.06)' : 'rgba(255,255,255,0.01)', 
                      border: `1px solid ${day.isToday ? 'var(--accent-purple)' : 'rgba(255,255,255,0.04)'}`, 
                      borderRadius: '12px', 
                      minHeight: '110px', 
                      padding: '8px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px'
                    }}
                  >
                    <span style={{ fontSize: '11px', fontWeight: 'bold', color: day.isToday ? 'var(--accent-purple)' : 'var(--text-secondary)' }}>
                      {day.date.getDate()} {day.isToday && '(Today)'}
                    </span>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '6px' }}>
                      {day.jobs.map((j: any, jidx: number) => (
                        <div 
                          key={jidx}
                          style={{
                            fontSize: '9px',
                            padding: '3px 6px',
                            borderRadius: '4px',
                            background: 
                              j.status === 'completed' ? 'var(--success-glow)' : 
                              j.status === 'failed' ? 'var(--danger-glow)' : 
                              j.status === 'running' ? 'var(--accent-blue-glow)' : 'rgba(255,255,255,0.03)',
                            color: 
                              j.status === 'completed' ? 'var(--success)' : 
                              j.status === 'failed' ? 'var(--danger)' : '#fff',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden'
                          }}
                        >
                          {j.name}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 5. MONITORING - LIVE JOBS */}
          {activeTab === 'monitor-live' && (
            <div className="glass-panel" style={{ padding: '28px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#fff', marginBottom: '20px' }}>Active System Queues & Processes</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                
                <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)', padding: '20px', borderRadius: '12px' }}>
                  <h3 style={{ fontSize: '14px', color: '#fff', fontWeight: '600', marginBottom: '14px' }}>Active Claims Execution</h3>
                  
                  {jobs.filter(j => j.status === 'running').length === 0 ? (
                    <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No background tasks currently running.</span>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {jobs.filter(j => j.status === 'running').map(j => (
                        <div key={j.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '13px' }}>
                              <span style={{ fontWeight: '600', color: '#fff' }}>{j.name}</span>
                              <span style={{ color: 'var(--accent-purple)' }}>Processing (Claims Thread #1)...</span>
                            </div>
                            {/* Visual Progress Bar mock */}
                            <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', overflow: 'hidden' }}>
                              <div style={{ width: '65%', height: '100%', background: 'linear-gradient(90deg, var(--accent-purple), var(--accent-blue))', borderRadius: '10px' }} />
                            </div>
                          </div>
                          <span style={{ fontSize: '12px', paddingLeft: '20px', color: 'var(--text-secondary)' }}>65%</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                  <div style={{ border: '1px solid rgba(255,255,255,0.05)', padding: '20px', borderRadius: '12px' }}>
                    <h4 style={{ fontSize: '13px', color: '#fff', fontWeight: '600', marginBottom: '10px' }}>Queue Connections Backlog</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Queue: <strong>default</strong></span>
                        <span style={{ color: 'var(--success)' }}>Operational</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Queue Concurrency:</span>
                        <span style={{ color: '#fff' }}>4 threads active</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Active connections count:</span>
                        <span style={{ color: 'var(--accent-purple)' }}>12 connections pool</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ border: '1px solid rgba(255,255,255,0.05)', padding: '20px', borderRadius: '12px' }}>
                    <h4 style={{ fontSize: '13px', color: '#fff', fontWeight: '600', marginBottom: '10px' }}>Broker Queues Storage</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Pending messages:</span>
                        <span style={{ color: '#fff' }}>{jobs.filter(j => j.status === 'queued').length} items</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Failed messages (DLQ):</span>
                        <span style={{ color: 'var(--danger)' }}>{jobs.filter(j => j.status === 'failed').length} items</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Redis Memory pool:</span>
                        <span style={{ color: '#fff' }}>2.14 MB claimed</span>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* 6. MONITORING - WORKERS */}
          {activeTab === 'monitor-workers' && (
            <div className="glass-panel" style={{ padding: '28px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#fff', marginBottom: '20px' }}>Worker Nodes Management</h2>
              
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', color: 'var(--text-secondary)', fontSize: '12px' }}>
                      <th style={{ padding: '12px' }}>Worker Name</th>
                      <th style={{ padding: '12px' }}>Status</th>
                      <th style={{ padding: '12px' }}>Target Queue</th>
                      <th style={{ padding: '12px' }}>CPU Load</th>
                      <th style={{ padding: '12px' }}>Memory (RSS)</th>
                      <th style={{ padding: '12px' }}>PID</th>
                      <th style={{ padding: '12px' }}>Active claims</th>
                    </tr>
                  </thead>
                  <tbody style={{ fontSize: '13px' }}>
                    {workers.map(w => (
                      <tr key={w.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                        <td style={{ padding: '12px' }}>
                          <div style={{ fontWeight: '600', color: '#fff' }}>{w.name}</div>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{w.hostname}</div>
                        </td>
                        <td style={{ padding: '12px' }}>
                          <span style={{ 
                            padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '500',
                            background: w.status === 'online' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                            color: w.status === 'online' ? 'var(--success)' : 'var(--danger)'
                          }}>
                            {w.status.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: '12px', fontFamily: 'var(--font-mono)' }}>{w.queue_name}</td>
                        <td style={{ padding: '12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span>{w.cpu_usage}%</span>
                            <div style={{ width: '60px', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                              <div style={{ width: `${w.cpu_usage}%`, height: '100%', background: 'var(--accent-purple)' }} />
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '12px' }}>{w.memory_usage > 0 ? `${w.memory_usage} MB` : 'N/A'}</td>
                        <td style={{ padding: '12px' }}>{w.pid}</td>
                        <td style={{ padding: '12px', fontWeight: '600' }}>{w.active_jobs} tasks</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 7. MONITORING - QUEUES */}
          {activeTab === 'monitor-queues' && (
            <div className="glass-panel" style={{ padding: '28px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#fff' }}>Broker Queues</h2>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {queues.map(q => (
                  <div key={q.id} className="glass-panel" style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '16px', fontWeight: '600', color: '#fff' }}>{q.name}</span>
                        <span style={{ 
                          fontSize: '10px', padding: '2px 8px', borderRadius: '4px', fontWeight: '600',
                          background: q.is_paused ? 'rgba(245,158,11,0.1)' : 'rgba(16,185,129,0.1)',
                          color: q.is_paused ? 'var(--warning)' : 'var(--success)'
                        }}>
                          {q.is_paused ? 'PAUSED' : 'ACTIVE'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '16px', marginTop: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                        <span>Default Priority: {q.priority}</span>
                        <span>•</span>
                        <span>Concurrency Limit: {q.concurrency_limit} thread workers</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button 
                        onClick={() => {
                          if (!isConnected) {
                            setQueues(prev => prev.map(item => item.id === q.id ? { ...item, is_paused: !item.is_paused } : item));
                            addConsoleLog(`Toggled queue ${q.name} state.`);
                          } else {
                            const action = q.is_paused ? 'resume' : 'pause';
                            fetch(`http://localhost:8000/api/v1/queues/queues/${q.id}/${action}`, {
                              method: 'POST',
                              headers: { 'Authorization': `Bearer ${token}` }
                            }).then(() => fetchBackendData());
                          }
                        }}
                        style={{ 
                          padding: '8px 16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)',
                          background: q.is_paused ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
                          color: q.is_paused ? 'var(--success)' : 'var(--warning)',
                          fontWeight: '600', fontSize: '13px'
                        }}
                      >
                        {q.is_paused ? 'Resume Queue' : 'Pause Queue'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 8. JOB EXECUTION LOGS */}
          {activeTab === 'logs' && (
            <div className="glass-panel" style={{ padding: '28px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#fff', marginBottom: '20px' }}>Job Execution Archive</h2>
              
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', color: 'var(--text-secondary)', fontSize: '12px' }}>
                      <th style={{ padding: '12px' }}>Execution ID</th>
                      <th style={{ padding: '12px' }}>Job ID</th>
                      <th style={{ padding: '12px' }}>Attempt No.</th>
                      <th style={{ padding: '12px' }}>Status</th>
                      <th style={{ padding: '12px' }}>Duration (ms)</th>
                      <th style={{ padding: '12px' }}>Triggered At</th>
                      <th style={{ padding: '12px', textAlign: 'right' }}>View Log Stream</th>
                    </tr>
                  </thead>
                  <tbody style={{ fontSize: '13px' }}>
                    {executions.map(x => (
                      <tr key={x.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                        <td style={{ padding: '12px', fontFamily: 'var(--font-mono)', color: 'var(--accent-purple)' }}>{x.id.substring(0, 8)}...</td>
                        <td style={{ padding: '12px', fontFamily: 'var(--font-mono)' }}>{x.job_id.substring(0, 8)}...</td>
                        <td style={{ padding: '12px' }}>Attempt #{x.attempt_number}</td>
                        <td style={{ padding: '12px' }}>
                          <span style={{ 
                            padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '500',
                            background: x.status === 'succeeded' ? 'var(--success-glow)' : 'var(--danger-glow)',
                            color: x.status === 'succeeded' ? 'var(--success)' : 'var(--danger)'
                          }}>
                            {x.status.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: '12px' }}>{x.duration_ms ? `${x.duration_ms} ms` : 'In Progress'}</td>
                        <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>{new Date(x.started_at).toLocaleString()}</td>
                        <td style={{ padding: '12px', textAlign: 'right' }}>
                          <button 
                            onClick={() => setSelectedExecution(x)}
                            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', padding: '6px 12px', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}
                          >
                            <Eye size={12} /> Inspect Output
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 9. ANALYTICS */}
          {activeTab === 'analytics' && (
            <div className="glass-panel" style={{ padding: '28px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#fff', marginBottom: '20px' }}>Aggregated Performance Analytics</h2>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '32px' }}>
                <div style={{ border: '1px solid rgba(255,255,255,0.05)', padding: '20px', borderRadius: '12px', textAlign: 'center' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Average Processing Time</span>
                  <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#fff', margin: '10px 0' }}>{metrics.avgDuration} sec</div>
                  <span style={{ fontSize: '11px', color: 'var(--success)' }}>Within concurrency limit SLA</span>
                </div>
                <div style={{ border: '1px solid rgba(255,255,255,0.05)', padding: '20px', borderRadius: '12px', textAlign: 'center' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Overall Success Rate</span>
                  <div style={{ fontSize: '32px', fontWeight: 'bold', color: 'var(--success)', margin: '10px 0' }}>{metrics.successRate}%</div>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Out of {metrics.total} total runs</span>
                </div>
                <div style={{ border: '1px solid rgba(255,255,255,0.05)', padding: '20px', borderRadius: '12px', textAlign: 'center' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Failure Rate</span>
                  <div style={{ fontSize: '32px', fontWeight: 'bold', color: 'var(--danger)', margin: '10px 0' }}>{metrics.failureRate}%</div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Requires manual DLQ review</span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                <div style={{ border: '1px solid rgba(255,255,255,0.05)', padding: '20px', borderRadius: '12px' }}>
                  <h3 style={{ fontSize: '14px', color: '#fff', fontWeight: '600', marginBottom: '14px' }}>Most Frequently Executed Tasks</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '8px', background: 'rgba(255,255,255,0.02)', borderRadius: '6px' }}>
                      <span>app.worker.tasks.billing.invoices</span>
                      <strong>24 runs/day</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '8px', background: 'rgba(255,255,255,0.02)', borderRadius: '6px' }}>
                      <span>app.worker.tasks.db_backup</span>
                      <strong>1 run/day</strong>
                    </div>
                  </div>
                </div>

                <div style={{ border: '1px solid rgba(255,255,255,0.05)', padding: '20px', borderRadius: '12px' }}>
                  <h3 style={{ fontSize: '14px', color: '#fff', fontWeight: '600', marginBottom: '14px' }}>Longest Running Tasks</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '8px', background: 'rgba(255,255,255,0.02)', borderRadius: '6px' }}>
                      <span>Backup Primary DB Cluster</span>
                      <strong style={{ color: 'var(--warning)' }}>762,000 ms</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '8px', background: 'rgba(255,255,255,0.02)', borderRadius: '6px' }}>
                      <span>Rebuild Search Indexes</span>
                      <strong style={{ color: 'var(--danger)' }}>75,000 ms (Failed)</strong>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* 10. NOTIFICATIONS HISTORY */}
          {activeTab === 'notifications' && (
            <div className="glass-panel" style={{ padding: '28px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#fff' }}>Notifications Broadcast Logs</h2>
                <button 
                  onClick={clearNotifications}
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', color: '#fff' }}
                >
                  Clear Notifications History
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {notifications.map(n => (
                  <div 
                    key={n.id} 
                    style={{ 
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', borderRadius: '12px', 
                      background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)',
                      borderLeft: `4px solid ${n.notification_type === 'error' ? 'var(--danger)' : n.notification_type === 'success' ? 'var(--success)' : 'var(--warning)'}`
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ fontWeight: '600', color: '#fff' }}>{n.title}</span>
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{new Date(n.created_at).toLocaleString()}</span>
                      </div>
                      <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{n.message}</p>
                    </div>

                    {!n.is_read && (
                      <button 
                        onClick={() => markRead(n.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(46,204,113,0.1)', border: 'none', borderRadius: '6px', padding: '6px 12px', color: 'var(--success)', fontSize: '11px', fontWeight: '600' }}
                      >
                        <Check size={12} /> Mark Read
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 11. USER MANAGEMENT */}
          {activeTab === 'users' && isAdmin && (
            <div className="glass-panel" style={{ padding: '28px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#fff', marginBottom: '20px' }}>User Role Management</h2>
              
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', color: 'var(--text-secondary)', fontSize: '12px' }}>
                      <th style={{ padding: '12px' }}>User Full Name</th>
                      <th style={{ padding: '12px' }}>Email Address</th>
                      <th style={{ padding: '12px' }}>System Role</th>
                      <th style={{ padding: '12px' }}>Permissions</th>
                      <th style={{ padding: '12px', textAlign: 'right' }}>Modify Role</th>
                    </tr>
                  </thead>
                  <tbody style={{ fontSize: '13px' }}>
                    {users.map(u => (
                      <tr key={u.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                        <td style={{ padding: '12px', fontWeight: '600', color: '#fff' }}>{u.full_name}</td>
                        <td style={{ padding: '12px' }}>{u.email}</td>
                        <td style={{ padding: '12px' }}>
                          <span style={{ 
                            padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600',
                            background: u.role === 'admin' ? 'rgba(239,68,68,0.15)' : u.role === 'operator' ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.05)',
                            color: u.role === 'admin' ? '#fca5a5' : u.role === 'operator' ? '#93c5fd' : '#fff'
                          }}>
                            {u.role.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>
                          {u.role === 'admin' ? 'All Read & Write Actions' : u.role === 'operator' ? 'Queue Management & Job Execution Triggers' : 'Read-Only Viewer Access'}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right' }}>
                          <select 
                            value={u.role}
                            onChange={(e) => handleUserRoleChange(u.id, e.target.value)}
                            style={{ padding: '6px', borderRadius: '6px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: '#fff', fontSize: '12px' }}
                          >
                            <option value="admin">Admin</option>
                            <option value="operator">Operator</option>
                            <option value="viewer">Viewer</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 12. SETTINGS */}
          {activeTab === 'settings' && (
            <div className="glass-panel" style={{ padding: '28px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#fff', marginBottom: '20px' }}>Global Settings Configuration</h2>
              
              <form onSubmit={triggerSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-secondary)' }}>Time Zone Selector</label>
                    <select 
                      value={settings.time_zone}
                      onChange={(e) => setSettings({ ...settings, time_zone: e.target.value })}
                      style={{ padding: '10px', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: '#fff', fontSize: '13px' }}
                    >
                      <option value="UTC">UTC (Coordinated Universal Time)</option>
                      <option value="EST">EST (Eastern Standard Time)</option>
                      <option value="PST">PST (Pacific Standard Time)</option>
                      <option value="IST">IST (Indian Standard Time)</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-secondary)' }}>Log Retention policy (days)</label>
                    <input 
                      type="number" 
                      value={settings.log_retention_days}
                      onChange={(e) => setSettings({ ...settings, log_retention_days: Number(e.target.value) })}
                      style={{ padding: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', color: '#fff', fontSize: '13px' }}
                    />
                  </div>

                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-secondary)' }}>Worker Concurrency Limit default</label>
                    <input 
                      type="number" 
                      value={settings.worker_concurrency_default}
                      onChange={(e) => setSettings({ ...settings, worker_concurrency_default: Number(e.target.value) })}
                      style={{ padding: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', color: '#fff', fontSize: '13px' }}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-secondary)' }}>Slack Incoming Webhook URL</label>
                    <input 
                      type="text" 
                      value={settings.slack_webhook_url}
                      onChange={(e) => setSettings({ ...settings, slack_webhook_url: e.target.value })}
                      placeholder="https://hooks.slack.com/services/..."
                      style={{ padding: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', color: '#fff', fontSize: '13px' }}
                    />
                  </div>

                </div>

                <div style={{ display: 'flex', gap: '20px', padding: '10px 0' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#fff', cursor: 'pointer' }}>
                    <input type="checkbox" checked={settings.email_notifications} onChange={(e) => setSettings({ ...settings, email_notifications: e.target.checked })} style={{ accentColor: 'var(--accent-purple)' }} />
                    Enable global email broadcasts
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#fff', cursor: 'pointer' }}>
                    <input type="checkbox" checked={settings.slack_notifications} onChange={(e) => setSettings({ ...settings, slack_notifications: e.target.checked })} style={{ accentColor: 'var(--accent-purple)' }} />
                    Enable Slack webhook notifications
                  </label>
                </div>

                <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '20px' }}>
                  <h3 style={{ fontSize: '14px', color: '#fff', fontWeight: '600', marginBottom: '10px' }}>Workspace API keys</h3>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px' }}>
                    <code style={{ background: '#090d10', padding: '8px 12px', borderRadius: '6px', fontSize: '12px', color: '#10b981', flex: 1 }}>
                      usr_live_83b1029c7d81a20cd19a2b918f4a
                    </code>
                    <button type="button" onClick={() => alert("API Token Copied!")} style={{ padding: '8px 14px', background: 'rgba(255,255,255,0.04)', color: '#fff', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', fontSize: '12px' }}>Copy</button>
                    <button type="button" style={{ padding: '8px 14px', background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', border: 'none', borderRadius: '6px', fontSize: '12px' }}>Revoke</button>
                  </div>
                </div>

                <button 
                  type="submit"
                  style={{ padding: '12px', background: 'var(--accent-purple)', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '14px', fontWeight: '600', alignSelf: 'flex-start' }}
                >
                  Save Workspace Configurations
                </button>
              </form>

            </div>
          )}

          {/* 13. AUDIT HISTORY */}
          {activeTab === 'audit' && (
            <div className="glass-panel" style={{ padding: '28px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#fff', marginBottom: '20px' }}>System Audit History logs</h2>
              
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', color: 'var(--text-secondary)', fontSize: '12px' }}>
                      <th style={{ padding: '12px' }}>Action Time</th>
                      <th style={{ padding: '12px' }}>Operator Email</th>
                      <th style={{ padding: '12px' }}>Action Trigger</th>
                      <th style={{ padding: '12px' }}>Target Type</th>
                      <th style={{ padding: '12px' }}>Details log</th>
                    </tr>
                  </thead>
                  <tbody style={{ fontSize: '13px' }}>
                    {auditLogs.map(a => (
                      <tr key={a.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                        <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>{new Date(a.created_at).toLocaleString()}</td>
                        <td style={{ padding: '12px', fontWeight: '600' }}>{a.user_email}</td>
                        <td style={{ padding: '12px' }}>
                          <span style={{ 
                            padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600',
                            background: 
                              a.action === 'create' ? 'rgba(46,204,113,0.1)' : 
                              a.action === 'delete' ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.05)',
                            color: 
                              a.action === 'create' ? 'var(--success)' : 
                              a.action === 'delete' ? 'var(--danger)' : '#fff'
                          }}>
                            {a.action.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: '12px', textTransform: 'capitalize' }}>{a.target_type}</td>
                        <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>{a.details}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </main>
      </div>

      {/* --- INSPECT LOG MODAL DRAWER --- */}
      {selectedExecution && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '640px', padding: '24px', background: '#1c242c', borderRadius: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#fff' }}>Execution Log Output ({selectedExecution.id.substring(0, 8)})</h3>
              <button 
                onClick={() => setSelectedExecution(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '18px', fontWeight: 'bold' }}
              >
                ✕
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              <div>Status: <span style={{ color: selectedExecution.status === 'succeeded' ? 'var(--success)' : 'var(--danger)', fontWeight: 'bold' }}>{selectedExecution.status.toUpperCase()}</span></div>
              <div>Duration: <span style={{ color: '#fff' }}>{selectedExecution.duration_ms ? `${selectedExecution.duration_ms} ms` : 'In Progress'}</span></div>
              <div>Triggered: <span style={{ color: '#fff' }}>{new Date(selectedExecution.started_at).toLocaleTimeString()}</span></div>
              {selectedExecution.error_message && <div style={{ gridColumn: 'span 2', color: 'var(--danger)' }}>Error: {selectedExecution.error_message}</div>}
            </div>
            <div style={{ background: '#090d10', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px', padding: '16px', height: '240px', overflowY: 'auto', fontFamily: 'var(--font-mono)', fontSize: '11px', color: '#10b981', lineHeight: '1.6' }}>
              {selectedExecution.output ? selectedExecution.output.split('\n').map((line, lidx) => (
                <div key={lidx}>{line}</div>
              )) : 'No raw logs emitted.'}
            </div>
          </div>
        </div>
      )}

      {/* --- EDIT JOB MODAL DIALOG --- */}
      {showEditModal && selectedJob && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '500px', padding: '24px', background: '#1c242c', borderRadius: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#fff' }}>Modify Job Configuration</h3>
              <button 
                onClick={() => { setShowEditModal(false); setSelectedJob(null); resetForm(); }}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '18px', fontWeight: 'bold' }}
              >
                ✕
              </button>
            </div>
            <form onSubmit={triggerEditJob} style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '450px', overflowY: 'auto', paddingRight: '6px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Job Name</label>
                <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} required style={{ padding: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '6px', color: '#fff', fontSize: '13px' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Description</label>
                <textarea rows={2} value={formDescription} onChange={(e) => setFormDescription(e.target.value)} style={{ padding: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '6px', color: '#fff', fontSize: '13px' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Command Execution Line</label>
                <input type="text" value={formCommand} onChange={(e) => setFormCommand(e.target.value)} required style={{ padding: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '6px', color: '#fff', fontSize: '13px', fontFamily: 'var(--font-mono)' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Dotted Script Target</label>
                <input type="text" value={formHandler} onChange={(e) => setFormHandler(e.target.value)} required style={{ padding: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '6px', color: '#fff', fontSize: '13px', fontFamily: 'var(--font-mono)' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Retry Count</label>
                  <input type="number" value={formRetries} onChange={(e) => setFormRetries(Number(e.target.value))} style={{ padding: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '6px', color: '#fff', fontSize: '13px' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Timeout (sec)</label>
                  <input type="number" value={formTimeout} onChange={(e) => setFormTimeout(Number(e.target.value))} style={{ padding: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '6px', color: '#fff', fontSize: '13px' }} />
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Tags (comma-separated)</label>
                <input type="text" value={formTagsString} onChange={(e) => setFormTagsString(e.target.value)} style={{ padding: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '6px', color: '#fff', fontSize: '13px' }} />
              </div>
              <button type="submit" style={{ padding: '10px', background: 'var(--accent-purple)', border: 'none', borderRadius: '6px', color: '#fff', fontWeight: '600', fontSize: '13px', marginTop: '10px' }}>Save Parameters</button>
            </form>
          </div>
        </div>
      )}

      {/* --- JOB DETAILS DRAWER PANEL --- */}
      {selectedJob && !showEditModal && (
        <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: '420px', background: '#1c242c', borderLeft: '1px solid var(--border-glass)', boxShadow: '-10px 0 30px rgba(0,0,0,0.5)', zIndex: 150, padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '12px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{selectedJob.id}</span>
            <button onClick={() => setSelectedJob(null)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '16px', fontWeight: 'bold' }}>✕</button>
          </div>

          <div>
            <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#fff', marginBottom: '6px' }}>{selectedJob.name}</h3>
            <span style={{ 
              padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600',
              background: selectedJob.status === 'completed' ? 'var(--success-glow)' : selectedJob.status === 'failed' ? 'var(--danger-glow)' : 'rgba(255,255,255,0.05)',
              color: selectedJob.status === 'completed' ? 'var(--success)' : selectedJob.status === 'failed' ? 'var(--danger)' : '#fff'
            }}>{selectedJob.status.toUpperCase()}</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-secondary)' }}>Type:</span><span style={{ color: '#fff' }}>{selectedJob.job_type.toUpperCase()}</span></div>
            {selectedJob.cron_expression && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-secondary)' }}>Cron Pattern:</span><code style={{ color: '#fff' }}>{selectedJob.cron_expression}</code></div>}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-secondary)' }}>Dotted Handler:</span><code style={{ color: '#fff' }}>{selectedJob.handler}</code></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-secondary)' }}>Attempts Executed:</span><span style={{ color: '#fff' }}>{selectedJob.attempt_count} / {selectedJob.max_retries}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-secondary)' }}>Timeout:</span><span style={{ color: '#fff' }}>{selectedJob.timeout_seconds} seconds</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-secondary)' }}>Created By:</span><span style={{ color: '#fff' }}>{selectedJob.owner || 'System default'}</span></div>
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <h4 style={{ fontSize: '13px', fontWeight: '600', color: '#fff' }}>Execution Log Streams</h4>
            <div style={{ flex: 1, background: '#090d10', borderRadius: '8px', padding: '10px', overflowY: 'auto', fontFamily: 'var(--font-mono)', fontSize: '11px', color: '#10b981', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {executions.filter(x => x.job_id === selectedJob.id).length === 0 ? (
                <span style={{ color: 'var(--text-muted)' }}>No historical execution attempts found.</span>
              ) : (
                executions.filter(x => x.job_id === selectedJob.id).map(x => (
                  <div key={x.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', paddingBottom: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '600', marginBottom: '2px' }}>
                      <span>Attempt #{x.attempt_number}</span>
                      <span style={{ color: x.status === 'succeeded' ? 'var(--success)' : 'var(--danger)' }}>{x.status.toUpperCase()}</span>
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '10px' }}>{new Date(x.started_at).toLocaleString()}</div>
                    {x.error_message && <div style={{ color: 'var(--danger)', marginTop: '2px' }}>Error: {x.error_message}</div>}
                  </div>
                ))
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <button 
              onClick={() => triggerRunNow(selectedJob.id)}
              style={{ padding: '10px', background: 'var(--accent-purple)', border: 'none', borderRadius: '8px', color: '#fff', fontWeight: '600', fontSize: '13px' }}
            >
              Run Now
            </button>
            <button 
              onClick={() => togglePauseResume(selectedJob.id, selectedJob.is_paused)}
              style={{ padding: '10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', color: '#fff', fontWeight: '600', fontSize: '13px' }}
            >
              {selectedJob.is_paused ? 'Resume Scheduling' : 'Pause Scheduling'}
            </button>
          </div>

        </div>
      )}

    </div>
  );
}
