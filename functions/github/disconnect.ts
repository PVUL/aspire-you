import { Request, Response } from 'express';

export default async function githubDisconnect(req: Request, res: Response) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Missing authorization header' });

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
      headers: {
        'Content-Type': 'application/json',
        'x-hasura-admin-secret': NHOST_ADMIN_SECRET,
      },
      body: JSON.stringify({
        query: `
          mutation DeleteUserVaultConnection($userId: String!) {
            delete_user_vault_connections_by_pk(user_id: $userId, provider: "github") {
              user_id
            }
          }
        `,
        variables: { userId },
      }),
    });

    const gqlData: any = await gqlRes.json();
    if (gqlData.errors) {
      console.error('Failed to delete user vault connection:', gqlData.errors);
      return res.status(500).json({ error: 'Database error' });
    }

    return res.status(200).json({ success: true, message: 'Disconnected from GitHub' });

  } catch (error: any) {
    console.error("Github Disconnect API Error:", error);
    return res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
}
