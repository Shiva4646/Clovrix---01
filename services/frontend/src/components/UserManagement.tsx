import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Card, Badge, PageWrap, LoadingSpinner, Btn, Modal, Table, colors } from './ui';
import { toast } from './Toast';
import { getRoleLabel } from '@/lib/auth';

const ROLE_OPTIONS=[
  {value:'compliance_admin', label:'Compliance Admin'},
  {value:'control_lead', label:'Control Lead'},
  {value:'assessor', label:'Assessor'},
  {value:'reviewer_qa', label:'Reviewer / QA'},
  {value:'risk_owner', label:'Risk Owner'},
  {value:'auditor', label:'Auditor'},
  {value:'viewer', label:'Viewer'},
];
const ROLE_COLOR:Record<string,string>={compliance_admin:colors.red,control_lead:colors.accent,assessor:colors.blue,reviewer_qa:colors.yellow,risk_owner:colors.orange,auditor:colors.green,viewer:colors.text3};

export default function UserManagement() {
  const [data,    setData]    = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [tab, setTab] = useState<'users'|'branding'>('users');
  const [form, setForm] = useState({email:'',fullName:'',role:'assessor',department:'',title:''});
  const [branding, setBranding] = useState({tenantName:'',tenantLogoUrl:'',primaryColor:'#7c6af7'});

  const load = () => {
    setLoading(true);
    Promise.all([api.users(), api.tenantConfig()])
      .then(([u,c])=>{ setData(u); setBranding({tenantName:c.tenant_name||'',tenantLogoUrl:c.tenant_logo_url||'',primaryColor:c.primary_color||'#7c6af7'}); })
      .catch(e=>toast.error(e.message))
      .finally(()=>setLoading(false));
  };
  useEffect(load,[]);

  const inviteUser = async () => {
    if(!form.email.trim()||!form.fullName.trim()){ toast.warning('Email and full name are required'); return; }
    try {
      await api.inviteUser(form);
      toast.success(`Invitation created for ${form.email}`,'User Invited');
      setShowInvite(false); setForm({email:'',fullName:'',role:'assessor',department:'',title:''});
      load();
    } catch(e:any){ toast.error(e.message,'Invite Failed'); }
  };

  const updateRole = async (id:string, role:string) => {
    try { await api.updateUserRole(id,role); toast.success('Role updated'); load(); }
    catch(e:any){ toast.error(e.message); }
  };

  const saveBranding = async () => {
    try {
      await api.updateTenantConfig({tenantName:branding.tenantName,tenantLogoUrl:branding.tenantLogoUrl,primaryColor:branding.primaryColor});
      toast.success('Tenant branding saved - changes visible on next login','Branding Updated');
    } catch(e:any){ toast.error(e.message); }
  };

  const inputStyle:React.CSSProperties={width:'100%',background:'var(--c-bg3)',border:`1px solid ${colors.border}`,borderRadius:8,padding:'9px 12px',color:colors.text,fontSize:13,outline:'none'};
  if(loading) return <LoadingSpinner/>;

  const users = data?.users||[];
  const stats = data?.stats||{};

  return (
    <PageWrap title="User Management" subtitle="Manage platform users, roles, invitations and tenant configuration.">
      {/* Tabs */}
      <div style={{display:'flex',gap:4,marginBottom:20,background:'var(--c-bg3)',borderRadius:10,padding:4,width:'fit-content'}}>
        {(['users','branding'] as const).map(t=>(
          <button key={t} onClick={()=>setTab(t)} style={{padding:'6px 18px',borderRadius:7,border:'none',cursor:'pointer',fontSize:13,fontWeight:600,background:tab===t?'var(--c-bg2)':'transparent',color:tab===t?colors.text:colors.text3,textTransform:'capitalize'}}>
            {t==='users'?'Users':'Org Branding'}
          </button>
        ))}
      </div>

      {tab==='users' && (
        <>
          {/* Stats */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:20}}>
            {[{l:'Total Users',v:stats.total||0},{l:'Active',v:stats.active||0,c:colors.green},{l:'Invited',v:stats.invited||0,c:colors.yellow},{l:'MFA Enabled',v:`${stats.mfa_pct||0}%`,c:colors.accent}].map(s=>(
              <Card key={s.l} style={{padding:'16px 20px'}}><div style={{fontSize:11,color:colors.text3,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:8}}>{s.l}</div><div style={{fontSize:28,fontWeight:700,color:s.c||colors.text}}>{s.v}</div></Card>
            ))}
          </div>

          <div style={{display:'flex',justifyContent:'flex-end',marginBottom:12}}>
            <Btn onClick={()=>setShowInvite(true)}>+ Invite User</Btn>
          </div>

          <Table
            headers={['User','Role','Department','Title','Status','MFA','']}
            rows={users.map((u:any)=>[
              <div>
                <div style={{fontSize:13,fontWeight:600,color:colors.text}}>{u.full_name}</div>
                <div style={{fontSize:11,color:colors.text3}}>{u.email}</div>
              </div>,
              <select value={u.role} onChange={e=>updateRole(u.id,e.target.value)}
                style={{background:'var(--c-bg3)',border:`1px solid ${colors.border}`,borderRadius:6,padding:'4px 8px',color:ROLE_COLOR[u.role]||colors.text,fontSize:12,cursor:'pointer'}}>
                {ROLE_OPTIONS.map(r=><option key={r.value} value={r.value}>{r.label}</option>)}
              </select>,
              <span style={{fontSize:12,color:colors.text2}}>{u.department||'-'}</span>,
              <span style={{fontSize:12,color:colors.text2}}>{u.title||'-'}</span>,
              <Badge label={u.status} status={u.status==='active'?'compliant':u.status==='invited'?'partial':'non-compliant'}/>,
              <span style={{fontSize:14,color:u.mfa_enabled?colors.green:colors.red}}>{u.mfa_enabled?'✓':'✕'}</span>,
              <button onClick={()=>toast.info(`Actions for ${u.email}`)} style={{background:'none',border:'none',color:colors.text3,cursor:'pointer',fontSize:16}}>⋯</button>
            ])}
          />
        </>
      )}

      {tab==='branding' && (
        <div style={{maxWidth:560}}>
          <Card>
            <div style={{fontSize:14,fontWeight:600,color:colors.text,marginBottom:4}}>Organisation Branding</div>
            <div style={{fontSize:12,color:colors.text3,marginBottom:20}}>
              Customise your organisation name and logo. These appear in the platform header alongside the Clovrix product name.
              <br/><span style={{color:colors.yellow}}>⚠ The Clovrix product name and logo are platform-level and cannot be changed.</span>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:16}}>
              <div>
                <div style={{fontSize:11,color:colors.text3,marginBottom:6,textTransform:'uppercase',letterSpacing:'0.06em'}}>Organisation Name</div>
                <input value={branding.tenantName} onChange={e=>setBranding(p=>({...p,tenantName:e.target.value}))} placeholder="Acme AI Corporation" style={inputStyle}/>
              </div>
              <div>
                <div style={{fontSize:11,color:colors.text3,marginBottom:6,textTransform:'uppercase',letterSpacing:'0.06em'}}>Logo URL</div>
                <input value={branding.tenantLogoUrl} onChange={e=>setBranding(p=>({...p,tenantLogoUrl:e.target.value}))} placeholder="https://company.com/logo.png" style={inputStyle}/>
                {branding.tenantLogoUrl&&<img src={branding.tenantLogoUrl} alt="Preview" style={{marginTop:10,height:40,objectFit:'contain'}} onError={e=>(e.currentTarget.style.display='none')}/>}
              </div>
              <div>
                <div style={{fontSize:11,color:colors.text3,marginBottom:6,textTransform:'uppercase',letterSpacing:'0.06em'}}>Accent Colour</div>
                <div style={{display:'flex',gap:10,alignItems:'center'}}>
                  <input type="color" value={branding.primaryColor} onChange={e=>setBranding(p=>({...p,primaryColor:e.target.value}))} style={{width:44,height:36,borderRadius:8,border:`1px solid ${colors.border}`,cursor:'pointer',background:'none',padding:2}}/>
                  <input value={branding.primaryColor} onChange={e=>setBranding(p=>({...p,primaryColor:e.target.value}))} style={{...inputStyle,width:120}} placeholder="#7c6af7"/>
                </div>
              </div>
              <Btn onClick={saveBranding}>Save Branding</Btn>
            </div>
          </Card>
        </div>
      )}

      {/* Invite Modal */}
      <Modal open={showInvite} onClose={()=>setShowInvite(false)} title="Invite User">
        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div style={{gridColumn:'1/-1'}}><div style={{fontSize:11,color:colors.text3,marginBottom:5,textTransform:'uppercase',letterSpacing:'0.06em'}}>Email Address *</div><input value={form.email} onChange={e=>setForm(p=>({...p,email:e.target.value}))} placeholder="user@company.com" style={inputStyle}/></div>
            <div style={{gridColumn:'1/-1'}}><div style={{fontSize:11,color:colors.text3,marginBottom:5,textTransform:'uppercase',letterSpacing:'0.06em'}}>Full Name *</div><input value={form.fullName} onChange={e=>setForm(p=>({...p,fullName:e.target.value}))} placeholder="Jane Smith" style={inputStyle}/></div>
            <div><div style={{fontSize:11,color:colors.text3,marginBottom:5,textTransform:'uppercase',letterSpacing:'0.06em'}}>Role</div><select value={form.role} onChange={e=>setForm(p=>({...p,role:e.target.value}))} style={inputStyle}>{ROLE_OPTIONS.map(r=><option key={r.value} value={r.value}>{r.label}</option>)}</select></div>
            <div><div style={{fontSize:11,color:colors.text3,marginBottom:5,textTransform:'uppercase',letterSpacing:'0.06em'}}>Department</div><input value={form.department} onChange={e=>setForm(p=>({...p,department:e.target.value}))} placeholder="Engineering" style={inputStyle}/></div>
            <div style={{gridColumn:'1/-1'}}><div style={{fontSize:11,color:colors.text3,marginBottom:5,textTransform:'uppercase',letterSpacing:'0.06em'}}>Job Title</div><input value={form.title} onChange={e=>setForm(p=>({...p,title:e.target.value}))} placeholder="Compliance Manager" style={inputStyle}/></div>
          </div>
          <div style={{display:'flex',gap:8,paddingTop:8,borderTop:`1px solid ${colors.border}`}}>
            <Btn onClick={inviteUser}>Send Invitation</Btn>
            <Btn variant="ghost" onClick={()=>setShowInvite(false)}>Cancel</Btn>
          </div>
        </div>
      </Modal>
    </PageWrap>
  );
}
