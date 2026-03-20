import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { and, eq } from "drizzle-orm";
import { agents, authUsers, companyMemberships } from "@paperclipai/db";
import {
  companyPortabilityExportSchema,
  companyPortabilityImportSchema,
  companyPortabilityPreviewSchema,
  createCompanySchema,
  updateCompanySchema,
} from "@paperclipai/shared";
import { forbidden } from "../errors.js";
import { validate } from "../middleware/validate.js";
import {
  accessService,
  budgetService,
  companyPortabilityService,
  companyService,
  logActivity,
} from "../services/index.js";
import { assertBoard, assertCompanyAccess, assertPermission, getActorInfo } from "./authz.js";

export function companyRoutes(db: Db) {
  const router = Router();
  const svc = companyService(db);
  const portability = companyPortabilityService(db);
  const access = accessService(db);
  const budgets = budgetService(db);

  router.get("/", async (req, res) => {
    assertBoard(req);
    const result = await svc.list();
    if (req.actor.source === "local_implicit" || req.actor.isInstanceAdmin) {
      res.json(result);
      return;
    }
    const allowed = new Set(req.actor.companyIds ?? []);
    res.json(result.filter((company) => allowed.has(company.id)));
  });

  router.get("/stats", async (req, res) => {
    assertBoard(req);
    const allowed = req.actor.source === "local_implicit" || req.actor.isInstanceAdmin
      ? null
      : new Set(req.actor.companyIds ?? []);
    const stats = await svc.stats();
    if (!allowed) {
      res.json(stats);
      return;
    }
    const filtered = Object.fromEntries(Object.entries(stats).filter(([companyId]) => allowed.has(companyId)));
    res.json(filtered);
  });

  // Common malformed path when companyId is empty in "/api/companies/{companyId}/issues".
  router.get("/issues", (_req, res) => {
    res.status(400).json({
      error: "Missing companyId in path. Use /api/companies/{companyId}/issues.",
    });
  });

  router.get("/:companyId", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const company = await svc.getById(companyId);
    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }
    res.json(company);
  });

  router.post("/:companyId/export", validate(companyPortabilityExportSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const result = await portability.exportBundle(companyId, req.body);
    res.json(result);
  });

  router.post("/import/preview", validate(companyPortabilityPreviewSchema), async (req, res) => {
    if (req.body.target.mode === "existing_company") {
      assertCompanyAccess(req, req.body.target.companyId);
    } else {
      assertBoard(req);
    }
    const preview = await portability.previewImport(req.body);
    res.json(preview);
  });

  router.post("/import", validate(companyPortabilityImportSchema), async (req, res) => {
    if (req.body.target.mode === "existing_company") {
      assertCompanyAccess(req, req.body.target.companyId);
    } else {
      assertBoard(req);
    }
    const actor = getActorInfo(req);
    const result = await portability.importBundle(req.body, req.actor.type === "board" ? req.actor.userId : null);
    await logActivity(db, {
      companyId: result.company.id,
      actorType: actor.actorType,
      actorId: actor.actorId,
      action: "company.imported",
      entityType: "company",
      entityId: result.company.id,
      agentId: actor.agentId,
      runId: actor.runId,
      details: {
        include: req.body.include ?? null,
        agentCount: result.agents.length,
        warningCount: result.warnings.length,
        companyAction: result.company.action,
      },
    });
    res.json(result);
  });

  router.post("/", validate(createCompanySchema), async (req, res) => {
    assertBoard(req);
    if (!(req.actor.source === "local_implicit" || req.actor.isInstanceAdmin)) {
      throw forbidden("Instance admin required");
    }
    const company = await svc.create(req.body);
    // Only create membership for real authenticated users, not the synthetic local-board actor
    if (req.actor.userId && req.actor.userId !== "local-board") {
      await access.ensureMembership(company.id, "user", req.actor.userId, "admin", "active");
      // Seed default roles for the new company and assign admin role
      await access.seedDefaultRoles(company.id);
      const adminRole = await access.getRoleBySlug(company.id, "admin");
      if (adminRole) {
        const membership = await access.getMembership(company.id, "user", req.actor.userId);
        if (membership) {
          await db.update(companyMemberships).set({ roleId: adminRole.id }).where(eq(companyMemberships.id, membership.id));
        }
      }
    }
    await logActivity(db, {
      companyId: company.id,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "company.created",
      entityType: "company",
      entityId: company.id,
      details: { name: company.name },
    });
    if (company.budgetMonthlyCents > 0) {
      await budgets.upsertPolicy(
        company.id,
        {
          scopeType: "company",
          scopeId: company.id,
          amount: company.budgetMonthlyCents,
          windowKind: "calendar_month_utc",
        },
        req.actor.userId ?? "board",
      );
    }
    res.status(201).json(company);
  });

  router.patch("/:companyId", validate(updateCompanySchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertPermission(req, companyId, "company:update");
    const company = await svc.update(companyId, req.body);
    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }
    await logActivity(db, {
      companyId,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "company.updated",
      entityType: "company",
      entityId: companyId,
      details: req.body,
    });
    res.json(company);
  });

  router.post("/:companyId/archive", async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertPermission(req, companyId, "company:archive");
    const company = await svc.archive(companyId);
    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }
    await logActivity(db, {
      companyId,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "company.archived",
      entityType: "company",
      entityId: companyId,
    });
    res.json(company);
  });

  router.delete("/:companyId", async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertPermission(req, companyId, "company:delete");
    const company = await svc.remove(companyId);
    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }
    res.json({ ok: true });
  });

  // GET /api/companies/:companyId/transfer-targets
  // Returns other board-level members of this company (only callable by the owner)
  router.get("/:companyId/transfer-targets", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const currentUserId = req.actor.userId;
    if (!currentUserId) throw forbidden("No user ID");

    const membership = await access.getMembership(companyId, "user", currentUserId);
    if (!membership || membership.membershipRole !== "admin") {
      throw forbidden("Only the admin can view transfer targets");
    }

    const members = await access.listMembers(companyId);
    const targets = await Promise.all(
      members
        .filter((m) => m.principalType === "user" && m.principalId !== currentUserId && m.status === "active")
        .map(async (m) => {
          const [user] = await db.select({ id: authUsers.id, name: authUsers.name, email: authUsers.email })
            .from(authUsers)
            .where(eq(authUsers.id, m.principalId))
            .limit(1);
          return user ? { id: user.id, name: user.name, email: user.email, membershipRole: m.membershipRole } : null;
        }),
    );
    res.json(targets.filter(Boolean));
  });

  // POST /api/companies/:companyId/transfer-ownership
  router.post("/:companyId/transfer-ownership", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const { targetUserId } = req.body as { targetUserId?: string };
    if (!targetUserId) {
      res.status(400).json({ error: { message: "targetUserId required" } });
      return;
    }

    const currentUserId = req.actor.userId;
    if (!currentUserId) throw forbidden("No user ID");
    if (currentUserId === targetUserId) {
      res.status(400).json({ error: { message: "Cannot transfer ownership to yourself" } });
      return;
    }

    const myMembership = await access.getMembership(companyId, "user", currentUserId);
    if (!myMembership || myMembership.membershipRole !== "admin") {
      throw forbidden("Only the admin can transfer ownership");
    }

    const targetMembership = await access.getMembership(companyId, "user", targetUserId);
    if (!targetMembership || targetMembership.status !== "active") {
      res.status(400).json({ error: { message: "Target user is not an active member of this company" } });
      return;
    }

    // Transfer: target becomes admin, current becomes employee
    const adminRole = await access.getRoleBySlug(companyId, "admin");
    const employeeRole = await access.getRoleBySlug(companyId, "employee");
    await access.ensureMembership(companyId, "user", targetUserId, "admin", "active");
    if (adminRole) {
      await db.update(companyMemberships).set({ roleId: adminRole.id }).where(eq(companyMemberships.id, targetMembership.id));
    }
    await access.ensureMembership(companyId, "user", currentUserId, "employee", "active");
    if (employeeRole) {
      await db.update(companyMemberships).set({ roleId: employeeRole.id }).where(eq(companyMemberships.id, myMembership.id));
    }

    // Transfer instance admin role: promote target, demote current
    await access.promoteInstanceAdmin(targetUserId);
    await access.demoteInstanceAdmin(currentUserId);

    // Reassign all agents reporting to old admin → new admin
    await db.update(agents)
      .set({ reportsToUserId: targetUserId, updatedAt: new Date() })
      .where(and(eq(agents.companyId, companyId), eq(agents.reportsToUserId, currentUserId)));

    // Reassign all members reporting to old admin → new admin
    await db.update(companyMemberships)
      .set({ reportsToUserId: targetUserId, updatedAt: new Date() })
      .where(and(eq(companyMemberships.companyId, companyId), eq(companyMemberships.reportsToUserId, currentUserId)));

    res.json({ ok: true });
  });

  return router;
}
