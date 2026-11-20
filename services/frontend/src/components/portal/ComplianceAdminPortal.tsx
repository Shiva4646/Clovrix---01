import DashboardPage from './DashboardPage';
import UsersPage from './UsersPage';
import RolesPage from './RolesPage';
import FrameworkImportPage from './FrameworkImportPage';
import ImportHistoryPage from './ImportHistoryPage';
import IntegrationsPage from './IntegrationsPage';
import WorkflowsPage from './WorkflowsPage';
import ReportsPage from './ReportsPage';
import SettingsPage from './SettingsPage';
import AISystemRegistryPage from './AISystemRegistryPage';
import ControlLibraryPage from './ControlLibraryPage';
import PolicyManagementPage from './PolicyManagementPage';
import EvidenceManagerPage from './EvidenceManagerPage';
import RiskRegisterPage from './RiskRegisterPage';
import AuditWorkflowsPage from './AuditWorkflowsPage';
import FindingsPage from './FindingsPage';
import RemediationsPage from './RemediationsPage';
import VendorRiskPage from './VendorRiskPage';
import QuestionnairesPage from './QuestionnairesPage';
import SoAPage from './SoAPage';
import PersonnelPage from './PersonnelPage';
import TrustCenterPage from './TrustCenterPage';
import AIIAPage from './AIIAPage';
import FrameworkManagementPage from './FrameworkManagementPage';
import AssignedControlsPage from './AssignedControlsPage';
import AssessorTestingPage from './AssessorTestingPage';
import AssessmentReviewPage from './AssessmentReviewPage';
import AuditManagementPage from './AuditManagementPage';

// Reviewer-specific components
import Reviewer from '../Reviewer';          // Full workspace (CX-26..30, RV-001..003)
import ApprovalQueue from '../ApprovalQueue'; // RV-005
import SoAApproval from '../SoAApproval';    // RV-004
import QAReviewReports from '../QAReviewReports'; // RV-006

import { PageWrap, Card } from '../ui';
import { getStoredPermissions } from '@/lib/mock/complianceAdminApi';

interface ComplianceAdminPortalProps {
  page: string;
  activeRole: string;
  setPage?: (p: string) => void;
}

export default function ComplianceAdminPortal({ page, activeRole, setPage }: ComplianceAdminPortalProps) {
  const matrix = getStoredPermissions();
  const rolePerms = matrix[activeRole] || {};

  let modKey = '';
  if (page === 'admin-dashboard') modKey = 'dashboard';
  else if (page === 'admin-ai-system-registry') modKey = 'governance';
  else if (page === 'admin-control-library') modKey = 'governance';
  else if (page === 'admin-policy-management') modKey = 'governance';
  else if (page === 'admin-aiia') modKey = 'governance';
  else if (page === 'admin-soa') modKey = 'governance';
  else if (page === 'admin-risk-register') modKey = 'risk';
  else if (page === 'admin-vendor-risk') modKey = 'risk';
  else if (page === 'admin-security-questionnaires') modKey = 'risk';
  else if (page === 'admin-audit-workflows') modKey = 'workflows';
  else if (page === 'admin-findings') modKey = 'audit';
  else if (page === 'admin-remediations') modKey = 'audit';
  else if (page === 'admin-evidence-manager') modKey = 'audit';
  else if (page === 'admin-personnel') modKey = 'users';
  else if (page === 'admin-trust-center') modKey = 'settings';
  else if (page === 'admin-users') modKey = 'users';
  else if (page === 'admin-roles') modKey = 'roles';
  else if (page === 'admin-import' || page === 'admin-history') modKey = 'frameworks';
  else if (page === 'admin-framework-management') modKey = 'frameworks';
  else if (page === 'admin-integrations') modKey = 'integrations';
  else if (page === 'admin-workflows') modKey = 'workflows';
  else if (page === 'admin-reports') modKey = 'reports';
  else if (page === 'admin-settings') modKey = 'settings';
  else if (page === 'admin-audit-logs') modKey = 'audit';
  // 'assigned-controls' has no modKey — access is governed purely by the
  // role-specific allow-lists below (Control Lead + Compliance Admin).

  // ── Compliance Admin: FULL ACCESS — bypass all permission checks ──────────
  // The Compliance Admin always has access to every page and every action.
  // This is a hard-coded guarantee that cannot be overridden by the permission matrix.
  let hasAccess = activeRole === 'Compliance Admin' || !modKey || (rolePerms[`${modKey}-view`] ?? false);

  if (activeRole === 'Lead Auditor') {
    const auditorAllowedPages = [
      'admin-dashboard', 'admin-ai-system-registry', 'admin-control-library',
      'admin-policy-management', 'admin-soa', 'admin-risk-register',
      'admin-vendor-risk', 'admin-security-questionnaires', 'admin-audit-workflows',
      'admin-findings', 'admin-remediations', 'admin-evidence-manager',
      'admin-personnel', 'admin-trust-center', 'admin-reports',
      'admin-audits',
    ];
    if (!auditorAllowedPages.includes(page)) hasAccess = false;

  } else if (activeRole === 'Control Lead') {
    // Per role-page matrix: 6 edit-scope pages + 5 view-only pages + Assigned Controls
    const controlLeadAllowedPages = [
      'assigned-controls',
      // edit own scope
      'admin-dashboard', 'admin-ai-system-registry', 'admin-control-library',
      'admin-evidence-manager', 'admin-remediations', 'admin-security-questionnaires',
      // view only
      'admin-policy-management', 'admin-risk-register', 'admin-audit-workflows',
      'admin-findings', 'admin-reports',
    ];
    if (!controlLeadAllowedPages.includes(page)) hasAccess = false;

  } else if (activeRole === 'Risk Owner') {
    const riskOwnerAllowedPages = [
      'admin-dashboard', 'admin-risk-register', 'admin-vendor-risk',
      'admin-findings', 'admin-remediations', 'admin-reports', 'admin-soa',
    ];
    if (!riskOwnerAllowedPages.includes(page)) hasAccess = false;

  } else if (activeRole === 'Assessor') {
    // Per role-page matrix: 7 active pages + 5 view-only pages (+ Control Testing)
    const assessorAllowedPages = [
      // active
      'assessor-testing',
      'admin-dashboard', 'admin-findings', 'admin-risk-register',
      'admin-audit-workflows', 'admin-evidence-manager', 'admin-security-questionnaires', 'admin-soa',
      // view only
      'admin-ai-system-registry', 'admin-control-library', 'admin-policy-management',
      'admin-remediations', 'admin-reports',
    ];
    if (!assessorAllowedPages.includes(page)) hasAccess = false;

  } else if (activeRole === 'Reviewer') {
    // Covers: Dashboard, Evidence Review (CX-27), Findings (RV-001..002),
    //         SoA (RV-004), Reports (RV-006), Approval Queue (RV-005), QA Review
    // Per role-page matrix: 8 QA pages (+ dedicated reviewer workspace routes)
    const reviewerAllowedPages = [
      'admin-dashboard',
      'admin-findings',
      'admin-soa',
      'admin-evidence-manager',
      'admin-remediations',
      'admin-audit-workflows',
      'admin-risk-register',
      'admin-reports',
      'reviewer-dashboard',
      'findings-review',
      'soa-approval',
      'approval-queue',
      'qa-review',
      'assessment-review',
    ];
    if (!reviewerAllowedPages.includes(page)) hasAccess = false;
  }

  if (!hasAccess) {
    return (
      <PageWrap title="Access Denied">
        <Card style={{ padding: 48, textAlign: 'center', background: 'var(--c-bg2)', border: '1px solid var(--c-border)' }}>
          <div style={{ fontSize: 54, marginBottom: 20 }}>🔒</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--c-text)', marginBottom: 8 }}>Access Denied</h2>
          <p style={{ color: 'var(--c-text3)', fontSize: 13, maxWidth: 460, margin: '0 auto 24px', lineHeight: 1.5 }}>
            Your role <strong>{activeRole}</strong> does not have permission to view this module.
          </p>
          <div style={{ fontSize: 12, color: 'var(--c-text3)', padding: '12px 18px', background: 'var(--c-bg3)', borderRadius: 8, display: 'inline-block' }}>
            Please select the <strong>Compliance Admin</strong> role from the top-right switcher to restore full administrative access.
          </div>
        </Card>
      </PageWrap>
    );
  }

  switch (page) {
    case 'admin-dashboard':               return <DashboardPage activeRole={activeRole} setPage={setPage} />;
    case 'admin-ai-system-registry':      return <AISystemRegistryPage />;
    case 'admin-control-library':         return <ControlLibraryPage />;
    case 'admin-policy-management':       return <PolicyManagementPage />;
    case 'admin-aiia':                    return <AIIAPage />;
    case 'admin-soa':                     return <SoAPage />;
    case 'admin-risk-register':           return <RiskRegisterPage />;
    case 'admin-vendor-risk':             return <VendorRiskPage />;
    case 'admin-security-questionnaires': return <QuestionnairesPage />;
    case 'admin-audit-workflows':         return <AuditWorkflowsPage />;
    case 'admin-findings':                return <FindingsPage />;
    case 'admin-remediations':            return <RemediationsPage />;
    case 'admin-evidence-manager':        return <EvidenceManagerPage />;
    case 'admin-personnel':               return <PersonnelPage />;
    case 'admin-trust-center':            return <TrustCenterPage />;
    case 'admin-users':                   return <UsersPage />;
    case 'admin-roles':                   return <RolesPage />;
    case 'admin-framework-management':    return <FrameworkManagementPage setPage={setPage} />;
    case 'assigned-controls':             return <AssignedControlsPage />;
    case 'assessor-testing':              return <AssessorTestingPage />;
    case 'assessment-review':             return <AssessmentReviewPage />;
    case 'admin-audits':                  return <AuditManagementPage />;
    case 'admin-import':                  return <FrameworkImportPage />;
    case 'admin-history':                 return <ImportHistoryPage />;
    case 'admin-integrations':            return <IntegrationsPage />;
    case 'admin-workflows':               return <WorkflowsPage />;
    case 'admin-reports':                 return <ReportsPage />;
    case 'admin-settings':                return <SettingsPage />;
    case 'admin-audit-logs':              return <SettingsPage initialTab="audit" />;
    // ── Reviewer-specific routes ──────────────────────────────────────────
    case 'reviewer-dashboard':            return <Reviewer />;          // CX-26..CX-30, RV-001..003
    case 'findings-review':               return <FindingsPage />;      // RV-001, RV-002
    case 'soa-approval':                  return <SoAApproval />;       // RV-004
    case 'approval-queue':                return <ApprovalQueue setPage={setPage} />; // RV-005
    case 'qa-review':                     return <QAReviewReports />;   // RV-006
    default:
      return (
        <PageWrap title="Page Not Found">
          <p style={{ color: 'var(--c-text3)' }}>The requested module could not be found.</p>
        </PageWrap>
      );
  }
}
