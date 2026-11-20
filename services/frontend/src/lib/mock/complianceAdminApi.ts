/** Mock API layer for Compliance Admin portal — persists to localStorage where applicable */

const delay = (ms = 350) => new Promise<void>(r => setTimeout(r, ms));

// ── Types ────────────────────────────────────────────────────────────────────

export interface DashboardMetrics {
  totalFrameworks: number;
  activeControls: number;
  compliantControls: number;
  nonCompliantControls: number;
  complianceScore: number;
  frameworkCoverage: number;
  readinessScore: number;
  completedControls: number;
  pendingControls: number;
  missingEvidence: number;
  riskSummary: { critical: number; high: number; medium: number; low: number };
  auditStatus: 'ready' | 'in-progress' | 'not-ready';
  
  // New metrics for Enterprise Dashboard
  activeAudits: number;
  openFindings: number;
  openRisks: number;
  overdueTasks: number;
  aiComplianceHealth: number;
  frameworkCompliance: Array<{ name: string; score: number; status: 'compliant' | 'partial' | 'non-compliant' }>;
  recentActivity: Array<{ id: string; title: string; time: string; type: string }>;
  recentEvidence: Array<{ id: string; title: string; time: string; control: string }>;
  pendingApprovals: Array<{ id: string; title: string; time: string; type: string }>;
}

export interface PortalUser {
  id: string;
  name: string;
  email: string;
  department: string;
  designation: string;
  role: string;
  status: 'Active' | 'Inactive';
  lastLogin: string;
}

export interface ImportRecord {
  id: string;
  date: string;
  framework: string;
  admin: string;
  status: 'Success' | 'Failed';
  count: number;
  version: string;
  error?: string;
}

export interface Integration {
  id: string;
  name: string;
  type: string;
  provider: string;
  description: string;
  enabled: boolean;
  status: 'connected' | 'disconnected' | 'error';
  lastSync: string;
  apiUrl?: string;
  apiKey?: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  module: string;
  details: string;
  severity: 'info' | 'warning' | 'critical';
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  stages: number;
  reviewers: string[];
  slaHours: number;
  status: 'active' | 'draft' | 'inactive';
  version: string;
  updatedAt: string;
}

export interface ReportDefinition {
  id: string;
  name: string;
  type: string;
  schedule: string;
  lastGenerated: string;
  format: 'PDF' | 'Excel' | 'Both';
}

export interface NotificationTemplate {
  id: string;
  name: string;
  channel: 'email' | 'slack' | 'system';
  subject: string;
  enabled: boolean;
}

export interface InAppNotification {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  role: string; // which role sees it: 'Compliance Admin', 'Control Lead', etc. or 'all'
  actionLabel?: string;
  actionType?: string;
}

// ── Seed data ─────────────────────────────────────────────────────────────────

const SEED_USERS: PortalUser[] = [
  { id: '1', name: 'Alex Morgan', email: 'alex.morgan@clovrix.com', department: 'Compliance', designation: 'Analyst', role: 'Control Owner', status: 'Active', lastLogin: '2026-06-20 09:15' },
  { id: '2', name: 'Jordan Lee', email: 'jordan.lee@clovrix.com', department: 'Engineering', designation: 'Lead Engineer', role: 'Control Lead', status: 'Active', lastLogin: '2026-06-19 14:22' },
  { id: '3', name: 'Sam Rivera', email: 'sam.rivera@clovrix.com', department: 'Risk', designation: 'Auditor', role: 'Lead Auditor', status: 'Inactive', lastLogin: '2026-06-10 11:00' },
  { id: '4', name: 'Assessor 1', email: 'assessor1@clovrix.com', department: 'Assessment', designation: 'Assessor', role: 'Assessor', status: 'Active', lastLogin: 'Never' },
  { id: '5', name: 'Assessor 2', email: 'assessor2@clovrix.com', department: 'Assessment', designation: 'Assessor', role: 'Assessor', status: 'Active', lastLogin: 'Never' },
  { id: '6', name: 'Assessor 3', email: 'assessor3@clovrix.com', department: 'Assessment', designation: 'Assessor', role: 'Assessor', status: 'Active', lastLogin: 'Never' },
  { id: '7', name: 'Assessor 4', email: 'assessor4@clovrix.com', department: 'Assessment', designation: 'Assessor', role: 'Assessor', status: 'Active', lastLogin: 'Never' },
  { id: '8', name: 'Assessor 5', email: 'assessor5@clovrix.com', department: 'Assessment', designation: 'Assessor', role: 'Assessor', status: 'Active', lastLogin: 'Never' },
];

const SEED_HISTORY: ImportRecord[] = [
  { id: 'h1', date: '2026-06-15 09:00', framework: 'ISO 42001:2023 AI Management', admin: 'Compliance Admin', status: 'Success', count: 84, version: '1.2.0' },
  { id: 'h2', date: '2026-06-12 11:30', framework: 'ISO 27001:2022 Security', admin: 'Compliance Admin', status: 'Success', count: 114, version: '2.0.1' },
  { id: 'h3', date: '2026-05-30 14:15', framework: 'NIST AI RMF v1.0', admin: 'Compliance Admin', status: 'Success', count: 72, version: '1.0.0' },
  { id: 'h4', date: '2026-05-15 10:00', framework: 'Draft Custom Framework', admin: 'Compliance Admin', status: 'Failed', count: 0, version: '0.1.0', error: 'Row 14: Missing Control Identifier' },
];

const SEED_INTEGRATIONS: Integration[] = [
  // Google
  { id: 'g-workspace', name: 'Google Workspace', provider: 'Google', type: 'google', description: 'User management, groups, and device policies.', enabled: false, status: 'disconnected', lastSync: 'Never' },
  { id: 'g-gcp', name: 'Google Cloud Platform (GCP)', provider: 'Google', type: 'google', description: 'Cloud resource compliance and IAM.', enabled: false, status: 'disconnected', lastSync: 'Never' },
  { id: 'g-identity', name: 'Cloud Identity', provider: 'Google', type: 'google', description: 'Identity and access management.', enabled: false, status: 'disconnected', lastSync: 'Never' },
  { id: 'g-gmail', name: 'Gmail', provider: 'Google', type: 'google', description: 'Email security and phishing protection settings.', enabled: false, status: 'disconnected', lastSync: 'Never' },
  { id: 'g-drive', name: 'Google Drive', provider: 'Google', type: 'google', description: 'File sharing permissions and DLP rules.', enabled: false, status: 'disconnected', lastSync: 'Never' },
  { id: 'g-calendar', name: 'Google Calendar', provider: 'Google', type: 'google', description: 'Meeting and calendar security.', enabled: false, status: 'disconnected', lastSync: 'Never' },
  { id: 'g-iam', name: 'Cloud IAM', provider: 'Google', type: 'google', description: 'GCP Identity and Access Management.', enabled: false, status: 'disconnected', lastSync: 'Never' },
  { id: 'g-scc', name: 'Security Command Center', provider: 'Google', type: 'google', description: 'Threat detection and security posture.', enabled: false, status: 'disconnected', lastSync: 'Never' },
  { id: 'g-logging', name: 'Cloud Logging', provider: 'Google', type: 'google', description: 'Audit logs and monitoring.', enabled: false, status: 'disconnected', lastSync: 'Never' },
  { id: 'g-bigquery', name: 'BigQuery', provider: 'Google', type: 'google', description: 'Data warehouse security and access logs.', enabled: false, status: 'disconnected', lastSync: 'Never' },

  // AWS
  { id: 'aws-iam', name: 'IAM', provider: 'AWS', type: 'aws', description: 'Identity and Access Management.', enabled: false, status: 'disconnected', lastSync: 'Never' },
  { id: 'aws-orgs', name: 'AWS Organizations', provider: 'AWS', type: 'aws', description: 'Multi-account management and policies.', enabled: false, status: 'disconnected', lastSync: 'Never' },
  { id: 'aws-sechub', name: 'AWS Security Hub', provider: 'AWS', type: 'aws', description: 'Centralized security alerts and posture.', enabled: false, status: 'disconnected', lastSync: 'Never' },
  { id: 'aws-guardduty', name: 'GuardDuty', provider: 'AWS', type: 'aws', description: 'Intelligent threat detection.', enabled: false, status: 'disconnected', lastSync: 'Never' },
  { id: 'aws-cloudtrail', name: 'CloudTrail', provider: 'AWS', type: 'aws', description: 'Account activity and API tracking.', enabled: false, status: 'disconnected', lastSync: 'Never' },
  { id: 'aws-config', name: 'Config', provider: 'AWS', type: 'aws', description: 'Resource inventory and configuration history.', enabled: false, status: 'disconnected', lastSync: 'Never' },
  { id: 'aws-cloudwatch', name: 'CloudWatch', provider: 'AWS', type: 'aws', description: 'Monitoring and operational data.', enabled: false, status: 'disconnected', lastSync: 'Never' },
  { id: 'aws-inspector', name: 'Inspector', provider: 'AWS', type: 'aws', description: 'Automated vulnerability management.', enabled: false, status: 'disconnected', lastSync: 'Never' },
  { id: 'aws-macie', name: 'Macie', provider: 'AWS', type: 'aws', description: 'Data security and privacy service.', enabled: false, status: 'disconnected', lastSync: 'Never' },
  { id: 'aws-s3', name: 'S3', provider: 'AWS', type: 'aws', description: 'Object storage security and access.', enabled: false, status: 'disconnected', lastSync: 'Never' },
  { id: 'aws-ec2', name: 'EC2', provider: 'AWS', type: 'aws', description: 'Compute instance security.', enabled: false, status: 'disconnected', lastSync: 'Never' },
  { id: 'aws-lambda', name: 'Lambda', provider: 'AWS', type: 'aws', description: 'Serverless compute security.', enabled: false, status: 'disconnected', lastSync: 'Never' },
  { id: 'aws-secrets', name: 'Secrets Manager', provider: 'AWS', type: 'aws', description: 'Credentials and secrets management.', enabled: false, status: 'disconnected', lastSync: 'Never' },
  { id: 'aws-ssm', name: 'Systems Manager', provider: 'AWS', type: 'aws', description: 'Operations and management.', enabled: false, status: 'disconnected', lastSync: 'Never' },

  // Azure
  { id: 'az-entra', name: 'Microsoft Entra ID', provider: 'Azure', type: 'azure', description: 'Identity and access management.', enabled: false, status: 'disconnected', lastSync: 'Never' },
  { id: 'az-defender', name: 'Microsoft Defender for Cloud', provider: 'Azure', type: 'azure', description: 'Cloud security posture management.', enabled: false, status: 'disconnected', lastSync: 'Never' },
  { id: 'az-monitor', name: 'Azure Monitor', provider: 'Azure', type: 'azure', description: 'Full stack monitoring and analytics.', enabled: false, status: 'disconnected', lastSync: 'Never' },
  { id: 'az-policy', name: 'Azure Policy', provider: 'Azure', type: 'azure', description: 'Resource compliance and governance.', enabled: false, status: 'disconnected', lastSync: 'Never' },
  { id: 'az-sentinel', name: 'Microsoft Sentinel', provider: 'Azure', type: 'azure', description: 'Cloud-native SIEM and SOAR.', enabled: false, status: 'disconnected', lastSync: 'Never' },
  { id: 'az-kv', name: 'Azure Key Vault', provider: 'Azure', type: 'azure', description: 'Secrets and key management.', enabled: false, status: 'disconnected', lastSync: 'Never' },
  { id: 'az-arm', name: 'Azure Resource Manager', provider: 'Azure', type: 'azure', description: 'Deployment and management service.', enabled: false, status: 'disconnected', lastSync: 'Never' },
  { id: 'az-storage', name: 'Azure Storage', provider: 'Azure', type: 'azure', description: 'Cloud storage security.', enabled: false, status: 'disconnected', lastSync: 'Never' },
  { id: 'az-vm', name: 'Azure Virtual Machines', provider: 'Azure', type: 'azure', description: 'Compute resource security.', enabled: false, status: 'disconnected', lastSync: 'Never' },
  { id: 'az-m365', name: 'Microsoft 365', provider: 'Azure', type: 'azure', description: 'Productivity suite security.', enabled: false, status: 'disconnected', lastSync: 'Never' },
  { id: 'az-def-ep', name: 'Microsoft Defender', provider: 'Azure', type: 'azure', description: 'Endpoint security.', enabled: false, status: 'disconnected', lastSync: 'Never' },
  { id: 'az-log', name: 'Log Analytics', provider: 'Azure', type: 'azure', description: 'Log querying and analytics.', enabled: false, status: 'disconnected', lastSync: 'Never' },

  // Existing
  { id: 'int-jira', name: 'Jira', type: 'jira', provider: 'Atlassian', description: 'Issue tracking and project management.', enabled: true, status: 'connected', lastSync: '2026-06-20 08:00', apiUrl: 'https://clovrix.atlassian.net' },
  { id: 'int-slack', name: 'Slack', type: 'slack', provider: 'Slack', description: 'Team collaboration and notifications.', enabled: true, status: 'connected', lastSync: '2026-06-20 07:45' },
  { id: 'int-ado', name: 'Azure DevOps', type: 'azure-devops', provider: 'Azure', description: 'CI/CD and code repository.', enabled: false, status: 'disconnected', lastSync: 'Never' },
  { id: 'int-email', name: 'Email Services', type: 'email', provider: 'Other', description: 'SMTP and email integration.', enabled: true, status: 'connected', lastSync: '2026-06-20 06:30' },
];

const SEED_AUDIT_LOGS: AuditLogEntry[] = [
  { id: 'a1', timestamp: '2026-06-20 14:32', user: 'complianceadmin@clovrix.local', action: 'Login', module: 'Authentication', details: 'Successful login from 192.168.1.10', severity: 'info' },
  { id: 'a2', timestamp: '2026-06-20 13:15', user: 'complianceadmin@clovrix.local', action: 'Permission Change', module: 'RBAC', details: 'Updated Control Lead write permissions for Framework module', severity: 'warning' },
  { id: 'a3', timestamp: '2026-06-19 16:40', user: 'complianceadmin@clovrix.local', action: 'User Created', module: 'User Management', details: 'Created user alex.morgan@clovrix.com', severity: 'info' },
  { id: 'a4', timestamp: '2026-06-19 11:20', user: 'complianceadmin@clovrix.local', action: 'Framework Import', module: 'Framework Management', details: 'Imported ISO 42001:2023 — 84 controls', severity: 'info' },
  { id: 'a5', timestamp: '2026-06-18 09:05', user: 'complianceadmin@clovrix.local', action: 'Integration Change', module: 'Integrations', details: 'Enabled Slack webhook notifications', severity: 'info' },
  { id: 'a6', timestamp: '2026-06-17 15:30', user: 'complianceadmin@clovrix.local', action: 'Report Generated', module: 'Reports', details: 'Executive Compliance Summary exported as PDF', severity: 'info' },
  { id: 'a7', timestamp: '2026-06-16 10:00', user: 'complianceadmin@clovrix.local', action: 'Workflow Action', module: 'Workflow Engine', details: 'Activated approval workflow "Evidence Review v2"', severity: 'info' },
];

const SEED_WORKFLOWS: WorkflowDefinition[] = [
  { id: 'wf1', name: 'Evidence Review & Approval', stages: 3, reviewers: ['Control Lead', 'Lead Auditor'], slaHours: 48, status: 'active', version: '2.1', updatedAt: '2026-06-18' },
  { id: 'wf2', name: 'Control Assignment Escalation', stages: 2, reviewers: ['Compliance Admin', 'Control Lead'], slaHours: 24, status: 'active', version: '1.0', updatedAt: '2026-06-10' },
  { id: 'wf3', name: 'Framework Change Approval', stages: 4, reviewers: ['Compliance Admin', 'Lead Auditor', 'Control Lead'], slaHours: 72, status: 'draft', version: '0.9', updatedAt: '2026-06-05' },
];

const SEED_REPORTS: ReportDefinition[] = [
  { id: 'r1', name: 'Compliance Summary', type: 'Executive', schedule: 'Weekly — Monday 08:00', lastGenerated: '2026-06-17', format: 'PDF' },
  { id: 'r2', name: 'Governance Overview', type: 'Governance', schedule: 'Monthly — 1st 09:00', lastGenerated: '2026-06-01', format: 'Both' },
  { id: 'r3', name: 'Audit Readiness', type: 'Audit', schedule: 'On demand', lastGenerated: '2026-06-19', format: 'PDF' },
  { id: 'r4', name: 'Risk Assessment', type: 'Risk', schedule: 'Bi-weekly', lastGenerated: '2026-06-14', format: 'Excel' },
  { id: 'r5', name: 'User Activity', type: 'Activity', schedule: 'Daily — 06:00', lastGenerated: '2026-06-20', format: 'Excel' },
  { id: 'r6', name: 'Framework Coverage', type: 'Coverage', schedule: 'Monthly', lastGenerated: '2026-06-01', format: 'Both' },
];

const SEED_NOTIFICATIONS: NotificationTemplate[] = [
  { id: 'n1', name: 'Control Due Reminder', channel: 'email', subject: 'Action Required: Control {{control_id}} due in {{days}} days', enabled: true },
  { id: 'n2', name: 'Evidence Submission Alert', channel: 'slack', subject: 'New evidence submitted for {{control_name}}', enabled: true },
  { id: 'n3', name: 'Audit Finding Escalation', channel: 'email', subject: 'Critical finding requires immediate review', enabled: true },
  { id: 'n4', name: 'System Maintenance Notice', channel: 'system', subject: 'Scheduled maintenance on {{date}}', enabled: false },
];

const SEED_IN_APP_NOTIFICATIONS: InAppNotification[] = [
  { id: 'ian1', title: 'Evidence Approval Required', message: 'Jordan Lee submitted evidence for control A.1.2 "Roles and Responsibilities" (ISO 42001).', timestamp: '5 mins ago', read: false, role: 'Compliance Admin', actionLabel: 'Review Evidence', actionType: 'review' },
  { id: 'ian2', title: 'Integration Sync Alert', message: 'Sync failed for Jira service. Connection timed out.', timestamp: '1 hour ago', read: false, role: 'Compliance Admin', actionLabel: 'Reconnect Service', actionType: 'reconnect' },
  { id: 'ian3', title: 'Upload Requested', message: 'Please upload data quality logs for control A.3.1 "Data Quality & Bias Mitigation".', timestamp: '10 mins ago', read: false, role: 'Control Lead', actionLabel: 'Upload Logs', actionType: 'upload' },
  { id: 'ian4', title: 'Control Due Reminder', message: 'Action Required: control A.1.2 is 2 days overdue.', timestamp: '3 hours ago', read: false, role: 'Control Lead', actionLabel: 'View Control', actionType: 'view_control' },
  { id: 'ian5', title: 'New Task Assignment', message: 'You are assigned as owner of control A.2.2 "AI System Impact Assessment".', timestamp: '15 mins ago', read: false, role: 'Control Owner', actionLabel: 'View Task', actionType: 'view_task' },
  { id: 'ian6', title: 'Audit Assessment Complete', message: 'ISO 27001 readiness rating has reached 89%. Recommended audit review.', timestamp: '2 hours ago', read: false, role: 'Lead Auditor', actionLabel: 'Review Audit', actionType: 'audit' },
  { id: 'ian7', title: 'Global Platform Update', message: 'Dashboard updated with the Q2 trend report.', timestamp: '1 day ago', read: false, role: 'Read Only', actionLabel: 'View Dashboard', actionType: 'dashboard' },
];

export const ASSIGNABLE_ROLES = ['Compliance Admin', 'Control Lead', 'Control Owner', 'Lead Auditor', 'Risk Owner', 'Assessor', 'Reviewer', 'Read Only'];

export const MODULE_PERMISSIONS = [
  { module: 'Dashboard', key: 'dashboard', actions: ['view'] },
  { module: 'Governance', key: 'governance', actions: ['view', 'create', 'edit', 'delete'] },
  { module: 'Risk Management', key: 'risk', actions: ['view', 'create', 'edit', 'delete'] },
  { module: 'Audit & Findings', key: 'audit', actions: ['view', 'create', 'edit', 'delete'] },
  { module: 'Workflow Engine', key: 'workflows', actions: ['view', 'create', 'edit', 'activate'] },
  { module: 'User Management', key: 'users', actions: ['view', 'create', 'edit', 'delete'] },
  { module: 'Roles & Permissions', key: 'roles', actions: ['view', 'edit'] },
  { module: 'Framework Import', key: 'frameworks', actions: ['view', 'import', 'delete'] },
  { module: 'Integrations', key: 'integrations', actions: ['view', 'configure', 'test'] },
  { module: 'Reports', key: 'reports', actions: ['view', 'export', 'schedule'] },
  { module: 'Settings', key: 'settings', actions: ['view', 'edit'] },
];

// ── Storage helpers ───────────────────────────────────────────────────────────

function load<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, data: unknown) {
  if (typeof window !== 'undefined') localStorage.setItem(key, JSON.stringify(data));
}

const KEYS = {
  users: 'ca_users',
  history: 'ca_import_history',
  integrations: 'ca_integrations',
  auditLogs: 'ca_audit_logs',
  workflows: 'ca_workflows',
  reports: 'ca_reports',
  notifications: 'ca_notifications',
  permissions: 'ca_permissions',
  inAppNotifications: 'ca_in_app_notifications',
};

export function defaultPermissions(): Record<string, Record<string, boolean>> {
  const roles = ASSIGNABLE_ROLES;
  const perms: Record<string, Record<string, boolean>> = {};
  for (const role of roles) {
    perms[role] = {};
    for (const mod of MODULE_PERMISSIONS) {
      for (const action of mod.actions) {
        const k = `${mod.key}-${action}`;
        let permValue = role === 'Compliance Admin' || (role !== 'Read Only' && action === 'view');
        
        // Custom risk owner overrides
        if (role === 'Risk Owner') {
          if (mod.key === 'risk' && action === 'edit') permValue = true;
          if (mod.key === 'audit' && action === 'edit') permValue = true;
          if (mod.key === 'governance' && action === 'edit') permValue = true;
        }

        // Custom assessor overrides
        if (role === 'Assessor') {
          if (mod.key === 'audit' && action === 'edit') permValue = true;
          if (mod.key === 'workflows' && action === 'edit') permValue = true;
          if (mod.key === 'governance' && action === 'edit') permValue = true;
          if (mod.key === 'risk' && action === 'edit') permValue = true;
        }

        // Custom reviewer overrides
        if (role === 'Reviewer') {
          if (mod.key === 'audit' && action === 'edit') permValue = true;
          if (mod.key === 'workflows' && action === 'edit') permValue = true;
        }

        perms[role][k] = permValue;
      }
    }
  }
  return perms;
}

export function getStoredPermissions(): Record<string, Record<string, boolean>> {
  const loaded = load(KEYS.permissions, defaultPermissions());
  const defaults = defaultPermissions();
  
  for (const role in defaults) {
    if (!loaded[role]) loaded[role] = {};
    for (const key in defaults[role]) {
      if (loaded[role][key] === undefined) {
        loaded[role][key] = defaults[role][key];
      }
    }
  }
  
  return loaded;
}

function appendAuditLog(action: string, module: string, details: string, severity: AuditLogEntry['severity'] = 'info') {
  const logs = load<AuditLogEntry[]>(KEYS.auditLogs, SEED_AUDIT_LOGS);
  logs.unshift({
    id: `a${Date.now()}`,
    timestamp: new Date().toISOString().replace('T', ' ').slice(0, 16),
    user: 'complianceadmin@clovrix.local',
    action,
    module,
    details,
    severity,
  });
  save(KEYS.auditLogs, logs.slice(0, 200));
}

// ── API ───────────────────────────────────────────────────────────────────────

export const complianceAdminApi = {
  async getDashboardMetrics(scope?: string, frameworkId?: string): Promise<DashboardMetrics> {
    await delay();
    const history = load<ImportRecord[]>(KEYS.history, SEED_HISTORY);
    let successImports = history.filter(h => h.status === 'Success');
    
    if (frameworkId && frameworkId !== 'all') {
      const fMap: Record<string, string> = {
        'iso-42001': 'ISO 42001',
        'iso-27001': 'ISO 27002',
        'nist-ai-rmf': 'NIST AI RMF',
      };
      const term = fMap[frameworkId] || frameworkId;
      successImports = successImports.filter(h => h.framework.toLowerCase().includes(term.toLowerCase()));
    }
    
    let totalControls = successImports.reduce((s, h) => s + h.count, 0);
    
    // Apply scope factor
    let factor = 1.0;
    if (scope === 'compliance') factor = 0.35;
    else if (scope === 'engineering') factor = 0.45;
    else if (scope === 'risk') factor = 0.20;
    else if (scope === 'assigned') factor = 0.10;
    
    totalControls = Math.max(1, Math.round(totalControls * factor));
    const compliant = Math.max(0, Math.round(totalControls * 0.82));
    const nonCompliant = Math.max(0, totalControls - compliant);
    
    return {
      totalFrameworks: successImports.length,
      activeControls: totalControls,
      compliantControls: compliant,
      nonCompliantControls: nonCompliant,
      complianceScore: totalControls ? Math.round((compliant / totalControls) * 100) : 0,
      frameworkCoverage: scope === 'assigned' ? 100 : Math.round(92 * (factor + 0.1)),
      readinessScore: Math.round(84 + (scope === 'compliance' ? 5 : scope === 'engineering' ? -4 : 2)),
      completedControls: compliant,
      pendingControls: Math.round(totalControls * 0.12),
      missingEvidence: Math.round(totalControls * 0.06),
      riskSummary: {
        critical: Math.max(0, Math.round(2 * factor)),
        high: Math.max(0, Math.round(5 * factor)),
        medium: Math.max(0, Math.round(12 * factor)),
        low: Math.max(0, Math.round(8 * factor)),
      },
      auditStatus: scope === 'assigned' ? 'ready' : 'in-progress',
      
      activeAudits: scope === 'assigned' ? 0 : 2,
      openFindings: Math.round(18 * factor),
      openRisks: Math.round(27 * factor),
      overdueTasks: Math.round(5 * factor),
      aiComplianceHealth: Math.round(92 * factor),
      frameworkCompliance: [
        { name: 'ISO 42001 (AI)', score: 92, status: 'compliant' },
        { name: 'ISO 27001 (InfoSec)', score: 85, status: 'partial' },
        { name: 'NIST AI RMF', score: 78, status: 'partial' },
        { name: 'SOC 2 Type II', score: 98, status: 'compliant' },
      ],
      recentActivity: [
        { id: 'a1', title: 'Jordan Lee updated Control A.1.2', time: '10 mins ago', type: 'control_update' },
        { id: 'a2', title: 'New Risk: Third-party LLM outage', time: '1 hour ago', type: 'risk_created' },
        { id: 'a3', title: 'Audit finding #42 resolved', time: '2 hours ago', type: 'finding_resolved' },
      ],
      recentEvidence: [
        { id: 'e1', title: 'Data_Quality_Report_Q2.pdf', time: '15 mins ago', control: 'A.3.1' },
        { id: 'e2', title: 'Bias_Testing_Logs.csv', time: '45 mins ago', control: 'A.3.2' },
        { id: 'e3', title: 'Model_Weights_Signoff.pdf', time: '2 hours ago', control: 'A.4.1' },
      ],
      pendingApprovals: [
        { id: 'p1', title: 'Framework Change: ISO 42001 v2', time: '1 day ago', type: 'framework' },
        { id: 'p2', title: 'Evidence Review: A.1.1 Policy', time: '2 days ago', type: 'evidence' },
      ]
    };
  },

  async getUsers(): Promise<PortalUser[]> {
    await delay();
    return load(KEYS.users, SEED_USERS);
  },

  async createUser(data: Omit<PortalUser, 'id' | 'lastLogin'>): Promise<PortalUser> {
    await delay();
    const users = load<PortalUser[]>(KEYS.users, SEED_USERS);
    const user: PortalUser = { ...data, id: String(Date.now()), lastLogin: 'Never' };
    users.unshift(user);
    save(KEYS.users, users);
    appendAuditLog('User Created', 'User Management', `Created user ${data.email}`);
    return user;
  },

  async updateUser(id: string, data: Partial<PortalUser>): Promise<PortalUser> {
    await delay();
    const users = load<PortalUser[]>(KEYS.users, SEED_USERS);
    const idx = users.findIndex(u => u.id === id);
    if (idx < 0) throw new Error('User not found');
    users[idx] = { ...users[idx], ...data };
    save(KEYS.users, users);
    appendAuditLog('User Modified', 'User Management', `Updated user ${users[idx].email}`);
    return users[idx];
  },

  async deleteUser(id: string): Promise<void> {
    await delay();
    const users = load<PortalUser[]>(KEYS.users, SEED_USERS);
    const user = users.find(u => u.id === id);
    save(KEYS.users, users.filter(u => u.id !== id));
    if (user) appendAuditLog('User Deleted', 'User Management', `Deleted user ${user.email}`, 'warning');
  },

  async getImportHistory(): Promise<ImportRecord[]> {
    await delay();
    return load(KEYS.history, SEED_HISTORY);
  },

  async importFramework(name: string, controlCount: number): Promise<ImportRecord> {
    await delay(800);
    const history = load<ImportRecord[]>(KEYS.history, SEED_HISTORY);
    const record: ImportRecord = {
      id: `h${Date.now()}`,
      date: new Date().toISOString().replace('T', ' ').slice(0, 16),
      framework: name,
      admin: 'Compliance Admin',
      status: 'Success',
      count: controlCount,
      version: '1.0.0',
    };
    history.unshift(record);
    save(KEYS.history, history);
    appendAuditLog('Framework Import', 'Framework Management', `Imported ${name} — ${controlCount} controls`);
    return record;
  },

  async getIntegrations(): Promise<Integration[]> {
    await delay();
    const stored = load<Integration[]>(KEYS.integrations, SEED_INTEGRATIONS);
    
    // Merge stored states with seed to ensure all new integrations are available
    const merged = SEED_INTEGRATIONS.map(seedItem => {
      const existing = stored.find(s => s.id === seedItem.id);
      return existing ? { ...seedItem, ...existing } : seedItem;
    });
    
    return merged;
  },

  async updateIntegration(id: string, data: Partial<Integration>): Promise<Integration> {
    await delay();
    const items = load<Integration[]>(KEYS.integrations, SEED_INTEGRATIONS);
    const idx = items.findIndex(i => i.id === id);
    if (idx < 0) throw new Error('Integration not found');
    items[idx] = { ...items[idx], ...data, lastSync: data.enabled ? new Date().toISOString().replace('T', ' ').slice(0, 16) : items[idx].lastSync };
    save(KEYS.integrations, items);
    appendAuditLog('Integration Change', 'Integrations', `Updated ${items[idx].name} configuration`);
    return items[idx];
  },

  async testIntegration(id: string): Promise<{ success: boolean; message: string }> {
    await delay(600);
    const items = load<Integration[]>(KEYS.integrations, SEED_INTEGRATIONS);
    const item = items.find(i => i.id === id);
    if (!item) return { success: false, message: 'Integration not found' };
    const success = item.enabled;
    appendAuditLog('Connection Test', 'Integrations', `${item.name}: ${success ? 'passed' : 'failed — integration disabled'}`);
    return { success, message: success ? `Successfully connected to ${item.name}` : `${item.name} is disabled` };
  },

  async getAuditLogs(filters?: { query?: string; user?: string; from?: string; to?: string }): Promise<AuditLogEntry[]> {
    await delay();
    let logs = load<AuditLogEntry[]>(KEYS.auditLogs, SEED_AUDIT_LOGS);
    if (filters?.query) {
      const q = filters.query.toLowerCase();
      logs = logs.filter(l => l.action.toLowerCase().includes(q) || l.details.toLowerCase().includes(q) || l.module.toLowerCase().includes(q));
    }
    if (filters?.user) logs = logs.filter(l => l.user.includes(filters.user!));
    return logs;
  },

  async getWorkflows(): Promise<WorkflowDefinition[]> {
    await delay();
    return load(KEYS.workflows, SEED_WORKFLOWS);
  },

  async saveWorkflow(workflow: Omit<WorkflowDefinition, 'id' | 'updatedAt'> & { id?: string }): Promise<WorkflowDefinition> {
    await delay();
    const items = load<WorkflowDefinition[]>(KEYS.workflows, SEED_WORKFLOWS);
    if (workflow.id) {
      const idx = items.findIndex(w => w.id === workflow.id);
      if (idx >= 0) {
        items[idx] = { ...items[idx], ...workflow, updatedAt: new Date().toISOString().slice(0, 10) };
        save(KEYS.workflows, items);
        appendAuditLog('Workflow Updated', 'Workflow Engine', `Updated workflow "${items[idx].name}"`);
        return items[idx];
      }
    }
    const created: WorkflowDefinition = {
      ...workflow,
      id: `wf${Date.now()}`,
      updatedAt: new Date().toISOString().slice(0, 10),
    } as WorkflowDefinition;
    items.unshift(created);
    save(KEYS.workflows, items);
    appendAuditLog('Workflow Created', 'Workflow Engine', `Created workflow "${created.name}"`);
    return created;
  },

  async getReports(): Promise<ReportDefinition[]> {
    await delay();
    return load(KEYS.reports, SEED_REPORTS);
  },

  async getNotifications(): Promise<NotificationTemplate[]> {
    await delay();
    return load(KEYS.notifications, SEED_NOTIFICATIONS);
  },

  async updateNotification(id: string, data: Partial<NotificationTemplate>): Promise<NotificationTemplate> {
    await delay();
    const items = load<NotificationTemplate[]>(KEYS.notifications, SEED_NOTIFICATIONS);
    const idx = items.findIndex(n => n.id === id);
    if (idx < 0) throw new Error('Template not found');
    items[idx] = { ...items[idx], ...data };
    save(KEYS.notifications, items);
    appendAuditLog('Notification Change', 'Settings', `Updated template "${items[idx].name}"`);
    return items[idx];
  },

  async getPermissions(): Promise<Record<string, Record<string, boolean>>> {
    await delay();
    return load(KEYS.permissions, defaultPermissions());
  },

  async savePermissions(matrix: Record<string, Record<string, boolean>>): Promise<void> {
    await delay();
    save(KEYS.permissions, matrix);
    appendAuditLog('Permission Change', 'RBAC', 'Permission matrix configuration saved', 'warning');
  },

  async getInAppNotifications(role?: string): Promise<InAppNotification[]> {
    await delay();
    const all = load<InAppNotification[]>(KEYS.inAppNotifications, SEED_IN_APP_NOTIFICATIONS);
    if (!role || role === 'Compliance Admin') return all;
    return all.filter(n => n.role.toLowerCase() === role.toLowerCase() || n.role.toLowerCase() === 'all');
  },

  async markInAppNotificationRead(id: string): Promise<void> {
    await delay();
    const all = load<InAppNotification[]>(KEYS.inAppNotifications, SEED_IN_APP_NOTIFICATIONS);
    const item = all.find(n => n.id === id);
    if (item) {
      item.read = true;
      save(KEYS.inAppNotifications, all);
    }
  },

  async clearAllInAppNotifications(role?: string): Promise<void> {
    await delay();
    let all = load<InAppNotification[]>(KEYS.inAppNotifications, SEED_IN_APP_NOTIFICATIONS);
    if (!role || role === 'Compliance Admin') {
      all = [];
    } else {
      all = all.filter(n => n.role.toLowerCase() !== role.toLowerCase() && n.role.toLowerCase() !== 'all');
    }
    save(KEYS.inAppNotifications, all);
  },

  async addInAppNotification(n: Omit<InAppNotification, 'id' | 'timestamp' | 'read'>): Promise<InAppNotification> {
    await delay();
    const all = load<InAppNotification[]>(KEYS.inAppNotifications, SEED_IN_APP_NOTIFICATIONS);
    const created: InAppNotification = {
      ...n,
      id: `ian${Date.now()}`,
      timestamp: 'Just now',
      read: false,
    };
    all.unshift(created);
    save(KEYS.inAppNotifications, all);
    return created;
  },

  parseIso42001File(_file: File): Promise<{ code: string; title: string; category: string; domain: string; owner: string }[]> {
    return new Promise(resolve => {
      setTimeout(() => {
        resolve([
          { code: 'A.1.1', title: 'AI Governance Policy', category: 'Governance', domain: 'Organizational', owner: 'Compliance Admin' },
          { code: 'A.1.2', title: 'Roles and Responsibilities', category: 'Governance', domain: 'Organizational', owner: 'Control Lead' },
          { code: 'A.2.1', title: 'Risk Assessment Framework', category: 'Risk Management', domain: 'Risk Lifecycle', owner: 'Control Owner' },
          { code: 'A.2.2', title: 'AI System Impact Assessment', category: 'Risk Management', domain: 'Risk Lifecycle', owner: 'Control Owner' },
          { code: 'A.3.1', title: 'Data Quality & Bias Mitigation', category: 'Technical Controls', domain: 'System Integrity', owner: 'Control Lead' },
          { code: 'A.4.1', title: 'Transparency & Explainability', category: 'Technical Controls', domain: 'AI Lifecycle', owner: 'Control Owner' },
          { code: 'A.5.1', title: 'Monitoring & Continuous Improvement', category: 'Operations', domain: 'Monitoring', owner: 'Compliance Admin' },
        ]);
      }, 1200);
    });
  },

  // --- New Module Mocks ---
  async getControls(): Promise<any[]> {
    await delay();
    return [
      { id: 'CTL-001', name: 'Data Classification Policy', category: 'Governance', framework: 'ISO 27001', owner: 'Alex Morgan', status: 'compliant', effectiveness: 'High', nextReview: '2026-12-01' },
      { id: 'CTL-002', name: 'AI Bias Assessment', category: 'Risk', framework: 'ISO 42001', owner: 'Jordan Lee', status: 'partial', effectiveness: 'Medium', nextReview: '2026-08-15' },
      { id: 'CTL-003', name: 'Vendor Security Review', category: 'Third-Party', framework: 'SOC 2', owner: 'Sam Rivera', status: 'non-compliant', effectiveness: 'Low', nextReview: '2026-07-01' },
    ];
  },
  
  async getAISystems(): Promise<any[]> {
    await delay();
    return [
      { id: 'AI-100', name: 'Customer Support Chatbot', riskLevel: 'High', stage: 'Production', owner: 'Support Team', lastAssessed: '2026-05-20' },
      { id: 'AI-101', name: 'Resume Screening Tool', riskLevel: 'Critical', stage: 'Development', owner: 'HR Dept', lastAssessed: '2026-06-10' },
      { id: 'AI-102', name: 'Internal Knowledge Search', riskLevel: 'Low', stage: 'Production', owner: 'IT Dept', lastAssessed: '2026-01-15' },
    ];
  },

  async getRisks(): Promise<any[]> {
    await delay();
    return [
      { id: 'RSK-01', name: 'Unauthorized Model Access', dept: 'Engineering', owner: 'Jordan Lee', inherent: 'Critical', residual: 'Medium', status: 'mitigated' },
      { id: 'RSK-02', name: 'Training Data Poisoning', dept: 'Data Science', owner: 'Alex Morgan', inherent: 'High', residual: 'High', status: 'open' },
    ];
  },
  
  async getPolicies(): Promise<any[]> {
    await delay();
    return [
      { id: 'POL-01', name: 'Acceptable AI Use Policy', status: 'Approved', version: '2.1', owner: 'Legal', expiry: '2027-01-01' },
      { id: 'POL-02', name: 'Data Retention Policy', status: 'Under Review', version: '1.4', owner: 'Compliance', expiry: '2026-08-01' },
      { id: 'POL-03', name: 'Third-Party Risk Management', status: 'Draft', version: '1.0', owner: 'Risk', expiry: '-' },
    ];
  }
};
