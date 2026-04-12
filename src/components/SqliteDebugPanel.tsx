"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAuthenticationStatus } from "@nhost/react";
import { useLocation } from "react-router-dom";
import { sql as dbSql, execRaw, initDb } from "@/lib/localDb";
import { fetchInterceptor, type ApiCall } from "@/lib/devFetchInterceptor";
import { getUiState, patchUiState } from "@/lib/uiState";

type Row = Record<string, unknown>;

interface QueryResult {
  columns: string[];
  rows: Row[];
  duration: number;
  error?: string;
}

const MIN_HEIGHT = 40;
const DEFAULT_HEIGHT = 320;
const MAX_HEIGHT = typeof window !== "undefined" ? window.innerHeight * 0.85 : 700;

export function SqliteDebugPanel() {
  const { isAuthenticated } = useAuthenticationStatus();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(() => getUiState().debugOpen ?? false);
  const [height, setHeight] = useState(() => getUiState().debugHeight ?? DEFAULT_HEIGHT);

  useEffect(() => {
    if (isAuthenticated) {
      patchUiState({ debugOpen: isOpen });
    }
  }, [isOpen, isAuthenticated]);

  useEffect(() => {
    patchUiState({ debugHeight: height });
  }, [height]);
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [activeTab, setActiveTab] = useState<"Browser SQLite" | "Network">("Browser SQLite");
  const [isLoading, setIsLoading] = useState(false);
  const [queryHistory, setQueryHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [apiCalls, setApiCalls] = useState<ApiCall[]>([]);
  const [selectedCall, setSelectedCall] = useState<ApiCall | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  // Track whether user deliberately picked a table vs auto-defaulted
  const userPickedTable = useRef(false);
  const lastPathForDefault = useRef<string | null>(null);

  const visibleCallCount = showSessions
    ? apiCalls.length
    : apiCalls.filter(c => !c.url.includes("session")).length;

  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const queryInputRef = useRef<HTMLTextAreaElement>(null);

  // Load table list
  const loadTables = useCallback(async () => {
    try {
      await initDb();
      const rows = await dbSql`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name` as Row[];
      setTables(rows.map((r) => String(r.name)));
    } catch (e) {
      console.error("Debug: Failed to load tables", e);
    }
  }, []);



  useEffect(() => {
    fetchInterceptor.install();
    const unsub = fetchInterceptor.subscribe(setApiCalls);
    return () => { unsub(); };
  }, []);

  // Auto-select the most recent visible call when on the Network tab
  useEffect(() => {
    if (activeTab !== "Network") return;
    const visible = showSessions
      ? apiCalls
      : apiCalls.filter(c => !c.url.includes("session"));
    if (visible.length > 0) {
      setSelectedCall(visible[visible.length - 1]);
    }
  }, [activeTab, apiCalls, showSessions]);

  // Browse table
  const browseTable = useCallback(async (tableName: string, fromUser = false) => {
    if (fromUser) userPickedTable.current = true;
    setSelectedTable(tableName);
    setIsLoading(true);
    const start = Date.now();
    try {
      // Inject rowid as a hidden robust reference for deletions
      const rows = await execRaw(`SELECT rowid as ___rowid, * FROM "${tableName}" LIMIT 200`);
      const columns = rows.length > 0 ? Object.keys(rows[0]).filter(c => c !== '___rowid') : [];
      setResult({ columns, rows, duration: Date.now() - start });
      setQuery(`SELECT * FROM "${tableName}" LIMIT 200`);
    } catch (e: any) {
      setResult({ columns: [], rows: [], duration: Date.now() - start, error: e.message });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    loadTables();
    const defaultTable = location.pathname.startsWith("/communities") ? "local_communities" : "entries";
    // Only auto-switch when:
    //   1. Panel just opened with no table selected yet
    //   2. Page context changed (different pathname) — even if user previously picked something
    const pathChanged = lastPathForDefault.current !== location.pathname;
    if (!selectedTable || (pathChanged && !userPickedTable.current)) {
      lastPathForDefault.current = location.pathname;
      browseTable(defaultTable);
    } else if (pathChanged) {
      // Context changed but user had explicitly picked — still update the ref so next auto-open respects new context
      lastPathForDefault.current = location.pathname;
      userPickedTable.current = false; // reset so next open picks the new context default
    }
  }, [isOpen, location.pathname]); // deliberately minimal deps — no result/selectedTable

  // Run SQL query
  const runQuery = useCallback(async (q?: string) => {
    const queryToRun = (q ?? query).trim();
    if (!queryToRun) return;
    setIsLoading(true);
    const start = Date.now();
    try {
      // If it's a simple SELECT *, try to inject rowid
      let actualQuery = queryToRun;
      if (/^SELECT\s+\*\s+FROM/i.test(queryToRun)) {
         actualQuery = queryToRun.replace(/^SELECT\s+\*\s+FROM/i, 'SELECT rowid as ___rowid, * FROM');
      }
      const rowArray = await execRaw(actualQuery);
      const columns = rowArray.length > 0 ? Object.keys(rowArray[0]).filter(c => c !== '___rowid') : [];
      setResult({ columns, rows: rowArray, duration: Date.now() - start });
      setQueryHistory((prev) => [queryToRun, ...prev.filter((h) => h !== queryToRun)].slice(0, 20));
      setHistoryIndex(-1);
      await loadTables();
    } catch (e: any) {
      setResult({ columns: [], rows: [], duration: Date.now() - start, error: e.message });
    } finally {
      setIsLoading(false);
    }
  }, [query, loadTables]);

  const handleDeleteRows = useCallback(async (rowsToDelete: Row[]) => {
      if (!selectedTable) return;
      try {
        const ids = rowsToDelete.map(r => Number(r['___rowid'])).filter(id => !isNaN(id));
        if (ids.length > 0) {
           await execRaw(`DELETE FROM "${selectedTable}" WHERE rowid IN (${ids.join(',')})`);
           runQuery(); // refresh current view
        }
      } catch (e: any) {
        alert("Failed to delete records: " + e.message);
      }
  }, [selectedTable, runQuery]);

  const refreshQuerySilent = useCallback(async () => {
    if (!query.trim()) return;
    try {
      const rowArray = await execRaw(query.trim());
      const columns = rowArray.length > 0 ? Object.keys(rowArray[0]) : [];
      setResult(prev => prev ? { ...prev, columns, rows: rowArray } : null);
    } catch {
      // suppress error on background silent refresh
    }
  }, [query]);

  // Real-time auto-refresh when db changes in background
  useEffect(() => {
    const onMutate = () => {
      if (isOpen && activeTab === "Browser SQLite") {
        refreshQuerySilent();
      }
    };
    window.addEventListener("sqlite-mutation", onMutate);
    return () => window.removeEventListener("sqlite-mutation", onMutate);
  }, [isOpen, activeTab, refreshQuerySilent]);

  // Export helpers
  const exportJSON = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result.rows, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `query-result-${Date.now()}.json`; a.click();
  };

  const exportCSV = () => {
    if (!result || result.columns.length === 0) return;
    const header = result.columns.join(",");
    const rows = result.rows.map((r) =>
      result.columns.map((c) => JSON.stringify(r[c] ?? "")).join(",")
    );
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `query-result-${Date.now()}.csv`; a.click();
  };

  // Drag to resize
  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    
    // If we're dragging from a closed state, the real starting height is the collapsed bar height (28px)
    const currentStartH = isOpen ? height : 28;
    dragRef.current = { startY: e.clientY, startHeight: currentStartH };
    
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = dragRef.current.startY - ev.clientY;
      const newH = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, dragRef.current.startHeight + delta));
      setHeight(newH);
      
      // If we crossed a small upward threshold while collapsed, explicitly open the drawer
      if (!isOpen && delta > 10) {
        setIsOpen(true);
      }
    };
    
    const onUp = (ev: MouseEvent) => {
      if (dragRef.current) {
        const delta = dragRef.current.startY - ev.clientY;
        const newH = dragRef.current.startHeight + delta;
        
        // If dragged very far down, treat as 'manually collapsed'
        if (newH < 120) {
          setIsOpen(false);
          setHeight(DEFAULT_HEIGHT); // Reset internal height for next open
        }
      }
      dragRef.current = null;
      setIsDragging(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [height, isOpen]);

  // Keyboard shortcuts in query input
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      runQuery();
    }
    if (e.key === "ArrowUp" && e.altKey) {
      const newIdx = Math.min(historyIndex + 1, queryHistory.length - 1);
      setHistoryIndex(newIdx);
      setQuery(queryHistory[newIdx] ?? "");
    }
    if (e.key === "ArrowDown" && e.altKey) {
      const newIdx = Math.max(historyIndex - 1, -1);
      setHistoryIndex(newIdx);
      setQuery(newIdx === -1 ? "" : queryHistory[newIdx]);
    }
  };

  const formatCell = (val: unknown): string => {
    if (val === null || val === undefined) return "NULL";
    if (typeof val === "object") return JSON.stringify(val);
    return String(val);
  };

  const actualHeight = isOpen ? height : 28; // Toggle bar is 28px thick

  if (!isAuthenticated) return null;
  
  return (
    <div 
      className={`fixed bottom-0 left-0 right-0 z-[9999] font-mono text-[12px] bg-[#1c1c1c] border-t border-[#3a3a3a] flex flex-col shadow-[0_-10px_40px_rgba(0,0,0,0.4)] ${isDragging ? "" : "transition-[height] duration-400 ease-[cubic-bezier(0.2,0.8,0.2,1)]"}`}
      style={{ height: actualHeight, userSelect: isDragging ? "none" : "auto" }}
    >
      {/* ── Drag Handle (Absolute Top Edge) ── */}
      <div
        className="absolute top-0 left-0 right-0 h-2 -translate-y-px cursor-ns-resize z-50 flex justify-center group pointer-events-auto"
        onMouseDown={onDragStart}
      >
        <div className="w-12 h-[3px] rounded-b-md transition-colors bg-[#333] group-hover:bg-[#3b82f6]" />
      </div>

      {/* ── Persistent Toggle Bar ── */}
      <div 
        className="flex items-center justify-between px-5 h-7 shrink-0 cursor-pointer select-none hover:bg-[#252525] transition-colors group relative border-b border-transparent data-[open=true]:border-[#2a2a2a]"
        data-open={isOpen}
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center h-full text-[#8e8e8e]">
          <span className={`text-[10px] font-mono font-bold tracking-widest uppercase mr-3 leading-none pb-px transition-colors ${isOpen ? "text-[#d4d4d4]" : "text-[#5e5e5e]"}`}>
            devtools
          </span>
          
          <div className="w-px h-3 bg-[#3a3a3a] mr-3" />
          
          <div className="flex items-center gap-1">
            {(["Browser SQLite", "Network"] as const).map((tab) => (
              <button key={tab} onClick={(e) => { e.stopPropagation(); setActiveTab(tab); if (!isOpen) setIsOpen(true); }}
                className={`text-[10px] font-mono px-2 h-5 rounded transition-all tracking-wide uppercase leading-none flex items-center ${
                  activeTab === tab
                    ? isOpen
                      ? "bg-[#282828] text-[#e5e5e5] shadow-sm"
                      : "bg-[#202020] text-[#7e7e7e]"
                    : "text-[#6e6e6e] hover:text-[#a0a0a0] hover:bg-[#202020]"
                }`}>
                {tab}
                {tab === "Network" && visibleCallCount > 0 && (
                  <span className={`ml-1.5 text-[9px] px-1 rounded-full transition-colors ${
                    isOpen ? "bg-[#283060] text-[#60a5fa]" : "bg-[#2a2a2a] text-[#5e5e5e]"
                  }`}>{visibleCallCount}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center h-full pr-1">
          <div className={`text-[#e5e5e5] transition-transform duration-300 flex items-center justify-center ${isOpen ? "rotate-180" : ""}`}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m18 15-6-6-6 6"/>
            </svg>
          </div>
        </div>
      </div>

      {/* ── Expanded Content Area ── */}
      <div className={`flex flex-col flex-1 overflow-hidden relative transition-opacity duration-300 ${isOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}>

        {/* Body Area */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar — tables */}
          {activeTab === "Browser SQLite" && (
            <div className="w-48 border-r border-[#303030] flex flex-col overflow-hidden shrink-0 bg-[#1c1c1c]">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#3a3a3a]">
                <span className="text-[10px] text-[#6e6e6e] uppercase tracking-wider font-semibold">Tables</span>
                <button onClick={loadTables} className="text-[10px] text-[#6e6e6e] hover:text-[#a0a0a0] transition-colors">↻</button>
              </div>
              <div className="flex-1 overflow-y-auto">
                {tables.length === 0 ? (
                  <div className="px-4 py-3 text-[#5e5e5e] text-[11px]">No tables found</div>
                ) : (
                  tables.map((t) => (
                    <button key={t} onClick={() => browseTable(t, true)}
                      className={`w-full text-left px-4 py-2.5 text-[11px] transition-colors flex items-center gap-2 ${
                        selectedTable === t
                          ? "bg-[#1e3360] text-[#60a5fa] border-l-2 border-[#3b82f6]"
                          : "text-[#a0a0a0] hover:bg-[#252525] hover:text-[#ccc] border-l-2 border-transparent"
                      }`}>
                      <span className="text-[10px] text-[#5e5e5e]">⊞</span>
                      <span className="truncate w-full">{t}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Main Content Renderers */}
          <div className="flex-1 flex flex-col overflow-hidden bg-[#181818]">
            {activeTab === "Network" && (
              <NetworkPane
                calls={apiCalls}
                selected={selectedCall}
                onSelect={setSelectedCall}
                onClear={() => { setApiCalls([]); setSelectedCall(null); }}
                showSessions={showSessions}
                onToggleSessions={() => setShowSessions(s => !s)}
              />
            )}

            {activeTab === "Browser SQLite" && (
              <div className="flex flex-col h-full relative">
                <div className="relative flex-shrink-0 border-b border-[#303030] bg-[#1c1c1c]">
                  <textarea
                    ref={queryInputRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="SELECT * FROM entries LIMIT 10  — ⌘↵ to run, Alt↑↓ for history"
                    className="w-full bg-transparent text-[12px] text-[#c9d1d9] placeholder:text-[#5e5e5e] px-4 py-4 resize-none focus:outline-none focus:ring-1 focus:ring-inset focus:ring-[#3b82f6]/20"
                    style={{ minHeight: 70, maxHeight: 180, height: 70 }}
                    rows={2}
                    spellCheck={false}
                  />
                  <div className="absolute right-4 bottom-3 flex items-center gap-2">
                    <span className="text-[10px] text-[#5e5e5e]">⌘↵</span>
                    <button
                      onClick={() => runQuery()}
                      disabled={isLoading || !query.trim()}
                      className="text-[11px] font-semibold px-3 py-1 bg-[#1d4ed8] text-white rounded disabled:opacity-30 hover:bg-[#2563eb] transition-colors shadow-sm"
                    >
                      {isLoading ? "Ext..." : "Run Query"}
                    </button>
                  </div>
                </div>
                
                {(!selectedTable && !query.trim() && !result) ? (
                  <div className="flex-1 flex items-center justify-center text-[#5e5e5e] text-[11px] bg-[#181818]">
                    Select a table from the sidebar or write a query
                  </div>
                ) : (
                  <ResultPane result={result} isLoading={isLoading} onExportJSON={exportJSON} onExportCSV={exportCSV} formatCell={formatCell} onDeleteRows={handleDeleteRows} canDelete={!!selectedTable && query.toUpperCase().includes('SELECT * FROM')} />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultPane({ result, isLoading, onExportJSON, onExportCSV, formatCell, onDeleteRows, canDelete }: {
  result: QueryResult | null;
  isLoading: boolean;
  onExportJSON: () => void;
  onExportCSV: () => void;
  formatCell: (v: unknown) => string;
  onDeleteRows: (rows: Row[]) => void;
  canDelete: boolean;
}) {
  const [selectedIndexes, setSelectedIndexes] = useState<Set<number>>(new Set());
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  // Clear selection if result changes
  useEffect(() => {
    setSelectedIndexes(new Set());
    setIsConfirmingDelete(false);
  }, [result]);

  const toggleRow = (idx: number) => {
    const newSet = new Set(selectedIndexes);
    if (newSet.has(idx)) newSet.delete(idx);
    else newSet.add(idx);
    setSelectedIndexes(newSet);
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-[#5e5e5e] text-[11px]">
        <span className="animate-pulse">Executing…</span>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex-1 flex items-center justify-center text-[#3a3a3a] text-[11px]">
        No results yet
      </div>
    );
  }

  if (result.error) {
    return (
      <div className="flex-1 p-4">
        <div className="text-[#f87171] text-[11px] bg-[#2c1616] rounded p-3 border border-[#522828]">
          <span className="text-[#ef4444] font-semibold">Error: </span>{result.error}
        </div>
      </div>
    );
  }

  if (result.rows.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-[#5e5e5e] text-[11px]">
        Query returned 0 rows ({result.duration}ms)
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Result toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#3a3a3a] shrink-0 bg-[#181818]">
        <div className="flex items-center gap-4">
           <span className="text-[10px] text-[#5e5e5e]">{result.rows.length} rows · {result.duration}ms</span>
           {canDelete && selectedIndexes.size > 0 && (
             <div className="flex items-center gap-2 border-l border-[#3a3a3a] pl-4">
               {isConfirmingDelete ? (
                 <>
                   <span className="text-[10px] text-[#f87171] font-semibold">Delete {selectedIndexes.size} record{selectedIndexes.size > 1 ? 's' : ''}?</span>
                   <button onClick={() => { onDeleteRows(Array.from(selectedIndexes).map(i => result.rows[i])); setIsConfirmingDelete(false); }} className="text-[10px] text-white bg-[#dc2626] hover:bg-[#b91c1c] px-2 py-0.5 rounded transition-colors shadow-sm">Yes</button>
                   <button onClick={() => setIsConfirmingDelete(false)} className="text-[10px] text-[#a0a0a0] hover:bg-[#2a2a2a] px-2 py-0.5 rounded transition-colors">No</button>
                 </>
               ) : (
                 <button onClick={() => setIsConfirmingDelete(true)} className="text-[10px] text-[#f87171] hover:text-[#fca5a5] hover:bg-[#3f1919] px-2 py-0.5 rounded transition-colors font-medium">Delete Selected ({selectedIndexes.size})</button>
               )}
             </div>
           )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onExportJSON}
            className="text-[10px] text-[#6e6e6e] hover:text-[#a0a0a0] px-2 py-0.5 rounded border border-[#333] hover:border-[#444] transition-colors">
            ↓ JSON
          </button>
          <button onClick={onExportCSV}
            className="text-[10px] text-[#6e6e6e] hover:text-[#a0a0a0] px-2 py-0.5 rounded border border-[#333] hover:border-[#444] transition-colors">
            ↓ CSV
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-[11px]">
          <thead className="sticky top-0 bg-[#222] z-10">
            <tr>
              {canDelete && <th className="text-center px-2 py-1.5 border-b border-[#303030] w-8"></th>}
              <th className="text-left px-3 py-1.5 text-[#6e6e6e] font-semibold border-b border-[#303030] w-8 text-center">#</th>
              {result.columns.map((col) => (
                <th key={col} className="text-left px-3 py-1.5 text-[10px] font-semibold text-[#60a5fa] border-b border-[#303030] whitespace-nowrap uppercase tracking-wider">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row, i) => (
              <tr key={i} className={`group border-b border-[#111] transition-colors ${selectedIndexes.has(i) ? 'bg-[#1e1b19] border-l-2 border-[#ea580c]' : 'hover:bg-[#232323]'}`}>
                {canDelete && (
                  <td className="px-2 py-1.5 text-center" onClick={(e) => e.stopPropagation()}>
                    <input 
                      type="checkbox" 
                      checked={selectedIndexes.has(i)} 
                      onChange={() => toggleRow(i)}
                      className="w-3 h-3 bg-transparent border-2 border-[#555] rounded-sm checked:bg-[#fb923c] checked:border-[#fb923c] outline-none cursor-pointer"
                    />
                  </td>
                )}
                <td className="px-3 py-1.5 text-[#4e4e4e] text-center text-[10px] group-hover:text-[#5e5e5e] truncate break-all w-8 cursor-pointer" onClick={() => canDelete && toggleRow(i)}>{i + 1}</td>
                {result.columns.map((col) => {
                  const val = row[col];
                  const isNull = val === null || val === undefined;
                  const isNum = typeof val === "number";
                  return (
                    <td key={col} className={`px-3 py-1.5 max-w-[240px] truncate ${
                      isNull ? "text-[#5e5e5e] italic" : isNum ? "text-[#f9a8d4]" : "text-[#d1d5db]"
                    }`} title={formatCell(val)}>
                      {formatCell(val)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Network Pane ────────────────────────────────────────────────────────────

function statusColor(status?: number) {
  if (!status) return "text-[#6e6e6e]";
  if (status < 300) return "text-[#4ade80]";
  if (status < 400) return "text-[#facc15]";
  return "text-[#f87171]";
}

function methodColor(method: string) {
  const m = method.toUpperCase();
  if (m === "GET") return "text-[#60a5fa]";
  if (m === "POST") return "text-[#a78bfa]";
  if (m === "PUT") return "text-[#fb923c]";
  if (m === "DELETE") return "text-[#f87171]";
  return "text-[#a0a0a0]";
}

function shortUrl(url: string) {
  try {
    const u = new URL(url, window.location.href);
    return u.pathname + (u.search || "");
  } catch {
    return url;
  }
}

function NetworkPane({
  calls, selected, onSelect, onClear, showSessions, onToggleSessions,
}: {
  calls: ApiCall[];
  selected: ApiCall | null;
  onSelect: (c: ApiCall) => void;
  onClear: () => void;
  showSessions: boolean;
  onToggleSessions: () => void;
}) {
  const [detailTab, setDetailTab] = useState<"response" | "request" | "headers">("response");

  const filteredCalls = calls.filter((c) => showSessions || !c.url.includes("session"));

  // Group consecutive identical requests
  const groupedCalls: (ApiCall & { count: number; groupIds: string[] })[] = [];
  filteredCalls.forEach(call => {
    const last = groupedCalls[groupedCalls.length - 1];
    if (last && last.method === call.method && last.url === call.url && Math.abs(last.startedAt - call.startedAt) < 2000) {
      last.count += 1;
      last.groupIds.push(call.id);
      // keep the latest status/duration for the group
      last.status = call.status ?? last.status;
      last.duration = call.duration ?? last.duration;
      last.responseBody = call.responseBody ?? last.responseBody;
    } else {
      groupedCalls.push({ ...call, count: 1, groupIds: [call.id] });
    }
  });

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Call list ── */}
      <div className="w-[280px] min-w-[280px] border-r border-[#303030] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-[#2a2a2a] shrink-0">
          <span className="text-[10px] text-[#6e6e6e] uppercase tracking-wider font-semibold">
            {filteredCalls.length} requests
          </span>
          <div className="flex gap-2 items-center">
            <button onClick={onToggleSessions}
              className={`text-[10px] px-1.5 py-1 rounded transition-colors border flex items-center gap-1 leading-none ${
                showSessions 
                  ? "border-[#4a4a4a] text-[#a0a0a0] bg-[#2a2a2a]" 
                  : "border-[#333] text-[#6e6e6e] hover:text-[#a0a0a0] bg-[#181818]"
              }`}>
              {showSessions ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                  <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                  <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                  <line x1="2" y1="2" x2="22" y2="22" />
                </svg>
              )}
              <span>Sessions</span>
            </button>
            <button onClick={onClear}
              className="text-[10px] text-[#6e6e6e] hover:text-[#a0a0a0] transition-colors border border-[#333] px-1.5 py-0.5 rounded">
              Clear
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredCalls.length === 0 ? (
            <div className="flex items-center justify-center h-full text-[#5e5e5e] text-[11px]">
              No requests yet
            </div>
          ) : (
            groupedCalls.map((call) => {
              const isSelected = selected && call.groupIds.includes(selected.id);
              return (
                <button key={call.id} onClick={() => onSelect(call)}
                  className={`w-full text-left px-3 py-2.5 border-b border-[#232323] transition-colors relative ${
                    isSelected
                      ? "bg-[#1e3360] border-l-2 border-l-[#60a5fa]"
                      : "hover:bg-[#232323]"
                  }`}>
                  
                  {call.count > 1 && (
                    <div className="absolute right-2 top-2 text-[9px] font-bold bg-[#3b82f6]/20 text-[#60a5fa] px-1.5 py-0.5 rounded-full">
                      x{call.count}
                    </div>
                  )}

                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-[10px] font-bold shrink-0 ${methodColor(call.method)}`}>
                      {call.method}
                    </span>
                    <span className={`text-[10px] font-semibold shrink-0 ${statusColor(call.status)}`}>
                      {call.status ?? (call.error ? "ERR" : "…")}
                    </span>
                    {call.duration != null && (
                      <span className="text-[10px] text-[#5e5e5e] ml-auto shrink-0">{call.duration}ms</span>
                    )}
                  </div>
                  <div className="text-[11px] text-[#a0a0a0] truncate">{shortUrl(call.url)}</div>
                  <div className="text-[10px] text-[#5e5e5e] mt-0.5">
                    {new Date(call.startedAt).toLocaleTimeString()}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── Detail pane ── */}
      {selected ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Summary header */}
          <div className="shrink-0 px-4 py-2.5 border-b border-[#303030] bg-[#181818]">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className={`text-[11px] font-bold ${methodColor(selected.method)}`}>{selected.method}</span>
              <span className={`text-[11px] font-semibold ${statusColor(selected.status)}`}>
                {selected.status} {selected.statusText}
              </span>
              {selected.duration != null && (
                <span className="text-[10px] text-[#5e5e5e]">{selected.duration}ms</span>
              )}
              {selected.completedAt && (
                <span className="text-[10px] text-[#5e5e5e]">· {new Date(selected.completedAt).toLocaleTimeString()}</span>
              )}
            </div>
            <div className="text-[11px] text-[#a0a0a0] break-all font-mono">{selected.url}</div>
          </div>

          {/* Sub-tabs */}
          <div className="shrink-0 flex gap-1 px-3 py-1.5 border-b border-[#2a2a2a] bg-[#1c1c1c]">
            {(["response", "request", "headers"] as const).map((t) => (
              <button key={t} onClick={() => setDetailTab(t)}
                className={`text-[10px] px-2.5 py-1 rounded uppercase tracking-wider font-semibold transition-colors ${
                  detailTab === t ? "bg-[#282828] text-[#e5e5e5]" : "text-[#6e6e6e] hover:text-[#a0a0a0]"
                }`}>{t}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto">
            {selected.error && (
              <div className="m-3 p-3 bg-[#2c1616] border border-[#522828] rounded text-[#f87171] text-[11px]">
                <span className="font-semibold">Network Error: </span>{selected.error}
              </div>
            )}

            {detailTab === "response" && (
              <div className="p-4 font-mono text-[11px] leading-relaxed overflow-auto">
                {selected.responseBody
                  ? <JsonHighlight text={selected.responseBody} />
                  : <span className="text-[#5e5e5e] italic">{selected.completedAt ? "(empty body)" : "Waiting for response…"}</span>
                }
              </div>
            )}

            {detailTab === "request" && (
              <div className="p-4 font-mono text-[11px] leading-relaxed overflow-auto">
                {selected.requestBody
                  ? <JsonHighlight text={(() => { try { return JSON.stringify(JSON.parse(selected.requestBody), null, 2); } catch { return selected.requestBody; } })()} />
                  : <span className="text-[#5e5e5e] italic">(no body)</span>
                }
              </div>
            )}

            {detailTab === "headers" && (
              <div className="p-3 space-y-5 text-[11px]">
                {[
                  { label: "Request Headers", data: selected.requestHeaders, color: "text-[#60a5fa]" },
                  { label: "Response Headers", data: selected.responseHeaders ?? {}, color: "text-[#4ade80]" },
                ].map(({ label, data, color }) =>
                  Object.keys(data ?? {}).length > 0 ? (
                    <section key={label}>
                      <div className="text-[10px] uppercase tracking-wider text-[#6e6e6e] font-semibold mb-2">{label}</div>
                      <table className="w-full border-collapse">
                        <tbody>
                          {Object.entries(data ?? {}).map(([k, v]) => (
                            <tr key={k} className="border-b border-[#232323]">
                              <td className={`py-1.5 pr-4 font-semibold whitespace-nowrap align-top w-48 ${color}`}>{k}</td>
                              <td className="py-1.5 text-[#a0a0a0] break-all">{v}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </section>
                  ) : null
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-[#4e4e4e] text-[11px]">
          Select a request to inspect
        </div>
      )}
    </div>
  );
}

// ─── JSON Syntax Highlighter ─────────────────────────────────────────────────

function JsonHighlight({ text }: { text: string }) {
  let pretty = text;
  try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch { /* raw */ }

  // Split on tokens: key strings (with colon), value strings, booleans, null, numbers, punctuation
  const TOKEN_RE = /("(?:[^"\\]|\\.)*"\s*:?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}\[\],])/g;
  const parts: { text: string; type: string }[] = [];
  let lastIdx = 0;

  for (const match of pretty.matchAll(TOKEN_RE)) {
    if (match.index! > lastIdx) {
      parts.push({ text: pretty.slice(lastIdx, match.index), type: "plain" });
    }
    const tok = match[0];
    let type = "plain";
    if (/^".*"\s*:$/.test(tok)) type = "key";
    else if (/^".*"$/.test(tok))  type = "string";
    else if (tok === "true" || tok === "false") type = "bool";
    else if (tok === "null")  type = "null";
    else if (/^-?\d/.test(tok))   type = "number";
    else if (/^[{}\[\],]$/.test(tok)) type = "punct";
    parts.push({ text: tok, type });
    lastIdx = match.index! + tok.length;
  }
  if (lastIdx < pretty.length) parts.push({ text: pretty.slice(lastIdx), type: "plain" });

  const colorMap: Record<string, string> = {
    key:    "text-[#60a5fa]",   // blue — object keys
    string: "text-[#a5d6ff]",   // light blue — string values
    bool:   "text-[#fb923c]",   // orange — true/false
    null:   "text-[#f472b6]",   // pink — null
    number: "text-[#f9a8d4]",   // rose — numbers
    punct:  "text-[#5e5e5e]",   // grey — { } [ ] ,
    plain:  "text-[#d1d5db]",   // default
  };

  return (
    <pre className="whitespace-pre-wrap break-all">
      {parts.map((p, i) => {
        // Key: split the colon off so we can color it separately
        if (p.type === "key") {
          const colonIdx = p.text.lastIndexOf(":");
          const keyPart = p.text.slice(0, colonIdx);
          return (
            <span key={i}>
              <span className="text-[#60a5fa]">{keyPart}</span>
              <span className="text-[#5e5e5e]">:</span>
            </span>
          );
        }
        return <span key={i} className={colorMap[p.type] ?? "text-[#d1d5db]"}>{p.text}</span>;
      })}
    </pre>
  );
}
