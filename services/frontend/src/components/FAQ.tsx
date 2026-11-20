import { useState } from 'react';
import { Card, PageWrap, colors } from './ui';

const FAQS = [
  {
    cat: 'Platform Overview',
    icon: '⬡',
    items: [
      { q: 'What is Clovrix?', a: 'Clovrix (AI Risk & Governance Enterprise Management Intelligence System) is an end-to-end AI Governance, Risk & Compliance (GRC) platform. It helps organisations discover, govern, assess, operate, monitor, and audit their AI systems across frameworks including ISO 42001, NIST AI RMF, SOC 2 Type II, GDPR, ISO 27001, PIMS, and CIS.' },
      { q: 'What is the compliance workflow loop?', a: 'Compliance flows through connected stages: (1) Govern — define operational controls and policies; (2) Audit — run framework workflows, collect evidence, test controls, generate findings; (3) Remediate — findings drive remediations and policy updates; (4) Report — completed workflows produce compliance reports and feed the dashboard maturity index.' },
      { q: 'How are modules connected?', a: 'All modules share a common data spine. Framework domains link to controls and evidence. Audit workflows aggregate findings. Findings drive remediations. Policies reference frameworks. The dashboard derives live KPIs from all of these — no hardcoded values anywhere.' },
      { q: 'Is Clovrix multi-tenant?', a: 'Yes. Each tenant has a fully isolated PostgreSQL schema (tenant_<slug>). Authentication is managed per-tenant via Keycloak, supporting password, Google OAuth, Microsoft SSO (SAML), and GitHub OAuth — configurable per tenant by the platform administrator.' },
    ]
  },
  {
    cat: 'Audit Tracking & Frameworks',
    icon: '⊡',
    items: [
      { q: 'How do audit workflows connect to AI systems?', a: 'When creating an audit workflow you can optionally select a specific AI system. This means the workflow — and all its evidence, findings, and the generated report — are scoped to that system. For example: "ISO 42001 Audit — Fraud Scoring Engine Q3 2026" is a system-specific audit, while "ISO 42001 — Organisation-wide" covers all systems.' },
      { q: 'How are workflow steps defined?', a: 'Steps are loaded dynamically from the framework_workflow_steps table based on the selected framework. Default 6 steps apply to all frameworks: Evidence Collection → Control Testing → Gap Analysis → Report Generation → Review & Sign-off → Archive & Close. Administrators can customise steps per framework via the Framework Mapping page.' },
      { q: 'What frameworks are supported?', a: 'ISO 42001 (AI Management System), SOC 2 Type II, GDPR, NIST AI RMF, ISO 27001, PIMS (ISO 27701 Privacy), and CIS Controls. Additional frameworks can be added dynamically via the Framework Mapping page without code changes.' },
      { q: 'What is the Framework cross-mapping matrix?', a: 'The Framework Mapping page shows which internal controls satisfy multiple standards simultaneously. For example, a single encryption control may satisfy ISO 27001 A.8.24, SOC 2 CC6.7, and GDPR Art.32. This reduces audit duplication and provides a clear gap view.' },
    ]
  },
  {
    cat: 'AI Assistant',
    icon: '✦',
    items: [
      { q: 'What can the AI Assistant do?', a: 'The Clovrix AI Assistant (powered by Ollama running locally) provides: governance Q&A (explain controls, clauses, frameworks), context-aware advice (reads the current page record — AI system, risk, workflow, incident), gap analysis for compliance domains, remediation suggestions for findings, and guided workflow step completion.' },
      { q: 'What are AI Action extension points?', a: 'When the AI identifies an action to perform (create a workflow, log a finding, request an approval), it outputs an ACTION: command in its response. The frontend parses and displays these actions. In the current version they are informational. In the next release, the AI will be able to call the API directly to perform these actions, making it a true agentic governance assistant.' },
      { q: 'Is data sent to external services?', a: 'No. The AI Assistant uses Ollama running locally in your Docker environment (llama3.2:1b by default). No data is sent to OpenAI, Anthropic, or any external AI service. All inference is on-premises.' },
    ]
  },
  {
    cat: 'User Management & Tenants',
    icon: '◉',
    items: [
      { q: 'What roles are available?', a: 'Five roles: Super Admin (full access, provision tenants, manage users), Lead Auditor (full audit and governance access), Auditor (read/write on compliance modules), Reviewer (read access + approve/reject requests), Viewer (read-only across all modules).' },
      { q: 'Can the product name or logo be changed?', a: 'No. The Clovrix product name and logo are hardcoded in the frontend and cannot be changed by any user, including Super Admins. This is by design — Clovrix is the platform identity. Tenant administrators can edit their organisation name and logo, which appear alongside the Clovrix branding.' },
      { q: 'How is multi-tenant auth configured?', a: 'Each tenant can have a different authentication method: Password (standard Keycloak), Google OAuth, Microsoft SSO (SAML 2.0), or GitHub OAuth. This is configured during tenant provisioning via the Admin panel and stored in public.tenant_config. The login page dynamically shows the correct sign-in button based on the tenant\'s configuration.' },
      { q: 'How do I provision a new tenant?', a: 'A Super Admin navigates to User Management → Org Branding → Provision Tenant (or calls POST /api/users/tenant/provision). This creates the tenant record and config. The admin then runs the schema migration SQL (infrastructure/postgres/05-clovrix-schema.sql) replacing "tenant_demo" with the new tenant slug to create the isolated schema.' },
    ]
  },
  {
    cat: 'Data Governance',
    icon: '⊟',
    items: [
      { q: 'How are datasets classified?', a: 'Four classification levels: Public (no restrictions), Internal (organisation-only), Confidential (need-to-know), and Restricted/PII (personal data requiring GDPR controls, encryption, and access logging). Classification drives encryption requirements, retention policies, and lineage tracking.' },
      { q: 'What is Data Lineage?', a: 'Data Lineage tracks which AI systems consume which datasets and in what role (training, inference, monitoring, output). This enables impact analysis: if a dataset has a quality issue, lineage immediately shows which AI systems are affected. Lineage is visualised on both the Data Governance page and the AI system detail panel.' },
    ]
  },
];

export default function FAQ() {
  const [openItems, setOpenItems] = useState<Set<string>>(new Set(['Platform Overview-0']));
  const [search, setSearch] = useState('');

  const toggle = (key: string) => setOpenItems(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  const filtered = search
    ? FAQS.map(cat => ({ ...cat, items: cat.items.filter(i => i.q.toLowerCase().includes(search.toLowerCase()) || i.a.toLowerCase().includes(search.toLowerCase())) })).filter(cat => cat.items.length > 0)
    : FAQS;

  return (
    <PageWrap title="Help & FAQ" subtitle="Documentation, module guides, and answers to common questions about Clovrix.">
      {/* Search */}
      <div style={{ marginBottom: 24, maxWidth: 480 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search FAQ…"
          style={{ width: '100%', background: 'var(--c-bg3)', border: `1px solid ${colors.border2}`, borderRadius: 10, padding: '10px 14px', color: colors.text, fontSize: 14, outline: 'none' }} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {filtered.map(cat => (
          <div key={cat.cat}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 16 }}>{cat.icon}</span>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: colors.accent, letterSpacing: '-0.01em' }}>{cat.cat}</h2>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {cat.items.map((item, i) => {
                const key = `${cat.cat}-${i}`;
                const open = openItems.has(key);
                return (
                  <Card key={i} style={{ padding: 0, overflow: 'hidden' }}>
                    <button onClick={() => toggle(key)} style={{
                      width: '100%', padding: '14px 18px', background: 'none', border: 'none', cursor: 'pointer',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, textAlign: 'left',
                    }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: colors.text, lineHeight: 1.4 }}>{item.q}</span>
                      <span style={{ fontSize: 16, color: colors.text3, flexShrink: 0, transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'rotate(0)' }}>▾</span>
                    </button>
                    {open && (
                      <div style={{ padding: '0 18px 16px', borderTop: `1px solid ${colors.border}` }}>
                        <p style={{ fontSize: 13, color: colors.text2, lineHeight: 1.7, marginTop: 12 }}>{item.a}</p>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ marginTop: 32, padding: '20px 24px', background: `${colors.accent}10`, border: `1px solid ${colors.border2}`, borderRadius: 12, textAlign: 'center' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: colors.text, marginBottom: 6 }}>Need more help?</div>
        <div style={{ fontSize: 13, color: colors.text3, marginBottom: 12 }}>Use the AI Assistant (✦ button) to ask questions about any module, control, or framework in plain language.</div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          {[['Swagger API Docs', 'http://localhost:5000/swagger'], ['Hangfire Jobs', 'http://localhost:5000/hangfire'], ['Grafana Monitoring', 'http://localhost:3001'], ['RabbitMQ Console', 'http://localhost:15672']].map(([label, url]) => (
            <a key={label} href={url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: colors.accent, padding: '6px 12px', border: `1px solid ${colors.border2}`, borderRadius: 8, textDecoration: 'none' }}>{label} →</a>
          ))}
        </div>
      </div>
    </PageWrap>
  );
}
