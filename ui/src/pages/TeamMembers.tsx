import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { companiesApi, type TransferTarget } from "../api/companies";
import { accessApi, type CompanyMember } from "../api/access";
import { authApi } from "../api/auth";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { Users, Trash2, Link2, Check, ShieldAlert } from "lucide-react";

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

// ─── Copy invite code button ─────────────────────────────────────────────────

function CopyInviteButton({ companyId }: { companyId: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inviteMutation = useMutation({
    mutationFn: () => accessApi.createCompanyInvite(companyId, { allowedJoinTypes: "human" }),
    onSuccess: async (data) => {
      try {
        // Copy just the token (invite code) for sharing
        await navigator.clipboard.writeText(data.token);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      } catch {
        setError(data.token);
      }
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to generate invite");
    },
  });

  if (error && !error.startsWith("Failed")) {
    return (
      <div className="mt-1 text-xs text-muted-foreground break-all">
        <span className="font-medium">Invite code:</span> <code>{error}</code>
        <button className="ml-1 underline" onClick={() => setError(null)}>dismiss</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs gap-1.5"
        disabled={inviteMutation.isPending}
        onClick={() => { setError(null); inviteMutation.mutate(); }}
      >
        {copied ? (
          <><Check className="h-3 w-3 text-green-500" /> Copied!</>
        ) : (
          <><Link2 className="h-3 w-3" /> Copy invite code</>
        )}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

// ─── Transfer Ownership dialog ───────────────────────────────────────────────

function TransferOwnershipDialog({
  companyId,
  targets,
  onClose,
}: {
  companyId: string;
  targets: TransferTarget[];
  onClose: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string>("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => companiesApi.transferOwnership(companyId, selectedId),
    onSuccess: async () => {
      await authApi.signOut();
      window.location.href = "/auth";
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Transfer failed"),
  });

  const selected = targets.find((t) => t.id === selectedId);

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <div className="flex items-center gap-2 mb-1">
          <ShieldAlert className="h-4 w-4 text-destructive shrink-0" />
          <h2 className="text-base font-semibold">Transfer ownership</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          This permanently transfers admin ownership to another user.{" "}
          <span className="font-medium text-foreground">You will be signed out immediately</span> and lose owner privileges.
        </p>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Transfer to</label>
            {targets.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                No other board members found. Add another admin first.
              </p>
            ) : (
              <div className="rounded-md border border-input overflow-hidden">
                {targets.map((t) => (
                  <label
                    key={t.id}
                    className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/50 border-b border-border last:border-0 ${selectedId === t.id ? "bg-primary/5" : ""}`}
                  >
                    <input type="radio" name="transfer-target" className="accent-primary shrink-0" checked={selectedId === t.id} onChange={() => setSelectedId(t.id)} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{t.name ?? t.email}</p>
                      {t.name && <p className="text-xs text-muted-foreground truncate">{t.email}</p>}
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
          {selected && (
            <label className="flex items-start gap-2.5 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2.5 cursor-pointer">
              <input type="checkbox" className="accent-destructive mt-0.5 shrink-0" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              <p className="text-sm">
                I understand that <span className="font-medium">{selected.name ?? selected.email}</span> will become the new owner and I will be signed out.
              </p>
            </label>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
            <Button variant="destructive" disabled={!selectedId || !confirmed || mutation.isPending || targets.length === 0} onClick={() => mutation.mutate()}>
              {mutation.isPending ? "Transferring…" : "Transfer ownership"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function TeamMembers() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const [transferOpen, setTransferOpen] = useState(false);

  useEffect(() => {
    setBreadcrumbs([{ label: "Team Members" }]);
  }, [setBreadcrumbs]);

  const { data: session } = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
    retry: false,
  });

  // Use the unified members API (company_memberships)
  const { data: allMembers, isLoading, error } = useQuery({
    queryKey: queryKeys.access.members(selectedCompanyId!),
    queryFn: () => accessApi.listCompanyMembers(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  // Transfer targets — only succeeds if current user is owner
  const { data: transferTargets } = useQuery({
    queryKey: ["transfer-targets", selectedCompanyId],
    queryFn: () => companiesApi.transferTargets(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    retry: false,
  });

  // Filter to human members only, exclude suspended
  const humanMembers = (allMembers ?? []).filter(
    (m) => m.principalType === "user" && m.status !== "suspended",
  );

  const currentUserId = session?.user.id ?? null;
  const isOwner = transferTargets !== undefined;

  function handleSuccess() {
    void queryClient.invalidateQueries({ queryKey: queryKeys.access.members(selectedCompanyId!) });
  }

  if (isLoading) return <PageSkeleton />;
  if (error) {
    return (
      <div className="p-6 text-sm text-destructive">
        {error instanceof Error ? error.message : "Failed to load team members"}
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Team Members</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage who has access to your organization. Use the Org Chart to set reporting relationships.
          </p>
        </div>
        <CopyInviteButton companyId={selectedCompanyId!} />
      </div>

      {/* Empty state */}
      {humanMembers.length === 0 && (
        <EmptyState
          icon={Users}
          message="No team members yet. Generate an invite code and share it."
        />
      )}

      {/* Member list */}
      {humanMembers.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Member</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Role</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {humanMembers.map((member) => {
                const isSelf = currentUserId !== null && member.principalId === currentUserId;
                return (
                  <tr key={member.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-xs font-medium text-primary">
                          {(member.userName ?? member.userEmail ?? "?")[0]?.toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {member.userName ?? member.userEmail ?? "Pending"}
                            {isSelf && <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>}
                          </p>
                          {member.userName && member.userEmail && (
                            <p className="text-xs text-muted-foreground truncate">{member.userEmail}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={member.status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {member.membershipRole === "owner" ? (
                        <span className="font-medium text-foreground">Owner</span>
                      ) : (
                        member.membershipRole ?? "member"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        {!isSelf && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            title="Remove member"
                            onClick={() => {
                              if (confirm(`Remove ${member.userName ?? member.userEmail}?`)) {
                                // Use the legacy revoke for now — finds grant by email
                                // TODO: switch to unified member removal
                                if (member.userEmail) {
                                  // For now, just invalidate
                                  handleSuccess();
                                }
                              }
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Danger zone — only shown to the company owner */}
      {isOwner && (
        <div className="mt-10 rounded-lg border border-destructive/40 p-4">
          <h2 className="text-sm font-semibold text-destructive mb-1">Danger zone</h2>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Transfer ownership</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Hand over admin control to another board member. You will be signed out immediately.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 border-destructive/40 text-destructive hover:bg-destructive/5 hover:text-destructive"
              onClick={() => setTransferOpen(true)}
            >
              <ShieldAlert className="h-3.5 w-3.5 mr-1.5" />
              Transfer ownership
            </Button>
          </div>
        </div>
      )}

      {/* Transfer ownership dialog */}
      {transferOpen && (
        <TransferOwnershipDialog
          companyId={selectedCompanyId!}
          targets={transferTargets ?? []}
          onClose={() => setTransferOpen(false)}
        />
      )}
    </div>
  );
}
