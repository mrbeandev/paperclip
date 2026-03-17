import type { TeamMember } from "@paperclipai/shared";
import { api } from "./client";

export const teamMembersApi = {
  list: (companyId: string) =>
    api.get<TeamMember[]>(`/companies/${companyId}/team-members`),

  create: (companyId: string, data: { email: string; agentIds: string[] }) =>
    api.post<TeamMember>(`/companies/${companyId}/team-members`, data),

  update: (companyId: string, grantId: string, data: { agentIds: string[] }) =>
    api.patch<TeamMember>(`/companies/${companyId}/team-members/${encodeURIComponent(grantId)}`, data),

  revoke: (companyId: string, grantId: string) =>
    api.delete<{ ok: true }>(`/companies/${companyId}/team-members/${encodeURIComponent(grantId)}`),
};
