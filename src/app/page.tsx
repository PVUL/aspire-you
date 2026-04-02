"use client";

import { signIn, signOut, useSession } from "@/lib/auth-client";
import { useState, useCallback, useEffect } from "react";
import { VaultDashboard } from "@/components/VaultDashboard";

export default function Home() {
  const { data: session, isPending } = useSession();
  const [provisioning, setProvisioning] = useState(false);
  const [vaultStatus, setVaultStatus] = useState<string | null>(null);
  const [vaultMeta, setVaultMeta] = useState<{exists: boolean; url: string} | null>(null);
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  const handleVaultLoaded = useCallback((exists: boolean, url: string) => {
    setVaultMeta({ exists, url });
  }, []);

  const handleSignIn = async () => {
    await signIn.social({
      provider: "github",
    });
  };

  const handleProvisionVault = async () => {
    setProvisioning(true);
    setVaultStatus("Provisioning...");
    try {
      const res = await fetch("/api/vault/provision", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setVaultStatus(`✅ ${data.message} (${data.repo})`);
      } else {
        setVaultStatus(`❌ Error: ${data.error}`);
      }
    } catch (e: any) {
      setVaultStatus(`❌ Error: ${e.message}`);
    } finally {
      setProvisioning(false);
    }
  };

  const showSkeleton = isPending || !hasMounted;
  const showSignedOut = !showSkeleton && !session;
  const showDashboard = !showSkeleton && !!session;

  return (
    <main className="min-h-screen flex flex-col" suppressHydrationWarning>
      {showSkeleton && (
        <>
          <nav className="shrink-0 flex items-center justify-between px-6 h-14 border-b border-neutral-200/60 dark:border-neutral-800/60">
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
            <button
              onClick={handleSignIn}
              className="w-full flex items-center justify-center gap-2.5 h-11 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-lg text-sm font-medium hover:opacity-90 active:scale-[0.98] transition-all shadow-sm"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
              </svg>
              Continue with GitHub
            </button>
            <p className="text-[11px] text-neutral-400 dark:text-neutral-600">
              Your data stays in your own private repository. We never store your entries.
            </p>
          </div>
        </div>
      )}

      {showDashboard && (
        <>
          {/* ── Top nav ── */}
          <nav className="shrink-0 flex items-center justify-between px-6 h-14 border-b border-neutral-200/60 dark:border-neutral-800/60 bg-white/80 dark:bg-neutral-950/80 backdrop-blur-sm sticky top-0 z-50">
            <div className="flex items-center gap-3">
              <h1 className="text-sm font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
                Aspire You
              </h1>
              <a
                href={vaultMeta?.url || "#"}
                target={vaultMeta?.url ? "_blank" : undefined}
                rel="noreferrer"
                className={`text-[11px] font-medium px-2 py-0.5 rounded border transition-all ${
                  vaultMeta?.url
                    ? "border-neutral-200 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 hover:border-neutral-400 dark:hover:border-neutral-500"
                    : "border-neutral-200/40 dark:border-neutral-800/40 text-neutral-300 dark:text-neutral-700 cursor-default pointer-events-none"
                }`}
                onClick={(e) => { if (!vaultMeta?.url) e.preventDefault(); }}
              >
                vault ↗
              </a>
            </div>
            <div className="flex items-center gap-3">
              {session?.user.image && (
                <img
                  src={session.user.image}
                  alt=""
                  className="w-7 h-7 rounded-full ring-1 ring-neutral-200 dark:ring-neutral-800"
                />
              )}
              <span className="text-[13px] text-neutral-600 dark:text-neutral-400 hidden sm:block">
                {session?.user.name}
              </span>
              <button
                onClick={() => signOut()}
                className="text-[11px] font-medium px-2.5 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 hover:border-neutral-400 dark:hover:border-neutral-500 transition-all active:scale-[0.97]"
              >
                Sign out
              </button>
            </div>
          </nav>

          {/* ── Content ── */}
          <div className="flex-1 max-w-4xl w-full mx-auto px-6 py-6 space-y-4">
            {vaultMeta?.exists === false && (
              <div className="p-5 rounded-xl border border-amber-200/60 dark:border-amber-800/30 bg-amber-50/50 dark:bg-amber-950/10 space-y-3">
                <div className="space-y-1">
                  <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                    Initialize Your Vault
                  </h2>
                  <p className="text-[13px] text-amber-700 dark:text-amber-300/70 leading-relaxed">
                    Create a private GitHub repository named{" "}
                    <code className="text-[12px] px-1.5 py-0.5 bg-amber-200/40 dark:bg-amber-800/20 rounded">aspire-vault</code>{" "}
                    to start journaling.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleProvisionVault}
                    disabled={provisioning}
                    className="text-[12px] font-medium px-3.5 py-1.5 rounded-md bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 transition-all active:scale-[0.97]"
                  >
                    {provisioning ? "Creating..." : "Create Vault"}
                  </button>
                  {vaultStatus && (
                    <span className="text-[12px] text-amber-700 dark:text-amber-300/70 font-mono">
                      {vaultStatus}
                    </span>
                  )}
                </div>
              </div>
            )}
            <VaultDashboard onVaultLoaded={handleVaultLoaded} />
          </div>
        </>
      )}
    </main>
  );
}
