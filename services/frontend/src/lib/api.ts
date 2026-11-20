import { getToken, getActiveTenant } from './auth';
const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

/** Strip undefined/null/empty-string keys so they don't become "?key=undefined" in URLs */
function qs(params?: Record<string,any>): string {
  if (!params) return '';
  const clean = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v != null && v !== '' && v !== 'undefined')
  );
  const s = new URLSearchParams(clean).toString();
  return s ? `?${s}` : '';
}

async function req<T>(path:string, opts:RequestInit={}):Promise<T> {
  const token=getToken(), tenant=getActiveTenant();
  const headers:Record<string,string>={'Content-Type':'application/json','X-Tenant-ID':tenant,...(opts.headers as Record<string,string>||{})};
  if(token) headers['Authorization']=`Bearer ${token}`;
  const res=await fetch(`${BASE}${path}`,{...opts,headers});
  if(res.status===401){if(typeof window!=='undefined') window.dispatchEvent(new CustomEvent('clovrix:unauthorized')); throw new Error('Session expired. Please log in again.');}
  if(!res.ok){const err=await res.text().catch(()=>res.statusText); throw new Error(err||`HTTP ${res.status}`);}
  if(res.status===204) return {} as T;
  return res.json();
}
function authH(){const t=getActiveTenant(),tok=getToken();const h:Record<string,string>={'X-Tenant-ID':t};if(tok) h['Authorization']=`Bearer ${tok}`;return h;}

const api = {
  // Dashboard
  dashboard: () => req<any>('/api/dashboard/'),
  // Audit-cycle metrics (single DB source for dashboards — reflects live audits)
  auditMetrics: () => req<any>('/api/audits/metrics'),
  // Audit cycle endpoints
  createAudit: (d:any) => req<any>('/api/audits',{method:'POST',body:JSON.stringify(d)}),
  listAudits: () => req<any[]>('/api/audits'),
  getAudit: (id:string) => req<any>(`/api/audits/${id}`),
  assignControlsToAudit: (auditId:string,d:{controlIds:string[];controlLead:string}) => req<any>(`/api/audits/${auditId}/assign-controls`,{method:'POST',body:JSON.stringify(d)}),
  // Control Lead workflow
  getAssignedControls: () => req<any[]>('/api/assigned-controls'),
  getControl: (id:string) => req<any>(`/api/control/${id}`),
  updateControlSummary: (id:string,summary:string) => req<any>(`/api/control/${id}/summary`,{method:'PUT',body:JSON.stringify({summary})}),
  updateControlPolicy: (id:string,d:{policyName:string;policyDescription:string}) => req<any>(`/api/control/${id}/policy`,{method:'PUT',body:JSON.stringify(d)}),
  updateControlEvidence: (id:string,evidence:string) => req<any>(`/api/control/${id}/evidence`,{method:'PUT',body:JSON.stringify({evidence})}),
  updateControlNotes: (id:string,notes:string) => req<any>(`/api/control/${id}/notes`,{method:'PUT',body:JSON.stringify({notes})}),
  updateControlStatus: (id:string,status:string) => req<any>(`/api/control/${id}/status`,{method:'PUT',body:JSON.stringify({status})}),
  markControlReady: (id:string) => req<any>(`/api/control/${id}/ready-for-assessment`,{method:'POST'}),
  getControlVersionHistory: (id:string) => req<any[]>(`/api/control/${id}/version-history`),
  // Assessor workflow
  recordAssessment: (controlId:string,d:any) => req<any>(`/api/control/${controlId}/assessments`,{method:'POST',body:JSON.stringify(d)}),
  getAssessmentHistory: (controlId:string) => req<any[]>(`/api/control/${controlId}/assessments`),
  getReadyControls: async () => {
  const data = await req<any[]>('/api/controls/ready-for-assessment');

  return data.map(c => ({
    ...c,
    controlRef: c.control_ref,
    controlTitle: c.control_title,
    auditId: c.audit_id,
    auditName: c.audit_name,
    priority: c.priority || 'Low',
    theme: c.theme || '—',
    readyForAssessment: c.ready_for_assessment,
    latestResult: c.latest_result ?? null,
    latestMethod: c.latest_method ?? null,
    reviewStatus: c.review_status ?? null,
    assessedAt: c.assessed_at ?? null,
  }));
},
  // Reviewer workflow
  getAssessmentsForReview: (status?:string) => req<any[]>(`/api/assessments${status?`?status=${status}`:''}`),
  reviewAssessment: (assessmentId:string,d:{decision:'approved'|'returned';comments?:string}) => req<any>(`/api/assessments/${assessmentId}/review`,{method:'POST',body:JSON.stringify(d)}),
  // Findings
  listFindings: (auditId?:string) => req<any[]>(`/api/findings${auditId?`?auditId=${auditId}`:''}`),
  // Audit closure
  closeAudit: (id:string) => req<any>(`/api/audits/${id}/close`,{method:'POST'}),
  // Accessor Roles
  listAccessors: (role?:string) => req<any[]>(`/api/accessors${role?`?role=${role}`:''}`),
  assignAccessor: (controlId:string,accessorEmail:string,role:string,department?:string) => req<any>(`/api/control/${controlId}/assign-accessor`,{method:'POST',body:JSON.stringify({accessorEmail,role,department})}),
  removeAccessor: (controlId:string,accessorEmail:string,role:string,department?:string) => req<any>(`/api/control/${controlId}/remove-accessor`,{method:'DELETE',body:JSON.stringify({accessorEmail,role,department})}),
  getControlAccessors: (controlId:string) => req<any[]>(`/api/control/${controlId}/accessors`),
  getDepartments: () => req<any[]>('/api/departments'),
  getAccessibleControls: () => req<any[]>('/api/user/accessible-controls'),
  getDepartmentAccessMatrix: (email?:string) => req<any[]>(`/api/department-access-matrix${email?`?email=${encodeURIComponent(email)}`:''}`),
  // Control Mapping (Cross-Framework)
  listFrameworkMappings: () => req<any[]>('/api/mappings/frameworks'),
  mapControls: (d:{sourceFramework:string;sourceControlId:string;targetFramework:string;targetControlId:string;mappingType:string;notes?:string}) => req<any>('/api/mappings/map-controls',{method:'POST',body:JSON.stringify(d)}),
  unmapControls: (mappingId:string) => req<any>(`/api/mappings/${mappingId}`,{method:'DELETE'}),
  getControlMappings: (controlId:string) => req<any[]>(`/api/control/${controlId}/mappings`),
  getFrameworkCrossMap: (fromFramework:string,toFramework:string) => req<any[]>(`/api/mappings/cross-map/${fromFramework}/${toFramework}`),
  updateMappingNotes: (mappingId:string,notes:string) => req<any>(`/api/mappings/${mappingId}/notes`,{method:'PUT',body:JSON.stringify({notes})}),
  // AI System Registry
  aiSystems: (params?:{stage?:string;risk?:string;q?:string}) => req<any[]>(`/api/ai-systems${qs(params)}`),
  aiSystem: (id:string) => req<any>(`/api/ai-systems/${id}`),
  createAiSystem: (d:any) => req<any>('/api/ai-systems',{method:'POST',body:JSON.stringify(d)}),
  updateAiSystem: (id:string,d:any) => req<any>(`/api/ai-systems/${id}`,{method:'PUT',body:JSON.stringify(d)}),
  retireAiSystem: (id:string) => req<any>(`/api/ai-systems/${id}/retire`,{method:'POST'}),
  // Risk Register
  risks: (params?:{status?:string;category?:string;q?:string}) => req<any[]>(`/api/risks/${qs(params)}`),
  riskStats: () => req<any>('/api/risks/stats'),
  createRisk: (d:any) => req<any>('/api/risks/',{method:'POST',body:JSON.stringify(d)}),
  updateRisk: (id:string,d:any) => req<any>(`/api/risks/${id}`,{method:'PUT',body:JSON.stringify(d)}),
  // Domains / Controls
  domains: (std?:string) => req<any[]>(`/api/domains${std?`?standard=${std}`:''}`),
  domain: (id:string) => req<any>(`/api/domains/${id}`),
  controls: (domainId?:string,page=1) => req<any>(`/api/controls?${domainId?`domainId=${domainId}&`:''}page=${page}&size=50`),
  createControl: (d:any) => req<any>('/api/controls',{method:'POST',body:JSON.stringify(d)}),
  updateControlsStatus: (id:string,status:string) => req<any>(`/api/controls/${id}/status`,{method:'PUT',body:JSON.stringify({status})}),
  bulkUploadControls: (fd:FormData) => fetch(`${BASE}/api/controls/bulk`,{method:'POST',headers:authH(),body:fd}).then(r=>r.json()),
  // CX-22 & CX-23: Control assignment and completion tracking
  getAccessors: (role='assessor') => req<any[]>(`/api/accessors?role=${role}`),
  assignControls: (controlIds:string[], assessorEmail:string) => req<any>('/api/controls/assign',{method:'PUT',body:JSON.stringify({controlIds,assessorEmail})}),
  getControlCompletion: (domainId:string) => req<any>(`/api/domains/${domainId}/completion`),
  // Evidence
  evidence: (controlId?:string,workflowId?:string) => req<any>(`/api/evidence/?${controlId?`controlId=${controlId}&`:''}${workflowId?`workflowId=${workflowId}`:''}`),
  stepEvidence: (stepId:string) => req<any[]>(`/api/evidence/step/${stepId}`),
  downloadEvidence: (id: string) => req<any>(`/api/evidence/${id}/download`),
  uploadEvidence: async (file:File,controlId?:string,workflowId?:string,stepId?:string) => {
    const fd=new FormData(); fd.append('file',file);
    const qs=[controlId?`controlId=${controlId}`:'',workflowId?`workflowId=${workflowId}`:'',stepId?`stepId=${stepId}`:''].filter(Boolean).join('&');
    const r=await fetch(`${BASE}/api/evidence/upload?${qs}`,{method:'POST',headers:authH(),body:fd});
    if(!r.ok){const err=await r.text().catch(()=>r.statusText); throw new Error(err||`Upload failed (HTTP ${r.status})`);}
    return r.json();
  },
  // Workflows
  workflows: (status?:string) => req<any[]>(`/api/workflows/${status?`?status=${status}`:''}`),
  workflow: (id:string) => req<any>(`/api/workflows/${id}`),
  createWorkflow: (d:any) => req<any>('/api/workflows/',{method:'POST',body:JSON.stringify(d)}),
  startWorkflow: (id:string) => req<any>(`/api/workflows/${id}/start`,{method:'PUT'}),
  cancelWorkflow: (id:string) => req<any>(`/api/workflows/${id}/cancel`,{method:'PUT'}),
  completeStep: (id:string,d?:{stepId?:string;notes?:string}) => req<any>(`/api/workflows/${id}/steps/complete`,{method:'PUT',body:JSON.stringify(d||{})}),
  updateStep: (wfId:string,stepId:string,d:{status?:string;notes?:string}) => req<any>(`/api/workflows/${wfId}/steps/${stepId}`,{method:'PUT',body:JSON.stringify(d)}),
  workflowGapAnalysis: (id:string,d?:{domain?:string}) => req<any>(`/api/workflows/${id}/gap-analysis`,{method:'POST',body:JSON.stringify(d||{})}),
  frameworkCrossMap: () => req<any>('/api/frameworks/cross-map'),
  // Findings
  findings: (params?:{severity?:string;status?:string;standard?:string;domainId?:string;controlId?:string;aiSystemId?:string;assignedTo?:string;workflowId?:string;stepId?:string}) => req<any>(`/api/findings/${qs(params)}`),
  createFinding: (d:any) => req<any>('/api/findings/',{method:'POST',body:JSON.stringify(d)}),
  updateFinding: (id:string,d:any) => req<any>(`/api/findings/${id}`,{method:'PUT',body:JSON.stringify(d)}),
  
  findingFiles: (id:string) => req<any[]>(`/api/findings/${id}/files`),
  uploadFindingFile: (id:string,file:File,purpose?:string) => {
    const fd=new FormData(); fd.append('file',file); if(purpose) fd.append('purpose',purpose);
    return fetch(`${BASE}/api/findings/${id}/files`,{method:'POST',headers:authH(),body:fd}).then(async r => {
      const body = await r.text();
      if (!r.ok) throw new Error(body || `Upload failed (HTTP ${r.status})`);
      try { return body ? JSON.parse(body) : {}; }
      catch { throw new Error('Upload succeeded but the server returned an invalid response.'); }
    });
  },
  requestException: (id:string,d:{reason:string;mitigationPlan?:string;mitigationDue?:string;approverId?:string;approverEmail?:string}) => req<any>(`/api/findings/${id}/exception`,{method:'POST',body:JSON.stringify(d)}),
  decideException: (id:string,decision:'approve'|'reject',notes?:string) => req<any>(`/api/findings/${id}/exception/${decision}`,{method:'PUT',body:JSON.stringify({notes})}),
  checkStepFindings: (workflowId:string,stepId:string) => req<any>(`/api/findings/check-step/${workflowId}/${stepId}`),
  // Findings — assignees
  findingAssignees: (id:string) => req<any[]>(`/api/findings/${id}/assignees`),
  searchUsers: (q?:string) => req<any[]>(`/api/findings/users/search${q?`?q=${encodeURIComponent(q)}`:''}`),
  addFindingAssignee: (id:string,userId:string) => req<any>(`/api/findings/${id}/assignees`,{method:'POST',body:JSON.stringify({userId})}),
  removeFindingAssignee: (id:string,userId:string) => req<any>(`/api/findings/${id}/assignees/${userId}`,{method:'DELETE'}),
  // Workflow evidence list
  workflowEvidence: (id:string) => req<any[]>(`/api/workflows/${id}/evidence`),
  // Control Library
  controlLibraryDomains: (framework?:string) => req<any[]>(`/api/control-library/domains${framework?`?framework=${framework}`:''}`),
  updateDomain: (id:string,d:any) => req<any>(`/api/control-library/domains/${id}`,{method:'PUT',body:JSON.stringify(d)}),
  controlLibraryControls: (domainId:string) => req<any[]>(`/api/control-library/domains/${domainId}/controls`),
  searchControls: (q?:string,framework?:string) => req<any[]>(`/api/control-library/controls/search${qs({q,framework})}`),
  addControlToDomain: (domainId:string,d:any) => req<any>(`/api/control-library/domains/${domainId}/controls`,{method:'POST',body:JSON.stringify(d)}),
  updateControl: (id:string,d:any) => req<any>(`/api/control-library/controls/${id}`,{method:'PUT',body:JSON.stringify(d)}),
  removeControlFromDomain: (domainId:string,controlId:string) => req<any>(`/api/control-library/domains/${domainId}/controls/${controlId}`,{method:'DELETE'}),
  setControlMandatory: (domainId:string,controlId:string,isMandatory:boolean) => req<any>(`/api/control-library/domains/${domainId}/controls/${controlId}/mandatory`,{method:'PUT',body:JSON.stringify({isMandatory})}),
  linkControlToDomain: (controlId:string,domainId:string,isMandatory?:boolean) => req<any>(`/api/control-library/controls/${controlId}/link-domain`,{method:'POST',body:JSON.stringify({domainId,isMandatory:isMandatory??false})}),
  // Remediations
  remediations: (status?:string) => req<any[]>(`/api/remediations/?${status?`status=${status}`:''}`),
  remediationStats: () => req<any>('/api/remediations/stats'),
  updateRemediation: (id:string,d:any) => req<any>(`/api/remediations/${id}/status`,{method:'PUT',body:JSON.stringify(d)}),
  // Personnel
  personnel: (status?:string) => req<any>(`/api/personnel/?${status?`status=${status}`:''}`),
  personnelStats: () => req<any>('/api/personnel/stats'),
  accessReviews: (status?:string) => req<any[]>(`/api/personnel/access-reviews${status?`?status=${status}`:''}`),
  updateAccessReview: (id:string,d:any) => req<any>(`/api/personnel/access-reviews/${id}`,{method:'PUT',body:JSON.stringify(d)}),
  // Vendors
  vendors: (status?:string) => req<any[]>(`/api/vendors/${status?`?status=${status}`:''}`),
  vendorStats: () => req<any>('/api/vendors/stats'),
  createVendor: (d:any) => req<any>('/api/vendors/',{method:'POST',body:JSON.stringify(d)}),
  updateVendor: (id:string,d:any) => req<any>(`/api/vendors/${id}`,{method:'PUT',body:JSON.stringify(d)}),
  sendAssessment: (id:string) => req<any>(`/api/vendors/${id}/send-assessment`,{method:'POST'}),
  // Policies
  policies: (status?: string, includeArchived: boolean = false) =>
    req<any[]>(`/api/policies/?${status ? `status=${status}&` : ""}includeArchived=${includeArchived}`),
  createPolicy: (d: any) =>
    req<any>("/api/policies/", { method: "POST", body: JSON.stringify(d) }),
  updatePolicy: (id: string, d: any) =>
    req<any>(`/api/policies/${id}`, { method: "PUT", body: JSON.stringify(d) }),
  archivePolicy: (id: string) =>
    req<any>(`/api/policies/${id}`, { method: "DELETE" }),
  restorePolicy: (id: string) =>
    req<any>(`/api/policies/${id}/restore`, { method: "POST" }),
  approvePolicy: (id: string, decision: string, comments?: string) =>
    req<any>(`/api/policies/${id}/approve`, { method: "PUT", body: JSON.stringify({ decision, comments }) }),
  uploadPolicyFile: async (id: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const token = localStorage.getItem("token") || "";
    const res = await fetch(`/api/policies/${id}/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!res.ok) throw new Error("Upload failed");
    return res.json();
  },
  downloadPolicyFile: (id: string) =>
    req<{ url: string; filename: string; expires_in: number }>(`/api/policies/${id}/download`),
  signPolicy: (id: string, personnelId: string) =>
    req<any>(`/api/policies/${id}/sign`, {
      method: "POST",
      body: JSON.stringify({ personnelId }),
    }),
  // Integrations
  integrations: () => req<any[]>('/api/integrations/'),
  syncIntegration: (id:string) => req<any>(`/api/integrations/${id}/sync`,{method:'POST'}),
  ccmRules: () => req<any[]>('/api/integrations/ccm/rules'),
  // Security
  vulnerabilities: (severity?:string) => req<any[]>(`/api/security/vulnerabilities${severity?`?severity=${severity}`:''}`),
  securityStats: () => req<any>('/api/security/stats'),
  // Questionnaires
  questionnaires: () => req<any[]>('/api/questionnaires/'),
  questionnaire: (id:string) => req<any>(`/api/questionnaires/${id}`),
  createQuestionnaire: (d:any) => req<any>('/api/questionnaires/',{method:'POST',body:JSON.stringify(d)}),
  aiFill: (id:string) => req<any>(`/api/questionnaires/${id}/ai-fill`,{method:'POST'}),
  approveAnswer: (id:string,finalAnswer?:string) => req<any>(`/api/questionnaires/answers/${id}/approve`,{method:'PUT',body:JSON.stringify({finalAnswer})}),
  // Trust Center
  trustCenter: () => req<any>('/api/trust-center/'),
  updateTrustCenter: (d:any) => req<any>('/api/trust-center/',{method:'PUT',body:JSON.stringify(d)}),
  // Reports — workflow-based
  reportSummary: (standard?:string) => req<any[]>(`/api/reports/${qs({standard})}`),
  downloadReport: (workflowId:string, name?:string) =>
    fetch(`${BASE}/api/reports/${workflowId}/pdf`,{headers:authH()})
      .then(r=>r.blob())
      .then(b=>{const u=URL.createObjectURL(b);const a=document.createElement('a');a.href=u;a.download=`clovrix-audit-${(name||workflowId).toLowerCase().replace(/\s+/g,'-')}.pdf`;a.click();}),
  // Frameworks
  frameworks: () => req<any[]>('/api/frameworks/'),
  framework: (code:string) => req<any>(`/api/frameworks/${code}`),
  frameworkControls: (code:string) => req<any[]>(`/api/frameworks/${code}/controls`),
  createFramework: (d:any) => req<any>('/api/frameworks/',{method:'POST',body:JSON.stringify(d)}),
  updateFramework: (code:string,d:any) => req<any>(`/api/frameworks/${code}`,{method:'PUT',body:JSON.stringify(d)}),
  deleteFramework: (code:string) => req<any>(`/api/frameworks/${code}`,{method:'DELETE'}),
  addFrameworkDomain: (code:string,d:any) => req<any>(`/api/frameworks/${code}/domains`,{method:'POST',body:JSON.stringify(d)}),
  updateFrameworkSteps: (code:string,steps:any[]) => req<any>(`/api/frameworks/${code}/steps`,{method:'PUT',body:JSON.stringify(steps)}),
  // Tenants
  tenants: () => req<any[]>('/api/tenants/'),
  // USER MANAGEMENT
  users: () => req<any>('/api/users/'),
  inviteUser: (d:any) => req<any>('/api/users/invite',{method:'POST',body:JSON.stringify(d)}),
  updateUserRole: (id:string,role:string) => req<any>(`/api/users/${id}/role`,{method:'PUT',body:JSON.stringify({role})}),
  updateUserStatus: (id:string,status:string) => req<any>(`/api/users/${id}/status`,{method:'PUT',body:JSON.stringify({status})}),
  tenantConfig: () => req<any>('/api/users/tenant/config'),
  updateTenantConfig: (d:any) => req<any>('/api/users/tenant/config',{method:'PUT',body:JSON.stringify(d)}),
  provisionTenant: (d:any) => req<any>('/api/users/tenant/provision',{method:'POST',body:JSON.stringify(d)}),
  // GLOBAL SEARCH
  search: (q: string) => req<any>(`/api/search/?q=${encodeURIComponent(q)}`),
  // AI ASSISTANT
  aiStatus: () => req<any>('/api/ai/status'),
  aiChat: (d:any) => req<any>('/api/ai/chat',{method:'POST',body:JSON.stringify(d)}),
  aiGapAnalysis: (domainId:string,aiSystemId?:string) => req<any>('/api/ai/gap-analysis',{method:'POST',body:JSON.stringify({domainId,aiSystemId})}),
  // AI Settings & Action execution
  aiSettings: () => req<any>('/api/ai/settings'),
  updateAiSettings: (d:{aiAutoExecute:boolean}) => req<any>('/api/ai/settings',{method:'PUT',body:JSON.stringify(d)}),
  aiExecute: (d:{action:string;params:Record<string,string>;sessionId?:string}) => req<any>('/api/ai/execute',{method:'POST',body:JSON.stringify(d)}),
  aiActionLogs: () => req<any[]>('/api/ai/action-logs'),

  // Integrations - missing methods
  integrationChecks: (id:string) => req<any[]>(`/api/integrations/${id}/checks`),
  oauthAuthorize: (provider:string,redirectUri:string) => req<any>(`/api/integrations/${provider}/oauth/authorize?redirect_uri=${encodeURIComponent(redirectUri)}`),
  connectToken: (provider:string,token:string) => req<any>(`/api/integrations/${provider}/connect/token`,{method:'POST',body:JSON.stringify({token})}),
  disconnect: (provider:string) => req<any>(`/api/integrations/${provider}/disconnect`,{method:'DELETE'}),
  // Security - missing methods
  securityScans: () => req<any[]>('/api/security/scans'),
  pentests: () => req<any[]>('/api/security/pentests'),
  createScan: (d:any) => req<any>('/api/security/scans',{method:'POST',body:JSON.stringify(d)}),
  // Reports - missing method
  executiveSummary: () => req<any>('/api/reports/executive-summary'),
  // Personnel - missing method
  overdueTraining: () => req<any[]>('/api/personnel/overdue-training'),
};

export default api;
