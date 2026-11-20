import { useEffect, useState, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { PageWrap, Card, Grid, Stat, Btn, LoadingSpinner, colors, sevColor } from "./ui";
import { toast } from "./Toast";

// ── Types ─────────────────────────────────────────────────────────────────────
interface QAReport {
  id: number;
  finding: string;
  framework: string;
  severity: string;
  reviewer: string;
  decision: "Approved" | "Rejected";
  reviewDate: string;
  reviewTimeHours?: number;
}

// ── Mock Data ─────────────────────────────────────────────────────────────────
const MOCK_REPORTS: QAReport[] = [
  { id: 1, finding: "Missing Risk Assessment",        framework: "ISO 42001", severity: "High",     reviewer: "Sushmitha", decision: "Approved", reviewDate: "2026-06-20", reviewTimeHours: 3 },
  { id: 2, finding: "Incomplete AI Documentation",    framework: "ISO 27001", severity: "Medium",   reviewer: "Sushmitha", decision: "Rejected", reviewDate: "2026-06-19", reviewTimeHours: 5 },
  { id: 3, finding: "No Bias Testing Procedure",      framework: "EU AI Act", severity: "Critical", reviewer: "Arjun",     decision: "Approved", reviewDate: "2026-06-18", reviewTimeHours: 2 },
  { id: 4, finding: "Outdated Data Retention Policy", framework: "ISO 27001", severity: "Low",      reviewer: "Arjun",     decision: "Approved", reviewDate: "2026-06-17", reviewTimeHours: 1 },
  { id: 5, finding: "Missing Conformity Assessment",  framework: "EU AI Act", severity: "High",     reviewer: "Sushmitha", decision: "Rejected", reviewDate: "2026-06-16", reviewTimeHours: 4 },
  { id: 6, finding: "Insufficient Logging Controls",  framework: "ISO 42001", severity: "Medium",   reviewer: "Priya",     decision: "Approved", reviewDate: "2026-06-15", reviewTimeHours: 6 },
  { id: 7, finding: "Unreviewed Model Training Data", framework: "EU AI Act", severity: "Critical", reviewer: "Priya",     decision: "Rejected", reviewDate: "2026-06-14", reviewTimeHours: 8 },
  { id: 8, finding: "No Incident Response Plan",      framework: "ISO 27001", severity: "High",     reviewer: "Arjun",     decision: "Approved", reviewDate: "2026-06-13", reviewTimeHours: 3 },
];

// ── Chart helpers ─────────────────────────────────────────────────────────────
function buildTrendData(reports: QAReport[]) {
  const byDate: Record<string, { Approved: number; Rejected: number }> = {};
  for (const r of reports) {
    if (!byDate[r.reviewDate]) byDate[r.reviewDate] = { Approved: 0, Rejected: 0 };
    byDate[r.reviewDate][r.decision]++;
  }
  return Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      date: new Date(date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
      ...v,
    }));
}

function buildSeverityData(reports: QAReport[]) {
  const counts: Record<string, number> = {};
  for (const r of reports) counts[r.severity] = (counts[r.severity] || 0) + 1;
  return Object.entries(counts).map(([name, value]) => ({ name, value }));
}

// ── Export helpers ────────────────────────────────────────────────────────────
function exportToCSV(reports: QAReport[]) {
  const headers = ["Finding", "Framework", "Severity", "Reviewer", "Decision", "Review Date", "Time Taken (hrs)"];
  const rows = reports.map(r => [
    `"${r.finding}"`, r.framework, r.severity, r.reviewer, r.decision, r.reviewDate, r.reviewTimeHours ?? 0,
  ]);
  const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = "qa-review-reports.csv"; a.click();
  URL.revokeObjectURL(url);
  toast.success("CSV downloaded successfully");
}

function exportToPDF() {
  // Stub — wire to backend PDF endpoint when ready
  toast.success("PDF export started — check your downloads shortly");
}

const SEV_COLORS: Record<string, string> = {
  Critical: "#ef4444", High: "#f59e0b", Medium: "#f97316", Low: "#10b981",
};

// ── Badges ────────────────────────────────────────────────────────────────────
function DecisionBadge({ decision }: { decision: string }) {
  const c = decision === "Approved" ? "#10b981" : "#ef4444";
  return (
    <span style={{ fontSize: 11, padding: "2px 10px", borderRadius: 99,
      background: c + "20", color: c, fontWeight: 700,
      textTransform: "uppercase" as const, whiteSpace: "nowrap" }}>
      {decision}
    </span>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const c = sevColor(severity.toLowerCase());
  return (
    <span style={{ fontSize: 11, padding: "2px 10px", borderRadius: 99,
      background: c + "20", color: c, fontWeight: 700,
      textTransform: "uppercase" as const, whiteSpace: "nowrap" }}>
      {severity}
    </span>
  );
}

// ── Clickable KPI card ────────────────────────────────────────────────────────
function KpiCard({ label, value, color, active, onClick }: {
  label: string; value: string | number; color: string; active?: boolean; onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        background: active ? color + "18" : "var(--c-bg2)",
        border: `1px solid ${active ? color : colors.border}`,
        borderRadius: 12, padding: "16px 20px",
        cursor: onClick ? "pointer" : "default",
        transition: "border-color 0.15s, background 0.15s",
        userSelect: "none" as const,
      }}
      title={onClick ? `Filter by ${label}` : undefined}
    >
      <div style={{ fontSize: 11, color: active ? color : colors.text3, fontWeight: 600,
        textTransform: "uppercase" as const, letterSpacing: "0.05em", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: active ? color : colors.text, lineHeight: 1 }}>
        {value}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function QAReviewReports() {
  const [loading,     setLoading]     = useState(true);
  const [reports,     setReports]     = useState<QAReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<QAReport | null>(null);
  const [search,      setSearch]      = useState("");
  const [sevFilter,   setSevFilter]   = useState("");
  const [decFilter,   setDecFilter]   = useState("");
  const [fwFilter,    setFwFilter]    = useState("");
  const [revFilter,   setRevFilter]   = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setTimeout(() => { setReports(MOCK_REPORTS); setLoading(false); }, 500);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Derived stats ─────────────────────────────────────────────────────────
  const total      = reports.length;
  const approved   = reports.filter(r => r.decision === "Approved").length;
  const rejected   = reports.filter(r => r.decision === "Rejected").length;
  const totalHours = reports.reduce((s, r) => s + (r.reviewTimeHours ?? 0), 0);
  const avgTime    = total ? (totalHours / total).toFixed(1) : "—";

  // ── Filters + sort ────────────────────────────────────────────────────────
  const filtered = reports
    .filter(r =>
      (!search    || r.finding.toLowerCase().includes(search.toLowerCase())) &&
      (!sevFilter || r.severity  === sevFilter) &&
      (!decFilter || r.decision  === decFilter) &&
      (!fwFilter  || r.framework === fwFilter)  &&
      (!revFilter || r.reviewer  === revFilter)
    )
    .sort((a, b) => new Date(b.reviewDate).getTime() - new Date(a.reviewDate).getTime());

  const frameworks = [...new Set(reports.map(r => r.framework))];
  const reviewers  = [...new Set(reports.map(r => r.reviewer))];
  const hasFilter  = !!(search || sevFilter || decFilter || fwFilter || revFilter);
  const clearAll   = () => { setSearch(""); setSevFilter(""); setDecFilter(""); setFwFilter(""); setRevFilter(""); };

  const trendData    = buildTrendData(reports);
  const severityData = buildSeverityData(reports);

  // ── Styles ────────────────────────────────────────────────────────────────
  const selStyle: React.CSSProperties = {
    background: "var(--c-bg3)", border: `1px solid ${colors.border}`,
    borderRadius: 8, padding: "5px 10px", color: colors.text, fontSize: 12,
    outline: "none", height: 34, minWidth: 130,
  };
  const inpStyle: React.CSSProperties = {
    ...selStyle, minWidth: 200,
  };

  if (loading) return <LoadingSpinner />;

  return (
    <PageWrap
      title="QA Review Reports"
      subtitle="Monitor review quality, approval rates, and auditor performance."
      action={
        <div style={{ display: "flex", gap: 8 }}>
          <Btn small variant="ghost" onClick={load}>↻ Refresh</Btn>
          <Btn small variant="ghost" onClick={exportToPDF}>⬇ PDF</Btn>
          <Btn small onClick={() => exportToCSV(filtered)}>⬇ Excel / CSV</Btn>
        </div>
      }
    >

      {/* ── KPI row — clickable Approved / Rejected cards filter the table ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
        <KpiCard label="Total Reviews"     value={total}           color={colors.accent} />
        <KpiCard label="Approved"          value={approved}        color="#10b981"
          active={decFilter === "Approved"}
          onClick={() => setDecFilter(prev => prev === "Approved" ? "" : "Approved")} />
        <KpiCard label="Rejected"          value={rejected}        color="#ef4444"
          active={decFilter === "Rejected"}
          onClick={() => setDecFilter(prev => prev === "Rejected" ? "" : "Rejected")} />
        <KpiCard label="Avg Review Time"   value={`${avgTime}h`}   color={colors.indigo} />
        <KpiCard label="Total Hours Spent" value={`${totalHours}h`} color="#f59e0b" />
      </div>

      {/* ── Charts ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
        <Card>
          <div style={{ fontSize: 13, fontWeight: 700, color: colors.text, marginBottom: 16 }}>Approval Trend</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={trendData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: colors.text3 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: colors.text3 }} />
              <Tooltip contentStyle={{ background: "var(--c-bg2)", border: `1px solid ${colors.border}`, borderRadius: 8, fontSize: 12 }} cursor={{ fill: colors.bg3 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Approved" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Rejected" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <div style={{ fontSize: 13, fontWeight: 700, color: colors.text, marginBottom: 16 }}>Severity Distribution</div>
          <ResponsiveContainer width={350} height={250}>
            <PieChart>
              <Pie data={severityData} cx="60%" cy="50%"
                innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                labelLine={false}>
                {severityData.map((entry, i) => (
                  <Cell key={i} fill={SEV_COLORS[entry.name] || colors.accent} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: "var(--c-bg2)", border: `1px solid ${colors.border}`, borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* ── Filters + Table ── */}
      <Card style={{ marginTop: 16 }}>
        {/* Search + filters */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end",
          padding: "12px 16px", borderBottom: `1px solid ${colors.border}` }}>

          {/* Search */}
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 10, color: colors.text3, marginBottom: 3 }}>SEARCH</div>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search finding..."
              style={inpStyle}
            />
          </div>

          <div>
            <div style={{ fontSize: 10, color: colors.text3, marginBottom: 3 }}>FRAMEWORK</div>
            <select value={fwFilter} onChange={e => setFwFilter(e.target.value)} style={selStyle}>
              <option value="">All</option>
              {frameworks.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>

          <div>
            <div style={{ fontSize: 10, color: colors.text3, marginBottom: 3 }}>SEVERITY</div>
            <select value={sevFilter} onChange={e => setSevFilter(e.target.value)} style={selStyle}>
              <option value="">All</option>
              {["Critical","High","Medium","Low"].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div>
            <div style={{ fontSize: 10, color: colors.text3, marginBottom: 3 }}>DECISION</div>
            <select value={decFilter} onChange={e => setDecFilter(e.target.value)} style={selStyle}>
              <option value="">All</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
            </select>
          </div>

          <div>
            <div style={{ fontSize: 10, color: colors.text3, marginBottom: 3 }}>REVIEWER</div>
            <select value={revFilter} onChange={e => setRevFilter(e.target.value)} style={selStyle}>
              <option value="">All</option>
              {reviewers.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          {hasFilter && (
            <Btn small variant="ghost" onClick={clearAll}>Clear</Btn>
          )}
        </div>

        {/* Table */}
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "56px 24px", color: colors.text3 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: colors.text, marginBottom: 6 }}>
              No QA Review Reports
            </div>
            <div style={{ fontSize: 13, marginBottom: 20, maxWidth: 340, margin: "0 auto 20px" }}>
              {hasFilter
                ? "No reviews match your current filters. Try adjusting the search or dropdowns above."
                : "Complete reviewer approvals to generate reports here."}
            </div>
            {hasFilter
              ? <Btn small variant="ghost" onClick={clearAll}>Clear Filters</Btn>
              : <Btn small onClick={load}>↻ Refresh</Btn>}
          </div>
        ) : (
          <>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  {["Finding", "Framework", "Severity", "Reviewer", "Decision", "Review Date", "Time Taken", "Actions"].map(h => (
                    <th key={h} style={{
                      textAlign: "left", padding: "10px 16px",
                      borderBottom: `1px solid ${colors.border}`,
                      color: colors.text3, fontWeight: 600, fontSize: 11,
                      whiteSpace: "nowrap",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id}
                    style={{ borderBottom: `1px solid ${colors.border}` }}
                    onMouseEnter={e => (e.currentTarget.style.background = colors.bg3)}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    {/* Finding */}
                    <td style={{ padding: "10px 16px", maxWidth: 240 }}>
                      <div style={{ fontWeight: 600, color: colors.text,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.finding}
                      </div>
                    </td>

                    {/* Framework */}
                    <td style={{ padding: "10px 16px" }}>
                      <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4,
                        background: colors.accent + "18", color: colors.accent, fontWeight: 600 }}>
                        {r.framework}
                      </span>
                    </td>

                    {/* Severity */}
                    <td style={{ padding: "10px 16px" }}>
                      <SeverityBadge severity={r.severity} />
                    </td>

                    {/* Reviewer */}
                    <td style={{ padding: "10px 16px", color: colors.text2 }}>{r.reviewer}</td>

                    {/* Decision */}
                    <td style={{ padding: "10px 16px" }}>
                      <DecisionBadge decision={r.decision} />
                    </td>

                    {/* Review Date */}
                    <td style={{ padding: "10px 16px", color: colors.text3, whiteSpace: "nowrap" }}>
                      {new Date(r.reviewDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>

                    {/* Time Taken */}
                    <td style={{ padding: "10px 16px", color: colors.text2, whiteSpace: "nowrap" }}>
                      {r.reviewTimeHours != null ? `${r.reviewTimeHours} hrs` : "—"}
                    </td>

                    {/* Actions */}
                    <td style={{ padding: "10px 16px" }}>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <Btn small variant="ghost"
                          onClick={() => setSelectedReport(r)}>
                          View
                        </Btn>
                        <Btn small variant="ghost"
                          onClick={() => {
                            const line = [r.finding, r.framework, r.severity, r.reviewer, r.decision, r.reviewDate, r.reviewTimeHours ?? ""].join(",");
                            const blob = new Blob([["Finding,Framework,Severity,Reviewer,Decision,Review Date,Time (hrs)", line].join("\n")], { type: "text/csv" });
                            const url  = URL.createObjectURL(blob);
                            const a    = document.createElement("a");
                            a.href = url; a.download = `${r.finding.replace(/\s+/g,"-").toLowerCase()}.csv`; a.click();
                            URL.revokeObjectURL(url);
                            toast.success("Row downloaded");
                          }}>
                          Download
                        </Btn>
                        <Btn small
                          onClick={() => setSelectedReport(r)}>
                          Open Finding
                        </Btn>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Footer */}
            <div style={{ fontSize: 12, color: colors.text3, padding: "10px 16px",
              borderTop: `1px solid ${colors.border}`,
              display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>
                Showing {filtered.length} of {total} review{total !== 1 ? "s" : ""}
                {hasFilter ? " (filtered)" : ""}
              </span>
              <span>
                Total time shown: {filtered.reduce((s, r) => s + (r.reviewTimeHours ?? 0), 0)} hrs
              </span>
            </div>
          </>
        )}

        {selectedReport && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="qa-finding-title"
            onClick={e => {
              if (e.target === e.currentTarget) setSelectedReport(null);
            }}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 2000,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 20,
              background: "rgba(15, 23, 42, .42)",
            }}
          >
            <div
              style={{
                width: "100%",
                maxWidth: 560,
                background: "var(--c-bg2)",
                border: `1px solid ${colors.border}`,
                borderRadius: 12,
                padding: 24,
                boxShadow: "0 18px 50px rgba(15, 23, 42, .24)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 11, color: colors.text3, textTransform: "uppercase", marginBottom: 6 }}>
                    Finding Details
                  </div>
                  <h2 id="qa-finding-title" style={{ margin: 0, fontSize: 20, color: colors.text }}>
                    {selectedReport.finding}
                  </h2>
                </div>
                <button
                  type="button"
                  aria-label="Close finding details"
                  onClick={() => setSelectedReport(null)}
                  style={{ border: "none", background: "transparent", color: colors.text3, fontSize: 22, cursor: "pointer" }}
                >
                  X
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16, marginTop: 24 }}>
                {[
                  ["Framework", selectedReport.framework],
                  ["Severity", selectedReport.severity],
                  ["Reviewer", selectedReport.reviewer],
                  ["Decision", selectedReport.decision],
                  ["Review Date", new Date(selectedReport.reviewDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })],
                  ["Time Taken", selectedReport.reviewTimeHours != null ? `${selectedReport.reviewTimeHours} hrs` : "—"],
                ].map(([label, value]) => (
                  <div key={label}>
                    <div style={{ fontSize: 10, color: colors.text3, textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: colors.text }}>{value}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
                <Btn variant="ghost" onClick={() => setSelectedReport(null)}>Close</Btn>
              </div>
            </div>
          </div>
        )}
      </Card>
    </PageWrap>
  );
}
