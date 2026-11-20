import { reviewerItems } from "../data/reviewerData";
import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import {
  PageWrap,
  Card,
  Btn,
  LoadingSpinner,
  Badge,
  colors,
} from "./ui";
import { toast } from "./Toast";

interface Finding {
  id: string;
  title: string;
  severity: string;
  status: string;
  standard?: string;
  created_at?: string;
  assigned_to?: string;
  workflow_name?: string;
}

interface ApprovalQueueProps {
  setPage?: (page: string) => void;
}

export default function ApprovalQueue({ setPage }: ApprovalQueueProps) {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");

  const load = () => {
  setLoading(true);

  try {
    console.log("Reviewer Items:", reviewerItems);

    const data = reviewerItems.map((item) => ({
      id: item.id,
      title: item.controlName,
      severity: item.implemented ? "high" : "medium",
      status: item.status.toLowerCase(),
      standard: item.framework,
      assigned_to: "Reviewer",
      workflow_name: item.controlId,
      created_at: new Date().toISOString(),
    }));

    setFindings(data);
  } catch (e: any) {
    console.error(e);
    toast.error(e.message);
  } finally {
    setLoading(false);
  }
};

  useEffect(() => {
    load();
  }, []);

  const pendingFindings = useMemo(() => {
    return findings.filter((f) => {
      if (!statusFilter) return true;
      return f.status === statusFilter;
    });
  }, [findings, statusFilter]);

  const pendingCount = findings.filter(
    (f) => f.status === "pending"
  ).length;

  const approvedCount = findings.filter(
    (f) => f.status === "approved"
  ).length;

  const rejectedCount = findings.filter(
    (f) => f.status === "rejected"
  ).length;

  console.log("Loading:", loading);
  console.log("Findings:", findings);

//if (loading) {
  //return <LoadingSpinner />;
//}

  return (
    <PageWrap
      title="Approval Queue"
      subtitle="Reviewer pending approval requests"
    >
      {/* KPI Cards */}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3,1fr)",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <Card style={{ padding: 20 }}>
          <div
            style={{
              fontSize: 11,
              color: colors.text3,
              textTransform: "uppercase",
            }}
          >
            Pending
          </div>

          <div
            style={{
              fontSize: 34,
              fontWeight: 700,
              color: colors.orange,
              marginTop: 8,
            }}
          >
            {pendingCount}
          </div>
        </Card>

        <Card style={{ padding: 20 }}>
          <div
            style={{
              fontSize: 11,
              color: colors.text3,
              textTransform: "uppercase",
            }}
          >
            Approved
          </div>

          <div
            style={{
              fontSize: 34,
              fontWeight: 700,
              color: colors.green,
              marginTop: 8,
            }}
          >
            {approvedCount}
          </div>
        </Card>

        <Card style={{ padding: 20 }}>
          <div
            style={{
              fontSize: 11,
              color: colors.text3,
              textTransform: "uppercase",
            }}
          >
            Rejected
          </div>

          <div
            style={{
              fontSize: 34,
              fontWeight: 700,
              color: colors.red,
              marginTop: 8,
            }}
          >
            {rejectedCount}
          </div>
        </Card>
      </div>

            {/* Filters */}

      <Card style={{ padding: 18, marginBottom: 18 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              fontSize: 12,
              color: colors.text3,
              fontWeight: 600,
            }}
          >
            Status
          </span>

          {["", "pending", "approved", "rejected"].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              style={{
                padding: "6px 14px",
                borderRadius: 18,
                cursor: "pointer",
                border: `1px solid ${
                  statusFilter === status
                    ? colors.accent
                    : colors.border
                }`,
                background:
                  statusFilter === status
                    ? `${colors.accent}20`
                    : "transparent",
                color:
                  statusFilter === status
                    ? colors.accent
                    : colors.text3,
                fontSize: 12,
              }}
            >
              {status || "All"}
            </button>
          ))}
        </div>
      </Card>

      {/* Queue Table */}

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
          }}
        >
          <thead>
            <tr
              style={{
                background: "var(--c-bg3)",
                textAlign: "left",
              }}
            >
              <th style={{ padding: 14 }}>Finding</th>
              <th>Framework</th>
              <th>Severity</th>
              <th>Status</th>
              <th>Assigned</th>
              <th>Date</th>
              <th style={{ textAlign: "center" }}>Action</th>
            </tr>
          </thead>

          <tbody>
            {pendingFindings.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  style={{
                    textAlign: "center",
                    padding: 50,
                    color: colors.text3,
                  }}
                >
                  No approval requests available.
                </td>
              </tr>
            ) : (
              pendingFindings.map((finding) => (
                <tr
                  key={finding.id}
                  style={{
                    borderTop: `1px solid ${colors.border}`,
                  }}
                >
                  <td style={{ padding: 14 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        color: colors.text,
                      }}
                    >
                      {finding.title}
                    </div>

                    <div
                      style={{
                        fontSize: 11,
                        color: colors.text3,
                      }}
                    >
                      {finding.workflow_name || "-"}
                    </div>
                  </td>

                  <td>{finding.standard || "-"}</td>

                  <td>
                    <Badge
                      label={finding.severity}
                      status={
                        finding.severity === "critical"
                          ? "danger"
                          : finding.severity === "high"
                          ? "warning"
                          : "partial"
                      }
                    />
                  </td>

                  <td>
                    <Badge
                      label={finding.status}
                      status={
                        finding.status === "approved"
                          ? "success"
                          : finding.status === "rejected"
                          ? "danger"
                          : "partial"
                      }
                    />
                  </td>

                  <td>{finding.assigned_to || "-"}</td>

                  <td>
                    {finding.created_at
                      ? new Date(
                          finding.created_at
                        ).toLocaleDateString()
                      : "-"}
                  </td>

                  <td
                    style={{
                      textAlign: "center",
                    }}
                  >
                    <Btn
                      small
                      onClick={() => setPage?.("findings-review")}
                    >
                      Review
                    </Btn>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

            {/* Footer */}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 20,
        }}
      >
        <div
          style={{
            fontSize: 12,
            color: colors.text3,
          }}
        >
          Total Requests : {pendingFindings.length}
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
          }}
        >
          <Btn
            variant="ghost"
            onClick={load}
          >
            Refresh
          </Btn>

          <Btn
            onClick={() => {
              setPage?.("findings-review");
            }}
          >
            Open Findings
          </Btn>
        </div>
      </div>

    </PageWrap>
  );
}