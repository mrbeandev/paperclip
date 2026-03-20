import { ChangeEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { companiesApi } from "../api/companies";
import { accessApi, type CompanyMember } from "../api/access";
import { authApi } from "../api/auth";
import { agentsApi } from "../api/agents";
import { projectsApi } from "../api/projects";
import { assetsApi } from "../api/assets";
import { queryKeys } from "../lib/queryKeys";
import { useMyPermissions } from "../hooks/useMyPermissions";
import { Button } from "@/components/ui/button";
import { Settings, Check, User, Bot, ChevronDown, X, Plus } from "lucide-react";
import { CompanyPatternIcon } from "../components/CompanyPatternIcon";
import {
  Field,
  ToggleField,
  HintIcon
} from "../components/agent-config-primitives";

type AgentSnippetInput = {
  onboardingTextUrl: string;
  connectionCandidates?: string[] | null;
  testResolutionUrl?: string | null;
};

export function CompanySettings() {
  const {
    companies,
    selectedCompany,
    selectedCompanyId,
    setSelectedCompanyId
  } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();

  const { hasPermission } = useMyPermissions();

  // General settings local state
  const [companyName, setCompanyName] = useState("");
  const [description, setDescription] = useState("");
  const [brandColor, setBrandColor] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [logoUploadError, setLogoUploadError] = useState<string | null>(null);

  // Sync local state from selected company
  useEffect(() => {
    if (!selectedCompany) return;
    setCompanyName(selectedCompany.name);
    setDescription(selectedCompany.description ?? "");
    setBrandColor(selectedCompany.brandColor ?? "");
    setLogoUrl(selectedCompany.logoUrl ?? "");
  }, [selectedCompany]);

  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSnippet, setInviteSnippet] = useState<string | null>(null);
  const [snippetCopied, setSnippetCopied] = useState(false);
  const [snippetCopyDelightId, setSnippetCopyDelightId] = useState(0);

  const generalDirty =
    !!selectedCompany &&
    (companyName !== selectedCompany.name ||
      description !== (selectedCompany.description ?? "") ||
      brandColor !== (selectedCompany.brandColor ?? ""));

  const generalMutation = useMutation({
    mutationFn: (data: {
      name: string;
      description: string | null;
      brandColor: string | null;
    }) => companiesApi.update(selectedCompanyId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
    }
  });

  const settingsMutation = useMutation({
    mutationFn: (requireApproval: boolean) =>
      companiesApi.update(selectedCompanyId!, {
        requireBoardApprovalForNewAgents: requireApproval
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
    }
  });

  const inviteMutation = useMutation({
    mutationFn: () =>
      accessApi.createOpenClawInvitePrompt(selectedCompanyId!),
    onSuccess: async (invite) => {
      setInviteError(null);
      const base = window.location.origin.replace(/\/+$/, "");
      const onboardingTextLink =
        invite.onboardingTextUrl ??
        invite.onboardingTextPath ??
        `/api/invites/${invite.token}/onboarding.txt`;
      const absoluteUrl = onboardingTextLink.startsWith("http")
        ? onboardingTextLink
        : `${base}${onboardingTextLink}`;
      setSnippetCopied(false);
      setSnippetCopyDelightId(0);
      let snippet: string;
      try {
        const manifest = await accessApi.getInviteOnboarding(invite.token);
        snippet = buildAgentSnippet({
          onboardingTextUrl: absoluteUrl,
          connectionCandidates:
            manifest.onboarding.connectivity?.connectionCandidates ?? null,
          testResolutionUrl:
            manifest.onboarding.connectivity?.testResolutionEndpoint?.url ??
            null
        });
      } catch {
        snippet = buildAgentSnippet({
          onboardingTextUrl: absoluteUrl,
          connectionCandidates: null,
          testResolutionUrl: null
        });
      }
      setInviteSnippet(snippet);
      try {
        await navigator.clipboard.writeText(snippet);
        setSnippetCopied(true);
        setSnippetCopyDelightId((prev) => prev + 1);
        setTimeout(() => setSnippetCopied(false), 2000);
      } catch {
        /* clipboard may not be available */
      }
      queryClient.invalidateQueries({
        queryKey: queryKeys.sidebarBadges(selectedCompanyId!)
      });
    },
    onError: (err) => {
      setInviteError(
        err instanceof Error ? err.message : "Failed to create invite"
      );
    }
  });

  const syncLogoState = (nextLogoUrl: string | null) => {
    setLogoUrl(nextLogoUrl ?? "");
    void queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
  };

  const logoUploadMutation = useMutation({
    mutationFn: (file: File) =>
      assetsApi
        .uploadCompanyLogo(selectedCompanyId!, file)
        .then((asset) => companiesApi.update(selectedCompanyId!, { logoAssetId: asset.assetId })),
    onSuccess: (company) => {
      syncLogoState(company.logoUrl);
      setLogoUploadError(null);
    }
  });

  const clearLogoMutation = useMutation({
    mutationFn: () => companiesApi.update(selectedCompanyId!, { logoAssetId: null }),
    onSuccess: (company) => {
      setLogoUploadError(null);
      syncLogoState(company.logoUrl);
    }
  });

  function handleLogoFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.currentTarget.value = "";
    if (!file) return;
    setLogoUploadError(null);
    logoUploadMutation.mutate(file);
  }

  function handleClearLogo() {
    clearLogoMutation.mutate();
  }

  useEffect(() => {
    setInviteError(null);
    setInviteSnippet(null);
    setSnippetCopied(false);
    setSnippetCopyDelightId(0);
  }, [selectedCompanyId]);
  const archiveMutation = useMutation({
    mutationFn: ({
      companyId,
      nextCompanyId
    }: {
      companyId: string;
      nextCompanyId: string | null;
    }) => companiesApi.archive(companyId).then(() => ({ nextCompanyId })),
    onSuccess: async ({ nextCompanyId }) => {
      if (nextCompanyId) {
        setSelectedCompanyId(nextCompanyId);
      }
      await queryClient.invalidateQueries({
        queryKey: queryKeys.companies.all
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.companies.stats
      });
    }
  });

  useEffect(() => {
    setBreadcrumbs([
      { label: selectedCompany?.name ?? "Company", href: "/dashboard" },
      { label: "Settings" }
    ]);
  }, [setBreadcrumbs, selectedCompany?.name]);

  if (!selectedCompany) {
    return (
      <div className="text-sm text-muted-foreground">
        No company selected. Select a company from the switcher above.
      </div>
    );
  }

  function handleSaveGeneral() {
    generalMutation.mutate({
      name: companyName.trim(),
      description: description.trim() || null,
      brandColor: brandColor || null
    });
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-2">
        <Settings className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Company Settings</h1>
      </div>

      {/* General */}
      <div className="space-y-4">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          General
        </div>
        <div className="space-y-3 rounded-md border border-border px-4 py-4">
          <Field label="Company name" hint="The display name for your company.">
            <input
              className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
          </Field>
          <Field
            label="Description"
            hint="Optional description shown in the company profile."
          >
            <input
              className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
              type="text"
              value={description}
              placeholder="Optional company description"
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
        </div>
      </div>

      {/* Appearance */}
      <div className="space-y-4">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Appearance
        </div>
        <div className="space-y-3 rounded-md border border-border px-4 py-4">
          <div className="flex items-start gap-4">
            <div className="shrink-0">
              <CompanyPatternIcon
                companyName={companyName || selectedCompany.name}
                logoUrl={logoUrl || null}
                brandColor={brandColor || null}
                className="rounded-[14px]"
              />
            </div>
            <div className="flex-1 space-y-3">
              <Field
                label="Logo"
                hint="Upload a PNG, JPEG, WEBP, GIF, or SVG logo image."
              >
                <div className="space-y-2">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                    onChange={handleLogoFileChange}
                    className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none file:mr-4 file:rounded-md file:border-0 file:bg-muted file:px-2.5 file:py-1 file:text-xs"
                  />
                  {logoUrl && (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleClearLogo}
                        disabled={clearLogoMutation.isPending}
                      >
                        {clearLogoMutation.isPending ? "Removing..." : "Remove logo"}
                      </Button>
                    </div>
                  )}
                  {(logoUploadMutation.isError || logoUploadError) && (
                    <span className="text-xs text-destructive">
                      {logoUploadError ??
                        (logoUploadMutation.error instanceof Error
                          ? logoUploadMutation.error.message
                          : "Logo upload failed")}
                    </span>
                  )}
                  {clearLogoMutation.isError && (
                    <span className="text-xs text-destructive">
                      {clearLogoMutation.error.message}
                    </span>
                  )}
                  {logoUploadMutation.isPending && (
                    <span className="text-xs text-muted-foreground">Uploading logo...</span>
                  )}
                </div>
              </Field>
              <Field
                label="Brand color"
                hint="Sets the hue for the company icon. Leave empty for auto-generated color."
              >
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={brandColor || "#6366f1"}
                    onChange={(e) => setBrandColor(e.target.value)}
                    className="h-8 w-8 cursor-pointer rounded border border-border bg-transparent p-0"
                  />
                  <input
                    type="text"
                    value={brandColor}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "" || /^#[0-9a-fA-F]{0,6}$/.test(v)) {
                        setBrandColor(v);
                      }
                    }}
                    placeholder="Auto"
                    className="w-28 rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm font-mono outline-none"
                  />
                  {brandColor && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setBrandColor("")}
                      className="text-xs text-muted-foreground"
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </Field>
            </div>
          </div>
        </div>
      </div>

      {/* Save button for General + Appearance */}
      {generalDirty && (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleSaveGeneral}
            disabled={generalMutation.isPending || !companyName.trim()}
          >
            {generalMutation.isPending ? "Saving..." : "Save changes"}
          </Button>
          {generalMutation.isSuccess && (
            <span className="text-xs text-muted-foreground">Saved</span>
          )}
          {generalMutation.isError && (
            <span className="text-xs text-destructive">
              {generalMutation.error instanceof Error
                  ? generalMutation.error.message
                  : "Failed to save"}
            </span>
          )}
        </div>
      )}

      {/* Hiring */}
      <div className="space-y-4">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Hiring
        </div>
        <div className="rounded-md border border-border px-4 py-3">
          <ToggleField
            label="Require board approval for new hires"
            hint="New agent hires stay pending until approved by board."
            checked={!!selectedCompany.requireBoardApprovalForNewAgents}
            onChange={(v) => settingsMutation.mutate(v)}
          />
        </div>
      </div>

      {/* Invites */}
      <div className="space-y-4">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Invites
        </div>
        <div className="space-y-3 rounded-md border border-border px-4 py-4">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">
              Generate an OpenClaw agent invite snippet.
            </span>
            <HintIcon text="Creates a short-lived OpenClaw agent invite and renders a copy-ready prompt." />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={() => inviteMutation.mutate()}
              disabled={inviteMutation.isPending}
            >
              {inviteMutation.isPending
                ? "Generating..."
                : "Generate OpenClaw Invite Prompt"}
            </Button>
          </div>
          {inviteError && (
            <p className="text-sm text-destructive">{inviteError}</p>
          )}
          {inviteSnippet && (
            <div className="rounded-md border border-border bg-muted/30 p-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-muted-foreground">
                  OpenClaw Invite Prompt
                </div>
                {snippetCopied && (
                  <span
                    key={snippetCopyDelightId}
                    className="flex items-center gap-1 text-xs text-green-600 animate-pulse"
                  >
                    <Check className="h-3 w-3" />
                    Copied
                  </span>
                )}
              </div>
              <div className="mt-1 space-y-1.5">
                <textarea
                  className="h-112 w-full rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs outline-none"
                  value={inviteSnippet}
                  readOnly
                />
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(inviteSnippet);
                        setSnippetCopied(true);
                        setSnippetCopyDelightId((prev) => prev + 1);
                        setTimeout(() => setSnippetCopied(false), 2000);
                      } catch {
                        /* clipboard may not be available */
                      }
                    }}
                  >
                    {snippetCopied ? "Copied snippet" : "Copy snippet"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Hierarchy */}
      {selectedCompanyId && <HierarchySection companyId={selectedCompanyId} />}

      {/* Danger Zone — owner only */}
      {hasPermission("company:archive") && <div className="space-y-4">
        <div className="text-xs font-medium text-destructive uppercase tracking-wide">
          Danger Zone
        </div>
        <div className="space-y-3 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-4">
          <p className="text-sm text-muted-foreground">
            Archive this company to hide it from the sidebar. This persists in
            the database.
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="destructive"
              disabled={
                archiveMutation.isPending ||
                selectedCompany.status === "archived"
              }
              onClick={() => {
                if (!selectedCompanyId) return;
                const confirmed = window.confirm(
                  `Archive company "${selectedCompany.name}"? It will be hidden from the sidebar.`
                );
                if (!confirmed) return;
                const nextCompanyId =
                  companies.find(
                    (company) =>
                      company.id !== selectedCompanyId &&
                      company.status !== "archived"
                  )?.id ?? null;
                archiveMutation.mutate({
                  companyId: selectedCompanyId,
                  nextCompanyId
                });
              }}
            >
              {archiveMutation.isPending
                ? "Archiving..."
                : selectedCompany.status === "archived"
                ? "Already archived"
                : "Archive company"}
            </Button>
            {archiveMutation.isError && (
              <span className="text-xs text-destructive">
                {archiveMutation.error instanceof Error
                  ? archiveMutation.error.message
                  : "Failed to archive company"}
              </span>
            )}
          </div>
        </div>
      </div>}
    </div>
  );
}

function HierarchySection({ companyId }: { companyId: string }) {
  const queryClient = useQueryClient();

  const { data: session } = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
    retry: false,
  });

  const { data: members } = useQuery({
    queryKey: queryKeys.access.members(companyId),
    queryFn: () => accessApi.listCompanyMembers(companyId),
    enabled: !!companyId,
  });

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(companyId),
    queryFn: () => agentsApi.list(companyId),
    enabled: !!companyId,
  });

  const { data: projects } = useQuery({
    queryKey: queryKeys.projects.list(companyId),
    queryFn: () => projectsApi.list(companyId),
    enabled: !!companyId,
  });

  const { data: company } = useQuery({
    queryKey: queryKeys.companies.detail(companyId),
    queryFn: () => companiesApi.get(companyId),
    enabled: !!companyId,
  });

  const companyMeta = (company as any)?.metadata ?? {};
  const projectAssignments: Record<string, string[]> = companyMeta.projectAssignments ?? {};

  const currentUserId = session?.user?.id ?? null;
  const { hasPermission: hasHierarchyPermission } = useMyPermissions();
  const isFullAccess = hasHierarchyPermission("dashboard:view_full");

  // For subordinate scoping: members only see themselves + their direct/indirect reports
  const { data: subordinates } = useQuery({
    queryKey: queryKeys.access.mySubordinates(companyId),
    queryFn: () => accessApi.getMySubordinates(companyId),
    enabled: !!companyId && !isFullAccess,
  });

  const allHumans = (members ?? []).filter(
    (m: CompanyMember) => m.principalType === "user" && m.status === "active",
  );
  const allActiveAgents = (agents ?? []).filter((a) => a.status !== "terminated");

  // Owners see everything; members see only themselves + subordinates
  const humanMembers = isFullAccess
    ? allHumans
    : allHumans.filter((m: CompanyMember) => {
        if (m.principalId === currentUserId) return true; // always see yourself
        if (m.membershipRole === "admin" || m.membershipRole === "owner") return false; // never show admins to non-full-access users
        if (subordinates?.isTopLevel) return true;
        return subordinates?.userIds.includes(m.principalId) ?? false;
      });

  const activeAgents = isFullAccess
    ? allActiveAgents
    : allActiveAgents.filter((a) => {
        if (subordinates?.isTopLevel) return true;
        return subordinates?.agentIds.includes(a.id) ?? false;
      });

  const activeProjects = (projects ?? []).filter((p: any) => !p.archivedAt);

  const allEntities = [
    ...humanMembers.map((m) => ({
      key: `user:${m.principalId}`,
      name: m.userName ?? "User",
      type: "human" as const,
      id: m.principalId,
      memberId: m.id,
    })),
    ...activeAgents.map((a) => ({
      key: `agent:${a.id}`,
      name: a.name,
      type: "agent" as const,
      id: a.id,
      memberId: null as string | null,
    })),
  ];

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.access.members(companyId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(companyId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.org(companyId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.companies.detail(companyId) });
  };

  const assignAgentMutation = useMutation({
    mutationFn: ({
      agentId,
      parentUserId,
      parentAgentId,
    }: {
      agentId: string;
      parentUserId: string | null;
      parentAgentId: string | null;
    }) =>
      agentsApi.update(agentId, {
        reportsToUserId: parentUserId,
        reportsTo: parentAgentId,
      }),
    onSuccess: invalidateAll,
  });

  const assignHumanMutation = useMutation({
    mutationFn: ({
      memberId,
      parentUserId,
      parentAgentId,
    }: {
      memberId: string;
      parentUserId: string | null;
      parentAgentId: string | null;
    }) =>
      accessApi.updateMemberHierarchy(companyId, memberId, {
        reportsToUserId: parentUserId,
        reportsToAgentId: parentAgentId,
      }),
    onSuccess: invalidateAll,
  });

  const saveProjectAssignments = useMutation({
    mutationFn: (nextAssignments: Record<string, string[]>) =>
      companiesApi.update(companyId, {
        metadata: { ...companyMeta, projectAssignments: nextAssignments },
      } as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.detail(companyId) });
    },
  });

  function toggleProjectAssignment(entityKey: string, projectId: string) {
    const current = projectAssignments[entityKey] ?? [];
    const next = current.includes(projectId)
      ? current.filter((id) => id !== projectId)
      : [...current, projectId];
    saveProjectAssignments.mutate({ ...projectAssignments, [entityKey]: next });
  }

  if (allEntities.length < 2) return null;

  return (
    <div className="space-y-4">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Hierarchy & Project Assignments
      </div>
      <div className="space-y-3">
        {allEntities.map((entity) => {
          // Determine current parent
          let currentParentKey: string | null = null;
          if (entity.type === "agent") {
            const agent = activeAgents.find((a) => a.id === entity.id);
            if (agent) {
              if ((agent as any).reportsToUserId)
                currentParentKey = `user:${(agent as any).reportsToUserId}`;
              else if (agent.reportsTo) currentParentKey = `agent:${agent.reportsTo}`;
            }
          } else {
            const member = humanMembers.find((m) => m.principalId === entity.id);
            if (member) {
              if (member.reportsToUserId) currentParentKey = `user:${member.reportsToUserId}`;
              else if (member.reportsToAgentId)
                currentParentKey = `agent:${member.reportsToAgentId}`;
            }
          }

          const parentEntity = allEntities.find((e) => e.key === currentParentKey);
          const assignedProjectIds = projectAssignments[entity.key] ?? [];

          return (
            <HierarchyNodeCard
              key={entity.key}
              entity={entity}
              parentEntity={parentEntity ?? null}
              allEntities={allEntities}
              assignedProjectIds={assignedProjectIds}
              activeProjects={activeProjects}
              onAssignParent={(parentKey) => {
                const parentUserId = parentKey?.startsWith("user:") ? parentKey.slice(5) : null;
                const parentAgentId = parentKey?.startsWith("agent:") ? parentKey.slice(6) : null;

                if (entity.type === "agent") {
                  assignAgentMutation.mutate({
                    agentId: entity.id,
                    parentUserId,
                    parentAgentId,
                  });
                } else if (entity.memberId) {
                  assignHumanMutation.mutate({
                    memberId: entity.memberId,
                    parentUserId,
                    parentAgentId,
                  });
                }
              }}
              onToggleProject={(projectId) => toggleProjectAssignment(entity.key, projectId)}
            />
          );
        })}
      </div>
    </div>
  );
}

function HierarchyNodeCard({
  entity,
  parentEntity,
  allEntities,
  assignedProjectIds,
  activeProjects,
  onAssignParent,
  onToggleProject,
}: {
  entity: { key: string; name: string; type: "human" | "agent"; id: string };
  parentEntity: { key: string; name: string; type: "human" | "agent" } | null;
  allEntities: { key: string; name: string; type: "human" | "agent" }[];
  assignedProjectIds: string[];
  activeProjects: any[];
  onAssignParent: (parentKey: string | null) => void;
  onToggleProject: (projectId: string) => void;
}) {
  const [parentOpen, setParentOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);

  const Icon = entity.type === "human" ? User : Bot;

  return (
    <div className="rounded-md border border-border overflow-visible">
      {/* Header */}
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div
          className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
            entity.type === "human" ? "bg-primary/10" : "bg-muted/60"
          }`}
        >
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{entity.name}</p>
          <p className="text-[10px] text-muted-foreground uppercase">
            {entity.type === "human" ? "Human" : "Agent"}
          </p>
        </div>
        <div className="relative">
          <button
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors rounded px-2 py-1 hover:bg-accent/50"
            onClick={() => {
              setParentOpen(!parentOpen);
              setProjectsOpen(false);
            }}
          >
            {parentEntity ? (
              <>
                Reports to: <span className="font-medium text-foreground">{parentEntity.name}</span>
              </>
            ) : (
              "Top level"
            )}
            <ChevronDown className="h-3 w-3" />
          </button>
          {parentOpen && (
            <div className="absolute right-0 top-full mt-1 z-10 w-56 rounded-md border border-border bg-popover shadow-lg py-1 max-h-48 overflow-y-auto">
              <button
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-accent/50 transition-colors ${
                  !parentEntity ? "bg-accent/30 font-medium" : ""
                }`}
                onClick={() => {
                  onAssignParent(null);
                  setParentOpen(false);
                }}
              >
                None (top level)
              </button>
              {allEntities
                .filter((e) => e.key !== entity.key)
                .map((e) => (
                  <button
                    key={e.key}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-accent/50 transition-colors flex items-center gap-2 ${
                      parentEntity?.key === e.key ? "bg-accent/30 font-medium" : ""
                    }`}
                    onClick={() => {
                      onAssignParent(e.key);
                      setParentOpen(false);
                    }}
                  >
                    {e.type === "human" ? (
                      <User className="h-3 w-3 shrink-0" />
                    ) : (
                      <Bot className="h-3 w-3 shrink-0" />
                    )}
                    {e.name}
                    {parentEntity?.key === e.key && (
                      <Check className="h-3 w-3 ml-auto text-primary" />
                    )}
                  </button>
                ))}
            </div>
          )}
        </div>
      </div>

      {/* Project assignments */}
      <div className="px-3 py-2 border-t border-border flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground shrink-0">Projects:</span>
        {assignedProjectIds.length > 0 ? (
          assignedProjectIds.map((pid) => {
            const proj = activeProjects.find((p: any) => p.id === pid);
            if (!proj) return null;
            return (
              <span
                key={pid}
                className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px]"
              >
                <span
                  className="h-2 w-2 rounded-sm shrink-0"
                  style={{ backgroundColor: proj.color ?? "#6366f1" }}
                />
                {proj.name}
                <button
                  className="hover:text-destructive"
                  onClick={() => onToggleProject(pid)}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            );
          })
        ) : (
          <span className="text-xs text-muted-foreground/50">None</span>
        )}
        <div className="relative">
          <button
            className="inline-flex items-center gap-1 rounded-md border border-dashed border-muted-foreground/40 px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent/50 transition-colors"
            onClick={() => {
              setProjectsOpen(!projectsOpen);
              setParentOpen(false);
            }}
          >
            <Plus className="h-2.5 w-2.5" /> Assign
          </button>
          {projectsOpen && (
            <div className="absolute left-0 top-full mt-1 z-10 w-48 rounded-md border border-border bg-popover shadow-lg py-1 max-h-48 overflow-y-auto">
              {activeProjects.length > 0 ? (
                activeProjects.map((p: any) => {
                  const assigned = assignedProjectIds.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      className={`w-full text-left px-3 py-1.5 text-xs hover:bg-accent/50 transition-colors flex items-center gap-2 ${
                        assigned ? "bg-accent/30" : ""
                      }`}
                      onClick={() => {
                        onToggleProject(p.id);
                      }}
                    >
                      <span
                        className="h-2 w-2 rounded-sm shrink-0"
                        style={{ backgroundColor: p.color ?? "#6366f1" }}
                      />
                      {p.name}
                      {assigned && <Check className="h-3 w-3 ml-auto text-primary" />}
                    </button>
                  );
                })
              ) : (
                <p className="text-xs text-muted-foreground px-3 py-2">No projects</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function buildAgentSnippet(input: AgentSnippetInput) {
  const candidateUrls = buildCandidateOnboardingUrls(input);
  const resolutionTestUrl = buildResolutionTestUrl(input);

  const candidateList =
    candidateUrls.length > 0
      ? candidateUrls.map((u) => `- ${u}`).join("\n")
      : "- (No candidate URLs available yet.)";

  const connectivityBlock =
    candidateUrls.length === 0
      ? `No candidate URLs are available. Ask your user to configure a reachable hostname in Paperclip, then retry.
Suggested steps:
- choose a hostname that resolves to the Paperclip host from your runtime
- run: pnpm paperclipai allowed-hostname <host>
- restart Paperclip
- verify with: curl -fsS http://<host>:3100/api/health
- regenerate this invite snippet`
      : `If none are reachable, ask your user to add a reachable hostname in Paperclip, restart, and retry.
Suggested command:
- pnpm paperclipai allowed-hostname <host>
Then verify with: curl -fsS <base-url>/api/health`;

  const resolutionLine = resolutionTestUrl
    ? `\nYou MUST test Paperclip-to-gateway reachability, call: ${resolutionTestUrl}?url=<urlencoded-gateway-url> (using the hostname that worked above). Do not assume your 172.x is necessarily reachable from Paperclip. Test it. `
    : "";

  return `You're invited to join a Paperclip organization.

The URLs you should try are:
${candidateList}

Connectivity guidance:
If you are running on a different machine than Paperclip, Paperclip must be reachable at one of the hostnames used above.
Verify the hostname works from your runtime with: GET <base-url>/api/health

${connectivityBlock}

For your "agentName", just use your own agent name (OpenClaw or whatever your name is) and send it directly.
You also need to send a gateway URL that Paperclip can access. Check your config and include that URL.${resolutionLine}

---

This onboarding flow is for OpenClaw Gateway.
When you submit the join request, use:
- \`adapterType: "openclaw_gateway"\`
- \`agentDefaultsPayload.url\` as your \`ws://\` or \`wss://\` gateway URL
- \`agentDefaultsPayload.headers["x-openclaw-token"]\` with your gateway token
- (legacy accepted) \`agentDefaultsPayload.headers["x-openclaw-auth"]\`
- Keep device auth enabled (recommended). If \`devicePrivateKeyPem\` is omitted, Paperclip will generate and persist one during join so pairing approvals remain stable.
- Only use \`disableDeviceAuth=true\` for special environments where pairing cannot be completed.

Do NOT use \`/v1/responses\` or \`/hooks/*\` in this join flow.

Before you do anything, please respond to your user that you understand the instructions and you're going to work on them. Then do the step above in another session called "paperclip-onboarding" and then tell your user when you're done. Update your user in intermediate steps along the way so they know what's going on.

Then after you've connected to Paperclip (exchanged keys etc.) you MUST review and follow the onboarding instructions in onboarding.txt they give you.

`;
}

function buildCandidateOnboardingUrls(input: AgentSnippetInput): string[] {
  const candidates = (input.connectionCandidates ?? [])
    .map((candidate) => candidate.trim())
    .filter(Boolean);
  const urls = new Set<string>();
  let onboardingUrl: URL | null = null;

  try {
    onboardingUrl = new URL(input.onboardingTextUrl);
    urls.add(onboardingUrl.toString());
  } catch {
    const trimmed = input.onboardingTextUrl.trim();
    if (trimmed) {
      urls.add(trimmed);
    }
  }

  if (!onboardingUrl) {
    for (const candidate of candidates) {
      urls.add(candidate);
    }
    return Array.from(urls);
  }

  const onboardingPath = `${onboardingUrl.pathname}${onboardingUrl.search}`;
  for (const candidate of candidates) {
    try {
      const base = new URL(candidate);
      urls.add(`${base.origin}${onboardingPath}`);
    } catch {
      urls.add(candidate);
    }
  }

  return Array.from(urls);
}

function buildResolutionTestUrl(input: AgentSnippetInput): string | null {
  const explicit = input.testResolutionUrl?.trim();
  if (explicit) return explicit;

  try {
    const onboardingUrl = new URL(input.onboardingTextUrl);
    const testPath = onboardingUrl.pathname.replace(
      /\/onboarding\.txt$/,
      "/test-resolution"
    );
    return `${onboardingUrl.origin}${testPath}`;
  } catch {
    return null;
  }
}
