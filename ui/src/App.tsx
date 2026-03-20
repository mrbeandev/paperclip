import { useEffect, useRef } from "react";
import { Navigate, Outlet, Route, Routes, useLocation, useParams } from "@/lib/router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Layout } from "./components/Layout";
import { OnboardingWizard } from "./components/OnboardingWizard";
import { authApi } from "./api/auth";
import { companiesApi } from "./api/companies";
import { accessApi } from "./api/access";
import { projectsApi } from "./api/projects";
import { healthApi } from "./api/health";
import { Dashboard } from "./pages/Dashboard";
import { Companies } from "./pages/Companies";
import { Agents } from "./pages/Agents";
import { AgentDetail } from "./pages/AgentDetail";
import { Projects } from "./pages/Projects";
import { ProjectDetail } from "./pages/ProjectDetail";
import { Issues } from "./pages/Issues";
import { IssueDetail } from "./pages/IssueDetail";
import { Goals } from "./pages/Goals";
import { GoalDetail } from "./pages/GoalDetail";
import { Approvals } from "./pages/Approvals";
import { ApprovalDetail } from "./pages/ApprovalDetail";
import { Costs } from "./pages/Costs";
import { Activity } from "./pages/Activity";
import { Inbox } from "./pages/Inbox";
import { CompanySettings } from "./pages/CompanySettings";
import { TeamMembers } from "./pages/TeamMembers";
import { MemberDetail } from "./pages/MemberDetail";
import { DesignGuide } from "./pages/DesignGuide";
import { InstanceSettings } from "./pages/InstanceSettings";
import { PluginManager } from "./pages/PluginManager";
import { PluginSettings } from "./pages/PluginSettings";
import { PluginPage } from "./pages/PluginPage";
import { RunTranscriptUxLab } from "./pages/RunTranscriptUxLab";
import { OrgChart } from "./pages/OrgChart";
import { OverallDashboard } from "./pages/OverallDashboard";
import { NewAgent } from "./pages/NewAgent";
import { AuthPage } from "./pages/Auth";
import { BoardClaimPage } from "./pages/BoardClaim";
import { InviteLandingPage } from "./pages/InviteLanding";
import { NotFoundPage } from "./pages/NotFound";
import { queryKeys } from "./lib/queryKeys";
import { useCompany } from "./context/CompanyContext";
import { useDialog } from "./context/DialogContext";
import { loadLastInboxTab } from "./lib/inbox";

function BootstrapPendingPage({ hasActiveInvite = false }: { hasActiveInvite?: boolean }) {
  return (
    <div className="mx-auto max-w-xl py-10">
      <div className="rounded-lg border border-border bg-card p-6">
        <h1 className="text-xl font-semibold">Instance setup required</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {hasActiveInvite
            ? "No instance admin exists yet. A bootstrap invite is already active. Check your Paperclip startup logs for the first admin invite URL, or run this command to rotate it:"
            : "No instance admin exists yet. Run this command in your Paperclip environment to generate the first admin invite URL:"}
        </p>
        <pre className="mt-4 overflow-x-auto rounded-md border border-border bg-muted/30 p-3 text-xs">
{`pnpm paperclipai auth bootstrap-ceo`}
        </pre>
      </div>
    </div>
  );
}

function PendingApprovalPage() {
  const queryClient = useQueryClient();
  const { data: session } = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
    retry: false,
  });

  // Poll for company access every 5 seconds
  useQuery({
    queryKey: queryKeys.companies.all,
    queryFn: () => companiesApi.list().catch(() => []),
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  });

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 shadow-sm text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
          <svg className="h-6 w-6 text-primary animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div>
          <h1 className="text-lg font-semibold">Waiting for approval</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your join request has been submitted. An admin needs to approve your access before you can continue.
          </p>
        </div>
        {session?.user && (
          <p className="text-xs text-muted-foreground">
            Signed in as <span className="font-medium text-foreground">{session.user.name ?? session.user.email}</span>
          </p>
        )}
        <p className="text-[11px] text-muted-foreground">
          This page will refresh automatically once approved.
        </p>
        <button
          onClick={() => {
            authApi.signOut().then(() => {
              queryClient.clear();
              window.location.href = "/auth";
            });
          }}
          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

function WaitingForAssignmentPage() {
  const queryClient = useQueryClient();
  const { data: session } = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
    retry: false,
  });

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 shadow-sm text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
          <svg className="h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <div>
          <h1 className="text-lg font-semibold">Waiting for assignment</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your account is active but you haven't been assigned to any projects or teams yet. Ask your admin to assign you.
          </p>
        </div>
        {session?.user && (
          <p className="text-xs text-muted-foreground">
            Signed in as <span className="font-medium text-foreground">{session.user.name ?? session.user.email}</span>
          </p>
        )}
        <p className="text-[11px] text-muted-foreground">
          This page will refresh automatically once assigned.
        </p>
        <button
          onClick={() => {
            authApi.signOut().then(() => {
              queryClient.clear();
              window.location.href = "/auth";
            });
          }}
          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

function CompanyAccessGate() {
  const { data: health } = useQuery({
    queryKey: queryKeys.health,
    queryFn: () => healthApi.get(),
    retry: false,
  });

  const { data: companies, isLoading: companiesLoading } = useQuery({
    queryKey: queryKeys.companies.all,
    queryFn: () => companiesApi.list().catch(() => []),
  });

  const { data: session } = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
    retry: false,
  });

  const isLocalTrusted = health?.deploymentMode === "local_trusted";
  const firstCompanyId = companies?.[0]?.id ?? null;
  const noCompanies = companies !== undefined && companies.length === 0;

  const { data: members, isLoading: membersLoading } = useQuery({
    queryKey: queryKeys.access.members(firstCompanyId ?? "__none__"),
    queryFn: () => accessApi.listCompanyMembers(firstCompanyId!),
    enabled: !!firstCompanyId,
    refetchInterval: 5000,
  });

  const { data: projects } = useQuery({
    queryKey: queryKeys.projects.list(firstCompanyId ?? "__none__"),
    queryFn: () => projectsApi.list(firstCompanyId!),
    enabled: !!firstCompanyId,
    refetchInterval: 5000,
  });

  // Check if user is an instance admin (only when no companies)
  const { data: adminCompanyAccess, isLoading: adminCheckLoading } = useQuery({
    queryKey: ["admin-check", session?.user?.id],
    queryFn: async () => {
      try {
        const res = await fetch(`/api/admin/users/${session!.user.id}/company-access`, {
          credentials: "include",
          headers: { Accept: "application/json" },
        });
        return res.ok;
      } catch {
        return false;
      }
    },
    enabled: !isLocalTrusted && !!session?.user && noCompanies,
    retry: false,
  });

  // --- All hooks above, all conditional returns below ---

  if (companiesLoading) {
    return <div className="mx-auto max-w-xl py-10 text-sm text-muted-foreground">Loading...</div>;
  }

  // User is authenticated but has no company access — pending approval
  // Instance admins and local_trusted users always pass through
  if (!isLocalTrusted && noCompanies) {
    if (adminCheckLoading) {
      return <div className="mx-auto max-w-xl py-10 text-sm text-muted-foreground">Loading...</div>;
    }
    if (!adminCompanyAccess) {
      return <PendingApprovalPage />;
    }
    // Admin with no companies — let them through to create one via onboarding
  }

  // Wait for members to load before checking assignment status
  if (firstCompanyId && membersLoading) {
    return <div className="mx-auto max-w-xl py-10 text-sm text-muted-foreground">Loading...</div>;
  }

  // Check if non-owner member has any assignments
  if (session?.user && members && firstCompanyId) {
    const me = members.find(
      (m) => m.principalType === "user" && m.principalId === session.user.id,
    );
    // Only apply assignment check to non-owner members
    if (me && me.membershipRole !== "owner") {
      const hasHierarchy = !!(me.reportsToUserId || me.reportsToAgentId) ||
        members.some((m) => m.reportsToUserId === session.user.id);
      const hasProjects = (projects ?? []).length > 0;

      if (!hasHierarchy && !hasProjects) {
        return <WaitingForAssignmentPage />;
      }
    }
  }

  return <Outlet />;
}

function CloudAccessGate() {
  const location = useLocation();
  const healthQuery = useQuery({
    queryKey: queryKeys.health,
    queryFn: () => healthApi.get(),
    retry: false,
    refetchInterval: (query) => {
      const data = query.state.data as
        | { deploymentMode?: "local_trusted" | "authenticated"; bootstrapStatus?: "ready" | "bootstrap_pending" }
        | undefined;
      return data?.deploymentMode === "authenticated" && data.bootstrapStatus === "bootstrap_pending"
        ? 2000
        : false;
    },
    refetchIntervalInBackground: true,
  });

  const isAuthenticatedMode = healthQuery.data?.deploymentMode === "authenticated";
  const sessionQuery = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
    enabled: isAuthenticatedMode,
    retry: false,
  });

  if (healthQuery.isLoading || (isAuthenticatedMode && sessionQuery.isLoading)) {
    return <div className="mx-auto max-w-xl py-10 text-sm text-muted-foreground">Loading...</div>;
  }

  if (healthQuery.error) {
    return (
      <div className="mx-auto max-w-xl py-10 text-sm text-destructive">
        {healthQuery.error instanceof Error ? healthQuery.error.message : "Failed to load app state"}
      </div>
    );
  }

  if (isAuthenticatedMode && healthQuery.data?.bootstrapStatus === "bootstrap_pending") {
    // If bootstrap pending but user is already signed in, show the CLI page (edge case)
    if (sessionQuery.data) {
      return <BootstrapPendingPage hasActiveInvite={healthQuery.data.bootstrapInviteActive} />;
    }
    // Otherwise redirect to auth so they can create the admin account
    return <Navigate to="/auth" replace />;
  }

  if (isAuthenticatedMode && !sessionQuery.data) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/auth?next=${next}`} replace />;
  }

  // If user is authenticated, check if they have access to any company
  if (isAuthenticatedMode && sessionQuery.data) {
    return <CompanyAccessGate />;
  }

  return <Outlet />;
}

function boardRoutes() {
  return (
    <>
      <Route index element={<Navigate to="dashboard" replace />} />
      <Route path="dashboard" element={<Dashboard />} />
      <Route path="overall-dashboard" element={<OverallDashboard />} />
      <Route path="onboarding" element={<OnboardingRoutePage />} />
      <Route path="companies" element={<Companies />} />
      <Route path="company/settings" element={<CompanySettings />} />
      <Route path="company/team-members" element={<TeamMembers />} />
      <Route path="members/:userId" element={<MemberDetail />} />
      <Route path="settings" element={<LegacySettingsRedirect />} />
      <Route path="settings/*" element={<LegacySettingsRedirect />} />
      <Route path="plugins/:pluginId" element={<PluginPage />} />
      <Route path="org" element={<OrgChart />} />
      <Route path="agents" element={<Navigate to="/agents/all" replace />} />
      <Route path="agents/all" element={<Agents />} />
      <Route path="agents/active" element={<Agents />} />
      <Route path="agents/paused" element={<Agents />} />
      <Route path="agents/error" element={<Agents />} />
      <Route path="agents/new" element={<NewAgent />} />
      <Route path="agents/:agentId" element={<AgentDetail />} />
      <Route path="agents/:agentId/:tab" element={<AgentDetail />} />
      <Route path="agents/:agentId/runs/:runId" element={<AgentDetail />} />
      <Route path="projects" element={<Projects />} />
      <Route path="projects/:projectId" element={<ProjectDetail />} />
      <Route path="projects/:projectId/overview" element={<ProjectDetail />} />
      <Route path="projects/:projectId/issues" element={<ProjectDetail />} />
      <Route path="projects/:projectId/issues/:filter" element={<ProjectDetail />} />
      <Route path="projects/:projectId/configuration" element={<ProjectDetail />} />
      <Route path="projects/:projectId/budget" element={<ProjectDetail />} />
      <Route path="issues" element={<Issues />} />
      <Route path="issues/all" element={<Navigate to="/issues" replace />} />
      <Route path="issues/active" element={<Navigate to="/issues" replace />} />
      <Route path="issues/backlog" element={<Navigate to="/issues" replace />} />
      <Route path="issues/done" element={<Navigate to="/issues" replace />} />
      <Route path="issues/recent" element={<Navigate to="/issues" replace />} />
      <Route path="issues/:issueId" element={<IssueDetail />} />
      <Route path="goals" element={<Goals />} />
      <Route path="goals/:goalId" element={<GoalDetail />} />
      <Route path="approvals" element={<Navigate to="/approvals/pending" replace />} />
      <Route path="approvals/pending" element={<Approvals />} />
      <Route path="approvals/all" element={<Approvals />} />
      <Route path="approvals/:approvalId" element={<ApprovalDetail />} />
      <Route path="costs" element={<Costs />} />
      <Route path="activity" element={<Activity />} />
      <Route path="inbox" element={<InboxRootRedirect />} />
      <Route path="inbox/recent" element={<Inbox />} />
      <Route path="inbox/unread" element={<Inbox />} />
      <Route path="inbox/all" element={<Inbox />} />
      <Route path="inbox/new" element={<Navigate to="/inbox/recent" replace />} />
      <Route path="design-guide" element={<DesignGuide />} />
      <Route path="tests/ux/runs" element={<RunTranscriptUxLab />} />
      <Route path=":pluginRoutePath" element={<PluginPage />} />
      <Route path="*" element={<NotFoundPage scope="board" />} />
    </>
  );
}

function InboxRootRedirect() {
  return <Navigate to={`/inbox/${loadLastInboxTab()}`} replace />;
}

function LegacySettingsRedirect() {
  const location = useLocation();
  return <Navigate to={`/instance/settings/heartbeats${location.search}${location.hash}`} replace />;
}

function OnboardingRoutePage() {
  const { companies, loading } = useCompany();
  const { onboardingOpen, openOnboarding } = useDialog();
  const { companyPrefix } = useParams<{ companyPrefix?: string }>();
  const opened = useRef(false);
  const matchedCompany = companyPrefix
    ? companies.find((company) => company.issuePrefix.toUpperCase() === companyPrefix.toUpperCase()) ?? null
    : null;

  useEffect(() => {
    if (loading || opened.current || onboardingOpen) return;
    opened.current = true;
    if (matchedCompany) {
      openOnboarding({ initialStep: 2, companyId: matchedCompany.id });
      return;
    }
    openOnboarding();
  }, [companyPrefix, loading, matchedCompany, onboardingOpen, openOnboarding]);

  const title = matchedCompany
    ? `Add another agent to ${matchedCompany.name}`
    : companies.length > 0
      ? "Create another company"
      : "Create your first company";
  const description = matchedCompany
    ? "Run onboarding again to add an agent and a starter task for this company."
    : companies.length > 0
      ? "Run onboarding again to create another company and seed its first agent."
      : "Get started by creating a company and your first agent.";

  return (
    <div className="mx-auto max-w-xl py-10">
      <div className="rounded-lg border border-border bg-card p-6">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        <div className="mt-4">
          <Button
            onClick={() =>
              matchedCompany
                ? openOnboarding({ initialStep: 2, companyId: matchedCompany.id })
                : openOnboarding()
            }
          >
            {matchedCompany ? "Add Agent" : "Start Onboarding"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CompanyRootRedirect() {
  const { companies, selectedCompany, loading } = useCompany();
  const { onboardingOpen } = useDialog();

  if (loading) {
    return <div className="mx-auto max-w-xl py-10 text-sm text-muted-foreground">Loading...</div>;
  }

  // Keep the first-run onboarding mounted until it completes.
  if (onboardingOpen) {
    return <NoCompaniesStartPage autoOpen={false} />;
  }

  const targetCompany = selectedCompany ?? companies[0] ?? null;
  if (!targetCompany) {
    return <NoCompaniesStartPage />;
  }

  return <Navigate to={`/${targetCompany.issuePrefix}/dashboard`} replace />;
}

function UnprefixedBoardRedirect() {
  const location = useLocation();
  const { companies, selectedCompany, loading } = useCompany();

  if (loading) {
    return <div className="mx-auto max-w-xl py-10 text-sm text-muted-foreground">Loading...</div>;
  }

  const targetCompany = selectedCompany ?? companies[0] ?? null;
  if (!targetCompany) {
    return <NoCompaniesStartPage />;
  }

  return (
    <Navigate
      to={`/${targetCompany.issuePrefix}${location.pathname}${location.search}${location.hash}`}
      replace
    />
  );
}

function NoCompaniesStartPage({ autoOpen = true }: { autoOpen?: boolean }) {
  const { openOnboarding } = useDialog();
  const opened = useRef(false);

  useEffect(() => {
    if (!autoOpen) return;
    if (opened.current) return;
    opened.current = true;
    openOnboarding();
  }, [autoOpen, openOnboarding]);

  return (
    <div className="mx-auto max-w-xl py-10">
      <div className="rounded-lg border border-border bg-card p-6">
        <h1 className="text-xl font-semibold">Create your first company</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Get started by creating a company.
        </p>
        <div className="mt-4">
          <Button onClick={() => openOnboarding()}>New Company</Button>
        </div>
      </div>
    </div>
  );
}

export function App() {
  return (
    <>
      <Routes>
        <Route path="auth" element={<AuthPage />} />
        <Route path="board-claim/:token" element={<BoardClaimPage />} />
        <Route path="invite/:token" element={<InviteLandingPage />} />

        <Route element={<CloudAccessGate />}>
          <Route index element={<CompanyRootRedirect />} />
          <Route path="onboarding" element={<OnboardingRoutePage />} />
          <Route path="instance" element={<Navigate to="/instance/settings/heartbeats" replace />} />
          <Route path="instance/settings" element={<Layout />}>
            <Route index element={<Navigate to="heartbeats" replace />} />
            <Route path="heartbeats" element={<InstanceSettings />} />
            <Route path="plugins" element={<PluginManager />} />
            <Route path="plugins/:pluginId" element={<PluginSettings />} />
          </Route>
          <Route path="companies" element={<UnprefixedBoardRedirect />} />
          <Route path="issues" element={<UnprefixedBoardRedirect />} />
          <Route path="issues/:issueId" element={<UnprefixedBoardRedirect />} />
          <Route path="settings" element={<LegacySettingsRedirect />} />
          <Route path="settings/*" element={<LegacySettingsRedirect />} />
          <Route path="agents" element={<UnprefixedBoardRedirect />} />
          <Route path="agents/new" element={<UnprefixedBoardRedirect />} />
          <Route path="agents/:agentId" element={<UnprefixedBoardRedirect />} />
          <Route path="agents/:agentId/:tab" element={<UnprefixedBoardRedirect />} />
          <Route path="agents/:agentId/runs/:runId" element={<UnprefixedBoardRedirect />} />
          <Route path="projects" element={<UnprefixedBoardRedirect />} />
          <Route path="projects/:projectId" element={<UnprefixedBoardRedirect />} />
          <Route path="projects/:projectId/overview" element={<UnprefixedBoardRedirect />} />
          <Route path="projects/:projectId/issues" element={<UnprefixedBoardRedirect />} />
          <Route path="projects/:projectId/issues/:filter" element={<UnprefixedBoardRedirect />} />
          <Route path="projects/:projectId/configuration" element={<UnprefixedBoardRedirect />} />
          <Route path="tests/ux/runs" element={<UnprefixedBoardRedirect />} />
          <Route path=":companyPrefix" element={<Layout />}>
            {boardRoutes()}
          </Route>
          <Route path="*" element={<NotFoundPage scope="global" />} />
        </Route>
      </Routes>
      <OnboardingWizard />
    </>
  );
}
