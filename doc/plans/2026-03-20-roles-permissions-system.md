# Roles & Permissions System — Implementation Plan

> Status: IMPLEMENTED — all phases complete
> Created: 2026-03-20
> Completed: 2026-03-20
> Author: Claude + tulasinath

---

## Problem

Currently the system has two hardcoded roles: `"owner"` and `"member"` stored as a free-text string in `company_memberships.membershipRole`. All access control is done via `membershipRole === "owner"` checks scattered across ~15 UI files and ~12 server route files. This is inflexible — there's no way to create a "manager" who can approve hirings but can't delete the company.

## Solution

Replace hardcoded role checks with a proper roles & permissions system:
- Roles are defined per-company in a `company_roles` table
- Each role has a set of permission keys in `company_role_permissions`
- Access checks use `hasRolePermission(companyId, userId, "permission:key")` instead of `membershipRole === "owner"`
- Admin can create custom roles with fine-grained permission selection

---

## Architecture

### Two-Tier Permission Resolution

When checking if a user has a permission, the system checks TWO sources in order:

1. **Role-based permissions** (NEW): Look up the user's role via `company_memberships.role_id` → `company_roles` → `company_role_permissions`. If the role has the permission key, ALLOW.

2. **Per-principal grants** (EXISTING): Fall back to the existing `principal_permission_grants` table which stores individual permission overrides per user. This allows granting a specific permission to a user WITHOUT changing their role.

Example: An "employee" role doesn't have `approvals:decide`. But the admin can grant `approvals:decide` specifically to user X via `principal_permission_grants`, making them able to approve without being a manager.

This is why it's "two-tier" — role permissions are the base, individual grants are overrides.

### Roles Are Per-Company

Each company gets its own set of roles. When a company is created, three system roles are automatically seeded: `admin`, `manager`, `employee`. The admin can then create additional custom roles (e.g., "project_lead", "contractor", "viewer").

System roles (`is_system = true`) cannot be deleted. The `admin` system role always has ALL permissions and cannot be modified (prevents lockout).

### Permission Keys Are The Source of Truth

Both server and UI check permission KEY STRINGS (e.g., `"projects:create"`) rather than role names. The role is just a convenient grouping of permissions. This means:
- Adding a new feature = adding a new permission key
- No need to update role definitions when adding features
- Custom roles automatically get access to new features if the admin grants the permission

---

## Database Schema

### New Table: `company_roles`

```sql
CREATE TABLE company_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,                -- e.g. "admin", "manager", "employee", "custom_role"
  display_name TEXT NOT NULL,        -- e.g. "Admin", "Manager", "Employee", "Project Lead"
  is_system BOOLEAN NOT NULL DEFAULT false,  -- true for admin/manager/employee (can't be deleted)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, slug)
);
```

### New Table: `company_role_permissions`

```sql
CREATE TABLE company_role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID NOT NULL REFERENCES company_roles(id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(role_id, permission_key)
);
```

### Modified Table: `company_memberships`

Add column:
```sql
ALTER TABLE company_memberships ADD COLUMN role_id UUID REFERENCES company_roles(id);
```

The existing `membership_role` text column is kept and updated alongside `role_id` for backward compatibility. Values change: `"owner"` → `"admin"`, `"member"` → `"employee"`.

---

## Permission Keys (Complete List)

### Existing (already in PERMISSION_KEYS constant)
- `agents:create` — create new agents
- `users:invite` — invite humans to company
- `users:manage_permissions` — manage user permissions/roles
- `tasks:assign` — assign tasks to agents/users
- `tasks:assign_scope` — scoped task assignment
- `joins:approve` — approve join requests

### New (to be added)
- `company:update` — edit company name/settings/branding
- `company:archive` — archive the company
- `company:delete` — delete the company
- `company:transfer` — transfer ownership
- `agents:manage` — edit/delete/pause/resume/terminate agents (beyond just creating)
- `projects:create` — create new projects
- `projects:update` — edit project settings
- `projects:delete` — delete/archive projects
- `goals:create` — create goals
- `goals:update` — edit goals
- `goals:delete` — delete goals
- `approvals:decide` — approve or reject approval requests
- `issues:create` — create issues (note: employees get this too)
- `costs:view` — view cost/budget data
- `activity:view` — view company activity log
- `team:view` — view team members list
- `dashboard:view_full` — see full dashboard (all agents, all metrics)
- `settings:view` — access company settings page

---

## Default Role Permission Mapping

### admin (ALL permissions — immutable)
Gets every permission key. Cannot be modified. Prevents lockout.

### manager
Gets everything EXCEPT:
- `company:delete`
- `company:transfer`
- `company:archive`
- `users:manage_permissions`

### employee
Gets only:
- `tasks:assign` (to their subordinate agents)
- `issues:create`

NOTE: Employees CANNOT create agents. Only managers and admins can (`agents:create`).

---

## Migration Strategy (migration `0040_custom_roles.sql`)

1. Create `company_roles` and `company_role_permissions` tables
2. Add `role_id` column to `company_memberships`
3. For EACH existing company:
   a. Insert 3 system roles: admin, manager, employee
   b. Insert permission keys for each role into `company_role_permissions`
4. Migrate existing memberships:
   - `membership_role = 'owner'` → set `role_id` to company's admin role, update `membership_role` to `'admin'`
   - `membership_role = 'member'` OR NULL → set `role_id` to company's employee role, update `membership_role` to `'employee'`

---

## Implementation Phases

### Phase 1: Schema & Constants (no runtime impact)

**Files to create:**
- `packages/db/src/schema/company_roles.ts`
- `packages/db/src/schema/company_role_permissions.ts`

**Files to modify:**
- `packages/db/src/schema/company_memberships.ts` — add `roleId` column
- `packages/db/src/schema/index.ts` — export new tables
- `packages/shared/src/constants.ts` — expand PERMISSION_KEYS, add MEMBERSHIP_ROLES
- `packages/shared/src/types/access.ts` — add CompanyRole, CompanyRolePermission interfaces, add roleId to CompanyMembership
- `packages/shared/src/types/index.ts` — export new types
- `packages/shared/src/index.ts` — re-export

### Phase 2: Migration

**Files to create:**
- `packages/db/src/migrations/0040_custom_roles.sql`

### Phase 3: Access Service Refactor

**Files to modify:**
- `server/src/services/access.ts`:
  - Add `hasRolePermission(companyId, principalType, principalId, permissionKey)` — checks role permissions then per-principal grants
  - Update `canUser()` to use `hasRolePermission` instead of just `hasPermission`
  - Update `getVisibleAgentIds()` — replace `membershipRole === "owner"` with admin role check
  - Add `getMyPermissions(companyId, userId)` — returns all permission keys the user has
  - Add `listRoles(companyId)`, `createRole()`, `updateRolePermissions()`, `deleteRole()`
  - Add `seedDefaultRoles(companyId)` — called when creating a new company

- `server/src/routes/authz.ts`:
  - Add `assertPermission(req, companyId, permissionKey)` — replaces `assertOwner`
  - Keep `assertOwner` as deprecated wrapper (calls assertPermission with all-check)

### Phase 4: Route Updates

Replace every `assertOwner(req, companyId)` with specific `assertPermission(req, companyId, "key")`:

| File | Current | New |
|------|---------|-----|
| `routes/companies.ts:154` | `assertOwner` | `assertPermission(req, companyId, "company:update")` |
| `routes/companies.ts:174` | `assertOwner` | `assertPermission(req, companyId, "company:archive")` |
| `routes/companies.ts:193` | `assertOwner` | `assertPermission(req, companyId, "company:delete")` |
| `routes/agents.ts:1315` | `assertOwner` | `assertPermission(req, companyId, "agents:manage")` |
| `routes/projects.ts:111` | `assertBoard` | `assertPermission(req, companyId, "projects:create")` |
| `routes/projects.ts:160` | `assertOwner` | `assertPermission(req, companyId, "projects:update")` |
| `routes/projects.ts:310` | `assertOwner` | `assertPermission(req, companyId, "projects:delete")` |
| `routes/goals.ts:32` | `assertOwner` | `assertPermission(req, companyId, "goals:create")` |
| `routes/goals.ts:55` | `assertOwner` | `assertPermission(req, companyId, "goals:update")` |
| `routes/goals.ts:84` | `assertOwner` | `assertPermission(req, companyId, "goals:delete")` |
| `routes/approvals.ts:125` | `assertOwner` | `assertPermission(req, companyId, "approvals:decide")` |
| `routes/approvals.ts:222` | `assertOwner` | `assertPermission(req, companyId, "approvals:decide")` |

### Phase 5A: Server API Endpoints

Add to `server/src/routes/access.ts`:
- `GET /companies/:companyId/roles` — list all roles for a company
- `POST /companies/:companyId/roles` — create custom role (requires `users:manage_permissions`)
- `PATCH /companies/:companyId/roles/:roleId` — update role display name + permissions (requires `users:manage_permissions`, can't modify admin role)
- `DELETE /companies/:companyId/roles/:roleId` — delete custom role (requires `users:manage_permissions`, can't delete system roles)
- `GET /companies/:companyId/my-permissions` — returns `string[]` of all permission keys the current user has
- `PATCH /companies/:companyId/members/:memberId/role` — assign a role to a member (requires `users:manage_permissions`)

Add to `ui/src/api/access.ts`:
- `listRoles(companyId)`
- `createRole(companyId, { slug, displayName, permissionKeys })`
- `updateRole(companyId, roleId, { displayName, permissionKeys })`
- `deleteRole(companyId, roleId)`
- `getMyPermissions(companyId)` → `string[]`
- `updateMemberRole(companyId, memberId, roleId)`

### Phase 5B: UI Permission Hook

Create `ui/src/hooks/useMyPermissions.ts`:
```typescript
export function useMyPermissions() {
  const { selectedCompanyId } = useCompany();
  const { data: permissions } = useQuery({
    queryKey: queryKeys.access.myPermissions(selectedCompanyId!),
    queryFn: () => accessApi.getMyPermissions(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    staleTime: 30_000, // cache for 30s
  });

  const hasPermission = useCallback(
    (key: string) => (permissions ?? []).includes(key),
    [permissions],
  );

  return { permissions: permissions ?? [], hasPermission };
}
```

### Phase 5C: UI Component Updates

Replace ALL `isOwner` / `membershipRole === "owner"` checks with `hasPermission("key")`:

| File | Current | New |
|------|---------|-----|
| `Sidebar.tsx` | `isOwner && <NavItem to="/costs">` | `hasPermission("costs:view") && <NavItem>` |
| `Sidebar.tsx` | `isOwner && <NavItem to="/activity">` | `hasPermission("activity:view") && <NavItem>` |
| `Sidebar.tsx` | `isOwner && <NavItem to="/team-members">` | `hasPermission("team:view") && <NavItem>` |
| `Sidebar.tsx` | `isOwner && <NavItem to="/settings">` | `hasPermission("settings:view") && <NavItem>` |
| `Dashboard.tsx` | `isOwner` for metrics | `hasPermission("dashboard:view_full")` |
| `Projects.tsx` | `isOwner` for create button | `hasPermission("projects:create")` |
| `ProjectDetail.tsx` | `isProjectOwner` for archive | `hasPermission("projects:delete")` |
| `Inbox.tsx` | `isInboxOwner` for approvals | `hasPermission("approvals:decide")` |
| `App.tsx OwnerOnly` | `membershipRole === "owner"` | permission-based check |
| `CompanyRail.tsx` | `isRailOwner` | `hasPermission("settings:view")` |
| `Layout.tsx` | `isLayoutOwner` | `hasPermission("settings:view")` |
| `IssuesList.tsx` | `canCreateIssue` | `hasPermission("issues:create")` |
| `SidebarProjects.tsx` | `isOwner` for "+" button | `hasPermission("projects:create")` |
| `NewIssueDialog.tsx` | `isIssueOwner` | `hasPermission("issues:create")` |
| `TeamMembers.tsx` | role display | show role `displayName` from roles list |

### Phase 5D: Role Management UI

New section in CompanySettings (or dedicated page):
- List all roles with their permissions
- "Create Role" dialog: name + permission checkbox grid
- Edit role: toggle permissions on/off
- Delete custom roles (with confirmation)
- Assign roles to members in the team members list

### Phase 6: Bootstrap & Company Creation

**Files to modify:**
- `server/src/board-claim.ts` — set `membershipRole: "admin"` instead of `"owner"`, set `role_id`
- `server/src/services/access.ts ensureMembership()` — default to `"employee"` role instead of `"member"`
- Company creation flow — call `seedDefaultRoles(companyId)` after creating a company
- Onboarding wizard — set the first user's role to admin

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Admin lockout (no one has admin role) | Admin role always has all permissions, is_system prevents deletion |
| Migration fails mid-way | Migration is idempotent (ON CONFLICT DO NOTHING for seeding) |
| Breaking existing API consumers | `membership_role` text column kept alongside `role_id` |
| Performance (extra DB queries per request) | `my-permissions` cached in UI; server can cache role→permissions in memory |
| Custom role name conflicts | `UNIQUE(company_id, slug)` constraint prevents duplicates |

---

## Testing Checklist

After implementation, verify:
- [ ] New company gets 3 default roles seeded
- [ ] Existing companies migrated correctly (owner→admin, member→employee)
- [ ] Admin can do everything
- [ ] Manager can do most things but not delete company
- [ ] Employee can only create issues/agents and assign to subordinates
- [ ] Custom role with specific permissions works correctly
- [ ] Per-principal grants still work as overrides
- [ ] UI shows/hides elements based on permissions, not role name
- [ ] Role management UI works (CRUD)
- [ ] Assigning role to a member updates their permissions immediately
- [ ] Deleting a custom role reassigns affected members to employee
- [ ] Bootstrap creates admin role correctly
- [ ] Transfer ownership transfers admin role

---

## File Impact Summary

**New files (6):**
- `packages/db/src/schema/company_roles.ts`
- `packages/db/src/schema/company_role_permissions.ts`
- `packages/db/src/migrations/0040_custom_roles.sql`
- `ui/src/hooks/useMyPermissions.ts`
- `doc/plans/2026-03-20-roles-permissions-system.md` (this file)

**Modified files (~25):**
- `packages/db/src/schema/company_memberships.ts`
- `packages/db/src/schema/index.ts`
- `packages/shared/src/constants.ts`
- `packages/shared/src/types/access.ts`
- `packages/shared/src/types/index.ts`
- `packages/shared/src/index.ts`
- `server/src/services/access.ts`
- `server/src/routes/authz.ts`
- `server/src/routes/companies.ts`
- `server/src/routes/agents.ts`
- `server/src/routes/projects.ts`
- `server/src/routes/goals.ts`
- `server/src/routes/approvals.ts`
- `server/src/routes/access.ts`
- `server/src/board-claim.ts`
- `ui/src/App.tsx`
- `ui/src/api/access.ts`
- `ui/src/lib/queryKeys.ts`
- `ui/src/components/Sidebar.tsx`
- `ui/src/components/Layout.tsx`
- `ui/src/components/CompanyRail.tsx`
- `ui/src/components/SidebarProjects.tsx`
- `ui/src/components/NewIssueDialog.tsx`
- `ui/src/components/IssuesList.tsx`
- `ui/src/components/ProjectProperties.tsx`
- `ui/src/pages/Dashboard.tsx`
- `ui/src/pages/Projects.tsx`
- `ui/src/pages/ProjectDetail.tsx`
- `ui/src/pages/Inbox.tsx`
- `ui/src/pages/TeamMembers.tsx`
- `ui/src/pages/MemberDetail.tsx`
- `ui/src/pages/CompanySettings.tsx`

---

## Deviations from Original Plan

### Changes made during implementation:

1. **Employee role does NOT get `agents:create`** — Original plan gave employees `agents:create`. Changed per user request: only managers and admins can create agents.

2. **Role management UI in CompanySettings, not a separate page** — Plan suggested `/:companyPrefix/company/roles` as a dedicated page. Instead, added a "Roles & Permissions" section directly in Company Settings (gated behind `users:manage_permissions`). This is simpler and keeps all company config in one place.

3. **`assertOwner` kept as backward-compatible wrapper** — Plan said to deprecate `assertOwner`. It's still in `authz.ts` as a fallback that accepts both `"admin"` and `"owner"` membershipRole values. This prevents breakage during the migration period where existing DB rows may still have `"owner"`.

4. **`CompanyAccessGate` still uses membershipRole check** — The "waiting for assignment" screen in `App.tsx` still checks `membershipRole !== "admin" && membershipRole !== "owner"` directly rather than using `hasRolePermission`. This is intentional because the gate runs BEFORE the company context is fully loaded, and `useMyPermissions` requires a selected company.

5. **Dashboard uses `isFullAccess` naming** — Instead of `isOwner`, Dashboard.tsx uses `const isFullAccess = hasDashPerm("dashboard:view_full")` which better reflects the permission-based nature.

6. **Server scoping checks migrated to `hasRolePermission`** — The project/issue list filtering checks in `projects.ts`, `issues.ts`, and `assertIssueProjectAccess` were updated from `membershipRole !== "owner"` to `hasRolePermission(companyId, "user", userId, "dashboard:view_full")`. This means managers with `dashboard:view_full` see all projects/issues (same as admins), while employees only see their assigned ones.

7. **`accessService` added to `projects.ts`** — Not in original plan. Needed because project scoping now calls `access.hasRolePermission` instead of querying `companyMemberships` directly.

8. **Transfer ownership transfers role assignment** — Not just `membershipRole` text, but also sets `roleId` to the admin/employee role FK. Original plan mentioned this conceptually but the implementation explicitly fetches and assigns role IDs.

9. **`my-permissions` returns ALL permission keys for instance admins and local_implicit** — Shortcut: instead of looking up their role, these superusers get the full `PERMISSION_KEYS` array.

10. **Permission constants exported from shared** — Added `ADMIN_PERMISSIONS`, `MANAGER_PERMISSIONS`, `EMPLOYEE_PERMISSIONS` as typed arrays in `constants.ts` for use in `seedDefaultRoles`. The plan only mentioned the role definitions in the migration SQL.

11. **Role editor has grouped permissions with indeterminate checkbox** — The plan mentioned a "checkbox grid". Implementation uses collapsible permission groups (Company, Agents, Projects, etc.) with group-level toggle that shows indeterminate state when partially selected.

12. **`tasks:assign_peers` permission added post-plan** — New permission key not in original plan. Allows assigning tasks to siblings (agents/users sharing the same parent) but NOT to subordinates of those peers. Implementation:
    - `getPeerAgentIds()` and `getPeerUserIds()` in access service
    - `getVisibleAgentIds()` includes peers when user has the permission (affects all UI dropdowns)
    - `GET /my-subordinates` returns peers when user has the permission
    - `assertCanAssignTasks` checks peers after subordinate check fails
    - Admin + Manager roles get it by default; Employee does not

13. **Admin role dropdown locked** — Not in original plan. Admin members show static "Admin (use Transfer Ownership to change)" text instead of the role dropdown. Server also blocks `PATCH /members/:id/role` for admin members.

14. **Transfer ownership also transfers instance_admin + reassigns agents/members** — Not in original plan. The transfer now:
    - Promotes target to instance_admin, demotes current
    - Reassigns all agents with `reportsToUserId = oldAdmin` to new admin
    - Reassigns all members with `reportsToUserId = oldAdmin` to new admin

15. **Project auto-assignment on creation** — Not in original plan. When a non-full-access user creates a project, the server auto-adds them to `projectAssignments` in company metadata so they can see their own project.

16. **"No agents" dashboard alert gated by `agents:create` permission** — Employees who can't create agents no longer see the misleading "Create one here" prompt.

17. **`archivedAt` string-to-Date parsing** — Bug fix: PATCH /projects/:id received `archivedAt` as ISO string but Drizzle expected Date object.

---

## Commits

1. `e134d2c` — Phase 1-3: schema, migration, service
2. `5b65aac` — Phase 4-5B: route migration, API, UI hook
3. `f9b9170` — Phase 5C: replace all isOwner with hasPermission (13 files, -169 lines)
4. `72002e6` — Phase 6: bootstrap, owner→admin, remaining membershipRole fixes
5. `0ae1b50` — Phase 5D: Role Management UI
6. `779455e` — fix: no-agents alert + project auto-assignment
7. `932558a` — fix: archivedAt string-to-Date parsing
8. `0caa718` — fix: transfer ownership transfers instance_admin role
9. `329bdc1` — fix: transfer ownership reassigns agents/members
10. `5ceb422` — fix: admin role dropdown locked
11. `80cb4e6` — feat: tasks:assign_peers permission
12. `4f8434d` — fix: tasks:assign_peers affects all UI dropdowns
