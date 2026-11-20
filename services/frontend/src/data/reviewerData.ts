export interface ApprovalItem {
  id: string;
  controlId: string;
  controlName: string;
  framework: string;
  applicable: boolean;
  implemented: boolean;
  status: "Pending" | "Approved" | "Rejected";
  reviewerComments?: string;
}

export let reviewerItems: ApprovalItem[] = [
  {
    id: "1",
    controlId: "A.5.1",
    controlName: "Information Security Policy",
    framework: "ISO27001",
    applicable: true,
    implemented: true,
    status: "Pending",
  },
  {
    id: "2",
    controlId: "A.5.2",
    controlName: "AI Risk Assessment",
    framework: "ISO42001",
    applicable: true,
    implemented: false,
    status: "Pending",
  },
  {
    id: "3",
    controlId: "A.5.3",
    controlName: "Data Governance",
    framework: "ISO42001",
    applicable: true,
    implemented: true,
    status: "Approved",
  },
  {
    id: "4",
    controlId: "A.5.4",
    controlName: "Access Management",
    framework: "ISO27001",
    applicable: true,
    implemented: false,
    status: "Rejected",
  },
];

export function updateReviewerItem(
  id: string,
  status: "Pending" | "Approved" | "Rejected",
  comments?: string
) {
  reviewerItems = reviewerItems.map((item) =>
    item.id === id
      ? {
          ...item,
          status,
          reviewerComments: comments,
        }
      : item
  );
}