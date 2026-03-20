# Roles & Permissions System — Manual Test Plan

> Date: 2026-03-20
> Tester: tulasinath
> Branch: feature/teams-system
> Instructions: For each test, write PASS/FAIL and any notes in the Result column.

---

## Pre-requisites

- [ ] Reset the database (clean slate)
- [ ] Run `pnpm paperclipai onboard` — should default to `authenticated` mode
- [ ] Start dev server

---

## 1. Bootstrap & Admin Setup

| # | Test | Expected | Result |
|---|------|----------|--------|
| 1.1 | Visit `localhost:3100` — should redirect to `/auth` with admin setup form | Admin setup form shown (not "Instance setup required" CLI page) | |
| 1.2 | Create admin account (name, email, password) | Account created, redirected to `/`, onboarding wizard appears | |
| 1.3 | Create a company via onboarding | Company created, dashboard shown | |
| 1.4 | Check Settings → Roles & Permissions section | 3 system roles visible: Admin, Manager, Employee | |
| 1.5 | Admin role shows "system" badge and no edit button | Cannot edit admin role | |
| 1.6 | Manager/Employee roles show edit (pencil) button | Can click to edit | |
| 1.7 | Your name appears in "Member Roles" with Admin role selected | Correct | |

---

## 2. Invite & Member Join Flow

| # | Test | Expected | Result |
|---|------|----------|--------|
| 2.1 | Click "Copy invite code" on Team Members page | Token copied to clipboard (e.g., `pcp_invite_xxxx`) | |
| 2.2 | Open incognito/different browser, visit `/auth` | Sign up form shown with invite code field | |
| 2.3 | Sign up with name, email, password, and the invite code | Account created, "Waiting for approval" screen shown | |
| 2.4 | Switch to admin browser → Inbox shows join request | Join request card visible with approve/reject buttons | |
| 2.5 | Approve the join request | Request approved, member gets access | |
| 2.6 | Member refreshes → "Waiting for assignment" screen shown | Member has no projects/agents yet | |

---

## 3. Role Assignment

| # | Test | Expected | Result |
|---|------|----------|--------|
| 3.1 | Admin → Settings → Roles section → change member's role to "Manager" | Dropdown changes, saves successfully | |
| 3.2 | Member refreshes → should now see more sidebar items (Goals, Costs, Activity, etc.) | Manager permissions apply | |
| 3.3 | Change member's role back to "Employee" | Dropdown changes, saves successfully | |
| 3.4 | Member refreshes → sidebar items hidden again | Employee permissions apply | |

---

## 4. Custom Roles

| # | Test | Expected | Result |
|---|------|----------|--------|
| 4.1 | Admin → Settings → Roles → "New Role" | Create role dialog opens | |
| 4.2 | Create role "Project Lead" with permissions: issues:create, tasks:assign, projects:create, projects:update, agents:create | Role created, appears in list | |
| 4.3 | Assign the new "Project Lead" role to the member | Dropdown shows new role, saves | |
| 4.4 | Member refreshes → can see "Projects +" button but NOT Goals, Costs, Activity, Team Members, Settings | Correct permission scoping | |
| 4.5 | Edit "Project Lead" role → add `costs:view` permission | Role updated | |
| 4.6 | Member refreshes → Costs link now visible in sidebar | Permission change takes effect | |
| 4.7 | Delete "Project Lead" custom role | Confirmation dialog shown, role deleted, member reassigned to Employee | |
| 4.8 | Try to delete "Admin" system role | Should be blocked (system roles can't be deleted) | |
| 4.9 | Try to delete "Manager" system role | Should be blocked | |

---

## 5. Admin Permissions (Full Access)

| # | Test | Expected | Result |
|---|------|----------|--------|
| 5.1 | Admin can see all sidebar items: Dashboard, Overview, Inbox, Issues, Goals, Projects, Agents, Org, Costs, Activity, Team Members, Settings | All visible | |
| 5.2 | Admin can create agents (+ button in sidebar) | Works | |
| 5.3 | Admin can create projects (+ button) | Works | |
| 5.4 | Admin can create goals | Works | |
| 5.5 | Admin can archive/delete projects | Works | |
| 5.6 | Admin can approve agent hire requests in Inbox | Works | |
| 5.7 | Admin can access instance settings (gear icon in bottom bar) | Works | |
| 5.8 | Admin can transfer ownership | Transfer targets shown, transfer works | |
| 5.9 | Admin sees all agents in dashboard, org chart, sidebar | Full view | |
| 5.10 | Admin sees all issues (including unscoped ones) | Full view | |

---

## 6. Manager Permissions

| # | Test | Expected | Result |
|---|------|----------|--------|
| 6.1 | Assign member as Manager | Role assigned | |
| 6.2 | Manager sees: Dashboard, Overview, Inbox, Issues, Goals, Projects +, Agents +, Org, Costs, Activity, Team Members, Settings | All except some admin-only actions | |
| 6.3 | Manager can create agents | Works | |
| 6.4 | Manager can create projects | Works | |
| 6.5 | Manager can approve hire requests | Works | |
| 6.6 | Manager CANNOT delete company (try via URL `/company/settings` → no archive button) | Archive/delete hidden | |
| 6.7 | Manager CANNOT transfer ownership | Transfer targets endpoint returns 403 | |
| 6.8 | Manager CANNOT access instance settings | Redirected to dashboard | |
| 6.9 | Manager CANNOT manage roles & permissions section | Section hidden in settings | |
| 6.10 | Manager sees all agents/issues (has dashboard:view_full) | Full view | |

---

## 7. Employee Permissions

| # | Test | Expected | Result |
|---|------|----------|--------|
| 7.1 | Assign member as Employee | Role assigned | |
| 7.2 | Employee sidebar shows: New Issue, Dashboard, Inbox, Issues, Projects (assigned only), Agents (subordinates only), Org | Limited sidebar | |
| 7.3 | Employee does NOT see: Overview, Goals, Costs, Activity, Team Members, Settings | Hidden | |
| 7.4 | Employee CANNOT create agents (no + button, `/agents/new` redirects) | Blocked | |
| 7.5 | Employee CANNOT create projects (no + button) | Hidden | |
| 7.6 | Employee CANNOT create goals | Route redirects to dashboard | |
| 7.7 | Employee CANNOT approve hire requests (Inbox approvals hidden) | Not visible | |
| 7.8 | Employee CANNOT access Settings page (URL redirects) | Redirected | |
| 7.9 | Employee CANNOT access instance settings (URL redirects) | Redirected | |
| 7.10 | Employee CANNOT delete/archive company (no UI + server 403) | Blocked | |

---

## 8. Employee — Project & Issue Scoping

| # | Test | Expected | Result |
|---|------|----------|--------|
| 8.1 | Admin assigns employee to a project via Settings → Hierarchy & Project Assignments | Assignment saved | |
| 8.2 | Employee refreshes → project appears in sidebar | Visible | |
| 8.3 | Employee can see issues in that project only | Other project issues hidden | |
| 8.4 | Employee can create issues in their assigned project | Works, project auto-selected | |
| 8.5 | Employee CANNOT create issues without a project ("No project" option hidden) | Not available | |
| 8.6 | Employee CANNOT see issues from other projects | Not visible | |
| 8.7 | Employee CANNOT view issue detail from unassigned project (direct URL) | 403 error | |

---

## 9. Employee — Agent & Hierarchy Scoping

| # | Test | Expected | Result |
|---|------|----------|--------|
| 9.1 | Admin assigns agents under employee in hierarchy (Settings → Hierarchy) | Agent reports to employee | |
| 9.2 | Employee sees only their subordinate agents in sidebar | Correct scoping | |
| 9.3 | Employee can assign issues to their subordinate agents | Works | |
| 9.4 | Employee CANNOT assign issues to agents outside their hierarchy | Server 403 | |
| 9.5 | Employee CANNOT edit config of agents outside their hierarchy | Server 403 | |
| 9.6 | Employee CAN pause/resume their subordinate agents | Works | |
| 9.7 | Employee CANNOT pause/resume agents outside their hierarchy | Server 403 | |
| 9.8 | Org chart shows only employee's subtree | Correct scoping | |
| 9.9 | Dashboard shows only employee's agents/activity | Scoped view | |
| 9.10 | Live run count in sidebar only counts employee's agent runs | Correct count | |

---

## 10. Employee — No Assignments

| # | Test | Expected | Result |
|---|------|----------|--------|
| 10.1 | Remove all project assignments + hierarchy from employee | All removed | |
| 10.2 | Employee refreshes → "Waiting for assignment" screen shown | Correct screen | |
| 10.3 | Org chart shows empty (no agents) | Empty tree | |
| 10.4 | Sidebar shows no agents, no projects | Empty sections | |
| 10.5 | Dashboard shows 0 agents, 0 tasks | Zeroed metrics | |

---

## 11. Server-Side Guardrails (API Direct Access)

Test by calling APIs directly (e.g., curl) as an employee:

| # | Test | Expected | Result |
|---|------|----------|--------|
| 11.1 | `PATCH /companies/:id` (edit company) | 403 Missing permission: company:update | |
| 11.2 | `DELETE /companies/:id` | 403 Missing permission: company:delete | |
| 11.3 | `POST /companies/:id/archive` | 403 Missing permission: company:archive | |
| 11.4 | `DELETE /agents/:id` (delete any agent) | 403 Missing permission: agents:manage | |
| 11.5 | `POST /agents/:id/pause` (non-subordinate agent) | 403 | |
| 11.6 | `PATCH /agents/:id` (edit non-subordinate agent config) | 403 | |
| 11.7 | `POST /companies/:id/goals` | 403 Missing permission: goals:create | |
| 11.8 | `DELETE /projects/:id` | 403 Missing permission: projects:delete | |
| 11.9 | `POST /approvals/:id/approve` | 403 Missing permission: approvals:decide | |
| 11.10 | `POST /companies/:id/issues` without projectId | 400 A project must be selected | |
| 11.11 | `POST /companies/:id/issues` with unassigned projectId | 403 You do not have access to this project | |
| 11.12 | `GET /issues/:id` for issue in unassigned project | 403 | |
| 11.13 | `GET /heartbeat-runs/:runId` for non-subordinate agent's run | 403 | |

---

## 12. Two-Tier Permission Resolution

| # | Test | Expected | Result |
|---|------|----------|--------|
| 12.1 | Employee has role with only `tasks:assign` + `issues:create` | Correct — limited access | |
| 12.2 | Admin grants `approvals:decide` to employee via `principal_permission_grants` table directly (SQL) | Individual grant added | |
| 12.3 | Employee can now see approvals in Inbox and approve them | Works (per-principal grant overrides role) | |
| 12.4 | Remove the individual grant | Employee can no longer approve | |

---

## 13. UI Consistency

| # | Test | Expected | Result |
|---|------|----------|--------|
| 13.1 | Employee navigates to `/company/team-members` via URL | Redirected to dashboard | |
| 13.2 | Employee navigates to `/overall-dashboard` via URL | Redirected to dashboard | |
| 13.3 | Employee navigates to `/goals` via URL | Redirected to dashboard | |
| 13.4 | Employee navigates to `/costs` via URL | Redirected to dashboard | |
| 13.5 | Employee navigates to `/activity` via URL | Redirected to dashboard | |
| 13.6 | Employee navigates to `/company/settings` via URL | Redirected to dashboard | |
| 13.7 | Employee navigates to `/instance/settings/heartbeats` via URL | Redirected to `/` | |
| 13.8 | Employee navigates to `/agents/new` via URL | Can access (employees can't create, but managers can — test with correct role) | |
| 13.9 | MemberDetail page → breadcrumb does NOT show "Team Members" link for employees | Correct | |
| 13.10 | Password fields on Auth page have eye toggle | Toggle works | |

---

## 14. Migration & Backward Compatibility

| # | Test | Expected | Result |
|---|------|----------|--------|
| 14.1 | After fresh setup, company has 3 system roles seeded | Admin, Manager, Employee present | |
| 14.2 | First user's `membershipRole` is "admin" (not "owner") | Correct | |
| 14.3 | `GET /companies/:id/my-permissions` returns all 24 keys for admin | Full permission set | |
| 14.4 | `GET /companies/:id/my-permissions` returns 2 keys for employee | `tasks:assign`, `issues:create` | |
| 14.5 | `GET /companies/:id/roles` returns roles with permission arrays | Correct structure | |

---

## Summary

| Category | Total Tests | Pass | Fail | Notes |
|----------|------------|------|------|-------|
| Bootstrap & Admin Setup | 7 | | | |
| Invite & Member Join | 6 | | | |
| Role Assignment | 4 | | | |
| Custom Roles | 9 | | | |
| Admin Permissions | 10 | | | |
| Manager Permissions | 10 | | | |
| Employee Permissions | 10 | | | |
| Employee Project/Issue Scoping | 7 | | | |
| Employee Agent/Hierarchy Scoping | 10 | | | |
| Employee No Assignments | 5 | | | |
| Server Guardrails | 13 | | | |
| Two-Tier Resolution | 4 | | | |
| UI Consistency | 10 | | | |
| Migration & Backward Compat | 5 | | | |
| **TOTAL** | **110** | | | |
