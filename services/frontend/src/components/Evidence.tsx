import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Card, Badge, PageWrap, LoadingSpinner, ErrorBanner, Btn, Modal, Table, colors } from './ui';
import { toast } from './Toast';

export default function Evidence() {
  const [items,     setItems]     = useState<any[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [uploading, setUploading] = useState(false);
  const [showUpload,setShowUpload]= useState(false);
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [controls,  setControls]  = useState<any[]>([]);
  const [uploadMeta, setUploadMeta] = useState({
    workflowId: '', controlId: '', description: ''
  });

  const inputStyle:React.CSSProperties = {width:'100%',background:'var(--c-bg3)',border:`1px solid ${colors.border}`,borderRadius:8,padding:'9px 12px',color:colors.text,fontSize:13,outline:'none'};

  const load = () => {
    setLoading(true);
    api.evidence()
      .then((r: any) => setItems(r.items || []))
      .catch((e: any) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  useEffect(()=>{
    // Load workflows for the selector
    api.workflows().then((r:any)=>setWorkflows(r.workflows||r||[])).catch(()=>{});
    // Load controls for ref selector
    api.domains('EU_AI_ACT').then((doms:any[])=>{
      const allControls: any[] = [];
      Promise.all((doms||[]).map(d=>api.domain(d.id).then((dd:any)=>{
        (dd.controls||[]).forEach((c:any)=>allControls.push({id:c.id,ref:c.ref_code,title:c.title}));
      }))).then(()=>setControls(allControls)).catch(()=>{});
    }).catch(()=>{
      // Try ISO42001 as fallback
      api.domains('ISO42001').then((doms:any[])=>{
        const allControls: any[] = [];
        Promise.all((doms||[]).map(d=>api.domain(d.id).then((dd:any)=>{
          (dd.controls||[]).forEach((c:any)=>allControls.push({id:c.id,ref:c.ref_code,title:c.title}));
        }))).then(()=>setControls(allControls)).catch(()=>{});
      }).catch(()=>{});
    });
  },[]);

  const download = async (id: string) => {
    try {
      const r = await api.downloadEvidence(id);
      window.open(r.url, '_blank');
    } catch (e: any) { toast.error(e.message); }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await api.uploadEvidence(file, uploadMeta.controlId||undefined, uploadMeta.workflowId||undefined);
      toast.success(`${file.name} uploaded successfully`, 'Evidence Uploaded');
      setShowUpload(false);
      setUploadMeta({workflowId:'',controlId:'',description:''});
      load();
    } catch (err: any) {
      toast.error(err.message, 'Upload Failed');
    }
    setUploading(false);
    // Reset file input
    e.target.value = '';
  };

  if (loading) return <LoadingSpinner />;

  return (
    <PageWrap title="Evidence Vault" subtitle="Upload, manage and track compliance evidence linked to workflows and controls."
      action={
        <Btn onClick={()=>setShowUpload(true)}>+ Upload Evidence</Btn>
      }>
      <ErrorBanner msg={error} />

      {/* Stats row */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:20}}>
        {[
          {label:'Total Evidence',value:items.length},
          {label:'OCR Complete',value:items.filter(i=>i.ocr_status==='completed').length,color:colors.green},
          {label:'Linked to Workflow',value:items.filter(i=>i.workflow_id).length,color:colors.accent},
          {label:'Expiring Soon',value:items.filter(i=>i.expires_at&&new Date(i.expires_at)<new Date(Date.now()+30*24*60*60*1000)).length,color:colors.yellow},
        ].map(s=>(
          <Card key={s.label} style={{padding:'16px 20px'}}>
            <div style={{fontSize:11,color:colors.text3,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:8}}>{s.label}</div>
            <div style={{fontSize:28,fontWeight:700,color:s.color||colors.text}}>{s.value}</div>
          </Card>
        ))}
      </div>

      <Card>
        {items.length === 0 ? (
          <div style={{textAlign:'center',padding:'40px 20px',color:colors.text3}}>
            <div style={{fontSize:32,marginBottom:12}}>📁</div>
            <div style={{fontSize:14,fontWeight:600,color:colors.text,marginBottom:4}}>No evidence uploaded yet</div>
            <div style={{fontSize:13}}>Upload your first evidence file — bias audit reports, explainability frameworks, conformity assessments.</div>
          </div>
        ) : (
          <Table
            headers={['File', 'Linked Control', 'Workflow', 'Type', 'Size', 'OCR', 'Expires', 'Actions']}
            rows={items.map((ev:any) => [
              <div>
                <div style={{ fontSize: 13, color: colors.text, fontWeight:500 }}>{ev.original_name}</div>
                {ev.description && <div style={{ fontSize: 11, color: colors.text3 }}>{ev.description}</div>}
              </div>,
              <span style={{fontSize:11,color:colors.accent}}>{ev.control_ref||ev.control_id?.slice(0,8)||'-'}</span>,
              <span style={{fontSize:11,color:colors.text3}}>{ev.workflow_id?ev.workflow_id.slice(0,8)+'…':'-'}</span>,
              <span style={{ fontSize: 11, color: colors.text3 }}>{ev.mime_type?.split('/')[1] || '-'}</span>,
              <span style={{ fontSize: 11, color: colors.text3 }}>
                {ev.file_size ? `${(ev.file_size / 1024).toFixed(1)} KB` : '-'}
              </span>,
              <Badge label={ev.ocr_status||'pending'} status={ev.ocr_status === 'completed' ? 'compliant' : 'partial'} />,
              <span style={{ fontSize: 11, color: ev.expires_at && new Date(ev.expires_at) < new Date() ? colors.red : colors.text3 }}>
                {ev.expires_at ? new Date(ev.expires_at).toLocaleDateString() : '—'}
              </span>,
              <Btn small variant="ghost" onClick={() => download(ev.id)}>↓ Download</Btn>,
            ])}
          />
        )}
      </Card>

      {/* Upload Modal */}
      <Modal open={showUpload} onClose={()=>setShowUpload(false)} title="Upload Evidence" width={520}>
        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          {/* Workflow selector */}
          <div>
            <div style={{fontSize:11,color:colors.text3,marginBottom:5,textTransform:'uppercase',letterSpacing:'0.06em'}}>Link to Workflow (optional)</div>
            <select value={uploadMeta.workflowId} onChange={e=>setUploadMeta(p=>({...p,workflowId:e.target.value}))} style={inputStyle}>
              <option value="">— select workflow —</option>
              {workflows.map((w:any)=>(
                <option key={w.id} value={w.id}>{w.name} ({w.standard})</option>
              ))}
            </select>
          </div>

          {/* Control selector */}
          <div>
            <div style={{fontSize:11,color:colors.text3,marginBottom:5,textTransform:'uppercase',letterSpacing:'0.06em'}}>Link to Control Ref (optional)</div>
            <select value={uploadMeta.controlId} onChange={e=>setUploadMeta(p=>({...p,controlId:e.target.value}))} style={inputStyle}>
              <option value="">— select control —</option>
              {controls.map((c:any)=>(
                <option key={c.id} value={c.id}>{c.ref} — {c.title?.slice(0,50)}</option>
              ))}
              {/* Manual ref input option */}
              <option value="EU-RC-01">EU-RC-01 — Risk classification assessment</option>
              <option value="EU-TR-01">EU-TR-01 — Explainability report</option>
              <option value="EU-HO-01">EU-HO-01 — Human oversight mechanism</option>
            </select>
          </div>

          <div>
            <div style={{fontSize:11,color:colors.text3,marginBottom:5,textTransform:'uppercase',letterSpacing:'0.06em'}}>Description (optional)</div>
            <input value={uploadMeta.description} onChange={e=>setUploadMeta(p=>({...p,description:e.target.value}))} placeholder="EU AI Act bias audit report for Hiring Recommender v1.4" style={inputStyle}/>
          </div>

          <div style={{padding:'20px',background:'var(--c-bg3)',borderRadius:10,border:`2px dashed ${colors.border}`,textAlign:'center'}}>
            <div style={{fontSize:28,marginBottom:8}}>📎</div>
            <div style={{fontSize:13,color:colors.text2,marginBottom:12}}>Select a PDF, image, or document to upload</div>
            <label style={{background:colors.accent,color:'white',padding:'8px 20px',borderRadius:8,fontSize:13,fontWeight:600,cursor:'pointer'}}>
              {uploading ? 'Uploading…' : 'Choose File'}
              <input type="file" style={{display:'none'}} onChange={handleFileSelect} accept=".pdf,.png,.jpg,.jpeg,.xlsx,.docx,.txt"/>
            </label>
          </div>

          <div style={{fontSize:11,color:colors.text3}}>
            Files are stored in MinIO (S3-compatible). Linked to workflow evidence count automatically.
          </div>

          <div style={{display:'flex',gap:8,paddingTop:8,borderTop:`1px solid ${colors.border}`}}>
            <Btn variant="ghost" onClick={()=>setShowUpload(false)}>Cancel</Btn>
          </div>
        </div>
      </Modal>
    </PageWrap>
  );
}
