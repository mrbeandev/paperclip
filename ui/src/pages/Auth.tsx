import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "@/lib/router";
import { authApi } from "../api/auth";
import { accessApi } from "../api/access";
import { healthApi } from "../api/health";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import { AsciiArtAnimation } from "@/components/AsciiArtAnimation";
import { Sparkles, Eye, EyeOff } from "lucide-react";

type AuthMode = "sign_in" | "sign_up" | "admin_setup";

export function AuthPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<AuthMode>("sign_in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const nextPath = useMemo(() => searchParams.get("next") || "/", [searchParams]);
  const inviteParam = useMemo(() => searchParams.get("invite") || "", [searchParams]);

  // Pre-fill invite code from URL param
  useEffect(() => {
    if (inviteParam) setInviteCode(inviteParam);
  }, [inviteParam]);

  const { data: session, isLoading: isSessionLoading } = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
    retry: false,
  });

  const { data: health } = useQuery({
    queryKey: queryKeys.health,
    queryFn: () => healthApi.get(),
    retry: false,
  });

  const bootstrapPending = health?.bootstrapStatus === "bootstrap_pending";

  // When bootstrap is pending, default to admin setup mode
  useEffect(() => {
    if (bootstrapPending && mode === "sign_in") {
      setMode("admin_setup");
    }
  }, [bootstrapPending, mode]);

  useEffect(() => {
    if (session) {
      navigate(nextPath, { replace: true });
    }
  }, [session, navigate, nextPath]);

  useEffect(() => {
    if (mode !== "sign_in") setError(null);
  }, [mode]);

  const signInMutation = useMutation({
    mutationFn: async () => {
      await authApi.signInEmail({ email: email.trim(), password });
    },
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.auth.session });
      await queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
      navigate(nextPath, { replace: true });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Sign in failed");
    },
  });

  const signUpMutation = useMutation({
    mutationFn: async () => {
      await authApi.signUpEmail({
        name: name.trim(),
        email: email.trim(),
        password,
      });
      // Accept invite code after account creation if provided
      const code = inviteCode.trim();
      if (code) {
        await accessApi.acceptInvite(code, { requestType: "human" });
      }
    },
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.auth.session });
      await queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
      navigate("/", { replace: true });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Sign up failed");
    },
  });

  // Admin setup mutation (bootstrap: sign up + self-promote to instance admin)
  const adminSetupMutation = useMutation({
    mutationFn: async () => {
      await authApi.signUpEmail({
        name: name.trim(),
        email: email.trim(),
        password,
      });
      // Self-promote to instance admin (only works when no admin exists)
      await accessApi.claimBootstrapAdmin();
    },
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.auth.session });
      await queryClient.invalidateQueries({ queryKey: queryKeys.health });
      await queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
      navigate("/", { replace: true });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Sign up failed");
    },
  });

  const canSignIn = email.trim().length > 0 && password.length >= 8;
  const canSignUp =
    name.trim().length > 0 &&
    email.trim().length > 0 &&
    password.length >= 8 &&
    inviteCode.trim().length > 0;
  const canAdminSetup =
    name.trim().length > 0 && email.trim().length > 0 && password.length >= 8;

  if (isSessionLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex bg-background">
      {/* Left half — form */}
      <div className="w-full md:w-1/2 flex flex-col overflow-y-auto">
        <div className="w-full max-w-md mx-auto my-auto px-8 py-12">
          <div className="flex items-center gap-2 mb-8">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Paperclip</span>
          </div>

          {/* Sign In */}
          {mode === "sign_in" && (
            <>
              <h1 className="text-xl font-semibold">Sign in to Paperclip</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Use your email and password to access this instance.
              </p>
              <form
                className="mt-6 space-y-4"
                onSubmit={(e) => { e.preventDefault(); signInMutation.mutate(); }}
              >
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Email</label>
                  <input
                    className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Password</label>
                  <div className="relative">
                  <input
                    className="w-full rounded-md border border-border bg-transparent px-3 py-2 pr-9 text-sm outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                  <button type="button" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" onClick={() => setShowPassword(!showPassword)} tabIndex={-1}>
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                  </div>
                </div>
                {error && <p className="text-xs text-destructive">{error}</p>}
                <Button type="submit" disabled={!canSignIn || signInMutation.isPending} className="w-full">
                  {signInMutation.isPending ? "Signing in…" : "Sign In"}
                </Button>
              </form>
              <div className="mt-5 text-sm text-muted-foreground">
                Need an account?{" "}
                <button
                  type="button"
                  className="font-medium text-foreground underline underline-offset-2"
                  onClick={() => { setError(null); setMode("sign_up"); }}
                >
                  Create one
                </button>
              </div>
            </>
          )}

          {/* Sign Up — with invite code */}
          {mode === "sign_up" && (
            <>
              <button
                type="button"
                onClick={() => { setError(null); setMode("sign_in"); }}
                className="mb-5 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                ← Back to sign in
              </button>
              <h1 className="text-xl font-semibold">Create your account</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Enter your details and the invite code you received.
              </p>
              <form
                className="mt-6 space-y-4"
                onSubmit={(e) => { e.preventDefault(); signUpMutation.mutate(); }}
              >
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Name</label>
                  <input
                    className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Email</label>
                  <input
                    className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Password</label>
                  <div className="relative">
                  <input
                    className="w-full rounded-md border border-border bg-transparent px-3 py-2 pr-9 text-sm outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                  <button type="button" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" onClick={() => setShowPassword(!showPassword)} tabIndex={-1}>
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Invite code</label>
                  <input
                    className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50 font-mono"
                    placeholder="pcp_invite_…"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Ask your workspace admin for this code.
                  </p>
                </div>
                {error && <p className="text-xs text-destructive">{error}</p>}
                <Button type="submit" disabled={!canSignUp || signUpMutation.isPending} className="w-full">
                  {signUpMutation.isPending ? "Creating account…" : "Create account"}
                </Button>
              </form>

              {bootstrapPending && (
                <div className="mt-6 pt-5 border-t border-border">
                  <p className="text-xs text-muted-foreground">
                    Setting up this instance?{" "}
                    <button
                      type="button"
                      className="font-medium text-foreground underline underline-offset-2"
                      onClick={() => { setError(null); setMode("admin_setup"); }}
                    >
                      Create admin account →
                    </button>
                  </p>
                </div>
              )}
            </>
          )}

          {/* Admin setup — bootstrap, no invite code */}
          {mode === "admin_setup" && (
            <>
              <button
                type="button"
                onClick={() => { setError(null); setMode("sign_up"); }}
                className="mb-5 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                ← Back
              </button>
              <h1 className="text-xl font-semibold">Create admin account</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                You'll be the instance admin and can set up companies and invite team members.
              </p>
              <form
                className="mt-6 space-y-4"
                onSubmit={(e) => { e.preventDefault(); adminSetupMutation.mutate(); }}
              >
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Name</label>
                  <input
                    className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Email</label>
                  <input
                    className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Password</label>
                  <div className="relative">
                  <input
                    className="w-full rounded-md border border-border bg-transparent px-3 py-2 pr-9 text-sm outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                  <button type="button" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" onClick={() => setShowPassword(!showPassword)} tabIndex={-1}>
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                  </div>
                </div>
                {error && <p className="text-xs text-destructive">{error}</p>}
                <Button type="submit" disabled={!canAdminSetup || adminSetupMutation.isPending} className="w-full">
                  {adminSetupMutation.isPending ? "Creating account…" : "Create Admin Account"}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>

      {/* Right half — ASCII art animation (hidden on mobile) */}
      <div className="hidden md:block w-1/2 overflow-hidden">
        <AsciiArtAnimation />
      </div>
    </div>
  );
}
