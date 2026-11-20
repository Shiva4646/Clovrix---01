import { useState, useEffect } from 'react';
import { logout, getUser, getRoleLabel } from '@/lib/auth';
import { PRODUCT_NAME } from '@/lib/branding';
import { initTheme } from '@/lib/theme';
import { NAV_ICONS, IconClovrix, IconLogout } from './Icons';
import { getStoredPermissions } from '@/lib/mock/complianceAdminApi';

const NAV_ALL = [
  { group:'OVERVIEW', items:[
    { id:'dashboard',  label:'Dashboard',              roles: null, icon: 'dashboard' },
  ]},
  { group:'GOVERNANCE', items:[
    { id:'operations', label:'AI Operational Controls', roles: null, icon: 'dashboard' },
    { id:'policies',   label:'Policy Management',       roles: null, icon: 'dashboard' },
  ]},
  { group:'COMPLIANCE', items:[
    { id:'workflows',     label:'Audit Tracking',        roles: null, icon: 'workflows' },
    { id:'auditor',       label:'Auditor Workflow',      roles: null, icon: 'dashboard' },
    { id:'reviewer',      label:'Reviewer Workspace',    roles: ['reviewer'], icon: 'dashboard' },
    { id:'findings',      label:'Audit Findings',        roles: null, icon: 'dashboard' },
    { id:'reports',       label:'Compliance Reports',    roles: null, icon: 'reports' },
    { id:'frameworks',    label:'Framework Mapping',     roles: null, icon: 'dashboard' },
    { id:'controllibrary',label:'Control Library',       roles: null, icon: 'dashboard' },
  ]},
  { group:'OPERATIONS', items:[
    { id:'users',      label:'User Management',         roles: null, icon: 'users' },
    { id:'settings',   label:'Settings',                roles: null, icon: 'settings' },
  ]},
  { group:'SYSTEM', items:[
    { id:'faq',        label:'Help & FAQ',              roles: null, icon: 'dashboard' },
  ]},
];

const COMPLIANCE_ADMIN_NAV = [
  { group: 'OVERVIEW', items: [
    { id: 'admin-dashboard', label: 'Dashboard', icon: 'dashboard' },
  ]},
  { group: 'GOVERNANCE', items: [
    { id: 'admin-ai-system-registry', label: 'AI System Registry', icon: 'dashboard' },
    { id: 'admin-control-library', label: 'Control Library', icon: 'dashboard' },
    { id: 'admin-policy-management', label: 'Policy Management', icon: 'dashboard' },
    { id: 'admin-aiia', label: 'AI Impact Assessment', icon: 'dashboard' },
    { id: 'admin-soa', label: 'Statement of Applicability', icon: 'dashboard' },
  ]},
  { group: 'RISK & COMPLIANCE', items: [
    { id: 'admin-risk-register', label: 'Risk Register', icon: 'dashboard' },
    { id: 'admin-vendor-risk', label: 'Vendor Risk', icon: 'dashboard' },
    { id: 'admin-security-questionnaires', label: 'Security Questionnaires', icon: 'dashboard' },
  ]},
  { group: 'AUDIT & FINDINGS', items: [
    { id: 'admin-audits', label: 'Audits', icon: 'workflows' },
    { id: 'admin-audit-workflows', label: 'Audit Workflows', icon: 'workflows' },
    { id: 'admin-findings', label: 'Findings', icon: 'dashboard' },
    { id: 'admin-remediations', label: 'Remediations', icon: 'dashboard' },
    { id: 'admin-evidence-manager', label: 'Evidence Manager', icon: 'dashboard' },
  ]},
  { group: 'PEOPLE & TRUST', items: [
    { id: 'admin-personnel', label: 'Personnel', icon: 'users' },
    { id: 'admin-trust-center', label: 'Trust Center', icon: 'dashboard' },
  ]},
  { group: 'USER MANAGEMENT', items: [
    { id: 'admin-users', label: 'Users', icon: 'users' },
    { id: 'admin-roles', label: 'Roles & Permissions', icon: 'roles' },
  ]},
  { group: 'FRAMEWORK MANAGEMENT', items: [
    { id: 'admin-framework-management', label: 'Framework Management', icon: 'workflows' },
    { id: 'admin-import', label: 'Framework Import', icon: 'import' },
    { id: 'admin-history', label: 'Import History', icon: 'history' },
  ]},
  { group: 'CONTROL LEAD WORKSPACE', items: [
    { id: 'assigned-controls', label: 'Assigned Controls', icon: 'dashboard' },
  ]},
  { group: 'ASSESSOR WORKSPACE', items: [
    { id: 'assessor-testing', label: 'Control Testing', icon: 'audit' },
  ]},
  { group: 'REVIEWER WORKSPACE', items: [
    { id: 'reviewer-dashboard', label: 'Dashboard', icon: 'dashboard' },
    { id: 'assessment-review', label: 'Assessment Review', icon: 'audit' },
    { id: 'admin-evidence-manager', label: 'Evidence Review', icon: 'audit' },
    { id: 'findings-review', label: 'Findings', icon: 'findings' },
    { id: 'soa-approval', label: 'Statement of Applicability', icon: 'dashboard' },
    { id: 'admin-reports', label: 'Reports', icon: 'reports' },
    { id: 'approval-queue', label: 'Approval Queue', icon: 'dashboard' },
    { id: 'qa-review', label: 'QA Review Reports', icon: 'reports' },
  ]},
  { group: 'ADMIN SYSTEM', items: [
    { id: 'admin-integrations', label: 'Integrations', icon: 'integrations' },
    { id: 'admin-settings', label: 'Settings', icon: 'settings' },
  ]},
];


interface ShellProps {
  page: string;
  setPage: (p: string) => void;
  activeRole: string;
}

export default function Shell({ page, setPage, activeRole }: ShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const user = getUser();
  const sideW = collapsed ? 52 : 240;

  useEffect(() => { initTheme(); }, []);

  const matrix = getStoredPermissions();
  const rolePerms = matrix[activeRole] || {};

  // Role-specific workspaces are NOT shown in the Compliance Admin's own sidebar.
  // They appear only when the admin switches context via the top-right
  // "View Portal As" selector (which changes activeRole to that role).
  const WORKSPACE_GROUPS = ['CONTROL LEAD WORKSPACE', 'ASSESSOR WORKSPACE', 'REVIEWER WORKSPACE'];

  // ── Compliance Admin: show FULL navigation except the role workspaces ──────
  const combinedNav = COMPLIANCE_ADMIN_NAV.map(group => {
    if (activeRole === 'Compliance Admin')
      return WORKSPACE_GROUPS.includes(group.group) ? { ...group, items: [] } : group;

    const items = group.items.filter(item => {
      let modKey = '';
      if (item.id === 'admin-dashboard') modKey = 'dashboard';
      else if (item.id === 'admin-ai-system-registry') modKey = 'governance';
      else if (item.id === 'admin-control-library') modKey = 'governance';
      else if (item.id === 'admin-policy-management') modKey = 'governance';
      else if (item.id === 'admin-aiia') modKey = 'governance';
      else if (item.id === 'admin-soa') modKey = 'governance';
      else if (item.id === 'admin-risk-register') modKey = 'risk';
      else if (item.id === 'admin-vendor-risk') modKey = 'risk';
      else if (item.id === 'admin-security-questionnaires') modKey = 'risk';
      else if (item.id === 'admin-audit-workflows') modKey = 'workflows';
      else if (item.id === 'admin-findings') modKey = 'audit';
      else if (item.id === 'admin-remediations') modKey = 'audit';
      else if (item.id === 'admin-evidence-manager') modKey = 'audit';
      else if (item.id === 'admin-personnel') modKey = 'users';
      else if (item.id === 'admin-trust-center') modKey = 'settings';
      else if (item.id === 'admin-users') modKey = 'users';
      else if (item.id === 'admin-roles') modKey = 'roles';
      else if (item.id === 'admin-import' || item.id === 'admin-history') modKey = 'frameworks';
      else if (item.id === 'admin-integrations') modKey = 'integrations';
      else if (item.id === 'admin-reports') modKey = 'reports';
      else if (item.id === 'admin-settings') modKey = 'settings';
      else if (item.id === 'admin-audit-logs') modKey = 'audit';
      
      if (activeRole === 'Lead Auditor') {
        const auditorAllowedPages = [
          'admin-dashboard', 'admin-ai-system-registry', 'admin-control-library',
          'admin-policy-management', 'admin-soa', 'admin-risk-register',
          'admin-vendor-risk', 'admin-security-questionnaires', 'admin-audit-workflows',
          'admin-findings', 'admin-remediations', 'admin-evidence-manager',
          'admin-personnel', 'admin-trust-center', 'admin-reports',
          'admin-audits',
        ];
        if (!auditorAllowedPages.includes(item.id)) return false;
      } else if (activeRole === 'Control Lead') {
        const controlLeadAllowedPages = [
          'assigned-controls',
          'admin-dashboard', 'admin-ai-system-registry', 'admin-control-library',
          'admin-evidence-manager', 'admin-remediations', 'admin-security-questionnaires',
          'admin-policy-management', 'admin-risk-register', 'admin-audit-workflows',
          'admin-findings', 'admin-reports',
        ];
        if (!controlLeadAllowedPages.includes(item.id)) return false;
      } else if (activeRole === 'Risk Owner') {
        const riskOwnerAllowedPages = [
          'admin-dashboard', 'admin-risk-register', 'admin-vendor-risk',
          'admin-findings', 'admin-remediations', 'admin-reports', 'admin-soa',
        ];
        if (!riskOwnerAllowedPages.includes(item.id)) return false;
      } else if (activeRole === 'Assessor') {
        const assessorAllowedPages = [
          'assessor-testing',
          'admin-dashboard', 'admin-findings', 'admin-risk-register',
          'admin-audit-workflows', 'admin-evidence-manager', 'admin-security-questionnaires',
          'admin-soa', 'admin-ai-system-registry', 'admin-control-library',
          'admin-policy-management', 'admin-remediations', 'admin-reports',
        ];
        if (!assessorAllowedPages.includes(item.id)) return false;
      } else if (activeRole === 'Reviewer') {
        const reviewerAllowedPages = [
          'admin-dashboard', 'admin-audit-workflows', 'admin-findings',
          'admin-evidence-manager', 'admin-reports', 'admin-soa',
          'admin-remediations', 'admin-risk-register',
          'reviewer-dashboard', 'findings-review', 'soa-approval', 'approval-queue', 'qa-review',
          'assessment-review',
        ];
        if (!reviewerAllowedPages.includes(item.id)) return false;
      }

      if (!modKey) return true;
      return rolePerms[`${modKey}-view`] ?? false;
    });
    return { ...group, items };
  }).filter(group => group.items.length > 0);

  return (
    <div style={{
      width: sideW, flexShrink: 0, background: 'var(--c-sidebar)',
      borderRight: '1px solid var(--c-border)', display: 'flex', flexDirection: 'column',
      height: '100vh', position: 'sticky', top: 0, overflow: 'hidden',
      transition: 'width .2s ease', zIndex: 50,
    }}>
      <div style={{
        padding: collapsed ? '12px 10px' : '12px 14px',
        borderBottom: '1px solid var(--c-border)',
        display: 'flex', alignItems: 'center', gap: 10, minHeight: 54,
      }}>
        <div style={{
          width: collapsed ? 32 : 40, height: collapsed ? 32 : 40, borderRadius: 8, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <img src="/assets/clovrix-logo.jpg" alt={PRODUCT_NAME} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </div>
        {!collapsed && (
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--c-accent)', letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>
              {PRODUCT_NAME}
            </div>
            <div style={{ fontSize: 9, color: 'var(--c-text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 2 }}>
              {activeRole}
            </div>
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: collapsed ? '8px 6px' : '8px 10px' }}>
        {combinedNav.map(group => (
          <div key={group.group} style={{ marginBottom: 4 }}>
            {!collapsed && (
              <div style={{
                fontSize: 10, fontWeight: 700, color: 'var(--c-text3)',
                letterSpacing: '0.08em', padding: '10px 8px 4px', textTransform: 'uppercase',
              }}>
                {group.group}
              </div>
            )}
            {group.items.map(item => {
              const active = page === item.id;
              const IconComp = (NAV_ICONS as any)[item.icon] || NAV_ICONS.dashboard;
              return (
                <button key={item.id} onClick={() => setPage(item.id)} title={collapsed ? item.label : undefined}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 9, width: '100%',
                    padding: collapsed ? '9px 0' : '8px 10px',
                    borderRadius: 8, border: 'none', cursor: 'pointer',
                    background: active ? 'rgba(0,86,179,.1)' : 'transparent',
                    color: active ? 'var(--c-accent)' : 'var(--c-text2)',
                    fontSize: 13, fontWeight: active ? 600 : 400,
                    textAlign: 'left', marginBottom: 1, transition: 'all .12s',
                    justifyContent: collapsed ? 'center' : 'flex-start',
                  }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--c-bg3)'; }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                >
                  {IconComp && <IconComp size={15} color={active ? 'var(--c-accent)' : 'var(--c-text3)'} />}
                  {!collapsed && <span style={{ whiteSpace: 'nowrap' }}>{item.label}</span>}
                  {active && !collapsed && (
                    <div style={{ marginLeft: 'auto', width: 3, height: 14, background: 'var(--c-accent)', borderRadius: 2 }} />
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {!collapsed && user && (
        <div style={{ padding: '12px 14px', borderTop: '1px solid var(--c-border)', margin: '0 8px 8px' }}>
          <div style={{ fontSize: 10, color: 'var(--c-text3)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
            Signed in as
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text)' }}>{user.name}</div>
          <div style={{ fontSize: 11, color: 'var(--c-accent)', marginTop: 2 }}>{getRoleLabel()}</div>
        </div>
      )}

      <div style={{ padding: '0 10px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button onClick={() => setCollapsed(p => !p)} style={{
          padding: '7px', borderRadius: 8, border: 'none',
          cursor: 'pointer', background: 'var(--c-bg3)', color: 'var(--c-text3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            {collapsed ? <polyline points="9 18 15 12 9 6" /> : <polyline points="15 18 9 12 15 6" />}
          </svg>
        </button>
        {!collapsed && (
          <button onClick={() => { logout(); window.location.reload(); }} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8,
            border: 'none', cursor: 'pointer', background: 'none', color: 'var(--c-red)', fontSize: 12,
          }}>
            <IconLogout size={14} color="var(--c-red)" />
            Sign Out
          </button>
        )}
      </div>
    </div>
  );
}
