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
    if (gqlData.errors) {
      console.error("Database query error:", gqlData.errors);
      return res.status(500).json({ error: 'Database query error', details: gqlData.errors });
    }

    const githubToken = gqlData?.data?.user_vault_connections_by_pk?.access_token;

    if (!githubToken) {
      return res.status(400).json({ error: 'No GitHub connection found.', code: 'GITHUB_NOT_CONNECTED' });
    }

    const octokit = new Octokit({ auth: githubToken });
    const { data: user } = await octokit.rest.users.getAuthenticated();

    if (req.method === 'PUT') {
      const { slug, content } = req.body;
      const path = `my-communities/${slug}.md`;
      const now = new Date();
      const timestamp = now.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';

      let liveSha: string | undefined;
      try {
        const existing = await octokit.rest.repos.getContent({
          owner: user.login,
          repo: VAULT_REPO_NAME,
          path,
        });
        liveSha = (existing.data as any).sha;
      } catch (err: any) {
        if (err.status !== 404) throw err;
      }

      await octokit.rest.repos.createOrUpdateFileContents({
        owner: user.login,
        repo: VAULT_REPO_NAME,
        path,
        message: `community: join ${slug} (${timestamp})`,
        content: Buffer.from(content || "").toString('base64'),
        sha: liveSha,
      });

      return res.status(200).json({ success: true });
    }

    if (req.method === 'DELETE') {
      const { slug } = req.body;
      const path = `my-communities/${slug}.md`;
      const now = new Date();
      const timestamp = now.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
      const formattedDate = now.toISOString().replace('T', ' ').substring(0, 16); // YYYY-MM-DD HH:mm

      let liveSha: string | undefined;
      let existingContent = "";
      try {
        const existing = await octokit.rest.repos.getContent({
          owner: user.login,
          repo: VAULT_REPO_NAME,
          path,
        });
        liveSha = (existing.data as any).sha;
        existingContent = Buffer.from((existing.data as any).content || "", 'base64').toString('utf-8');
      } catch (err: any) {
        if (err.status !== 404) throw err;
        return res.status(200).json({ success: true, message: "File not found, nothing to do." });
      }

      // Inject left_at into the frontmatter
      let newContent = existingContent;
      if (newContent.startsWith('---')) {
        newContent = newContent.replace('---', `---\nleft_at: ${formattedDate}`);
      } else {
        newContent = `---\nleft_at: ${formattedDate}\n---\n\n${newContent}`;
      }

      await octokit.rest.repos.createOrUpdateFileContents({
        owner: user.login,
        repo: VAULT_REPO_NAME,
        path,
        message: `community: leave ${slug} (${timestamp})`,
        content: Buffer.from(newContent).toString('base64'),
        sha: liveSha,
      });

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: "Method not allowed" });

  } catch (error: any) {
    console.error("Vault Community API Error:", error);
    return res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
}
