"use client";

import { useState, useEffect } from "react";
import { useDebouncedCallback } from "use-debounce";
import { format } from "date-fns";

export function JournalEditor() {
  const [content, setContent] = useState("");
  const [sha, setSha] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<"synced" | "saving" | "error" | "unsaved">("synced");
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  
  const today = format(new Date(), "yyyy-MM-dd");

  // Load today's entry
  useEffect(() => {
    async function loadEntry() {
      try {
        const res = await fetch(`/api/vault/entry?date=${today}`);
        if (res.ok) {
          const data = await res.json();
          setContent(data.content || "");
          setSha(data.sha);
        }
      } catch (e) {
        console.error("Failed to load entry", e);
      } finally {
        setLoading(false);
      }
    }
    loadEntry();
  }, [today]);

  const saveToGithub = async (textToSave: string, currentSha: string | null) => {
    setSyncStatus("saving");
    try {
      const res = await fetch("/api/vault/entry", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: today,
          content: textToSave,
          sha: currentSha,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSha(data.sha);
        setLastSynced(new Date());
        setSyncStatus("synced");
      } else {
        setSyncStatus("error");
      }
    } catch (e) {
      setSyncStatus("error");
    }
  };

  const debouncedSave = useDebouncedCallback((text: string, currentSha: string | null) => {
    saveToGithub(text, currentSha);
  }, 2000); // 2 second debounce

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setContent(newContent);
    setSyncStatus("unsaved");
    debouncedSave(newContent, sha);
  };

  const handleManualSave = () => {
    // Cancel the debounce if manual save is triggered
    debouncedSave.cancel();
    saveToGithub(content, sha);
  };

  if (loading) {
    return <div className="animate-pulse space-y-4">
        <div className="h-6 w-1/3 bg-neutral-200 dark:bg-neutral-800 rounded"></div>
        <div className="h-64 bg-neutral-200 dark:bg-neutral-800 rounded"></div>
    </div>;
  }

  return (
    <div className="flex flex-col space-y-4 h-full">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-medium tracking-tight">Today {format(new Date(), "MMMM do, yyyy")}</h2>
        
        <div className="flex items-center space-x-4">
          <span className="text-xs text-neutral-500">
            {syncStatus === "saving" && "Saving..."}
            {syncStatus === "error" && "Sync Failed ❌"}
            {syncStatus === "unsaved" && "Unsaved changes"}
            {syncStatus === "synced" && lastSynced && `Last synced at ${format(lastSynced, "h:mm a")}`}
          </span>
          <button 
            onClick={handleManualSave}
            disabled={syncStatus === "synced" && content.length > 0}
            className="text-sm px-3 py-1.5 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-black rounded-md disabled:opacity-50 hover:opacity-80 transition"
          >
            Save to GitHub
          </button>
        </div>
      </div>

      <textarea
        className="flex-1 w-full min-h-[400px] p-4 bg-transparent border border-neutral-200 dark:border-neutral-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-600 resize-none font-mono leading-relaxed"
        placeholder="What's on your mind today?"
        value={content}
        onChange={handleChange}
      />
    </div>
  );
}
