import { Request, Response } from 'express';
import { Octokit } from '@octokit/rest';

const VAULT_REPO_NAME = "aspire-vault";

export default async function communityVault(req: Request, res: Response) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Missing authorization header' });

    const token = authHeader.replace(/^Bearer\s/i, '').trim();
    if (!token || !token.includes('.')) {
      return res.status(401).json({ error: 'Missing or malformed authorization token' });
    }
    const payloadBase64 = token.split('.')[1];
    const decodedJson = Buffer.from(payloadBase64, 'base64').toString();
    const payload = JSON.parse(decodedJson);
    const userId = payload.sub || payload['https://hasura.io/jwt/claims']?.['x-hasura-user-id'];

    if (!userId) return res.status(401).json({ error: 'Invalid token payload' });

    const NHOST_GRAPHQL_URL = process.env.NHOST_GRAPHQL_URL || 'http://localhost:1337/v1/graphql';
    const NHOST_ADMIN_SECRET = process.env.NHOST_ADMIN_SECRET || 'nhost-admin-secret';

    const gqlRes = await fetch(NHOST_GRAPHQL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hasura-admin-secret': NHOST_ADMIN_SECRET },
      body: JSON.stringify({
        query: `
          query GetGithubConnection($userId: String!) {
            user_vault_connections_by_pk(user_id: $userId, provider: "github") { access_token }
          }
        `,
        variables: { userId },
      }),
    });

    const gqlData: any = await gqlRes.json();
    if (gqlData.errors) return res.status(500).json({ error: 'Database query error', details: gqlData.errors });

    const githubToken = gqlData?.data?.user_vault_connections_by_pk?.access_token;
    if (!githubToken) return res.status(400).json({ error: 'No GitHub connection found.', code: 'GITHUB_NOT_CONNECTED' });

    const octokit = new Octokit({ auth: githubToken });
    const { data: user } = await octokit.rest.users.getAuthenticated();

    if (req.method === 'PUT') {
      const { slug, content, commit_sha } = req.body;
      const now = new Date();
      const timestamp = now.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';

      // 1. Get base tree of aspire-vault
      let branchRes;
      try {
        branchRes = await octokit.rest.repos.getBranch({
          owner: user.login,
          repo: VAULT_REPO_NAME,
          branch: 'main',
        });
      } catch (err) {
        return res.status(500).json({ error: "aspire-vault not found or no main branch" });
      }
      const baseTreeSha = branchRes.data.commit.commit.tree.sha;

      // 2. Fetch .gitmodules, append new submodule info
      let gitmodulesContent = "";
      try {
        const gmContent = await octokit.rest.repos.getContent({
          owner: user.login, repo: VAULT_REPO_NAME, path: '.gitmodules'
        });
        gitmodulesContent = Buffer.from((gmContent.data as any).content, 'base64').toString('utf-8');
      } catch (e) {
        // Doesn't exist, we will create it
      }

      gitmodulesContent += `\n[submodule "communities/active/${slug}/${slug}"]\n\tpath = communities/active/${slug}/${slug}\n\turl = https://github.com/${user.login}/${slug}.git\n`;
      const gmBlob = await octokit.rest.git.createBlob({
        owner: user.login, repo: VAULT_REPO_NAME, content: Buffer.from(gitmodulesContent).toString('base64'), encoding: 'base64'
      });

      // 3. Create blob for onboarding README
      const readmeBlob = await octokit.rest.git.createBlob({
        owner: user.login, repo: VAULT_REPO_NAME, content: Buffer.from(content || "").toString('base64'), encoding: 'base64'
      });

      // 4. Resolve the target community SHA if it wasn't provided
      let finalCommitSha = commit_sha;
      if (!finalCommitSha) {
        try {
          const cBranch = await octokit.rest.repos.getBranch({
            owner: user.login, repo: slug, branch: 'main'
          });
          finalCommitSha = cBranch.data.commit.sha;
        } catch (e) {
           console.error("Could not resolve community commit SHA", e);
           return res.status(500).json({ error: "Could not link community repository, make sure its created." });
        }
      }

      // 5. Construct Tree
      const treeData = [
        { path: '.gitmodules', mode: '100644' as const, type: 'blob' as const, sha: gmBlob.data.sha },
        { path: `communities/active/${slug}/README.md`, mode: '100644' as const, type: 'blob' as const, sha: readmeBlob.data.sha },
        { path: `communities/active/${slug}/${slug}`, mode: '160000' as const, type: 'commit' as const, sha: finalCommitSha }
      ];

      const treeRes = await octokit.rest.git.createTree({
        owner: user.login, repo: VAULT_REPO_NAME, base_tree: baseTreeSha, tree: treeData
      });

      // 6. Commit
      const commitRes = await octokit.rest.git.createCommit({
        owner: user.login, repo: VAULT_REPO_NAME,
        message: `community: join ${slug} (${timestamp})`,
        tree: treeRes.data.sha,
        parents: [branchRes.data.commit.sha]
      });

      await octokit.rest.git.updateRef({
        owner: user.login, repo: VAULT_REPO_NAME, ref: 'heads/main', sha: commitRes.data.sha
      });

      return res.status(200).json({ success: true, sha: commitRes.data.sha });
    }

    if (req.method === 'DELETE') {
      const { slug } = req.body;
      const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';

      // Advanced Delete: To "move" from active to archived, we fetch the tree of communities/active/${slug}
      // and map those tree entries to communities/archived/${slug}.
      // Since building large tree traversals manually in Octokit can be very brittle, we'll implement a simpler approach:
      // We will commit a removal of the `.gitmodules` entry and let the actual moving happen either client-side or during next major sync.
      // Wait, we can easily remove it by creating a tree update setting the active path to null.

      const branchRes = await octokit.rest.repos.getBranch({ owner: user.login, repo: VAULT_REPO_NAME, branch: 'main' });
      
      let gitmodulesContent = "";
      try {
        const gmContent = await octokit.rest.repos.getContent({ owner: user.login, repo: VAULT_REPO_NAME, path: '.gitmodules' });
        gitmodulesContent = Buffer.from((gmContent.data as any).content, 'base64').toString('utf-8');
      } catch(e) {}

      // Attempt to remove the submodule entry
      const regex = new RegExp(`\\[submodule "communities\\/active\\/${slug}\\/${slug}"\\][\\s\\S]*?url = .*\\n`, 'g');
      gitmodulesContent = gitmodulesContent.replace(regex, '');
      const gmBlob = await octokit.rest.git.createBlob({
         owner: user.login, repo: VAULT_REPO_NAME, content: Buffer.from(gitmodulesContent).toString('base64'), encoding: 'base64'
      });

      // Fetch the active README to construct tombstone
      let archivedReadmeBase64 = Buffer.from(`# ${slug}\n\nArchived community.`).toString('base64');
      try {
        const activeReadme = await octokit.rest.repos.getContent({ owner: user.login, repo: VAULT_REPO_NAME, path: `communities/active/${slug}/README.md` });
        let activeContent = Buffer.from((activeReadme.data as any).content, 'base64').toString('utf-8');
        // Inject left_at into frontmatter
        const localNow = new Date().toISOString().slice(0, 16).replace('T', ' ');
        if (activeContent.includes('---')) {
          activeContent = activeContent.replace('---\n', `---\nleft_at: ${localNow}\nstatus: archived\n`);
        } else {
          activeContent = `---\nleft_at: ${localNow}\nstatus: archived\n---\n\n` + activeContent;
        }
        archivedReadmeBase64 = Buffer.from(activeContent).toString('base64');
      } catch (e) {
        // Fallback if missing
      }

      const readmeBlob = await octokit.rest.git.createBlob({
         owner: user.login, repo: VAULT_REPO_NAME, content: archivedReadmeBase64, encoding: 'base64'
      });

      const treeData: any = [
        { path: '.gitmodules', mode: '100644', type: 'blob', sha: gmBlob.data.sha },
        // Purging active path
        { path: `communities/active/${slug}/${slug}`, mode: '160000', sha: null },
        { path: `communities/active/${slug}/README.md`, mode: '100644', sha: null },
        // Creating archived tombstone
        { path: `communities/archived/${slug}/README.md`, mode: '100644', type: 'blob', sha: readmeBlob.data.sha }
      ];

      const treeRes = await octokit.rest.git.createTree({
         owner: user.login, repo: VAULT_REPO_NAME, base_tree: branchRes.data.commit.commit.tree.sha, tree: treeData
      });

      const commitRes = await octokit.rest.git.createCommit({
         owner: user.login, repo: VAULT_REPO_NAME, message: `community: archive ${slug} (${timestamp})`,
         tree: treeRes.data.sha, parents: [branchRes.data.commit.sha]
      });

      await octokit.rest.git.updateRef({
         owner: user.login, repo: VAULT_REPO_NAME, ref: 'heads/main', sha: commitRes.data.sha
      });

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: "Method not allowed" });

  } catch (error: any) {
    console.error("Vault Community API Error:", error);
    return res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
}
