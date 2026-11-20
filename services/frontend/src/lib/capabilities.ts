// ─────────────────────────────────────────────────────────────────────────────
// Capability matrix — single source of truth for role → action permissions.
//
// Derived from the Clovrix "Role-page-feature matrix" document. Page ACCESS
// (which pages a role can open) is handled in Shell.tsx / ComplianceAdminPortal.tsx;
// this file handles per-page CAPABILITIES (what a role can DO on a page it can see):
// create, edit, approve, sign-off, upload, etc.
//
// Compliance Admin has every capability. Other roles are granted only what the
// matrix specifies; everything else is view-only.
// ─────────────────────────────────────────────────────────────────────────────

import { getActiveRole } from './auth';

export type Capability =
  // Control Library / AI Registry
  | 'controls.create' | 'controls.edit' | 'ai.edit'
  // Policy
  | 'policy.edit'
  // Evidence
  | 'evidence.upload' | 'evidence.review'
  // Risk
  | 'risk.create' | 'risk.edit' | 'risk.rate' | 'risk.accept'
  // Findings
  | 'findings.create' | 'findings.approve'
  // Audit workflows
  | 'audit.run' | 'audit.close'
  // Remediations
  | 'remediations.create' | 'remediations.edit'
  // Vendor risk
  | 'vendor.edit'
  // Security questionnaires
  | 'questionnaires.respond' | 'questionnaires.review'
  // Statement of Applicability
  | 'soa.signoff' | 'soa.approve' | 'soa.contribute'
  // Reports
  | 'reports.export'
  // Admin-only
  | 'users.manage' | 'integrations.manage' | 'settings.manage';

// Roles granted each capability. Compliance Admin is implicitly granted all.
const MATRIX: Record<Capability, string[]> = {
  // Control Library — Admin full CRUD; Control Lead edits own scope (ownership
  // is additionally checked at the call site).
  'controls.create': ['Compliance Admin'],
  'controls.edit':   ['Compliance Admin', 'Control Lead'],
  'ai.edit':         ['Compliance Admin', 'Control Lead'],

  // Policy Management — authored by Admin; everyone else views.
  'policy.edit':     ['Compliance Admin'],

  // Evidence — Admin + Control Lead upload; Assessor reviews (accept/reject).
  'evidence.upload': ['Compliance Admin', 'Control Lead'],
  'evidence.review': ['Compliance Admin', 'Assessor'],

  // Risk — Admin runs assessments; Risk Owner edits/accepts; Assessor rates.
  'risk.create':     ['Compliance Admin'],
  'risk.edit':       ['Compliance Admin', 'Risk Owner'],
  'risk.rate':       ['Compliance Admin', 'Assessor', 'Risk Owner'],
  'risk.accept':     ['Compliance Admin', 'Risk Owner'],

  // Findings — created by Admin + Assessor; approved/returned by Reviewer.
  'findings.create':  ['Compliance Admin', 'Assessor'],
  'findings.approve': ['Compliance Admin', 'Reviewer'],

  // Audit workflows — executed by Admin + Assessor; only Admin closes an audit.
  'audit.run':       ['Compliance Admin', 'Assessor'],
  'audit.close':     ['Compliance Admin'],

  // Remediations — created by Admin; progress updated by Control Lead + Risk Owner.
  'remediations.create': ['Compliance Admin'],
  'remediations.edit':   ['Compliance Admin', 'Control Lead', 'Risk Owner'],

  // Vendor risk — Admin + Risk Owner.
  'vendor.edit':     ['Compliance Admin', 'Risk Owner'],

  // Security questionnaires — Control Lead responds; Assessor reviews/approves.
  'questionnaires.respond': ['Compliance Admin', 'Control Lead'],
  'questionnaires.review':  ['Compliance Admin', 'Assessor'],

  // Statement of Applicability — Auditor signs off; Reviewer approves/returns;
  // Assessor + Risk Owner contribute applicability/implementation input.
  'soa.signoff':     ['Compliance Admin', 'Lead Auditor'],
  'soa.approve':     ['Compliance Admin', 'Reviewer'],
  'soa.contribute':  ['Compliance Admin', 'Assessor', 'Risk Owner'],

  // Reports — Admin + Auditor export; everyone else views.
  'reports.export':  ['Compliance Admin', 'Lead Auditor'],

  // Admin-only.
  'users.manage':        ['Compliance Admin'],
  'integrations.manage': ['Compliance Admin'],
  'settings.manage':     ['Compliance Admin'],
};

/**
 * Returns true if the given role (defaults to the active role) is granted the
 * capability. Compliance Admin always returns true.
 */
export function can(capability: Capability, role: string = getActiveRole()): boolean {
  if (role === 'Compliance Admin') return true;
  return (MATRIX[capability] ?? []).includes(role);
}
