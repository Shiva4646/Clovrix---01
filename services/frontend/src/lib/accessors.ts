/**
 * Accessor Roles - 5 role types for control & assessment assignment
 * These define who can be assigned to assessments, controls, and remediation
 */

export type AccessorRole =
  | 'control_lead'      // Enriches controls, marks ready
  | 'assessor'          // Tests controls, records results
  | 'reviewer'          // Approves/returns assessments
  | 'auditor'           // Audits workflows, generates reports
  | 'remediation_owner'; // Handles findings remediation

export interface AccessorRoleDefinition {
  id: AccessorRole;
  label: string;
  description: string;
  icon: string;
  color: string;
  permissions: string[];
}

/**
 * Accessor Role Definitions
 * These are the 5 core roles that can be assigned to users for specific controls/tasks
 */
export const ACCESSOR_ROLES: Record<AccessorRole, AccessorRoleDefinition> = {
  control_lead: {
    id: 'control_lead',
    label: 'Control Lead',
    description: 'Enriches controls with policy, evidence, and implementation notes. Marks ready for assessment.',
    icon: '📋',
    color: '#0056B3',
    permissions: ['read:assigned_controls', 'write:control_enrichment', 'write:control_status', 'write:ready_for_assessment', 'read:version_history'],
  },
  assessor: {
    id: 'assessor',
    label: 'Assessor',
    description: 'Tests controls using manual or automated methods. Records assessment results and generates findings.',
    icon: '🔍',
    color: '#1DB9A2',
    permissions: ['read:ready_controls', 'write:assessments', 'write:findings', 'read:assessment_history'],
  },
  reviewer: {
    id: 'reviewer',
    label: 'Reviewer',
    description: 'Reviews and approves assessment results. Can return assessments for rework. Manages findings approval.',
    icon: '✓',
    color: '#22c55e',
    permissions: ['read:assessment_queue', 'write:assessment_approval', 'write:finding_review', 'read:evidence'],
  },
  auditor: {
    id: 'auditor',
    label: 'Lead Auditor',
    description: 'Oversees entire audit workflows. Generates reports, ensures compliance, tracks audit cycles.',
    icon: '📊',
    color: '#f59e0b',
    permissions: ['read:all_audits', 'read:all_controls', 'read:all_assessments', 'read:all_findings', 'write:audit_reports'],
  },
  remediation_owner: {
    id: 'remediation_owner',
    label: 'Remediation Owner',
    description: 'Manages findings remediation. Tracks remediation progress, updates status, and verifies closure.',
    icon: '🔧',
    color: '#ef4444',
    permissions: ['read:assigned_findings', 'write:remediation_plan', 'write:remediation_status', 'write:remediation_evidence'],
  },
};

/**
 * Get accessor role by ID
 */
export function getAccessorRole(roleId: AccessorRole): AccessorRoleDefinition {
  return ACCESSOR_ROLES[roleId];
}

/**
 * Get all accessor roles
 */
export function getAllAccessorRoles(): AccessorRoleDefinition[] {
  return Object.values(ACCESSOR_ROLES);
}

/**
 * Check if user has permission for an accessor role
 */
export function hasPermission(roleId: AccessorRole, permission: string): boolean {
  const role = ACCESSOR_ROLES[roleId];
  return role?.permissions.includes(permission) ?? false;
}

/**
 * Get user's permissions from their accessor roles
 */
export function getUserPermissions(roleIds: AccessorRole[]): Set<string> {
  const permissions = new Set<string>();
  roleIds.forEach(roleId => {
    const role = ACCESSOR_ROLES[roleId];
    role?.permissions.forEach(p => permissions.add(p));
  });
  return permissions;
}
