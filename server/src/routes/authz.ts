import type { Request } from "express";
import { and, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { companyMemberships } from "@paperclipai/db";
import { forbidden, unauthorized } from "../errors.js";

let _db: Db | null = null;
export function setAuthzDb(db: Db) { _db = db; }

/**
 * Asserts that the current board user is a company owner (or instance admin / local implicit).
 * Use for admin-only mutations like delete company, edit company, create agents, etc.
 */
export async function assertOwner(req: Request, companyId: string) {
  assertBoard(req);
  assertCompanyAccess(req, companyId);
  if (req.actor.source === "local_implicit" || req.actor.isInstanceAdmin) return;
  if (!_db || !req.actor.userId) throw forbidden("Owner access required");
  const membership = await _db
    .select({ membershipRole: companyMemberships.membershipRole })
    .from(companyMemberships)
    .where(
      and(
        eq(companyMemberships.companyId, companyId),
        eq(companyMemberships.principalType, "user"),
        eq(companyMemberships.principalId, req.actor.userId),
      ),
    )
    .then((rows) => rows[0] ?? null);
  if (!membership || membership.membershipRole !== "owner") {
    throw forbidden("Owner access required");
  }
}

export function assertBoard(req: Request) {
  if (req.actor.type !== "board") {
    throw forbidden("Board access required");
  }
}

export function assertCompanyAccess(req: Request, companyId: string) {
  if (req.actor.type === "none") {
    throw unauthorized();
  }
  if (req.actor.type === "agent" && req.actor.companyId !== companyId) {
    throw forbidden("Agent key cannot access another company");
  }
  if (req.actor.type === "board" && req.actor.source !== "local_implicit" && !req.actor.isInstanceAdmin) {
    const allowedCompanies = req.actor.companyIds ?? [];
    if (!allowedCompanies.includes(companyId)) {
      throw forbidden("User does not have access to this company");
    }
  }
}

export function getActorInfo(req: Request) {
  if (req.actor.type === "none") {
    throw unauthorized();
  }
  if (req.actor.type === "agent") {
    return {
      actorType: "agent" as const,
      actorId: req.actor.agentId ?? "unknown-agent",
      agentId: req.actor.agentId ?? null,
      runId: req.actor.runId ?? null,
    };
  }

  return {
    actorType: "user" as const,
    actorId: req.actor.userId ?? "board",
    agentId: null,
    runId: req.actor.runId ?? null,
  };
}
