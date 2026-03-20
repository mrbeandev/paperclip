import {
  Inbox,
  CircleDot,
  Target,
  LayoutDashboard,
  BarChart3,
  DollarSign,
  History,
  Search,
  SquarePen,
  Network,
  Settings,
  Users,
  LogOut,
} from "lucide-react";
import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { SidebarSection } from "./SidebarSection";
import { SidebarNavItem } from "./SidebarNavItem";
import { SidebarProjects } from "./SidebarProjects";
import { SidebarAgents } from "./SidebarAgents";
import { useDialog } from "../context/DialogContext";
import { useCompany } from "../context/CompanyContext";
import { heartbeatsApi } from "../api/heartbeats";
import { authApi } from "../api/auth";
import { accessApi } from "../api/access";
import { queryKeys } from "../lib/queryKeys";
import { useInboxBadge } from "../hooks/useInboxBadge";
import { Button } from "@/components/ui/button";
import { PluginSlotOutlet } from "@/plugins/slots";
import { useNavigate } from "@/lib/router";

export function Sidebar() {
  const { openNewIssue } = useDialog();
  const { selectedCompanyId, selectedCompany } = useCompany();
  const inboxBadge = useInboxBadge(selectedCompanyId);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: session } = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
    retry: false,
  });
  const currentUser = session?.user;

  const signOutMutation = useMutation({
    mutationFn: () => authApi.signOut(),
    onSuccess: () => {
      queryClient.clear();
      navigate("/auth", { replace: true });
    },
  });

  const { data: liveRuns } = useQuery({
    queryKey: queryKeys.liveRuns(selectedCompanyId!),
    queryFn: () => heartbeatsApi.liveRunsForCompany(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 10_000,
  });
  const { data: members } = useQuery({
    queryKey: queryKeys.access.members(selectedCompanyId!),
    queryFn: () => accessApi.listCompanyMembers(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const myMembership = useMemo(() => {
    if (!currentUser || !members) return null;
    return members.find(
      (m) => m.principalType === "user" && m.principalId === currentUser.id,
    ) ?? null;
  }, [currentUser, members]);

  const isOwner = myMembership?.membershipRole === "owner";

  const { data: subordinates } = useQuery({
    queryKey: queryKeys.access.mySubordinates(selectedCompanyId!),
    queryFn: () => accessApi.getMySubordinates(selectedCompanyId!),
    enabled: !!selectedCompanyId && !isOwner,
  });

  // Scope live run count: owners see all, members only their subordinate agents
  const liveRunCount = useMemo(() => {
    const all = liveRuns ?? [];
    if (isOwner || !subordinates || subordinates.isTopLevel) return all.length;
    const allowed = new Set(subordinates.agentIds);
    return all.filter((r) => allowed.has(r.agentId)).length;
  }, [liveRuns, isOwner, subordinates]);

  // Check if member has any hierarchy assignment (reports to someone or has reports)
  const hasHierarchyAssignment = useMemo(() => {
    if (isOwner || !currentUser || !members) return true;
    const me = myMembership;
    if (!me) return false;
    // Has a parent
    if (me.reportsToUserId || me.reportsToAgentId) return true;
    // Has subordinates
    return members.some(
      (m) => m.reportsToUserId === currentUser.id,
    );
  }, [isOwner, currentUser, members, myMembership]);

  function openSearch() {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
  }

  const pluginContext = {
    companyId: selectedCompanyId,
    companyPrefix: selectedCompany?.issuePrefix ?? null,
  };

  return (
    <aside className="w-60 h-full min-h-0 border-r border-border bg-background flex flex-col">
      {/* Top bar: Company name (bold) + Search — aligned with top sections (no visible border) */}
      <div className="flex items-center gap-1 px-3 h-12 shrink-0">
        {selectedCompany?.brandColor && (
          <div
            className="w-4 h-4 rounded-sm shrink-0 ml-1"
            style={{ backgroundColor: selectedCompany.brandColor }}
          />
        )}
        <span className="flex-1 text-sm font-bold text-foreground truncate pl-1">
          {selectedCompany?.name ?? "Select company"}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground shrink-0"
          onClick={openSearch}
        >
          <Search className="h-4 w-4" />
        </Button>
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto scrollbar-auto-hide flex flex-col gap-4 px-3 py-2">
        <div className="flex flex-col gap-0.5">
          {/* New Issue button — shown for owners and members with project access */}
          <button
            onClick={() => openNewIssue()}
            className="flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
          >
            <SquarePen className="h-4 w-4 shrink-0" />
            <span className="truncate">New Issue</span>
          </button>
          <SidebarNavItem to="/dashboard" label="Dashboard" icon={LayoutDashboard} liveCount={liveRunCount} />
          {isOwner && <SidebarNavItem to="/overall-dashboard" label="Overview" icon={BarChart3} />}
          <SidebarNavItem
            to="/inbox"
            label="Inbox"
            icon={Inbox}
            badge={inboxBadge.inbox}
            badgeTone={inboxBadge.failedRuns > 0 ? "danger" : "default"}
            alert={inboxBadge.failedRuns > 0}
          />
          <PluginSlotOutlet
            slotTypes={["sidebar"]}
            context={pluginContext}
            className="flex flex-col gap-0.5"
            itemClassName="text-[13px] font-medium"
            missingBehavior="placeholder"
          />
        </div>

        <SidebarSection label="Work">
          <SidebarNavItem to="/issues" label="Issues" icon={CircleDot} />
          {isOwner && <SidebarNavItem to="/goals" label="Goals" icon={Target} />}
        </SidebarSection>

        <SidebarProjects />

        <SidebarAgents isOwner={isOwner} />

        <SidebarSection label="Company">
          <SidebarNavItem to="/org" label="Org" icon={Network} />
          {isOwner && <SidebarNavItem to="/costs" label="Costs" icon={DollarSign} />}
          {isOwner && <SidebarNavItem to="/activity" label="Activity" icon={History} />}
          {isOwner && <SidebarNavItem to="/company/team-members" label="Team Members" icon={Users} />}
          {isOwner && <SidebarNavItem to="/company/settings" label="Settings" icon={Settings} />}
        </SidebarSection>

        <PluginSlotOutlet
          slotTypes={["sidebarPanel"]}
          context={pluginContext}
          className="flex flex-col gap-3"
          itemClassName="rounded-lg border border-border p-3"
          missingBehavior="placeholder"
        />
      </nav>

      {/* User footer */}
      {currentUser && (
        <div className="shrink-0 border-t border-border px-3 py-2 flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[11px] font-semibold text-muted-foreground shrink-0 uppercase">
            {(currentUser.name ?? currentUser.email ?? "?").charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-medium text-foreground truncate leading-tight">
              {currentUser.name ?? currentUser.email}
            </p>
            {currentUser.name && (
              <p className="text-[11px] text-muted-foreground truncate leading-tight">
                {currentUser.email}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground shrink-0"
            title="Sign out"
            disabled={signOutMutation.isPending}
            onClick={() => signOutMutation.mutate()}
          >
            <LogOut className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </aside>
  );
}
