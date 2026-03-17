import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { teamMembersApi } from "../api/teamMembers";
import { agentsApi } from "../api/agents";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { Users, Plus, Pencil, Trash2, ChevronDown } from "lucide-react";
import type { TeamMember } from "@paperclipai/shared";
import type { Agent } from "@paperclipai/shared";
import { useEffect } from "react";

// ─── Status badge ────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  const classes =
    status === "active"
      ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
      : status === "pending"
        ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
        : "bg-muted text-muted-foreground";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${classes}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

// ─── Add / Edit dialog ────────────────────────────────────────────────────────

interface MemberDialogProps {
  open: boolean;
  onClose: () => void;
  editing: TeamMember | null;
  agents: Agent[];
  companyId: string;
  onSuccess: () => void;
}

function MemberDialog({ open, onClose, editing, agents, companyId, onSuccess }: MemberDialogProps) {
  const [email, setEmail] = useState("");
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [agentPickerOpen, setAgentPickerOpen] = useState(false);

  // Sync state when dialog opens
  useEffect(() => {
    if (open) {
      setEmail(editing?.grant.email ?? "");
      setSelectedAgentIds(editing?.agentIds ?? []);
      setError(null);
    }
  }, [open, editing]);

  const createMutation = useMutation({
    mutationFn: (data: { email: string; agentIds: string[] }) =>
      teamMembersApi.create(companyId, data),
    onSuccess: () => { onSuccess(); onClose(); },
    onError: (err) => setError(err instanceof Error ? err.message : "Failed to add member"),
  });

  const updateMutation = useMutation({
    mutationFn: (data: { agentIds: string[] }) =>
      teamMembersApi.update(companyId, editing!.grant.id, data),
    onSuccess: () => { onSuccess(); onClose(); },
    onError: (err) => setError(err instanceof Error ? err.message : "Failed to update member"),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (selectedAgentIds.length === 0) {
      setError("Select at least one agent");
      return;
    }
    if (editing) {
      updateMutation.mutate({ agentIds: selectedAgentIds });
    } else {
      createMutation.mutate({ email: email.trim(), agentIds: selectedAgentIds });
    }
  }

  function toggleAgent(id: string) {
    setSelectedAgentIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  const isBusy = createMutation.isPending || updateMutation.isPending;
  const visibleAgents = agents.filter((a) => a.status !== "terminated");

  const selectedAgentNames = visibleAgents
    .filter((a) => selectedAgentIds.includes(a.id))
    .map((a) => a.name);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <h2 className="text-base font-semibold mb-4">
          {editing ? "Edit team member access" : "Add team member"}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email */}
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="tm-email">
              Email address
            </label>
            <input
              id="tm-email"
              type="email"
              required
              disabled={!!editing || isBusy}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
            />
          </div>

          {/* Agent picker */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Accessible agents
            </label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setAgentPickerOpen((v) => !v)}
                disabled={isBusy}
                className="w-full flex items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm text-left focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
              >
                <span className="truncate text-muted-foreground">
                  {selectedAgentNames.length === 0
                    ? "Select agents…"
                    : selectedAgentNames.join(", ")}
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
              {agentPickerOpen && (
                <div className="absolute z-10 mt-1 w-full rounded-md border border-border bg-popover shadow-md max-h-48 overflow-y-auto">
                  {visibleAgents.length === 0 && (
                    <div className="px-3 py-2 text-sm text-muted-foreground">No agents available</div>
                  )}
                  {visibleAgents.map((agent) => (
                    <label
                      key={agent.id}
                      className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/50"
                    >
                      <input
                        type="checkbox"
                        checked={selectedAgentIds.includes(agent.id)}
                        onChange={() => toggleAgent(agent.id)}
                        className="accent-primary"
                      />
                      <span className="font-medium">{agent.name}</span>
                      {agent.title && (
                        <span className="text-muted-foreground text-xs truncate">{agent.title}</span>
                      )}
                    </label>
                  ))}
                </div>
              )}
            </div>
            {selectedAgentIds.length > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                {selectedAgentIds.length} agent{selectedAgentIds.length !== 1 ? "s" : ""} selected (plus their entire sub-tree)
              </p>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isBusy}>
              Cancel
            </Button>
            <Button type="submit" disabled={isBusy}>
              {isBusy ? "Saving…" : editing ? "Save changes" : "Add member"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function TeamMembers() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);

  useEffect(() => {
    setBreadcrumbs([{ label: "Team Members" }]);
  }, [setBreadcrumbs]);

  const { data: members, isLoading, error } = useQuery({
    queryKey: queryKeys.teamMembers.list(selectedCompanyId!),
    queryFn: () => teamMembersApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const revokeMutation = useMutation({
    mutationFn: (grantId: string) => teamMembersApi.revoke(selectedCompanyId!, grantId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.teamMembers.list(selectedCompanyId!) });
    },
  });

  function openAdd() {
    setEditingMember(null);
    setDialogOpen(true);
  }

  function openEdit(member: TeamMember) {
    setEditingMember(member);
    setDialogOpen(true);
  }

  function handleSuccess() {
    void queryClient.invalidateQueries({ queryKey: queryKeys.teamMembers.list(selectedCompanyId!) });
  }

  if (isLoading) return <PageSkeleton />;
  if (error) {
    return (
      <div className="p-6 text-sm text-destructive">
        {error instanceof Error ? error.message : "Failed to load team members"}
      </div>
    );
  }

  const activeMembers = (members ?? []).filter((m) => m.grant.status !== "revoked");

  return (
    <div className="p-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Team Members</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Grant colleagues access to specific agents and their entire sub-tree.
          </p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="h-4 w-4 mr-1.5" />
          Add member
        </Button>
      </div>

      {/* Empty state */}
      {activeMembers.length === 0 && (
        <EmptyState
          icon={Users}
          message="No team members yet. Add someone to give them scoped access."
          action="Add member"
          onAction={openAdd}
        />
      )}

      {/* Member list */}
      {activeMembers.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Email</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Accessible agents</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {activeMembers.map((member) => (
                <tr key={member.grant.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-3 font-medium">
                    {member.grant.email}
                    {member.user?.name && (
                      <span className="ml-1.5 text-xs text-muted-foreground">({member.user.name})</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={member.grant.status} />
                  </td>
                  <td className="px-4 py-3">
                    {member.scopeAgents.length === 0 ? (
                      <span className="text-muted-foreground italic text-xs">None</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {member.scopeAgents.map((agent) => (
                          <span
                            key={agent.id}
                            className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-xs"
                          >
                            {agent.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        title="Edit access"
                        onClick={() => openEdit(member)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        title="Revoke access"
                        disabled={revokeMutation.isPending}
                        onClick={() => {
                          if (confirm(`Revoke access for ${member.grant.email}?`)) {
                            revokeMutation.mutate(member.grant.id);
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit dialog */}
      <MemberDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        editing={editingMember}
        agents={agents ?? []}
        companyId={selectedCompanyId!}
        onSuccess={handleSuccess}
      />
    </div>
  );
}
