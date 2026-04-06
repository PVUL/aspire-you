import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useNhostClient, useUserData, useAuthenticationStatus, useAccessToken } from "@nhost/react";
import { sql } from "@/lib/localDb";

export default function CommunityDraft() {
  const { slug: existingSlug } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuthenticationStatus();
  const user = useUserData();
  const nhost = useNhostClient();
  const accessToken = useAccessToken();

  // Stable ID to prevent SQLite row-duplication on keystrokes, and session persistence across page reloads
  const [draftId] = useState(() => {
    if (existingSlug) return existingSlug;
    const stored = sessionStorage.getItem('activeDraftId');
    if (stored) return stored;
    const newId = crypto.randomUUID();
    sessionStorage.setItem('activeDraftId', newId);
    return newId;
  });

  const [displayName, setDisplayName] = useState('');
  const [repoSlug, setRepoSlug] = useState('');
  const [isSlugDecoupled, setIsSlugDecoupled] = useState(false);
  const [missions, setMissions] = useState<string[]>(['']); // note 'mission' is singular, cannot have more than one mission
  const [values, setValues] = useState<string[]>([]);
  const [valueInput, setValueInput] = useState('');
  const [isAddingValue, setIsAddingValue] = useState(false);


  const [isPublishing, setIsPublishing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [isCheckingSlug, setIsCheckingSlug] = useState(false);
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);

  // Initial Data Load & SQLite Hydration
  useEffect(() => {
    async function loadHydrationData() {
      if (!isAuthenticated || !user) return;
      try {
        const res = await sql`SELECT content FROM local_communities WHERE slug = ${'draft-' + draftId}`;
        if (res.length > 0 && res[0].content) {
          const data = typeof res[0].content === 'string' ? JSON.parse(res[0].content) : res[0].content;
          if (data.displayName) setDisplayName(data.displayName);
          if (data.repoSlug) { setRepoSlug(data.repoSlug); setIsSlugDecoupled(true); }
          if (data.missions && data.missions.length) setMissions(data.missions);
          if (data.values && data.values.length) setValues(data.values);
          if (data.slugAvailable !== undefined) setSlugAvailable(data.slugAvailable);
        } else if (existingSlug) {
          // Fallback for passing via URL directly
          setRepoSlug(existingSlug);
          setDisplayName(existingSlug);
        }
      } catch (err) {
        console.error("Failed to hydrate from sqlite:", err);
      }
    }
    loadHydrationData();
  }, [existingSlug, isAuthenticated, user, draftId]);

  const [githubUsername, setGithubUsername] = useState<string | null>(() => localStorage.getItem('aspire_gh_username'));

  useEffect(() => {
    if (!isAuthenticated || !accessToken || githubUsername) return;
    const backendUrl = import.meta.env.DEV ? '/nhost-fn' : nhost.functions.url;
    fetch(`${backendUrl}/vault/github_user`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data.username) {
           setGithubUsername(data.username);
           localStorage.setItem('aspire_gh_username', data.username);
        }
      })
      .catch(err => console.error("Could not load github username", err));
  }, [isAuthenticated, accessToken, nhost.functions.url, githubUsername]);

  const [activeField, setActiveField] = useState<string | null>(null);

  const handleDisplayNameChange = (val: string) => {
    setDisplayName(val);
    if (!isSlugDecoupled) {
      const generated = val.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
      setRepoSlug(generated);
      setSlugAvailable(null);
    }
  };

  const handleSlugChange = (val: string) => {
    setRepoSlug(val.toLowerCase().replace(/[^a-z0-9-]/g, ''));
    setIsSlugDecoupled(true);
    setSlugAvailable(null);
  };

  const verifySlug = async () => {
    if (!repoSlug) return;
    setIsCheckingSlug(true);
    setSlugAvailable(null);
    try {
      // Check DB first
      const res = await nhost.graphql.request(`
          query CheckCollision($slug: String!) {
            communities(where: {slug: {_eq: $slug}}) { id }
          }
        `, { slug: repoSlug });

      if ((res.data?.communities || []).length > 0) {
        setSlugAvailable(false);
        return;
      }

      // Check Physical GitHub availability
      const backendUrl = import.meta.env.DEV ? '/nhost-fn' : nhost.functions.url;
      const ghRes = await fetch(`${backendUrl}/vault/check_repo?slug=${repoSlug}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const ghData = await ghRes.json();

      setSlugAvailable(ghData.available === true);
    } catch (err) {
      console.error("Collision check failed", err);
    } finally {
      setIsCheckingSlug(false);
    }
  };

  const commitValue = useCallback(() => {
    const val = valueInput.trim();
    if (val && values.length < 6 && !values.includes(val)) {
      setValues([...values, val]);
      setValueInput('');
      setIsAddingValue(false);
    }
  }, [valueInput, values]);

  const handleAddValue = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commitValue();
    }
  };

  const removeValue = (v: string) => {
    setValues(values.filter(x => x !== v));
  };

  const saveLocalDraft = useCallback(async () => {
    if (!repoSlug) return;
    setIsSaving(true);
    try {
      const draftContent = JSON.stringify({ displayName, repoSlug, missions, values, slugAvailable });
      const now = Date.now();
      await sql`
         INSERT OR REPLACE INTO local_communities (slug, content, updated_at) 
         VALUES (${'draft-' + draftId}, ${draftContent}, ${now})
       `;
    } catch (e) {
      console.error("Failed to save local draft", e);
    } finally {
      setIsSaving(false);
    }
  }, [displayName, repoSlug, missions, values, slugAvailable, draftId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (repoSlug) saveLocalDraft();
    }, 2000);
    return () => clearTimeout(timer);
  }, [displayName, repoSlug, missions, values, slugAvailable, saveLocalDraft]);

  const realMissions = missions.filter(m => m.trim() !== '');

  const rules = {
    hasName: displayName.trim().length > 0 && activeField !== 'name',
    hasSlug: repoSlug.trim().length > 0 && slugAvailable === true,
    hasMission: realMissions.length > 0 && activeField !== 'mission',
    hasValue: values.length > 0
  };

  const canPublish = Object.values(rules).every(Boolean);

  const handlePublish = async () => {
    setErrorMsg('');
    if (!canPublish) return;

    setIsPublishing(true);
    try {
      const backendUrl = import.meta.env.DEV ? '/nhost-fn' : nhost.functions.url;

      // 1. DB Collision Check
      const collisionRes = await nhost.graphql.request(`
        query CheckCollision($slug: String!) {
          communities(where: {slug: {_eq: $slug}}) { id }
        }
      `, { slug: repoSlug });

      if ((collisionRes.data?.communities || []).length > 0) {
        setSlugAvailable(false);
        throw new Error(`Repository slug "${repoSlug}" is already taken by another community.`);
      }

      // 2. Final GitHub availability check (guards against race conditions)
      try {
        const checkRes = await fetch(`${backendUrl}/vault/check_repo?slug=${encodeURIComponent(repoSlug)}`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        const checkData = await checkRes.json();
        if (checkData.available === false) {
          setSlugAvailable(false);
          throw new Error(`A repository named "${repoSlug}" already exists on your GitHub account. Please choose a different name.`);
        }
      } catch (checkErr: any) {
        // If the check itself threw (not our availability error), re-throw
        if (checkErr.message?.includes('already exists')) throw checkErr;
        console.warn("GitHub availability pre-check failed, proceeding anyway:", checkErr.message);
      }

      // 3. Provision Repo
      const res = await fetch(`${backendUrl}/vault/provision_community`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: repoSlug,
          name: displayName,
          missions: realMissions,
          values: values.map(v => ({ term: v, description: "" }))
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        if (data?.details?.includes('timeout') || res.status === 504) {
          throw new Error("Connection Timeout reaching GitHub. Please try again in a moment.");
        }
        throw new Error(data.error || data.details || "Failed to provision repository.");
      }

      // 3. Extract DB IDs provisioned server-side (community + mission/value edges done with admin secret)
      const newCommId: string = data.community_id;
      if (!newCommId) throw new Error("Failed to retrieve community ID from provisioning response.");

      // 4. Format internal markdown representation matching Communities hub exact schema
      const mdContent = `---
type: community
id: ${newCommId}
name: ${displayName}
joined_at: ${new Date().toISOString().slice(0, 16).replace('T', ' ')}
---

# ${displayName} (@${repoSlug})

A community joined on the Aspire Network.
${realMissions.length ? `\n## Missions\n` + realMissions.map((m: string) => `- ${m}`).join('\n') + '\n' : ''}${values.length ? `\n## Core Values\n` + values.map((v: string) => `- **${v}**`).join('\n') + '\n' : ''}`;

      // 5. Update vault (aspire-vault submodule link + README)
      await fetch(`${backendUrl}/vault/community`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: repoSlug, content: mdContent, commit_sha: data.commit_sha })
      });

      // 6. Cleanup draft SQLite row, insert live community row
      await sql`DELETE FROM local_communities WHERE slug = ${'draft-' + draftId}`;
      sessionStorage.removeItem('activeDraftId');

      await sql`
         INSERT OR REPLACE INTO local_communities (slug, content, sha, last_synced_at, updated_at) 
         VALUES (${repoSlug}, ${mdContent}, NULL, ${Date.now()}, ${Date.now()})
      `;

      // Navigate to live community hub for now, wait until live route is built
      navigate(`/communities`, { replace: true });

    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "An unexpected error occurred during publish.");
    } finally {
      setIsPublishing(false);
    }
  };

  if (isAuthLoading) return <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-[#1a1a1a] text-neutral-400"><span className="animate-pulse">Loading...</span></div>;
  if (!isAuthenticated) return <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-[#1a1a1a] text-neutral-500">Please sign in.</div>;

  return (
    <main className="min-h-screen flex flex-col bg-neutral-50 dark:bg-[#111111]">
      {/* ── Top Navigation ── */}
      <nav className="shrink-0 flex items-center justify-between px-6 h-14 border-b border-neutral-200/60 dark:border-neutral-800/60 bg-white/80 dark:bg-[#191919] backdrop-blur-sm sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-bold tracking-tight text-neutral-900 dark:text-neutral-100">Aspire You</h1>
          <span className="text-[10px] font-semibold tracking-widest uppercase text-neutral-400 dark:text-neutral-500">
            / Communities / Drafting Workspace
          </span>
        </div>
        <div className="flex items-center gap-4">
          {isSaving && <span className="text-[10px] font-medium text-neutral-400 dark:text-neutral-500 animate-pulse hidden sm:inline-block">Syncing SQLite...</span>}
          <button onClick={() => navigate('/communities')} className="text-[11px] font-medium px-3 py-1.5 rounded-lg text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 dark:hover:bg-neutral-800/80 dark:hover:text-neutral-200 transition-colors">
            Exit Draft
          </button>
        </div>
      </nav>

      <div className="max-w-6xl w-full mx-auto px-6 py-10">
        {errorMsg && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 text-red-600 dark:text-red-400 text-sm flex items-center gap-2">
            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="mb-12 pl-2 max-w-2xl">
          <div className="mb-6">
            <label className="block text-[10px] font-bold tracking-widest uppercase text-neutral-400 dark:text-neutral-500 mb-2.5 ml-1">Community Display Name</label>
            <input
              value={displayName}
              onFocus={() => setActiveField('name')}
              onBlur={() => setActiveField(null)}
              onChange={e => handleDisplayNameChange(e.target.value)}
              placeholder="e.g. Deep Thinkers Network"
              className="w-full text-4xl sm:text-5xl font-extrabold tracking-tight text-neutral-900 dark:text-neutral-100 bg-transparent outline-none placeholder-neutral-200 dark:placeholder-neutral-800 leading-none"
            />
          </div>

          <div className="bg-white dark:bg-[#1a1a1a] rounded-xl border border-neutral-200/60 dark:border-neutral-800/60 p-5 mt-8 shadow-[0_4px_20px_rgb(0,0,0,0.03)] dark:shadow-[0_4px_20px_rgb(0,0,0,0.2)]">
            <div className="flex items-center justify-between mb-3">
              <div>
                <label className="block text-[11px] font-bold tracking-widest uppercase text-neutral-900 dark:text-neutral-200">Repository Name</label>
                <p className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-1">Used to index your dedicated GitHub Vault Repository.</p>
              </div>
              <div className="flex items-center gap-2 h-[24px]">
                {isCheckingSlug ? (
                  <span className="text-neutral-400 text-[10px] flex items-center font-medium gap-1.5"><span className="w-3 h-3 rounded-full border-2 border-neutral-400/40 border-t-neutral-400 animate-spin" /> Verifying...</span>
                ) : slugAvailable === true ? (
                  <span className="text-green-500 text-[10px] flex items-center font-bold gap-1"><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg> Available</span>
                ) : slugAvailable === false ? (
                  <span className="text-red-500 text-[10px] flex items-center font-bold gap-1"><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg> Taken</span>
                ) : null}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-[15px] font-mono px-3.5 py-2.5 bg-neutral-50 dark:bg-[#121212] border border-neutral-200/80 dark:border-neutral-700/60 rounded-lg focus-within:ring-2 focus-within:ring-blue-500/30 focus-within:border-blue-500 transition-all flex-1 overflow-hidden">
                <span className="select-none text-neutral-400 dark:text-neutral-600 truncate shrink-0 max-w-[150px] sm:max-w-none">github.com/{githubUsername || '...'}/</span>
                <input
                  value={repoSlug}
                  onChange={e => handleSlugChange(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') verifySlug(); }}
                  placeholder="unique-repo-name"
                  className="bg-transparent text-neutral-900 dark:text-neutral-200 outline-none w-full min-w-0"
                />
              </div>
              <button
                onClick={verifySlug}
                disabled={!repoSlug || isCheckingSlug}
                className="text-[12px] font-bold px-4 py-2.5 rounded-lg bg-neutral-200 hover:bg-neutral-300 dark:bg-[#252525] dark:hover:bg-[#333] text-neutral-700 dark:text-neutral-200 transition-colors disabled:opacity-50 outline-none"
              >
                Check
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

          {/* ── Left Column: Content Widgets ── */}
          <div className="lg:col-span-8 xl:col-span-9 space-y-6">

            {/* Missions Widget */}
            <div className="rounded-2xl border border-neutral-200/60 dark:border-neutral-800/60 bg-white dark:bg-[#1c1c1c] shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.4)] overflow-hidden">
              <div className="px-6 py-4 border-b border-neutral-200/60 dark:border-neutral-800/60 bg-neutral-50/50 dark:bg-[#1a1a1a]/50 flex items-center justify-between">
                <div>
                  <h2 className="text-[11px] font-bold tracking-widest uppercase text-neutral-500 dark:text-neutral-400 select-none">Mission</h2>
                  <p className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-1">What actionable outcomes are you striving for?</p>
                </div>
              </div>
              <div
                className="p-6 cursor-text min-h-[100px] flex flex-col"
                onClick={() => document.getElementById('mission-input-0')?.focus()}
              >
                <ul className="space-y-3 flex-1 flex flex-col">
                  {missions.slice(0, 1).map((m, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-3 group relative flex-1 min-h-[40px]"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-neutral-300 dark:bg-neutral-600 mt-2.5 shrink-0" />
                      <textarea
                        id={`mission-input-${i}`}
                        value={m}
                        onFocus={() => setActiveField('mission')}
                        onBlur={() => setActiveField(null)}
                        onChange={e => {
                          const newM = [...missions];
                          newM[i] = e.target.value;
                          setMissions(newM);
                        }}
                        rows={1}
                        className="w-full bg-transparent overflow-hidden resize-none border-none text-[15px] text-neutral-800 dark:text-neutral-200 focus:ring-0 p-0 m-0 outline-none placeholder-neutral-300 dark:placeholder-neutral-700"
                        placeholder="e.g. Empowering 1,000 deep thinkers to find clarity."
                        onInput={(e) => {
                          const target = e.target as HTMLTextAreaElement;
                          target.style.height = 'auto';
                          target.style.height = target.scrollHeight + 'px';
                        }}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Core Values Widget */}
            <div className="rounded-2xl border border-neutral-200/60 dark:border-neutral-800/60 bg-white dark:bg-[#1c1c1c] shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.4)] overflow-hidden">
              <div className="px-6 py-4 border-b border-neutral-200/60 dark:border-neutral-800/60 bg-neutral-50/50 dark:bg-[#1a1a1a]/50 flex items-center justify-between">
                <div>
                  <h2 className="text-[11px] font-bold tracking-widest uppercase text-neutral-500 dark:text-neutral-400 select-none">Core Values</h2>
                  <p className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-1">Values that your community is built on.</p>
                </div>
                <span className="text-[10px] font-medium text-neutral-400 dark:text-neutral-500 bg-neutral-100 dark:bg-neutral-800 px-2 py-1 rounded-md">
                  {values.length}/6 Values
                </span>
              </div>
              <div className="p-6">
                <div className="flex flex-wrap items-center gap-2.5">
                  {values.map(v => (
                    <span key={v} className="bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-800 dark:text-neutral-200 text-[13px] px-3.5 py-1.5 rounded-full flex items-center gap-2 shadow-sm font-medium">
                      {v}
                      <button onClick={() => removeValue(v)} className="text-neutral-400 hover:text-red-500 transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </span>
                  ))}

                  {values.length < 6 && (
                    isAddingValue ? (
                      <div className="flex items-center gap-1.5 ml-1">
                        <div
                          className="bg-white dark:bg-[#151515] shadow-inner border border-neutral-300 dark:border-neutral-700 text-neutral-800 dark:text-neutral-200 text-[13px] px-3.5 py-1.5 rounded-full flex items-center gap-2 focus-within:ring-2 focus-within:ring-neutral-400 dark:focus-within:ring-neutral-600 focus-within:border-neutral-500 transition-all w-[140px] cursor-text"
                          onClick={() => document.getElementById('bubble-input')?.focus()}
                        >
                          <input
                            id="bubble-input"
                            autoFocus
                            value={valueInput}
                            onChange={e => setValueInput(e.target.value)}
                            onKeyDown={handleAddValue}
                            onBlur={() => {
                              setTimeout(() => {
                                if (!valueInput.trim()) setIsAddingValue(false);
                              }, 150);
                            }}
                            className="bg-transparent w-full outline-none p-0 m-0 min-w-0"
                            placeholder="New tag..."
                          />
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); commitValue(); }}
                          disabled={!valueInput.trim()}
                          className="w-[28px] h-[28px] rounded-full border border-neutral-200 dark:border-neutral-800 bg-neutral-100/50 hover:bg-neutral-200/80 dark:bg-[#1a1a1a] dark:hover:bg-[#252525] flex items-center justify-center text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shadow-sm ml-1 mb-px"
                          title="Add Value"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16M4 12h16" /></svg>
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setIsAddingValue(true)}
                        className="text-[12px] font-medium text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5 hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors px-2 py-1 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 ml-1"
                      >
                        <span>+</span> Add Core Value
                      </button>
                    )
                  )}
                </div>
              </div>
            </div>


          </div>

          {/* ── Right Column: Pipeline Status Widget ── */}
          <div className="lg:col-span-4 xl:col-span-3 lg:sticky lg:top-[240px] max-lg:mt-8">
            <div className="rounded-2xl border border-neutral-200/60 dark:border-neutral-800/60 bg-white dark:bg-[#1c1c1c] shadow-[0_12px_40px_rgb(0,0,0,0.08)] dark:shadow-[0_12px_40px_rgb(0,0,0,0.6)] overflow-hidden">

              {/* Status Banner */}
              <div className={`px-5 py-4 border-b ${canPublish ? 'border-green-200 dark:border-green-900/30 bg-green-50 dark:bg-green-900/10' : 'border-neutral-200/60 dark:border-neutral-800/60 bg-neutral-50/50 dark:bg-[#1a1a1a]/50 flex items-center justify-between'}`}>
                <div>
                  <div className="flex items-center gap-2">
                    {canPublish ? <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /> : <span className="w-2 h-2 rounded-full bg-yellow-500" />}
                    <h2 className="text-[11px] font-bold tracking-widest uppercase text-neutral-900 dark:text-neutral-100 select-none">
                      {canPublish ? "Ready to Push" : "Local Draft"}
                    </h2>
                  </div>
                </div>
              </div>

              {/* Checklist */}
              <div className="p-5 space-y-4">
                <div className="space-y-3 shrink-0">
                  <CheckItem label="Workspace Name" condition={rules.hasName} />
                  <CheckItem label="Unique URL Slug" condition={rules.hasSlug} />
                  <CheckItem label="Mission" condition={rules.hasMission} />
                  <CheckItem label="Core Values" condition={rules.hasValue} />
                </div>

                <div className="pt-4 border-t border-neutral-100 dark:border-neutral-800/60">
                  <button
                    onClick={handlePublish}
                    disabled={!canPublish || isPublishing}
                    className="w-full px-5 py-3.5 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-xl text-[14px] font-bold hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-all shadow-md active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center relative overflow-hidden group"
                  >
                    {isPublishing ? (
                      <span className="flex items-center gap-2 z-10">
                        <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white dark:border-black/20 dark:border-t-black animate-spin" /> Provisioning Repo...
                      </span>
                    ) : (
                      <span className="z-10 group-disabled:text-neutral-400 text-white dark:text-neutral-900">Push to GitHub</span>
                    )}

                    {/* Highlight shimmer effect for enabled state */}
                    {canPublish && !isPublishing && (
                      <div className="absolute inset-0 -translate-x-[150%] animate-[shimmer_2.5s_infinite] bg-linear-to-r from-transparent via-white/20 dark:via-black/10 to-transparent skew-x-12" />
                    )}
                  </button>
                  <p className="text-[10px] text-neutral-400 dark:text-neutral-600 text-center mt-3 leading-relaxed">
                    Pushing provisions a private GitHub repository synced via Vault submodules and indexes it on Hasura.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function CheckItem({ label, condition }: { label: string, condition: boolean }) {
  return (
    <div className={`flex items-center gap-2.5 text-[13px] font-medium transition-colors ${condition ? 'text-neutral-900 dark:text-neutral-100' : 'text-neutral-400 dark:text-neutral-600'}`}>
      {condition ? (
        <svg className="w-4 h-4 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
      ) : (
        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="9" /></svg>
      )}
      <span className={condition ? '' : 'line-through opacity-70 decoration-neutral-300 dark:decoration-neutral-700'}>{label}</span>
    </div>
  )
}
