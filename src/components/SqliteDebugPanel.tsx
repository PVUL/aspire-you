"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { sql as dbSql, execRaw } from "@/lib/localDb";
import { fetchInterceptor, type ApiCall } from "@/lib/devFetchInterceptor";

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
  const [isOpen, setIsOpen] = useState(false);
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [activeTab, setActiveTab] = useState<"browser" | "query" | "network">("browser");
  const [isLoading, setIsLoading] = useState(false);
  const [queryHistory, setQueryHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [apiCalls, setApiCalls] = useState<ApiCall[]>([]);
  const [selectedCall, setSelectedCall] = useState<ApiCall | null>(null);

  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const queryInputRef = useRef<HTMLTextAreaElement>(null);

  // Load table list
  const loadTables = useCallback(async () => {
    try {
      const rows = await dbSql`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name` as Row[];
      setTables(rows.map((r) => String(r.name)));
    } catch (e) {
      console.error("Debug: Failed to load tables", e);
    }
  }, []);

  useEffect(() => {
    if (isOpen) loadTables();
  }, [isOpen, loadTables]);

  useEffect(() => {
    fetchInterceptor.install();
    const unsub = fetchInterceptor.subscribe(setApiCalls);
    return () => { unsub(); };
  }, []);

  // Browse table
  const browseTable = useCallback(async (tableName: string) => {
    setSelectedTable(tableName);
    setIsLoading(true);
    const start = Date.now();
    try {
      const rows = await execRaw(`SELECT * FROM "${tableName}" LIMIT 200`);
      const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
      setResult({ columns, rows, duration: Date.now() - start });
      setQuery(`SELECT * FROM "${tableName}" LIMIT 200`);
    } catch (e: any) {
      setResult({ columns: [], rows: [], duration: Date.now() - start, error: e.message });
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Run SQL query
  const runQuery = useCallback(async (q?: string) => {
    const queryToRun = (q ?? query).trim();
    if (!queryToRun) return;
    setIsLoading(true);
    const start = Date.now();
    try {
      const rowArray = await execRaw(queryToRun);
      const columns = rowArray.length > 0 ? Object.keys(rowArray[0]) : [];
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
    dragRef.current = { startY: e.clientY, startHeight: height };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = dragRef.current.startY - ev.clientY;
      const newH = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, dragRef.current.startHeight + delta));
      setHeight(newH);
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [height]);

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

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[9999] font-mono text-[12px]" style={{ userSelect: dragRef.current ? "none" : "auto" }}>
      {/* ── Collapsed bar ── */}
      {!isOpen && (
        <div className="flex items-center justify-between px-4 h-9 bg-[#1c1c1c] border-t border-[#3a3a3a] cursor-pointer select-none"
          onClick={() => setIsOpen(true)}>
          <div className="flex items-center gap-3 text-[#a0a0a0]">
            <span className="text-[10px] border border-[#333] px-1.5 py-0.5 rounded text-[#60a5fa] border-[#283060]">DEV</span>
            <span className="text-[11px]">Devtools</span>
            <span className="text-[10px] text-[#6e6e6e]">{tables.length} tables · {apiCalls.length} requests</span>
          </div>
          <span className="text-[#5e5e5e] text-[10px]">▴</span>
        </div>
      )}

      {/* ── Expanded panel ── */}
      {isOpen && (
        <div className="flex flex-col bg-[#1c1c1c] border-t border-[#3a3a3a] overflow-hidden"
          style={{ height }}>
          {/* Drag handle */}
          <div
            className="h-1 cursor-ns-resize hover:bg-[#3b82f6] transition-colors flex-shrink-0 group"
            style={{ background: "transparent" }}
            onMouseDown={onDragStart}
          >
            <div className="mx-auto mt-0.5 w-12 h-0.5 rounded-full bg-[#444] group-hover:bg-[#3b82f6] transition-colors" />
          </div>

          {/* Header */}
          <div className="flex items-center px-3 py-2 border-b border-[#303030] shrink-0 gap-4">
            {/* Brand */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] border border-[#283060] px-1.5 py-0.5 rounded text-[#60a5fa]">DEV</span>
              <span className="text-[11px] text-[#6e6e6e] font-semibold tracking-wide uppercase">Devtools</span>
            </div>
            <div className="w-px h-4 bg-[#2a2a2a]" />
            {/* Tabs — left aligned */}
            <div className="flex items-center gap-1 flex-1">
              {(["browser", "query", "network"] as const).map((tab) => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`text-[10px] px-2.5 py-1 rounded transition-colors font-semibold tracking-wide uppercase ${
                    activeTab === tab
                      ? "bg-[#282828] text-[#e5e5e5]"
                      : "text-[#6e6e6e] hover:text-[#a0a0a0]"
                  }`}>
                  {tab}{tab === "network" && apiCalls.length > 0 && (
                    <span className="ml-1 text-[9px] bg-[#283060] text-[#60a5fa] px-1 py-0.5 rounded">{apiCalls.length}</span>
                  )}
                </button>
              ))}
            </div>
            {/* Close */}
            <button onClick={() => setIsOpen(false)}
              className="text-[#6e6e6e] hover:text-[#e5e5e5] transition-colors px-1 shrink-0">✕</button>
          </div>

          {/* Body */}
          <div className="flex flex-1 overflow-hidden">
            {/* Sidebar — tables */}
            <div className="w-48 border-r border-[#303030] flex flex-col overflow-hidden flex-shrink-0">
              <div className="flex items-center justify-between px-3 py-2 border-b border-[#3a3a3a]">
                <span className="text-[10px] text-[#6e6e6e] uppercase tracking-wider font-semibold">Tables</span>
                <button onClick={loadTables}
                  className="text-[10px] text-[#6e6e6e] hover:text-[#a0a0a0] transition-colors">↻</button>
              </div>
              <div className="flex-1 overflow-y-auto">
                {tables.length === 0 ? (
                  <div className="px-3 py-3 text-[#5e5e5e] text-[11px]">No tables found</div>
                ) : (
                  tables.map((t) => (
                    <button key={t} onClick={() => { setActiveTab("browser"); browseTable(t); }}
                      className={`w-full text-left px-3 py-2 text-[11px] transition-colors flex items-center gap-2 ${
                        selectedTable === t
                          ? "bg-[#1e3360] text-[#60a5fa]"
                          : "text-[#a0a0a0] hover:bg-[#232323] hover:text-[#ccc]"
                      }`}>
                      <span className="text-[9px] text-[#5e5e5e]">⊞</span>
                      <span className="truncate">{t}</span>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Main area */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Query tab */}
              {activeTab === "query" && (
                <div className="flex flex-col h-full">
                  <div className="relative flex-shrink-0 border-b border-[#303030]">
                    <textarea
                      ref={queryInputRef}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="SELECT * FROM entries LIMIT 10  — ⌘↵ to run, Alt↑↓ for history"
                      className="w-full bg-transparent text-[12px] text-[#c9d1d9] placeholder:text-[#5e5e5e] px-4 py-3 resize-none focus:outline-none"
                      style={{ minHeight: 80, maxHeight: 160, height: 80 }}
                      rows={3}
                      spellCheck={false}
                    />
                    <div className="absolute right-3 bottom-3 flex items-center gap-2">
                      <span className="text-[10px] text-[#5e5e5e]">⌘↵</span>
                      <button
                        onClick={() => runQuery()}
                        disabled={isLoading || !query.trim()}
                        className="text-[10px] font-semibold px-2.5 py-1 bg-[#1d4ed8] text-white rounded disabled:opacity-30 hover:bg-[#2563eb] transition-colors"
                      >
                        {isLoading ? "..." : "Run"}
                      </button>
                    </div>
                  </div>
                  <ResultPane result={result} isLoading={isLoading} onExportJSON={exportJSON} onExportCSV={exportCSV} formatCell={formatCell} />
                </div>
              )}

              {activeTab === "network" && (
                <NetworkPane
                  calls={apiCalls}
                  selected={selectedCall}
                  onSelect={setSelectedCall}
                  onClear={() => { fetchInterceptor.clear(); setSelectedCall(null); }}
                />
              )}

              {/* Browser tab */}
              {activeTab === "browser" && (
                <div className="flex flex-col h-full">
                  {!selectedTable ? (
                    <div className="flex-1 flex items-center justify-center text-[#5e5e5e] text-[11px]">
                      Select a table from the sidebar
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between px-3 py-2 border-b border-[#3a3a3a] flex-shrink-0">
                        <span className="text-[#6e6e6e]">
                          <span className="text-[#60a5fa]">{selectedTable}</span>
                          {result && !result.error && (
                            <span className="ml-2 text-[#5e5e5e]">— {result.rows.length} rows in {result.duration}ms</span>
                          )}
                        </span>
                        <div className="flex gap-2">
                          <button onClick={() => browseTable(selectedTable)}
                            className="text-[10px] text-[#6e6e6e] hover:text-[#a0a0a0] transition-colors px-2">↻</button>
                          <button onClick={() => { setActiveTab("query"); queryInputRef.current?.focus(); }}
                            className="text-[10px] text-[#6e6e6e] hover:text-[#a0a0a0] transition-colors px-2">Edit SQL</button>
                        </div>
                      </div>
                      <ResultPane result={result} isLoading={isLoading} onExportJSON={exportJSON} onExportCSV={exportCSV} formatCell={formatCell} />
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ResultPane({ result, isLoading, onExportJSON, onExportCSV, formatCell }: {
  result: QueryResult | null;
  isLoading: boolean;
  onExportJSON: () => void;
  onExportCSV: () => void;
  formatCell: (v: unknown) => string;
}) {
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
        <span className="text-[10px] text-[#5e5e5e]">{result.rows.length} rows · {result.duration}ms</span>
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
              <tr key={i} className="hover:bg-[#232323] group border-b border-[#111] transition-colors">
                <td className="px-3 py-1.5 text-[#4e4e4e] text-center text-[10px] group-hover:text-[#5e5e5e]">{i + 1}</td>
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
  calls, selected, onSelect, onClear,
}: {
  calls: ApiCall[];
  selected: ApiCall | null;
  onSelect: (c: ApiCall) => void;
  onClear: () => void;
}) {
  const [detailTab, setDetailTab] = useState<"response" | "request" | "headers">("response");

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Call list ── */}
      <div className="w-[280px] min-w-[280px] border-r border-[#303030] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-[#2a2a2a] shrink-0">
          <span className="text-[10px] text-[#6e6e6e] uppercase tracking-wider font-semibold">
            {calls.length} requests
          </span>
          <button onClick={onClear}
            className="text-[10px] text-[#6e6e6e] hover:text-[#a0a0a0] transition-colors border border-[#333] px-1.5 py-0.5 rounded">
            Clear
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {calls.length === 0 ? (
            <div className="flex items-center justify-center h-full text-[#5e5e5e] text-[11px]">
              No requests yet
            </div>
          ) : (
            calls.map((call) => (
              <button key={call.id} onClick={() => onSelect(call)}
                className={`w-full text-left px-3 py-2.5 border-b border-[#232323] transition-colors ${
                  selected?.id === call.id
                    ? "bg-[#1e3360] border-l-2 border-l-[#60a5fa]"
                    : "hover:bg-[#232323]"
                }`}>
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
            ))
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
