import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Card, Badge, Btn, colors } from './ui';
import { toast } from './Toast';
import { ACCESSOR_ROLES, AccessorRole } from '@/lib/accessors';

interface ControlAccessorsProps {
  controlId: string;
  controlTitle?: string;
  controlDepartment?: string;
  onClose?: () => void;
}

export default function ControlAccessors({ controlId, controlTitle, controlDepartment, onClose }: ControlAccessorsProps) {
  const [accessors, setAccessors] = useState<any[]>([]);
  const [availableUsers, setAvailableUsers] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [selectedEmail, setSelectedEmail] = useState('');
  const [selectedRole, setSelectedRole] = useState<AccessorRole>('assessor');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('General');
  const [loading, setLoading] = useState(false);

  const loadAccessors = async () => {
    try {
      const data = await api.getControlAccessors(controlId);
      setAccessors(data || []);
    } catch (err) {
      toast.error((err as Error).message, 'Error loading accessors');
    }
  };

  const loadUsers = async () => {
    try {
      const data = await api.listAccessors(selectedRole);
      setAvailableUsers(data || []);
    } catch (err) {
      toast.error((err as Error).message, 'Error loading users');
    }
  };

  const loadDepartments = async () => {
    try {
      const data = await api.getDepartments();
      setDepartments(data || []);
      if (controlDepartment) {
        setSelectedDepartment(controlDepartment);
      }
    } catch (err) {
      toast.error((err as Error).message, 'Error loading departments');
    }
  };

  useEffect(() => {
    loadAccessors();
    loadUsers();
    loadDepartments();
  }, [controlId, selectedRole]);

  const handleAssign = async () => {
    if (!selectedEmail) {
      toast.error('Please select a user');
      return;
    }

    setLoading(true);
    try {
      await api.assignAccessor(controlId, selectedEmail, selectedRole, selectedDepartment);
      toast.success(`${selectedEmail} assigned as ${selectedRole} for ${selectedDepartment}`);
      setSelectedEmail('');
      setSelectedRole('assessor');
      await loadAccessors();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (email: string, role: string, department: string) => {
    if (!confirm(`Remove ${email} from ${role} role in ${department}?`)) return;

    try {
      await api.removeAccessor(controlId, email, role, department);
      toast.success(`${email} removed from ${role}`);
      await loadAccessors();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div style={{ padding: 0 }}>
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: colors.text, marginBottom: 8 }}>
          {controlTitle || 'Control'} - Accessors
        </h3>
        <p style={{ fontSize: 12, color: colors.text3, margin: 0 }}>
          Assign users to specific roles for this control
        </p>
      </div>

      {/* Current Accessors */}
      {accessors.length > 0 && (
        <Card style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: colors.text, marginBottom: 12 }}>
            Current Accessors ({accessors.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {accessors.map((a) => {
              const roleInfo = ACCESSOR_ROLES[a.role as AccessorRole];
              return (
                <div key={`${a.id}-${a.role}-${a.department}`} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: 10, background: colors.bg3, borderRadius: 8,
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: colors.text }}>
                      {a.email}
                    </div>
                    <div style={{ fontSize: 11, color: colors.text3, marginTop: 2, display: 'flex', gap: 6 }}>
                      <Badge label={a.role} color={roleInfo?.color} />
                      <Badge label={a.department || 'General'} color="#6B7280" />
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemove(a.email, a.role, a.department || 'General')}
                    style={{
                      background: 'none', border: 'none', color: colors.red,
                      fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    Remove
                  </button>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Assignment Form */}
      <Card style={{ padding: 16, background: `${colors.accent}08` }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: colors.text, marginBottom: 12 }}>
          Assign New Accessor
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Role Selector */}
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: colors.text3, marginBottom: 6, textTransform: 'uppercase' }}>
              Role
            </label>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value as AccessorRole)}
              style={{
                width: '100%', padding: '8px 10px', border: `1px solid ${colors.border}`,
                borderRadius: 8, background: colors.bg2, color: colors.text,
                fontSize: 13, fontWeight: 500, outline: 'none',
              }}
            >
              {Object.entries(ACCESSOR_ROLES).map(([key, role]) => (
                <option key={key} value={key}>
                  {role.label} - {role.description.substring(0, 40)}...
                </option>
              ))}
            </select>
          </div>

          {/* Department Selector */}
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: colors.text3, marginBottom: 6, textTransform: 'uppercase' }}>
              Department
            </label>
            <select
              value={selectedDepartment}
              onChange={(e) => setSelectedDepartment(e.target.value)}
              style={{
                width: '100%', padding: '8px 10px', border: `1px solid ${colors.border}`,
                borderRadius: 8, background: colors.bg2, color: colors.text,
                fontSize: 13, fontWeight: 500, outline: 'none',
              }}
            >
              {departments.map((d) => (
                <option key={d.id} value={d.name}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          {/* User Selector */}
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: colors.text3, marginBottom: 6, textTransform: 'uppercase' }}>
              User
            </label>
            <select
              value={selectedEmail}
              onChange={(e) => setSelectedEmail(e.target.value)}
              style={{
                width: '100%', padding: '8px 10px', border: `1px solid ${colors.border}`,
                borderRadius: 8, background: colors.bg2, color: colors.text,
                fontSize: 13, fontWeight: 500, outline: 'none',
              }}
            >
              <option value="">Select a user...</option>
              {availableUsers.map((u) => (
                <option key={u.email} value={u.email}>
                  {u.email}
                </option>
              ))}
            </select>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn
              onClick={handleAssign}
              disabled={loading || !selectedEmail}
              style={{ flex: 1 }}
            >
              {loading ? 'Assigning...' : 'Assign'}
            </Btn>
            {onClose && (
              <Btn onClick={onClose} variant="ghost">
                Close
              </Btn>
            )}
          </div>
        </div>
      </Card>

      {/* Role Information */}
      <div style={{ marginTop: 20, padding: 12, background: `${colors.yellow}15`, borderRadius: 8, borderLeft: `3px solid ${colors.yellow}` }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: colors.text3, marginBottom: 8, textTransform: 'uppercase' }}>
          Role Descriptions
        </div>
        {Object.values(ACCESSOR_ROLES).map((role) => (
          <div key={role.id} style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: colors.text }}>
              {role.icon} {role.label}
            </div>
            <div style={{ fontSize: 10, color: colors.text3, marginTop: 2 }}>
              {role.description}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
