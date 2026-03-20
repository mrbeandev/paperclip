import { useCallback, useEffect, useMemo } from "react";
import { useParams, Link, useNavigate } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { accessApi, type CompanyMember } from "../api/access";
import { agentsApi } from "../api/agents";
import { activityApi } from "../api/activity";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { useMyPermissions } from "../hooks/useMyPermissions";
import { agentUrl } from "../lib/utils";
import { PageSkeleton } from "../components/PageSkeleton";
import { AgentIcon } from "../components/AgentIconPicker";
import { User, ArrowLeft, Users, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AGENT_ROLE_LABELS, type Agent } from "@paperclipai/shared";
import { relativeTime } from "../lib/utils";

const roleLabels = AGENT_ROLE_LABELS as Record<string, string>;

export function MemberDetail() {
  const { userId, companyPrefix } = useParams<{ userId: string; companyPrefix: string }>();
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();

  const { data: allMembers, isLoading: membersLoading } = useQuery({
    queryKey: queryKeys.access.members(selectedCompanyId!),
    queryFn: () => accessApi.listCompanyMembers(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: activity } = useQuery({
    queryKey: queryKeys.activity(selectedCompanyId!),
    queryFn: () => activityApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const member = useMemo(
    () => allMembers?.find((m) => m.principalType === "user" && m.principalId === userId) ?? null,
    [allMembers, userId],
  );

  // Find who this member reports to
  const reportsToAgent = useMemo(() => {
    if (!member?.reportsToAgentId || !agents) return null;
    return agents.find((a) => a.id === member.reportsToAgentId) ?? null;
  }, [member, agents]);

  const reportsToUser = useMemo(() => {
    if (!member?.reportsToUserId || !allMembers) return null;
    return allMembers.find(
      (m) => m.principalType === "user" && m.principalId === member.reportsToUserId,
    ) ?? null;
  }, [member, allMembers]);

  // Find direct reports (humans and agents)
  const directReportHumans = useMemo(() => {
    if (!userId || !allMembers) return [];
    return allMembers.filter(
      (m) => m.principalType === "user" && m.reportsToUserId === userId && m.status === "active",
    );
  }, [allMembers, userId]);

  const directReportAgents = useMemo(() => {
    if (!userId || !agents) return [];
    return agents.filter((a) => a.reportsToUserId === userId && a.status !== "terminated");
  }, [agents, userId]);

  // Filter activity for this user
  const userActivity = useMemo(() => {
    if (!activity || !userId) return [];
    return activity
      .filter((a) => a.actorType === "user" && a.actorId === userId)
      .slice(0, 20);
  }, [activity, userId]);

  const { hasPermission } = useMyPermissions();

  useEffect(() => {
    setBreadcrumbs([
      ...(hasPermission("team:view") ? [{ label: "Team Members", href: `/${companyPrefix}/company/team-members` }] : []),
      { label: member?.userName ?? member?.userEmail ?? "Member" },
    ]);
  }, [setBreadcrumbs, companyPrefix, member, hasPermission]);

  if (membersLoading) return <PageSkeleton />;

  if (!member) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Member not found.</p>
        <Button asChild variant="link" className="mt-2 px-0">
          <Link to={`/${companyPrefix}/company/team-members`}>
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back to Team Members
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="w-14 h-14 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
          <User className="h-7 w-7 text-blue-600 dark:text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold">{member.userName ?? member.userEmail ?? "Unknown"}</h1>
          {member.userName && member.userEmail && (
            <p className="text-sm text-muted-foreground">{member.userEmail}</p>
          )}
          <div className="flex items-center gap-3 mt-1.5">
            <span className="text-xs text-muted-foreground capitalize">{member.membershipRole ?? "member"}</span>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
              member.status === "active"
                ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                : "bg-muted text-muted-foreground"
            }`}>
              {member.status}
            </span>
          </div>
        </div>
      </div>

      {/* Reports to */}
      {(reportsToAgent || reportsToUser) && (
        <div className="rounded-lg border border-border p-4">
          <h2 className="text-sm font-medium mb-2">Reports to</h2>
          {reportsToAgent && (
            <Link
              to={agentUrl(reportsToAgent)}
              className="flex items-center gap-2.5 text-sm hover:text-primary transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                <AgentIcon icon={reportsToAgent.icon} className="h-3.5 w-3.5 text-foreground/70" />
              </div>
              <div>
                <span className="font-medium">{reportsToAgent.name}</span>
                <span className="ml-1.5 text-xs text-muted-foreground">
                  {reportsToAgent.title ?? roleLabels[reportsToAgent.role] ?? reportsToAgent.role}
                </span>
              </div>
            </Link>
          )}
          {reportsToUser && (
            <Link
              to={`/${companyPrefix}/members/${reportsToUser.principalId}`}
              className="flex items-center gap-2.5 text-sm hover:text-primary transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
                <User className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
              </div>
              <span className="font-medium">{reportsToUser.userName ?? reportsToUser.userEmail}</span>
            </Link>
          )}
        </div>
      )}

      {/* Direct reports */}
      {(directReportHumans.length > 0 || directReportAgents.length > 0) && (
        <div className="rounded-lg border border-border p-4">
          <h2 className="text-sm font-medium mb-3">
            Direct reports
            <span className="ml-1.5 text-muted-foreground font-normal">
              ({directReportHumans.length + directReportAgents.length})
            </span>
          </h2>
          <div className="space-y-1.5">
            {directReportAgents.map((agent) => (
              <Link
                key={agent.id}
                to={agentUrl(agent)}
                className="flex items-center gap-2.5 text-sm px-2 py-1.5 rounded-md hover:bg-muted/50 transition-colors"
              >
                <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <AgentIcon icon={agent.icon} className="h-3 w-3 text-foreground/70" />
                </div>
                <span className="font-medium truncate">{agent.name}</span>
                <span className="text-xs text-muted-foreground ml-auto flex items-center gap-1">
                  <Bot className="h-3 w-3" /> Agent
                </span>
              </Link>
            ))}
            {directReportHumans.map((m) => (
              <Link
                key={m.id}
                to={`/${companyPrefix}/members/${m.principalId}`}
                className="flex items-center gap-2.5 text-sm px-2 py-1.5 rounded-md hover:bg-muted/50 transition-colors"
              >
                <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
                  <User className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                </div>
                <span className="font-medium truncate">{m.userName ?? m.userEmail}</span>
                <span className="text-xs text-muted-foreground ml-auto flex items-center gap-1">
                  <Users className="h-3 w-3" /> Member
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Recent activity */}
      <div className="rounded-lg border border-border p-4">
        <h2 className="text-sm font-medium mb-3">Recent activity</h2>
        {userActivity.length === 0 ? (
          <p className="text-xs text-muted-foreground">No activity recorded yet.</p>
        ) : (
          <div className="space-y-2">
            {userActivity.map((entry) => (
              <div key={entry.id} className="flex items-start gap-2 text-xs">
                <span className="text-muted-foreground shrink-0 w-20 text-right">{relativeTime(entry.createdAt)}</span>
                <span className="font-medium text-foreground">{entry.action}</span>
                {entry.entityType && (
                  <span className="text-muted-foreground">
                    on {entry.entityType}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
