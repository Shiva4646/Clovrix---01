import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { PageWrap, Card, Badge, Btn, colors } from '../ui';
import { toast } from '../Toast';
import { getUser } from '@/lib/auth';
import { can } from '@/lib/capabilities';
import {
  assessorApi as api,
  ReadyControl, TestMethod, TestResult, Priority,
} from '@/lib/mock/frameworkManagement';

import realapi from '@/lib/api';

const field: React.CSSProperties = {
  width: '100%', background: 'var(--c-bg)', border: `1px solid ${colors.border2}`,
  borderRadius: 8, padding: '9px 12px', fontSize: 13, color: colors.text, outline: 'none',
};
const label: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: colors.text3,
  textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, display: 'block',
};
const roBox: React.CSSProperties = {
  fontSize: 12.5, color: colors.text2, background: 'var(--c-bg3)',
  borderRadius: 8, padding: '9px 12px', lineHeight: 1.5, whiteSpace: 'pre-wrap',
};

function priorityColor(p: Priority) {
  return p === 'High' ? colors.red : p === 'Medium' ? colors.orange : colors.green;
}
function resultColor(r: TestResult | null) {
  return r === 'pass' ? colors.green : r === 'fail' ? colors.red : r === 'partial' ? colors.orange : colors.text3;
}
function resultStatus(r: TestResult | null) {
  return r === 'pass' ? 'compliant' : r === 'fail' ? 'failed' : r === 'partial' ? 'partial' : 'pending';
}

export default function AssessorTestingPage() {
  const user = getUser();
  const assessor = user?.email || 'assessor@clovrix.com';
  const canTest = can('audit.run');
  
  const [rows, setRows] = useState<ReadyControl[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [resultFilter, setResultFilter] = useState('all');
  const [testing, setTesting] = useState<ReadyControl | null>(null);

  const load = useCallback(async () => {
    const data = await api.getReadyControls();
    setRows(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter(c =>
      (q === '' || c.controlId.toLowerCase().includes(q) || c.controlTitle.toLowerCase().includes(q)) &&
      (resultFilter === 'all' ||
        (resultFilter === 'untested' && !c.latestResult) ||
        c.latestResult === resultFilter)
    );
  }, [rows, search, resultFilter]);

  const untested = rows.filter(c => !c.latestResult).length;

  const onRecorded = () => { load(); };

  return (
    <PageWrap
      title="Control Testing"
      subtitle="Test controls the Control Lead has marked ready for assessment, and record pass/fail results."
    >
      {untested > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18,
          background: 'rgba(0,86,179,0.08)', border: `1px solid rgba(0,86,179,0.25)`,
          borderRadius: 10, padding: '12px 16px',
        }}>
          <span style={{ fontSize: 16 }}>🧪</span>
          <span style={{ fontSize: 13, color: colors.text, fontWeight: 500 }}>
            <strong>{untested}</strong> control{untested === 1 ? '' : 's'} ready for assessment awaiting testing.
          </span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <input style={{ ...field, width: 280 }} placeholder="Search by Control ID or Title" value={search} onChange={e => setSearch(e.target.value)} />
        <select style={{ ...field, width: 170 }} value={resultFilter} onChange={e => setResultFilter(e.target.value)}>
          <option value="all">All Results</option>
          <option value="untested">Untested</option>
          <option value="pass">Pass</option>
          <option value="fail">Fail</option>
          <option value="partial">Partial</option>
        </select>
      </div>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 900 }}>
            <thead>
              <tr style={{ background: 'var(--c-bg3)' }}>
                {['Control ID', 'Control Title', 'Audit', 'Priority', 'Theme', 'Latest Result', 'Action'].map((h, i) => (
                  <th key={i} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: colors.text3 }}>Loading ready controls…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: colors.text3 }}>No controls ready for assessment.</td></tr>
              ) : (
                filtered.map(c => (
                  <tr key={c.id} style={{ borderTop: `1px solid ${colors.border}` }}
                    onMouseOver={e => (e.currentTarget.style.background = 'var(--c-bg3)')}
                    onMouseOut={e => (e.currentTarget.style.background = 'transparent')}>
                    <td style={{ ...tdStyle, fontWeight: 600, color: colors.accent, whiteSpace: 'nowrap' }}>{c.controlId}</td>
                    <td style={{ ...tdStyle, fontWeight: 600, color: colors.text }}>{c.controlTitle}</td>
                    <td style={tdStyle}>{c.auditName}</td>
                    <td style={tdStyle}><Badge label={c.priority} color={priorityColor(c.priority)} /></td>
                    <td style={tdStyle}>{c.theme}</td>
                    <td style={tdStyle}>
                      {c.latestResult
                        ? <Badge label={`${c.latestResult}${c.latestMethod ? ` · ${c.latestMethod}` : ''}`} status={resultStatus(c.latestResult)} />
                        : <span style={{ color: colors.text3 }}>Untested</span>}
                    </td>
                    <td style={tdStyle}>
                      {canTest
                        ? <Btn small onClick={() => setTesting(c)}>{c.latestResult ? 'Re-test' : 'Test'}</Btn>
                        : <span style={{ fontSize: 12, color: colors.text3 }}>View only</span>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {testing && (
        <TestDrawer control={testing} assessor={assessor} onClose={() => setTesting(null)} onRecorded={onRecorded} />
      )}
    </PageWrap>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Test drawer
// ─────────────────────────────────────────────────────────────────────────────
function TestDrawer({ control, assessor, onClose, onRecorded }: {
  control: ReadyControl; assessor: string; onClose: () => void; onRecorded: () => void;
}) {
  const [method, setMethod] = useState<TestMethod>('manual');
  const [result, setResult] = useState<TestResult | ''>('');
  const [comments, setComments] = useState('');
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);

  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
const [uploadingEvidence, setUploadingEvidence] = useState(false);
const evidenceInputRef = useRef<HTMLInputElement>(null);

const handleEvidenceUpload = async (file: File) => {
  setUploadingEvidence(true);

  try {
    await realapi.uploadEvidence(file, control.controlId);

    setEvidenceFile(file);

    toast.success(
      `${file.name} uploaded successfully`,
      'Evidence Uploaded'
    );
  } catch (err: any) {
    toast.error(
      err.message || 'Evidence upload failed',
      'Upload Failed'
    );
  } finally {
    setUploadingEvidence(false);
  }
};

  const runAuto = async () => {
    setRunning(true);
    try {
      const r = await api.runAutomatedCheck(control.controlId);
      setResult(r);
      setComments(c => c || `Automated check returned: ${r.toUpperCase()}.`);
      toast.info(`Automated check: ${r.toUpperCase()}`);
    } finally {
      setRunning(false);
    }
  };

  const record = async () => {
    if (!result) { toast.error('Select or run a test to get a result first.'); return; }
    setSaving(true);
    try {
      const a = await api.recordAssessment({ auditControlId: control.id, method, result, comments, assessor });
      if (a.findingRef) toast.success(`Recorded FAIL — finding ${a.findingRef} raised.`);
      else toast.success(`Recorded ${result.toUpperCase()} for ${control.controlId}.`);
      onRecorded();
      onClose();
    } catch {
      toast.error('Failed to record assessment.');
    } finally {
      setSaving(false);
    }
  };

  const ResultBtn = ({ v, label, c }: { v: TestResult; label: string; c: string }) => (
    <button onClick={() => setResult(v)} style={{
      flex: 1, padding: '10px 8px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
      border: `1px solid ${result === v ? c : colors.border2}`,
      background: result === v ? `${c}22` : 'var(--c-bg)', color: result === v ? c : colors.text2,
    }}>{label}</button>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.45)' }} onClick={() => !saving && onClose()} />
      <div style={{
        position: 'relative', width: 'min(560px, 100%)', height: '100%', background: 'var(--c-bg2)',
        borderLeft: `1px solid ${colors.border2}`, boxShadow: '-16px 0 48px rgba(0,0,0,.25)',
        display: 'flex', flexDirection: 'column', animation: 'slideIn .2s ease',
      }}>
        <style>{`@keyframes slideIn{from{transform:translateX(24px);opacity:.6}to{transform:translateX(0);opacity:1}}`}</style>

        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${colors.border}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: colors.accent }}>{control.controlId}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: colors.text, marginTop: 2 }}>{control.controlTitle}</div>
            <div style={{ fontSize: 11, color: colors.text3, marginTop: 4 }}>{control.auditName} · {control.theme} · {control.priority} priority</div>
          </div>
          <button onClick={() => !saving && onClose()} style={{ background: 'none', border: 'none', color: colors.text3, fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Read-only context from the Control Lead */}
          <div>
            <label style={label}>Requirement Summary</label>
            <div style={roBox}>{control.requirementSummary || '—'}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={label}>Policy</label>
              <div style={roBox}>{control.policyName || '—'}</div>
            </div>
            <div>
              <label style={label}>Evidence Required</label>
              <div style={roBox}>{control.evidenceRequired || '—'}</div>
            </div>
          </div>
          <div>
            <label style={label}>Implementation Notes</label>
            <div style={roBox}>{control.implementationNotes || '—'}</div>
          </div>

          {/* Test method */}
          <div>
            <label style={label}>Test Method</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['manual', 'automated'] as TestMethod[]).map(m => (
                <button key={m} onClick={() => { setMethod(m); setResult(''); }} style={{
                  flex: 1, padding: '9px 8px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, textTransform: 'capitalize',
                  border: `1px solid ${method === m ? colors.accent : colors.border2}`,
                  background: method === m ? 'rgba(0,86,179,0.08)' : 'var(--c-bg)', color: method === m ? colors.accent : colors.text2,
                }}>{m}</button>
              ))}
            </div>
          </div>

          {method === 'automated' ? (
            <div>
              <Btn variant="ghost" onClick={runAuto} disabled={running} style={{ width: '100%' }}>
                {running ? 'Running automated check…' : 'Run Automated Check'}
              </Btn>
              {result && (
                <div style={{ marginTop: 10, textAlign: 'center' }}>
                  <Badge label={`Result: ${result}`} status={resultStatus(result)} />
                </div>
              )}
              <div style={{ fontSize: 11, color: colors.text3, marginTop: 8 }}>
                Simulated CCM check. In production this runs against a connected integration.
              </div>
            </div>
          ) : (
            <div>
              <label style={label}>Result</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <ResultBtn v="pass" label="Pass" c={colors.green} />
                <ResultBtn v="partial" label="Partial" c={colors.orange} />
                <ResultBtn v="fail" label="Fail" c={colors.red} />
              </div>
            </div>
          )}

          <div>
            <label style={label}>Assessor Comments</label>
            <textarea style={{ ...field, minHeight: 90, resize: 'vertical', lineHeight: 1.5 }} value={comments} onChange={e => setComments(e.target.value)} placeholder="Testing notes, evidence reviewed, rationale…" />
          </div>

          {/* Evidence Upload */}
<div>
  <label style={label}>Supporting Evidence</label>

  <input
    ref={evidenceInputRef}
    type="file"
    style={{ display: 'none' }}
    onChange={e => {
      const file = e.target.files?.[0];
      if (file) handleEvidenceUpload(file);
    }}
  />

  <div
    onClick={() =>
      !uploadingEvidence && evidenceInputRef.current?.click()
    }
    style={{
      border: `1px dashed ${colors.border2}`,
      borderRadius: 8,
      padding: '16px',
      textAlign: 'center',
      cursor: uploadingEvidence ? 'not-allowed' : 'pointer',
      background: 'var(--c-bg)',
    }}
  >
    {uploadingEvidence ? (
      <span style={{ fontSize: 13, color: colors.text2 }}>
        Uploading evidence...
      </span>
    ) : evidenceFile ? (
      <span style={{ fontSize: 13, color: colors.green }}>
        ✓ {evidenceFile.name}
      </span>
    ) : (
      <>
        <div style={{ fontSize: 13, fontWeight: 600, color: colors.accent }}>
          Click to upload evidence
        </div>

        <div style={{ fontSize: 11, color: colors.text3, marginTop: 4 }}>
          Select a file from your computer
        </div>
      </>
    )}
  </div>
</div>

          {result === 'fail' && (
            <div style={{ fontSize: 12, color: colors.red, background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.25)', borderRadius: 8, padding: '10px 12px' }}>
              Recording a <strong>Fail</strong> will automatically raise a finding for this control.
            </div>
          )}
        </div>

        <div style={{ padding: '14px 20px', borderTop: `1px solid ${colors.border}`, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <Btn variant="ghost" onClick={onClose} disabled={saving}>Cancel</Btn>
          <Btn onClick={record} disabled={saving || !result}>{saving ? 'Recording…' : 'Record Result'}</Btn>
        </div>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '11px 14px', textAlign: 'left', color: colors.text3, fontSize: 11,
  fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', whiteSpace: 'nowrap',
};
const tdStyle: React.CSSProperties = { padding: '11px 14px', color: colors.text2, verticalAlign: 'middle', lineHeight: 1.45 };
