import { useEffect, useState } from 'react';
import { PageWrap, Card, Btn, LoadingSpinner, ErrorBanner } from '../ui';
import { toast } from '../Toast';
import { complianceAdminApi, MODULE_PERMISSIONS, ASSIGNABLE_ROLES } from '@/lib/mock/complianceAdminApi';

export default function RolesPage() {
  const [matrix, setMatrix] = useState<Record<string, Record<string, boolean>>>({});
  const [selectedRole, setSelectedRole] = useState(ASSIGNABLE_ROLES[0]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    complianceAdminApi.getPermissions()
      .then(setMatrix)
      .catch(() => setError('Failed to load permissions'))
      .finally(() => setLoading(false));
  }, []);

  // Compliance Admin is a super-admin role — permissions are always fully ON and cannot be changed
  const isComplianceAdminRole = selectedRole === 'Compliance Admin';

  const toggle = (permKey: string) => {
    if (isComplianceAdminRole) return; // locked — cannot restrict Compliance Admin
    setMatrix(prev => ({
      ...prev,
      [selectedRole]: { ...prev[selectedRole], [permKey]: !prev[selectedRole]?.[permKey] },
    }));
  };

  const save = async () => {
    if (isComplianceAdminRole) {
      toast.info('Compliance Admin always has full access — permissions cannot be modified.');
      return;
    }
    setSaving(true);
    try {
      await complianceAdminApi.savePermissions(matrix);
      toast.success('Permission configuration saved');
    } catch {
      toast.error('Failed to save permissions');
    }
    setSaving(false);
  };

  if (loading) return <LoadingSpinner />;

  return (
    <PageWrap title="Role Permission Matrix" subtitle="Page, module, and action-level permissions with RBAC assignment">
      <ErrorBanner msg={error} />

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 20 }}>
        {/* Role list */}
        <Card style={{ padding: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--c-text3)', textTransform: 'uppercase', marginBottom: 10, padding: '0 8px' }}>Roles</div>
          {ASSIGNABLE_ROLES.map(role => (
            <button key={role} onClick={() => setSelectedRole(role)} style={{
              display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px',
              borderRadius: 8, border: 'none', cursor: 'pointer',
              background: selectedRole === role ? 'rgba(0,86,179,0.1)' : 'transparent',
              color: selectedRole === role ? 'var(--c-text)' : 'var(--c-text2)',
              fontWeight: selectedRole === role ? 600 : 400, fontSize: 13, marginBottom: 4,
            }}>
              {role}
              {role === 'Compliance Admin' && (
                <span style={{
                  marginLeft: 6, fontSize: 9, background: 'rgba(0,86,179,0.15)',
                  color: 'var(--c-accent)', padding: '2px 5px', borderRadius: 4,
                  fontWeight: 700, textTransform: 'uppercase',
                }}>
                  Full Access
                </span>
              )}
            </button>
          ))}
          <div style={{ marginTop: 12, padding: '10px 12px', background: 'var(--c-bg3)', borderRadius: 8, fontSize: 11, color: 'var(--c-text3)' }}>
            Permission inheritance: child roles inherit view access from parent role mappings. Changes are audit-tracked.
          </div>
        </Card>

        {/* Permission matrix */}
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, paddingBottom: 12, borderBottom: '1px solid var(--c-border)' }}>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--c-text)' }}>{selectedRole}</h3>
              <span style={{ fontSize: 12, color: 'var(--c-text3)' }}>
                {isComplianceAdminRole
                  ? '🔒 Super-admin — all permissions locked ON and cannot be restricted'
                  : 'CRUD rights and module access'}
              </span>
            </div>
            <Btn onClick={save} disabled={saving || isComplianceAdminRole}>
              {isComplianceAdminRole ? 'Locked (Full Access)' : saving ? 'Saving…' : 'Save Configuration'}
            </Btn>
          </div>

          {/* Full Access banner for Compliance Admin */}
          {isComplianceAdminRole && (
            <div style={{
              marginBottom: 16, padding: '10px 14px',
              background: 'rgba(0,86,179,0.06)', border: '1px solid rgba(0,86,179,0.2)',
              borderRadius: 8, fontSize: 12, color: 'var(--c-text2)',
            }}>
              ℹ️ The <strong>Compliance Admin</strong> role always has <strong>full access</strong> to all modules and actions.
              These permissions are enforced at the system level and cannot be modified to prevent accidental lock-out.
            </div>
          )}

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--c-bg3)', borderBottom: '1px solid var(--c-border)' }}>
                  <th style={{ padding: '10px 14px', textAlign: 'left', color: 'var(--c-text3)', fontSize: 11, textTransform: 'uppercase' }}>Module</th>
                  {['view', 'create', 'edit', 'delete', 'import', 'configure', 'test', 'activate', 'export', 'schedule'].map(a => (
                    <th key={a} style={{ padding: '10px 8px', textAlign: 'center', color: 'var(--c-text3)', fontSize: 10, textTransform: 'uppercase' }}>{a}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MODULE_PERMISSIONS.map(mod => (
                  <tr key={mod.key} style={{ borderBottom: '1px solid var(--c-border)' }}>
                    <td style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--c-text)' }}>{mod.module}</td>
                    {['view', 'create', 'edit', 'delete', 'import', 'configure', 'test', 'activate', 'export', 'schedule'].map(action => {
                      const key = `${mod.key}-${action}`;
                      const applicable = mod.actions.includes(action);
                      // Compliance Admin: all applicable actions are always checked and locked
                      const checked = isComplianceAdminRole ? applicable : (matrix[selectedRole]?.[key] ?? false);
                      return (
                        <td key={action} style={{ padding: '12px 8px', textAlign: 'center' }}>
                          {applicable ? (
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggle(key)}
                              disabled={isComplianceAdminRole}
                              title={isComplianceAdminRole ? 'Compliance Admin always has this permission' : undefined}
                              style={{
                                cursor: isComplianceAdminRole ? 'not-allowed' : 'pointer',
                                opacity: isComplianceAdminRole ? 0.65 : 1,
                              }}
                            />
                          ) : (
                            <span style={{ color: 'var(--c-text3)' }}>—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </PageWrap>
  );
}
