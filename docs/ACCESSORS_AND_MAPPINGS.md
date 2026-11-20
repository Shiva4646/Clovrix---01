# Accessors & Control Mappings - Feature Guide

**Date**: 2026-07-20  
**Status**: ✅ **IMPLEMENTED & DOCUMENTED**

---

## Overview

Two major features have been added to the CLOVRIX platform to enhance audit coordination and compliance cross-framework alignment:

1. **Accessor Roles** - Assign 5 specialized roles to users for specific controls
2. **Control Mappings** - Cross-framework control mapping (e.g., ISO 27001 ↔ SOC 2)

---

## Part 1: Accessor Roles

### What Are Accessor Roles?

Accessor roles define **WHO** does **WHAT** on a specific control. Instead of assigning a user as a general "Assessor", you can now assign:
- John as a "Control Lead" for control A.5.1
- Sarah as an "Assessor" for the same control
- Bob as a "Reviewer" for Bob's findings

This enables **fine-grained control assignment** and **role-based specialization**.

### The 5 Accessor Roles

#### 1. **Control Lead** (📋)
- **Color**: Navy Blue (#0056B3)
- **Description**: Enriches controls with policy, evidence, and implementation notes. Marks ready for assessment.
- **Permissions**:
  - `read:assigned_controls` - See controls assigned to them
  - `write:control_enrichment` - Update policy, evidence, notes
  - `write:control_status` - Change implementation status
  - `write:ready_for_assessment` - Mark control ready
  - `read:version_history` - View change history
- **Workflow**: Documentation → Enrichment → Ready

#### 2. **Assessor** (🔍)
- **Color**: Teal (#1DB9A2)
- **Description**: Tests controls using manual or automated methods. Records assessment results and generates findings.
- **Permissions**:
  - `read:ready_controls` - See controls ready for testing
  - `write:assessments` - Record test results
  - `write:findings` - Create findings for failures
  - `read:assessment_history` - View prior test results
- **Workflow**: Testing → Results → Finding Creation (on fail)

#### 3. **Reviewer** (✓)
- **Color**: Green (#22c55e)
- **Description**: Reviews and approves assessment results. Can return assessments for rework. Manages findings approval.
- **Permissions**:
  - `read:assessment_queue` - View assessments pending review
  - `write:assessment_approval` - Approve or return assessments
  - `write:finding_review` - Review and approve findings
  - `read:evidence` - Access control evidence
- **Workflow**: Queue → Review → Approve/Return

#### 4. **Auditor** (📊)
- **Color**: Amber (#f59e0b)
- **Description**: Oversees entire audit workflows. Generates reports, ensures compliance, tracks audit cycles.
- **Permissions**:
  - `read:all_audits` - View all audits
  - `read:all_controls` - View all controls
  - `read:all_assessments` - View all assessment results
  - `read:all_findings` - View all findings
  - `write:audit_reports` - Generate audit reports
- **Workflow**: Oversight → Reporting → Compliance Verification

#### 5. **Remediation Owner** (🔧)
- **Color**: Red (#ef4444)
- **Description**: Manages findings remediation. Tracks remediation progress, updates status, and verifies closure.
- **Permissions**:
  - `read:assigned_findings` - View findings assigned to them
  - `write:remediation_plan` - Create remediation plans
  - `write:remediation_status` - Update remediation progress
  - `write:remediation_evidence` - Upload remediation evidence
- **Workflow**: Finding → Remediation → Verification → Closure

---

### Using Accessor Roles

#### Frontend - ControlAccessors Component

```typescript
import ControlAccessors from '@/components/ControlAccessors';

// In your control detail view:
<ControlAccessors
  controlId="ctrl-123"
  controlTitle="Control A.5.1 - Information Security Policies"
  onClose={() => setShowAccessors(false)}
/>
```

This component provides:
- 👁️ **View** current accessors for a control
- ➕ **Assign** new users to specific roles
- ❌ **Remove** user from a role

#### Backend API

**List users who can fill a role**:
```bash
GET /api/accessors?role=assessor
# Returns: [{email: "john@clovrix.com"}, {email: "sarah@clovrix.com"}, ...]
```

**Assign a user to a control**:
```bash
POST /api/control/{controlId}/assign-accessor
Body: {
  "accessorEmail": "john@clovrix.com",
  "role": "control_lead"
}
```

**View accessors for a control**:
```bash
GET /api/control/{controlId}/accessors
# Returns: [
#   {id: "...", controlId: "...", email: "john@clovrix.com", role: "control_lead", assignedAt: "2026-07-20T10:30:00Z"},
#   ...
# ]
```

**Get user's assigned controls/tasks**:
```bash
GET /api/accessor-assignments
# Returns: [
#   {id: "...", controlId: "...", role: "assessor", controlRef: "A.5.1", auditName: "ISO 27001 2026", status: "active"},
#   ...
# ]
```

**Remove accessor from control**:
```bash
DELETE /api/control/{controlId}/remove-accessor
Body: {
  "accessorEmail": "john@clovrix.com",
  "role": "control_lead"
}
```

---

## Part 2: Control Mappings

### What Is Control Mapping?

Control mapping creates **relationships between controls across different frameworks**:

```
ISO 27001 A.5.1 (Information Security Policies)
         ↓
    [Equivalent]
         ↓
SOC 2 CC6.1 (Logical Access Control)
```

This enables:
- ✅ **Cross-compliance tracking** - Show how one audit satisfies multiple frameworks
- ✅ **Mapping evidence** - Use a single control test to prove compliance for multiple frameworks
- ✅ **Gap analysis** - Identify coverage gaps when mapping to new frameworks

### Mapping Types

| Type | Meaning | Example |
|------|---------|---------|
| **equivalent** | Same control objectives | ISO 27001 A.5.1 ≈ SOC 2 CC6.1 |
| **partial** | Overlapping but not fully equivalent | ISO 27001 A.7.1 ≈ SOC 2 L1.1 (partial) |
| **related** | Addresses similar but distinct concerns | SOC 2 CC6.1 → CSF AC-1 |
| **complements** | Works together with mapped control | Controls complement each other |

### Alignment Score (0.0 - 1.0)

Confidence level of the mapping:
- **0.90-1.0**: Highly aligned (equivalent)
- **0.75-0.89**: Good overlap (partial/related)
- **0.50-0.74**: Tangential (complements)
- **<0.50**: Minimal overlap

---

### Using Control Mappings

#### Pre-populated Mappings

The system includes **10 common mappings** between ISO 27001, SOC 2, and CSF:

| Source | Target | Type | Score |
|--------|--------|------|-------|
| ISO-27001 A.5.1 | SOC-2 CC6.1 | equivalent | 0.95 |
| ISO-27001 A.6.1 | SOC-2 CC6.2 | equivalent | 0.90 |
| ISO-27001 A.7.1 | SOC-2 L1.1 | related | 0.75 |
| SOC-2 CC6.1 | CSF AC-1 | equivalent | 0.92 |
| ... | ... | ... | ... |

#### Frontend API

```typescript
import api from '@/lib/api';

// Get all framework mapping overview
const mappings = await api.listFrameworkMappings();
// Returns: [{sourceFramework: "ISO-27001", targetFramework: "SOC-2", count: 15, avgAlignment: 0.82}, ...]

// Get cross-map between two frameworks
const mapping = await api.getFrameworkCrossMap("ISO-27001", "SOC-2");
// Returns: [{id: "...", sourceControlId: "A.5.1", targetControlId: "CC6.1", mappingType: "equivalent", alignmentScore: 0.95}, ...]

// Create a new mapping
await api.mapControls({
  sourceFramework: "ISO-27001",
  sourceControlId: "A.5.1",
  targetFramework: "SOC-2",
  targetControlId: "CC6.1",
  mappingType: "equivalent",
  alignmentScore: 0.95,
  notes: "Both address information security policies"
});

// Get mappings for a specific control (within an audit)
const controlMappings = await api.getControlMappings(controlId);

// Update mapping notes
await api.updateMappingNotes(mappingId, "Updated alignment after framework revision");

// Delete a mapping
await api.unmapControls(mappingId);
```

#### Backend API

**List all framework mappings (overview)**:
```bash
GET /api/mappings/frameworks
# Returns: [
#   {
#     sourceFramework: "ISO-27001",
#     targetFramework: "SOC-2",
#     count: 15,
#     avgAlignment: 0.82,
#     minAlignment: 0.65,
#     maxAlignment: 0.95
#   },
#   ...
# ]
```

**Get cross-map between two frameworks**:
```bash
GET /api/mappings/cross-map/{from}/{to}
# Example: GET /api/mappings/cross-map/ISO-27001/SOC-2
# Returns: [
#   {
#     id: "map-123",
#     sourceFramework: "ISO-27001",
#     sourceControlId: "A.5.1",
#     targetFramework: "SOC-2",
#     targetControlId: "CC6.1",
#     mappingType: "equivalent",
#     alignmentScore: 0.95,
#     notes: "Both address..."
#   },
#   ...
# ]
```

**Create a mapping**:
```bash
POST /api/mappings/map-controls
Body: {
  "sourceFramework": "ISO-27001",
  "sourceControlId": "A.5.1",
  "targetFramework": "SOC-2",
  "targetControlId": "CC6.1",
  "mappingType": "equivalent",
  "alignmentScore": 0.95,
  "notes": "Alignment verified 2026-07"
}
```

**Get mappings for a control** (shows related controls from other frameworks):
```bash
GET /api/control/{controlId}/mappings
# Shows mappings where this control (or its source template) appears
```

**Update mapping metadata**:
```bash
PUT /api/mappings/{mappingId}/notes
Body: { "notes": "Updated alignment after framework revision" }
```

**Delete a mapping**:
```bash
DELETE /api/mappings/{mappingId}
```

**Get audit cross-compliance coverage**:
```bash
GET /api/mappings/audit-coverage?auditId={auditId}
# Returns: [
#   {
#     auditId: "audit-123",
#     auditName: "ISO 27001 2026",
#     primaryFramework: "ISO-27001",
#     totalControls: 25,
#     mappedControls: 18,
#     secondaryFrameworks: 2,  // SOC-2 + CSF
#     mappingCoverage: 72.0    // percentage
#   }
# ]
```

---

## Database Schema

### Accessor Roles Table

```sql
CREATE TABLE control_accessors (
    id               VARCHAR(36) PRIMARY KEY,
    audit_control_id VARCHAR(36) NOT NULL,  -- Foreign key to audit_controls
    accessor_email   VARCHAR(200) NOT NULL, -- User email
    accessor_role    VARCHAR(30) NOT NULL,  -- control_lead|assessor|reviewer|auditor|remediation_owner
    assigned_by      VARCHAR(200),          -- Who made the assignment
    assigned_at      TIMESTAMPTZ,           -- When assigned
    UNIQUE(audit_control_id, accessor_email, accessor_role)
);
```

**Indexes**:
- `audit_control_id` - Find all accessors for a control
- `accessor_email` - Find all controls assigned to a user
- `accessor_role` - Find all users in a specific role

### Control Mappings Table

```sql
CREATE TABLE control_mappings (
    id                 VARCHAR(36) PRIMARY KEY,
    source_framework   VARCHAR(30) NOT NULL,        -- e.g., "ISO-27001"
    source_control_id  VARCHAR(60) NOT NULL,        -- e.g., "A.5.1"
    target_framework   VARCHAR(30) NOT NULL,        -- e.g., "SOC-2"
    target_control_id  VARCHAR(60) NOT NULL,        -- e.g., "CC6.1"
    mapping_type       VARCHAR(20) NOT NULL,        -- equivalent|partial|related|complements
    alignment_score    DECIMAL(3,2),                -- 0.0-1.0
    notes              TEXT,                         -- Additional context
    created_by         VARCHAR(200),
    created_at         TIMESTAMPTZ,
    updated_at         TIMESTAMPTZ,
    UNIQUE(source_framework, source_control_id, target_framework, target_control_id)
);
```

**Indexes**:
- `(source_framework, source_control_id)` - Find mappings FROM a control
- `(target_framework, target_control_id)` - Find mappings TO a control
- `mapping_type` - Filter by type
- `alignment_score` - Sort by confidence

### Audit-Control Mappings Junction Table

```sql
CREATE TABLE audit_control_mappings (
    id               VARCHAR(36) PRIMARY KEY,
    audit_control_id VARCHAR(36) NOT NULL,  -- Foreign key to audit_controls
    mapping_id       VARCHAR(36) NOT NULL,  -- Foreign key to control_mappings
    status           VARCHAR(20) NOT NULL,  -- linked|tested_together|independently_tested|conflicting
    notes            TEXT,                  -- Implementation notes
    created_at       TIMESTAMPTZ,
    UNIQUE(audit_control_id, mapping_id)
);
```

Tracks which control mappings are **actively used** in specific audits.

---

## Reporting Views

### Framework Coverage Matrix View

```sql
SELECT
    source_framework,
    target_framework,
    source_controls,      -- How many source framework controls have mappings
    target_controls,      -- How many target framework controls are mapped to
    mappings,             -- Total number of mappings
    avg_alignment,        -- Average alignment score
    equivalent_mappings,  -- Mapping count by type
    partial_mappings,
    related_mappings
FROM framework_coverage_matrix;
```

**Use Case**: Show audit team that 18/25 ISO 27001 controls map to SOC 2 with 82% average alignment.

### Control Mapping Assessment View

```sql
SELECT
    mapping_id,
    source_framework,
    source_control_id,
    target_framework,
    target_control_id,
    source_status,        -- Implementation status
    source_latest_result, -- pass|fail|partial from latest assessment
    audit_name,
    audit_framework
FROM control_mapping_assessment;
```

**Use Case**: Show auditor which framework controls have been tested and their results.

---

## Workflows & Examples

### Example 1: Audit with Cross-Framework Mapping

**Scenario**: Compliance team wants to audit against both ISO 27001 and SOC 2 simultaneously.

**Steps**:
1. **Admin** creates audit "ISO 27001 + SOC 2 2026"
2. **Admin** assigns ISO 27001 controls to Control Lead (John)
3. **Admin** views mapping coverage → 72% of ISO controls map to SOC 2
4. **John** enriches 3 ISO controls
5. **Sarah** (Assessor) tests 2 ISO controls:
   - A.5.1 PASS → Automatically satisfies mapped SOC 2 CC6.1 (with note)
   - A.6.1 FAIL → Creates finding for both ISO A.6.1 and SOC 2 CC6.2
6. **Bob** (Reviewer) approves assessments
7. **Report**: "72% SOC 2 compliance achieved via ISO 27001 audit"

### Example 2: Adding New Accessor Mid-Audit

**Scenario**: Control Lead gets sick, need to transfer controls to backup.

**Steps**:
1. **Admin** navigates to Control A.5.1
2. **Admin** opens ControlAccessors component
3. **Admin** removes John (control_lead)
4. **Admin** assigns Jane (control_lead) to same control
5. **System** sends notification to Jane
6. **Jane** continues enrichment from John's version history

### Example 3: Cross-Compliance Reporting

**Scenario**: Leadership wants to know "What compliance do we get from our ISO 27001 audit?"

**Steps**:
1. **Auditor** runs `/api/mappings/audit-coverage?auditId=iso-audit-123`
2. **System** returns:
   ```json
   {
     "auditName": "ISO 27001 2026",
     "totalControls": 25,
     "mappedControls": 18,
     "secondaryFrameworks": ["SOC-2", "CSF"],
     "mappingCoverage": 72.0
   }
   ```
3. **Auditor** generates report: "By testing 25 ISO 27001 controls (18 mapped), we demonstrate 72% SOC 2 compliance"

---

## Testing Checklist

### Accessor Roles

- [ ] Assign user to control as Control Lead
- [ ] Assign same user to same control in different role (Assessor)
- [ ] View all accessors for a control
- [ ] Remove accessor from control
- [ ] Get user's assigned controls via `/api/accessor-assignments`
- [ ] Accessor can only edit controls assigned to them (RBAC enforcement)
- [ ] Multiple users can have same role on same control
- [ ] User cannot be assigned twice to same control + role

### Control Mappings

- [ ] Create mapping between ISO 27001 and SOC 2
- [ ] View all framework mappings overview
- [ ] Get cross-map for specific framework pair
- [ ] Get mappings for a control within an audit
- [ ] Update mapping notes and alignment score
- [ ] Delete mapping
- [ ] Verify pre-populated mappings are present
- [ ] Get audit cross-compliance coverage
- [ ] Mapping appears in control detail view

### Permission Checks

- [ ] Non-admin cannot create mappings
- [ ] Non-admin cannot delete mappings
- [ ] Users can only see controls in their tenant
- [ ] Users can only see mappings in their tenant

---

## Migration Instructions

If upgrading from v0:

1. **Apply migration**:
   ```bash
   psql -U clovrix -d clovrix -f infrastructure/postgres/migrations/2026-07-20_accessors_and_mappings.sql
   ```

2. **Restart backend** (to pick up new modules):
   ```bash
   docker-compose restart api
   ```

3. **Verify endpoints** exist (check Swagger UI at `/swagger`):
   - `/api/accessors`
   - `/api/control/{id}/accessors`
   - `/api/mappings/frameworks`
   - `/api/mappings/cross-map/{from}/{to}`

4. **Test via frontend**:
   - Import ControlAccessors component
   - Test assignment flow
   - Verify API calls work

---

## Performance Notes

- **Accessors lookup**: Indexed on `(audit_control_id, accessor_email, accessor_role)` → O(1)
- **Mapping lookups**: Indexed on source/target frameworks → efficient cross-map queries
- **User listing**: May need pagination for large tenant (100+ users) → add limit/offset
- **Audit coverage**: Aggregation query, runs fast on <100 audits

---

## Future Enhancements

- [ ] **Accessor notifications** - Notify user when assigned to control
- [ ] **Batch accessor assignment** - Assign multiple users to multiple controls
- [ ] **Mapping inheritance** - Child audits inherit parent audit mappings
- [ ] **Mapping approval workflow** - Custom mappings require approval
- [ ] **Mapping templates** - Save/reuse common mapping sets
- [ ] **AI mapping suggestions** - ML-powered control similarity scoring
- [ ] **Mapping versioning** - Track mapping changes over time
- [ ] **Cross-framework reporting** - Automated compliance matrix reports

---

**Questions?** Refer to the inline code comments in:
- `/services/api/src/Clovrix.Api/Modules/Accessors.cs`
- `/services/api/src/Clovrix.Api/Modules/ControlMappings.cs`
- `/services/frontend/src/lib/accessors.ts`
- `/services/frontend/src/components/ControlAccessors.tsx`

**Status**: ✅ Ready for testing and integration.
