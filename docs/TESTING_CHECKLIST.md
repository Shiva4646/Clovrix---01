# Clovrix Platform v1 - Testing Checklist

## End-to-End Workflow Testing

### 1. Compliance Admin Role
- [ ] **Audit Creation**
  - [ ] Navigate to Admin Dashboard
  - [ ] Create new audit with framework (ISO 27001)
  - [ ] Verify audit appears in list with "draft" status
  - [ ] Can edit audit details
  - [ ] Can delete draft audit

- [ ] **Control Assignment**
  - [ ] Assign framework controls to audit
  - [ ] Verify audit status changes to "active"
  - [ ] Controls appear in Control Lead view
  - [ ] Can reassign controls to different leads

- [ ] **Audit Closure**
  - [ ] View audit summary with control metrics
  - [ ] Cannot close audit with:
    - [ ] Controls not ready for assessment
    - [ ] Pending assessments
    - [ ] Open findings
  - [ ] Can close completed audit
  - [ ] Closed audit locked from edits

### 2. Control Lead Role
- [ ] **View Assigned Controls**
  - [ ] Navigate to Assigned Controls page
  - [ ] See only controls assigned to me
  - [ ] Filter/search by framework, status, priority
  - [ ] Sort by due date, status, etc.

- [ ] **Control Enrichment**
  - [ ] Update requirement summary
  - [ ] Add implementation notes
  - [ ] Upload evidence requirements
  - [ ] Add policy documentation
  - [ ] Updates save successfully (no errors)
  - [ ] Version history recorded for each change

- [ ] **Status Transitions**
  - [ ] Change status: Not Started → In Progress
  - [ ] Change status: In Progress → Completed
  - [ ] Cannot skip status levels (must be sequential)
  - [ ] Cannot mark ready until In Progress or Completed

- [ ] **Ready for Assessment**
  - [ ] Mark control ready (transitions to Assessor queue)
  - [ ] Cannot edit ready controls (locked)
  - [ ] Cannot mark ready with incomplete required fields

### 3. Assessor Role
- [ ] **Assessment Queue**
  - [ ] See all ready controls across audits
  - [ ] Filter by audit, framework, priority
  - [ ] See latest test result per control

- [ ] **Manual Assessment**
  - [ ] Open control for testing
  - [ ] Record assessment result (Pass/Fail/Partial)
  - [ ] Add assessment comments
  - [ ] Submit assessment

- [ ] **Automated Assessment**
  - [ ] Trigger automated assessment
  - [ ] System records result
  - [ ] Verify assessment appears in history

- [ ] **Finding Creation**
  - [ ] Fail result auto-creates finding
  - [ ] Finding linked to control
  - [ ] Finding severity set correctly
  - [ ] Finding references assessment comments

- [ ] **Assessment History**
  - [ ] View all assessments for a control
  - [ ] See timestamps and methods
  - [ ] Review assessor notes

### 4. Reviewer Role
- [ ] **Review Queue**
  - [ ] Navigate to assessments pending review
  - [ ] Filter by status, audit, priority
  - [ ] See assessment details + findings

- [ ] **Approval Workflow**
  - [ ] Approve passed assessment
  - [ ] Return failed assessment with comments
  - [ ] Cannot approve without decision
  - [ ] Cannot return without comments

- [ ] **Evidence Review**
  - [ ] View evidence links in assessment
  - [ ] Download/access evidence files
  - [ ] See control lead's implementation notes

### 5. Lead Auditor Role
- [ ] **Audit Visibility**
  - [ ] View all audits (all statuses)
  - [ ] See audit progress metrics
  - [ ] View framework coverage per audit
  - [ ] See findings by severity

- [ ] **Report Generation**
  - [ ] Generate audit completion report
  - [ ] Generate findings report
  - [ ] Export data in required format

### 6. Risk Owner Role
- [ ] **Risk Assignment**
  - [ ] See findings assigned to controls
  - [ ] View remediation actions
  - [ ] Accept/reject risk remediation

### 7. Cross-Role Features
- [ ] **Dashboard**
  - [ ] Admin sees all metrics
  - [ ] Each role sees their role-specific metrics
  - [ ] KPI cards update in real-time
  - [ ] Charts render correctly

- [ ] **Notifications**
  - [ ] Role gets notification on assignment
  - [ ] Notifications appear in header
  - [ ] Can dismiss notifications
  - [ ] Can take action from notification

- [ ] **Audit Logs**
  - [ ] All actions logged with user/timestamp
  - [ ] Logs appear in audit trail
  - [ ] Compliance admin can view logs

## UI/UX Testing

### Professional Appearance
- [ ] Logo displays correctly in:
  - [ ] Login page
  - [ ] Navigation sidebar
  - [ ] Topbar
- [ ] Color scheme matches CLOVRIX brand
  - [ ] Navy blue (#001052) for dark elements
  - [ ] Bright blue (#0056B3) for accent
  - [ ] Teal (#1DB9A2) for secondary accents
- [ ] Consistent spacing and alignment
- [ ] Buttons have hover effects
- [ ] Cards have subtle shadows
- [ ] Text contrast is readable

### Responsive Design
- [ ] Works on desktop (1280px+)
- [ ] Works on tablet (768px)
- [ ] Works on mobile (375px)
- [ ] No horizontal scroll
- [ ] Touch-friendly buttons (≥44px)

### Accessibility
- [ ] All form fields have labels
- [ ] Error messages are clear
- [ ] Focus indicators visible
- [ ] Keyboard navigation works
- [ ] Screen reader compatible (basic check)

## Data Persistence Testing

- [ ] All data saves to database
- [ ] No data loss on page refresh
- [ ] Audit trail accurate
- [ ] Version history complete
- [ ] Soft deletes work (not hard delete)
- [ ] Tenant isolation enforced

## Security Testing

- [ ] Cannot access other tenant's data
- [ ] Cannot access other user's private data
- [ ] RBAC enforced (e.g., Assessor can't close audits)
- [ ] JWT tokens validated
- [ ] Expired tokens redirect to login
- [ ] CSRF protection enabled
- [ ] Input sanitization (no XSS)
- [ ] SQL injection prevention (Dapper parameterized queries)

## Performance Testing

- [ ] Dashboard loads in <2 seconds
- [ ] List pages load in <1 second with 100+ items
- [ ] No N+1 query issues
- [ ] Bulk operations responsive
- [ ] Search/filter responsive

## Error Handling

- [ ] Validation errors clear
- [ ] Server errors return proper HTTP codes
- [ ] Network errors gracefully handled
- [ ] Session expiry handled
- [ ] Conflict errors (409) show message
- [ ] Not found errors (404) shown
- [ ] Unauthorized errors (403) shown

## Browser Compatibility

- [ ] Chrome/Edge (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)

---

## Test Data Setup

### Demo Audit Scenario
1. Admin creates "ISO 27001 2026 Compliance Audit"
2. Assign 5 controls from SOC 2 and ISO 27001
3. Control Lead enriches 3 controls, marks ready
4. Assessor tests 2 controls: 1 pass, 1 fail
5. Failing control creates finding
6. Reviewer approves 1, returns 1
7. Control Lead re-submits returned assessment
8. Admin closes audit

### Expected Final State
- Audit: "closed" status
- 5 controls total, 2 assessed (2 pass, 1 fail), 3 not assessed
- 1 finding (open)
- 3 assessments approved, 1 returned
- Version history on all controls enriched

---

## Known Issues / Workarounds

(To be filled during testing)

---

## Sign-Off

- [ ] All critical path items tested
- [ ] No blocking bugs
- [ ] UI professionally designed
- [ ] Ready for demo/release
