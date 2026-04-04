import { useState, useCallback, useEffect, useRef } from "react";
import { useNhostClient, useUserData, useAuthenticationStatus, useSignOut, useSignInEmailOTP } from "@nhost/react";
import { VaultDashboard } from "@/components/VaultDashboard";
import { getUiState, patchUiState } from "@/lib/uiState";

type ToastType = "error" | "info" | "success";
function Toast({ message, type, onDismiss }: { message: string; type: ToastType; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 5000);
    return () => clearTimeout(t);
  }, [onDismiss]);
  const colors = {
    error: "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300",
    info: "bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300",
    success: "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300",
  };
  return (
    <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex items-start gap-3 px-4 py-3 rounded-xl border shadow-lg w-[min(calc(100vw-2rem),24rem)] text-[13px] ${colors[type]}`}>
      <span className="flex-1 leading-relaxed">{message}</span>
      <button onClick={onDismiss} className="shrink-0 opacity-50 hover:opacity-100 transition-opacity text-xs mt-0.5">✕</button>
    </div>
  );
}

function OtpInput({ length = 6, onComplete }: { length?: number; onComplete: (code: string) => void }) {
  const [code, setCode] = useState<string[]>(Array(length).fill(""));
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const processInput = (e: React.ChangeEvent<HTMLInputElement>, slot: number) => {
    const val = e.target.value;
    if (/[^0-9]/.test(val)) return;

    const newCode = [...code];
    newCode[slot] = val;
    setCode(newCode);

    if (slot !== length - 1 && val !== "") {
      inputs.current[slot + 1]?.focus();
    }

    if (newCode.every(d => d !== "")) {
      onComplete(newCode.join(""));
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, slot: number) => {
    if (e.key === "Backspace" && !code[slot] && slot !== 0) {
      inputs.current[slot - 1]?.focus();
    }
  };

  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/[^0-9]/g, "").slice(0, length);
    if (!pasted) return;

    const newCode = [...code];
    for (let i = 0; i < pasted.length; i++) {
      newCode[i] = pasted[i];
    }
    setCode(newCode);

    if (pasted.length < length) {
      inputs.current[pasted.length]?.focus();
    } else {
      inputs.current[length - 1]?.focus();
      onComplete(newCode.join(""));
    }
  };

  return (
    <div className="flex gap-2 justify-center">
      {code.map((num, idx) => (
        <input
          key={idx}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={num}
          ref={(el) => { inputs.current[idx] = el; }}
          onChange={(e) => processInput(e, idx)}
          onKeyDown={(e) => onKeyDown(e, idx)}
          onPaste={onPaste}
          className="w-10 h-12 text-center text-lg font-bold border border-neutral-300 dark:border-neutral-700 bg-transparent rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-300 transition-all text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-300 dark:placeholder:text-neutral-600"
          placeholder="·"
        />
      ))}
    </div>
  );
}

export default function Home() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuthenticationStatus();
  const user = useUserData();
  const nhost = useNhostClient();
  const { signOut } = useSignOut();
  const {
    signInEmailOTP,
    verifyEmailOTP,
    needsOtp,
    isError: otpIsError,
    error: otpError,
    isLoading: otpIsLoading,
  } = useSignInEmailOTP();

  const [provisioning, setProvisioning] = useState(false);
  const [vaultStatus, setVaultStatus] = useState<string | null>(null);
  const [vaultMeta, setVaultMeta] = useState<{ exists: boolean; url: string } | null>(null);
  const [githubConnected, setGithubConnected] = useState(false);
  const [githubStatusLoading, setGithubStatusLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  const [disconnectConfirm, setDisconnectConfirm] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const showToast = useCallback((message: string, type: ToastType = "error") => {
    setToast({ message, type });
  }, []);

  // Auth flow state
  const [email, setEmail] = useState("");
  const [authStep, setAuthStep] = useState<"email" | "code">("email");

  const [isSettingsOpen, setIsSettingsOpen] = useState(() => getUiState().settingsOpen ?? false);
  const [isExpanded, setIsExpanded] = useState(() => getUiState().dashboardExpanded ?? false);
  const [gateEnabled, setGateEnabled] = useState(true);
  const [gateLoading, setGateLoading] = useState(false);

  useEffect(() => {
    if (user?.email === "paul.a.yun@gmail.com") {
      const backendUrl = import.meta.env.DEV ? '/nhost-fn' : nhost.functions.url;
      fetch(`${backendUrl}/settings/gate`)
        .then(r => r.json())
        .then(data => setGateEnabled(Boolean(data.enabled)))
        .catch(console.error);
    }
  }, [user?.email, nhost.functions.url]);

  useEffect(() => {
    patchUiState({ settingsOpen: isSettingsOpen });
  }, [isSettingsOpen]);

  useEffect(() => {
    patchUiState({ dashboardExpanded: isExpanded });
  }, [isExpanded]);

  // Drive OTP screen from hook state machine — NOT from promise return value.
  // needsOtp=true means OTP was successfully sent; isError=true means it failed.
  useEffect(() => {
    if (needsOtp) {
      setAuthStep("code");
    }
  }, [needsOtp]);

  useEffect(() => {
    if (otpIsError && otpError) {
      const status = (otpError as any).status;
      if (status === 409) {
        // 409 = a pending OTP already exists for this email (not yet expired).
        // The code was already sent — just show the OTP input so the user can enter it.
        showToast(`A code was already sent to ${email}. Please check your inbox.`, "info");
        setAuthStep("code"); // advance to OTP input, don't block
      } else if (status === 401) {
        showToast(
          "Session error — tap \"Clear session\" below and try again.",
          "error"
        );
        setAuthStep("email");
      } else {
        showToast((otpError as any).message || "Failed to send code. Please try again.", "error");
        setAuthStep("email");
      }
    }
  }, [otpIsError, otpError, showToast, email]);

  useEffect(() => {
    let active = true;

    async function checkStatus() {
      if (!isAuthenticated) return;
      setGithubStatusLoading(true);
      try {
        const token = nhost.auth.getAccessToken();
        const backendUrl = import.meta.env.DEV ? '/nhost-fn' : nhost.functions.url;
        const res = await fetch(`${backendUrl}/github/status`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (active && res.ok) {
          const data: any = await res.json();
          setGithubConnected(data.connected);

          if (data.vaultExists) {
            setVaultMeta({ exists: true, url: data.vaultUrl });
            setVaultStatus(`✅ Vault ready (${data.vaultUrl})`);
          } else if (data.connected) {
            setVaultMeta({ exists: false, url: "" });
            setVaultStatus("✅ GitHub connected. Ready to create vault.");
          } else {
            setVaultMeta({ exists: false, url: "" });
            setVaultStatus(null);
          }
        }
      } catch (e) {
        console.error("Status check failed", e);
      } finally {
        if (active) setGithubStatusLoading(false);
      }
    }

    checkStatus();

    // Check URL params for GitHub OAuth callback result
    const params = new URLSearchParams(window.location.search);
    const ghStatus = params.get("github");
    if (ghStatus === "connected") {
      setGithubConnected(true);
      setVaultStatus("✅ GitHub connected! You can now create your vault.");
      // Clean URL
      window.history.replaceState({}, "", window.location.pathname);
    } else if (ghStatus === "error") {
      setVaultStatus("❌ Failed to connect GitHub. Please try again.");
      window.history.replaceState({}, "", window.location.pathname);
    }

    return () => { active = false; };
  }, [isAuthenticated, nhost.auth, nhost.functions.url]);

  const handleVaultLoaded = useCallback((exists: boolean, url: string) => {
    setVaultMeta({ exists, url });
  }, []);

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    // Errors and navigation are handled by the useEffect hooks above
    await signInEmailOTP(email);
  };

  const handleVerifyOtp = async (code: string) => {
    const { error } = await verifyEmailOTP(email, code);

    if (error) {
      showToast((error as any).message || "Invalid code. Please try again.", "error");
    }
  };

  const handleConnectGithub = () => {
    const functionsUrl = import.meta.env.DEV ? '/nhost-fn' : nhost.functions.url;
    const redirectUri = encodeURIComponent(window.location.origin + window.location.pathname);
    window.location.href = `${functionsUrl}/github/connect?user_id=${user?.id}&redirect_uri=${redirectUri}`;
  };

  const handleDisconnectGithub = async () => {
    setDisconnecting(true);
    try {
      const token = nhost.auth.getAccessToken();
      const functionsUrl = import.meta.env.DEV ? '/nhost-fn' : nhost.functions.url;
      const res = await fetch(`${functionsUrl}/github/disconnect`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        setGithubConnected(false);
        setVaultMeta(null);
        setVaultStatus(null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setDisconnecting(false);
    }
  };

  const handleProvisionVault = async () => {
    setProvisioning(true);
    setVaultStatus("Provisioning...");
    try {
      const res = await nhost.functions.call("/vault/provision");
      const data: any = res.res?.data;
      if (res.error) {
        setVaultStatus(`❌ Error: ${res.error.message || "Unknown error"}`);
      } else if (data && data.code === "GITHUB_NOT_CONNECTED") {
        setVaultStatus("GitHub not connected.");
        setGithubConnected(false);
      } else if (data && data.success) {
        setVaultStatus(`✅ ${data.message} (${data.repo})`);
        setVaultMeta({ exists: true, url: `https://github.com/${user?.displayName}/${data.repo}` }); // Speculative until sync overrides
      } else {
        setVaultStatus(`❌ Error: ${data?.error || "Failed to provision"}`);
      }
    } catch (e: any) {
      setVaultStatus(`❌ Error: ${e.message}`);
    } finally {
      setProvisioning(false);
    }
  };

  const showSkeleton = isAuthLoading;
  const showSignedOut = !showSkeleton && !isAuthenticated;
  const showDashboard = !showSkeleton && isAuthenticated;

  return (
    <main className="min-h-screen flex flex-col transition-colors duration-300">
      {showSkeleton && (
        <>
          <nav className="shrink-0 flex items-center justify-between px-4 h-14 border-b border-neutral-200/60 dark:border-neutral-800/60">
            <div className="h-5 w-24 bg-neutral-200 dark:bg-neutral-800 rounded animate-pulse" />
            <div className="h-8 w-20 bg-neutral-200 dark:bg-neutral-800 rounded-md animate-pulse" />
          </nav>
          <div className="flex-1 max-w-4xl w-full mx-auto px-6 py-8 space-y-6">
            <div className="h-[52px] bg-neutral-200/50 dark:bg-neutral-800/30 rounded-xl animate-pulse" />
            <div className="h-[600px] bg-neutral-200/50 dark:bg-neutral-800/30 rounded-xl animate-pulse" />
          </div>
        </>
      )}

      {showSignedOut && (
        <div className="flex-1 flex items-center justify-center">
          <div className="max-w-sm w-full mx-auto px-6 space-y-8 text-center">
            <div className="space-y-3">
              <h1 className="text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
                Aspire You
              </h1>
              <p className="text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
                A private, local-first journal backed by your personal GitHub vault.
              </p>
            </div>

            <div className="bg-white dark:bg-[#222222] shadow-sm border border-neutral-200 dark:border-neutral-700/50 rounded-xl p-6 text-left">
              {authStep === "email" ? (
                <form onSubmit={handleSendCode} className="space-y-4">
                  <div>
                    <label htmlFor="email" className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">Email address</label>
                    <input
                      id="email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full px-3 py-2 text-sm bg-neutral-50 dark:bg-[#1c1c1c] border border-neutral-200 dark:border-neutral-700/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-500 transition-all text-neutral-900 dark:text-white"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={otpIsLoading || !email}
                    className="w-full flex items-center justify-center gap-2.5 h-10 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-lg text-sm font-medium hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50"
                  >
                    {otpIsLoading ? "Sending..." : "Continue with Email"}
                  </button>
                  <div className="text-center pt-1">
                    <button
                      type="button"
                      onClick={async () => {
                        await signOut(); // This properly clears HttpOnly secure cookies!
                        localStorage.clear();
                        window.location.reload();
                      }}
                      className="text-[11px] text-neutral-400 dark:text-neutral-600 hover:text-neutral-600 dark:hover:text-neutral-400 transition-colors"
                    >
                      Having trouble? Clear session &amp; reload
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-6">
                  <div className="text-center space-y-1.5">
                    <h2 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">Check your email</h2>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">We sent a 6-digit code to <span className="font-medium text-neutral-700 dark:text-neutral-300">{email}</span></p>
                  </div>

                  <OtpInput onComplete={handleVerifyOtp} />

                  <div className="text-center">
                    <button
                      onClick={() => { setAuthStep("email"); }}
                      className="text-xs text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors"
                    >
                      Use a different email
                    </button>
                  </div>
                </div>
              )}
            </div>

            <p className="text-[11px] text-neutral-400 dark:text-neutral-600">
              Your data stays in your own private repository. We never store your entries.
            </p>
          </div>
        </div>
      )}

      {toast && (
        <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
      )}

      {showDashboard && (
        <>
          {/* ── Top nav ── */}
          <nav className="shrink-0 flex items-center justify-between px-6 h-14 border-b border-neutral-200/60 dark:border-neutral-700/40 bg-white/80 dark:bg-[#222222] backdrop-blur-sm sticky top-0 z-50">
            <div className="flex items-center gap-3">
              <h1 className="text-sm font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
                Aspire You
              </h1>
              <a
                href={vaultMeta?.url || "#"}
                target={vaultMeta?.url ? "_blank" : undefined}
                rel="noreferrer"
                className={`text-[11px] font-medium px-2 py-0.5 rounded border transition-all ${vaultMeta?.url
                  ? "border-neutral-200 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 hover:border-neutral-400 dark:hover:border-neutral-500"
                  : "border-neutral-200/40 dark:border-neutral-800/40 text-neutral-300 dark:text-neutral-700 cursor-default pointer-events-none"
                  }`}
                onClick={(e) => { if (!vaultMeta?.url) e.preventDefault(); }}
              >
                vault ↗
              </a>
            </div>
            <div className="flex items-center gap-3">
              {user?.avatarUrl && (
                <img
                  src={user.avatarUrl}
                  alt=""
                  className="w-7 h-7 rounded-full ring-1 ring-neutral-200 dark:ring-neutral-800"
                />
              )}
              <span className="text-[13px] text-neutral-600 dark:text-neutral-400 hidden sm:block">
                {user?.displayName || user?.email}
              </span>
              <button
                onClick={() => signOut()}
                className="text-[11px] font-medium px-2.5 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-600 text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 hover:border-neutral-400 dark:hover:border-neutral-500 transition-all active:scale-[0.97]"
              >
                Sign out
              </button>
            </div>
          </nav>

          {/* ── Content Area ── */}
          <div className={`grid place-items-center flex-1 w-full transition-[padding] duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] ${isExpanded ? (import.meta.env.DEV ? 'pt-2 px-2 pb-[36px]' : 'p-2') : (import.meta.env.DEV ? 'px-4 pt-8 pb-[60px]' : 'px-4 py-8')}`}>

            {/* Dynamic layout wrapper */}
            <div
              className="flex w-full h-full gap-4 items-stretch justify-center transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]"
              style={{
                maxWidth: isExpanded ? '2800px' : '860px',
                maxHeight: isExpanded ? '2000px' : '500px'
              }}
            >

              {/* Left Rail: Icon column + Widget side-by-side */}
              <div className="flex flex-row items-start shrink-0 h-full">
                {/* Left icon button column — vertical, expand here with future buttons */}
                <div className="flex flex-col items-center gap-2 w-7 shrink-0">
                  <button
                    onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                    title={isSettingsOpen ? "Close settings" : "Open settings"}
                    className={`w-7 h-7 rounded-[8px] flex items-center justify-center transition-all duration-200 ease-in-out active:scale-90 ${isSettingsOpen
                      ? 'bg-neutral-700 dark:bg-neutral-600 text-white shadow-md'
                      : 'bg-neutral-200/70 dark:bg-neutral-700/50 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-300/80 dark:hover:bg-neutral-600/70'
                      }`}
                  >
                    <svg className="w-[14px] h-[14px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </button>
                  {/* Future icon buttons go here */}
                </div>

                {/* Settings widgets column — animates width and left margin to collapse rightward */}
                <div
                  className={`transition-[width,opacity,margin] duration-300 ease-in-out overflow-hidden shrink-0 flex flex-col gap-3 ${isSettingsOpen ? 'w-60 opacity-100 ml-3' : 'w-0 opacity-0 pointer-events-none ml-0'
                    }`}
                >
                  <div className="w-60 rounded-2xl border border-neutral-200/60 dark:border-neutral-700/40 bg-white dark:bg-[#222222] shadow-xl dark:shadow-[0_8px_32px_rgba(0,0,0,0.6)] overflow-hidden min-h-[196px] flex flex-col shrink-0">
                    {/* Header */}
                    <div className="px-4 py-3 border-b border-neutral-200/60 dark:border-neutral-700/40">
                      <h3 className="text-[10px] font-semibold tracking-widest uppercase text-neutral-400 dark:text-neutral-500 select-none">
                        Settings
                      </h3>
                    </div>
                    {/* GitHub section */}
                    <div className="px-4 py-4 pb-2 space-y-2">
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-neutral-500 dark:text-neutral-400 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                        </svg>
                        <span className="text-[13px] font-semibold text-neutral-800 dark:text-neutral-200 flex-1">GitHub</span>
                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 transition-colors duration-500 ${githubConnected ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.7)]' : 'bg-neutral-400 dark:bg-neutral-600'}`} />
                      </div>
                      <p className="text-[11px] text-neutral-400 dark:text-neutral-500 leading-relaxed">
                        {githubConnected ? "Connected — vault syncing enabled." : "Connect to enable vault syncing."}
                      </p>
                      {vaultMeta?.url && githubConnected && (
                        <a
                          href={vaultMeta.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-[11px] text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors group"
                        >
                          <svg className="w-3 h-3 shrink-0 text-neutral-400 group-hover:text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                          </svg>
                          <span className="truncate font-mono">{vaultMeta.url.replace(/^https?:\/\//, '')}</span>
                        </a>
                      )}
                    </div>

                    {/* Pinned bottom action — always same position */}
                    <div className="px-3 pb-3 border-t border-neutral-100 dark:border-neutral-800 pt-3 mt-auto">
                      {githubConnected ? (
                        disconnectConfirm ? (
                          <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 animate-in fade-in slide-in-from-bottom-1 duration-150">
                            <span className="text-[11px] text-red-600 dark:text-red-400 font-medium flex-1 truncate">Disconnect GitHub?</span>
                            <button
                              onClick={() => { handleDisconnectGithub(); setDisconnectConfirm(false); }}
                              disabled={disconnecting}
                              className="text-[10px] font-semibold px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 active:scale-95 transition-all shrink-0 disabled:opacity-50"
                            >{disconnecting ? "..." : "Yes"}</button>
                            <button
                              onClick={() => setDisconnectConfirm(false)}
                              className="text-[10px] font-semibold px-2 py-1 rounded bg-neutral-200 dark:bg-neutral-600 text-neutral-700 dark:text-neutral-200 hover:opacity-80 active:scale-95 transition-all shrink-0"
                            >No</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDisconnectConfirm(true)}
                            className="w-full text-[12px] font-medium px-3 py-2 rounded-lg border border-red-200 dark:border-red-900/40 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all active:scale-[0.98]"
                          >
                            Disconnect Account
                          </button>
                        )
                      ) : (
                        <button
                          onClick={handleConnectGithub}
                          disabled={githubStatusLoading}
                          className="w-full text-[12px] font-medium px-3 py-2 rounded-lg bg-neutral-900 dark:bg-neutral-700 text-white hover:bg-neutral-800 dark:hover:bg-neutral-600 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                        >
                          {githubStatusLoading ? (
                            <span className="flex items-center justify-center gap-2">
                              <span className="w-3 h-3 rounded-full border border-white/40 border-t-white animate-spin" />
                              Checking...
                            </span>
                          ) : "Connect GitHub"}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Separate Admin Widget Container */}
                  {user?.email === "paul.a.yun@gmail.com" && (
                    <div className="w-60 rounded-2xl border border-neutral-200/60 dark:border-neutral-700/40 bg-white dark:bg-[#222222] shadow-xl dark:shadow-[0_8px_32px_rgba(0,0,0,0.6)] overflow-hidden shrink-0 flex flex-col">
                      <div className="px-4 py-3 border-b border-neutral-200/60 dark:border-neutral-700/40">
                        <h3 className="text-[10px] font-semibold tracking-widest uppercase text-neutral-400 dark:text-neutral-500 select-none">
                          Admin
                        </h3>
                      </div>
                      <div className="px-4 py-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[13px] font-semibold text-neutral-800 dark:text-neutral-200">
                            Gate App Access
                          </span>
                          <button
                            disabled={gateLoading}
                            onClick={async () => {
                              const next = !gateEnabled;
                              setGateEnabled(next);
                              setGateLoading(true);
                              try {
                                const backendUrl = import.meta.env.DEV ? '/nhost-fn' : nhost.functions.url;
                                const token = nhost.auth.getAccessToken();
                                const res = await fetch(`${backendUrl}/settings/gate`, {
                                  method: 'POST',
                                  headers: {
                                    'Authorization': `Bearer ${token}`,
                                    'Content-Type': 'application/json'
                                  },
                                  body: JSON.stringify({ enabled: next })
                                });
                                if (!res.ok) {
                                  setGateEnabled(!next);
                                  showToast("Failed to update password gate setting");
                                }
                              } catch (e) {
                                setGateEnabled(!next);
                                showToast("Network error updating password gate");
                              } finally {
                                setGateLoading(false);
                              }
                            }}
                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${gateEnabled ? 'bg-[#34C759]' : 'bg-neutral-300 dark:bg-neutral-600'} ${gateLoading ? 'opacity-50' : ''}`}
                          >
                            <span className={`pointer-events-none inline-block h-[16px] w-[16px] transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${gateEnabled ? 'translate-x-[18px]' : 'translate-x-[2px]'}`} />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Main content — expands to fill remaining space in the centered wrapper */}
              <div className="flex-1 min-w-0 flex flex-col items-stretch h-full space-y-4">
                {vaultMeta?.exists === false && (
                  <div className="w-full p-5 rounded-2xl border border-amber-200/60 dark:border-amber-800/30 bg-amber-50/50 dark:bg-amber-950/10 shadow-sm backdrop-blur-md space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                          Initialize Your Vault
                        </h2>
                        <p className="text-[13px] text-amber-700 dark:text-amber-300/70 leading-relaxed max-w-2xl">
                          Create a private GitHub repository named <code className="text-[12px] px-1.5 py-0.5 bg-amber-200/40 dark:bg-amber-800/20 rounded">aspire-vault</code> to start journaling.
                        </p>
                      </div>
                      {githubConnected && (
                        <div className="flex items-center gap-3 shrink-0">
                          <button
                            onClick={handleProvisionVault}
                            disabled={provisioning}
                            className="text-[12px] font-medium px-4 py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 transition-all active:scale-[0.97] whitespace-nowrap"
                          >
                            {provisioning ? "Creating..." : "Create Vault Now"}
                          </button>
                        </div>
                      )}
                    </div>
                    {vaultStatus && githubConnected && (
                      <div className="text-[12px] text-amber-700 dark:text-amber-300/70 font-mono mt-2">
                        {vaultStatus}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex-1 w-full flex flex-col relative">
                  <VaultDashboard onVaultLoaded={handleVaultLoaded} githubConnected={githubConnected} />

                  {/* Expand / Collapse Button (always visible) */}
                  <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    title={isExpanded ? "Collapse layout" : "Expand to fullscreen"}
                    className="absolute bottom-2.5 right-2.5 p-1.5 rounded-md bg-neutral-100 hover:bg-neutral-200 dark:bg-[#2a2a2a]/60 dark:hover:bg-neutral-700/80 text-neutral-400 dark:text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 shadow-[0_1px_2px_rgba(0,0,0,0.1)] border border-neutral-200/40 dark:border-neutral-700/40 z-10 transition-all active:scale-95"
                  >
                    {isExpanded ? (
                      <svg className="w-[14px] h-[14px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M15 15v4.5M15 15h4.5M15 15l5.25 5.25" />
                      </svg>
                    ) : (
                      <svg className="w-[14px] h-[14px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9m11.25 11.25v-4.5m0 4.5h-4.5m4.5 0L15 15" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>{/* end centered wrapper */}
          </div>{/* end content area */}
        </>
      )}
    </main>
  );
}
