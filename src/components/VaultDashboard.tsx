"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { format } from "date-fns";
import { initDb, sql, EntryRecord } from "@/lib/localDb";
import { useDebouncedCallback } from "use-debounce";

import { useNhostClient, useAccessToken } from "@nhost/react";

export function VaultDashboard({ onVaultLoaded, githubConnected }: { onVaultLoaded?: (exists: boolean, url: string) => void; githubConnected?: boolean }) {
  const nhost = useNhostClient();
  const accessToken = useAccessToken();
  const [entries, setEntries] = useState<{ date: string; sha: string | null }[]>([]);
  const [activeDate, setActiveDate] = useState<string>("");
  const [todayStr, setTodayStr] = useState<string>("");
  const [hasMounted, setHasMounted] = useState(false);

  const [content, setContent] = useState("");
  const [sha, setSha] = useState<string | null>(null);
  const [isPulling, setIsPulling] = useState(false);

  const [syncStatus, setSyncStatus] = useState<"synced" | "saving" | "error" | "unsaved">("synced");
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

  const [isReady, setIsReady] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null); // date string pending deletion

  // Sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(220);
  const [isResizing, setIsResizing] = useState(false);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    dragRef.current = { startX: e.clientX, startWidth: sidebarWidth };

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = ev.clientX - dragRef.current.startX;
      const newW = Math.min(480, Math.max(160, dragRef.current.startWidth + delta));
      setSidebarWidth(newW);
    };

    const onUp = () => {
      dragRef.current = null;
      setIsResizing(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [sidebarWidth]);
  // Set hasMounted and todayStr on mount
  useEffect(() => {
    setHasMounted(true);
    const t = format(new Date(), "yyyy-MM-dd");
    setTodayStr(t);
  }, []);

  // Auto-select latest entry once ready
  useEffect(() => {
    if (isReady && !activeDate) {
      if (entries.length > 0) {
        setActiveDate(entries[0].date);
      } else {
        setActiveDate(todayStr);
      }
    }
  }, [isReady, activeDate, entries, todayStr]);

  // Initialize DB and fetch list
  useEffect(() => {
    let active = true;
    async function setup() {
      // DEBUG OPFS RAW STORAGE
      if (typeof navigator !== "undefined" && navigator.storage) {
        try {
          const root = await navigator.storage.getDirectory();
          let files = [];
          for await (let [name, _] of (root as any).entries()) {
            files.push(name);
          }
        } catch (e) {
          console.error("RAW OPFS Error:", e);
        }
      }

      await initDb();

      // Clean ghost files and load OPFS local data instantly
      let localEntries: { date: string, sha: string | null }[] = [];
      try {
        await sql`DELETE FROM entries WHERE (content = '' OR content IS NULL) AND sha IS NULL`;
        localEntries = await sql`SELECT date, sha FROM entries ORDER BY date DESC` as { date: string, sha: string | null }[];
        if (active) {
          setEntries(localEntries);
          setIsReady(true);
        }
      } catch (e) {
        if (active) setIsReady(true);
      }

      // Background sync with GitHub (only if connected)
      if (githubConnected) try {
        const token = accessToken;
        if (!token) return;

        const backendUrl = import.meta.env.DEV ? '/nhost-fn' : nhost.functions.url;
        const res = await fetch(`${backendUrl}/vault/list`, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          }
        });
        if (res.ok && active) {
          const data = await res.json();
          if (onVaultLoaded) {
            onVaultLoaded(data.vaultExists, data.githubUrl);
          }

          const githubFiles = data.files.map((f: any) => ({ date: f.date, sha: f.sha }));

          // Merge local and GitHub
          const merged = new Map<string, { date: string, sha: string | null }>();
          localEntries.forEach(e => merged.set(e.date, e));
          githubFiles.forEach((f: any) => {
            if (!merged.has(f.date)) merged.set(f.date, f);
            else merged.set(f.date, { ...merged.get(f.date)!, sha: f.sha });
          });

          const newEntries = Array.from(merged.values()).sort((a, b) => b.date.localeCompare(a.date));
          if (active) setEntries(newEntries);
        }
      } catch (e) {
        // ignore
      }
    }
    setup();
    return () => { active = false; };
  }, [nhost, accessToken, onVaultLoaded, githubConnected]);

  // When activeDate changes, load from Local SQLite, fallback to GitHub
  useEffect(() => {
    if (!isReady) return;

    let active = true;
    async function loadActiveEntry() {
      try {
        const localResult = await sql`SELECT * FROM entries WHERE date = ${activeDate}`;
        const localEntry = (localResult as EntryRecord[])[0];

        if (localEntry && localEntry.content) {
          if (active) {
            setContent(localEntry.content);
            setSha(localEntry.sha);
            setLastSyncedAt(localEntry.last_synced_at);
            setSyncStatus(localEntry.updated_at > (localEntry.last_synced_at || 0) ? "unsaved" : "synced");
          }
        } else {
          const token = accessToken;
          if (!token || !githubConnected) return;

          if (active) setContent("Loading...");
          const backendUrl = import.meta.env.DEV ? '/nhost-fn' : nhost.functions.url;
          const res = await fetch(`${backendUrl}/vault/entry`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ date: activeDate })
          });
          if (res.ok && active) {
            const data = await res.json();
            const fetchedContent = data.content || "";
            const fetchedSha = data.sha || null;

            setContent(fetchedContent);
            setSha(fetchedSha);
            setLastSyncedAt(Date.now());
            setSyncStatus("synced");

            await sql`
              INSERT OR REPLACE INTO entries (date, content, sha, last_synced_at, updated_at)
              VALUES (${activeDate}, ${fetchedContent}, ${fetchedSha}, ${Date.now()}, ${Date.now()})
            `;
          } else if (active) {
            setContent("");
            setSha(null);
            setSyncStatus("synced");
          }
        }
      } catch (e) {
        if (active) {
          setContent("");
          setSyncStatus("synced");
        }
      }
    }
    loadActiveEntry();
    return () => { active = false; };
  }, [activeDate, isReady, nhost, accessToken]);

  // Handle Editor changes: Auto-save to Local SQLite ONLY
  const autoSaveToLocalDb = useDebouncedCallback(async (text: string, currentSha: string | null) => {
    try {
      await sql`
        INSERT OR REPLACE INTO entries (date, content, sha, last_synced_at, updated_at)
        VALUES (${activeDate}, ${text}, ${currentSha}, ${lastSyncedAt}, ${Date.now()})
      `;
      setEntries(prev => {
        if (!prev.find(p => p.date === activeDate)) {
          const fresh = [{ date: activeDate, sha: currentSha }, ...prev];
          return fresh.sort((a, b) => b.date.localeCompare(a.date));
        }
        return prev;
      });
    } catch (e) {
      console.error("Local SQLite save failed", e);
    }
  }, 200);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setContent(text);
    setSyncStatus("unsaved");
    autoSaveToLocalDb(text, sha);
  };

  const handlePullFromGithub = async () => {
    const token = accessToken;
    if (!token) return alert("Not authenticated");
    setIsPulling(true);
    try {
      const backendUrl = import.meta.env.DEV ? '/nhost-fn' : nhost.functions.url;
      const res = await fetch(`${backendUrl}/vault/entry`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ date: activeDate })
      });
      if (res.ok) {
        const data = await res.json();
        const fetchedContent = data.content || "";
        const fetchedSha = data.sha || null;

        setContent(fetchedContent);
        setSha(fetchedSha);
        setLastSyncedAt(Date.now());
        setSyncStatus("synced");

        await sql`
          INSERT OR REPLACE INTO entries (date, content, sha, last_synced_at, updated_at)
          VALUES (${activeDate}, ${fetchedContent}, ${fetchedSha}, ${Date.now()}, ${Date.now()})
        `;
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsPulling(false);
    }
  };

  // Delete entry from local SQLite + GitHub
  const handleDeleteEntry = async (date: string) => {
    const token = accessToken;
    const backendUrl = import.meta.env.DEV ? '/nhost-fn' : nhost.functions.url;

    // Delete from local SQLite
    try {
      await sql`DELETE FROM entries WHERE date = ${date}`;
    } catch (e) {
      console.error("Failed to delete from local SQLite", e);
    }

    // Delete from GitHub if it has a sha (means it's been pushed)
    const entry = entries.find(e => e.date === date);
    if (entry?.sha && token) {
      try {
        await fetch(`${backendUrl}/vault/entry`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ date, sha: entry.sha }),
        });
      } catch (e) {
        console.error("Failed to delete from GitHub", e);
      }
    }

    // Update local state
    setEntries(prev => prev.filter(e => e.date !== date));
    setDeleteConfirm(null);
    if (activeDate === date) {
      const remaining = entries.filter(e => e.date !== date);
      setActiveDate(remaining[0]?.date ?? todayStr);
    }
  };

  // Manual save to GitHub
  const handlePushToGithub = async () => {
    const token = accessToken;
    if (!token) return alert("Not authenticated");
    setSyncStatus("saving");
    try {
      const backendUrl = import.meta.env.DEV ? '/nhost-fn' : nhost.functions.url;
      const res = await fetch(`${backendUrl}/vault/entry`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          date: activeDate,
          content: content,
          sha: sha,
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setSha(data.sha);
          const now = Date.now();
          setLastSyncedAt(now);
          setSyncStatus("synced");

          await sql`
            INSERT OR REPLACE INTO entries (date, content, sha, last_synced_at, updated_at)
            VALUES (${activeDate}, ${content}, ${data.sha}, ${now}, ${now})
          `;

          // Also update the tree list's sha
          setEntries(prev => prev.map(p => p.date === activeDate ? { ...p, sha: data.sha } : p));
        } else {
          setSyncStatus("error");
        }
      } else {
        setSyncStatus("error");
      }
    } catch (e) {
      setSyncStatus("error");
    }
  };

  const isLoading = !hasMounted || !isReady || content === "Loading...";

  const statusDot = syncStatus === "synced" && !isPulling
    ? "bg-emerald-400"
    : syncStatus === "unsaved" && !isPulling
      ? "bg-amber-400"
      : syncStatus === "error"
        ? "bg-red-400"
        : "bg-neutral-400 animate-pulse";

  const statusText = !hasMounted || isPulling
    ? "Pulling..."
    : syncStatus === "saving"
      ? "Pushing..."
      : syncStatus === "error"
        ? "Sync failed"
        : syncStatus === "unsaved"
          ? "Local only"
          : lastSyncedAt
            ? `Synced ${format(lastSyncedAt, "h:mm a")}`
            : "";

  if (!hasMounted) {
    return (
      <div className="flex h-[600px] rounded-xl overflow-hidden bg-white dark:bg-neutral-800 border border-neutral-200/60 dark:border-neutral-700/40 animate-pulse">
        <div className="w-[220px] border-r border-neutral-200/60 dark:border-neutral-700/40 bg-neutral-50/80 dark:bg-neutral-700/50"></div>
        <div className="flex-1 flex flex-col">
          <div className="h-[52px] border-b border-neutral-200/60 dark:border-neutral-700/40"></div>
          <div className="flex-1 p-6 space-y-4">
            <div className="h-4 bg-neutral-100 dark:bg-neutral-700 rounded w-3/4"></div>
            <div className="h-4 bg-neutral-100 dark:bg-neutral-700 rounded w-full"></div>
            <div className="h-4 bg-neutral-100 dark:bg-neutral-700 rounded w-5/6"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full h-full rounded-xl overflow-hidden bg-white dark:bg-transparent shadow-[0_1px_3px_rgba(0,0,0,0.06),0_4px_16px_rgba(0,0,0,0.04)] dark:shadow-[0_2px_16px_rgba(0,0,0,0.5)] border border-neutral-200/60 dark:border-neutral-700/40 transition-all">
      {/* ── Sidebar ── */}
      <div 
        className={`relative bg-neutral-50/80 dark:bg-[#1c1c1c] flex flex-col transition-[width] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] shrink-0 ${isResizing ? '!transition-none' : ''} ${sidebarOpen ? 'border-r border-neutral-200/60 dark:border-neutral-700/40' : 'border-none'}`}
        style={{ width: sidebarOpen ? sidebarWidth : 0 }}
      >
        {/* Drag Handle */}
        {sidebarOpen && (
          <div 
            className="absolute top-0 right-0 bottom-0 w-2 cursor-col-resize z-20 hover:bg-blue-500/20 active:bg-blue-500/40 transition-colors translate-x-1/2"
            onMouseDown={onDragStart}
          />
        )}
        
        {/* Toggle & Content Wrapper */}
        <div className={`flex flex-col w-full h-full overflow-hidden transition-opacity duration-200 ease-out ${sidebarOpen ? 'opacity-100' : 'opacity-0'}`}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200/60 dark:border-neutral-700/40 shrink-0">
          <span className="text-[11px] font-semibold tracking-widest uppercase text-neutral-400 dark:text-neutral-400 select-none">
            Entries
          </span>
          <button
            onClick={() => setActiveDate(todayStr)}
            disabled={entries.some(e => e.date === todayStr)}
            className="text-[11px] font-semibold px-2.5 py-1 rounded-md bg-neutral-800 text-white dark:bg-neutral-600 dark:text-white hover:opacity-90 active:scale-[0.97] transition-all disabled:opacity-20 disabled:cursor-not-allowed disabled:active:scale-100"
          >
            + Today
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
          {!isReady ? (
            <div className="space-y-1.5 p-1.5 animate-pulse">
              {[100, 75, 88].map((w, i) => (
                <div key={i} className="h-9 bg-neutral-200/70 dark:bg-neutral-700/50 rounded-lg" style={{ width: `${w}%` }} />
              ))}
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-neutral-400 dark:text-neutral-500 text-xs text-center px-4 gap-1">
              <span className="text-2xl">📝</span>
              <span>No entries yet</span>
              <span className="text-[10px]">Click &quot;+ Today&quot; to start</span>
            </div>
          ) : (
            entries.map((entry) => {
              const isActive = activeDate === entry.date;
              const isToday = entry.date === todayStr;
              const isPendingDelete = deleteConfirm === entry.date;

              if (isPendingDelete) {
                return (
                  <div key={entry.date} className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60">
                    <span className="text-[11px] text-red-600 dark:text-red-400 font-medium flex-1 truncate">Delete {entry.date}?</span>
                    <button
                      onClick={() => handleDeleteEntry(entry.date)}
                      className="text-[10px] font-semibold px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 active:scale-95 transition-all shrink-0"
                    >Yes</button>
                    <button
                      onClick={() => setDeleteConfirm(null)}
                      className="text-[10px] font-semibold px-2 py-1 rounded bg-neutral-200 dark:bg-neutral-600 text-neutral-700 dark:text-neutral-200 hover:opacity-80 active:scale-95 transition-all shrink-0"
                    >No</button>
                  </div>
                );
              }

              return (
                <div
                  key={entry.date}
                  className={`group w-full text-left px-3 py-2.5 rounded-lg text-[13px] transition-all flex items-center gap-2.5 ${isActive
                      ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 shadow-sm font-medium"
                      : "text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200/60 dark:hover:bg-neutral-700/50"
                    }`}
                >
                  <button className="flex-1 flex items-center gap-2.5 min-w-0" onClick={() => setActiveDate(entry.date)}>
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 transition-colors ${isActive ? "bg-white/60 dark:bg-neutral-800/60" : entry.sha ? "bg-emerald-400/70" : "bg-amber-400/70"
                      }`} />
                    <span className="truncate font-mono tracking-tight">{entry.date}</span>
                    {isToday && (
                      <span className={`ml-auto text-[10px] font-semibold uppercase tracking-wider shrink-0 ${isActive ? "text-white/50 dark:text-neutral-900/50" : "text-neutral-400 dark:text-neutral-600"
                        }`}>today</span>
                    )}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteConfirm(entry.date); }}
                    className={`shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-neutral-200/60 dark:hover:bg-neutral-700/60 ${isActive ? "text-white/40 hover:text-white/70" : "text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
                      }`}
                    title="Delete entry"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      <path d="M10 11v6M14 11v6" />
                      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                    </svg>
                  </button>
                </div>
              );
            })
          )}
        </div>
        </div>
      </div>

      {/* ── Editor ── */}
      <div className="flex-1 flex flex-col min-w-0 dark:bg-[#262626]">
        {/* Header bar — fixed height, never wraps */}
        <div className="shrink-0 flex items-center justify-between gap-3 px-5 h-[52px] border-b border-neutral-200/60 dark:border-neutral-700/40 dark:bg-[#2a2a2a]">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors p-1.5 -ml-2 rounded-md hover:bg-neutral-200/60 dark:hover:bg-neutral-700/50 active:scale-95"
              title={sidebarOpen ? "Close sidebar" : "Open sidebar"}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="9" y1="3" x2="9" y2="21" />
              </svg>
            </button>
            <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200 truncate shrink-0">
              {activeDate}
            </h2>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            {/* Action buttons */}
            <div className="flex items-center gap-1.5 min-w-0">
              <button
                onClick={handlePullFromGithub}
                disabled={syncStatus === "saving" || isPulling || isLoading}
                className="text-[11px] font-medium px-2.5 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-600 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-[0.97]"
                title="Pull latest from GitHub"
              >
                ↓ Pull
              </button>
              <button
                onClick={handlePushToGithub}
                disabled={syncStatus === "synced" || syncStatus === "saving" || isPulling || isLoading}
                className="text-[11px] font-medium px-2.5 py-1.5 rounded-md bg-neutral-800 dark:bg-neutral-600 text-white hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-[0.97] shadow-sm"
                title="Push to GitHub"
              >
                ↑ Push
              </button>
            </div>
          </div>
        </div>

        {/* Editor area */}
        <div className="relative flex-1 min-h-0">
          <textarea
            style={{ width: "100%", height: "100%" }}
            className={`absolute inset-0 px-6 pt-5 pb-12 bg-transparent border-none focus:outline-none focus:ring-0 resize-none font-mono text-[14px] leading-[1.75] text-neutral-700 dark:text-neutral-300 placeholder:text-neutral-300 dark:placeholder:text-neutral-700 transition-opacity duration-200 ${isLoading ? "opacity-0" : "opacity-100"}`}
            placeholder="Start writing..."
            value={isLoading ? "" : content}
            onChange={handleChange}
            disabled={isLoading}
          />
          {isLoading && (
            <div className="absolute inset-0 px-6 py-5 space-y-3.5 animate-pulse pointer-events-none">
              <div className="h-3.5 bg-neutral-100 dark:bg-neutral-700/50 rounded-full w-3/4" />
              <div className="h-3.5 bg-neutral-100 dark:bg-neutral-700/50 rounded-full w-full" />
              <div className="h-3.5 bg-neutral-100 dark:bg-neutral-700/50 rounded-full w-5/6" />
              <div className="h-3.5 bg-neutral-100 dark:bg-neutral-700/50 rounded-full w-1/2" />
            </div>
          )}

          {/* Status pill (Bottom Left) */}
          <div className={`absolute bottom-3 left-6 flex items-center gap-2 min-w-0 pointer-events-none transition-opacity duration-300 rounded pb-1 ${isLoading ? 'opacity-0' : 'opacity-100'}`}>
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot}`} />
            <span className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400/80 dark:text-neutral-500/80 truncate">
              {statusText}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
