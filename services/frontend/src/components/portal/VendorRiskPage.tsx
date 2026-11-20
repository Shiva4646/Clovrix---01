import { useState, useEffect } from 'react';
import { PageWrap, Card, Table, Badge, Btn, Modal } from '../ui';
import { getActiveRole } from '@/lib/auth';
import api from '@/lib/api';

// Backend vendor row (snake_case, SELECT *) → this page's shape.
function mapVendor(v: any) {
  return {
    id: v.id,
    name: v.name,
    score: v.risk_score ?? 0,
    critical: ['critical', 'high'].includes(String(v.criticality || '').toLowerCase()),
    status: v.status || 'active',
    lastAssessed: String(v.last_assessed_at || v.updated_at || v.created_at || '').slice(0, 10),
  };
}

export default function VendorRiskPage() {
  const [vendors, setVendors] = useState<any[]>([]);
  useEffect(() => {
    api.vendors()
      .then(rows => setVendors((rows || []).map(mapVendor)))
      .catch(() => setVendors([]));
  }, []);
  const [selectedVendor, setSelectedVendor] = useState<any>(null);
  const activeRole = getActiveRole();
  const isAuditor = activeRole === 'Lead Auditor';
  const isRiskOwner = activeRole === 'Risk Owner';

  const headers = ['Vendor Name', 'Risk Score', 'Critical', 'Compliance Status', 'Last Assessed', 'Action'];
  
  const rows = vendors.map(v => [
    <div key={v.id}>
      <div style={{ fontWeight: 600, color: 'var(--c-text)' }}>{v.name}</div>
      <div style={{ fontSize: 11, color: 'var(--c-text3)' }}>{v.id}</div>
    </div>,
    <Badge key={v.id} label={`${v.score}/100`} color={v.score >= 80 ? 'var(--c-green)' : v.score >= 60 ? 'var(--c-yellow)' : 'var(--c-red)'} />,
    v.critical ? '⚠️ Yes' : 'No',
    <Badge key={v.id} label={v.status} status={v.status} />,
    v.lastAssessed,
    <Btn key={v.id} small variant="ghost" onClick={() => setSelectedVendor(v)}>Manage</Btn>
  ]);

  return (
    <PageWrap 
      title="Vendor Risk Management" 
      subtitle="Assess and monitor third-party and AI vendor risk exposure."
      action={!isAuditor && !isRiskOwner && <Btn>Add Vendor</Btn>}
    >
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <Table headers={headers} rows={rows} />
      </Card>

      <Modal open={!!selectedVendor} onClose={() => setSelectedVendor(null)} title="Vendor Profile" width={600}>
        {selectedVendor && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{selectedVendor.name} {selectedVendor.critical && '⚠️ (Critical Vendor)'}</div>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 24 }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--c-text3)' }}>Compliance Status</div>
                <Badge label={selectedVendor.status} status={selectedVendor.status} />
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--c-text3)' }}>Risk Score</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: selectedVendor.score >= 80 ? 'var(--c-green)' : 'var(--c-red)' }}>{selectedVendor.score}/100</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--c-text3)' }}>Last Assessed</div>
                <div>{selectedVendor.lastAssessed}</div>
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--c-border)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Assessments & Questionnaires</h4>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, background: 'var(--c-bg3)', borderRadius: 8, border: '1px solid var(--c-border2)' }}>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>Q2 AI Vendor Security Assessment</div>
                    <div style={{ fontSize: 11, color: 'var(--c-text3)' }}>Sent: 2026-06-15 • Status: Pending Response</div>
                  </div>
                  {!isAuditor && <Btn small variant="ghost">Resend</Btn>}
                </div>
              </div>
              
              <div>
                <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Contracts & Documents</h4>
                <div style={{ color: 'var(--c-text3)', fontSize: 13 }}>No contracts uploaded yet.</div>
              </div>
              
              {!isAuditor && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                  <Btn>Send New Questionnaire</Btn>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </PageWrap>
  );
}