import type { AgentAdapterType, JoinRequest } from "@paperclipai/shared";
import { api } from "./client";

type InviteSummary = {
  id: string;
  companyId: string | null;
  inviteType: "company_join" | "bootstrap_ceo";
  allowedJoinTypes: "human" | "agent" | "both";
  expiresAt: string;
  onboardingPath?: string;
  onboardingUrl?: string;
  onboardingTextPath?: string;
  onboardingTextUrl?: string;
  skillIndexPath?: string;
  skillIndexUrl?: string;
  inviteMessage?: string | null;
};

type AcceptInviteInput =
  | { requestType: "human" }
  | {
    requestType: "agent";
    agentName: string;
    adapterType?: AgentAdapterType;
    capabilities?: string | null;
    agentDefaultsPayload?: Record<string, unknown> | null;
  };

type AgentJoinRequestAccepted = JoinRequest & {
  claimSecret: string;
  claimApiKeyPath: string;
  onboarding?: Record<string, unknown>;
  diagnostics?: Array<{
    code: string;
    level: "info" | "warn";
    message: string;
    hint?: string;
  }>;
};

type InviteOnboardingManifest = {
  invite: InviteSummary;
  onboarding: {
    inviteMessage?: string | null;
    connectivity?: {
      guidance?: string;
      connectionCandidates?: string[];
      testResolutionEndpoint?: {
        method?: string;
        path?: string;
        url?: string;
      };
    };
    textInstructions?: {
      url?: string;
    };
  };
};

type BoardClaimStatus = {
  status: "available" | "claimed" | "expired";
  requiresSignIn: boolean;
  expiresAt: string | null;
  claimedByUserId: string | null;
};

type CompanyInviteCreated = {
  id: string;
  token: string;
  inviteUrl: string;
  expiresAt: string;
  allowedJoinTypes: "human" | "agent" | "both";
  onboardingTextPath?: string;
  onboardingTextUrl?: string;
  inviteMessage?: string | null;
};

export type CompanyMember = {
  id: string;
  companyId: string;
  principalType: "user" | "agent";
  principalId: string;
  status: "pending" | "active" | "suspended";
  membershipRole: string | null;
  reportsToUserId: string | null;
  reportsToAgentId: string | null;
  createdAt: string;
  updatedAt: string;
  userName: string | null;
  userEmail: string | null;
  userImage: string | null;
};

export const accessApi = {
  claimBootstrapAdmin: () =>
    api.post<{ ok: true; promoted?: true; alreadyAdmin?: true }>("/bootstrap/claim-admin", {}),

  listCompanyMembers: (companyId: string) =>
    api.get<CompanyMember[]>(`/companies/${companyId}/members`),

  createHumanInvite: (companyId: string) =>
    api.post<CompanyInviteCreated>(`/companies/${companyId}/invites/human`, {}),

  updateMemberHierarchy: (
    companyId: string,
    memberId: string,
    data: { reportsToUserId?: string | null; reportsToAgentId?: string | null },
  ) => api.patch<CompanyMember>(`/companies/${companyId}/members/${memberId}/hierarchy`, data),

  getMySubordinates: (companyId: string) =>
    api.get<{ userIds: string[]; agentIds: string[]; isTopLevel: boolean }>(
      `/companies/${companyId}/my-subordinates`,
    ),
  createCompanyInvite: (
    companyId: string,
    input: {
      allowedJoinTypes?: "human" | "agent" | "both";
      defaultsPayload?: Record<string, unknown> | null;
      agentMessage?: string | null;
    } = {},
  ) =>
    api.post<CompanyInviteCreated>(`/companies/${companyId}/invites`, input),

  createOpenClawInvitePrompt: (
    companyId: string,
    input: {
      agentMessage?: string | null;
    } = {},
  ) =>
    api.post<CompanyInviteCreated>(
      `/companies/${companyId}/openclaw/invite-prompt`,
      input,
    ),

  getInvite: (token: string) => api.get<InviteSummary>(`/invites/${token}`),
  getInviteOnboarding: (token: string) =>
    api.get<InviteOnboardingManifest>(`/invites/${token}/onboarding`),

  acceptInvite: (token: string, input: AcceptInviteInput) =>
    api.post<AgentJoinRequestAccepted | JoinRequest | { bootstrapAccepted: true; userId: string }>(
      `/invites/${token}/accept`,
      input,
    ),

  listJoinRequests: (companyId: string, status: "pending_approval" | "approved" | "rejected" = "pending_approval") =>
    api.get<JoinRequest[]>(`/companies/${companyId}/join-requests?status=${status}`),

  approveJoinRequest: (companyId: string, requestId: string) =>
    api.post<JoinRequest>(`/companies/${companyId}/join-requests/${requestId}/approve`, {}),

  rejectJoinRequest: (companyId: string, requestId: string) =>
    api.post<JoinRequest>(`/companies/${companyId}/join-requests/${requestId}/reject`, {}),

  claimJoinRequestApiKey: (requestId: string, claimSecret: string) =>
    api.post<{ keyId: string; token: string; agentId: string; createdAt: string }>(
      `/join-requests/${requestId}/claim-api-key`,
      { claimSecret },
    ),

  listRoles: (companyId: string) =>
    api.get<Array<{ id: string; companyId: string; slug: string; displayName: string; isSystem: boolean; permissions: string[] }>>(
      `/companies/${companyId}/roles`,
    ),

  getMyPermissions: (companyId: string) =>
    api.get<string[]>(`/companies/${companyId}/my-permissions`),

  updateMemberRole: (companyId: string, memberId: string, roleId: string) =>
    api.patch<{ ok: true; roleId: string; roleSlug: string }>(
      `/companies/${companyId}/members/${memberId}/role`,
      { roleId },
    ),

  getBoardClaimStatus: (token: string, code: string) =>
    api.get<BoardClaimStatus>(`/board-claim/${token}?code=${encodeURIComponent(code)}`),

  claimBoard: (token: string, code: string) =>
    api.post<{ claimed: true; userId: string }>(`/board-claim/${token}/claim`, { code }),
};
