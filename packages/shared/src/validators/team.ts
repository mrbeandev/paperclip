import { z } from "zod";

export const createTeamMemberSchema = z.object({
  email: z.string().email().max(255),
  agentIds: z.array(z.string().uuid()).min(1).max(50),
});
export type CreateTeamMember = z.infer<typeof createTeamMemberSchema>;

export const updateTeamMemberSchema = z.object({
  agentIds: z.array(z.string().uuid()).min(1).max(50),
});
export type UpdateTeamMember = z.infer<typeof updateTeamMemberSchema>;
