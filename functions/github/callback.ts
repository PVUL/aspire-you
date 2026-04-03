import { Request, Response } from 'express';

export default async function githubCallback(req: Request, res: Response) {
  const GITHUB_CLIENT_ID = 'Ov23lirQs4rAQCbDPihn';
  const GITHUB_CLIENT_SECRET = '0dd7e29cc7e1fedefb2adcb555912f9cda6365c1';

  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
    return res.status(500).json({ error: 'Missing GitHub OAuth credentials' });
  }

  const code = req.query.code as string;
  const stateRaw = req.query.state as string;

  if (!code || !stateRaw) {
    return res.status(400).json({ error: 'Missing code or state' });
  }

  let state: { userId: string; redirectAfter: string };
  try {
    state = JSON.parse(Buffer.from(stateRaw, 'base64url').toString());
  } catch {
    return res.status(400).json({ error: 'Invalid state parameter' });
  }

  try {
    // Exchange the code for an access token
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
      }),
    });

    const tokenData: any = await tokenRes.json();

    if (tokenData.error) {
      return res.status(400).json({ error: tokenData.error_description || tokenData.error });
    }

    const githubAccessToken = tokenData.access_token;

    // Store the GitHub token associated with this user in Nhost Postgres
    // For now, we use a simple approach: store in a `github_connections` table
    // This requires the table to exist in your Nhost Postgres:
    //
    //   CREATE TABLE public.github_connections (
    //     user_id TEXT PRIMARY KEY,
    //     access_token TEXT NOT NULL,
    //     updated_at TIMESTAMPTZ DEFAULT NOW()
    //   );
    //
    // Using the Nhost GraphQL admin endpoint to upsert:
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
          mutation UpsertGithubConnection($userId: String!, $accessToken: String!) {
            insert_github_connections_one(
              object: { user_id: $userId, access_token: $accessToken, updated_at: "now()" }
              on_conflict: { constraint: github_connections_pkey, update_columns: [access_token, updated_at] }
            ) {
              user_id
            }
          }
        `,
        variables: {
          userId: state.userId,
          accessToken: githubAccessToken,
        },
      }),
    });

    const gqlData: any = await gqlRes.json();
    if (gqlData.errors) {
      console.error('Failed to store GitHub token:', gqlData.errors);
      // Still redirect the user, but with an error flag
      return res.redirect(`${state.redirectAfter}?github=error`);
    }

    // Redirect the user back to the app with a success flag
    return res.redirect(`${state.redirectAfter}?github=connected`);

  } catch (error: any) {
    console.error('GitHub callback error:', error);
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
}
