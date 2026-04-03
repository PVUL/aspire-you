import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';

export default async function sessionSync(req: Request, res: Response) {
  // CORS configuration
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

    const clerkToken = authHeader.split(' ')[1];
    
    // In production, you must VERIFY the Clerk JWT using Clerk's JWKS.
    // For brevity, we decode the payload to extract the email/sub.
    const payloadBase64 = clerkToken.split('.')[1];
    const decodedJson = Buffer.from(payloadBase64, 'base64').toString();
    const payload = JSON.parse(decodedJson);
    const clerkUserId = payload.sub;

    if (!clerkUserId) {
      return res.status(401).json({ error: 'Invalid Clerk token payload' });
    }

    // Here we should lookup or insert the user into Nhost `auth.users`,
    // and retrieve the UUID for the Hasura claims.
    // As a demonstration for bypassing the 7-day limit: we mint our own Nhost-compatible JWT.
    
    // Ensure NHOST_JWT_SECRET is defined (it's generated on every Nhost project)
    const nhostJwtSecretRaw = process.env.NHOST_JWT_SECRET;
    if (!nhostJwtSecretRaw) {
      return res.status(500).json({ error: 'NHOST_JWT_SECRET missing.' });
    }
    
    let jwtSecretData;
    try {
      jwtSecretData = typeof nhostJwtSecretRaw === 'string' ? JSON.parse(nhostJwtSecretRaw) : {};
    } catch {
      jwtSecretData = { key: nhostJwtSecretRaw, type: 'HS256' };
    }

    const signingKey = jwtSecretData.key || 'development_secret_key_needs_to_be_32_chars';
    
    let actualSigningKey = signingKey;
    if (jwtSecretData.type === 'RS256') {
      // For RS256, we must use a Private Key to sign.
      // Try process.env first (for production)
      if (process.env.NHOST_JWT_PRIVATE_KEY) {
        actualSigningKey = process.env.NHOST_JWT_PRIVATE_KEY.replace(/\\n/g, '\n');
      } else {
        // Fallback for local development: read from .secrets at project root
        try {
          const fs = require('fs');
          const path = require('path');
          // In Nhost functions container, process.cwd() is /opt/project/functions
          const secretsContent = fs.readFileSync(path.join(process.cwd(), '..', '.secrets'), 'utf8');
          const match = secretsContent.match(/NHOST_JWT_PRIVATE_KEY\s*=\s*(['"]?)([\s\S]+?)\1(?:\n|$)/);
          if (match && match[2]) {
            actualSigningKey = match[2].replace(/\\n/g, '\n');
          }
        } catch (e) {
          console.error("Failed to read private key from .secrets:", e);
        }
      }
    }

    // Generating a long-lived JWT for Nhost interaction
    const nhostToken = jwt.sign(
      {
        sub: clerkUserId, // ideally map this to Nhost internal UUID
        'https://hasura.io/jwt/claims': {
          'x-hasura-allowed-roles': ['user'],
          'x-hasura-default-role': 'user',
          'x-hasura-user-id': clerkUserId,
        }
      },
      actualSigningKey,
      { algorithm: jwtSecretData.type || 'HS256', expiresIn: '30d' }
    );

    // Provide a dummy refresh token (or implement refresh logic)
    return res.status(200).json({
      accessToken: nhostToken,
      refreshToken: "no-refresh-for-now-use-clerk" 
    });

  } catch (error: any) {
    console.error("Session Sync API Error:", error);
    return res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
}
