const TOKEN_KEY = 'clovrix_token';
const TENANT_KEY = 'clovrix_tenant';
const USER_KEY = 'clovrix_user';

export const COMPLIANCE_ADMIN_EMAIL = 'ComplianceAdmin@clovrix.local';
export const COMPLIANCE_ADMIN_PASSWORD = 'ComplianceAdmin@Clovrix2026!';
export const COMPLIANCE_ADMIN_ROLE = 'compliance_admin';

export interface AuthUser {
  email: string;
  name: string;
  roles: string[];
  tenantId: string;
  accessToken: string;
}

// ── Demo users for offline / frontend-only mode ───────────────────────────
// When Keycloak is unreachable these credentials are used as a fallback.
const DEMO_CREDENTIALS = [
  { email:'ComplianceAdmin@clovrix.local',  pw:'ComplianceAdmin@Clovrix2026!', name:'Compliance Admin',  roles:['compliance_admin','super_admin'], tenantId:'demo' },
  { email:'controlLead@clovrix.com',       pw:'ControlLead@Clovrix2026!',     name:'Control Lead',      roles:['control_lead'],              tenantId:'demo' },
  { email:'auditor@clovrix.local',         pw:'Auditor@Clovrix2026!',         name:'Lead Auditor',      roles:['lead_auditor','auditor'],     tenantId:'demo' },
  { email:'reviewer@clovrix.local',        pw:'Reviewer@Clovrix2026!',        name:'Reviewer User',     roles:['reviewer'],                  tenantId:'demo' },
  { email:'assessor@clovrix.com',          pw:'Assessor@Clovrix2026!',        name:'Assessor',          roles:['assessor'],                  tenantId:'demo' },
  { email:'assessor1@clovrix.com',         pw:'Assessor@Clovrix2026!',        name:'Assessor 1',        roles:['assessor'],                  tenantId:'demo' },
  { email:'assessor2@clovrix.com',         pw:'Assessor@Clovrix2026!',        name:'Assessor 2',        roles:['assessor'],                  tenantId:'demo' },
  { email:'assessor3@clovrix.com',         pw:'Assessor@Clovrix2026!',        name:'Assessor 3',        roles:['assessor'],                  tenantId:'demo' },
  { email:'assessor4@clovrix.com',         pw:'Assessor@Clovrix2026!',        name:'Assessor 4',        roles:['assessor'],                  tenantId:'demo' },
  { email:'assessor5@clovrix.com',         pw:'Assessor@Clovrix2026!',        name:'Assessor 5',        roles:['assessor'],                  tenantId:'demo' },
  { email:'riskowner@clovrix.local',       pw:'Riskowner@Clovrix2026!',       name:'Risk Owner',        roles:['risk_owner'],                tenantId:'demo' },
  { email:'admin@acme.local',              pw:'Admin@Acme2026!',              name:'Acme Admin',        roles:['super_admin'],               tenantId:'acme' },
  { email:COMPLIANCE_ADMIN_EMAIL,          pw:COMPLIANCE_ADMIN_PASSWORD,      name:'Compliance Admin',  roles:[COMPLIANCE_ADMIN_ROLE],       tenantId:'clovrix' },
];

/** Build a self-contained fake JWT so isLoggedIn / getUser work without a real token */
function makeMockToken(u: typeof DEMO_CREDENTIALS[0]): string {
  const b64 = (obj: object) =>
    btoa(JSON.stringify(obj)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  const header  = b64({ alg:'none', typ:'JWT' });
  const payload = b64({
    sub: u.email,
    email: u.email,
    name: u.name,
    preferred_username: u.email,
    realm_access: { roles: u.roles },
    tenant_id: u.tenantId,
    exp: Math.floor(Date.now() / 1000) + 86400 * 30,   // valid 30 days
    iat: Math.floor(Date.now() / 1000),
  });
  return `${header}.${payload}.mock-signature-offline`;
}

function decodeJwt(token:string):Record<string,any> {
  try { return JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))); }
  catch { return {}; }
}

const KC_URL = import.meta.env.VITE_KEYCLOAK_URL || import.meta.env.VITE_KC_URL || 'http://localhost:8180';
const KC_REALM = import.meta.env.VITE_KC_REALM || 'clovrix';
const KC_CLIENT = import.meta.env.VITE_KC_CLIENT || 'clovrix-frontend';
const KC_SECRET = import.meta.env.VITE_KC_SECRET || '';

export async function login(email:string,password:string):Promise<AuthUser> {
  // ── Step 1: real Keycloak is the single source of truth ─────────────────────
  // (mock tokens are unsigned and are rejected by the backend, so a real token
  //  is required for the app to call the live API.)
  try {
    const params = new URLSearchParams({
      grant_type: 'password',
      client_id: KC_CLIENT,
      username: email,
      password,
      scope: 'openid profile email',
    });
    // clovrix-frontend is a public client — only send a secret if one is configured.
    if (KC_SECRET) params.set('client_secret', KC_SECRET);

    const res = await fetch(
      `${KC_URL}/realms/${KC_REALM}/protocol/openid-connect/token`,
      { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params }
    );
    if (res.ok) {
      const data = await res.json();
      const claims = decodeJwt(data.access_token);
      const roles: string[] = [
        ...(claims.realm_access?.roles || []),
        ...(claims.resource_access?.[KC_CLIENT]?.roles || []),
      ].filter((r: string) => !['offline_access', 'uma_authorization', 'default-roles-clovrix'].includes(r));
      // tenant_id may arrive as a string ("demo") or a single-element array
      // (["demo"]) depending on the Keycloak mapper. Indexing a string with [0]
      // would grab the first CHARACTER ("d"), so branch on the type explicitly.
      const tc = claims.tenant_id;
      const rawTenant = (Array.isArray(tc) ? tc[0] : tc) || 'demo';
      const tenantId = String(rawTenant).toLowerCase().replace(/[^a-z0-9_]/g, '_');
      const user: AuthUser = {
        email: claims.email || email,
        name: claims.name || claims.preferred_username || email,
        roles,
        tenantId,
        accessToken: data.access_token,
      };
      if (typeof window !== 'undefined') {
        localStorage.setItem(TOKEN_KEY, data.access_token);
        localStorage.setItem(TENANT_KEY, tenantId);
        localStorage.setItem(USER_KEY, JSON.stringify(user));
      }
      return user;
    }
    // Not a valid Keycloak user (or wrong password) → fall through to demo fallback.
  } catch {
    // Keycloak unreachable → fall through to demo fallback (offline mode).
  }

  // ── Step 2: demo fallback (offline mode / demo-only accounts) ───────────────
  const mock = DEMO_CREDENTIALS.find(
    u => u.email.toLowerCase() === email.toLowerCase() && u.pw === password
  );
  if (mock) {
    const token = makeMockToken(mock);
    const user: AuthUser = {
      email: mock.email,
      name: mock.name,
      roles: mock.roles,
      tenantId: mock.tenantId,
      accessToken: token,
    };
    if (typeof window !== 'undefined') {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(TENANT_KEY, mock.tenantId);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    }
    return user;
  }

  throw new Error('Invalid username or password');
}


export function logout() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TENANT_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem('clovrix_active_role');
  }
}

export function getUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const r = localStorage.getItem(USER_KEY);
    return r ? JSON.parse(r) : null;
  } catch {
    return null;
  }
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getActiveTenant(): string {
  if (typeof window === 'undefined') return 'clovrix';
  return localStorage.getItem(TENANT_KEY) || 'clovrix';
}

export function isLoggedIn(): boolean {
  const t = getToken();
  if (!t) return false;
  const c = decodeJwt(t);
  const exp = c.exp as number | undefined;
  if (!exp) return false;
  return Date.now() / 1000 < exp;
}

export function isComplianceAdmin(): boolean {
  const user = getUser();
  return user?.roles?.includes(COMPLIANCE_ADMIN_ROLE) || user?.roles?.includes('super_admin') || false;
}

export function getActiveRole(): string {
  if (typeof window === 'undefined') return 'Compliance Admin';
  const stored = localStorage.getItem('clovrix_active_role');

  if (stored) return stored;

  const user = getUser();
  if (user) {
    // Admin roles — check first
    if (user.roles.includes('compliance_admin')) return 'Compliance Admin';
    if (user.roles.includes('super_admin'))      return 'Compliance Admin';
    // Non-admin roles
    if (user.roles.includes('control_lead'))     return 'Control Lead';
    if (user.roles.includes('lead_auditor'))     return 'Lead Auditor';
    if (user.roles.includes('risk_owner'))       return 'Risk Owner';
    if (user.roles.includes('reviewer'))         return 'Reviewer';
    if (user.roles.includes('assessor'))         return 'Assessor';
  }

  return 'Compliance Admin';
}

export function setActiveRole(role: string) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('clovrix_active_role', role);
    window.dispatchEvent(new CustomEvent('clovrix:role_changed', { detail: role }));
  }
}

export function getRoleLabel(): string {
  return getActiveRole();
}

export function hasAnyRole(roles: string[] | undefined, candidates: string[]): boolean {
  if (!roles) return false;
  const normalizedRoles = new Set(roles.map(r => r.toLowerCase()));
  return candidates.some(c => normalizedRoles.has(c.toLowerCase()));
}
