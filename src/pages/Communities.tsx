import { useState, useEffect, useCallback, memo } from "react";
import { useNhostClient, useUserData, useAuthenticationStatus, useSignOut, useAccessToken } from "@nhost/react";
import * as v from "valibot";
import { format } from "date-fns";
import { sql, initDb } from "@/lib/localDb";

// Example Edge Metadata validation using Valibot
const EdgeMetadataSchema = v.object({
  role: v.optional(v.string(), "member"),
  joined_via: v.optional(v.string(), "discovery")
});

type CommunityCardProps = {
  c: any;
  isMember: boolean;
  index: number;
  joiningId: string | null;
  leavingId: string | null;
  onSelect: (c: any) => void;
  onJoin: (id: string, e: React.MouseEvent) => void;
  onLeave: (id: string, e: React.MouseEvent) => void;
};

const CommunityCard = memo(({ c, isMember, index, joiningId, leavingId, onSelect, onJoin, onLeave }: CommunityCardProps) => {
  const isJoining = joiningId === c.id;
  const isLeaving = leavingId === c.id;
  const isBusy = isJoining || isLeaving;

  return (
    <div
      onClick={() => !isBusy && onSelect(c)}
      className={`group relative rounded-2xl border border-neutral-200/60 dark:border-neutral-700/40 bg-white dark:bg-[#222222] shadow-[0_1px_3px_rgba(0,0,0,0.06),0_4px_16px_rgba(0,0,0,0.04)] dark:shadow-[0_2px_16px_rgba(0,0,0,0.5)] overflow-hidden cursor-pointer transition-opacity duration-200 ${isBusy ? 'opacity-60' : ''}`}
      style={{ animation: 'cardIn 0.4s cubic-bezier(0.23,1,0.32,1) backwards', animationDelay: `${index * 0.05}s` }}
    >
      {/* Top accent bar — same for all variants */}
      <div className="h-px w-full bg-neutral-200 dark:bg-neutral-700/60" />

      <div className="p-5 flex flex-col gap-4">
        <div className="space-y-1">
          <h3 className="text-[15px] font-semibold text-neutral-900 dark:text-neutral-100 leading-tight">{c.name}</h3>
          <p className="text-[12px] font-mono text-neutral-400 dark:text-neutral-500">@{c.slug}</p>
        </div>

        {(c.missions?.length > 0 || c.values?.length > 0) && (
          <div className="flex flex-col gap-2.5 mt-1">
            {c.missions?.length > 0 && (
              <div className="text-[11px] text-neutral-600 dark:text-neutral-400 leading-snug line-clamp-2 italic">
                "{c.missions[0].statement}"
              </div>
            )}
            {c.values?.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {c.values.slice(0, 3).map((v: any, i: number) => (
                  <span key={i} className="px-2 py-0.5 bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded text-[10px] text-neutral-600 dark:text-neutral-400">
                    {v.core_term}
                  </span>
                ))}
                {c.values.length > 3 && <span className="text-[10px] text-neutral-400">+{c.values.length - 3}</span>}
              </div>
            )}
          </div>
        )}

        {isMember ? (
          <button
            onClick={(e) => onLeave(c.id, e)}
            disabled={isBusy}
            className="w-full text-[12px] font-medium px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400 hover:border-neutral-400 dark:hover:border-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800/70 transition-all duration-150 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isLeaving ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-3 h-3 rounded-full border-2 border-neutral-300 dark:border-neutral-600 border-t-neutral-600 dark:border-t-neutral-300 animate-spin" />
                Leaving...
              </span>
            ) : 'Leave Community'}
          </button>
        ) : (
          <button
            onClick={(e) => onJoin(c.id, e)}
            disabled={isBusy}
            className="w-full text-[12px] font-medium px-3 py-2 rounded-lg transition-all duration-150 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-300 hover:shadow-md shadow-sm"
          >
            {isJoining ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-3 h-3 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                Joining...
              </span>
            ) : 'Join Community'}
          </button>
        )}
      </div>
    </div>
  );
});

export default function Communities() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuthenticationStatus();
  const user = useUserData();
  const nhost = useNhostClient();
  const accessToken = useAccessToken();
  const { signOut } = useSignOut();

  const [myCommunities, setMyCommunities] = useState<any[]>([]);
  const [discovery, setDiscovery] = useState<any[]>([]);
  const [featured, setFeatured] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Details Modal State
  const [selectedCommunity, setSelectedCommunity] = useState<any | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [communityDetails, setCommunityDetails] = useState<{ values: any[], missions: any[], members: number } | null>(null);

  useEffect(() => {
    initDb().catch(e => console.error("Failed to init db", e));
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !user) return;

    async function fetchData() {
      setLoading(true);
      try {
        // 1. My Communities: Query where user is a member
        const myRes = await nhost.graphql.request(`
          query GetMyCommunities($userId: uuid!) {
            edges(where: {source_id: {_eq: $userId}, type: {_eq: "member_of"}, end_date: {_is_null: true}}) {
              target_id
            }
          }
        `, { userId: user!.id });

        let myList: any[] = [];
        if (myRes.data?.edges?.length > 0) {
          const myIds = myRes.data.edges.map((e: any) => e.target_id);
          const commRes = await nhost.graphql.request(`
            query GetCommunitiesByIds($ids: [uuid!]!) {
              communities(where: {id: {_in: $ids}}) {
                id name slug is_public
              }
            }
          `, { ids: myIds });
          myList = commRes.data?.communities || [];
        }

        // 2. Discovery
        const discRes = await nhost.graphql.request(`
          query GetDiscovery {
            get_recommended_communities(args: {user_uuid: "${user!.id}"}) {
              id name slug is_public
            }
          }
        `);
        const discList = discRes.data?.get_recommended_communities || [];

        // 3. Featured
        const myIdsList = myList.map(c => c.id);
        const featRes = await nhost.graphql.request(`
          query GetFeatured($myIds: [uuid!]!) {
            communities(where: {is_public: {_eq: true}, id: {_nin: $myIds}}) {
              id name slug is_public
            }
          }
        `, { myIds: myIdsList });
        const featList = featRes.data?.communities || [];

        // Fetch missions and values for all communities
        const allComms = [...myList, ...discList, ...featList];
        const allIds = Array.from(new Set(allComms.map(c => c.id)));

        if (allIds.length > 0) {
          const edgeRes = await nhost.graphql.request(`
             query GetMultiEdges($ids: [uuid!]!) {
                edges(where: {source_id: {_in: $ids}, type: {_in: ["embodies_value", "adopts_mission"]}, end_date: {_is_null: true}}) {
                   source_id target_id type
                }
             }
           `, { ids: allIds });
          const allEdges = edgeRes.data?.edges || [];

          const vIds = Array.from(new Set(allEdges.filter((e: any) => e.type === 'embodies_value').map((e: any) => e.target_id)));
          const mIds = Array.from(new Set(allEdges.filter((e: any) => e.type === 'adopts_mission').map((e: any) => e.target_id)));

          const [vRes, mRes] = await Promise.all([
            vIds.length ? nhost.graphql.request(`query { values(where: {id: {_in: ${JSON.stringify(vIds)}}}) { id core_term description } }`) : Promise.resolve({ data: { values: [] } }),
            mIds.length ? nhost.graphql.request(`query { missions(where: {id: {_in: ${JSON.stringify(mIds)}}}) { id statement } }`) : Promise.resolve({ data: { missions: [] } })
          ]);

          const valMap = new Map((vRes.data?.values || []).map((v: any) => [v.id, v]));
          const missMap = new Map((mRes.data?.missions || []).map((m: any) => [m.id, m]));

          allComms.forEach(c => {
            const cEdges = allEdges.filter((e: any) => e.source_id === c.id);
            c.values = cEdges.filter((e: any) => e.type === 'embodies_value').map((e: any) => valMap.get(e.target_id)).filter(Boolean);
            c.missions = cEdges.filter((e: any) => e.type === 'adopts_mission').map((e: any) => missMap.get(e.target_id)).filter(Boolean);
          });
        }

        setMyCommunities([...myList]);
        setDiscovery([...discList]);
        setFeatured([...featList]);

      } catch (err) {
        console.error("Failed to load communities", err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [isAuthenticated, user, nhost]);

  const handleSelectCommunity = async (comm: any) => {
    setSelectedCommunity(comm);
    setDetailsLoading(true);
    try {
      const res = await nhost.graphql.request(`
           query GetDetails($id: uuid!) {
              edges(where: {source_id: {_eq: $id}}) {
                 target_id
                 type
                 start_date
              }
              members: edges_aggregate(where: {target_id: {_eq: $id}, type: {_eq: "member_of"}, end_date: {_is_null: true}}) {
                 aggregate {
                    count
                 }
              }
           }
        `, { id: comm.id });

      const edges = res.data?.edges || [];
      const valuesIds = edges.filter((e: any) => e.type === 'embodies_value').map((e: any) => e.target_id);
      const missionsIds = edges.filter((e: any) => e.type === 'adopts_mission').map((e: any) => e.target_id);

      const [vRes, mRes] = await Promise.all([
        valuesIds.length ? nhost.graphql.request(`query { values(where: {id: {_in: ${JSON.stringify(valuesIds)}}}) { core_term description } }`) : Promise.resolve({ data: { values: [] } }),
        missionsIds.length ? nhost.graphql.request(`query { missions(where: {id: {_in: ${JSON.stringify(missionsIds)}}}) { statement status } }`) : Promise.resolve({ data: { missions: [] } }),
      ]);

      setCommunityDetails({
        values: (vRes.data?.values?.length ? vRes.data.values : comm.values) || [],
        missions: (mRes.data?.missions?.length ? mRes.data.missions : comm.missions) || [],
        members: res.data?.members?.aggregate?.count || 0
      });
    } catch (err) {
      console.error("Failed to load details", err);
    } finally {
      setDetailsLoading(false);
    }
  };

  const joinCommunity = async (communityId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!user) return;
    try {
      const metadata = v.parse(EdgeMetadataSchema, { role: "member", joined_via: "discovery" });

      const res = await nhost.graphql.request(`
        mutation JoinCommunity($targetId: uuid!, $meta: jsonb!) {
          insert_edges_one(object: {
            target_id: $targetId, 
            type: "member_of",
            metadata: $meta
          }) {
            id
          }
        }
      `, { targetId: communityId, meta: metadata });

      if (!res.error) {
        const comm = discovery.find(c => c.id === communityId) || featured.find(c => c.id === communityId);
        if (comm) {
          setDiscovery(prev => prev.filter(c => c.id !== communityId));
          setFeatured(prev => prev.filter(c => c.id !== communityId));
          setMyCommunities(prev => [...prev, comm]);

          // Save to Vault
          if (accessToken) {
            const backendUrl = import.meta.env.DEV ? '/nhost-fn' : nhost.functions.url;

            const missionsStr = comm.missions?.length
              ? `\n## Missions\n` + comm.missions.map((m: any) => `- ${m.statement}`).join('\n') + `\n`
              : '';
            const valuesStr = comm.values?.length
              ? `\n## Core Values\n` + comm.values.map((v: any) => `- **${v.core_term}**: ${v.description || ''}`).join('\n') + `\n`
              : '';

            const mdContent = `---
type: community
id: ${comm.id}
name: ${comm.name}
joined_at: ${format(new Date(), "yyyy-MM-dd HH:mm")}
---

# ${comm.name} (@${comm.slug})

A community joined on the Aspire Network.
${missionsStr}${valuesStr}`;
            // Update Local SQLite for OPFS DevTools viewer
            const now = Date.now();
            sql`
              INSERT OR REPLACE INTO local_communities (slug, content, sha, last_synced_at, updated_at)
              VALUES (${comm.slug}, ${mdContent}, NULL, ${now}, ${now})
            `.catch(e => console.error("Local sqlite insert failed:", e));

            fetch(`${backendUrl}/vault/community`, {
              method: 'PUT',
              headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ slug: comm.slug, content: mdContent })
            })
              .then(res => res.json())
              .then(data => {
                if (data.success && data.sha) {
                  sql`UPDATE local_communities SET sha = ${data.sha} WHERE slug = ${comm.slug}`
                    .catch(e => console.error("Update local sha err", e));
                }
              })
              .catch(e => console.error("Vault save failed", e));
          }
        }
      }
      else {
        console.error("Join DB error:", res.error);
      }
    } catch (err) {
      console.error("Failed to join", err);
    }
  };

  const leaveCommunity = async (communityId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!user) return;
    try {
      const res = await nhost.graphql.request(`
            mutation LeaveCommunity($sourceId: uuid!, $targetId: uuid!) {
              delete_edges(where: {
                  source_id: {_eq: $sourceId}, 
                  target_id: {_eq: $targetId},
                  type: {_eq: "member_of"}
              }) {
                  affected_rows
              }
            }
          `, { sourceId: user.id, targetId: communityId });

      if (!res.error) {
        const comm = myCommunities.find(c => c.id === communityId);
        if (comm) {
          setMyCommunities(prev => prev.filter(c => c.id !== communityId));
          setFeatured(prev => [...prev, comm]);

          // Remove from Vault
          // Update Local SQLite for OPFS DevTools viewer
          sql`DELETE FROM local_communities WHERE slug = ${comm.slug}`
            .catch(e => console.error("Local sqlite delete failed:", e));

          if (accessToken) {
            const backendUrl = import.meta.env.DEV ? '/nhost-fn' : nhost.functions.url;
            fetch(`${backendUrl}/vault/community`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ slug: comm.slug })
            }).catch(e => console.error("Vault delete failed", e));
          }
        }
      } else {
        console.error("Leave DB error:", res.error);
      }
    } catch (err) {
      console.error("Failed to leave", err);
    }
  }

  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [leavingId, setLeavingId] = useState<string | null>(null);

  const handleJoin = useCallback(async (id: string, e?: React.MouseEvent) => {
    setJoiningId(id);
    await joinCommunity(id, e);
    setJoiningId(null);
  }, []);

  const handleLeave = useCallback(async (id: string, e?: React.MouseEvent) => {
    setLeavingId(id);
    await leaveCommunity(id, e);
    setLeavingId(null);
  }, []);

  if (isAuthLoading) return (
    <main className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-[#1a1a1a]">
      <div className="flex items-center gap-3 text-neutral-400">
        <span className="w-4 h-4 rounded-full border-2 border-neutral-300 dark:border-neutral-600 border-t-neutral-600 dark:border-t-neutral-300 animate-spin" />
        <span className="text-sm font-medium">Loading...</span>
      </div>
    </main>
  );
  if (!isAuthenticated) return (
    <main className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-[#1a1a1a]">
      <p className="text-sm text-neutral-500">Please sign in to view communities.</p>
    </main>
  );


  return (
    <main className="min-h-screen flex flex-col bg-neutral-50 dark:bg-[#1a1a1a] transition-colors duration-300">
      {/* Inline keyframes */}
      <style>{`
        @keyframes cardIn {
          from { opacity: 0; transform: translateY(12px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.95) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes backdropIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>

      {/* ── Nav ── */}
      <nav className="shrink-0 flex items-center justify-between px-6 h-14 border-b border-neutral-200/60 dark:border-neutral-700/40 bg-white/80 dark:bg-[#222222] backdrop-blur-sm sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
            Aspire You
          </h1>
          <span className="text-[10px] font-semibold tracking-widest uppercase text-neutral-400 dark:text-neutral-500 select-none">/ Communities</span>
        </div>
        <div className="flex items-center gap-3">
          {user?.avatarUrl && (
            <img src={user.avatarUrl} alt="" className="w-7 h-7 rounded-full ring-1 ring-neutral-200 dark:ring-neutral-800" />
          )}
          <span className="text-[13px] text-neutral-600 dark:text-neutral-400 hidden sm:block">
            {user?.displayName || user?.email}
          </span>
          <a href="/" className="text-[11px] font-medium px-2.5 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white transition-all no-underline">
            Dashboard
          </a>
          <button
            onClick={() => signOut()}
            className="text-[11px] font-medium px-2.5 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-600 text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 hover:border-neutral-400 dark:hover:border-neutral-500 transition-all active:scale-[0.97]"
          >
            Sign out
          </button>
        </div>
      </nav>

      {/* ── Content ── */}
      <div className="max-w-5xl w-full mx-auto px-6 py-8 space-y-8">

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="rounded-2xl border border-neutral-200/60 dark:border-neutral-700/40 bg-white dark:bg-[#222222] overflow-hidden animate-pulse">
                <div className="h-1 bg-neutral-200 dark:bg-neutral-700" />
                <div className="p-5 space-y-4">
                  <div className="space-y-2">
                    <div className="h-4 bg-neutral-200 dark:bg-neutral-700 rounded w-2/3" />
                    <div className="h-3 bg-neutral-100 dark:bg-neutral-800 rounded w-1/3" />
                  </div>
                  <div className="h-9 bg-neutral-100 dark:bg-neutral-800 rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* ── My Communities Widget ── */}
            <div className="rounded-2xl border border-neutral-200/60 dark:border-neutral-700/40 bg-white dark:bg-[#222222] shadow-xl dark:shadow-[0_8px_32px_rgba(0,0,0,0.6)] overflow-hidden">
              <div className="px-5 py-4 border-b border-neutral-200/60 dark:border-neutral-700/40 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h2 className="text-[10px] font-semibold tracking-widest uppercase text-neutral-400 dark:text-neutral-500 select-none">
                    My Communities
                  </h2>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/50">
                    {myCommunities.length}
                  </span>
                </div>
              </div>
              <div className="p-5">
                {myCommunities.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">You haven't joined any communities yet.</p>
                    <p className="text-[11px] text-neutral-400 dark:text-neutral-600 mt-1">Browse communities below to get started.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {myCommunities.map((c, i) => <CommunityCard key={c.id} c={c} isMember={true} index={i} joiningId={joiningId} leavingId={leavingId} onSelect={handleSelectCommunity} onJoin={handleJoin} onLeave={handleLeave} />)}
                  </div>
                )}
              </div>
            </div>

            {/* ── Featured Communities Widget ── */}
            <div className="rounded-2xl border border-neutral-200/60 dark:border-neutral-700/40 bg-white dark:bg-[#222222] shadow-xl dark:shadow-[0_8px_32px_rgba(0,0,0,0.6)] overflow-hidden">
              <div className="px-5 py-4 border-b border-neutral-200/60 dark:border-neutral-700/40 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h2 className="text-[10px] font-semibold tracking-widest uppercase text-neutral-400 dark:text-neutral-500 select-none">
                    Featured Communities
                  </h2>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-700">
                    {featured.length}
                  </span>
                </div>
              </div>
              <div className="p-5">
                {featured.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">You've joined all available communities.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {featured.map((c, i) => <CommunityCard key={c.id} c={c} isMember={false} index={i} joiningId={joiningId} leavingId={leavingId} onSelect={handleSelectCommunity} onJoin={handleJoin} onLeave={handleLeave} />)}
                  </div>
                )}
              </div>
            </div>

            {/* ── Discovery Widget ── HIDDEN FOR NOW */}
            {/* {discovery.length > 0 && (
              <div className="rounded-2xl border border-neutral-200/60 dark:border-neutral-700/40 bg-white dark:bg-[#222222] shadow-xl dark:shadow-[0_8px_32px_rgba(0,0,0,0.6)] overflow-hidden">
                <div className="px-5 py-4 border-b border-neutral-200/60 dark:border-neutral-700/40 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <h2 className="text-[10px] font-semibold tracking-widest uppercase text-neutral-400 dark:text-neutral-500 select-none">
                      Discovery
                    </h2>
                    <span className="text-[10px] font-medium text-neutral-400 dark:text-neutral-600">≤2 hops via network</span>
                  </div>
                </div>
                <div className="p-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {discovery.map((c, i) => <CommunityCard key={c.id} c={c} isMember={false} index={i} joiningId={joiningId} leavingId={leavingId} onSelect={handleSelectCommunity} onJoin={handleJoin} onLeave={handleLeave} />)}
                  </div>
                </div>
              </div>
            )} */}
          </>
        )}
      </div>

      {/* ── Details Modal ── */}
      {selectedCommunity && (
        <div
          className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm"
          onClick={() => setSelectedCommunity(null)}
          style={{ animation: 'backdropIn 0.35s ease-out' }}
        >
          <div
            className="bg-white dark:bg-[#222222] border border-neutral-200/60 dark:border-neutral-700/40 rounded-2xl w-full max-w-md shadow-2xl dark:shadow-[0_8px_32px_rgba(0,0,0,0.6)] overflow-hidden"
            onClick={e => e.stopPropagation()}
            style={{ animation: 'modalIn 0.6s cubic-bezier(0.16,1,0.3,1)' }}
          >
            {/* Accent bar */}
            <div className="h-px w-full bg-neutral-200 dark:bg-neutral-700/60" />

            <div className="p-6 space-y-1">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl tracking-tight font-bold text-neutral-900 dark:text-neutral-100">{selectedCommunity.name}</h2>
                  <p className="text-[12px] font-mono text-neutral-400 dark:text-neutral-500 mt-0.5">@{selectedCommunity.slug}</p>
                </div>
                <button
                  onClick={() => setSelectedCommunity(null)}
                  className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-all active:scale-90"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              {/* Content */}
              {detailsLoading ? (
                <div className="animate-pulse space-y-5 pt-6">
                  <div className="space-y-2">
                    <div className="h-2.5 bg-neutral-200 dark:bg-neutral-700 w-1/4 rounded-full" />
                    <div className="h-3 bg-neutral-100 dark:bg-neutral-800 w-1/2 rounded-full" />
                  </div>
                  <div className="space-y-2">
                    <div className="h-2.5 bg-neutral-200 dark:bg-neutral-700 w-1/3 rounded-full" />
                    <div className="h-3 bg-neutral-100 dark:bg-neutral-800 w-2/3 rounded-full" />
                  </div>
                </div>
              ) : (
                <div className="space-y-5 pt-6">
                  <div>
                    <h3 className="text-[10px] font-semibold tracking-widest uppercase text-neutral-400 dark:text-neutral-500 mb-1.5 select-none">Network</h3>
                    <p className="text-[13px] text-neutral-700 dark:text-neutral-300 font-medium">{communityDetails?.members ?? 0} active members</p>
                  </div>
                  {communityDetails?.missions && communityDetails.missions.length > 0 && (
                    <div>
                      <h3 className="text-[10px] font-semibold tracking-widest uppercase text-neutral-400 dark:text-neutral-500 mb-1.5 select-none">Missions</h3>
                      <ul className="space-y-1.5">
                        {communityDetails.missions.map((m: any, i: number) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="w-1 h-1 rounded-full bg-neutral-300 dark:bg-neutral-600 mt-2 shrink-0" />
                            <span className="text-[13px] leading-relaxed text-neutral-700 dark:text-neutral-300">{m.statement}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {communityDetails?.values && communityDetails.values.length > 0 && (
                    <div>
                      <h3 className="text-[10px] font-semibold tracking-widest uppercase text-neutral-400 dark:text-neutral-500 mb-2 select-none">Core Values</h3>
                      <div className="flex flex-wrap gap-1.5">
                        {communityDetails.values.map((val: any, i: number) => (
                          <div key={i} className="px-2.5 py-1 bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-md text-[11px] font-medium text-neutral-700 dark:text-neutral-300" title={val.description}>{val.core_term}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Footer action */}
              <div className="pt-6 border-t border-neutral-100 dark:border-neutral-800 mt-6">
                {myCommunities.some(c => c.id === selectedCommunity.id) ? (
                  <button
                    onClick={(e) => { handleLeave(selectedCommunity.id, e); setSelectedCommunity(null); }}
                    className="w-full text-[12px] font-medium px-3 py-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-all active:scale-[0.98]"
                  >
                    Leave Community
                  </button>
                ) : (
                  <button
                    onClick={(e) => { handleJoin(selectedCommunity.id, e); setSelectedCommunity(null); }}
                    className="w-full text-[12px] font-medium px-3 py-2.5 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-all active:scale-[0.98] shadow-sm"
                  >
                    Join Community
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
