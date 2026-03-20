import { Router, type Request } from "express";
import type { Db } from "@paperclipai/db";
import { companies, companyMemberships } from "@paperclipai/db";
import { and, eq } from "drizzle-orm";
import {
  createProjectSchema,
  createProjectWorkspaceSchema,
  isUuidLike,
  updateProjectSchema,
  updateProjectWorkspaceSchema,
} from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { projectService, accessService, logActivity } from "../services/index.js";
import { conflict } from "../errors.js";
import { assertBoard, assertCompanyAccess, assertPermission, getActorInfo } from "./authz.js";

export function projectRoutes(db: Db) {
  const router = Router();
  const svc = projectService(db);
  const access = accessService(db);

  async function resolveCompanyIdForProjectReference(req: Request) {
    const companyIdQuery = req.query.companyId;
    const requestedCompanyId =
      typeof companyIdQuery === "string" && companyIdQuery.trim().length > 0
        ? companyIdQuery.trim()
        : null;
    if (requestedCompanyId) {
      assertCompanyAccess(req, requestedCompanyId);
      return requestedCompanyId;
    }
    if (req.actor.type === "agent" && req.actor.companyId) {
      return req.actor.companyId;
    }
    return null;
  }

  async function normalizeProjectReference(req: Request, rawId: string) {
    if (isUuidLike(rawId)) return rawId;
    const companyId = await resolveCompanyIdForProjectReference(req);
    if (!companyId) return rawId;
    const resolved = await svc.resolveByReference(companyId, rawId);
    if (resolved.ambiguous) {
      throw conflict("Project shortname is ambiguous in this company. Use the project ID.");
    }
    return resolved.project?.id ?? rawId;
  }

  router.param("id", async (req, _res, next, rawId) => {
    try {
      req.params.id = await normalizeProjectReference(req, rawId);
      next();
    } catch (err) {
      next(err);
    }
  });

  router.get("/companies/:companyId/projects", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    let result = await svc.list(companyId);

    // Scope projects for non-full-access members
    if (req.actor.type === "board" && req.actor.userId && req.actor.source !== "local_implicit" && !req.actor.isInstanceAdmin) {
      const canViewAll = await access.hasRolePermission(companyId, "user", req.actor.userId, "dashboard:view_full");
      if (!canViewAll) {
        const companyRow = await db
          .select({ metadata: companies.metadata })
          .from(companies)
          .where(eq(companies.id, companyId))
          .then((rows) => rows[0] ?? null);

        const meta = (companyRow?.metadata ?? {}) as Record<string, unknown>;
        const assignments = (meta.projectAssignments ?? {}) as Record<string, string[]>;
        const userKey = `user:${req.actor.userId}`;
        const assignedProjectIds = assignments[userKey];

        // Members only see projects explicitly assigned to them
        if (assignedProjectIds && assignedProjectIds.length > 0) {
          const allowedSet = new Set(assignedProjectIds);
          result = result.filter((p: any) => allowedSet.has(p.id));
        } else {
          // No project assignments — see no projects
          result = [];
        }
      }
    }

    res.json(result);
  });

  router.get("/projects/:id", async (req, res) => {
    const id = req.params.id as string;
    const project = await svc.getById(id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertCompanyAccess(req, project.companyId);
    res.json(project);
  });

  router.post("/companies/:companyId/projects", validate(createProjectSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertBoard(req);
    assertCompanyAccess(req, companyId);
    type CreateProjectPayload = Parameters<typeof svc.create>[1] & {
      workspace?: Parameters<typeof svc.createWorkspace>[1];
    };

    const { workspace, ...projectData } = req.body as CreateProjectPayload;
    const project = await svc.create(companyId, projectData);
    let createdWorkspaceId: string | null = null;
    if (workspace) {
      const createdWorkspace = await svc.createWorkspace(project.id, workspace);
      if (!createdWorkspace) {
        await svc.remove(project.id);
        res.status(422).json({ error: "Invalid project workspace payload" });
        return;
      }
      createdWorkspaceId = createdWorkspace.id;
    }
    const hydratedProject = workspace ? await svc.getById(project.id) : project;

    // Auto-assign the project to the creator (so non-admin users can see their own project)
    if (req.actor.type === "board" && req.actor.userId) {
      const canViewAll = await access.hasRolePermission(companyId, "user", req.actor.userId, "dashboard:view_full");
      if (!canViewAll) {
        // Non-full-access user: auto-assign this project to them
        const companyRow = await db
          .select({ metadata: companies.metadata })
          .from(companies)
          .where(eq(companies.id, companyId))
          .then((rows) => rows[0] ?? null);
        const meta = (companyRow?.metadata ?? {}) as Record<string, unknown>;
        const assignments = { ...((meta.projectAssignments ?? {}) as Record<string, string[]>) };
        const userKey = `user:${req.actor.userId}`;
        if (!assignments[userKey]) assignments[userKey] = [];
        if (!assignments[userKey].includes(project.id)) assignments[userKey].push(project.id);
        await db.update(companies).set({ metadata: { ...meta, projectAssignments: assignments } }).where(eq(companies.id, companyId));
      }
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "project.created",
      entityType: "project",
      entityId: project.id,
      details: {
        name: project.name,
        workspaceId: createdWorkspaceId,
      },
    });
    res.status(201).json(hydratedProject ?? project);
  });

  router.patch("/projects/:id", validate(updateProjectSchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    await assertPermission(req, existing.companyId, "projects:update");
    const project = await svc.update(id, req.body);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: project.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "project.updated",
      entityType: "project",
      entityId: project.id,
      details: req.body,
    });

    res.json(project);
  });

  router.get("/projects/:id/workspaces", async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);
    const workspaces = await svc.listWorkspaces(id);
    res.json(workspaces);
  });

  router.post("/projects/:id/workspaces", validate(createProjectWorkspaceSchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);
    const workspace = await svc.createWorkspace(id, req.body);
    if (!workspace) {
      res.status(422).json({ error: "Invalid project workspace payload" });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: existing.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "project.workspace_created",
      entityType: "project",
      entityId: id,
      details: {
        workspaceId: workspace.id,
        name: workspace.name,
        cwd: workspace.cwd,
        isPrimary: workspace.isPrimary,
      },
    });

    res.status(201).json(workspace);
  });

  router.patch(
    "/projects/:id/workspaces/:workspaceId",
    validate(updateProjectWorkspaceSchema),
    async (req, res) => {
      const id = req.params.id as string;
      const workspaceId = req.params.workspaceId as string;
      const existing = await svc.getById(id);
      if (!existing) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      assertCompanyAccess(req, existing.companyId);
      const workspaceExists = (await svc.listWorkspaces(id)).some((workspace) => workspace.id === workspaceId);
      if (!workspaceExists) {
        res.status(404).json({ error: "Project workspace not found" });
        return;
      }
      const workspace = await svc.updateWorkspace(id, workspaceId, req.body);
      if (!workspace) {
        res.status(422).json({ error: "Invalid project workspace payload" });
        return;
      }

      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId: existing.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        action: "project.workspace_updated",
        entityType: "project",
        entityId: id,
        details: {
          workspaceId: workspace.id,
          changedKeys: Object.keys(req.body).sort(),
        },
      });

      res.json(workspace);
    },
  );

  router.delete("/projects/:id/workspaces/:workspaceId", async (req, res) => {
    const id = req.params.id as string;
    const workspaceId = req.params.workspaceId as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);
    const workspace = await svc.removeWorkspace(id, workspaceId);
    if (!workspace) {
      res.status(404).json({ error: "Project workspace not found" });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: existing.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "project.workspace_deleted",
      entityType: "project",
      entityId: id,
      details: {
        workspaceId: workspace.id,
        name: workspace.name,
      },
    });

    res.json(workspace);
  });

  router.delete("/projects/:id", async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    await assertPermission(req, existing.companyId, "projects:delete");
    const project = await svc.remove(id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: project.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "project.deleted",
      entityType: "project",
      entityId: project.id,
    });

    res.json(project);
  });

  // ── Project member assignments ────────────────────────────────────

  router.get("/projects/:id/assignments", async (req, res) => {
    const id = req.params.id as string;
    const project = await svc.getById(id);
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    assertCompanyAccess(req, project.companyId);

    const companyRow = await db
      .select({ metadata: companies.metadata })
      .from(companies)
      .where(eq(companies.id, project.companyId))
      .then((rows) => rows[0] ?? null);
    const meta = (companyRow?.metadata ?? {}) as Record<string, unknown>;
    const assignments = (meta.projectAssignments ?? {}) as Record<string, string[]>;

    // Collect all principals assigned to this project
    const assigned: Array<{ principalKey: string; principalType: "user" | "agent" }> = [];
    for (const [key, projectIds] of Object.entries(assignments)) {
      if (projectIds.includes(id)) {
        const [type, ...rest] = key.split(":");
        assigned.push({ principalKey: key, principalType: type as "user" | "agent" });
      }
    }
    res.json(assigned);
  });

  router.put("/projects/:id/assignments", async (req, res) => {
    const id = req.params.id as string;
    const project = await svc.getById(id);
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    assertBoard(req);
    assertCompanyAccess(req, project.companyId);

    const { principalKeys } = req.body as { principalKeys: string[] };
    if (!Array.isArray(principalKeys)) {
      res.status(400).json({ error: "principalKeys must be an array" });
      return;
    }

    // Read current assignments
    const companyRow = await db
      .select({ metadata: companies.metadata })
      .from(companies)
      .where(eq(companies.id, project.companyId))
      .then((rows) => rows[0] ?? null);
    const meta = (companyRow?.metadata ?? {}) as Record<string, unknown>;
    const assignments = { ...((meta.projectAssignments ?? {}) as Record<string, string[]>) };

    // Remove this project from all current assignments
    for (const key of Object.keys(assignments)) {
      assignments[key] = assignments[key].filter((pid) => pid !== id);
      if (assignments[key].length === 0) delete assignments[key];
    }

    // Add this project to the specified principals
    for (const key of principalKeys) {
      if (!assignments[key]) assignments[key] = [];
      if (!assignments[key].includes(id)) assignments[key].push(id);
    }

    // Save back to company metadata
    await db
      .update(companies)
      .set({ metadata: { ...meta, projectAssignments: assignments } })
      .where(eq(companies.id, project.companyId));

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: project.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "project.assignments_updated",
      entityType: "project",
      entityId: id,
      details: { principalKeys },
    });

    res.json({ ok: true, principalKeys });
  });

  return router;
}
