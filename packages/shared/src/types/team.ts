export type TeamAccessGrantStatus = "pending" | "active" | "revoked";

export interface TeamAccessGrant {
  id: string;
  companyId: string;
  email: string;
  userId: string | null;
  status: TeamAccessGrantStatus;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TeamAccessGrantAgent {
  id: string;
  grantId: string;
  agentId: string;
  createdAt: Date;
}

export interface TeamMember {
  grant: TeamAccessGrant;
  agentIds: string[];
  user: {
    name: string | null;
    email: string;
  } | null;
  scopeAgents: Array<{ id: string; name: string; title: string | null }>;
}
