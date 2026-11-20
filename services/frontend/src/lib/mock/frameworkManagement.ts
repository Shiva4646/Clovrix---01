// ─────────────────────────────────────────────────────────────────────────────
// Framework Management — mock data + API
//
// IMPORTANT: Framework controls are READ-ONLY TEMPLATES. They are never mutated.
// When a Compliance Admin assigns selected controls to an audit, we create COPIES
// inside the auditControls store (see assignControls). The original template
// objects are deep-cloned on copy so nothing about them can be changed.
//
//   Framework → FrameworkControls (read only) → Audit → AuditControls (copies)
// ─────────────────────────────────────────────────────────────────────────────

import { getToken, getActiveTenant } from '../auth';

export type Priority = 'High' | 'Medium' | 'Low';
export type ImplStatus = 'Not Started' | 'In Progress' | 'Completed';

export interface Framework {
  id: string;
  code: string;         // e.g. ISO 42001
  name: string;         // full display name
  version: string;
  controlCount: number; // convenience count
}

export interface FrameworkControl {
  id: string;               // template id (stable)
  frameworkId: string;
  controlId: string;        // e.g. A.2.2
  controlObjective: string; // grouping objective
  controlTitle: string;
  requirementSummary: string;
  priority: Priority;
  theme: string;
}

export interface AuditControl {
  id: string;                 // new copy id
  auditId: string;
  frameworkId: string;
  controlId: string;
  controlObjective: string;
  controlTitle: string;
  requirementSummary: string;
  priority: Priority;
  theme: string;
  implementationStatus: ImplStatus; // 'Not Started' on copy; Control Lead updates it
  assignedControlLead: string;
  createdDate: string;
  version: number;            // 1 on first copy; increments on each save
  // ── Control Lead enrichment fields (filled during review) ──────────────────
  policyName?: string;
  policyDescription?: string;
  evidenceRequired?: string;
  implementationNotes?: string;
  readyForAssessment?: boolean;
  lastSavedAt?: string;       // ISO timestamp of last edit
}

// A single audit-trail / version-history entry. Every field change creates one.
export interface ControlVersion {
  version: number;
  field: string;
  modifiedBy: string;
  modifiedDate: string;   // ISO timestamp
  previousValue: string;
  updatedValue: string;
}

export interface Audit {
  id: string;
  name: string;
  description: string;
  department: string;
  businessUnit: string;
  startDate: string;
  endDate: string;
  frameworkId: string;
  controlLead: string;
  status: 'draft' | 'active' | 'closed';
  createdDate: string;
}

// ── Dropdown reference data ──────────────────────────────────────────────────
export const DEPARTMENTS = [
  'Engineering', 'Information Security', 'Risk & Compliance', 'Legal & Privacy',
  'Human Resources', 'Operations', 'Data Science', 'Finance',
];

export const BUSINESS_UNITS = [
  'Corporate', 'Cloud Platform', 'Consumer Products', 'Enterprise Solutions',
  'Payments', 'AI Research Lab', 'Managed Services',
];

// Control Leads available for assignment.
// NOTE: the first entry is the actual Control Lead login account
// (controlLead@clovrix.com) so that an admin assignment is immediately visible
// on that user's Assigned Controls page. The others are additional demo leads.
export const CONTROL_LEADS = [
  { id: 'cl0', name: 'Control Lead', email: 'controlLead@clovrix.com' },
  { id: 'cl1', name: 'Jordan Lee', email: 'jordan.lee@clovrix.com' },
  { id: 'cl2', name: 'Alex Morgan', email: 'alex.morgan@clovrix.com' },
  { id: 'cl3', name: 'Sam Rivera', email: 'sam.rivera@clovrix.com' },
  { id: 'cl4', name: 'Priya Nair', email: 'priya.nair@clovrix.com' },
  { id: 'cl5', name: 'Daniel Okoro', email: 'daniel.okoro@clovrix.com' },
];

// ── Frameworks ───────────────────────────────────────────────────────────────
export const FRAMEWORKS: Framework[] = [
  { id: 'fw-iso42001', code: 'ISO 42001', name: 'ISO/IEC 42001:2023 — AI Management System', version: '2023', controlCount: 0 },
  { id: 'fw-iso27001', code: 'ISO 27001', name: 'ISO/IEC 27001:2022 — Information Security', version: '2022', controlCount: 0 },
  { id: 'fw-nistcsf',  code: 'NIST CSF',  name: 'NIST Cybersecurity Framework 2.0', version: '2.0', controlCount: 0 },
  { id: 'fw-soc2',     code: 'SOC 2',     name: 'SOC 2 Type II — Trust Services Criteria', version: '2017', controlCount: 0 },
  { id: 'fw-pcidss',   code: 'PCI DSS',   name: 'PCI DSS v4.0 — Payment Card Security', version: '4.0', controlCount: 0 },
];

// ── Framework control templates (READ ONLY) ──────────────────────────────────
const CONTROLS: FrameworkControl[] = [
  // ISO/IEC 42001:2023 — Annex A (all 38 controls, A.2–A.10)
  // A.2 Policies related to AI
  ctl('fw-iso42001', 'A.2.2', 'Policies related to AI', 'AI Policy', 'Document a formal AI policy, approved by management, that governs the responsible development and use of AI systems.', 'High', 'Governance'),
  ctl('fw-iso42001', 'A.2.3', 'Policies related to AI', 'Alignment with Other Organisational Policies', 'Ensure the AI policy integrates with existing policies such as privacy, security, HR and quality.', 'Medium', 'Governance'),
  ctl('fw-iso42001', 'A.2.4', 'Policies related to AI', 'Review of the AI Policy', 'Review and update the AI policy at planned intervals and whenever regulations or business circumstances change.', 'Medium', 'Governance'),
  // A.3 Internal organisation
  ctl('fw-iso42001', 'A.3.2', 'Internal organisation', 'AI Roles and Responsibilities', 'Define, allocate and communicate roles and responsibilities for the AI management system.', 'High', 'Organisation'),
  ctl('fw-iso42001', 'A.3.3', 'Internal organisation', 'Reporting of Concerns', 'Establish a confidential process for personnel to report ethical, safety or compliance concerns about AI systems.', 'Medium', 'Organisation'),
  // A.4 Resources for AI systems
  ctl('fw-iso42001', 'A.4.2', 'Resources for AI systems', 'Resource Documentation', 'Identify and document all resources required at each stage of the AI system lifecycle.', 'Medium', 'Resources'),
  ctl('fw-iso42001', 'A.4.3', 'Resources for AI systems', 'Data Resources', 'Document the data resources used by AI systems, including their intended use and limitations.', 'High', 'Resources'),
  ctl('fw-iso42001', 'A.4.4', 'Resources for AI systems', 'Tooling Resources', 'Identify and document the tooling resources used to develop, operate and maintain AI systems.', 'Low', 'Resources'),
  ctl('fw-iso42001', 'A.4.5', 'Resources for AI systems', 'System and Computing Resources', 'Document the system and computing resources required by AI systems across their lifecycle.', 'Medium', 'Resources'),
  ctl('fw-iso42001', 'A.4.6', 'Resources for AI systems', 'Human Resources', 'Document the human resources and competencies needed to develop and operate AI systems responsibly.', 'Medium', 'Resources'),
  // A.5 Assessing impacts of AI systems
  ctl('fw-iso42001', 'A.5.2', 'Assessing impacts of AI systems', 'AI System Impact Assessment Process', 'Establish a formal process for assessing the impacts of AI systems on individuals, groups and society.', 'High', 'Impact Assessment'),
  ctl('fw-iso42001', 'A.5.3', 'Assessing impacts of AI systems', 'Documentation of Impact Assessments', 'Document the results of AI system impact assessments and retain them for review.', 'Medium', 'Impact Assessment'),
  ctl('fw-iso42001', 'A.5.4', 'Assessing impacts of AI systems', 'Assessing Impact on Individuals or Groups', 'Assess potential consequences for individuals or groups of individuals affected by the AI system.', 'High', 'Impact Assessment'),
  ctl('fw-iso42001', 'A.5.5', 'Assessing impacts of AI systems', 'Assessing Societal Impacts', 'Assess the broader societal impacts of AI systems throughout their lifecycle.', 'High', 'Impact Assessment'),
  // A.6 AI system life cycle
  ctl('fw-iso42001', 'A.6.1.2', 'AI system life cycle', 'Objectives for Responsible Development', 'Establish documented objectives for responsible development and integrate measures to achieve them.', 'High', 'Lifecycle'),
  ctl('fw-iso42001', 'A.6.1.3', 'AI system life cycle', 'Processes for Responsible Design and Development', 'Define and document processes for the responsible design and development of AI systems.', 'High', 'Lifecycle'),
  ctl('fw-iso42001', 'A.6.2.2', 'AI system life cycle', 'AI System Requirements and Specification', 'Document what the AI system must and must not do, including performance and constraint requirements.', 'Medium', 'Lifecycle'),
  ctl('fw-iso42001', 'A.6.2.3', 'AI system life cycle', 'Documentation of Design and Development', 'Record AI system design and development against objectives, requirements and specification criteria.', 'Medium', 'Lifecycle'),
  ctl('fw-iso42001', 'A.6.2.4', 'AI system life cycle', 'Verification and Validation', 'Define and apply verification and validation measures and criteria for AI systems.', 'High', 'Lifecycle'),
  ctl('fw-iso42001', 'A.6.2.5', 'AI system life cycle', 'AI System Deployment', 'Document a deployment plan and ensure requirements are met prior to deployment.', 'Medium', 'Lifecycle'),
  ctl('fw-iso42001', 'A.6.2.6', 'AI system life cycle', 'Operation and Monitoring', 'Plan for and perform ongoing oversight and monitoring of AI systems after deployment.', 'High', 'Lifecycle'),
  ctl('fw-iso42001', 'A.6.2.7', 'AI system life cycle', 'AI System Technical Documentation', 'Determine and provide the technical documentation needed by each relevant category of interested parties.', 'Medium', 'Lifecycle'),
  ctl('fw-iso42001', 'A.6.2.8', 'AI system life cycle', 'Recording of Event Logs', 'Record key events across the AI system lifecycle to support audit, traceability and explanation.', 'Medium', 'Lifecycle'),
  // A.7 Data for AI systems
  ctl('fw-iso42001', 'A.7.2', 'Data for AI systems', 'Data for Development and Enhancement', 'Define, document and implement data management processes for developing and enhancing AI systems.', 'High', 'Data'),
  ctl('fw-iso42001', 'A.7.3', 'Data for AI systems', 'Acquisition of Data', 'Document the sources of data and the legal basis for acquiring and using it.', 'Medium', 'Data'),
  ctl('fw-iso42001', 'A.7.4', 'Data for AI systems', 'Quality of Data for AI Systems', 'Define and measure data quality criteria for data used to build and operate AI systems.', 'High', 'Data'),
  ctl('fw-iso42001', 'A.7.5', 'Data for AI systems', 'Data Provenance', 'Record the provenance of data, tracking its origin and transformations (data lineage).', 'Medium', 'Data'),
  ctl('fw-iso42001', 'A.7.6', 'Data for AI systems', 'Data Preparation', 'Define and document criteria and methods for selecting and preparing data.', 'Medium', 'Data'),
  // A.8 Information for interested parties of AI systems
  ctl('fw-iso42001', 'A.8.2', 'Information for interested parties', 'System Documentation and Information for Users', 'Provide clear instructions, capabilities and limitations so users can understand and operate the AI system.', 'Medium', 'Transparency'),
  ctl('fw-iso42001', 'A.8.3', 'Information for interested parties', 'External Reporting', 'Provide a channel for external interested parties to report problems and adverse impacts.', 'Medium', 'Transparency'),
  ctl('fw-iso42001', 'A.8.4', 'Information for interested parties', 'Communication of Incidents', 'Plan for and communicate AI system incidents, failures or breaches to relevant parties.', 'High', 'Transparency'),
  ctl('fw-iso42001', 'A.8.5', 'Information for interested parties', 'Information for Interested Parties', 'Determine and document obligations to report information about AI systems to interested parties.', 'Medium', 'Transparency'),
  // A.9 Use of AI systems
  ctl('fw-iso42001', 'A.9.2', 'Use of AI systems', 'Processes for Responsible Use', 'Define how the AI system should be operated day-to-day in line with policy.', 'High', 'Operations'),
  ctl('fw-iso42001', 'A.9.3', 'Use of AI systems', 'Objectives for Responsible Use', 'Identify and record the objectives that guide the responsible use of AI systems.', 'Medium', 'Operations'),
  ctl('fw-iso42001', 'A.9.4', 'Use of AI systems', 'Intended Use of the AI System', 'Ensure the AI system is used in accordance with its documented intended purpose, preventing mission creep.', 'Medium', 'Operations'),
  // A.10 Third-party and customer relationships
  ctl('fw-iso42001', 'A.10.2', 'Third-party and customer relationships', 'Allocating Responsibilities', 'Clearly allocate responsibilities between the organisation, third parties and customers by contract.', 'High', 'Third-Party'),
  ctl('fw-iso42001', 'A.10.3', 'Third-party and customer relationships', 'Suppliers', 'Vet suppliers and contractually bind them to the organisation’s responsible-AI requirements.', 'High', 'Third-Party'),
  ctl('fw-iso42001', 'A.10.4', 'Third-party and customer relationships', 'Customers', 'Ensure the responsible approach to AI considers customer expectations and needs.', 'Medium', 'Third-Party'),

  // ISO/IEC 27001:2022 — Annex A (all 93 controls, A.5–A.8)
  // A.5 Organizational controls (37)
  ctl('fw-iso27001', 'A.5.1', 'Organizational controls', 'Policies for Information Security', 'Define, approve and communicate an information security policy set.', 'High', 'Governance'),
  ctl('fw-iso27001', 'A.5.2', 'Organizational controls', 'Information Security Roles and Responsibilities', 'Define and allocate information security roles and responsibilities.', 'High', 'Governance'),
  ctl('fw-iso27001', 'A.5.3', 'Organizational controls', 'Segregation of Duties', 'Segregate conflicting duties and areas of responsibility.', 'Medium', 'Governance'),
  ctl('fw-iso27001', 'A.5.4', 'Organizational controls', 'Management Responsibilities', 'Require management to enforce information security per policy.', 'Medium', 'Governance'),
  ctl('fw-iso27001', 'A.5.5', 'Organizational controls', 'Contact with Authorities', 'Maintain contact with relevant authorities.', 'Low', 'Governance'),
  ctl('fw-iso27001', 'A.5.6', 'Organizational controls', 'Contact with Special Interest Groups', 'Maintain contact with special interest groups and security forums.', 'Low', 'Governance'),
  ctl('fw-iso27001', 'A.5.7', 'Organizational controls', 'Threat Intelligence', 'Collect and analyse threat intelligence to inform mitigation.', 'Medium', 'Threat Management'),
  ctl('fw-iso27001', 'A.5.8', 'Organizational controls', 'Information Security in Project Management', 'Integrate information security into project management.', 'Medium', 'Governance'),
  ctl('fw-iso27001', 'A.5.9', 'Organizational controls', 'Inventory of Information and Other Associated Assets', 'Develop and maintain an inventory of information and associated assets.', 'High', 'Asset Management'),
  ctl('fw-iso27001', 'A.5.10', 'Organizational controls', 'Acceptable Use of Information and Other Associated Assets', 'Define rules for acceptable use and handling of assets.', 'Medium', 'Asset Management'),
  ctl('fw-iso27001', 'A.5.11', 'Organizational controls', 'Return of Assets', 'Ensure return of assets on termination or change of employment.', 'Medium', 'Asset Management'),
  ctl('fw-iso27001', 'A.5.12', 'Organizational controls', 'Classification of Information', 'Classify information by its value, sensitivity and criticality.', 'High', 'Asset Management'),
  ctl('fw-iso27001', 'A.5.13', 'Organizational controls', 'Labelling of Information', 'Label information in accordance with the classification scheme.', 'Medium', 'Asset Management'),
  ctl('fw-iso27001', 'A.5.14', 'Organizational controls', 'Information Transfer', 'Establish rules and agreements for secure information transfer.', 'Medium', 'Data Protection'),
  ctl('fw-iso27001', 'A.5.15', 'Organizational controls', 'Access Control', 'Establish rules to control physical and logical access to assets.', 'High', 'Access Control'),
  ctl('fw-iso27001', 'A.5.16', 'Organizational controls', 'Identity Management', 'Manage the full lifecycle of identities.', 'High', 'Access Control'),
  ctl('fw-iso27001', 'A.5.17', 'Organizational controls', 'Authentication Information', 'Control the allocation and management of authentication information.', 'High', 'Access Control'),
  ctl('fw-iso27001', 'A.5.18', 'Organizational controls', 'Access Rights', 'Provision, review, modify and remove access rights per policy.', 'High', 'Access Control'),
  ctl('fw-iso27001', 'A.5.19', 'Organizational controls', 'Information Security in Supplier Relationships', 'Manage information security risks in supplier relationships.', 'Medium', 'Supplier'),
  ctl('fw-iso27001', 'A.5.20', 'Organizational controls', 'Addressing Information Security Within Supplier Agreements', 'Establish security requirements in supplier agreements.', 'Medium', 'Supplier'),
  ctl('fw-iso27001', 'A.5.21', 'Organizational controls', 'Managing Information Security in the ICT Supply Chain', 'Manage security risks across the ICT supply chain.', 'Medium', 'Supplier'),
  ctl('fw-iso27001', 'A.5.22', 'Organizational controls', 'Monitoring, Review and Change Management of Supplier Services', 'Monitor, review and manage changes to supplier services.', 'Medium', 'Supplier'),
  ctl('fw-iso27001', 'A.5.23', 'Organizational controls', 'Information Security for Use of Cloud Services', 'Manage information security for the use of cloud services.', 'High', 'Supplier'),
  ctl('fw-iso27001', 'A.5.24', 'Organizational controls', 'Information Security Incident Management Planning and Preparation', 'Plan and prepare for managing information security incidents.', 'High', 'Incident Management'),
  ctl('fw-iso27001', 'A.5.25', 'Organizational controls', 'Assessment and Decision on Information Security Events', 'Assess and decide on categorisation of security events.', 'Medium', 'Incident Management'),
  ctl('fw-iso27001', 'A.5.26', 'Organizational controls', 'Response to Information Security Incidents', 'Respond to information security incidents per procedures.', 'High', 'Incident Management'),
  ctl('fw-iso27001', 'A.5.27', 'Organizational controls', 'Learning from Information Security Incidents', 'Use lessons from incidents to strengthen controls.', 'Medium', 'Incident Management'),
  ctl('fw-iso27001', 'A.5.28', 'Organizational controls', 'Collection of Evidence', 'Establish procedures for identification and collection of evidence.', 'Medium', 'Incident Management'),
  ctl('fw-iso27001', 'A.5.29', 'Organizational controls', 'Information Security During Disruption', 'Maintain information security during disruption.', 'High', 'Continuity'),
  ctl('fw-iso27001', 'A.5.30', 'Organizational controls', 'ICT Readiness for Business Continuity', 'Plan and test ICT readiness for business continuity.', 'High', 'Continuity'),
  ctl('fw-iso27001', 'A.5.31', 'Organizational controls', 'Legal, Statutory, Regulatory and Contractual Requirements', 'Identify and meet legal, statutory, regulatory and contractual requirements.', 'High', 'Compliance'),
  ctl('fw-iso27001', 'A.5.32', 'Organizational controls', 'Intellectual Property Rights', 'Protect intellectual property rights.', 'Medium', 'Compliance'),
  ctl('fw-iso27001', 'A.5.33', 'Organizational controls', 'Protection of Records', 'Protect records from loss, destruction, falsification and unauthorised access.', 'Medium', 'Compliance'),
  ctl('fw-iso27001', 'A.5.34', 'Organizational controls', 'Privacy and Protection of PII', 'Protect privacy and personally identifiable information.', 'High', 'Compliance'),
  ctl('fw-iso27001', 'A.5.35', 'Organizational controls', 'Independent Review of Information Security', 'Independently review the information security approach at planned intervals.', 'Medium', 'Compliance'),
  ctl('fw-iso27001', 'A.5.36', 'Organizational controls', 'Compliance with Policies, Rules and Standards for Information Security', 'Regularly review compliance with security policies and standards.', 'Medium', 'Compliance'),
  ctl('fw-iso27001', 'A.5.37', 'Organizational controls', 'Documented Operating Procedures', 'Document operating procedures and make them available.', 'Medium', 'Operations'),
  // A.6 People controls (8)
  ctl('fw-iso27001', 'A.6.1', 'People controls', 'Screening', 'Conduct background verification checks on candidates.', 'Medium', 'People'),
  ctl('fw-iso27001', 'A.6.2', 'People controls', 'Terms and Conditions of Employment', 'State information security responsibilities in employment terms.', 'Medium', 'People'),
  ctl('fw-iso27001', 'A.6.3', 'People controls', 'Information Security Awareness, Education and Training', 'Provide security awareness, education and training to personnel.', 'High', 'People'),
  ctl('fw-iso27001', 'A.6.4', 'People controls', 'Disciplinary Process', 'Establish a disciplinary process for security policy violations.', 'Low', 'People'),
  ctl('fw-iso27001', 'A.6.5', 'People controls', 'Responsibilities After Termination or Change of Employment', 'Define security responsibilities that remain after employment changes.', 'Medium', 'People'),
  ctl('fw-iso27001', 'A.6.6', 'People controls', 'Confidentiality or Non-Disclosure Agreements', 'Establish confidentiality or non-disclosure agreements.', 'Medium', 'People'),
  ctl('fw-iso27001', 'A.6.7', 'People controls', 'Remote Working', 'Apply security measures when personnel work remotely.', 'Medium', 'People'),
  ctl('fw-iso27001', 'A.6.8', 'People controls', 'Information Security Event Reporting', 'Provide a mechanism to report security events promptly.', 'Medium', 'People'),
  // A.7 Physical controls (14)
  ctl('fw-iso27001', 'A.7.1', 'Physical controls', 'Physical Security Perimeters', 'Define and protect physical security perimeters.', 'Medium', 'Physical'),
  ctl('fw-iso27001', 'A.7.2', 'Physical controls', 'Physical Entry', 'Protect secure areas by appropriate entry controls.', 'Medium', 'Physical'),
  ctl('fw-iso27001', 'A.7.3', 'Physical controls', 'Securing Offices, Rooms and Facilities', 'Design and apply physical security for offices and facilities.', 'Medium', 'Physical'),
  ctl('fw-iso27001', 'A.7.4', 'Physical controls', 'Physical Security Monitoring', 'Continuously monitor premises for unauthorised physical access.', 'Medium', 'Physical'),
  ctl('fw-iso27001', 'A.7.5', 'Physical controls', 'Protecting Against Physical and Environmental Threats', 'Protect against physical and environmental threats.', 'Medium', 'Physical'),
  ctl('fw-iso27001', 'A.7.6', 'Physical controls', 'Working in Secure Areas', 'Apply security measures for working in secure areas.', 'Low', 'Physical'),
  ctl('fw-iso27001', 'A.7.7', 'Physical controls', 'Clear Desk and Clear Screen', 'Enforce clear desk and clear screen rules.', 'Low', 'Physical'),
  ctl('fw-iso27001', 'A.7.8', 'Physical controls', 'Equipment Siting and Protection', 'Site and protect equipment securely.', 'Medium', 'Physical'),
  ctl('fw-iso27001', 'A.7.9', 'Physical controls', 'Security of Assets Off-Premises', 'Protect assets located off-premises.', 'Medium', 'Physical'),
  ctl('fw-iso27001', 'A.7.10', 'Physical controls', 'Storage Media', 'Manage storage media through its lifecycle.', 'Medium', 'Physical'),
  ctl('fw-iso27001', 'A.7.11', 'Physical controls', 'Supporting Utilities', 'Protect facilities from failure of supporting utilities.', 'Low', 'Physical'),
  ctl('fw-iso27001', 'A.7.12', 'Physical controls', 'Cabling Security', 'Protect power and telecommunications cabling.', 'Low', 'Physical'),
  ctl('fw-iso27001', 'A.7.13', 'Physical controls', 'Equipment Maintenance', 'Maintain equipment correctly to ensure availability and integrity.', 'Low', 'Physical'),
  ctl('fw-iso27001', 'A.7.14', 'Physical controls', 'Secure Disposal or Re-use of Equipment', 'Securely dispose of or re-use equipment containing storage media.', 'Medium', 'Physical'),
  // A.8 Technological controls (34)
  ctl('fw-iso27001', 'A.8.1', 'Technological controls', 'User Endpoint Devices', 'Protect information on user endpoint devices.', 'Medium', 'Endpoint'),
  ctl('fw-iso27001', 'A.8.2', 'Technological controls', 'Privileged Access Rights', 'Restrict and manage the allocation of privileged access rights.', 'High', 'Access Control'),
  ctl('fw-iso27001', 'A.8.3', 'Technological controls', 'Information Access Restriction', 'Restrict access to information per the access control policy.', 'High', 'Access Control'),
  ctl('fw-iso27001', 'A.8.4', 'Technological controls', 'Access to Source Code', 'Manage read and write access to source code.', 'Medium', 'Access Control'),
  ctl('fw-iso27001', 'A.8.5', 'Technological controls', 'Secure Authentication', 'Implement secure authentication technologies and procedures.', 'High', 'Access Control'),
  ctl('fw-iso27001', 'A.8.6', 'Technological controls', 'Capacity Management', 'Monitor and adjust the use of resources to meet capacity requirements.', 'Medium', 'Operations'),
  ctl('fw-iso27001', 'A.8.7', 'Technological controls', 'Protection Against Malware', 'Protect against malware with technical and awareness measures.', 'High', 'Malware'),
  ctl('fw-iso27001', 'A.8.8', 'Technological controls', 'Management of Technical Vulnerabilities', 'Obtain, evaluate and act on technical vulnerability information.', 'High', 'Vulnerability Management'),
  ctl('fw-iso27001', 'A.8.9', 'Technological controls', 'Configuration Management', 'Establish and manage secure configurations of systems.', 'Medium', 'Operations'),
  ctl('fw-iso27001', 'A.8.10', 'Technological controls', 'Information Deletion', 'Delete information when no longer required.', 'Medium', 'Data Protection'),
  ctl('fw-iso27001', 'A.8.11', 'Technological controls', 'Data Masking', 'Use data masking to limit exposure of sensitive data.', 'Medium', 'Data Protection'),
  ctl('fw-iso27001', 'A.8.12', 'Technological controls', 'Data Leakage Prevention', 'Apply measures to prevent data leakage.', 'High', 'Data Protection'),
  ctl('fw-iso27001', 'A.8.13', 'Technological controls', 'Information Backup', 'Maintain and test backups of information and software.', 'High', 'Continuity'),
  ctl('fw-iso27001', 'A.8.14', 'Technological controls', 'Redundancy of Information Processing Facilities', 'Provide sufficient redundancy to meet availability requirements.', 'Medium', 'Continuity'),
  ctl('fw-iso27001', 'A.8.15', 'Technological controls', 'Logging', 'Produce, store and protect logs of activities.', 'Medium', 'Logging & Monitoring'),
  ctl('fw-iso27001', 'A.8.16', 'Technological controls', 'Monitoring Activities', 'Monitor networks and systems for anomalous behaviour.', 'Medium', 'Logging & Monitoring'),
  ctl('fw-iso27001', 'A.8.17', 'Technological controls', 'Clock Synchronisation', 'Synchronise clocks of systems to an approved time source.', 'Low', 'Logging & Monitoring'),
  ctl('fw-iso27001', 'A.8.18', 'Technological controls', 'Use of Privileged Utility Programs', 'Restrict and control use of privileged utility programs.', 'Medium', 'Access Control'),
  ctl('fw-iso27001', 'A.8.19', 'Technological controls', 'Installation of Software on Operational Systems', 'Control the installation of software on operational systems.', 'Medium', 'Operations'),
  ctl('fw-iso27001', 'A.8.20', 'Technological controls', 'Networks Security', 'Secure and manage networks to protect information.', 'High', 'Network Security'),
  ctl('fw-iso27001', 'A.8.21', 'Technological controls', 'Security of Network Services', 'Identify and manage security of network services.', 'Medium', 'Network Security'),
  ctl('fw-iso27001', 'A.8.22', 'Technological controls', 'Segregation of Networks', 'Segregate groups of services, users and systems on networks.', 'Medium', 'Network Security'),
  ctl('fw-iso27001', 'A.8.23', 'Technological controls', 'Web Filtering', 'Manage access to external websites to reduce exposure.', 'Medium', 'Network Security'),
  ctl('fw-iso27001', 'A.8.24', 'Technological controls', 'Use of Cryptography', 'Define and implement rules for the effective use of cryptography.', 'High', 'Cryptography'),
  ctl('fw-iso27001', 'A.8.25', 'Technological controls', 'Secure Development Life Cycle', 'Establish rules for the secure development of software and systems.', 'High', 'Secure Development'),
  ctl('fw-iso27001', 'A.8.26', 'Technological controls', 'Application Security Requirements', 'Define and apply application security requirements.', 'Medium', 'Secure Development'),
  ctl('fw-iso27001', 'A.8.27', 'Technological controls', 'Secure System Architecture and Engineering Principles', 'Apply secure system architecture and engineering principles.', 'Medium', 'Secure Development'),
  ctl('fw-iso27001', 'A.8.28', 'Technological controls', 'Secure Coding', 'Apply secure coding principles to software development.', 'Medium', 'Secure Development'),
  ctl('fw-iso27001', 'A.8.29', 'Technological controls', 'Security Testing in Development and Acceptance', 'Define and perform security testing in development and acceptance.', 'Medium', 'Secure Development'),
  ctl('fw-iso27001', 'A.8.30', 'Technological controls', 'Outsourced Development', 'Direct and monitor outsourced system development.', 'Medium', 'Secure Development'),
  ctl('fw-iso27001', 'A.8.31', 'Technological controls', 'Separation of Development, Test and Production Environments', 'Separate development, test and production environments.', 'Medium', 'Secure Development'),
  ctl('fw-iso27001', 'A.8.32', 'Technological controls', 'Change Management', 'Control changes to information processing facilities and systems.', 'Medium', 'Operations'),
  ctl('fw-iso27001', 'A.8.33', 'Technological controls', 'Test Information', 'Select, protect and manage test information.', 'Low', 'Secure Development'),
  ctl('fw-iso27001', 'A.8.34', 'Technological controls', 'Protection of Information Systems During Audit Testing', 'Plan and agree audit tests to minimise disruption to systems.', 'Low', 'Compliance'),

  // NIST CSF 2.0 (all 106 subcategories across 6 functions / 22 categories)
  ctl('fw-nistcsf', 'GV.OC-01', 'Govern', 'Organizational mission is understood and informs cybersecurity risk management', 'Organizational mission is understood and informs cybersecurity risk management', 'Medium', 'Organizational Context'),
  ctl('fw-nistcsf', 'GV.OC-02', 'Govern', 'Internal and external stakeholders are understood and their cybersecurity expectations considered', 'Internal and external stakeholders are understood and their cybersecurity expectations considered', 'Medium', 'Organizational Context'),
  ctl('fw-nistcsf', 'GV.OC-03', 'Govern', 'Legal, regulatory and contractual cybersecurity requirements are understood and managed', 'Legal, regulatory and contractual cybersecurity requirements are understood and managed', 'Medium', 'Organizational Context'),
  ctl('fw-nistcsf', 'GV.OC-04', 'Govern', 'Critical objectives, capabilities and services that stakeholders depend on are understood', 'Critical objectives, capabilities and services that stakeholders depend on are understood', 'Medium', 'Organizational Context'),
  ctl('fw-nistcsf', 'GV.OC-05', 'Govern', 'Outcomes, capabilities and services the organization depends on are understood', 'Outcomes, capabilities and services the organization depends on are understood', 'Medium', 'Organizational Context'),
  ctl('fw-nistcsf', 'GV.RM-01', 'Govern', 'Risk management objectives are established and agreed by stakeholders', 'Risk management objectives are established and agreed by stakeholders', 'Medium', 'Risk Management Strategy'),
  ctl('fw-nistcsf', 'GV.RM-02', 'Govern', 'Risk appetite and risk tolerance statements are established and communicated', 'Risk appetite and risk tolerance statements are established and communicated', 'Medium', 'Risk Management Strategy'),
  ctl('fw-nistcsf', 'GV.RM-03', 'Govern', 'Cybersecurity risk management is integrated into enterprise risk management', 'Cybersecurity risk management is integrated into enterprise risk management', 'Medium', 'Risk Management Strategy'),
  ctl('fw-nistcsf', 'GV.RM-04', 'Govern', 'Strategic direction describing appropriate risk response options is established and communicated', 'Strategic direction describing appropriate risk response options is established and communicated', 'Medium', 'Risk Management Strategy'),
  ctl('fw-nistcsf', 'GV.RM-05', 'Govern', 'Lines of communication across the organization for cybersecurity risks are established', 'Lines of communication across the organization for cybersecurity risks are established', 'Medium', 'Risk Management Strategy'),
  ctl('fw-nistcsf', 'GV.RM-06', 'Govern', 'A standardized method for calculating, documenting and prioritizing risk is established', 'A standardized method for calculating, documenting and prioritizing risk is established', 'Medium', 'Risk Management Strategy'),
  ctl('fw-nistcsf', 'GV.RM-07', 'Govern', 'Strategic opportunities (positive risks) are characterized and included in risk discussions', 'Strategic opportunities (positive risks) are characterized and included in risk discussions', 'Medium', 'Risk Management Strategy'),
  ctl('fw-nistcsf', 'GV.RR-01', 'Govern', 'Leadership is accountable for cybersecurity risk and fosters a risk-aware culture', 'Leadership is accountable for cybersecurity risk and fosters a risk-aware culture', 'Medium', 'Roles, Responsibilities & Authorities'),
  ctl('fw-nistcsf', 'GV.RR-02', 'Govern', 'Roles, responsibilities and authorities for cybersecurity risk are established and communicated', 'Roles, responsibilities and authorities for cybersecurity risk are established and communicated', 'Medium', 'Roles, Responsibilities & Authorities'),
  ctl('fw-nistcsf', 'GV.RR-03', 'Govern', 'Adequate resources are allocated commensurate with the cybersecurity risk strategy', 'Adequate resources are allocated commensurate with the cybersecurity risk strategy', 'Medium', 'Roles, Responsibilities & Authorities'),
  ctl('fw-nistcsf', 'GV.RR-04', 'Govern', 'Cybersecurity is included in human resources practices', 'Cybersecurity is included in human resources practices', 'Medium', 'Roles, Responsibilities & Authorities'),
  ctl('fw-nistcsf', 'GV.PO-01', 'Govern', 'Policy for managing cybersecurity risks is established and communicated', 'Policy for managing cybersecurity risks is established and communicated', 'Medium', 'Policy'),
  ctl('fw-nistcsf', 'GV.PO-02', 'Govern', 'Policy is reviewed, updated, communicated and enforced to reflect changes', 'Policy is reviewed, updated, communicated and enforced to reflect changes', 'Medium', 'Policy'),
  ctl('fw-nistcsf', 'GV.OV-01', 'Govern', 'Cybersecurity risk management strategy outcomes are reviewed to inform and adjust strategy', 'Cybersecurity risk management strategy outcomes are reviewed to inform and adjust strategy', 'Medium', 'Oversight'),
  ctl('fw-nistcsf', 'GV.OV-02', 'Govern', 'The risk management strategy is reviewed and adjusted to ensure coverage of requirements and risks', 'The risk management strategy is reviewed and adjusted to ensure coverage of requirements and risks', 'Medium', 'Oversight'),
  ctl('fw-nistcsf', 'GV.OV-03', 'Govern', 'Cybersecurity risk management performance is evaluated and reviewed for adjustments', 'Cybersecurity risk management performance is evaluated and reviewed for adjustments', 'Medium', 'Oversight'),
  ctl('fw-nistcsf', 'GV.SC-01', 'Govern', 'A cybersecurity supply chain risk management program and strategy are established and agreed', 'A cybersecurity supply chain risk management program and strategy are established and agreed', 'Medium', 'Cybersecurity Supply Chain Risk Management'),
  ctl('fw-nistcsf', 'GV.SC-02', 'Govern', 'Cybersecurity roles for suppliers, customers and partners are established and coordinated', 'Cybersecurity roles for suppliers, customers and partners are established and coordinated', 'Medium', 'Cybersecurity Supply Chain Risk Management'),
  ctl('fw-nistcsf', 'GV.SC-03', 'Govern', 'Supply chain risk management is integrated into cybersecurity and enterprise risk management', 'Supply chain risk management is integrated into cybersecurity and enterprise risk management', 'Medium', 'Cybersecurity Supply Chain Risk Management'),
  ctl('fw-nistcsf', 'GV.SC-04', 'Govern', 'Suppliers are known and prioritized by criticality', 'Suppliers are known and prioritized by criticality', 'Medium', 'Cybersecurity Supply Chain Risk Management'),
  ctl('fw-nistcsf', 'GV.SC-05', 'Govern', 'Requirements to address cybersecurity risks in supply chains are established and included in contracts', 'Requirements to address cybersecurity risks in supply chains are established and included in contracts', 'Medium', 'Cybersecurity Supply Chain Risk Management'),
  ctl('fw-nistcsf', 'GV.SC-06', 'Govern', 'Planning and due diligence are performed to reduce risks before entering supplier relationships', 'Planning and due diligence are performed to reduce risks before entering supplier relationships', 'Medium', 'Cybersecurity Supply Chain Risk Management'),
  ctl('fw-nistcsf', 'GV.SC-07', 'Govern', 'Risks posed by suppliers and their products are understood, recorded, prioritized and monitored', 'Risks posed by suppliers and their products are understood, recorded, prioritized and monitored', 'Medium', 'Cybersecurity Supply Chain Risk Management'),
  ctl('fw-nistcsf', 'GV.SC-08', 'Govern', 'Relevant suppliers are included in incident planning, response and recovery activities', 'Relevant suppliers are included in incident planning, response and recovery activities', 'Medium', 'Cybersecurity Supply Chain Risk Management'),
  ctl('fw-nistcsf', 'GV.SC-09', 'Govern', 'Supply chain security practices are integrated into cybersecurity programs and monitored', 'Supply chain security practices are integrated into cybersecurity programs and monitored', 'Medium', 'Cybersecurity Supply Chain Risk Management'),
  ctl('fw-nistcsf', 'GV.SC-10', 'Govern', 'Supply chain risk management plans include provisions for post-partnership activities', 'Supply chain risk management plans include provisions for post-partnership activities', 'Medium', 'Cybersecurity Supply Chain Risk Management'),
  ctl('fw-nistcsf', 'ID.AM-01', 'Identify', 'Inventories of hardware managed by the organization are maintained', 'Inventories of hardware managed by the organization are maintained', 'Medium', 'Asset Management'),
  ctl('fw-nistcsf', 'ID.AM-02', 'Identify', 'Inventories of software, services and systems managed by the organization are maintained', 'Inventories of software, services and systems managed by the organization are maintained', 'Medium', 'Asset Management'),
  ctl('fw-nistcsf', 'ID.AM-03', 'Identify', 'Representations of authorized network communication and data flows are maintained', 'Representations of authorized network communication and data flows are maintained', 'Medium', 'Asset Management'),
  ctl('fw-nistcsf', 'ID.AM-04', 'Identify', 'Inventories of services provided by suppliers are maintained', 'Inventories of services provided by suppliers are maintained', 'Medium', 'Asset Management'),
  ctl('fw-nistcsf', 'ID.AM-05', 'Identify', 'Assets are prioritized based on classification, criticality, resources and impact on the mission', 'Assets are prioritized based on classification, criticality, resources and impact on the mission', 'Medium', 'Asset Management'),
  ctl('fw-nistcsf', 'ID.AM-07', 'Identify', 'Inventories of data and corresponding metadata for designated data types are maintained', 'Inventories of data and corresponding metadata for designated data types are maintained', 'Medium', 'Asset Management'),
  ctl('fw-nistcsf', 'ID.AM-08', 'Identify', 'Systems, hardware, software, services and data are managed throughout their life cycles', 'Systems, hardware, software, services and data are managed throughout their life cycles', 'Medium', 'Asset Management'),
  ctl('fw-nistcsf', 'ID.RA-01', 'Identify', 'Vulnerabilities in assets are identified, validated and recorded', 'Vulnerabilities in assets are identified, validated and recorded', 'Medium', 'Risk Assessment'),
  ctl('fw-nistcsf', 'ID.RA-02', 'Identify', 'Cyber threat intelligence is received from information sharing forums and sources', 'Cyber threat intelligence is received from information sharing forums and sources', 'Medium', 'Risk Assessment'),
  ctl('fw-nistcsf', 'ID.RA-03', 'Identify', 'Internal and external threats to the organization are identified and recorded', 'Internal and external threats to the organization are identified and recorded', 'Medium', 'Risk Assessment'),
  ctl('fw-nistcsf', 'ID.RA-04', 'Identify', 'Potential impacts and likelihoods of threats exploiting vulnerabilities are identified and recorded', 'Potential impacts and likelihoods of threats exploiting vulnerabilities are identified and recorded', 'Medium', 'Risk Assessment'),
  ctl('fw-nistcsf', 'ID.RA-05', 'Identify', 'Threats, vulnerabilities, likelihoods and impacts are used to understand inherent risk and prioritize response', 'Threats, vulnerabilities, likelihoods and impacts are used to understand inherent risk and prioritize response', 'Medium', 'Risk Assessment'),
  ctl('fw-nistcsf', 'ID.RA-06', 'Identify', 'Risk responses are chosen, prioritized, planned, tracked and communicated', 'Risk responses are chosen, prioritized, planned, tracked and communicated', 'Medium', 'Risk Assessment'),
  ctl('fw-nistcsf', 'ID.RA-07', 'Identify', 'Changes and exceptions are managed, assessed for risk impact, recorded and tracked', 'Changes and exceptions are managed, assessed for risk impact, recorded and tracked', 'Medium', 'Risk Assessment'),
  ctl('fw-nistcsf', 'ID.RA-08', 'Identify', 'Processes for receiving, analyzing and responding to vulnerability disclosures are established', 'Processes for receiving, analyzing and responding to vulnerability disclosures are established', 'Medium', 'Risk Assessment'),
  ctl('fw-nistcsf', 'ID.RA-09', 'Identify', 'The authenticity and integrity of hardware and software are assessed prior to acquisition and use', 'The authenticity and integrity of hardware and software are assessed prior to acquisition and use', 'Medium', 'Risk Assessment'),
  ctl('fw-nistcsf', 'ID.RA-10', 'Identify', 'Critical suppliers are assessed prior to acquisition', 'Critical suppliers are assessed prior to acquisition', 'Medium', 'Risk Assessment'),
  ctl('fw-nistcsf', 'ID.IM-01', 'Identify', 'Improvements are identified from evaluations', 'Improvements are identified from evaluations', 'Medium', 'Improvement'),
  ctl('fw-nistcsf', 'ID.IM-02', 'Identify', 'Improvements are identified from security tests and exercises, including those with third parties', 'Improvements are identified from security tests and exercises, including those with third parties', 'Medium', 'Improvement'),
  ctl('fw-nistcsf', 'ID.IM-03', 'Identify', 'Improvements are identified from execution of operational processes, procedures and activities', 'Improvements are identified from execution of operational processes, procedures and activities', 'Medium', 'Improvement'),
  ctl('fw-nistcsf', 'ID.IM-04', 'Identify', 'Incident response and other cybersecurity plans are established, communicated, maintained and improved', 'Incident response and other cybersecurity plans are established, communicated, maintained and improved', 'Medium', 'Improvement'),
  ctl('fw-nistcsf', 'PR.AA-01', 'Protect', 'Identities and credentials for authorized users, services and hardware are managed', 'Identities and credentials for authorized users, services and hardware are managed', 'Medium', 'Identity Management, Authentication & Access Control'),
  ctl('fw-nistcsf', 'PR.AA-02', 'Protect', 'Identities are proofed and bound to credentials based on the context of interactions', 'Identities are proofed and bound to credentials based on the context of interactions', 'Medium', 'Identity Management, Authentication & Access Control'),
  ctl('fw-nistcsf', 'PR.AA-03', 'Protect', 'Users, services and hardware are authenticated', 'Users, services and hardware are authenticated', 'Medium', 'Identity Management, Authentication & Access Control'),
  ctl('fw-nistcsf', 'PR.AA-04', 'Protect', 'Identity assertions are protected, conveyed and verified', 'Identity assertions are protected, conveyed and verified', 'Medium', 'Identity Management, Authentication & Access Control'),
  ctl('fw-nistcsf', 'PR.AA-05', 'Protect', 'Access permissions, entitlements and authorizations are defined and enforced using least privilege and SoD', 'Access permissions, entitlements and authorizations are defined and enforced using least privilege and SoD', 'Medium', 'Identity Management, Authentication & Access Control'),
  ctl('fw-nistcsf', 'PR.AA-06', 'Protect', 'Physical access to assets is managed, monitored and enforced commensurate with risk', 'Physical access to assets is managed, monitored and enforced commensurate with risk', 'Medium', 'Identity Management, Authentication & Access Control'),
  ctl('fw-nistcsf', 'PR.AT-01', 'Protect', 'Personnel are provided awareness and training to perform general tasks with security in mind', 'Personnel are provided awareness and training to perform general tasks with security in mind', 'Medium', 'Awareness & Training'),
  ctl('fw-nistcsf', 'PR.AT-02', 'Protect', 'Individuals in specialized roles are provided awareness and training relevant to their roles', 'Individuals in specialized roles are provided awareness and training relevant to their roles', 'Medium', 'Awareness & Training'),
  ctl('fw-nistcsf', 'PR.DS-01', 'Protect', 'The confidentiality, integrity and availability of data-at-rest are protected', 'The confidentiality, integrity and availability of data-at-rest are protected', 'Medium', 'Data Security'),
  ctl('fw-nistcsf', 'PR.DS-02', 'Protect', 'The confidentiality, integrity and availability of data-in-transit are protected', 'The confidentiality, integrity and availability of data-in-transit are protected', 'Medium', 'Data Security'),
  ctl('fw-nistcsf', 'PR.DS-10', 'Protect', 'The confidentiality, integrity and availability of data-in-use are protected', 'The confidentiality, integrity and availability of data-in-use are protected', 'Medium', 'Data Security'),
  ctl('fw-nistcsf', 'PR.DS-11', 'Protect', 'Backups of data are created, protected, maintained and tested', 'Backups of data are created, protected, maintained and tested', 'Medium', 'Data Security'),
  ctl('fw-nistcsf', 'PR.PS-01', 'Protect', 'Configuration management practices are established and applied', 'Configuration management practices are established and applied', 'Medium', 'Platform Security'),
  ctl('fw-nistcsf', 'PR.PS-02', 'Protect', 'Software is maintained, replaced and removed commensurate with risk', 'Software is maintained, replaced and removed commensurate with risk', 'Medium', 'Platform Security'),
  ctl('fw-nistcsf', 'PR.PS-03', 'Protect', 'Hardware is maintained, replaced and removed commensurate with risk', 'Hardware is maintained, replaced and removed commensurate with risk', 'Medium', 'Platform Security'),
  ctl('fw-nistcsf', 'PR.PS-04', 'Protect', 'Log records are generated and made available for continuous monitoring', 'Log records are generated and made available for continuous monitoring', 'Medium', 'Platform Security'),
  ctl('fw-nistcsf', 'PR.PS-05', 'Protect', 'Installation and execution of unauthorized software are prevented', 'Installation and execution of unauthorized software are prevented', 'Medium', 'Platform Security'),
  ctl('fw-nistcsf', 'PR.PS-06', 'Protect', 'Secure software development practices are integrated and their performance monitored', 'Secure software development practices are integrated and their performance monitored', 'Medium', 'Platform Security'),
  ctl('fw-nistcsf', 'PR.IR-01', 'Protect', 'Networks and environments are protected from unauthorized logical access and usage', 'Networks and environments are protected from unauthorized logical access and usage', 'Medium', 'Technology Infrastructure Resilience'),
  ctl('fw-nistcsf', 'PR.IR-02', 'Protect', 'Technology assets are protected from environmental threats', 'Technology assets are protected from environmental threats', 'Medium', 'Technology Infrastructure Resilience'),
  ctl('fw-nistcsf', 'PR.IR-03', 'Protect', 'Mechanisms are implemented to achieve resilience requirements in normal and adverse situations', 'Mechanisms are implemented to achieve resilience requirements in normal and adverse situations', 'Medium', 'Technology Infrastructure Resilience'),
  ctl('fw-nistcsf', 'PR.IR-04', 'Protect', 'Adequate resource capacity to ensure availability is maintained', 'Adequate resource capacity to ensure availability is maintained', 'Medium', 'Technology Infrastructure Resilience'),
  ctl('fw-nistcsf', 'DE.CM-01', 'Detect', 'Networks and network services are monitored to find potentially adverse events', 'Networks and network services are monitored to find potentially adverse events', 'Medium', 'Continuous Monitoring'),
  ctl('fw-nistcsf', 'DE.CM-02', 'Detect', 'The physical environment is monitored to find potentially adverse events', 'The physical environment is monitored to find potentially adverse events', 'Medium', 'Continuous Monitoring'),
  ctl('fw-nistcsf', 'DE.CM-03', 'Detect', 'Personnel activity and technology usage are monitored to find potentially adverse events', 'Personnel activity and technology usage are monitored to find potentially adverse events', 'Medium', 'Continuous Monitoring'),
  ctl('fw-nistcsf', 'DE.CM-06', 'Detect', 'External service provider activities and services are monitored to find potentially adverse events', 'External service provider activities and services are monitored to find potentially adverse events', 'Medium', 'Continuous Monitoring'),
  ctl('fw-nistcsf', 'DE.CM-09', 'Detect', 'Computing hardware and software, runtime environments and their data are monitored', 'Computing hardware and software, runtime environments and their data are monitored', 'Medium', 'Continuous Monitoring'),
  ctl('fw-nistcsf', 'DE.AE-02', 'Detect', 'Potentially adverse events are analyzed to better understand associated activities', 'Potentially adverse events are analyzed to better understand associated activities', 'Medium', 'Adverse Event Analysis'),
  ctl('fw-nistcsf', 'DE.AE-03', 'Detect', 'Information is correlated from multiple sources', 'Information is correlated from multiple sources', 'Medium', 'Adverse Event Analysis'),
  ctl('fw-nistcsf', 'DE.AE-04', 'Detect', 'The estimated impact and scope of adverse events are understood', 'The estimated impact and scope of adverse events are understood', 'Medium', 'Adverse Event Analysis'),
  ctl('fw-nistcsf', 'DE.AE-06', 'Detect', 'Information on adverse events is provided to authorized staff and tools', 'Information on adverse events is provided to authorized staff and tools', 'Medium', 'Adverse Event Analysis'),
  ctl('fw-nistcsf', 'DE.AE-07', 'Detect', 'Cyber threat intelligence and other contextual information are integrated into the analysis', 'Cyber threat intelligence and other contextual information are integrated into the analysis', 'Medium', 'Adverse Event Analysis'),
  ctl('fw-nistcsf', 'DE.AE-08', 'Detect', 'Incidents are declared when adverse events meet the defined incident criteria', 'Incidents are declared when adverse events meet the defined incident criteria', 'Medium', 'Adverse Event Analysis'),
  ctl('fw-nistcsf', 'RS.MA-01', 'Respond', 'The incident response plan is executed in coordination with relevant third parties once declared', 'The incident response plan is executed in coordination with relevant third parties once declared', 'Medium', 'Incident Management'),
  ctl('fw-nistcsf', 'RS.MA-02', 'Respond', 'Incident reports are triaged and validated', 'Incident reports are triaged and validated', 'Medium', 'Incident Management'),
  ctl('fw-nistcsf', 'RS.MA-03', 'Respond', 'Incidents are categorized and prioritized', 'Incidents are categorized and prioritized', 'Medium', 'Incident Management'),
  ctl('fw-nistcsf', 'RS.MA-04', 'Respond', 'Incidents are escalated or elevated as needed', 'Incidents are escalated or elevated as needed', 'Medium', 'Incident Management'),
  ctl('fw-nistcsf', 'RS.MA-05', 'Respond', 'Criteria for initiating incident recovery are applied', 'Criteria for initiating incident recovery are applied', 'Medium', 'Incident Management'),
  ctl('fw-nistcsf', 'RS.AN-03', 'Respond', 'Analysis is performed to establish what took place during an incident and the root cause', 'Analysis is performed to establish what took place during an incident and the root cause', 'Medium', 'Incident Analysis'),
  ctl('fw-nistcsf', 'RS.AN-06', 'Respond', 'Actions performed during an investigation are recorded and their integrity preserved', 'Actions performed during an investigation are recorded and their integrity preserved', 'Medium', 'Incident Analysis'),
  ctl('fw-nistcsf', 'RS.AN-07', 'Respond', 'Incident data and metadata are collected and their integrity and provenance preserved', 'Incident data and metadata are collected and their integrity and provenance preserved', 'Medium', 'Incident Analysis'),
  ctl('fw-nistcsf', 'RS.AN-08', 'Respond', 'An incident magnitude is estimated and validated', 'An incident magnitude is estimated and validated', 'Medium', 'Incident Analysis'),
  ctl('fw-nistcsf', 'RS.CO-02', 'Respond', 'Internal and external stakeholders are notified of incidents', 'Internal and external stakeholders are notified of incidents', 'Medium', 'Incident Response Reporting & Communication'),
  ctl('fw-nistcsf', 'RS.CO-03', 'Respond', 'Information is shared with designated internal and external stakeholders', 'Information is shared with designated internal and external stakeholders', 'Medium', 'Incident Response Reporting & Communication'),
  ctl('fw-nistcsf', 'RS.MI-01', 'Respond', 'Incidents are contained', 'Incidents are contained', 'Medium', 'Incident Mitigation'),
  ctl('fw-nistcsf', 'RS.MI-02', 'Respond', 'Incidents are eradicated', 'Incidents are eradicated', 'Medium', 'Incident Mitigation'),
  ctl('fw-nistcsf', 'RC.RP-01', 'Recover', 'The recovery portion of the incident response plan is executed once initiated', 'The recovery portion of the incident response plan is executed once initiated', 'Medium', 'Incident Recovery Plan Execution'),
  ctl('fw-nistcsf', 'RC.RP-02', 'Recover', 'Recovery actions are selected, scoped, prioritized and performed', 'Recovery actions are selected, scoped, prioritized and performed', 'Medium', 'Incident Recovery Plan Execution'),
  ctl('fw-nistcsf', 'RC.RP-03', 'Recover', 'The integrity of backups and other restoration assets is verified before use for restoration', 'The integrity of backups and other restoration assets is verified before use for restoration', 'Medium', 'Incident Recovery Plan Execution'),
  ctl('fw-nistcsf', 'RC.RP-04', 'Recover', 'Critical mission functions and cybersecurity risk management are considered to establish post-incident norms', 'Critical mission functions and cybersecurity risk management are considered to establish post-incident norms', 'Medium', 'Incident Recovery Plan Execution'),
  ctl('fw-nistcsf', 'RC.RP-05', 'Recover', 'The integrity of restored assets is verified, systems and services restored, and normal status confirmed', 'The integrity of restored assets is verified, systems and services restored, and normal status confirmed', 'Medium', 'Incident Recovery Plan Execution'),
  ctl('fw-nistcsf', 'RC.RP-06', 'Recover', 'The end of incident recovery is declared and incident-related documentation is completed', 'The end of incident recovery is declared and incident-related documentation is completed', 'Medium', 'Incident Recovery Plan Execution'),
  ctl('fw-nistcsf', 'RC.CO-03', 'Recover', 'Recovery activities and progress are communicated to designated internal and external stakeholders', 'Recovery activities and progress are communicated to designated internal and external stakeholders', 'Medium', 'Incident Recovery Communication'),
  ctl('fw-nistcsf', 'RC.CO-04', 'Recover', 'Public updates on incident recovery are shared using approved methods and messaging', 'Public updates on incident recovery are shared using approved methods and messaging', 'Medium', 'Incident Recovery Communication'),

  // SOC 2 — Trust Services Criteria
  ctl('fw-soc2', 'CC1.1', 'Control Environment', 'Integrity and Ethical Values', 'Demonstrate a commitment to integrity and ethical values.', 'High', 'Governance'),
  ctl('fw-soc2', 'CC2.1', 'Communication & Information', 'Internal Communication', 'Internally communicate information needed to support internal control.', 'Medium', 'Communication'),
  ctl('fw-soc2', 'CC6.1', 'Logical & Physical Access', 'Logical Access Controls', 'Implement logical access security over protected information assets.', 'High', 'Access Control'),
  ctl('fw-soc2', 'CC6.6', 'Logical & Physical Access', 'Boundary Protection', 'Protect against threats from sources outside system boundaries.', 'High', 'Access Control'),
  ctl('fw-soc2', 'CC7.2', 'System Operations', 'Security Monitoring', 'Monitor system components for anomalies indicative of malicious acts.', 'Medium', 'Monitoring'),
  ctl('fw-soc2', 'A1.2', 'Availability', 'Environmental Protections', 'Maintain environmental protections and backup processes for availability.', 'Medium', 'Availability'),

  // PCI DSS v4.0
  ctl('fw-pcidss', '1.2.1', 'Network Security Controls', 'Configuration Standards', 'Define and apply configuration standards for network security controls.', 'High', 'Network Security'),
  ctl('fw-pcidss', '3.5.1', 'Protect Stored Data', 'Render PAN Unreadable', 'Render the primary account number unreadable wherever it is stored.', 'High', 'Data Protection'),
  ctl('fw-pcidss', '6.3.1', 'Secure Software', 'Vulnerability Management', 'Identify and manage security vulnerabilities in bespoke software.', 'High', 'Vulnerability Management'),
  ctl('fw-pcidss', '8.3.1', 'Strong Authentication', 'Multi-Factor Authentication', 'Enforce strong authentication for access to the cardholder data environment.', 'High', 'Access Control'),
  ctl('fw-pcidss', '10.2.1', 'Logging & Monitoring', 'Audit Logs', 'Implement audit logs to reconstruct events across system components.', 'Medium', 'Logging'),
  ctl('fw-pcidss', '11.3.1', 'Test Security', 'Vulnerability Scans', 'Perform internal and external vulnerability scans on a defined cadence.', 'Medium', 'Testing'),
];

function ctl(frameworkId: string, controlId: string, controlObjective: string, controlTitle: string, requirementSummary: string, priority: Priority, theme: string): FrameworkControl {
  return { id: `${frameworkId}::${controlId}`, frameworkId, controlId, controlObjective, controlTitle, requirementSummary, priority, theme };
}

// fill in controlCount per framework
FRAMEWORKS.forEach(f => { f.controlCount = CONTROLS.filter(c => c.frameworkId === f.id).length; });

// ── In-memory stores (persist for the session) ───────────────────────────────
const audits: Audit[] = [];
const auditControls: AuditControl[] = [];
const versionHistory: Record<string, ControlVersion[]> = {}; // keyed by auditControl id

const delay = (ms = 260) => new Promise<void>(r => setTimeout(r, ms));

// Email of the Control Lead used for the seeded demo audit (matches the
// controlLead@clovrix.com login), so the Assigned Controls page is populated
// out of the box. Real admin assignments flow into the same store.
export const DEMO_CONTROL_LEAD = 'controlLead@clovrix.com';

// ── HTTP helper (real backend — attaches Keycloak token + tenant) ─────────────
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';
async function http<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = getToken();
  const tenant = getActiveTenant();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Tenant-ID': tenant,
    ...((opts.headers as Record<string, string>) ?? {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  if (!res.ok) throw new Error((await res.text().catch(() => '')) || `HTTP ${res.status}`);
  if (res.status === 204) return {} as T;
  return res.json();
}

// Maps a backend AuditControlDto (camelCase) into the frontend AuditControl shape.
function mapAuditControl(r: any): AuditControl {
  const assignedLead = r.assignedControlLead ?? r.assigned_to ?? r.assignee ?? r.leadEmail ?? r.controlLead ?? '';
  return {
    id: r.id,
    auditId: r.auditId ?? r.audit_id,
    frameworkId: r.frameworkCode ?? r.framework_code ?? '',
    controlId: r.sourceControlId ?? r.source_control_id ?? r.controlId ?? r.control_ref ?? '',
    controlObjective: r.controlObjective ?? r.control_objective ?? '',
    controlTitle: r.controlTitle ?? r.control_title ?? r.title ?? '',
    requirementSummary: r.requirementSummary ?? r.requirement_summary ?? '',
    priority: (r.priority ?? 'Medium') as Priority,
    theme: r.theme ?? '',
    implementationStatus: (r.implementationStatus ?? r.implementation_status ?? 'Not Started') as ImplStatus,
    assignedControlLead: assignedLead,
    createdDate: (r.createdAt ?? r.created_at ?? '').slice(0, 10),
    version: r.version ?? 1,
  };
}

function mapAudit(a: any): Audit {
  return {
    id: a.id,
    name: a.name,
    description: a.description ?? '',
    department: a.department ?? '',
    businessUnit: a.businessUnit ?? '',
    startDate: a.startDate ?? '',
    endDate: a.endDate ?? '',
    frameworkId: a.frameworkCode ?? '',
    controlLead: a.controlLead ?? '',
    status: (a.status ?? 'draft') as Audit['status'],
    createdDate: (a.createdAt ?? '').slice(0, 10),
  };
}

// Live, DB-backed framework + audit setup API (Compliance Admin).
export const frameworkManagementApi = {
  // GET /api/frameworks — live framework list from the database
  async getFrameworks(): Promise<Framework[]> {
    const rows = await http<any[]>('/api/frameworks/');
    return rows.map(r => ({
      id: r.code, code: r.code, name: r.name, version: r.version ?? '',
      controlCount: r.control_count_live ?? r.domain_count_live ?? 0,
    }));
  },

  // GET /api/frameworks/{code}/controls — live control library from the database
  async getFrameworkControls(frameworkCode: string): Promise<FrameworkControl[]> {
    const rows = await http<any[]>(`/api/frameworks/${encodeURIComponent(frameworkCode)}/controls`);
    return rows.map(r => ({
      id: r.id,
      frameworkId: r.frameworkCode ?? frameworkCode,
      controlId: r.controlId,
      controlObjective: r.controlObjective ?? '',
      controlTitle: r.controlTitle,
      requirementSummary: r.requirementSummary ?? '',
      priority: (r.priority ?? 'Medium') as Priority,
      theme: r.theme ?? '',
    }));
  },

  // POST /api/audits
  async createAudit(input: Omit<Audit, 'id' | 'status' | 'createdDate'> & { status?: Audit['status'] }): Promise<Audit> {
    const a = await http<any>('/api/audits', {
      method: 'POST',
      body: JSON.stringify({
        name: input.name,
        description: input.description ?? null,
        department: input.department ?? null,
        businessUnit: input.businessUnit ?? null,
        frameworkCode: input.frameworkId,
        startDate: input.startDate || null,
        endDate: input.endDate || null,
        controlLead: input.controlLead ?? null,
      }),
    });
    return mapAudit(a);
  },

  // POST /api/audits/{id}/assign-controls — copies selected controls into AuditControls
  async assignControls(auditId: string, _frameworkId: string, controlIds: string[], controlLead: string): Promise<AuditControl[]> {
    const rows = await http<any[]>(`/api/audits/${auditId}/assign-controls`, {
      method: 'POST',
      body: JSON.stringify({ controlIds, controlLead }),
    });
    return rows.map(mapAuditControl);
  },

  // GET /api/audits/{id}
  async getAudit(auditId: string): Promise<{ audit: Audit | null; controls: AuditControl[] }> {
    const a = await http<any>(`/api/audits/${auditId}`);
    return { audit: a ? mapAudit(a) : null, controls: [] };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Demo seed — a completed assignment so the Control Lead's "Assigned Controls"
// page is populated on first load. Uses the ISO 42001 templates (deep-copied).
// ─────────────────────────────────────────────────────────────────────────────
(function seedDemoAssignment() {
  const demoAudit: Audit = {
    id: 'AUD-DEMO01',
    name: 'ISO 42001 Initial Certification — FY26',
    description: 'AI management system certification readiness assessment.',
    department: 'Risk & Compliance',
    businessUnit: 'AI Research Lab',
    startDate: '2026-07-01',
    endDate: '2026-09-30',
    frameworkId: 'fw-iso42001',
    controlLead: DEMO_CONTROL_LEAD,
    status: 'active',
    createdDate: '2026-07-01',
  };
  audits.push(demoAudit);

  const seedStatuses: ImplStatus[] = ['Completed', 'In Progress', 'In Progress', 'Not Started'];
  const templates = CONTROLS.filter(c => c.frameworkId === 'fw-iso42001');
  templates.forEach((src, i) => {
    const status = seedStatuses[i % seedStatuses.length];
    const enriched = i < 6; // first few come pre-populated to look realistic
    const ac: AuditControl = {
      id: `AC-${demoAudit.id}-${src.controlId}`,
      auditId: demoAudit.id,
      frameworkId: src.frameworkId,
      controlId: src.controlId,
      controlObjective: src.controlObjective,
      controlTitle: src.controlTitle,
      requirementSummary: src.requirementSummary,
      priority: src.priority,
      theme: src.theme,
      implementationStatus: status,
      assignedControlLead: DEMO_CONTROL_LEAD,
      createdDate: demoAudit.createdDate,
      version: enriched ? 2 : 1,
      policyName: enriched ? `${src.controlTitle} Policy` : undefined,
      policyDescription: enriched ? `Company policy governing "${src.controlTitle}" in line with ISO 42001 ${src.controlObjective}.` : undefined,
      evidenceRequired: enriched ? 'Signed policy document; approval record; last review date.' : undefined,
      implementationNotes: enriched ? 'Initial draft reviewed with governance team; pending final sign-off.' : undefined,
      readyForAssessment: status === 'Completed',
      lastSavedAt: enriched ? '2026-07-06T09:15:00.000Z' : undefined,
    };
    auditControls.push(ac);
    versionHistory[ac.id] = [{
      version: 1, field: 'Assignment', modifiedBy: 'Compliance Admin',
      modifiedDate: '2026-07-01T08:00:00.000Z', previousValue: '—',
      updatedValue: `Assigned to ${DEMO_CONTROL_LEAD}`,
    }];
    if (enriched) {
      versionHistory[ac.id].push({
        version: 2, field: 'Policy Name', modifiedBy: 'Control Lead',
        modifiedDate: '2026-07-06T09:15:00.000Z', previousValue: '—',
        updatedValue: ac.policyName!,
      });
    }
  });
})();

// ── Helper: record a version-history entry and bump the control version ───────
function pushVersion(ac: AuditControl, field: string, prev: string, next: string, modifiedBy: string) {
  const history = versionHistory[ac.id] ?? (versionHistory[ac.id] = []);
  ac.version += 1;
  ac.lastSavedAt = new Date().toISOString();
  history.push({
    version: ac.version, field, modifiedBy,
    modifiedDate: ac.lastSavedAt, previousValue: prev || '—', updatedValue: next || '—',
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Control Lead API — scoped strictly to controls assigned to the given lead.
// A Control Lead can only ever see and edit their own assigned controls; they
// cannot create audits, delete controls, change frameworks, or reassign.
// ─────────────────────────────────────────────────────────────────────────────
// Maps a backend AssignedControlDto (camelCase) → the frontend AuditControl shape.
function mapAssignedControl(r: any): AuditControl {
  const assignedLead = r.assignedControlLead ?? r.assigned_to ?? r.assignee ?? r.leadEmail ?? r.controlLead ?? '';
  return {
    id: r.id,
    auditId: r.auditId ?? r.audit_id,
    frameworkId: r.frameworkCode ?? r.framework_code ?? '',
    controlId: r.sourceControlId ?? r.source_control_id ?? r.controlId ?? r.control_ref ?? '',
    controlObjective: r.controlObjective ?? r.control_objective ?? '',
    controlTitle: r.controlTitle ?? r.control_title ?? r.title ?? '',
    requirementSummary: r.requirementSummary ?? r.requirement_summary ?? '',
    priority: (r.priority ?? 'Medium') as Priority,
    theme: r.theme ?? '',
    implementationStatus: (r.implementationStatus ?? r.implementation_status ?? 'Not Started') as ImplStatus,
    assignedControlLead: assignedLead,
    createdDate: (r.createdAt ?? r.created_at ?? '').slice(0, 10),
    version: r.version ?? 1,
    policyName: r.policyName ?? r.policy_name ?? undefined,
    policyDescription: r.policyDescription ?? r.policy_description ?? undefined,
    evidenceRequired: r.evidenceRequired ?? r.evidence_required ?? undefined,
    implementationNotes: r.implementationNotes ?? r.implementation_notes ?? undefined,
    readyForAssessment: r.readyForAssessment ?? r.ready_for_assessment ?? false,
    lastSavedAt: r.lastSavedAt ?? r.last_saved_at ?? undefined,
  };
}

function mapVersion(v: any): ControlVersion {
  return {
    version: v.version,
    field: v.changedField ?? v.field ?? '',
    modifiedBy: v.modifiedBy ?? '',
    modifiedDate: v.modifiedDate ?? '',
    previousValue: v.oldValue ?? v.previousValue ?? '—',
    updatedValue: v.newValue ?? v.updatedValue ?? '—',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Control Lead API — live DB. The server derives the caller from the JWT and
// enforces ownership/lock/closed guards, so the leadEmail/modifiedBy params are
// accepted for signature-compatibility but not sent.
// ─────────────────────────────────────────────────────────────────────────────
export const controlLeadApi = {
  // GET /api/assigned-controls
  async getAssignedControls(_leadEmail: string): Promise<AuditControl[]> {
    const rows = await http<any[]>('/api/assigned-controls');
    return rows.map(mapAssignedControl);
  },

  // GET /api/control/{id}
  async getControl(id: string, _leadEmail: string): Promise<AuditControl | null> {
    try {
      const r = await http<any>(`/api/control/${id}`);
      return r ? mapAssignedControl(r) : null;
    } catch { return null; }
  },

  // PUT /api/control/{id}/summary
  async updateSummary(id: string, _leadEmail: string, value: string, _modifiedBy: string): Promise<AuditControl | null> {
    const r = await http<any>(`/api/control/${id}/summary`, { method: 'PUT', body: JSON.stringify({ summary: value }) });
    return mapAssignedControl(r);
  },

  // PUT /api/control/{id}/policy
  async updatePolicy(id: string, _leadEmail: string, name: string, description: string, _modifiedBy: string): Promise<AuditControl | null> {
    const r = await http<any>(`/api/control/${id}/policy`, { method: 'PUT', body: JSON.stringify({ policyName: name, policyDescription: description }) });
    return mapAssignedControl(r);
  },

  // PUT /api/control/{id}/evidence
  async updateEvidence(id: string, _leadEmail: string, value: string, _modifiedBy: string): Promise<AuditControl | null> {
    const r = await http<any>(`/api/control/${id}/evidence`, { method: 'PUT', body: JSON.stringify({ evidence: value }) });
    return mapAssignedControl(r);
  },

  // PUT /api/control/{id}/notes
  async updateNotes(id: string, _leadEmail: string, value: string, _modifiedBy: string): Promise<AuditControl | null> {
    const r = await http<any>(`/api/control/${id}/notes`, { method: 'PUT', body: JSON.stringify({ notes: value }) });
    return mapAssignedControl(r);
  },

  // PUT /api/control/{id}/status
  async updateStatus(id: string, _leadEmail: string, value: ImplStatus, _modifiedBy: string): Promise<AuditControl | null> {
    const r = await http<any>(`/api/control/${id}/status`, { method: 'PUT', body: JSON.stringify({ status: value }) });
    return mapAssignedControl(r);
  },

  // POST /api/control/{id}/ready-for-assessment
  async markReadyForAssessment(id: string, _leadEmail: string, _modifiedBy: string): Promise<AuditControl | null> {
    const r = await http<any>(`/api/control/${id}/ready-for-assessment`, { method: 'POST' });
    return mapAssignedControl(r);
  },

  // GET /api/control/{id}/version-history
  async getVersionHistory(id: string): Promise<ControlVersion[]> {
    const rows = await http<any[]>(`/api/control/${id}/version-history`);
    return rows.map(mapVersion);
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Assessor — test controls that the Control Lead has marked Ready for Assessment.
// A test can be manual (assessor judgement) or automated (simulated CCM check).
// A failing result automatically raises a finding.
// ─────────────────────────────────────────────────────────────────────────────
export type TestMethod = 'manual' | 'automated';
export type TestResult = 'pass' | 'fail' | 'partial';

export interface Assessment {
  id: string;
  auditControlId: string;
  auditId: string;
  controlRef: string;
  controlTitle: string;
  method: TestMethod;
  result: TestResult;
  assessor: string;
  comments: string;
  testedAt: string;              // ISO
  reviewStatus: 'pending' | 'approved' | 'returned';
  findingRef?: string;           // set when result === 'fail'
  // Reviewer decision
  reviewer?: string;
  reviewComments?: string;
  reviewedAt?: string;           // ISO
}

export interface AuditFinding {
  id: string;
  auditControlId: string;
  auditId: string;
  controlRef: string;
  title: string;
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
  status: string;
  createdBy: string;
  createdAt: string;
}

// A Ready-for-Assessment control enriched with audit name + its latest result.
export interface ReadyControl extends AuditControl {
  auditName: string;
  latestResult: TestResult | null;
  latestMethod: TestMethod | null;
  assessedAt: string | null;
}

const assessments: Assessment[] = [];
const auditFindings: AuditFinding[] = [];

function latestAssessment(controlId: string): Assessment | undefined {
  return assessments
    .filter(a => a.auditControlId === controlId)
    .sort((a, b) => (a.testedAt < b.testedAt ? 1 : -1))[0];
}

function severityFromPriority(p: Priority): AuditFinding['severity'] {
  return p === 'High' ? 'High' : p === 'Medium' ? 'Medium' : 'Low';
}

// Maps a backend FindingDto (camelCase) → the frontend AuditFinding shape.
function mapFinding(f: any): AuditFinding {
  const sev = String(f.severity ?? 'medium');
  return {
    id: f.id,
    auditControlId: f.auditControlId ?? '',
    auditId: f.auditId ?? '',
    controlRef: f.controlRef ?? '',
    title: f.title ?? '',
    severity: (sev.charAt(0).toUpperCase() + sev.slice(1)) as AuditFinding['severity'],
    status: f.status ?? 'open',
    createdBy: f.createdBy ?? '',
    createdAt: f.createdAt ?? '',
  };
}

// Maps a backend AssessmentDto (camelCase) → the frontend Assessment shape.
function mapAssessment(a: any): Assessment {
  return {
    id: a.id,
    auditControlId: a.auditControlId,
    auditId: a.auditId,
    controlRef: a.controlRef ?? '',
    controlTitle: a.controlTitle ?? '',
    method: (a.method ?? 'manual') as TestMethod,
    result: (a.result ?? 'pass') as TestResult,
    assessor: a.assessor ?? '',
    comments: a.comments ?? '',
    testedAt: a.testedAt ?? '',
    reviewStatus: (a.reviewStatus ?? 'pending') as Assessment['reviewStatus'],
    findingRef: a.findingId ?? undefined,
    reviewer: a.reviewer ?? undefined,
    reviewComments: a.reviewComments ?? undefined,
    reviewedAt: a.reviewedAt ?? undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Assessor API — live DB. Reads the Ready-for-Assessment queue and records
// results (a 'fail' raises a finding server-side).
// ─────────────────────────────────────────────────────────────────────────────
export const assessorApi = {
  // GET /api/controls/ready
  async getReadyControls(): Promise<ReadyControl[]> {
    const rows = await http<any[]>('/api/controls/ready');
    return rows.map(r => ({
      id: r.id,
      auditId: r.auditId,
      frameworkId: r.frameworkCode ?? '',
      controlId: r.sourceControlId ?? r.controlRef,
      controlRef: r.controlRef,
      controlObjective: r.controlObjective ?? '',
      controlTitle: r.controlTitle,
      requirementSummary: r.requirementSummary ?? '',
      priority: (r.priority ?? 'Medium') as Priority,
      theme: r.theme ?? '',
      implementationStatus: (r.implementationStatus ?? 'Not Started') as ImplStatus,
      assignedControlLead: r.assignedControlLead ?? '',
      createdDate: (r.createdAt ?? '').slice(0, 10),
      version: r.version ?? 1,
      readyForAssessment: true,
      auditName: r.auditName ?? '—',
      latestResult: (r.latestResult ?? null) as TestResult | null,
      latestMethod: (r.latestMethod ?? null) as TestMethod | null,
      assessedAt: r.assessedAt ?? null,
    })) as ReadyControl[];
  },

  // Deterministic automated preview that mirrors the server-side stub, so the
  // result shown before recording matches what the backend will persist. (No
  // CCM integration is connected in this environment.)
  async runAutomatedCheck(controlRef: string): Promise<TestResult> {
    await delay(400);
    const sum = [...(controlRef || '')].reduce((s, ch) => s + ch.charCodeAt(0), 0);
    return sum % 4 === 0 ? 'fail' : 'pass';
  },

  // POST /api/control/{id}/assessments — record a test result; fail → finding
  async recordAssessment(input: {
    auditControlId: string; method: TestMethod; result: TestResult;
    comments: string; assessor: string;
  }): Promise<Assessment> {
    const r = await http<any>(`/api/control/${input.auditControlId}/assessments`, {
      method: 'POST',
      body: JSON.stringify({ method: input.method, result: input.result, comments: input.comments }),
    });
    return mapAssessment(r);
  },

  // GET /api/control/{id}/assessments — assessment history for a control
  async getAssessments(auditControlId?: string): Promise<Assessment[]> {
    if (!auditControlId) return [];
    const rows = await http<any[]>(`/api/control/${auditControlId}/assessments`);
    return rows.map(mapAssessment);
  },

  // GET /api/findings
  async getFindings(): Promise<AuditFinding[]> {
    const rows = await http<any[]>('/api/findings');
    return rows.map(mapFinding);
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Reviewer — QA over the assessments the Assessor recorded. Each assessment is
// approved (confirms the result) or returned (sent back for re-test). Returning
// keeps the control ready-for-assessment so the Assessor can re-test it.
// ─────────────────────────────────────────────────────────────────────────────
export type ReviewDecision = 'approved' | 'returned';

// An assessment enriched for the reviewer queue.
export interface ReviewItem extends Assessment {
  auditName: string;
  priority: Priority;
  theme: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reviewer API — live DB. Reads the review queue and approves / returns.
// ─────────────────────────────────────────────────────────────────────────────
export const reviewerApi = {
  // GET /api/assessments — the review queue (newest first, joined to control+audit)
  async getReviewQueue(): Promise<ReviewItem[]> {
    const rows = await http<any[]>('/api/assessments');
    return rows.map(a => ({
      ...mapAssessment(a),
      auditName: a.auditName ?? '—',
      priority: (a.priority ?? 'Medium') as Priority,
      theme: a.theme ?? '—',
    })) as ReviewItem[];
  },

  // POST /api/assessments/{id}/review — approve or return
  async reviewAssessment(id: string, decision: ReviewDecision, _reviewer: string, comments: string): Promise<Assessment | null> {
    const r = await http<any>(`/api/assessments/${id}/review`, {
      method: 'POST',
      body: JSON.stringify({ decision, comments }),
    });
    return mapAssessment(r);
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Audit management — the Admin's view of each audit and its closure. An audit
// can only be closed once its assessment work is complete: every control that
// reached "ready" has an assessment, no assessment is pending review, and no
// finding is still open.
// ─────────────────────────────────────────────────────────────────────────────
const OPEN_FINDING_STATES = ['open', 'in_progress', 'in-remediation'];

export interface AuditSummary {
  id: string;
  name: string;
  frameworkCode: string;
  controlLead: string;
  status: Audit['status'];
  createdDate: string;
  total: number;          // controls in the audit
  ready: number;          // marked ready for assessment
  assessed: number;       // have at least one assessment
  passed: number;
  failed: number;
  pendingReview: number;  // assessments awaiting review
  openFindings: number;
  progressPct: number;    // assessed / ready
}

export interface AuditControlRow {
  id: string;
  controlRef: string;
  controlTitle: string;
  priority: Priority;
  implementationStatus: ImplStatus;
  readyForAssessment: boolean;
  latestResult: TestResult | null;
  reviewStatus: string | null;
}

export interface AuditDetail {
  audit: Audit;
  controls: AuditControlRow[];
  findings: AuditFinding[];
  blockers: { readyUnassessed: number; pendingReview: number; openFindings: number };
  canClose: boolean;
}

function summarize(auditId: string): AuditSummary {
  const audit = audits.find(a => a.id === auditId)!;
  const controls = auditControls.filter(c => c.auditId === auditId);
  const ready = controls.filter(c => c.readyForAssessment);
  const withResult = controls.map(c => ({ c, la: latestAssessment(c.id) }));
  const assessed = withResult.filter(x => x.la).length;
  const passed = withResult.filter(x => x.la?.result === 'pass').length;
  const failed = withResult.filter(x => x.la?.result === 'fail').length;
  const pendingReview = assessments.filter(a => a.auditId === auditId && a.reviewStatus === 'pending').length;
  const openFindings = auditFindings.filter(f => f.auditId === auditId && OPEN_FINDING_STATES.includes(f.status)).length;
  return {
    id: audit.id, name: audit.name, frameworkCode: audit.frameworkId, controlLead: audit.controlLead,
    status: audit.status, createdDate: audit.createdDate,
    total: controls.length, ready: ready.length, assessed, passed, failed,
    pendingReview, openFindings,
    progressPct: ready.length ? Math.round((assessed / ready.length) * 100) : 0,
  };
}

function blockersFor(auditId: string) {
  const controls = auditControls.filter(c => c.auditId === auditId);
  const readyUnassessed = controls.filter(c => c.readyForAssessment && !latestAssessment(c.id)).length;
  const pendingReview = assessments.filter(a => a.auditId === auditId && a.reviewStatus === 'pending').length;
  const openFindings = auditFindings.filter(f => f.auditId === auditId && OPEN_FINDING_STATES.includes(f.status)).length;
  return { readyUnassessed, pendingReview, openFindings };
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit management API — live DB. Admin dashboard rollup, detail, finding
// resolution and the guarded audit close.
// ─────────────────────────────────────────────────────────────────────────────
type Blockers = { readyUnassessed: number; pendingReview: number; openFindings: number };
const ZERO_BLOCKERS: Blockers = { readyUnassessed: 0, pendingReview: 0, openFindings: 0 };

export const auditManagementApi = {
  // GET /api/audits/summary
  async getAudits(): Promise<AuditSummary[]> {
    const rows = await http<any[]>('/api/audits/summary');
    return rows.map(a => {
      const ready = a.ready ?? 0;
      const assessed = a.assessed ?? 0;
      return {
        id: a.id,
        name: a.name,
        frameworkCode: a.frameworkCode ?? '',
        controlLead: a.controlLead ?? '',
        status: (a.status ?? 'draft') as Audit['status'],
        createdDate: (a.createdAt ?? '').slice(0, 10),
        total: a.total ?? 0,
        ready,
        assessed,
        passed: a.passed ?? 0,
        failed: a.failed ?? 0,
        pendingReview: a.pendingReview ?? 0,
        openFindings: a.openFindings ?? 0,
        progressPct: ready ? Math.round((assessed / ready) * 100) : 0,
      };
    });
  },

  // GET /api/audits/{id}/detail
  async getAuditDetail(auditId: string): Promise<AuditDetail | null> {
    try {
      const d = await http<any>(`/api/audits/${auditId}/detail`);
      const controls: AuditControlRow[] = (d.controls ?? []).map((c: any) => ({
        id: c.id,
        controlRef: c.controlRef,
        controlTitle: c.controlTitle,
        priority: (c.priority ?? 'Medium') as Priority,
        implementationStatus: (c.implementationStatus ?? 'Not Started') as ImplStatus,
        readyForAssessment: c.readyForAssessment ?? false,
        latestResult: (c.latestResult ?? null) as TestResult | null,
        reviewStatus: c.reviewStatus ?? null,
      }));
      return {
        audit: mapAudit(d.audit),
        controls,
        findings: (d.findings ?? []).map(mapFinding),
        blockers: (d.blockers ?? ZERO_BLOCKERS) as Blockers,
        canClose: d.canClose ?? false,
      };
    } catch { return null; }
  },

  // POST /api/findings/{id}/resolve
  async resolveFinding(findingId: string): Promise<AuditFinding | null> {
    const r = await http<any>(`/api/findings/${findingId}/resolve`, { method: 'POST' });
    return mapFinding(r);
  },

  // POST /api/audits/{id}/close — guarded server-side; on 409 we surface the
  // outstanding-work blockers by re-reading the audit detail.
  async closeAudit(auditId: string): Promise<{ ok: boolean; blockers: Blockers; audit?: Audit }> {
    try {
      await http<any>(`/api/audits/${auditId}/close`, { method: 'POST' });
      return { ok: true, blockers: ZERO_BLOCKERS };
    } catch {
      let blockers: Blockers = ZERO_BLOCKERS;
      try {
        const d = await http<any>(`/api/audits/${auditId}/detail`);
        blockers = (d.blockers ?? ZERO_BLOCKERS) as Blockers;
      } catch { /* leave zeroed */ }
      return { ok: false, blockers };
    }
  },
};
// end of frameworkManagement api layer (live DB-backed)
