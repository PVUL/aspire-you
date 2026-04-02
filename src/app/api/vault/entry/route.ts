import { auth } from "@/lib/auth";
import { Octokit } from "@octokit/rest";
import Database from "better-sqlite3";
import { NextResponse } from "next/server";
import { format } from "date-fns";

const db = new Database("auth.db");

async function getOctokit(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session || !session.user) throw new Error("Unauthorized");
  
  const result = db
    .prepare("SELECT accessToken FROM account WHERE userId = ? AND providerId = 'github' LIMIT 1")
    .get(session.user.id) as { accessToken: string } | undefined;
    
  if (!result?.accessToken) throw new Error("No GitHub connection found");

  const octokit = new Octokit({ auth: result.accessToken });
  const { data: user } = await octokit.rest.users.getAuthenticated();
  
  return { octokit, username: user.login };
}

export async function GET(req: Request) {
  try {
    const { octokit, username } = await getOctokit(req);
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date") || format(new Date(), "yyyy-MM-dd");
    const path = `entries/${date}.md`;

    try {
      const { data } = await octokit.rest.repos.getContent({
        owner: username,
        repo: "aspire-vault",
        path: `entries/${date}.md`,
      });

      if (!Array.isArray(data) && data.type === "file") {
        const content = Buffer.from(data.content, "base64").toString("utf8");
        return NextResponse.json({ content, sha: data.sha, path: `entries/${date}.md`, date });
      }
    } catch (e: any) {
      if (e.status !== 404) throw e;
    }

    try {
      const { data } = await octokit.rest.repos.getContent({
        owner: username,
        repo: "aspire-vault",
        path: `${date}.md`,
      });

      if (!Array.isArray(data) && data.type === "file") {
        const content = Buffer.from(data.content, "base64").toString("utf8");
        return NextResponse.json({ content, sha: data.sha, path: `${date}.md`, date });
      }
    } catch (e: any) {
      if (e.status === 404) {
        return NextResponse.json({ error: "File not found" }, { status: 404 });
      }
      throw e;
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const { octokit, username } = await getOctokit(req);
    const body = await req.json();
    const { content, sha, date } = body;
    
    const targetDate = date || format(new Date(), "yyyy-MM-dd");
    const path = `entries/${targetDate}.md`;

    const { data } = await octokit.rest.repos.createOrUpdateFileContents({
      owner: username,
      repo: "aspire-vault",
      path,
      message: `Sync journal entry for ${targetDate}`,
      content: Buffer.from(content || "").toString("base64"),
      sha: sha || undefined,
    });

    return NextResponse.json({
      success: true,
      sha: data.content?.sha,
      path,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    if (error.status === 409) {
      return NextResponse.json({ error: "Conflict! Out of date state." }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
