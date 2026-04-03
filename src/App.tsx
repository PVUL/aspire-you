import { Routes, Route } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { useNhostClient } from "@nhost/react";
import { useEffect, useState } from "react";
import Home from "./pages/Home";

// This component syncs Clerk authentication state to the Nhost client
function AuthSync({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const nhost = useNhostClient();
  const [hasSynced, setHasSynced] = useState(false);

  useEffect(() => {
    let active = true;

    async function syncSession() {
      if (!isLoaded) return;
      
      if (isSignedIn) {
        try {
          const clerkToken = await getToken();
          if (clerkToken && active) {
            const backendUrl = import.meta.env.DEV
              ? '/nhost-fn'
              : nhost.functions.url;
            const res = await fetch(`${backendUrl}/auth/session`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${clerkToken}`,
                'Content-Type': 'application/json'
              }
            });
            
            if (!res.ok) {
              throw new Error(`Failed to fetch: ${res.status} ${res.statusText}`);
            }

            const data = await res.json();
            
            if (data.accessToken && data.refreshToken) {
              // Load the external session into Nhost React Client
              // Nhost's useAuthenticationStatus hook might not react to this update if already mounted,
              // but it successfully configures the underlying GraphQL client!
              await nhost.auth.initWithSession({
                session: {
                  accessToken: data.accessToken,
                  refreshToken: data.refreshToken,
                  accessTokenExpiresIn: 30 * 24 * 3600,
                  user: { id: "unknown" } as any,
                }
              });
            }
          }
        } catch (e) {
          console.error("Failed to sync session with Nhost:", e);
        } finally {
          if (active) {
            setHasSynced(true);
          }
        }
      } else {
        // Log out of Nhost if signed out of Clerk
        await nhost.auth.signOut();
        if (active) {
          setHasSynced(true);
        }
      }
    }

    syncSession();
    return () => { active = false; };
  }, [isLoaded, isSignedIn, getToken, nhost]);

  // Wait until identities are synchronized before rendering app code that expects them
  const isReady = isLoaded && (!isSignedIn || (isSignedIn && hasSynced));

  if (!isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center dark:bg-neutral-950">
        <div className="h-4 w-4 rounded-full border-2 border-neutral-900 dark:border-neutral-100 border-t-transparent animate-spin"/>
      </div>
    );
  }

  return <>{children}</>;
}

import { SqliteDebugPanel } from "./components/SqliteDebugPanel";

export default function App() {
  return (
    <AuthSync>
      <Routes>
        <Route path="/" element={<Home />} />
      </Routes>
      {import.meta.env.DEV && <SqliteDebugPanel />}
    </AuthSync>
  );
}
