import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { NhostClient, NhostProvider } from "@nhost/react";
import App from "./App";
import "./index.css";

const nhost = new NhostClient({
  subdomain: import.meta.env.VITE_NHOST_SUBDOMAIN || "local",
  region: import.meta.env.VITE_NHOST_REGION,
  // Ensure we use localStorage explicitly to prevent any cookie domain mismatch locally
  clientStorageType: "localStorage",
});


ReactDOM.createRoot(document.getElementById("root")!).render(
  <NhostProvider nhost={nhost}>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </NhostProvider>
);
