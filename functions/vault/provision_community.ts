import { Request, Response } from 'express';
import { Octokit } from '@octokit/rest';

export default async function provisionCommunity(req: Request, res: Response) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Missing authorization header' });
    }

    const token = authHeader.replace(/^Bearer\s/i, '').trim();
    if (!token || !token.includes('.')) {
      return res.status(401).json({ error: 'Missing or malformed authorization token' });
    }
    const payloadBase64 = token.split('.')[1];
    const decodedJson = Buffer.from(payloadBase64, 'base64').toString();
    const payload = JSON.parse(decodedJson);
    const userId = payload.sub || payload['https://hasura.io/jwt/claims']?.['x-hasura-user-id'];

    if (!userId) {
      return res.status(401).json({ error: 'Invalid token payload' });
    }

    const NHOST_GRAPHQL_URL = process.env.NHOST_GRAPHQL_URL || 'http://localhost:1337/v1/graphql';
    const NHOST_ADMIN_SECRET = process.env.NHOST_ADMIN_SECRET || 'nhost-admin-secret';

    const gqlRes = await fetch(NHOST_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hasura-admin-secret': NHOST_ADMIN_SECRET,
      },
      body: JSON.stringify({
        query: `
          query GetGithubConnection($userId: String!) {
            user_vault_connections_by_pk(user_id: $userId, provider: "github") {
              access_token
            }
          }
        `,
        variables: { userId },
      }),
    });

    const gqlData: any = await gqlRes.json();
    const githubToken = gqlData?.data?.user_vault_connections_by_pk?.access_token;

    if (!githubToken) {
      return res.status(400).json({ error: 'No GitHub connection found.', code: 'GITHUB_NOT_CONNECTED' });
    }

    const { slug, name, missions, values } = req.body;
    if (!slug || !name) {
      return res.status(400).json({ error: 'Slug and name are required' });
    }

    const octokit = new Octokit({ auth: githubToken });
    const { data: user } = await octokit.rest.users.getAuthenticated();

    // 1. Create the new community repository
    let newRepo;
    try {
      const resp = await octokit.rest.repos.createForAuthenticatedUser({
        name: slug,
        private: true,
        description: `Aspire You Community: ${name}`,
        auto_init: true,
      });
      newRepo = resp.data;
      // Wait for GitHub to finalize the auto-init commit
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (err: any) {
      if (err.status === 422) {
        const existing = await octokit.rest.repos.get({ owner: user.login, repo: slug });
        newRepo = existing.data;
      } else {
        throw err;
      }
    }

    // If the repo exists but is empty (no branches), seed it via the Contents API
    const defaultBranch = newRepo.default_branch || 'main';
    let repoIsEmpty = false;
    try {
      await octokit.rest.repos.getBranch({ owner: user.login, repo: slug, branch: defaultBranch });
    } catch (branchErr: any) {
      if (branchErr.status === 404) repoIsEmpty = true;
    }

    if (repoIsEmpty) {
      await octokit.rest.repos.createOrUpdateFileContents({
        owner: user.login,
        repo: slug,
        path: 'README.md',
        message: 'Initialize repository',
        content: Buffer.from('# Initializing...').toString('base64'),
      });
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    // Prepare content strings
    const readmeContent = `# ${name}\n\nAn \`aspire.you\` community.`;
    const missionsContent = missions?.length ? missions.map((m: any) => `- ${m}\n`).join('') : 'No missions defined.';
    const valuesContent = values?.length ? values.map((v: any) => `- **${v.term}**: ${v.description || ''}\n`).join('') : 'No core values defined.';
    const membersContent = `# Members\n\n- @${user.login} (Creator)`;
    const ownersContent = `# Owners\n\n- @${user.login}`;

    // Helper: Create blob
    const createBlob = async (content: string) => {
      const res = await octokit.rest.git.createBlob({
        owner: user.login,
        repo: slug,
        content: Buffer.from(content).toString('base64'),
        encoding: 'base64',
      });
      return res.data.sha;
    };

    // Get the base tree from the existing default branch (defaultBranch declared above)
    let baseTreeSha: string | undefined = undefined;
    let parentCommitSha: string | undefined = undefined;
    try {
      const branchRes = await octokit.rest.repos.getBranch({
        owner: user.login,
        repo: slug,
        branch: defaultBranch,
      });
      baseTreeSha = branchRes.data.commit.commit.tree.sha;
      parentCommitSha = branchRes.data.commit.sha;
    } catch (e) {
      console.warn("Could not get default branch after init, proceeding without base tree");
    }

    const readmeSha = await createBlob(readmeContent);
    const missionsSha = await createBlob(missionsContent);
    const valuesSha = await createBlob(valuesContent);
    const membersSha = await createBlob(membersContent);
    const ownersSha = await createBlob(ownersContent);

    const treeData = [
      { path: 'README.md', mode: '100644' as const, type: 'blob' as const, sha: readmeSha },
      { path: 'missions.md', mode: '100644' as const, type: 'blob' as const, sha: missionsSha },
      { path: 'values.md', mode: '100644' as const, type: 'blob' as const, sha: valuesSha },
      { path: 'contributors/members.md', mode: '100644' as const, type: 'blob' as const, sha: membersSha },
      { path: 'contributors/owners.md', mode: '100644' as const, type: 'blob' as const, sha: ownersSha }
    ];

    const treeRes = await octokit.rest.git.createTree({
      owner: user.login,
      repo: slug,
      base_tree: baseTreeSha,
      tree: treeData
    });

    const commitPayload: any = {
      owner: user.login,
      repo: slug,
      message: 'Initial commit: Scaffold aspire.you community',
      tree: treeRes.data.sha
    };
    // Parent the commit on the auto-init commit so we don't orphan it
    if (parentCommitSha) {
      commitPayload.parents = [parentCommitSha];
    }

    const commitRes = await octokit.rest.git.createCommit(commitPayload);

    // Update the default branch ref to point to our new commit
    await octokit.rest.git.updateRef({
      owner: user.login,
      repo: slug,
      ref: `heads/${defaultBranch}`,
      sha: commitRes.data.sha,
      force: true
    });

    // ── Admin DB Operations (bypasses Hasura RLS so source_id can be set to communityId) ──
    const adminGql = async (query: string, variables: Record<string, any>) => {
      const r = await fetch(NHOST_GRAPHQL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-hasura-admin-secret': NHOST_ADMIN_SECRET },
        body: JSON.stringify({ query, variables }),
      });
      return r.json();
    };

    // 1. Insert community
    const commRes: any = await adminGql(
      `mutation CreateComm($name: String!, $slug: String!) {
        insert_communities_one(object: {name: $name, slug: $slug, is_public: true}) { id }
      }`,
      { name, slug }
    );
    const communityId: string | null = commRes.data?.insert_communities_one?.id ?? null;

    if (communityId) {
      // 2. Owner edge (source_id = userId, target_id = communityId)
      await adminGql(
        `mutation OwnerEdge($src: uuid!, $tgt: uuid!) {
          insert_edges_one(object: {source_id: $src, target_id: $tgt, type: "member_of", metadata: {role: "owner"}}) { id }
        }`,
        { src: userId, tgt: communityId }
      );

      // 3. Missions
      for (const m of (missions || [])) {
        const mRes: any = await adminGql(
          `mutation CreateMission($statement: String!) { insert_missions_one(object: {statement: $statement}) { id } }`,
          { statement: m }
        );
        const mId = mRes.data?.insert_missions_one?.id;
        if (mId) {
          await adminGql(
            `mutation LinkMission($src: uuid!, $tgt: uuid!) {
              insert_edges_one(object: {source_id: $src, target_id: $tgt, type: "adopts_mission", metadata: {}}) { id }
            }`,
            { src: communityId, tgt: mId }
          );
        }
      }

      // 4. Values
      for (const v of (values || [])) {
        const term = typeof v === 'string' ? v : v.term;
        const vRes: any = await adminGql(
          `mutation CreateValue($term: String!) { insert_values_one(object: {core_term: $term, description: ""}) { id } }`,
          { term }
        );
        const vId = vRes.data?.insert_values_one?.id;
        if (vId) {
          await adminGql(
            `mutation LinkValue($src: uuid!, $tgt: uuid!) {
              insert_edges_one(object: {source_id: $src, target_id: $tgt, type: "embodies_value", metadata: {}}) { id }
            }`,
            { src: communityId, tgt: vId }
          );
        }
      }
    }

    return res.status(200).json({ 
      success: true, 
      message: "Community repository created", 
      repo: slug,
      community_id: communityId,
      commit_sha: commitRes.data.sha,
      html_url: newRepo.html_url
    });

  } catch (error: any) {
    console.error("Community Provisioning API Error:", error);
    if (error.code === 'UND_ERR_CONNECT_TIMEOUT' || error.message?.includes('timeout')) {
       return res.status(504).json({ error: "Connection Timeout Error connecting to GitHub. Please try again.", code: "TIMEOUT" });
    }
    return res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
}
