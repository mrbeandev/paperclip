import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@/lib/router";
import { accessApi } from "../api/access";
import { authApi } from "../api/auth";
import { healthApi } from "../api/health";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import { AGENT_ADAPTER_TYPES } from "@paperclipai/shared";
import type { AgentAdapterType, JoinRequest } from "@paperclipai/shared";

type JoinType = "human" | "agent";
const joinAdapterOptions: AgentAdapterType[] = [...AGENT_ADAPTER_TYPES];

const adapterLabels: Record<string, string> = {
  claude_local: "Claude (local)",
  codex_local: "Codex (local)",
  gemini_local: "Gemini CLI (local)",
  opencode_local: "OpenCode (local)",
  openclaw_gateway: "OpenClaw Gateway",
  cursor: "Cursor (local)",
  process: "Process",
  http: "HTTP",
};

const ENABLED_INVITE_ADAPTERS = new Set(["claude_local", "codex_local", "gemini_local", "opencode_local", "cursor"]);

function readNestedString(value: unknown, path: string[]): string | null {
  let current: unknown = value;
  for (const segment of path) {
    if (!current || typeof current !== "object") return null;
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === "string" && current.trim().length > 0 ? current : null;
}

export function InviteLandingPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const params = useParams();
  const token = (params.token ?? "").trim();
  const [joinType, setJoinType] = useState<JoinType>("human");
  const [agentName, setAgentName] = useState("");
  const [adapterType, setAdapterType] = useState<AgentAdapterType>("claude_local");
  const [capabilities, setCapabilities] = useState("");
  const [result, setResult] = useState<{ kind: "bootstrap" | "join"; payload: unknown } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const healthQuery = useQuery({
    queryKey: queryKeys.health,
    queryFn: () => healthApi.get(),
    retry: false,
  });
  const sessionQuery = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
    retry: false,
  });
  const inviteQuery = useQuery({
    queryKey: queryKeys.access.invite(token),
    queryFn: () => accessApi.getInvite(token),
    enabled: token.length > 0,
    retry: false,
  });

  const invite = inviteQuery.data;
  const isBootstrap = invite?.inviteType === "bootstrap_ceo";
  const isAgentOnly = invite?.allowedJoinTypes === "agent";
  const session = sessionQuery.data;

  // Sync joinType default when invite loads (agent-only invites)
  useEffect(() => {
    if (invite?.allowedJoinTypes === "agent") setJoinType("agent");
  }, [invite?.allowedJoinTypes]);

  // For human-only invites with no existing session: redirect to /auth?invite={token}
  useEffect(() => {
    if (
      !inviteQuery.isLoading &&
      !sessionQuery.isLoading &&
      invite &&
      !isBootstrap &&
      !isAgentOnly &&
      !session
    ) {
      navigate(`/auth?invite=${encodeURIComponent(token)}`, { replace: true });
    }
  }, [invite, isBootstrap, isAgentOnly, session, inviteQuery.isLoading, sessionQuery.isLoading, token, navigate]);

  const acceptMutation = useMutation({
    mutationFn: async (joinType: JoinType) => {
      if (!invite) throw new Error("Invite not found");
      if (isBootstrap || joinType === "human") {
        return accessApi.acceptInvite(token, { requestType: "human" });
      }
      return accessApi.acceptInvite(token, {
        requestType: "agent",
        agentName: agentName.trim(),
        adapterType,
        capabilities: capabilities.trim() || null,
      });
    },
    onSuccess: async (payload) => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.auth.session });
      await queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
      const asBootstrap =
        payload && typeof payload === "object" && "bootstrapAccepted" in (payload as Record<string, unknown>);
      if (asBootstrap) {
        setResult({ kind: "bootstrap", payload });
      } else if (isBootstrap) {
        setResult({ kind: "bootstrap", payload });
      } else {
        setResult({ kind: "join", payload });
      }
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to accept invite");
    },
  });

  if (!token) {
    return <div className="mx-auto max-w-xl py-10 text-sm text-destructive">Invalid invite token.</div>;
  }

  if (inviteQuery.isLoading || healthQuery.isLoading || sessionQuery.isLoading) {
    return <div className="mx-auto max-w-xl py-10 text-sm text-muted-foreground">Loading…</div>;
  }

  if (inviteQuery.error || !invite) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 shadow-sm">
          <h1 className="text-lg font-semibold">Invite not available</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This invite may be expired, revoked, or already used.
          </p>
        </div>
      </div>
    );
  }

  // For human invites while not signed in — redirect is handled by useEffect above,
  // show loading briefly while redirect happens
  if (!isBootstrap && !isAgentOnly && !session) {
    return <div className="min-h-screen flex items-center justify-center p-4">
      <p className="text-sm text-muted-foreground">Redirecting…</p>
    </div>;
  }

  if (result?.kind === "bootstrap") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 shadow-sm">
          <h1 className="text-lg font-semibold">Bootstrap complete</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The first instance admin is now configured. You can continue to the board.
          </p>
          <Button asChild className="mt-4 w-full">
            <Link to="/">Open board</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (result?.kind === "join") {
    const payload = result.payload as JoinRequest & {
      claimSecret?: string;
      claimApiKeyPath?: string;
      onboarding?: Record<string, unknown>;
      diagnostics?: Array<{
        code: string;
        level: "info" | "warn";
        message: string;
        hint?: string;
      }>;
    };
    const claimSecret = typeof payload.claimSecret === "string" ? payload.claimSecret : null;
    const claimApiKeyPath = typeof payload.claimApiKeyPath === "string" ? payload.claimApiKeyPath : null;
    const onboardingSkillUrl = readNestedString(payload.onboarding, ["skill", "url"]);
    const onboardingSkillPath = readNestedString(payload.onboarding, ["skill", "path"]);
    const onboardingInstallPath = readNestedString(payload.onboarding, ["skill", "installPath"]);
    const onboardingTextUrl = readNestedString(payload.onboarding, ["textInstructions", "url"]);
    const onboardingTextPath = readNestedString(payload.onboarding, ["textInstructions", "path"]);
    const diagnostics = Array.isArray(payload.diagnostics) ? payload.diagnostics : [];
    return (
      <div className="mx-auto max-w-xl py-10">
        <div className="rounded-lg border border-border bg-card p-6">
          <h1 className="text-lg font-semibold">Join request submitted</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your request is pending admin approval.
          </p>
          <div className="mt-4 rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            Request ID: <span className="font-mono">{payload.id}</span>
          </div>
          {claimSecret && claimApiKeyPath && (
            <div className="mt-3 space-y-1 rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">One-time claim secret (save now)</p>
              <p className="font-mono break-all">{claimSecret}</p>
              <p className="font-mono break-all">POST {claimApiKeyPath}</p>
            </div>
          )}
          {(onboardingSkillUrl || onboardingSkillPath || onboardingInstallPath) && (
            <div className="mt-3 space-y-1 rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Paperclip skill bootstrap</p>
              {onboardingSkillUrl && <p className="font-mono break-all">GET {onboardingSkillUrl}</p>}
              {!onboardingSkillUrl && onboardingSkillPath && <p className="font-mono break-all">GET {onboardingSkillPath}</p>}
              {onboardingInstallPath && <p className="font-mono break-all">Install to {onboardingInstallPath}</p>}
            </div>
          )}
          {(onboardingTextUrl || onboardingTextPath) && (
            <div className="mt-3 space-y-1 rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Agent-readable onboarding text</p>
              {onboardingTextUrl && <p className="font-mono break-all">GET {onboardingTextUrl}</p>}
              {!onboardingTextUrl && onboardingTextPath && <p className="font-mono break-all">GET {onboardingTextPath}</p>}
            </div>
          )}
          {diagnostics.length > 0 && (
            <div className="mt-3 space-y-1 rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Connectivity diagnostics</p>
              {diagnostics.map((diag, idx) => (
                <div key={`${diag.code}:${idx}`} className="space-y-0.5">
                  <p className={diag.level === "warn" ? "text-amber-600 dark:text-amber-400" : undefined}>
                    [{diag.level}] {diag.message}
                  </p>
                  {diag.hint && <p className="font-mono break-all">{diag.hint}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Bootstrap invite — no session required in local mode, but show sign-in prompt otherwise
  if (isBootstrap) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 shadow-sm space-y-5">
          <div>
            <h1 className="text-lg font-semibold">Bootstrap your instance</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Set up the first admin account for this Paperclip instance.
            </p>
          </div>
          {!session && healthQuery.data?.deploymentMode === "authenticated" && (
            <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
              You need to be signed in to accept this bootstrap invite.{" "}
              <Link
                to={`/auth?next=${encodeURIComponent(`/invite/${token}`)}`}
                className="font-medium text-foreground underline underline-offset-2"
              >
                Sign in
              </Link>
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            className="w-full"
            disabled={acceptMutation.isPending}
            onClick={() => acceptMutation.mutate("human")}
          >
            {acceptMutation.isPending ? "Accepting…" : "Accept bootstrap invite"}
          </Button>
        </div>
      </div>
    );
  }

  // Agent-only invite (or "both" with signed-in user choosing agent)
  const showHumanOption = invite.allowedJoinTypes !== "agent" && !!session;

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="rounded-xl border border-border bg-card p-8 shadow-sm space-y-5">
          <div>
            <h1 className="text-lg font-semibold">You've been invited</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Join this Paperclip workspace as an agent.
            </p>
          </div>

          {/* Join type tabs — only shown when both options are available */}
          {showHumanOption && (
            <div className="flex rounded-lg border border-border overflow-hidden text-sm">
              {(["human", "agent"] as JoinType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setJoinType(type)}
                  className={`flex-1 py-2 font-medium transition-colors ${
                    joinType === type
                      ? "bg-foreground text-background"
                      : "bg-background text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {type === "human" ? "Join as member" : "Join as agent"}
                </button>
              ))}
            </div>
          )}

          {/* Signed-in user info for human join */}
          {joinType === "human" && session && (
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 flex items-center gap-2 text-sm">
              <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center shrink-0 text-xs font-medium text-primary">
                {(session.user.name ?? session.user.email ?? "?")[0]?.toUpperCase()}
              </div>
              <span className="text-muted-foreground truncate">
                Joining as <span className="font-medium text-foreground">{session.user.name ?? session.user.email}</span>
              </span>
            </div>
          )}

          {/* Agent form */}
          {joinType === "agent" && (
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="mb-1.5 block font-medium">Agent name</span>
                <input
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="e.g. My Claude Agent"
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1.5 block font-medium">Adapter type</span>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={adapterType}
                  onChange={(e) => setAdapterType(e.target.value as AgentAdapterType)}
                >
                  {joinAdapterOptions.map((type) => (
                    <option key={type} value={type} disabled={!ENABLED_INVITE_ADAPTERS.has(type)}>
                      {adapterLabels[type]}{!ENABLED_INVITE_ADAPTERS.has(type) ? " (Coming soon)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1.5 block font-medium">
                  Capabilities <span className="font-normal text-muted-foreground">(optional)</span>
                </span>
                <textarea
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  rows={3}
                  value={capabilities}
                  onChange={(e) => setCapabilities(e.target.value)}
                />
              </label>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button
            className="w-full"
            disabled={
              acceptMutation.isPending ||
              (joinType === "agent" && agentName.trim().length === 0)
            }
            onClick={() => acceptMutation.mutate(joinType)}
          >
            {acceptMutation.isPending
              ? "Accepting…"
              : joinType === "human"
                ? "Accept invite"
                : "Register agent"}
          </Button>
        </div>
      </div>
    </div>
  );
}
