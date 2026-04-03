import { Request, Response } from 'express';
import { Octokit } from '@octokit/rest';

const VAULT_REPO_NAME = "aspire-vault";

export default async function provisionVault(req: Request, res: Response) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Missing authorization header' });
    }

    // Decode the JWT payload to get the user ID
    const token = authHeader.replace(/^Bearer\s/i, '').trim();
    if (!token || token === 'undefined' || token === 'null' || !token.includes('.')) {
      return res.status(401).json({ error: 'Missing or malformed authorization token' });
    }
    const payloadBase64 = token.split('.')[1];
    const decodedJson = Buffer.from(payloadBase64, 'base64').toString();
    const payload = JSON.parse(decodedJson);
    const userId = payload.sub || payload['https://hasura.io/jwt/claims']?.['x-hasura-user-id'];

    if (!userId) {
      return res.status(401).json({ error: 'Invalid token payload' });
    }

    // Fetch the GitHub access token from our own Postgres table
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
            github_connections_by_pk(user_id: $userId) {
              access_token
            }
          }
        `,
        variables: { userId },
      }),
    });

    const gqlData: any = await gqlRes.json();
    const githubToken = gqlData?.data?.github_connections_by_pk?.access_token;

    if (!githubToken) {
      return res.status(400).json({
        error: 'No GitHub connection found. Please connect your GitHub account first.',
        code: 'GITHUB_NOT_CONNECTED',
      });
    }

    // Provision the vault
    const octokit = new Octokit({ auth: githubToken });
    const { data: user } = await octokit.rest.users.getAuthenticated();
    const username = user.login;

    try {
      await octokit.rest.repos.get({
        owner: username,
        repo: VAULT_REPO_NAME,
      });
      return res.status(200).json({ success: true, message: "Vault exists", repo: VAULT_REPO_NAME });
    } catch (err: any) {
      if (err.status === 404) {
        await octokit.rest.repos.createForAuthenticatedUser({
          name: VAULT_REPO_NAME,
          private: true,
          description: "My Aspire You Journal Vault. Managed locally via CRDT.",
          auto_init: true,
        });
        return res.status(200).json({ success: true, message: "Vault created", repo: VAULT_REPO_NAME });
      }
      throw err;
    }

  } catch (error: any) {
    console.error("Vault Provisioning API Error:", error);
    return res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
}
