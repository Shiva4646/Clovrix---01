import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Card, Badge, Bar, PageWrap, LoadingSpinner, Btn, ScoreRing, Grid, Stat, colors } from './ui';

export default function TrustCenter() {
  const [data, setData]     = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [form, setForm] = useState<any>({});
  const [copied, setCopied]   = useState(false);

  const load = () => {
    setLoading(true);
    api.trustCenter().then(d => {
      setData(d);
      setForm({
        isPublic: d.trust_center?.is_public,
        title: d.trust_center?.title,
        tagline: d.trust_center?.tagline,
        accentColor: d.trust_center?.accent_color,
      });
    }).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const save = async () => {
    setSaving(true);
    await api.updateTrustCenter(form);
    setSaving(false);
    setEditing(false);
    load();
  };

  const embedCode = `<script src="${import.meta.env.VITE_API_URL}/api/trust-center/embed-widget"></script>`;

  const copyEmbed = () => {
    navigator.clipboard.writeText(embedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) return <LoadingSpinner />;
  const tc = data?.trust_center;
  const frameworks = data?.domains || [];

  const isoScore  = Math.round(frameworks.filter((f: any) => f.standard === 'ISO42001').reduce((s: number, d: any) => s + d.score, 0) / Math.max(1, frameworks.filter((f: any) => f.standard === 'ISO42001').length));
  const soc2Score = Math.round(frameworks.filter((f: any) => f.standard === 'SOC2').reduce((s: number, d: any) => s + d.score, 0) / Math.max(1, frameworks.filter((f: any) => f.standard === 'SOC2').length));
  const gdprScore = Math.round(frameworks.filter((f: any) => f.standard === 'GDPR').reduce((s: number, d: any) => s + d.score, 0) / Math.max(1, frameworks.filter((f: any) => f.standard === 'GDPR').length));
  const overall   = Math.round((isoScore + soc2Score + gdprScore) / 3);

  return (
    <PageWrap title="Trust Center" subtitle="Public-facing security and compliance page"
      action={
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn variant="ghost" onClick={() => window.open(`${import.meta.env.VITE_API_URL}/api/trust-center/public/demo`, '_blank')}>
            View Public Page ↗
          </Btn>
          <Btn onClick={() => setEditing(p => !p)}>Edit</Btn>
        </div>
      }>

      {/* Edit panel */}
      {editing && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: colors.text3, marginBottom: 4 }}>Page Title</div>
              <input value={form.title || ''} onChange={e => setForm((p: any) => ({ ...p, title: e.target.value }))}
                style={{ width: '100%', background: colors.bg3, border: `1px solid ${colors.border}`, borderRadius: 6, padding: '7px 10px', color: colors.text, fontSize: 13 }} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: colors.text3, marginBottom: 4 }}>Accent Color</div>
              <input type="color" value={form.accentColor || '#6366f1'} onChange={e => setForm((p: any) => ({ ...p, accentColor: e.target.value }))}
                style={{ height: 36, width: 80, cursor: 'pointer', background: 'none', border: 'none' }} />
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <div style={{ fontSize: 11, color: colors.text3, marginBottom: 4 }}>Tagline</div>
              <input value={form.tagline || ''} onChange={e => setForm((p: any) => ({ ...p, tagline: e.target.value }))}
                placeholder="Our commitment to security and privacy…"
                style={{ width: '100%', background: colors.bg3, border: `1px solid ${colors.border}`, borderRadius: 6, padding: '7px 10px', color: colors.text, fontSize: 13 }} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.isPublic || false} onChange={e => setForm((p: any) => ({ ...p, isPublic: e.target.checked }))} />
              <span style={{ fontSize: 13, color: colors.text }}>Make Trust Center public</span>
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn onClick={save} style={{ opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Save'}</Btn>
            <Btn variant="ghost" onClick={() => setEditing(false)}>Cancel</Btn>
          </div>
        </Card>
      )}

      {/* Public page preview */}
      <div style={{ background: `linear-gradient(135deg, ${tc?.accent_color || '#6366f1'}22 0%, transparent 60%)`, borderRadius: 12, padding: 32, marginBottom: 16, border: `1px solid ${tc?.accent_color || colors.border}44` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <div style={{ width: 48, height: 48, borderRadius: 10, background: tc?.accent_color || colors.indigo, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🔒</div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: colors.text }}>{tc?.title || 'Security & Compliance'}</div>
            {tc?.tagline && <div style={{ fontSize: 13, color: colors.text2, marginTop: 4 }}>{tc.tagline}</div>}
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: tc?.is_public ? colors.green : colors.yellow }} />
            <span style={{ fontSize: 12, color: colors.text3 }}>{tc?.is_public ? 'Public' : 'Private'}</span>
          </div>
        </div>

        {/* Score rings */}
        <div style={{ display: 'flex', gap: 32, justifyContent: 'center', flexWrap: 'wrap' }}>
          {[{ label: 'ISO 42001', score: isoScore }, { label: 'SOC 2', score: soc2Score }, { label: 'GDPR', score: gdprScore }, { label: 'Overall', score: overall }].map(f => (
            <div key={f.label} style={{ textAlign: 'center' }}>
              <ScoreRing score={f.score} size={90} />
              <div style={{ fontSize: 13, color: colors.text, marginTop: 8, fontWeight: 600 }}>{f.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Certifications */}
      <Grid cols={3}>
        {(tc?.certifications ? JSON.parse(tc.certifications) : []).map((cert: any) => (
          <Card key={cert.name}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: colors.text }}>{cert.name}</div>
              <Badge label={cert.status} status={cert.status === 'compliant' ? 'compliant' : 'partial'} />
            </div>
            <div style={{ fontSize: 12, color: colors.text2 }}>{cert.description}</div>
            {cert.year && <div style={{ fontSize: 11, color: colors.text3, marginTop: 4 }}>{cert.year}</div>}
          </Card>
        ))}
      </Grid>

      {/* Embed widget */}
      <Card style={{ marginTop: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Embed Widget</div>
        <div style={{ fontSize: 13, color: colors.text2, marginBottom: 12 }}>
          Copy this snippet to show a live compliance badge on your website or product.
        </div>
        <div style={{ background: colors.bg3, borderRadius: 6, padding: '10px 14px', fontFamily: 'monospace', fontSize: 12, color: colors.text, wordBreak: 'break-all', marginBottom: 12 }}>
          {embedCode}
        </div>
        <Btn small onClick={copyEmbed}>{copied ? '✓ Copied!' : 'Copy Embed Code'}</Btn>
      </Card>
    </PageWrap>
  );
}
