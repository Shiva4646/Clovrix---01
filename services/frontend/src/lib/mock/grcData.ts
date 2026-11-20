/** Mock data for all GRC modules — AI Registry, Controls, Policies, Evidence, Risks, Audits, Findings, Remediations, Vendors, Questionnaires, SoA, Personnel, Trust Center */

const delay = (ms = 300) => new Promise<void>(r => setTimeout(r, ms));
function load<T>(key: string, fb: T): T { try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fb; } catch { return fb; } }
function save(key: string, d: unknown) { localStorage.setItem(key, JSON.stringify(d)); }

// ── Types ─────────────────────────────────────────────────────────────────

export interface AISystem {
  id: string; name: string; owner: string; department: string;
  lifecycle: 'Development' | 'Testing' | 'Production' | 'Retired';
  riskCategory: 'High' | 'Medium' | 'Low' | 'Unclassified';
  criticality: 'Critical' | 'High' | 'Medium' | 'Low';
  frameworks: string[]; description: string; createdAt: string;
}

export interface Control {
  id: string; controlId: string; name: string; category: string;
  framework: string; owner: string;
  status: 'Implemented' | 'Partially Implemented' | 'Not Implemented' | 'Not Applicable';
  effectiveness: 'Effective' | 'Partially Effective' | 'Ineffective' | 'Not Assessed';
  nextReview: string; description: string;
}

export interface Policy {
  id: string; name: string;
  status: 'Draft' | 'Under Review' | 'Approved' | 'Expired';
  version: string; owner: string; expiryDate: string;
  reviewers: string[]; content: string; createdAt: string;
  acknowledgements: number; totalUsers: number;
}

export interface Evidence {
  id: string; fileName: string; linkedControls: string[];
  linkedFindings: string[]; linkedRisks: string[];
  approvalStatus: 'Pending' | 'Approved' | 'Rejected';
  expiryDate: string; uploadedBy: string; uploadedAt: string;
  fileSize: string; fileType: string;
}

export interface Risk {
  id: string; name: string; department: string; owner: string;
  inherentScore: number; residualScore: number;
  status: 'Open' | 'Mitigated' | 'Accepted' | 'Closed';
  likelihood: number; impact: number; treatmentPlan: string;
  category: string; createdAt: string;
}

export interface Audit {
  id: string; name: string;
  status: 'Planned' | 'In Progress' | 'Review' | 'Completed';
  startDate: string; endDate: string; assessors: string[];
  progress: number; findingsCount: number; framework: string;
  checklist: { item: string; done: boolean }[];
}

export interface Finding {
  id: string; title: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  status: 'Open' | 'In Progress' | 'Resolved' | 'Closed';
  linkedAudit: string; linkedControls: string[]; owner: string;
  rootCause: string; createdAt: string;
}

export interface Remediation {
  id: string; title: string; linkedItem: string; linkedType: 'Finding' | 'Risk';
  priority: 'Critical' | 'High' | 'Medium' | 'Low';
  dueDate: string; percentComplete: number; owner: string;
  status: 'Not Started' | 'In Progress' | 'Completed' | 'Overdue';
}

export interface Vendor {
  id: string; name: string; riskScore: number; critical: boolean;
  complianceStatus: 'Compliant' | 'Non-Compliant' | 'Under Review';
  lastAssessed: string; contactEmail: string; category: string;
}

export interface Questionnaire {
  id: string; title: string; sections: number; questions: number;
  status: 'Draft' | 'Published' | 'Completed';
  assignedTo: string; responseRate: number; createdAt: string;
}

export interface SoAEntry {
  id: string; controlId: string; applicable: boolean;
  justification: string;
  implementationStatus: 'Implemented' | 'Partially Implemented' | 'Planned' | 'Not Implemented';
  owner: string; linkedEvidence: string[]; linkedRisks: string[];
}

export interface PersonnelRecord {
  id: string; name: string; department: string;
  trainingStatus: 'Completed' | 'In Progress' | 'Overdue' | 'Not Started';
  certifications: string[]; assignedControls: string[];
  complianceStatus: 'Compliant' | 'Non-Compliant' | 'Partial';
  email: string;
}

// ── Seed Data ─────────────────────────────────────────────────────────────

const SEED_AI_SYSTEMS: AISystem[] = [
  { id: 'ai1', name: 'Customer Sentiment Analyzer', owner: 'Jordan Lee', department: 'Engineering', lifecycle: 'Production', riskCategory: 'High', criticality: 'Critical', frameworks: ['ISO 42001', 'NIST AI RMF'], description: 'NLP model for customer feedback analysis', createdAt: '2026-01-15' },
  { id: 'ai2', name: 'Fraud Detection Engine', owner: 'Alex Morgan', department: 'Risk', lifecycle: 'Production', riskCategory: 'High', criticality: 'Critical', frameworks: ['ISO 42001'], description: 'ML model for transaction fraud detection', createdAt: '2025-11-20' },
  { id: 'ai3', name: 'HR Resume Screener', owner: 'Sam Rivera', department: 'HR', lifecycle: 'Testing', riskCategory: 'High', criticality: 'High', frameworks: ['ISO 42001', 'EU AI Act'], description: 'AI-powered resume screening tool', createdAt: '2026-03-01' },
  { id: 'ai4', name: 'Predictive Maintenance Bot', owner: 'Jordan Lee', department: 'Operations', lifecycle: 'Development', riskCategory: 'Medium', criticality: 'Medium', frameworks: ['NIST AI RMF'], description: 'IoT sensor data analysis for equipment maintenance', createdAt: '2026-05-10' },
  { id: 'ai5', name: 'Content Recommendation Engine', owner: 'Alex Morgan', department: 'Marketing', lifecycle: 'Production', riskCategory: 'Low', criticality: 'Low', frameworks: ['ISO 42001'], description: 'Personalized content recommendations', createdAt: '2025-08-05' },
  { id: 'ai6', name: 'Legacy Chatbot v1', owner: 'Sam Rivera', department: 'Support', lifecycle: 'Retired', riskCategory: 'Low', criticality: 'Low', frameworks: [], description: 'Deprecated customer support chatbot', createdAt: '2024-06-15' },
];

const SEED_CONTROLS: Control[] = [
  { id: 'c1', controlId: 'A.1.1', name: 'AI Governance Policy', category: 'Governance', framework: 'ISO 42001', owner: 'Alex Morgan', status: 'Implemented', effectiveness: 'Effective', nextReview: '2026-09-15', description: 'Establish and maintain AI governance policy' },
  { id: 'c2', controlId: 'A.1.2', name: 'Roles and Responsibilities', category: 'Governance', framework: 'ISO 42001', owner: 'Jordan Lee', status: 'Implemented', effectiveness: 'Effective', nextReview: '2026-08-20', description: 'Define roles for AI system management' },
  { id: 'c3', controlId: 'A.2.1', name: 'Risk Assessment Framework', category: 'Risk Management', framework: 'ISO 42001', owner: 'Sam Rivera', status: 'Partially Implemented', effectiveness: 'Partially Effective', nextReview: '2026-07-10', description: 'Framework for assessing AI-related risks' },
  { id: 'c4', controlId: 'A.3.1', name: 'Data Quality & Bias Mitigation', category: 'Technical', framework: 'ISO 42001', owner: 'Jordan Lee', status: 'Partially Implemented', effectiveness: 'Partially Effective', nextReview: '2026-07-25', description: 'Ensure data quality and mitigate bias' },
  { id: 'c5', controlId: 'A.4.1', name: 'Transparency & Explainability', category: 'Technical', framework: 'ISO 42001', owner: 'Alex Morgan', status: 'Not Implemented', effectiveness: 'Not Assessed', nextReview: '2026-08-01', description: 'Ensure AI system transparency' },
  { id: 'c6', controlId: 'A.5.1', name: 'Monitoring & Improvement', category: 'Operations', framework: 'ISO 42001', owner: 'Sam Rivera', status: 'Implemented', effectiveness: 'Effective', nextReview: '2026-09-01', description: 'Continuous monitoring of AI systems' },
  { id: 'c7', controlId: 'B.1.1', name: 'Access Control', category: 'Security', framework: 'ISO 27001', owner: 'Jordan Lee', status: 'Implemented', effectiveness: 'Effective', nextReview: '2026-10-15', description: 'Manage access to information systems' },
  { id: 'c8', controlId: 'B.2.1', name: 'Incident Response', category: 'Security', framework: 'ISO 27001', owner: 'Alex Morgan', status: 'Partially Implemented', effectiveness: 'Partially Effective', nextReview: '2026-08-10', description: 'Security incident response procedures' },
];

const SEED_POLICIES: Policy[] = [
  { id: 'p1', name: 'AI Governance Policy', status: 'Approved', version: '2.1', owner: 'Alex Morgan', expiryDate: '2027-01-15', reviewers: ['Jordan Lee', 'Sam Rivera'], content: 'This policy establishes the governance framework...', createdAt: '2025-06-15', acknowledgements: 45, totalUsers: 50 },
  { id: 'p2', name: 'Data Privacy & Protection Policy', status: 'Approved', version: '3.0', owner: 'Jordan Lee', expiryDate: '2026-12-01', reviewers: ['Alex Morgan'], content: 'Data handling and privacy requirements...', createdAt: '2025-03-20', acknowledgements: 48, totalUsers: 50 },
  { id: 'p3', name: 'AI Ethics Guidelines', status: 'Under Review', version: '1.2', owner: 'Sam Rivera', expiryDate: '2027-03-01', reviewers: ['Alex Morgan', 'Jordan Lee'], content: 'Ethical principles for AI development...', createdAt: '2026-02-10', acknowledgements: 0, totalUsers: 50 },
  { id: 'p4', name: 'Incident Response Plan', status: 'Draft', version: '0.5', owner: 'Alex Morgan', expiryDate: '2027-06-01', reviewers: [], content: 'Procedures for handling security incidents...', createdAt: '2026-05-01', acknowledgements: 0, totalUsers: 50 },
  { id: 'p5', name: 'Vendor Management Policy', status: 'Expired', version: '1.0', owner: 'Jordan Lee', expiryDate: '2026-05-01', reviewers: ['Sam Rivera'], content: 'Third-party vendor risk management...', createdAt: '2024-05-01', acknowledgements: 42, totalUsers: 50 },
];

const SEED_EVIDENCE: Evidence[] = [
  { id: 'e1', fileName: 'Data_Quality_Report_Q2.pdf', linkedControls: ['A.3.1'], linkedFindings: [], linkedRisks: ['R1'], approvalStatus: 'Approved', expiryDate: '2027-01-01', uploadedBy: 'Jordan Lee', uploadedAt: '2026-06-15', fileSize: '2.4 MB', fileType: 'PDF' },
  { id: 'e2', fileName: 'Bias_Testing_Logs.csv', linkedControls: ['A.3.1', 'A.4.1'], linkedFindings: ['F2'], linkedRisks: [], approvalStatus: 'Pending', expiryDate: '2026-12-15', uploadedBy: 'Alex Morgan', uploadedAt: '2026-06-18', fileSize: '890 KB', fileType: 'CSV' },
  { id: 'e3', fileName: 'Model_Governance_Signoff.pdf', linkedControls: ['A.1.1'], linkedFindings: [], linkedRisks: [], approvalStatus: 'Approved', expiryDate: '2027-06-01', uploadedBy: 'Sam Rivera', uploadedAt: '2026-06-10', fileSize: '1.1 MB', fileType: 'PDF' },
  { id: 'e4', fileName: 'Access_Control_Matrix.xlsx', linkedControls: ['B.1.1'], linkedFindings: [], linkedRisks: ['R3'], approvalStatus: 'Approved', expiryDate: '2026-12-01', uploadedBy: 'Jordan Lee', uploadedAt: '2026-06-05', fileSize: '450 KB', fileType: 'Excel' },
  { id: 'e5', fileName: 'Penetration_Test_Report.pdf', linkedControls: ['B.2.1'], linkedFindings: ['F1'], linkedRisks: ['R2'], approvalStatus: 'Rejected', expiryDate: '2026-09-01', uploadedBy: 'Alex Morgan', uploadedAt: '2026-06-20', fileSize: '5.2 MB', fileType: 'PDF' },
];

const SEED_RISKS: Risk[] = [
  { id: 'R1', name: 'AI Model Bias in Hiring', department: 'HR', owner: 'Sam Rivera', inherentScore: 20, residualScore: 12, status: 'Open', likelihood: 4, impact: 5, treatmentPlan: 'Implement bias testing framework', category: 'Ethical', createdAt: '2026-03-15' },
  { id: 'R2', name: 'Data Breach via API', department: 'Engineering', owner: 'Jordan Lee', inherentScore: 25, residualScore: 8, status: 'Mitigated', likelihood: 5, impact: 5, treatmentPlan: 'API gateway hardening completed', category: 'Security', createdAt: '2026-01-20' },
  { id: 'R3', name: 'Third-party LLM Outage', department: 'Operations', owner: 'Alex Morgan', inherentScore: 15, residualScore: 10, status: 'Open', likelihood: 3, impact: 5, treatmentPlan: 'Multi-provider failover setup', category: 'Operational', createdAt: '2026-04-10' },
  { id: 'R4', name: 'Regulatory Non-compliance', department: 'Compliance', owner: 'Sam Rivera', inherentScore: 16, residualScore: 6, status: 'Mitigated', likelihood: 4, impact: 4, treatmentPlan: 'Continuous compliance monitoring', category: 'Regulatory', createdAt: '2025-12-01' },
  { id: 'R5', name: 'Model Drift Detection Failure', department: 'Engineering', owner: 'Jordan Lee', inherentScore: 12, residualScore: 9, status: 'Open', likelihood: 3, impact: 4, treatmentPlan: 'Deploy automated drift monitoring', category: 'Technical', createdAt: '2026-05-20' },
  { id: 'R6', name: 'Insufficient Training Data', department: 'Data Science', owner: 'Alex Morgan', inherentScore: 9, residualScore: 4, status: 'Accepted', likelihood: 3, impact: 3, treatmentPlan: 'Accepted — synthetic data augmentation', category: 'Technical', createdAt: '2026-02-28' },
];

const SEED_AUDITS: Audit[] = [
  { id: 'aud1', name: 'ISO 42001 Initial Certification', status: 'In Progress', startDate: '2026-06-01', endDate: '2026-07-15', assessors: ['Sam Rivera', 'External Auditor'], progress: 65, findingsCount: 3, framework: 'ISO 42001', checklist: [{ item: 'Review governance policy', done: true }, { item: 'Assess risk framework', done: true }, { item: 'Evaluate controls', done: false }, { item: 'Review evidence', done: false }] },
  { id: 'aud2', name: 'ISO 27001 Surveillance Audit', status: 'Planned', startDate: '2026-08-01', endDate: '2026-08-15', assessors: ['External Auditor'], progress: 0, findingsCount: 0, framework: 'ISO 27001', checklist: [{ item: 'Pre-audit document review', done: false }, { item: 'On-site assessment', done: false }] },
  { id: 'aud3', name: 'Q1 Internal Audit', status: 'Completed', startDate: '2026-03-01', endDate: '2026-03-20', assessors: ['Sam Rivera'], progress: 100, findingsCount: 5, framework: 'ISO 42001', checklist: [{ item: 'Control effectiveness review', done: true }, { item: 'Evidence sampling', done: true }] },
];

const SEED_FINDINGS: Finding[] = [
  { id: 'F1', title: 'Incomplete Penetration Test Coverage', severity: 'High', status: 'Open', linkedAudit: 'Q1 Internal Audit', linkedControls: ['B.2.1'], owner: 'Alex Morgan', rootCause: 'Scope limitations in testing contract', createdAt: '2026-03-18' },
  { id: 'F2', title: 'Bias Testing Gap in Resume Screener', severity: 'Critical', status: 'In Progress', linkedAudit: 'ISO 42001 Initial Certification', linkedControls: ['A.3.1', 'A.4.1'], owner: 'Jordan Lee', rootCause: 'No fairness metrics defined for protected attributes', createdAt: '2026-06-10' },
  { id: 'F3', title: 'Missing Data Retention Policy', severity: 'Medium', status: 'Resolved', linkedAudit: 'Q1 Internal Audit', linkedControls: ['A.1.1'], owner: 'Sam Rivera', rootCause: 'Policy not updated after regulation change', createdAt: '2026-03-15' },
  { id: 'F4', title: 'Insufficient Access Logging', severity: 'Low', status: 'Closed', linkedAudit: 'Q1 Internal Audit', linkedControls: ['B.1.1'], owner: 'Jordan Lee', rootCause: 'Log rotation misconfiguration', createdAt: '2026-03-12' },
];

const SEED_REMEDIATIONS: Remediation[] = [
  { id: 'rem1', title: 'Expand Penetration Test Scope', linkedItem: 'F1', linkedType: 'Finding', priority: 'High', dueDate: '2026-07-30', percentComplete: 25, owner: 'Alex Morgan', status: 'In Progress' },
  { id: 'rem2', title: 'Implement Fairness Metrics Framework', linkedItem: 'F2', linkedType: 'Finding', priority: 'Critical', dueDate: '2026-07-15', percentComplete: 40, owner: 'Jordan Lee', status: 'In Progress' },
  { id: 'rem3', title: 'Deploy Multi-provider Failover', linkedItem: 'R3', linkedType: 'Risk', priority: 'High', dueDate: '2026-08-01', percentComplete: 60, owner: 'Alex Morgan', status: 'In Progress' },
  { id: 'rem4', title: 'Update Data Retention Policy', linkedItem: 'F3', linkedType: 'Finding', priority: 'Medium', dueDate: '2026-06-30', percentComplete: 100, owner: 'Sam Rivera', status: 'Completed' },
  { id: 'rem5', title: 'Fix Log Rotation Config', linkedItem: 'F4', linkedType: 'Finding', priority: 'Low', dueDate: '2026-04-15', percentComplete: 100, owner: 'Jordan Lee', status: 'Completed' },
];

const SEED_VENDORS: Vendor[] = [
  { id: 'v1', name: 'OpenAI', riskScore: 72, critical: true, complianceStatus: 'Compliant', lastAssessed: '2026-06-01', contactEmail: 'security@openai.com', category: 'AI/ML Provider' },
  { id: 'v2', name: 'AWS', riskScore: 85, critical: true, complianceStatus: 'Compliant', lastAssessed: '2026-05-15', contactEmail: 'compliance@aws.amazon.com', category: 'Cloud Infrastructure' },
  { id: 'v3', name: 'Anthropic', riskScore: 68, critical: true, complianceStatus: 'Under Review', lastAssessed: '2026-04-20', contactEmail: 'trust@anthropic.com', category: 'AI/ML Provider' },
  { id: 'v4', name: 'DataDog', riskScore: 90, critical: false, complianceStatus: 'Compliant', lastAssessed: '2026-06-10', contactEmail: 'security@datadog.com', category: 'Monitoring' },
  { id: 'v5', name: 'Acme Analytics', riskScore: 45, critical: false, complianceStatus: 'Non-Compliant', lastAssessed: '2026-02-01', contactEmail: 'info@acme.com', category: 'Analytics' },
];

const SEED_QUESTIONNAIRES: Questionnaire[] = [
  { id: 'q1', title: 'AI Vendor Security Assessment', sections: 5, questions: 42, status: 'Published', assignedTo: 'OpenAI', responseRate: 85, createdAt: '2026-05-01' },
  { id: 'q2', title: 'Cloud Provider Compliance Check', sections: 4, questions: 35, status: 'Completed', assignedTo: 'AWS', responseRate: 100, createdAt: '2026-04-15' },
  { id: 'q3', title: 'Data Processing Agreement Review', sections: 3, questions: 20, status: 'Draft', assignedTo: '', responseRate: 0, createdAt: '2026-06-10' },
];

const SEED_SOA: SoAEntry[] = [
  { id: 's1', controlId: 'A.1.1', applicable: true, justification: 'Core governance requirement', implementationStatus: 'Implemented', owner: 'Alex Morgan', linkedEvidence: ['e3'], linkedRisks: [] },
  { id: 's2', controlId: 'A.1.2', applicable: true, justification: 'Organizational structure requirement', implementationStatus: 'Implemented', owner: 'Jordan Lee', linkedEvidence: [], linkedRisks: [] },
  { id: 's3', controlId: 'A.2.1', applicable: true, justification: 'Risk management mandatory', implementationStatus: 'Partially Implemented', owner: 'Sam Rivera', linkedEvidence: [], linkedRisks: ['R1', 'R4'] },
  { id: 's4', controlId: 'A.3.1', applicable: true, justification: 'Data quality critical for AI systems', implementationStatus: 'Partially Implemented', owner: 'Jordan Lee', linkedEvidence: ['e1', 'e2'], linkedRisks: ['R1'] },
  { id: 's5', controlId: 'A.4.1', applicable: true, justification: 'Transparency required by regulation', implementationStatus: 'Planned', owner: 'Alex Morgan', linkedEvidence: [], linkedRisks: ['R5'] },
  { id: 's6', controlId: 'A.5.1', applicable: true, justification: 'Continuous improvement mandate', implementationStatus: 'Implemented', owner: 'Sam Rivera', linkedEvidence: [], linkedRisks: [] },
  { id: 's7', controlId: 'B.1.1', applicable: true, justification: 'Information security baseline', implementationStatus: 'Implemented', owner: 'Jordan Lee', linkedEvidence: ['e4'], linkedRisks: ['R3'] },
  { id: 's8', controlId: 'B.2.1', applicable: false, justification: 'Handled by external SOC provider', implementationStatus: 'Not Implemented', owner: 'Alex Morgan', linkedEvidence: [], linkedRisks: [] },
];

const SEED_PERSONNEL: PersonnelRecord[] = [
  { id: 'per1', name: 'Alex Morgan', department: 'Compliance', trainingStatus: 'Completed', certifications: ['ISO 42001 Lead Implementer', 'CISA'], assignedControls: ['A.1.1', 'A.4.1', 'B.2.1'], complianceStatus: 'Compliant', email: 'alex.morgan@clovrix.com' },
  { id: 'per2', name: 'Jordan Lee', department: 'Engineering', trainingStatus: 'Completed', certifications: ['AWS Solutions Architect', 'ISO 27001 Auditor'], assignedControls: ['A.1.2', 'A.3.1', 'B.1.1'], complianceStatus: 'Compliant', email: 'jordan.lee@clovrix.com' },
  { id: 'per3', name: 'Sam Rivera', department: 'Risk', trainingStatus: 'In Progress', certifications: ['CRISC'], assignedControls: ['A.2.1', 'A.5.1'], complianceStatus: 'Partial', email: 'sam.rivera@clovrix.com' },
  { id: 'per4', name: 'Casey Chen', department: 'Data Science', trainingStatus: 'Overdue', certifications: [], assignedControls: ['A.3.1'], complianceStatus: 'Non-Compliant', email: 'casey.chen@clovrix.com' },
  { id: 'per5', name: 'Taylor Kim', department: 'HR', trainingStatus: 'Completed', certifications: ['PHR'], assignedControls: [], complianceStatus: 'Compliant', email: 'taylor.kim@clovrix.com' },
  { id: 'per6', name: 'Morgan Davis', department: 'Legal', trainingStatus: 'Not Started', certifications: ['JD', 'CIPP/E'], assignedControls: [], complianceStatus: 'Non-Compliant', email: 'morgan.davis@clovrix.com' },
];

// ── Keys ──────────────────────────────────────────────────────────────────
const K = {
  ai: 'grc_ai_systems', controls: 'grc_controls', policies: 'grc_policies',
  evidence: 'grc_evidence', risks: 'grc_risks', audits: 'grc_audits',
  findings: 'grc_findings', remediations: 'grc_remediations', vendors: 'grc_vendors',
  questionnaires: 'grc_questionnaires', soa: 'grc_soa', personnel: 'grc_personnel',
};

// ── Generic CRUD helpers ──────────────────────────────────────────────────
function crud<T extends { id: string }>(key: string, seed: T[]) {
  return {
    async list(): Promise<T[]> { await delay(); return load(key, seed); },
    async get(id: string): Promise<T | undefined> { await delay(); return load<T[]>(key, seed).find(i => i.id === id); },
    async create(item: T): Promise<T> { await delay(); const items = load<T[]>(key, seed); items.unshift(item); save(key, items); return item; },
    async update(id: string, data: Partial<T>): Promise<T> {
      await delay(); const items = load<T[]>(key, seed);
      const idx = items.findIndex(i => i.id === id);
      if (idx < 0) throw new Error('Not found');
      items[idx] = { ...items[idx], ...data }; save(key, items); return items[idx];
    },
    async remove(id: string): Promise<void> { await delay(); save(key, load<T[]>(key, seed).filter(i => i.id !== id)); },
  };
}

export const grcApi = {
  aiSystems: crud(K.ai, SEED_AI_SYSTEMS),
  controls: crud(K.controls, SEED_CONTROLS),
  policies: crud(K.policies, SEED_POLICIES),
  evidence: crud(K.evidence, SEED_EVIDENCE),
  risks: crud(K.risks, SEED_RISKS),
  audits: crud(K.audits, SEED_AUDITS),
  findings: crud(K.findings, SEED_FINDINGS),
  remediations: crud(K.remediations, SEED_REMEDIATIONS),
  vendors: crud(K.vendors, SEED_VENDORS),
  questionnaires: crud(K.questionnaires, SEED_QUESTIONNAIRES),
  soa: crud(K.soa, SEED_SOA),
  personnel: crud(K.personnel, SEED_PERSONNEL),
};
