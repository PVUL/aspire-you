import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { NhostClient, NhostProvider } from "@nhost/react";
import { ClerkProvider } from "@clerk/clerk-react";
import App from "./App";
import "./index.css";

const nhost = new NhostClient({
  // Fallback to local nhost if not provided in env
  subdomain: import.meta.env.VITE_NHOST_SUBDOMAIN || "local",
  region: import.meta.env.VITE_NHOST_REGION || "",
  functionsUrl: import.meta.env.DEV ? window.location.origin + "/nhost-fn" : undefined,
});

// Import your publishable key
const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!PUBLISHABLE_KEY) {
  console.warn("Missing VITE_CLERK_PUBLISHABLE_KEY");
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ClerkProvider publishableKey={PUBLISHABLE_KEY || "missing"}>
      <NhostProvider nhost={nhost}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </NhostProvider>
    </ClerkProvider>
  </React.StrictMode>
);
