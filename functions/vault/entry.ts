import { Request, Response } from 'express';
import { Octokit } from '@octokit/rest';

const VAULT_REPO_NAME = "aspire-vault";

export default async function entryVault(req: Request, res: Response) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Missing authorization header' });

    // Decode the JWT payload to get the user ID
    const token = authHeader.replace(/^Bearer\s/i, '').trim();
    if (!token || token === 'undefined' || token === 'null' || !token.includes('.')) {
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
    const githubToken = gqlData?.data?.user_vault_connections_by_pk?.access_token;

    if (!githubToken) {
      return res.status(400).json({ error: 'No GitHub connection found.', code: 'GITHUB_NOT_CONNECTED' });
    }

    const octokit = new Octokit({ auth: githubToken });
    const { data: user } = await octokit.rest.users.getAuthenticated();

    const { date, content, sha } = req.body;
    const path = `entries/${date}.md`;

    // FETCH ENTRY
    if (req.method === 'POST') {
      try {
        const response = await octokit.rest.repos.getContent({
          owner: user.login,
          repo: VAULT_REPO_NAME,
          path,
        });

        const fileData = response.data as any;
        const decodedContent = Buffer.from(fileData.content, 'base64').toString('utf-8');

        return res.status(200).json({
          content: decodedContent,
          sha: fileData.sha,
        });
      } catch (err: any) {
        if (err.status === 404) {
          return res.status(200).json({ content: "", sha: null }); // explicitly clean empty for new dates
        }
        throw err;
      }
    }

    // PUSH/PUT ENTRY
    if (req.method === 'PUT') {
      const now = new Date();
      const timestamp = now.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';

      // Always fetch the live sha from GitHub for the file at its current path.
      // The client-stored sha may be stale or from a previous root-level location.
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
        // File doesn't exist yet — create it fresh (no sha needed)
      }

      const response = await octokit.rest.repos.createOrUpdateFileContents({
        owner: user.login,
        repo: VAULT_REPO_NAME,
        path,
        message: `journal: update ${date} (${timestamp})`,
        content: Buffer.from(content || "").toString('base64'),
        sha: liveSha,
      });

      return res.status(200).json({
        success: true,
        sha: response.data.content?.sha,
      });
    }

    // DELETE ENTRY
    if (req.method === 'DELETE') {
      const { date, sha: fileSha } = req.body;
      const deletePath = `entries/${date}.md`;
      const now = new Date();
      const timestamp = now.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';

      await octokit.rest.repos.deleteFile({
        owner: user.login,
        repo: VAULT_REPO_NAME,
        path: deletePath,
        message: `journal: delete ${date} (${timestamp})`,
        sha: fileSha,
      });

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: "Method not allowed" });

  } catch (error: any) {
    console.error("Vault Entry API Error:", error);
    return res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
}
