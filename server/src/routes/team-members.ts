import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { createTeamMemberSchema, updateTeamMemberSchema } from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { teamMemberService } from "../services/team-members.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";

export function teamMemberRoutes(db: Db) {
  const router = Router({ mergeParams: true });
  const svc = teamMemberService(db);

  // GET /api/companies/:companyId/team-members
  router.get("/", async (req, res) => {
    assertBoard(req);
    const { companyId } = req.params as Record<string, string>;
    assertCompanyAccess(req, companyId);
    const members = await svc.list(companyId);
    res.json(members);
  });

  // POST /api/companies/:companyId/team-members
  router.post("/", validate(createTeamMemberSchema), async (req, res) => {
    assertBoard(req);
    const { companyId } = req.params as Record<string, string>;
    assertCompanyAccess(req, companyId);
    const { actorId } = getActorInfo(req);
    const member = await svc.create(companyId, {
      email: req.body.email,
      agentIds: req.body.agentIds,
      createdByUserId: actorId,
    });
    res.status(201).json(member);
  });

  // PATCH /api/companies/:companyId/team-members/:grantId
  router.patch("/:grantId", validate(updateTeamMemberSchema), async (req, res) => {
    assertBoard(req);
    const { companyId, grantId } = req.params as Record<string, string>;
    assertCompanyAccess(req, companyId);
    await svc.update(grantId, companyId, { agentIds: req.body.agentIds });
    res.json({ ok: true });
  });

  // DELETE /api/companies/:companyId/team-members/:grantId
  router.delete("/:grantId", async (req, res) => {
    assertBoard(req);
    const { companyId, grantId } = req.params as Record<string, string>;
    assertCompanyAccess(req, companyId);
    await svc.revoke(grantId, companyId);
    res.json({ ok: true });
  });

  return router;
}
