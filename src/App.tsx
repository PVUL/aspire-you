import { useState, useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Communities from "./pages/Communities";
import CommunityDraft from "./pages/CommunityDraft";
import { SqliteDebugPanel } from "./components/SqliteDebugPanel";
import { PasswordGate } from "./components/PasswordGate";

function AppRoutes() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/communities" element={<Communities />} />
        <Route path="/communities/new" element={<CommunityDraft />} />
        <Route path="/communities/:slug/draft" element={<CommunityDraft />} />
      </Routes>
      {import.meta.env.DEV && <SqliteDebugPanel />}
    </>
  );
}

export default function App() {
  const [gateEnabled, setGateEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    const functionUrl = import.meta.env.DEV 
      ? '/nhost-fn' 
      : import.meta.env.VITE_NHOST_FUNCTIONS_URL || `https://${import.meta.env.VITE_NHOST_SUBDOMAIN}.functions.${import.meta.env.VITE_NHOST_REGION}.nhost.run`;

    fetch(`${functionUrl}/settings/gate?t=${Date.now()}`)
      .then(async res => {
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(`HTTP Error: ${JSON.stringify(errData)}`);
        }
        return res.json();
      })
      .then(data => {
        // Enforce explicit checks since false/string false/undefined often clash when db syncing
        const isActuallyEnabled = data.enabled === true; 
        setGateEnabled(isActuallyEnabled);
      })
      .catch(err => {
        console.error("Failed to load gate setting:", err.message);
        // Fail-closed in Production, but Fail-open in Development if Hasura metadata is throwing out-of-sync 500s.
        setGateEnabled(import.meta.env.PROD); 
      });
  }, []);

  if (gateEnabled === null) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a' }}>
        <div style={{ width: '20px', height: '20px', borderRadius: '50%', border: '2px solid rgba(255,255,255,0.1)', borderTopColor: '#fff', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (gateEnabled) {
    return (
      <PasswordGate>
        <AppRoutes />
      </PasswordGate>
    );
  }

  return <AppRoutes />;
}
