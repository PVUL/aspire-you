import { Request, Response } from 'express';

const NHOST_GRAPHQL_URL = process.env.NHOST_GRAPHQL_URL || 'http://localhost:1337/v1/graphql';
const NHOST_ADMIN_SECRET = process.env.NHOST_ADMIN_SECRET || 'nhost-admin-secret';
const ADMIN_EMAIL = 'paul.a.yun@gmail.com';

export default async function gateSettings(req: Request, res: Response) {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Handle GET request - globally accessible to see if the gate is enabled
  if (req.method === 'GET') {
    try {
      const gqlRes = await fetch(NHOST_GRAPHQL_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hasura-admin-secret': NHOST_ADMIN_SECRET,
        },
        body: JSON.stringify({
          query: `
            query GetGateSetting {
              app_settings_by_pk(key: "password_gate_enabled") {
                value
              }
            }
          `,
        }),
      });

      const gqlData: any = await gqlRes.json();
      if (gqlData.errors) {
        console.error("GQL error fetching gate setting:", gqlData.errors);
        return res.status(500).json({ error: "Database error", details: gqlData.errors });
      }

      // Default to true if not set
      let isEnabled = true;
      const rawVal = gqlData.data?.app_settings_by_pk?.value;
      
      // Handle the manual Postgres column alteration edge cases (could be boolean, string "false", json null, etc)
      if (rawVal === false || rawVal === 'false' || rawVal === 0) {
        isEnabled = false;
      }
      
      return res.status(200).json({ enabled: isEnabled, debugRaw: rawVal, debugGql: gqlData });
    } catch (error: any) {
      console.error('Gate settings read error:', error);
      // Failsafe default to true on error
      return res.status(200).json({ enabled: true });
    }
  }

  // Handle POST request - update the gate setting (admin only)
  if (req.method === 'POST') {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Missing authorization header' });
    }

    const token = authHeader.split(' ')[1];
    
    // Verify token payload to get user ID
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
      // Check if user is the admin by querying their email
      const userRes = await fetch(NHOST_GRAPHQL_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hasura-admin-secret': NHOST_ADMIN_SECRET,
        },
        body: JSON.stringify({
          query: `
            query GetUserEmail($userId: uuid!) {
              user(id: $userId) {
                email
              }
            }
          `,
          variables: { userId: nhostUserId },
        }),
      });

      const userData: any = await userRes.json();
      if (userData.errors) {
        console.error("GraphQL Error fetching user:", userData.errors);
      }
      const email = userData.data?.user?.email;

      if (email !== ADMIN_EMAIL) {
        return res.status(403).json({ error: 'Forbidden: Admin access required' });
      }

      const { enabled } = req.body;
      if (typeof enabled !== 'boolean') {
        return res.status(400).json({ error: 'Missing or invalid "enabled" boolean flag' });
      }

      // Update the setting
      const updateRes = await fetch(NHOST_GRAPHQL_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hasura-admin-secret': NHOST_ADMIN_SECRET,
        },
        body: JSON.stringify({
          query: `
            mutation UpdateGateSetting($val: Boolean!) {
              insert_app_settings_one(
                object: { key: "password_gate_enabled", value: $val },
                on_conflict: { constraint: app_settings_pkey, update_columns: [value] }
              ) {
                value
              }
            }
          `,
          variables: { val: enabled },
        }),
      });

      const updateData: any = await updateRes.json();
      if (updateData.errors) {
        console.error("GQL error updating gate setting:", updateData.errors);
        return res.status(500).json({ error: "Database error" });
      }

      return res.status(200).json({ success: true, enabled });
    } catch (error: any) {
      console.error('Gate settings update error:', error);
      return res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
  }

  // Unsupported methods
  return res.status(405).json({ error: 'Method Not Allowed' });
}
