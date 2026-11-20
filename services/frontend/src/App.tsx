import { useState, useEffect, useRef } from 'react';
import { logout, getUser, getRoleLabel, isLoggedIn, isComplianceAdmin, getActiveRole, setActiveRole } from '@/lib/auth';
import { initTheme } from '@/lib/theme';
import { PRODUCT_NAME } from '@/lib/branding';
import LoginPage from '@/components/Login';
import Shell from '@/components/Shell';
import ToastContainer, { toast } from '@/components/Toast';
import { LoadingSpinner } from '@/components/ui';
import { IconLogout, IconUser, IconBell } from '@/components/Icons';
import ComplianceAdminPortal from '@/components/portal/ComplianceAdminPortal';
import { complianceAdminApi, ASSIGNABLE_ROLES, InAppNotification } from '@/lib/mock/complianceAdminApi';

// Lazy page imports
import Dashboard         from '@/components/Dashboard';
import UserManagement    from '@/components/UserManagement';
import Settings          from '@/components/Settings';
import Workflows         from '@/components/Workflows';
import Auditor           from '@/components/Auditor';
import Reviewer          from '@/components/Reviewer';
import Controls          from '@/components/Controls';
import Evidence          from '@/components/Evidence';
import Findings          from '@/components/Findings';
import Policies          from '@/components/Policies';
import Frameworks        from '@/components/Frameworks';
import ControlLibrary    from '@/components/ControlLibrary';
import Reports           from '@/components/Reports';
import Integrations      from '@/components/Integrations';
import Personnel         from '@/components/Personnel';
import Vendors           from '@/components/Vendors';
import FAQ               from '@/components/FAQ';
const DEFAULT_PAGE = 'admin-dashboard';

interface TopBarProps {
  setPage: (p: string) => void;
  activeRole: string;
  setActiveRole: (r: string) => void;
}

function TopBar({ setPage, activeRole, setActiveRole }: TopBarProps) {
  const [showProfile, setShowProfile] = useState(false);
  const [showNotif, setShowNotif] = useState(false);
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  
  const profileRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const user = getUser();

  const loadNotifications = () => {
    complianceAdminApi.getInAppNotifications(activeRole).then(setNotifications);
  };

  useEffect(() => {
    loadNotifications();
  }, [activeRole]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setShowProfile(false);
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotif(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = () => {
    logout();
    window.location.reload();
  };

  const handleAction = async (notif: InAppNotification) => {
    await complianceAdminApi.markInAppNotificationRead(notif.id);
    toast.success(`Action taken: "${notif.actionLabel}" successfully processed via workflow!`);
    loadNotifications();
    setShowNotif(false);
  };

  const clearAll = async () => {
    await complianceAdminApi.clearAllInAppNotifications(activeRole);
    toast.info('Notifications cleared');
    loadNotifications();
  };

  const simulateEvent = async () => {
    let nData: Omit<InAppNotification, 'id' | 'timestamp' | 'read'>;
    if (activeRole === 'Compliance Admin') {
      nData = {
        title: 'Evidence Review Required',
        message: 'Jordan Lee submitted ISO 42001 governance evidence for control A.1.2.',
        role: 'Compliance Admin',
        actionLabel: 'Review Evidence',
        actionType: 'review'
      };
      toast.success('📧 Mock Email alert sent to complianceadmin@clovrix.local & In-app alert created');
    } else if (activeRole === 'Control Lead') {
      nData = {
        title: 'Action Required: SLA Escalation',
        message: 'Control A.3.1 compliance review is past the SLA deadline.',
        role: 'Control Lead',
        actionLabel: 'Upload Evidence',
        actionType: 'upload'
      };
      toast.success('📧 Mock Email notification sent to lead@clovrix.local');
    } else if (activeRole === 'Control Owner') {
      nData = {
        title: 'Control Assignment Alert',
        message: 'You have been assigned to upload data quality logs for control A.2.2.',
        role: 'Control Owner',
        actionLabel: 'View Task',
        actionType: 'view'
      };
      toast.success('📧 Assignment email reminder sent to owner@clovrix.local');
    } else if (activeRole === 'Lead Auditor') {
      nData = {
        title: 'Audit Stage Approval Needed',
        message: 'ISO 27001 readiness score has reached 89%. Approval required to freeze controls.',
        role: 'Lead Auditor',
        actionLabel: 'Approve Audit',
        actionType: 'audit'
      };
      toast.success('📧 Framework freeze email approval sent to auditor@clovrix.local');
    } else {
      nData = {
        title: 'Global GRC Platform Update',
        message: 'A brand-new GRC Framework Trend Report has been generated.',
        role: 'all',
        actionLabel: 'View Dashboard',
        actionType: 'dashboard'
      };
      toast.success('📢 Global platform notice broadcasted to all roles');
    }
    
    await complianceAdminApi.addInAppNotification(nData);
    loadNotifications();
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div style={{
      height: 54, background: 'var(--c-topbar)',
      borderBottom: '1px solid var(--c-border)',
      display: 'flex', alignItems: 'center', padding: '0 18px', gap: 14,
      position: 'sticky', top: 0, zIndex: 100, fontFamily: 'Inter,system-ui,sans-serif',
      boxShadow: '0 1px 3px rgba(0,0,0,.05)',
    }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-text)' }}>{activeRole} Portal</div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
        {/* Role Switcher Context Selector */}
        {isComplianceAdmin() && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--c-text3)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
              View Portal As:
            </span>
            <select 
              value={activeRole} 
              onChange={e => {
                setActiveRole(e.target.value);
                toast.info(`Switched view context to: ${e.target.value}`);
              }}
              style={{
                background: 'var(--c-bg3)',
                border: '1px solid var(--c-border)',
                borderRadius: 8,
                padding: '4px 8px',
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--c-accent)',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              {ASSIGNABLE_ROLES.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
        )}

        {/* Notifications Dropdown */}
        <div ref={notifRef} style={{ position: 'relative' }}>
          <button 
            onClick={() => setShowNotif(n => !n)} 
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 32, height: 32, borderRadius: 8,
              background: showNotif ? 'var(--c-border2)' : 'var(--c-bg3)', 
              border: '1px solid var(--c-border)',
              cursor: 'pointer', position: 'relative', transition: 'background-color 0.15s'
            }}
          >
            <IconBell size={16} color="var(--c-text2)" />
            {unreadCount > 0 && (
              <div style={{
                position: 'absolute', top: -3, right: -3,
                background: 'var(--c-red)', color: '#fff', fontSize: 9,
                fontWeight: 700, borderRadius: '50%', minWidth: 16, height: 16,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '0 4px', border: '2px solid var(--c-topbar)'
              }}>
                {unreadCount}
              </div>
            )}
          </button>

          {showNotif && (
            <div style={{
              position: 'absolute', right: 0, top: 'calc(100% + 6px)',
              background: 'var(--c-bg2)', border: '1px solid var(--c-border2)',
              borderRadius: 12, padding: 12, boxShadow: '0 12px 40px rgba(0,0,0,.25)',
              zIndex: 500, width: 340, display: 'flex', flexDirection: 'column', gap: 10
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--c-border)', paddingBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-text)' }}>In-App Notifications</span>
                {notifications.length > 0 && (
                  <button onClick={clearAll} style={{ background: 'none', border: 'none', color: 'var(--c-accent)', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>
                    Clear All
                  </button>
                )}
              </div>

              <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {notifications.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px 0', fontSize: 11, color: 'var(--c-text3)' }}>
                    No pending notifications for this role.
                  </div>
                ) : (
                  notifications.map(notif => (
                    <div key={notif.id} style={{
                      padding: 10, background: notif.read ? 'transparent' : 'var(--c-bg3)',
                      borderRadius: 8, border: `1px solid ${notif.read ? 'var(--c-border)' : 'rgba(0,86,179,0.15)'}`,
                      display: 'flex', flexDirection: 'column', gap: 6
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-text)' }}>{notif.title}</span>
                        <span style={{ fontSize: 10, color: 'var(--c-text3)' }}>{notif.timestamp}</span>
                      </div>
                      <p style={{ fontSize: 11, color: 'var(--c-text2)', margin: 0, lineHeight: 1.4 }}>{notif.message}</p>
                      
                      {!notif.read && notif.actionLabel && (
                        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                          <button 
                            onClick={() => handleAction(notif)}
                            style={{
                              background: 'var(--c-accent)', color: '#fff', border: 'none',
                              borderRadius: 6, padding: '4px 10px', fontSize: 10, fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            {notif.actionLabel}
                          </button>
                          <button 
                            onClick={async () => {
                              await complianceAdminApi.markInAppNotificationRead(notif.id);
                              loadNotifications();
                            }}
                            style={{
                              background: 'transparent', color: 'var(--c-text3)', border: '1px solid var(--c-border2)',
                              borderRadius: 6, padding: '4px 10px', fontSize: 10, fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            Dismiss
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              <div style={{ borderTop: '1px solid var(--c-border)', paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 10, color: 'var(--c-text3)' }}>Role: {activeRole}</span>
                <button 
                  onClick={simulateEvent}
                  style={{
                    background: 'var(--c-bg3)', border: '1px solid var(--c-border2)',
                    borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 600,
                    color: 'var(--c-text)', cursor: 'pointer'
                  }}
                >
                  ⚡ Trigger Simulated Event
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Profile Dropdown */}
        <div ref={profileRef} style={{ position: 'relative' }}>
          <button onClick={() => setShowProfile(p => !p)} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'var(--c-bg3)', border: '1px solid var(--c-border)',
            borderRadius: 8, padding: '5px 10px 5px 6px', cursor: 'pointer',
          }}>
            <div style={{
              width: 26, height: 26, borderRadius: '50%',
              background: 'linear-gradient(135deg,var(--c-accent),var(--c-accent2))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, color: 'white',
            }}>
              {user?.name?.[0]?.toUpperCase() || 'C'}
            </div>
            <span style={{ fontSize: 13, color: 'var(--c-text)', fontWeight: 500 }}>{user?.name?.split(' ')[0] || 'Admin'}</span>
          </button>

          {showProfile && (
            <div style={{
              position: 'absolute', right: 0, top: 'calc(100% + 6px)',
              background: 'var(--c-bg2)', border: '1px solid var(--c-border2)',
              borderRadius: 12, padding: 6, boxShadow: '0 8px 32px rgba(0,0,0,.15)',
              zIndex: 500, width: 220,
            }}>
              <div style={{ padding: '10px 12px 8px', borderBottom: '1px solid var(--c-border)', marginBottom: 4 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text)' }}>{user?.name}</div>
                <div style={{ fontSize: 11, color: 'var(--c-text3)', marginTop: 1 }}>{user?.email}</div>
                <div style={{ fontSize: 10, color: 'var(--c-accent)', marginTop: 2, fontWeight: 600, textTransform: 'uppercase' }}>{getRoleLabel()}</div>
              </div>
              <button onClick={() => { setPage('admin-settings'); setShowProfile(false); }} style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                padding: '9px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: 'none', color: 'var(--c-text2)', fontSize: 13,
              }}>
                <IconUser size={15} color="var(--c-text3)" />
                Settings
              </button>
              <button onClick={handleLogout} style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                padding: '9px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: 'none', color: 'var(--c-red)', fontSize: 13,
              }}>
                <IconLogout size={15} color="var(--c-red)" />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [score, setScore] = useState<number | undefined>(undefined);
  
  const getDefaultPage = () => {
    return 'admin-dashboard';
  };
  
  const [page, setPage] = useState(getDefaultPage());
  const [activeRole, setActiveRoleState] = useState(getActiveRole());

  useEffect(() => {
    initTheme();
    const loggedIn = isLoggedIn();
    setAuthed(loggedIn);

    const onUnauth = () => setAuthed(false);
    const onNav = (e: Event) => setPage((e as CustomEvent).detail as string);
    const onRoleChange = (e: Event) => setActiveRoleState((e as CustomEvent).detail as string);
    
    window.addEventListener('clovrix:unauthorized', onUnauth);
    window.addEventListener('clovrix:navigate', onNav);
    window.addEventListener('clovrix:role_changed', onRoleChange);
    
    return () => {
      window.removeEventListener('clovrix:unauthorized', onUnauth);
      window.removeEventListener('clovrix:navigate', onNav);
      window.removeEventListener('clovrix:role_changed', onRoleChange);
    };
  }, []);

  if (authed === null) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--c-bg)' }}>
        <LoadingSpinner />
      </div>
    );
  }

  const handleLogin = () => {
    setAuthed(true);
    const derivedRole = getActiveRole();
    if (!isComplianceAdmin()) {
      setActiveRole(derivedRole);
      setActiveRoleState(derivedRole);
    }
    // Redirect Reviewer directly to their dashboard
    if (derivedRole === 'Reviewer') {
      setPage('reviewer-dashboard');
    } else {
      setPage(getDefaultPage());
    }
  };

  if (!authed) {
    return (
      <>
        <LoginPage onLogin={handleLogin} />
        <ToastContainer />
      </>
    );
  }

  const renderPage = () => {
    return <ComplianceAdminPortal page={page} activeRole={activeRole} setPage={setPage} />;
  };

  return (
    <>
      <div style={{ display: 'flex', height: '100vh', background: 'var(--c-bg)', overflow: 'hidden' }}>
        <Shell page={page} setPage={setPage} activeRole={activeRole} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
          <TopBar setPage={setPage} activeRole={activeRole} setActiveRole={setActiveRoleState} />
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {renderPage()}
          </div>
        </div>
      </div>
      <ToastContainer />
    </>
  );
}
