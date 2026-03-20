import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Agent, Issue } from "@paperclipai/shared";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { agentsApi } from "../api/agents";
import { accessApi, type CompanyMember } from "../api/access";
import { issuesApi } from "../api/issues";
import { projectsApi } from "../api/projects";
import { queryKeys } from "../lib/queryKeys";
import { useEffect } from "react";

export function OverallDashboard() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: "Overall Dashboard" }]);
  }, [setBreadcrumbs]);

  const { data: projects } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: members } = useQuery({
    queryKey: queryKeys.access.members(selectedCompanyId!),
    queryFn: () => accessApi.listCompanyMembers(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: allIssues } = useQuery({
    queryKey: ["dashboard-all-issues", selectedCompanyId],
    queryFn: () => issuesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    staleTime: 0,
  });

  const issues: Issue[] = allIssues ?? [];
  const activeProjects = (projects ?? []).filter((p: any) => !p.archivedAt);
  const activeAgents = (agents ?? []).filter((a: Agent) => a.status !== "terminated");
  const humanMembers = (members ?? []).filter(
    (m: CompanyMember) => m.principalType === "user" && m.status === "active",
  );

  // Status counts
  const total = issues.length;
  const done = issues.filter((i) => i.status === "done").length;
  const inProgress = issues.filter((i) => i.status === "in_progress").length;
  const todo = issues.filter((i) => i.status === "todo").length;
  const blocked = issues.filter((i) => i.status === "blocked").length;
  const backlog = issues.filter((i) => i.status === "backlog").length;
  const completionRate = total > 0 ? Math.round((done / total) * 100) : 0;
  const unassigned = issues.filter((i) => !i.assigneeAgentId && !i.assigneeUserId).length;

  // Project breakdown
  const projectBreakdown = useMemo(() => {
    return activeProjects
      .map((p: any) => {
        const pIssues = issues.filter((i) => i.projectId === p.id);
        const pDone = pIssues.filter((i) => i.status === "done").length;
        return {
          name: p.name,
          color: p.color,
          total: pIssues.length,
          done: pDone,
          rate: pIssues.length > 0 ? Math.round((pDone / pIssues.length) * 100) : 0,
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [activeProjects, issues]);

  // Per-person performance
  const performanceData = useMemo(() => {
    const map = new Map<
      string,
      { name: string; type: "human" | "agent"; total: number; done: number; inProgress: number }
    >();
    for (const issue of issues) {
      let key: string | null = null;
      let name = "";
      let type: "human" | "agent" = "human";
      if (issue.assigneeAgentId) {
        key = `agent:${issue.assigneeAgentId}`;
        name = activeAgents.find((a) => a.id === issue.assigneeAgentId)?.name ?? "Agent";
        type = "agent";
      } else if (issue.assigneeUserId) {
        key = `user:${issue.assigneeUserId}`;
        const m = humanMembers.find((m) => m.principalId === issue.assigneeUserId);
        name = m?.userName ?? "User";
        type = "human";
      }
      if (key) {
        const e = map.get(key) ?? { name, type, total: 0, done: 0, inProgress: 0 };
        e.total++;
        if (issue.status === "done") e.done++;
        if (issue.status === "in_progress") e.inProgress++;
        map.set(key, e);
      }
    }
    return Array.from(map.values()).sort((a, b) => b.done - a.done);
  }, [issues, activeAgents, humanMembers]);

  const maxPerf = Math.max(1, ...performanceData.map((p) => p.total));
  const agentTaskCount = performanceData
    .filter((p) => p.type === "agent")
    .reduce((s, p) => s + p.total, 0);

  if (!selectedCompanyId) {
    return (
      <div className="p-8 text-center text-muted-foreground">Select a company to view dashboard</div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <h1 className="text-lg font-semibold">Overall Dashboard</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard label="Total Issues" value={total} />
        <SummaryCard label="Completion Rate" value={`${completionRate}%`} />
        <SummaryCard label="Unassigned" value={unassigned} tone={unassigned > 0 ? "warn" : "default"} />
        <SummaryCard
          label="Tasks per Day (avg)"
          value={
            issues.length > 0
              ? (
                  issues.length /
                  Math.max(
                    1,
                    Math.ceil(
                      (Date.now() -
                        new Date(issues[issues.length - 1]?.createdAt ?? Date.now()).getTime()) /
                        (1000 * 60 * 60 * 24),
                    ),
                  )
                ).toFixed(1)
              : "0"
          }
        />
      </div>

      {/* Overall Progress */}
      <div className="rounded-lg border border-border p-4">
        <p className="text-sm font-medium mb-3">Overall Progress</p>
        <div className="w-full h-4 bg-muted rounded-full overflow-hidden flex">
          {done > 0 && (
            <div className="h-full bg-green-500" style={{ width: `${(done / Math.max(total, 1)) * 100}%` }} />
          )}
          {inProgress > 0 && (
            <div className="h-full bg-blue-500" style={{ width: `${(inProgress / Math.max(total, 1)) * 100}%` }} />
          )}
          {todo > 0 && (
            <div className="h-full bg-purple-500" style={{ width: `${(todo / Math.max(total, 1)) * 100}%` }} />
          )}
          {blocked > 0 && (
            <div className="h-full bg-red-500" style={{ width: `${(blocked / Math.max(total, 1)) * 100}%` }} />
          )}
          {backlog > 0 && (
            <div className="h-full bg-neutral-500" style={{ width: `${(backlog / Math.max(total, 1)) * 100}%` }} />
          )}
        </div>
        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-green-500" /> Done ({done})
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-blue-500" /> In Progress ({inProgress})
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-purple-500" /> Todo ({todo})
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-red-500" /> Blocked ({blocked})
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-neutral-500" /> Backlog ({backlog})
          </span>
        </div>
      </div>

      {/* Project Breakdown */}
      {projectBreakdown.length > 0 && (
        <div className="rounded-lg border border-border p-4">
          <p className="text-sm font-medium mb-3">Project Breakdown</p>
          <div className="space-y-2">
            {projectBreakdown.map((p) => (
              <div key={p.name} className="flex items-center gap-3">
                <span
                  className="h-3 w-3 rounded-sm shrink-0"
                  style={{ backgroundColor: p.color ?? "#6366f1" }}
                />
                <span className="text-xs w-28 truncate">{p.name}</span>
                <div className="flex-1 h-5 bg-muted/30 rounded overflow-hidden">
                  <div className="h-full bg-green-500/70 rounded" style={{ width: `${p.rate}%` }} />
                </div>
                <span className="text-xs font-medium w-16 text-right">
                  {p.done}/{p.total}
                </span>
                <span
                  className={`text-[10px] font-medium w-10 text-right ${
                    p.rate >= 75
                      ? "text-green-500"
                      : p.rate >= 50
                        ? "text-amber-500"
                        : "text-muted-foreground"
                  }`}
                >
                  {p.rate}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Team & Agent Performance */}
      {performanceData.length > 0 && (
        <div className="rounded-lg border border-border p-4">
          <p className="text-sm font-medium mb-3">Team & Agent Performance</p>
          <div className="space-y-2">
            {performanceData.map((person) => {
              const rate = person.total > 0 ? Math.round((person.done / person.total) * 100) : 0;
              return (
                <div key={person.name} className="flex items-center gap-3">
                  <div className="flex items-center gap-2 w-36 shrink-0">
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded ${
                        person.type === "agent"
                          ? "bg-blue-500/15 text-blue-500"
                          : "bg-primary/15 text-primary"
                      }`}
                    >
                      {person.type === "agent" ? "AI" : "H"}
                    </span>
                    <span className="text-xs truncate">{person.name}</span>
                  </div>
                  <div className="flex-1 h-5 bg-muted/30 rounded overflow-hidden flex">
                    <div
                      className="h-full bg-green-500"
                      style={{ width: `${(person.done / maxPerf) * 100}%` }}
                    />
                    <div
                      className="h-full bg-blue-500"
                      style={{ width: `${(person.inProgress / maxPerf) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium w-12 text-right">
                    {person.done}/{person.total}
                  </span>
                  <span
                    className={`text-[10px] font-medium w-10 text-right ${
                      rate >= 75 ? "text-green-500" : rate >= 50 ? "text-amber-500" : "text-red-500"
                    }`}
                  >
                    {rate}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Bottom row: Human vs Agent + Top Performer */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-lg border border-border p-4">
          <p className="text-xs text-muted-foreground">Human vs Agent Tasks</p>
          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden flex">
              <div
                className="h-full bg-primary/70"
                style={{
                  width: `${total > 0 ? ((total - agentTaskCount) / total) * 100 : 50}%`,
                }}
              />
              <div
                className="h-full bg-blue-500/70"
                style={{
                  width: `${total > 0 ? (agentTaskCount / total) * 100 : 50}%`,
                }}
              />
            </div>
          </div>
          <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-1">
            <span>Human ({total - agentTaskCount})</span>
            <span>Agent ({agentTaskCount})</span>
          </div>
        </div>

        <div className="rounded-lg border border-border p-4">
          <p className="text-xs text-muted-foreground">Top Performer</p>
          <p className="text-lg font-bold mt-1 truncate">
            {performanceData[0]?.name ?? "\u2014"}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {performanceData[0] ? `${performanceData[0].done} completed` : ""}
          </p>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string | number;
  tone?: "default" | "warn";
}) {
  return (
    <div className="rounded-lg border border-border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold mt-1 ${tone === "warn" ? "text-amber-500" : ""}`}>
        {value}
      </p>
    </div>
  );
}
