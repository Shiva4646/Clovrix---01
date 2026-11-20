// Product name and logo are HARDCODED in the frontend — NOT editable by any user
// Tenant name and logo CAN be edited by tenant admin
export const PRODUCT_NAME = 'CLOVRIX';
export const PRODUCT_TAGLINE = 'Govern AI. Manage Risk. Ensure Compliance.';

const KEYS = { tenantLogo:'clovrix_tenant_logo', tenantName:'clovrix_tenant_display_name' };

export interface TenantBranding { tenantLogo:string; tenantName:string; }

export function getTenantBranding():TenantBranding {
  if(typeof window==='undefined') return { tenantLogo:'', tenantName:'' };
  return { tenantLogo:localStorage.getItem(KEYS.tenantLogo)||'', tenantName:localStorage.getItem(KEYS.tenantName)||'' };
}

export function saveTenantBranding(b:Partial<TenantBranding>) {
  if(typeof window==='undefined') return;
  if(b.tenantLogo!==undefined) localStorage.setItem(KEYS.tenantLogo, b.tenantLogo);
  if(b.tenantName!==undefined) localStorage.setItem(KEYS.tenantName, b.tenantName);
  window.dispatchEvent(new CustomEvent('clovrix:branding-changed'));
}

export function fileToBase64(file:File):Promise<string> {
  return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result as string); r.onerror=rej; r.readAsDataURL(file); });
}
