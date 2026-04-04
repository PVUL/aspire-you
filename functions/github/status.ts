import { Request, Response } from 'express';

export default async function githubStatus(req: Request, res: Response) {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Missing authorization header' });
  }

  const token = authHeader.split(' ')[1];
  
  // Verify token (in production, verify properly using JWKS)
  const payloadBase64 = token.split('.')[1];
  let nhostUserId: string;
  try {
    const decodedJson = Buffer.from(payloadBase64, 'base64').toString();
    const payload = JSON.parse(decodedJson);
    nhostUserId = payload.sub || payload['https://hasura.io/jwt/claims']?.['x-hasura-user-id'];
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  if (!nhostUserId) {
    return res.status(401).json({ error: 'Invalid user id' });
  }

  try {
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
              user_id
              access_token
            }
          }
        `,
        variables: {
          userId: nhostUserId,
        },
      }),
    });

    const gqlData: any = await gqlRes.json();
    if (gqlData.errors || !gqlData.data) {
      console.error("GQL error fetching github connection:", gqlData.errors);
      return res.status(500).json({ error: "Database error" });
    }

    const connection = gqlData.data.user_vault_connections_by_pk;
    if (!connection) {
      return res.status(200).json({ connected: false });
    }

    // Since we have the github token, let's also check if "aspire-vault" repository exists
    const octokitRes = await fetch('https://api.github.com/user/repos?affiliation=owner', {
      headers: {
        Authorization: `Bearer ${connection.access_token}`,
        Accept: 'application/vnd.github.v3+json'
      }
    });

    if (octokitRes.ok) {
      const repos = await octokitRes.json();
      const vaultRepo = repos.find((r: any) => r.name === 'aspire-vault');
      
      return res.status(200).json({
        connected: true,
        vaultExists: !!vaultRepo,
        vaultUrl: vaultRepo ? vaultRepo.html_url : null
      });
    }

    // Token might be revoked or expired
    return res.status(200).json({ connected: true, vaultExists: false });

  } catch (error: any) {
    console.error('Github status error:', error);
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
}
