import React, { useEffect, useState } from "react";

export interface WorkflowConfig {
  id?: string;
  name: string;
  framework: string;
  approvalStages: number;
  autoProgress: boolean;
  notifications: boolean;
  escalationRule: string;
  status: "Active" | "Draft";
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (config: WorkflowConfig) => void;
  initialData?: WorkflowConfig | null;
}

const frameworks = [
  "ISO 27001",
  "SOC 2",
  "NIST CSF",
  "PCI DSS",
  "HIPAA",
];

const escalationRules = [
  "Default",
  "Critical Only",
  "Manager Approval",
  "Executive Review",
];

export default function WorkflowConfigurationModal({
  open,
  onClose,
  onSave,
  initialData,
}: Props) {
  const [form, setForm] = useState<WorkflowConfig>({
    name: "",
    framework: "",
    approvalStages: 1,
    autoProgress: false,
    notifications: true,
    escalationRule: "Default",
    status: "Draft",
  });

  useEffect(() => {
    if (initialData) {
      setForm(initialData);
    }
  }, [initialData]);

  if (!open) return null;

  const update = (key: keyof WorkflowConfig, value: any) => {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const save = () => {
    if (!form.name.trim()) {
      alert("Workflow Name is required");
      return;
    }

    if (!form.framework) {
      alert("Select Framework");
      return;
    }

    onSave(form);
    onClose();
  };

  return (
    <div style={overlay}>
      <div style={modal}>
        <div style={header}>
          <div>
            <h2 style={{ margin: 0 }}>Workflow Configuration</h2>
            <p style={subtitle}>
              Configure assessment workflow and approval stages.
            </p>
          </div>

          <button style={closeBtn} onClick={onClose}>
            ✕
          </button>
        </div>

        <div style={body}>
          <div style={field}>
            <label>Workflow Name</label>

            <input
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              style={input}
              placeholder="Example: ISO Audit Workflow"
            />
          </div>

          <div style={field}>
            <label>Framework</label>

            <select
              style={input}
              value={form.framework}
              onChange={(e) => update("framework", e.target.value)}
            >
              <option value="">Select Framework</option>

              {frameworks.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </div>

          <div style={grid}>
            <div style={field}>
              <label>Approval Stages</label>

              <input
                type="number"
                min={1}
                value={form.approvalStages}
                style={input}
                onChange={(e) =>
                  update("approvalStages", Number(e.target.value))
                }
              />
            </div>

            <div style={field}>
              <label>Status</label>

              <select
                style={input}
                value={form.status}
                onChange={(e) =>
                  update("status", e.target.value as "Active" | "Draft")
                }
              >
                <option>Draft</option>
                <option>Active</option>
              </select>
            </div>
          </div>

          <div style={field}>
            <label>Escalation Rule</label>

            <select
              style={input}
              value={form.escalationRule}
              onChange={(e) => update("escalationRule", e.target.value)}
            >
              {escalationRules.map((rule) => (
                <option key={rule}>{rule}</option>
              ))}
            </select>
          </div>

          <div style={switchRow}>
            <label>
              <input
                type="checkbox"
                checked={form.autoProgress}
                onChange={(e) =>
                  update("autoProgress", e.target.checked)
                }
              />
              Auto Progress Workflow
            </label>

            <label>
              <input
                type="checkbox"
                checked={form.notifications}
                onChange={(e) =>
                  update("notifications", e.target.checked)
                }
              />
              Enable Notifications
            </label>
          </div>
        </div>

        <div style={footer}>
          <button style={cancelBtn} onClick={onClose}>
            Cancel
          </button>

          <button style={saveBtn} onClick={save}>
            Save Configuration
          </button>
        </div>
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,.65)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  zIndex: 1000,
};

const modal: React.CSSProperties = {
  width: 720,
  background: "#111827",
  borderRadius: 16,
  border: "1px solid #2A3555",
  color: "#fff",
};

const header: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: 24,
  borderBottom: "1px solid #27324B",
};

const subtitle: React.CSSProperties = {
  color: "#9CA3AF",
  marginTop: 6,
};

const body: React.CSSProperties = {
  padding: 24,
};

const field: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  marginBottom: 18,
};

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 16,
};

const input: React.CSSProperties = {
  marginTop: 8,
  background: "#1F2937",
  border: "1px solid #374151",
  borderRadius: 8,
  padding: "12px",
  color: "#fff",
};

const switchRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  marginTop: 20,
};

const footer: React.CSSProperties = {
  padding: 24,
  borderTop: "1px solid #27324B",
  display: "flex",
  justifyContent: "flex-end",
  gap: 12,
};

const cancelBtn: React.CSSProperties = {
  background: "#374151",
  color: "#fff",
  border: "none",
  padding: "10px 18px",
  borderRadius: 8,
  cursor: "pointer",
};

const saveBtn: React.CSSProperties = {
  background: "#6D5EF8",
  color: "#fff",
  border: "none",
  padding: "10px 18px",
  borderRadius: 8,
  cursor: "pointer",
};

const closeBtn: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "#9CA3AF",
  fontSize: 20,
  cursor: "pointer",
};