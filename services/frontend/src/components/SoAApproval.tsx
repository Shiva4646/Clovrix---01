import { useEffect, useMemo, useState } from "react";
import {
  PageWrap,
  Card,
  Btn,
  Badge,
  LoadingSpinner,
  colors,
} from "./ui";
import { toast } from "./Toast";
import { reviewerItems, updateReviewerItem } from "@/data/reviewerData";

interface SoAItem {
  id: string;
  controlId: string;
  controlName: string;
  framework: string;
  applicable: boolean;
  implemented: boolean;
  status: "Pending" | "Approved" | "Rejected";
  reviewerComments?: string;
}

export default function SoAApproval() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<SoAItem[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [comments, setComments] = useState<Record<string, string>>({});

  useEffect(() => {
  loadData();
}, []);

  const loadData = () => {
  setLoading(true);
  setItems([...reviewerItems]);
  setLoading(false);
};

const handleApprove = (item: SoAItem) => {
  if (!comments[item.id]?.trim()) {
    toast.warning("Please enter reviewer comments.");
    return;
  }

  updateReviewerItem(
    item.id,
    "Approved",
    comments[item.id]
  );

  loadData();

  toast.success(`${item.controlId} approved successfully.`);
};

const handleReject = (item: SoAItem) => {
  if (!comments[item.id]?.trim()) {
    toast.warning("Please enter reviewer comments.");
    return;
  }

  updateReviewerItem(
    item.id,
    "Rejected",
    comments[item.id]
  );

  loadData();

  toast.success(`${item.controlId} rejected successfully.`);
};

  const handleCommentChange = (id: string, value: string) => {
  setComments((prev) => ({ ...prev, [id]: value }));
};

  const filteredItems = useMemo(() => {
    if (!statusFilter) return items;
    return items.filter((i) => i.status === statusFilter);
  }, [items, statusFilter]);

  const pending = items.filter((i) => i.status === "Pending").length;
  const approved = items.filter((i) => i.status === "Approved").length;
  const rejected = items.filter((i) => i.status === "Rejected").length;

  const statusBadgeColor = (status: SoAItem["status"]) => {
    if (status === "Approved") return colors.green;
    if (status === "Rejected") return colors.red;
    return colors.orange;
  };

  if (loading) return <LoadingSpinner />;

  return (
    <PageWrap
      title="SoA Approval"
      subtitle="Review and approve Statement of Applicability controls."
    >
      {/* KPI Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
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
              letterSpacing: 1,
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
            {pending}
          </div>
        </Card>

        <Card style={{ padding: 20 }}>
          <div
            style={{
              fontSize: 11,
              color: colors.text3,
              textTransform: "uppercase",
              letterSpacing: 1,
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
            {approved}
          </div>
        </Card>

        <Card style={{ padding: 20 }}>
          <div
            style={{
              fontSize: 11,
              color: colors.text3,
              textTransform: "uppercase",
              letterSpacing: 1,
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
            {rejected}
          </div>
        </Card>
      </div>

      {/* Filter Bar */}
      <div
        style={{
          display: "flex",
          gap: 10,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        {(["", "Pending", "Approved", "Rejected"] as const).map((s) => (
          <Btn
            key={s}
            variant={statusFilter === s ? "primary" : "ghost"}
            small
            onClick={() => setStatusFilter(s)}
          >
            {s === "" ? "All" : s}
          </Btn>
        ))}
      </div>

      {/* Table */}
      <Card style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 14,
          }}
        >
          <thead>
            <tr
              style={{
                borderBottom: `1px solid ${colors.border}`,
                textAlign: "left",
              }}
            >
              {[
                "Control ID",
                "Control Name",
                "Framework",
                "Applicable",
                "Implemented",
                "Status",
                "Actions",
              ].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: "10px 14px",
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    color: colors.text3,
                    letterSpacing: 0.5,
                    whiteSpace: "nowrap",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredItems.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  style={{
                    padding: "32px 14px",
                    textAlign: "center",
                    color: colors.text3,
                    fontSize: 13,
                  }}
                >
                  No controls match the selected filter.
                </td>
              </tr>
            ) : (
              filteredItems.map((item, idx) => (
                <tr
                  key={item.id}
                  style={{
                    borderBottom:
                      idx < filteredItems.length - 1
                        ? `1px solid ${colors.border}`
                        : "none",
                    verticalAlign: "top",
                  }}
                >
                  <td
                    style={{
                      padding: "12px 14px",
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                      color: colors.text,
                    }}
                  >
                    {item.controlId}
                  </td>

                  <td
                    style={{
                      padding: "12px 14px",
                      color: colors.text,
                    }}
                  >
                    {item.controlName}
                  </td>

                  <td
                    style={{
                      padding: "12px 14px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <Badge
                      label={item.framework}
                      status="partial"
                    />
                  </td>

                  <td
                    style={{
                      padding: "12px 14px",
                      color: item.applicable ? colors.green : colors.text3,
                      fontWeight: 500,
                    }}
                  >
                    {item.applicable ? "Yes" : "No"}
                  </td>

                  <td
                    style={{
                      padding: "12px 14px",
                      color: item.implemented ? colors.green : colors.red,
                      fontWeight: 500,
                    }}
                  >
                    {item.implemented ? "Yes" : "No"}
                  </td>

                  <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "3px 10px",
                        borderRadius: 12,
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#fff",
                        background: statusBadgeColor(item.status),
                      }}
                    >
                      {item.status}
                    </span>
                  </td>

                  <td style={{ padding: "12px 14px" }}>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                        minWidth: 220,
                      }}
                    >
                      <textarea
                        placeholder="Reviewer comments..."
                        rows={3}
                        value={comments[item.id] || ""}
                        onChange={(e) =>
                          handleCommentChange(item.id, e.target.value)
                        }
                        style={{
                          padding: 8,
                          borderRadius: 6,
                          border: `1px solid ${colors.border}`,
                          background: "var(--c-bg2)",
                          color: colors.text,
                          resize: "vertical",
                          fontSize: 13,
                          width: "100%",
                          boxSizing: "border-box",
                        }}
                      />

                      <div style={{ display: "flex", gap: 8 }}>
                        <Btn
                        small
                        variant="success"
                        disabled={item.status === "Approved"}
                        onClick={() => handleApprove(item)}
>
                          Approve
                        </Btn>

                        <Btn
                          small
                          variant="danger"
                          onClick={() => handleReject(item)}
                          disabled={item.status === "Rejected"}
                        >
                          Reject
                        </Btn>
                      </div>
                    </div>
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
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div style={{ fontSize: 12, color: colors.text3 }}>
          Total Controls: <strong>{filteredItems.length}</strong>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <Btn variant="ghost" onClick={loadData}> 
            Refresh
          </Btn>
        </div>
      </div>
    </PageWrap>
  );
}