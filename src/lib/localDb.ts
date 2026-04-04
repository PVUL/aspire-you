import { SQLocal } from 'sqlocal';

export const db = new SQLocal('aspire-journal.sqlite3');

// Wrapper for sql to dispatch events on mutations for realtime debugger refresh
export const sql = async (strings: TemplateStringsArray, ...values: any[]) => {
  const result = await db.sql(strings, ...values);
  const queryStr = strings.join('');
  if (/(?:INSERT|UPDATE|DELETE|REPLACE|DROP|ALTER)\b/i.test(queryStr)) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sqlite-mutation'));
    }
  }
  return result;
};

// Execute arbitrary raw SQL — used by the debug panel
export async function execRaw(query: string): Promise<Record<string, unknown>[]> {
  // sqlocal tagged template trick: pass raw string as the strings array
  return (db.sql as any)([query], ...[]) as Promise<Record<string, unknown>[]>;
}

export async function initDb() {
  await sql`
    CREATE TABLE IF NOT EXISTS entries (
      date TEXT PRIMARY KEY,
      content TEXT,
      sha TEXT,
      last_synced_at INTEGER,
      updated_at INTEGER
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS local_communities (
      slug TEXT PRIMARY KEY,
      content TEXT,
      sha TEXT,
      last_synced_at INTEGER,
      updated_at INTEGER
    )
  `;
}

export type EntryRecord = {
  date: string;
  content: string;
  sha: string | null;
  last_synced_at: number | null;
  updated_at: number;
};
