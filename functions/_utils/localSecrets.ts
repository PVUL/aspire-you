/**
 * Local dev secret loader.
 *
 * The Nhost CLI does NOT inject [[functions.env]] secrets from nhost.toml
 * into the local functions container. This utility reads .secrets (and .env.local)
 * from the mounted project volume (/opt/project) as a fallback.
 *
 * In production (Nhost cloud), process.env is always set correctly — this
 * file is never reached because the early `process.env.X` check succeeds.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

let _cache: Record<string, string> | null = null;

function loadFile(filePath: string): Record<string, string> {
  const result: Record<string, string> = {};
  try {
    const content = readFileSync(filePath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      // Strip surrounding quotes from value
      let value = trimmed.slice(eqIdx + 1).trim();
      if ((value.startsWith("'") && value.endsWith("'")) ||
          (value.startsWith('"') && value.endsWith('"'))) {
        value = value.slice(1, -1);
      }
      result[key] = value;
    }
  } catch {
    // File not present — silently skip
  }
  return result;
}

function getSecrets(): Record<string, string> {
  if (_cache) return _cache;
  const projectRoot = process.env.NHOST_PROJECT_PATH || '/opt/project';
  _cache = {
    ...loadFile(join(projectRoot, '.env.local')),
    // .secrets takes precedence over .env.local
    ...loadFile(join(projectRoot, '.secrets')),
  };
  return _cache;
}

/**
 * Get a secret value: checks process.env first (cloud/injected),
 * then falls back to local .secrets / .env.local files.
 */
export function getSecret(key: string): string | undefined {
  return process.env[key] ?? getSecrets()[key];
}
