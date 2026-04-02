"use client";

import { signIn, signOut, useSession } from "@/lib/auth-client";
import { useState } from "react";

export default function Home() {
  const { data: session, isPending } = useSession();
  const [provisioning, setProvisioning] = useState(false);
  const [vaultStatus, setVaultStatus] = useState<string | null>(null);

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

  if (isPending) {
    return <div className="p-8">Loading...</div>;
  }

  return (
    <main className="min-h-screen p-8 max-w-2xl mx-auto space-y-8 font-sans">
      <header className="space-y-2">
        <h1 className="text-4xl font-bold tracking-tight">Aspire You</h1>
        <p className="text-neutral-500">
          Decentralized journaling backed by your personal GitHub vault.
        </p>
      </header>

      {!session ? (
        <section className="bg-neutral-100 dark:bg-neutral-900 p-6 rounded-lg space-y-4">
          <p>Please authenticate with GitHub to begin.</p>
          <button
            onClick={handleSignIn}
            className="bg-black text-white px-4 py-2 rounded font-medium hover:bg-neutral-800 transition"
          >
            Sign in with GitHub
          </button>
        </section>
      ) : (
        <section className="space-y-8">
          <div className="flex items-center justify-between bg-neutral-100 dark:bg-neutral-900 p-4 rounded-lg">
            <div className="flex items-center space-x-4">
              {session.user.image && (
                <img
                  src={session.user.image}
                  alt="Avatar"
                  className="w-10 h-10 rounded-full"
                />
              )}
              <div>
                <p className="font-semibold">{session.user.name}</p>
                <p className="text-sm text-neutral-500">{session.user.email}</p>
              </div>
            </div>
            <button
              onClick={() => signOut()}
              className="text-sm px-3 py-1 border border-neutral-300 dark:border-neutral-700 rounded hover:bg-neutral-200 dark:hover:bg-neutral-800"
            >
              Sign out
            </button>
          </div>

          <div className="border border-neutral-200 dark:border-neutral-800 p-6 rounded-lg space-y-4">
            <h2 className="text-2xl font-semibold">Your Vault</h2>
            <p className="text-neutral-600 dark:text-neutral-400">
              Your journal entries are encrypted using CRDTs and synced to a
              private GitHub repository named <code>aspire-vault</code>.
            </p>

            <div className="space-y-4">
              <button
                onClick={handleProvisionVault}
                disabled={provisioning}
                className="bg-blue-600 text-white px-4 py-2 rounded font-medium hover:bg-blue-700 disabled:opacity-50 transition"
              >
                {provisioning ? "Provisioning..." : "Provision Vault"}
              </button>

              {vaultStatus && (
                <div className="p-3 bg-neutral-50 dark:bg-neutral-950 rounded text-sm font-mono border border-neutral-200 dark:border-neutral-800">
                  {vaultStatus}
                </div>
              )}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
