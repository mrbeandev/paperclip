import { and, eq, inArray, ne, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  agents,
  companies,
  companyMemberships,
  companyRoles,
  companyRolePermissions,
  instanceUserRoles,
  principalPermissionGrants,
} from "@paperclipai/db";
import type { PermissionKey, PrincipalType } from "@paperclipai/shared";
import { ADMIN_PERMISSIONS, MANAGER_PERMISSIONS, EMPLOYEE_PERMISSIONS } from "@paperclipai/shared";

type MembershipRow = typeof companyMemberships.$inferSelect;
type GrantInput = {
  permissionKey: PermissionKey;
  scope?: Record<string, unknown> | null;
};

export function accessService(db: Db) {
  async function isInstanceAdmin(userId: string | null | undefined): Promise<boolean> {
    if (!userId) return false;
    const row = await db
      .select({ id: instanceUserRoles.id })
      .from(instanceUserRoles)
      .where(and(eq(instanceUserRoles.userId, userId), eq(instanceUserRoles.role, "instance_admin")))
      .then((rows) => rows[0] ?? null);
    return Boolean(row);
  }

  async function getMembership(
    companyId: string,
    principalType: PrincipalType,
    principalId: string,
  ): Promise<MembershipRow | null> {
    return db
      .select()
      .from(companyMemberships)
      .where(
        and(
          eq(companyMemberships.companyId, companyId),
          eq(companyMemberships.principalType, principalType),
          eq(companyMemberships.principalId, principalId),
        ),
      )
      .then((rows) => rows[0] ?? null);
  }

  async function hasPermission(
    companyId: string,
    principalType: PrincipalType,
    principalId: string,
    permissionKey: PermissionKey,
  ): Promise<boolean> {
    const membership = await getMembership(companyId, principalType, principalId);
    if (!membership || membership.status !== "active") return false;
    const grant = await db
      .select({ id: principalPermissionGrants.id })
      .from(principalPermissionGrants)
      .where(
        and(
          eq(principalPermissionGrants.companyId, companyId),
          eq(principalPermissionGrants.principalType, principalType),
          eq(principalPermissionGrants.principalId, principalId),
          eq(principalPermissionGrants.permissionKey, permissionKey),
        ),
      )
      .then((rows) => rows[0] ?? null);
    return Boolean(grant);
  }

  async function canUser(
    companyId: string,
    userId: string | null | undefined,
    permissionKey: PermissionKey,
  ): Promise<boolean> {
    if (!userId) return false;
    if (await isInstanceAdmin(userId)) return true;
    return hasRolePermission(companyId, "user", userId, permissionKey);
  }

  async function listMembers(companyId: string) {
    return db
      .select()
      .from(companyMemberships)
      .where(eq(companyMemberships.companyId, companyId))
      .orderBy(sql`${companyMemberships.createdAt} desc`);
  }

  async function setMemberPermissions(
    companyId: string,
    memberId: string,
    grants: GrantInput[],
    grantedByUserId: string | null,
  ) {
    const member = await db
      .select()
      .from(companyMemberships)
      .where(and(eq(companyMemberships.companyId, companyId), eq(companyMemberships.id, memberId)))
      .then((rows) => rows[0] ?? null);
    if (!member) return null;

    await db.transaction(async (tx) => {
      await tx
        .delete(principalPermissionGrants)
        .where(
          and(
            eq(principalPermissionGrants.companyId, companyId),
            eq(principalPermissionGrants.principalType, member.principalType),
            eq(principalPermissionGrants.principalId, member.principalId),
          ),
        );
      if (grants.length > 0) {
        await tx.insert(principalPermissionGrants).values(
          grants.map((grant) => ({
            companyId,
            principalType: member.principalType,
            principalId: member.principalId,
            permissionKey: grant.permissionKey,
            scope: grant.scope ?? null,
            grantedByUserId,
            createdAt: new Date(),
            updatedAt: new Date(),
          })),
        );
      }
    });

    return member;
  }

  async function promoteInstanceAdmin(userId: string) {
    const existing = await db
      .select()
      .from(instanceUserRoles)
      .where(and(eq(instanceUserRoles.userId, userId), eq(instanceUserRoles.role, "instance_admin")))
      .then((rows) => rows[0] ?? null);
    if (existing) return existing;
    return db
      .insert(instanceUserRoles)
      .values({
        userId,
        role: "instance_admin",
      })
      .returning()
      .then((rows) => rows[0]);
  }

  async function demoteInstanceAdmin(userId: string) {
    return db
      .delete(instanceUserRoles)
      .where(and(eq(instanceUserRoles.userId, userId), eq(instanceUserRoles.role, "instance_admin")))
      .returning()
      .then((rows) => rows[0] ?? null);
  }

  async function listUserCompanyAccess(userId: string) {
    return db
      .select()
      .from(companyMemberships)
      .where(and(eq(companyMemberships.principalType, "user"), eq(companyMemberships.principalId, userId)))
      .orderBy(sql`${companyMemberships.createdAt} desc`);
  }

  async function setUserCompanyAccess(userId: string, companyIds: string[]) {
    const existing = await listUserCompanyAccess(userId);
    const existingByCompany = new Map(existing.map((row) => [row.companyId, row]));
    const target = new Set(companyIds);

    await db.transaction(async (tx) => {
      const toDelete = existing.filter((row) => !target.has(row.companyId)).map((row) => row.id);
      if (toDelete.length > 0) {
        await tx.delete(companyMemberships).where(inArray(companyMemberships.id, toDelete));
      }

      for (const companyId of target) {
        if (existingByCompany.has(companyId)) continue;
        await tx.insert(companyMemberships).values({
          companyId,
          principalType: "user",
          principalId: userId,
          status: "active",
          membershipRole: "member",
        });
      }
    });

    return listUserCompanyAccess(userId);
  }

  async function ensureMembership(
    companyId: string,
    principalType: PrincipalType,
    principalId: string,
    membershipRole: string | null = "member",
    status: "pending" | "active" | "suspended" = "active",
  ) {
    const existing = await getMembership(companyId, principalType, principalId);
    if (existing) {
      if (existing.status !== status || existing.membershipRole !== membershipRole) {
        const updated = await db
          .update(companyMemberships)
          .set({ status, membershipRole, updatedAt: new Date() })
          .where(eq(companyMemberships.id, existing.id))
          .returning()
          .then((rows) => rows[0] ?? null);
        return updated ?? existing;
      }
      return existing;
    }

    return db
      .insert(companyMemberships)
      .values({
        companyId,
        principalType,
        principalId,
        status,
        membershipRole,
      })
      .returning()
      .then((rows) => rows[0]);
  }

  async function setPrincipalGrants(
    companyId: string,
    principalType: PrincipalType,
    principalId: string,
    grants: GrantInput[],
    grantedByUserId: string | null,
  ) {
    await db.transaction(async (tx) => {
      await tx
        .delete(principalPermissionGrants)
        .where(
          and(
            eq(principalPermissionGrants.companyId, companyId),
            eq(principalPermissionGrants.principalType, principalType),
            eq(principalPermissionGrants.principalId, principalId),
          ),
        );
      if (grants.length === 0) return;
      await tx.insert(principalPermissionGrants).values(
        grants.map((grant) => ({
          companyId,
          principalType,
          principalId,
          permissionKey: grant.permissionKey,
          scope: grant.scope ?? null,
          grantedByUserId,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      );
    });
  }

  /**
   * Walk the mixed hierarchy tree downward from a given user,
   * collecting all subordinate userIds and agentIds.
   */
  async function getSubordinates(
    companyId: string,
    userId: string,
  ): Promise<{ userIds: string[]; agentIds: string[] }> {
    const allMembers = await listMembers(companyId);
    const allAgents = await db
      .select({
        id: agents.id,
        reportsTo: agents.reportsTo,
        reportsToUserId: agents.reportsToUserId,
      })
      .from(agents)
      .where(and(eq(agents.companyId, companyId), ne(agents.status, "terminated")));

    const resultUserIds = new Set<string>();
    const resultAgentIds = new Set<string>();
    const visited = new Set<string>();

    function walkFromUser(uid: string) {
      const key = `user:${uid}`;
      if (visited.has(key)) return;
      visited.add(key);

      for (const agent of allAgents) {
        if (agent.reportsToUserId === uid) {
          resultAgentIds.add(agent.id);
          walkFromAgent(agent.id);
        }
      }
      for (const member of allMembers) {
        if (member.principalType === "user" && member.reportsToUserId === uid) {
          resultUserIds.add(member.principalId);
          walkFromUser(member.principalId);
        }
      }
    }

    function walkFromAgent(agentId: string) {
      const key = `agent:${agentId}`;
      if (visited.has(key)) return;
      visited.add(key);

      for (const agent of allAgents) {
        if (agent.reportsTo === agentId) {
          resultAgentIds.add(agent.id);
          walkFromAgent(agent.id);
        }
      }
      for (const member of allMembers) {
        if (member.principalType === "user" && member.reportsToAgentId === agentId) {
          resultUserIds.add(member.principalId);
          walkFromUser(member.principalId);
        }
      }
    }

    walkFromUser(userId);
    return { userIds: Array.from(resultUserIds), agentIds: Array.from(resultAgentIds) };
  }

  /**
   * Returns the agent IDs visible to a user in a company, or null if the user
   * is top-level owner (sees everything). Non-owner members with no hierarchy
   * get an empty array (see no agents). Used for scope filtering in routes.
   */
  async function getVisibleAgentIds(
    companyId: string,
    userId: string,
  ): Promise<string[] | null> {
    const membership = await getMembership(companyId, "user", userId);
    if (!membership) return null;
    // Admins/managers (with dashboard:view_full) and no hierarchy see everything
    const canViewAll = await hasRolePermission(companyId, "user", userId, "dashboard:view_full");
    if (canViewAll && !membership.reportsToUserId && !membership.reportsToAgentId) return null;
    // Non-owner members with no hierarchy see nothing (empty array)
    const subordinates = await getSubordinates(companyId, userId);
    return subordinates.agentIds;
  }

  /**
   * Returns agent IDs that are peers of the user (share the same parent).
   * Does NOT include subordinates of those peers — only the direct siblings.
   */
  async function getPeerAgentIds(
    companyId: string,
    userId: string,
  ): Promise<string[]> {
    const membership = await getMembership(companyId, "user", userId);
    if (!membership) return [];

    const allAgents = await db
      .select({ id: agents.id, reportsTo: agents.reportsTo, reportsToUserId: agents.reportsToUserId })
      .from(agents)
      .where(and(eq(agents.companyId, companyId), ne(agents.status, "terminated")));

    const allMembers = await listMembers(companyId);
    const peerAgentIds: string[] = [];

    // If user reports to another user, find agents that also report to that user
    if (membership.reportsToUserId) {
      for (const agent of allAgents) {
        if (agent.reportsToUserId === membership.reportsToUserId) {
          peerAgentIds.push(agent.id);
        }
      }
    }

    // If user reports to an agent, find agents that also report to that agent
    if (membership.reportsToAgentId) {
      for (const agent of allAgents) {
        if (agent.reportsTo === membership.reportsToAgentId && agent.id !== membership.reportsToAgentId) {
          peerAgentIds.push(agent.id);
        }
      }
    }

    // Also find peer humans (same parent) — they're peers, not their subordinate agents
    // For peer humans, we just add their userId, not their subordinate agents

    return peerAgentIds;
  }

  /**
   * Returns user IDs that are peers of the user (share the same parent).
   */
  async function getPeerUserIds(
    companyId: string,
    userId: string,
  ): Promise<string[]> {
    const membership = await getMembership(companyId, "user", userId);
    if (!membership) return [];

    const allMembers = await listMembers(companyId);
    const peerUserIds: string[] = [];

    if (membership.reportsToUserId) {
      for (const m of allMembers) {
        if (m.principalType === "user" && m.reportsToUserId === membership.reportsToUserId && m.principalId !== userId) {
          peerUserIds.push(m.principalId);
        }
      }
    }

    if (membership.reportsToAgentId) {
      for (const m of allMembers) {
        if (m.principalType === "user" && m.reportsToAgentId === membership.reportsToAgentId && m.principalId !== userId) {
          peerUserIds.push(m.principalId);
        }
      }
    }

    return peerUserIds;
  }

  async function updateMemberHierarchy(
    memberId: string,
    reportsToUserId: string | null,
    reportsToAgentId: string | null,
  ) {
    return db
      .update(companyMemberships)
      .set({ reportsToUserId, reportsToAgentId, updatedAt: new Date() })
      .where(eq(companyMemberships.id, memberId))
      .returning()
      .then((rows) => rows[0] ?? null);
  }

  /**
   * Check if a principal has a permission via their role OR per-principal grants.
   * Two-tier: role permissions first, then individual grants as overrides.
   */
  async function hasRolePermission(
    companyId: string,
    principalType: PrincipalType,
    principalId: string,
    permissionKey: PermissionKey,
  ): Promise<boolean> {
    const membership = await getMembership(companyId, principalType, principalId);
    if (!membership || membership.status !== "active") return false;

    // 1. Check role-based permissions
    if (membership.roleId) {
      const roleGrant = await db
        .select({ id: companyRolePermissions.id })
        .from(companyRolePermissions)
        .where(
          and(
            eq(companyRolePermissions.roleId, membership.roleId),
            eq(companyRolePermissions.permissionKey, permissionKey),
          ),
        )
        .then((rows) => rows[0] ?? null);
      if (roleGrant) return true;
    }

    // 2. Fall back to per-principal grants
    return hasPermission(companyId, principalType, principalId, permissionKey);
  }

  /**
   * Returns all permission keys a user has in a company (from role + individual grants).
   */
  async function getMyPermissions(
    companyId: string,
    userId: string,
  ): Promise<PermissionKey[]> {
    const membership = await getMembership(companyId, "user", userId);
    if (!membership || membership.status !== "active") return [];

    const keys = new Set<string>();

    // From role
    if (membership.roleId) {
      const rolePerms = await db
        .select({ permissionKey: companyRolePermissions.permissionKey })
        .from(companyRolePermissions)
        .where(eq(companyRolePermissions.roleId, membership.roleId));
      for (const rp of rolePerms) keys.add(rp.permissionKey);
    }

    // From individual grants
    const grants = await db
      .select({ permissionKey: principalPermissionGrants.permissionKey })
      .from(principalPermissionGrants)
      .where(
        and(
          eq(principalPermissionGrants.companyId, companyId),
          eq(principalPermissionGrants.principalType, "user"),
          eq(principalPermissionGrants.principalId, userId),
        ),
      );
    for (const g of grants) keys.add(g.permissionKey);

    return Array.from(keys) as PermissionKey[];
  }

  /**
   * Seed default roles (admin, manager, employee) for a company.
   * Called when creating a new company.
   */
  async function seedDefaultRoles(companyId: string) {
    const roleDefs = [
      { slug: "admin", displayName: "Admin", permissions: ADMIN_PERMISSIONS },
      { slug: "manager", displayName: "Manager", permissions: MANAGER_PERMISSIONS },
      { slug: "employee", displayName: "Employee", permissions: EMPLOYEE_PERMISSIONS },
    ];

    for (const def of roleDefs) {
      const [role] = await db
        .insert(companyRoles)
        .values({
          companyId,
          slug: def.slug,
          displayName: def.displayName,
          isSystem: true,
        })
        .onConflictDoNothing()
        .returning();

      if (role) {
        const permValues = def.permissions.map((key) => ({
          roleId: role.id,
          permissionKey: key,
        }));
        if (permValues.length > 0) {
          await db
            .insert(companyRolePermissions)
            .values(permValues)
            .onConflictDoNothing();
        }
      }
    }
  }

  async function listRoles(companyId: string) {
    return db
      .select()
      .from(companyRoles)
      .where(eq(companyRoles.companyId, companyId))
      .orderBy(companyRoles.createdAt);
  }

  async function getRolePermissions(roleId: string) {
    return db
      .select({ permissionKey: companyRolePermissions.permissionKey })
      .from(companyRolePermissions)
      .where(eq(companyRolePermissions.roleId, roleId))
      .then((rows) => rows.map((r) => r.permissionKey));
  }

  async function getRoleBySlug(companyId: string, slug: string) {
    return db
      .select()
      .from(companyRoles)
      .where(and(eq(companyRoles.companyId, companyId), eq(companyRoles.slug, slug)))
      .then((rows) => rows[0] ?? null);
  }

  return {
    isInstanceAdmin,
    canUser,
    hasPermission,
    hasRolePermission,
    getMyPermissions,
    getMembership,
    ensureMembership,
    listMembers,
    setMemberPermissions,
    getSubordinates,
    getVisibleAgentIds,
    getPeerAgentIds,
    getPeerUserIds,
    updateMemberHierarchy,
    seedDefaultRoles,
    listRoles,
    getRolePermissions,
    getRoleBySlug,
    promoteInstanceAdmin,
    demoteInstanceAdmin,
    listUserCompanyAccess,
    setUserCompanyAccess,
    setPrincipalGrants,
  };
}
