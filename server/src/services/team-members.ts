import { and, eq, inArray, ne } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents, authUsers, teamAccessGrantAgents, teamAccessGrants } from "@paperclipai/db";
import type { TeamMember } from "@paperclipai/shared";

export function teamMemberService(db: Db) {
  async function list(companyId: string): Promise<TeamMember[]> {
    const grants = await db
      .select()
      .from(teamAccessGrants)
      .where(
        and(
          eq(teamAccessGrants.companyId, companyId),
          ne(teamAccessGrants.status, "revoked"),
        ),
      );

    if (grants.length === 0) return [];

    const grantIds = grants.map((g) => g.id);

    const [grantAgentRows, userRows, agentRows] = await Promise.all([
      db
        .select()
        .from(teamAccessGrantAgents)
        .where(inArray(teamAccessGrantAgents.grantId, grantIds)),
      // Only look up users that have signed in (have a userId)
      (async () => {
        const userIds = grants.map((g) => g.userId).filter(Boolean) as string[];
        if (userIds.length === 0) return [];
        return db.select({ id: authUsers.id, name: authUsers.name, email: authUsers.email })
          .from(authUsers)
          .where(inArray(authUsers.id, userIds));
      })(),
      (async () => {
        const agentIds = [...new Set(
          (await db
            .select({ agentId: teamAccessGrantAgents.agentId })
            .from(teamAccessGrantAgents)
            .where(inArray(teamAccessGrantAgents.grantId, grantIds)))
            .map((r) => r.agentId),
        )];
        if (agentIds.length === 0) return [];
        return db
          .select({ id: agents.id, name: agents.name, title: agents.title })
          .from(agents)
          .where(inArray(agents.id, agentIds));
      })(),
    ]);

    const agentIdsByGrant = new Map<string, string[]>();
    for (const row of grantAgentRows) {
      const existing = agentIdsByGrant.get(row.grantId) ?? [];
      existing.push(row.agentId);
      agentIdsByGrant.set(row.grantId, existing);
    }

    const userById = new Map(userRows.map((u) => [u.id, u]));
    const agentById = new Map(agentRows.map((a) => [a.id, a]));

    return grants.map((grant) => {
      const agentIds = agentIdsByGrant.get(grant.id) ?? [];
      const user = grant.userId ? (userById.get(grant.userId) ?? null) : null;
      return {
        grant: {
          id: grant.id,
          companyId: grant.companyId,
          email: grant.email,
          userId: grant.userId,
          status: grant.status as "pending" | "active" | "revoked",
          createdByUserId: grant.createdByUserId,
          createdAt: grant.createdAt,
          updatedAt: grant.updatedAt,
        },
        agentIds,
        user: user ? { name: user.name, email: user.email } : null,
        scopeAgents: agentIds
          .map((id) => agentById.get(id))
          .filter((a): a is NonNullable<typeof a> => a !== undefined),
      };
    });
  }

  async function create(
    companyId: string,
    input: { email: string; agentIds: string[]; createdByUserId: string },
  ): Promise<TeamMember> {
    // Check if an existing active/pending grant exists for this email in this company
    const existing = await db
      .select()
      .from(teamAccessGrants)
      .where(
        and(
          eq(teamAccessGrants.companyId, companyId),
          eq(teamAccessGrants.email, input.email.toLowerCase()),
          ne(teamAccessGrants.status, "revoked"),
        ),
      )
      .then((rows) => rows[0] ?? null);

    if (existing) {
      throw new Error("A team member with this email already exists in this company");
    }

    // Check if the user is already signed in (look up by email in authUsers)
    const existingUser = await db
      .select({ id: authUsers.id })
      .from(authUsers)
      .where(eq(authUsers.email, input.email.toLowerCase()))
      .then((rows) => rows[0] ?? null);

    const [grant] = await db
      .insert(teamAccessGrants)
      .values({
        companyId,
        email: input.email.toLowerCase(),
        userId: existingUser?.id ?? null,
        status: existingUser ? "active" : "pending",
        createdByUserId: input.createdByUserId,
      })
      .returning();

    if (!grant) throw new Error("Failed to create team access grant");

    if (input.agentIds.length > 0) {
      await db.insert(teamAccessGrantAgents).values(
        input.agentIds.map((agentId) => ({ grantId: grant.id, agentId })),
      );
    }

    const agentRows = input.agentIds.length > 0
      ? await db
          .select({ id: agents.id, name: agents.name, title: agents.title })
          .from(agents)
          .where(inArray(agents.id, input.agentIds))
      : [];

    return {
      grant: {
        id: grant.id,
        companyId: grant.companyId,
        email: grant.email,
        userId: grant.userId,
        status: grant.status as "pending" | "active" | "revoked",
        createdByUserId: grant.createdByUserId,
        createdAt: grant.createdAt,
        updatedAt: grant.updatedAt,
      },
      agentIds: input.agentIds,
      user: existingUser ? null : null,
      scopeAgents: agentRows,
    };
  }

  async function update(
    grantId: string,
    companyId: string,
    input: { agentIds: string[] },
  ): Promise<void> {
    const grant = await db
      .select()
      .from(teamAccessGrants)
      .where(and(eq(teamAccessGrants.id, grantId), eq(teamAccessGrants.companyId, companyId)))
      .then((rows) => rows[0] ?? null);

    if (!grant) throw new Error("Team member not found");

    // Replace all agent scopes
    await db.delete(teamAccessGrantAgents).where(eq(teamAccessGrantAgents.grantId, grantId));
    if (input.agentIds.length > 0) {
      await db.insert(teamAccessGrantAgents).values(
        input.agentIds.map((agentId) => ({ grantId, agentId })),
      );
    }

    await db
      .update(teamAccessGrants)
      .set({ updatedAt: new Date() })
      .where(eq(teamAccessGrants.id, grantId));
  }

  async function revoke(grantId: string, companyId: string): Promise<void> {
    await db
      .update(teamAccessGrants)
      .set({ status: "revoked", updatedAt: new Date() })
      .where(and(eq(teamAccessGrants.id, grantId), eq(teamAccessGrants.companyId, companyId)));
  }

  /**
   * Called from auth middleware when a user logs in.
   * Activates any pending grants for that email and links the userId.
   */
  async function activateGrantsForUser(userId: string, email: string): Promise<void> {
    await db
      .update(teamAccessGrants)
      .set({ userId, status: "active", updatedAt: new Date() })
      .where(
        and(
          eq(teamAccessGrants.email, email.toLowerCase()),
          eq(teamAccessGrants.status, "pending"),
        ),
      );
  }

  /**
   * Returns the root agent IDs for a given user across all companies.
   * Returns a map of companyId → agentId[].
   */
  async function getScopeRootsForUser(
    userId: string,
  ): Promise<Record<string, string[]>> {
    const grants = await db
      .select()
      .from(teamAccessGrants)
      .where(and(eq(teamAccessGrants.userId, userId), eq(teamAccessGrants.status, "active")));

    if (grants.length === 0) return {};

    const grantIds = grants.map((g) => g.id);
    const grantAgentRows = await db
      .select()
      .from(teamAccessGrantAgents)
      .where(inArray(teamAccessGrantAgents.grantId, grantIds));

    const result: Record<string, string[]> = {};
    for (const grant of grants) {
      const agentIds = grantAgentRows
        .filter((r) => r.grantId === grant.id)
        .map((r) => r.agentId);
      result[grant.companyId] = [...(result[grant.companyId] ?? []), ...agentIds];
    }
    return result;
  }

  return { list, create, update, revoke, activateGrantsForUser, getScopeRootsForUser };
}
