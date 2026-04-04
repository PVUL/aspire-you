import { Request, Response } from 'express';
import { getSecret } from '../_utils/localSecrets';

export default async function githubConnect(req: Request, res: Response) {
  // GITHUB_CLIENT_ID is public (sent in OAuth redirect URL).
  // getSecret() checks process.env first, then .secrets/.env.local for local dev.
  const GITHUB_CLIENT_ID = getSecret('GITHUB_CLIENT_ID') || 'Ov23lirQs4rAQCbDPihn';

  const userId = req.query.user_id as string;
  const redirectAfter = req.query.redirect_uri as string || '/';

  // We encode the user_id + redirect in the state param so the callback can associate it
  const state = Buffer.from(JSON.stringify({ userId, redirectAfter })).toString('base64url');

  // The callback URL must match the registered GitHub OAuth app callback
  const callbackUrl = 'http://localhost:3000/api/auth/callback/github';

  const githubAuthUrl = new URL('https://github.com/login/oauth/authorize');
  githubAuthUrl.searchParams.set('client_id', GITHUB_CLIENT_ID);
  githubAuthUrl.searchParams.set('redirect_uri', callbackUrl);
  githubAuthUrl.searchParams.set('scope', 'repo');
  githubAuthUrl.searchParams.set('state', state);

  return res.redirect(githubAuthUrl.toString());
}
