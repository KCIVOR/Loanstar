# UAT Issues - September 22

## 1. Agent information in loan applications

**Status:** Done

**Comments / Issue ID:** **UAT-025** — Add an assigned-agent field to loan applications. The meeting decision specifies a staff-editable dropdown listing all active agents.

**Context:** Loan applications may be submitted with help from an agent.

**Current Behavior:** The application form does not show which agent assisted the borrower.

**Issue:** Staff cannot easily identify the agent connected to an application.

**Expected Result:** The application should clearly show the assigned agent.

## 2. Loan application hold option

**Status:** Done

**Comments / Issue ID:** **UAT-040** — Committee hold workflow. The ability to clear a committee hold and return an application to review was a meeting follow-up to this case.

**Context:** The committee may need to temporarily place an application on hold while reviewing it.

**Current Behavior:** The Hold option is not visible, and an application placed on hold cannot be returned to its normal review process.

**Issue:** Staff cannot properly manage applications that need to be paused for review.

**Expected Result:** Staff should be able to place an application on hold and resume its review when ready.

## 3. User list organization

**Status:** Done

**Comments / Issue ID:** **UAT-076** — User Management. Role-based search, filters, pagination, and separating borrower/staff views were meeting follow-ups raised while reviewing this case.

**Context:** The system contains borrower accounts and staff accounts with different responsibilities.

**Current Behavior:** All accounts appear together without an easy way to separate them by role.

**Issue:** It is difficult to find the correct person, and borrower accounts can be mixed with staff accounts.

**Expected Result:** The user list should allow staff to view and filter accounts by role, such as borrowers, agents, and internal staff.

## 4. Deactivated account access

**Status:** Done

**Comments / Issue ID:** **UAT-078** — Deactivate an account and prevent further access. Related reactivation coverage is **UAT-079**.

**Context:** Staff accounts may be deactivated when a user should no longer access the system.

**Current Behavior:** A deactivated user can still sign in.

**Issue:** Former or inactive users may continue to access the system.

**Expected Result:** Once an account is deactivated, the user should no longer be able to sign in.

## 5. Restricted page message

**Status:** Done

**Comments / Issue ID:** **UAT-094** — Users without permission must receive a clear restricted-access message and be guided to an appropriate page.

**Context:** Users should only access pages related to their assigned role.

**Current Behavior:** When users try to open a page they are not allowed to access, the message shown is unclear.

**Issue:** Users may not understand why they cannot continue or what they should do next.

**Expected Result:** The system should display a clear message explaining that access is not allowed and guide the user back to the appropriate page.

## 6. Separation of borrower and staff accounts

**Comments / Issue ID:** **UAT-076 follow-up** — Organize User Management so borrowers, staff, mixed-role users, and unassigned users can be clearly identified without changing account permissions.

**Context:** Borrowers and staff use the system for different purposes.

**Current Behavior:** Borrower and staff accounts are shown together in shared account lists.

**Issue:** This can make account management confusing and does not clearly separate customer records from internal staff records.

**Expected Result:** Borrower accounts and staff accounts should be clearly separated, with each group visible only in the appropriate account view.

## 7. Agent dashboard

**Status:** Done

**Comments / Issue ID:** **Meeting follow-up; no separate UAT case ID confirmed** — An Agent’s `/dashboard` analytics must show only that agent’s own leads and applications, never organisation-wide Agent totals.

**Context:** Agents need to manage their own borrower leads and applications.

**Current Behavior:** Agents share a dashboard or account view with other user groups.

**Issue:** Agents do not have a dedicated workspace focused on their own leads, borrowers, and application activity.

**Expected Result:** Each agent should have a separate dashboard that shows only their assigned leads, borrowers, and applications.
