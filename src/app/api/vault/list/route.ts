import { auth } from "@/lib/auth";
import { Octokit } from "@octokit/rest";
import Database from "better-sqlite3";
import { NextResponse } from "next/server";

const db = new Database("auth.db");

export async function GET(req: Request) {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session || !session.user) throw new Error("Unauthorized");

    const result = db
      .prepare("SELECT accessToken FROM account WHERE userId = ? AND providerId = 'github' LIMIT 1")
      .get(session.user.id) as { accessToken: string } | undefined;

    if (!result?.accessToken) throw new Error("No GitHub connection");

    const octokit = new Octokit({ auth: result.accessToken });
    const { data: user } = await octokit.rest.users.getAuthenticated();

    let vaultExists = false;
    let githubUrl = `https://github.com/${user.login}/aspire-vault`;

    try {
      await octokit.rest.repos.get({
        owner: user.login,
        repo: "aspire-vault",
      });
      vaultExists = true;
    } catch (e: any) {
      if (e.status !== 404) throw e;
    }

    if (!vaultExists) {
      return NextResponse.json({ files: [], vaultExists, githubUrl });
    }

    try {
      let rootFiles: any[] = [];
      let entryFiles: any[] = [];

      try {
        const { data: rootData } = await octokit.rest.repos.getContent({
          owner: user.login,
          repo: "aspire-vault",
          path: "",
        });
        if (Array.isArray(rootData)) rootFiles = rootData;
      } catch(e) {}

      try {
        const { data: entriesData } = await octokit.rest.repos.getContent({
          owner: user.login,
          repo: "aspire-vault",
          path: "entries",
        });
        if (Array.isArray(entriesData)) entryFiles = entriesData;
      } catch (e: any) {
        if (e.status !== 404) throw e;
      }

      const allData = [...rootFiles, ...entryFiles];

      const files = allData
        .filter((file) => file.name.endsWith(".md") && file.name.toLowerCase() !== "readme.md")
        .map((file) => ({
          name: file.name,
          date: file.name.replace(".md", ""),
          sha: file.sha,
          path: file.path,
        }));

      return NextResponse.json({ files, vaultExists, githubUrl });
    } catch (e: any) {
      if (e.status === 404) {
        // 'entries' folder doesn't exist yet
        return NextResponse.json({ files: [], vaultExists, githubUrl });
      }
      throw e;
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
