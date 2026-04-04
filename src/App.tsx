import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import { SqliteDebugPanel } from "./components/SqliteDebugPanel";

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
      </Routes>
      {import.meta.env.DEV && <SqliteDebugPanel />}
    </>
  );
}
