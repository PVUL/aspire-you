import { useState, useEffect, useCallback, memo } from "react";
import { useNhostClient, useUserData, useAuthenticationStatus, useSignOut, useAccessToken } from "@nhost/react";
import { useNavigate } from "react-router-dom";
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
  isDraft?: boolean;
  index: number;
  joiningId: string | null;
  leavingId: string | null;
  onSelect: (c: any) => void;
  onJoin: (id: string, e: React.MouseEvent) => void;
  onLeave: (id: string, e: React.MouseEvent) => void;
  onDeleteDraft?: (id: string, e: React.MouseEvent) => void;
};

const CommunityCard = memo(({ c, isMember, isDraft, index, joiningId, leavingId, onSelect, onJoin, onLeave, onDeleteDraft }: CommunityCardProps) => {
  const isJoining = joiningId === c.id;
  const isLeaving = leavingId === c.id;
  const isBusy = isJoining || isLeaving;
  const [pendingAction, setPendingAction] = useState<'delete' | 'leave' | null>(null);

  return (
    <div
      onClick={() => !isBusy && onSelect(c)}
      className={`group relative rounded-2xl border border-neutral-200/60 dark:border-neutral-700/40 bg-white dark:bg-[#222222] shadow-[0_1px_3px_rgba(0,0,0,0.06),0_4px_16px_rgba(0,0,0,0.04)] dark:shadow-[0_2px_16px_rgba(0,0,0,0.5)] overflow-hidden cursor-pointer transition-opacity duration-200 ${isBusy ? 'opacity-60' : ''} ${pendingAction ? 'ring-2 ring-red-500/50 border-red-500/50' : ''}`}
      style={{ animation: 'cardIn 0.4s cubic-bezier(0.23,1,0.32,1) backwards', animationDelay: `${index * 0.05}s` }}
    >
      {/* Top accent bar — same for all variants */}
      <div className={`h-px w-full transition-colors ${pendingAction ? 'bg-red-500' : 'bg-neutral-200 dark:bg-neutral-700/60'}`} />

      <div className="p-5 flex flex-col gap-4">
        <div className="space-y-1 relative">
          <div className="flex items-start justify-between">
            <h3 className="text-[15px] font-semibold text-neutral-900 dark:text-neutral-100 leading-tight pr-6">{c.name}</h3>
            {isDraft && onDeleteDraft && (
              <button 
                onClick={(e) => { e.stopPropagation(); setPendingAction('delete'); }}
                className="absolute right-0 top-0 text-neutral-400 hover:text-red-500 p-1 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 focus:outline-none opacity-0 group-hover:opacity-100 transition-all"
                title="Delete Draft"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>
              </button>
            )}
          </div>
          <p className="text-[12px] font-mono text-neutral-400 dark:text-neutral-500">@{c.slug}</p>
        </div>

        {(c.missions?.length > 0 || c.values?.length > 0) && (
          <div className="flex flex-col gap-2.5 mt-1">
            {c.missions?.length > 0 && (
              <div className="text-[11px] text-neutral-600 dark:text-neutral-400 leading-snug line-clamp-2 italic">
                "{typeof c.missions[0] === 'string' ? c.missions[0] : c.missions[0].statement}"
              </div>
            )}
            {c.values?.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {c.values.slice(0, 3).map((v: any, i: number) => (
                  <span key={i} className="px-2 py-0.5 bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded text-[10px] text-neutral-600 dark:text-neutral-400">
                    {typeof v === 'string' ? v : v.core_term}
                  </span>
                ))}
                {c.values.length > 3 && <span className="text-[10px] text-neutral-400">+{c.values.length - 3}</span>}
              </div>
            )}
          </div>
        )}

        {pendingAction ? (
          <div className="flex items-center gap-2 mt-1 w-full p-2 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 animate-in fade-in slide-in-from-bottom-2 duration-150">
             <span className="flex-1 text-[11px] font-medium text-red-600 dark:text-red-400 text-center">
               {pendingAction === 'delete' ? 'Delete forever?' : 'Leave community?'}
             </span>
             <button
                onClick={(e) => { 
                  e.stopPropagation(); 
                  if (pendingAction === 'delete') onDeleteDraft?.(c.id, e);
                  else onLeave?.(c.id, e);
                  setPendingAction(null);
                }}
                className="px-3 py-1.5 rounded-md bg-red-600 text-white text-[11px] font-semibold hover:bg-red-700 transition-colors shadow-sm"
             >Yes</button>
             <button
                onClick={(e) => { e.stopPropagation(); setPendingAction(null); }}
                className="px-3 py-1.5 rounded-md bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700 text-[11px] font-semibold hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors shadow-sm"
             >No</button>
          </div>
        ) : isDraft ? (
          <button
            className="w-full text-[12px] font-medium px-3 py-2 rounded-lg transition-all duration-150 active:scale-[0.97] bg-yellow-400 text-yellow-950 dark:bg-yellow-500/20 dark:text-yellow-500 hover:bg-yellow-500 dark:hover:bg-yellow-500/30 hover:shadow-md shadow-sm border border-transparent dark:border-yellow-900/50"
          >
            Resume Setup
          </button>
        ) : isMember && !c.isOwner ? (
          <button
            onClick={(e) => { e.stopPropagation(); setPendingAction('leave'); }}
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
        ) : isMember && c.isOwner ? (
          <button
            onClick={(e) => { e.stopPropagation(); setPendingAction('delete'); }}
            disabled={isBusy}
            className="w-full text-[12px] font-medium px-3 py-2 rounded-lg border border-red-200/50 dark:border-red-900/30 text-red-500/80 hover:border-red-500/50 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50/50 dark:hover:bg-red-950/20 transition-all duration-150 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isLeaving ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-3 h-3 rounded-full border-2 border-red-500 border-t-red-200 animate-spin" />
                Deleting...
              </span>
            ) : 'Delete Community'}
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
  const [myHostedCommunities, setMyHostedCommunities] = useState<any[]>([]);
  const [drafts, setDrafts] = useState<any[]>([]);
  const [discovery, setDiscovery] = useState<any[]>([]);
  const [featured, setFeatured] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Details Modal State
  const [selectedCommunity, setSelectedCommunity] = useState<any | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [communityDetails, setCommunityDetails] = useState<{ values: any[], missions: any[], members: number } | null>(null);
  const [pendingModalLeave, setPendingModalLeave] = useState(false);

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
              metadata
            }
          }
        `, { userId: user!.id });

        let myHostedList: any[] = [];
        let myJoinedList: any[] = [];
        
        if (myRes.data?.edges?.length > 0) {
          const myIds = myRes.data.edges.map((e: any) => e.target_id);
          const ownershipMap = new Map(myRes.data.edges.map((e: any) => [e.target_id, e.metadata?.role === 'owner']));
          
          const commRes = await nhost.graphql.request(`
            query GetCommunitiesByIds($ids: [uuid!]!) {
              communities(where: {id: {_in: $ids}}) {
                id name slug is_public
              }
            }
          `, { ids: myIds });
          const allMyFetched = (commRes.data?.communities || []).filter((c: any) => c.is_public);
          
          // Inject isOwner flag
          allMyFetched.forEach((c: any) => { c.isOwner = ownershipMap.get(c.id) || false; });
          
          myHostedList = allMyFetched.filter((c: any) => c.isOwner);
          myJoinedList = allMyFetched.filter((c: any) => !c.isOwner);
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
        const myIdsList = [...myHostedList, ...myJoinedList].map(c => c.id);
        const featRes = await nhost.graphql.request(`
          query GetFeatured($myIds: [uuid!]!) {
            communities(where: {is_public: {_eq: true}, id: {_nin: $myIds}}) {
              id name slug is_public
            }
          }
        `, { myIds: myIdsList });
        const featList = featRes.data?.communities || [];

        // Fetch missions and values for all communities
        const allComms = [...myHostedList, ...myJoinedList, ...discList, ...featList];
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

        setMyHostedCommunities([...myHostedList]);
        setMyCommunities([...myJoinedList]);
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

  // Load SQLite Drafts
  useEffect(() => {
    let active = true;
    async function loadLocalDrafts() {
      try {
        const res = await sql`SELECT slug, content, updated_at FROM local_communities WHERE slug LIKE 'draft-%' ORDER BY updated_at DESC`;
        if (active && Array.isArray(res)) {
          const formattedDrafts = res.map((row: any) => {
            const data = typeof row.content === 'string' ? JSON.parse(row.content) : row.content;
            return {
              id: row.slug,
              slug: data.repoSlug || 'untitled',
              name: data.displayName || 'Untitled Workpace',
              missions: data.missions ? data.missions.filter((m: string) => m.trim() !== '').map((m: string) => ({ statement: m })) : [],
              values: data.values ? data.values.map((v: string) => ({ core_term: v })) : [],
              isLocalDraft: true,
              updatedAt: row.updated_at
            };
          });
          setDrafts(formattedDrafts);
        }
      } catch (err) {
        console.error("Failed to load local drafts", err);
      }
    }
    loadLocalDrafts();
    return () => { active = false; };
  }, []);

  const navigate = useNavigate();

  const handleSelectCommunity = async (comm: any) => {
    if (comm.isLocalDraft) {
      navigate(`/communities/${comm.id.replace('draft-', '')}/draft`);
      return;
    }
    
    setPendingModalLeave(false);
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

  const deleteCommunity = async (communityId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!user) return;
    try {
      const comm = myHostedCommunities.find(c => c.id === communityId);
      if (!comm) return;

      const res = await nhost.graphql.request(`
        mutation DeleteCommunity($id: uuid!) {
          delete_communities(where: {id: {_eq: $id}}) { affected_rows }
        }
      `, { id: communityId });

      if (!res.error) {
        setMyHostedCommunities(prev => prev.filter(c => c.id !== communityId));
        
        sql`DELETE FROM local_communities WHERE slug = ${comm.slug}`
          .catch(e => console.error("Local sqlite delete failed:", e));

        if (accessToken) {
          const backendUrl = import.meta.env.DEV ? '/nhost-fn' : nhost.functions.url;
          
          // 1. Completely destroy GitHub repository
          fetch(`${backendUrl}/vault/delete_community`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ slug: comm.slug })
          }).catch(e => console.error("Vault delete repo failed", e));

          // 2. Archive tombstone in active Vault
          fetch(`${backendUrl}/vault/community`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ slug: comm.slug })
          }).catch(e => console.error("Vault archive wrapper failed", e));
        }
      } else {
        console.error("Delete DB error:", res.error);
      }
    } catch (err) {
      console.error("Failed to delete", err);
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

  const handleDeleteCommunity = useCallback(async (id: string, e?: React.MouseEvent) => {
    setLeavingId(id); // Use the same loader var for UX
    await deleteCommunity(id, e);
    setLeavingId(null);
  }, [myHostedCommunities]);

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
            {/* ── New Community Button & Drafts ── */}
            <div className="flex justify-end mb-6">
              <button 
                onClick={() => {
                  sessionStorage.removeItem('activeDraftId');
                  navigate('/communities/new');
                }}
                className="px-4 py-2 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-lg text-[13px] font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors shadow-sm inline-block"
              >
                + Create Community
              </button>
            </div>

            {drafts.length > 0 && (
              <div className="rounded-2xl mb-8 border border-neutral-200/60 dark:border-neutral-700/40 bg-white dark:bg-[#222222] shadow-[0_8px_32px_rgba(0,0,0,0.06)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.6)] overflow-hidden relative">
                <div className="absolute top-0 right-0 py-3 px-5 z-10">
                  <span className="text-[9px] font-semibold tracking-widest uppercase bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-500 px-2.5 py-1 rounded-sm border border-yellow-200 dark:border-yellow-900/50">Draft</span>
                </div>
                <div className="px-5 py-4 border-b border-neutral-200/60 dark:border-neutral-700/40 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <h2 className="text-[10px] font-semibold tracking-widest uppercase text-neutral-400 dark:text-neutral-500 select-none">
                      My Workspaces
                    </h2>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-700">
                      {drafts.length}
                    </span>
                  </div>
                </div>
                <div className="p-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {drafts.map((c, i) => (
                      <CommunityCard 
                        key={c.id} 
                        c={c} 
                        isMember={true} 
                        isDraft={true} 
                        index={i} 
                        joiningId={joiningId} 
                        leavingId={leavingId} 
                        onSelect={handleSelectCommunity} 
                        onJoin={handleJoin} 
                        onLeave={handleLeave}
                        onDeleteDraft={async (id, e) => {
                          e.stopPropagation();
                          setDrafts(prev => prev.filter(draft => draft.id !== id));
                          await sql`DELETE FROM local_communities WHERE slug = ${id}`.catch(e => console.error("Could not delete draft", e));
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Hosted Communities Widget ── */}
            {myHostedCommunities.length > 0 && (
              <div className="rounded-2xl border border-neutral-200/60 dark:border-neutral-700/40 bg-white dark:bg-[#222222] shadow-xl dark:shadow-[0_8px_32px_rgba(0,0,0,0.6)] overflow-hidden mb-8">
                <div className="px-5 py-4 border-b border-neutral-200/60 dark:border-neutral-700/40 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <h2 className="text-[10px] font-semibold tracking-widest uppercase text-neutral-400 dark:text-neutral-500 select-none">
                      Hosted Communities
                    </h2>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/50">
                      {myHostedCommunities.length}
                    </span>
                  </div>
                </div>
                <div className="p-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {myHostedCommunities.map((c, i) => <CommunityCard key={c.id} c={c} isMember={true} index={i} joiningId={joiningId} leavingId={leavingId} onSelect={handleSelectCommunity} onJoin={handleJoin} onLeave={handleLeave} onDeleteDraft={handleDeleteCommunity} />)}
                  </div>
                </div>
              </div>
            )}

            {/* ── My Communities Widget ── */}
            <div className="rounded-2xl border border-neutral-200/60 dark:border-neutral-700/40 bg-white dark:bg-[#222222] shadow-xl dark:shadow-[0_8px_32px_rgba(0,0,0,0.6)] overflow-hidden mb-8">
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
                            <span className="text-[13px] leading-relaxed text-neutral-700 dark:text-neutral-300">{typeof m === 'string' ? m : m.statement}</span>
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
                          <div key={i} className="px-2.5 py-1 bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-md text-[11px] font-medium text-neutral-700 dark:text-neutral-300" title={val.description}>{typeof val === 'string' ? val : val.core_term}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Footer action */}
              <div className="pt-6 border-t border-neutral-100 dark:border-neutral-800 mt-6">
                {(() => {
                  const isOwned = myHostedCommunities.some(c => c.id === selectedCommunity.id);
                  const isJoined = myCommunities.some(c => c.id === selectedCommunity.id);
                  if (isOwned) return (
                    <p className="text-center text-[12px] text-neutral-400 dark:text-neutral-500">You own this community.</p>
                  );
                   if (isJoined) return (
                    pendingModalLeave ? (
                      <div className="flex items-center gap-2 w-full p-2 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 animate-in fade-in slide-in-from-bottom-2 duration-150">
                        <span className="flex-1 text-[11px] font-medium text-red-600 dark:text-red-400 text-center leading-none">Leave this community?</span>
                        <button
                          onClick={(e) => { handleLeave(selectedCommunity.id, e); setSelectedCommunity(null); }}
                          className="px-3 py-2 rounded-md bg-red-600 text-white text-[11px] font-semibold hover:bg-red-700 transition-colors shadow-sm"
                        >Yes</button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setPendingModalLeave(false); }}
                          className="px-3 py-2 rounded-md bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700 text-[11px] font-semibold hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors shadow-sm"
                        >No</button>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); setPendingModalLeave(true); }}
                        className="w-full text-[12px] font-medium px-3 py-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-all active:scale-[0.98]"
                      >
                        Leave Community
                      </button>
                    )
                  );
                  return (
                    <button
                      onClick={(e) => { handleJoin(selectedCommunity.id, e); setSelectedCommunity(null); }}
                      className="w-full text-[12px] font-medium px-3 py-2.5 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-all active:scale-[0.98] shadow-sm"
                    >
                      Join Community
                    </button>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      )}


    </main>
  );
}
