import { auth } from "@/lib/auth";
import { provisionVaultIfMissing } from "@/services/github";
import Database from "better-sqlite3";
import { NextResponse } from "next/server";

const db = new Database("auth.db");

export async function POST(req: Request) {
  try {
    // 1. Get the current user session
    const session = await auth.api.getSession({
      headers: req.headers,
    });

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Fetch the GitHub access token directly from our SQLite DB
    // BetterAuth stores the GitHub token in the 'account' table
    const result = db
      .prepare(
        "SELECT accessToken FROM account WHERE userId = ? AND providerId = 'github' LIMIT 1"
      )
      .get(session.user.id) as { accessToken: string } | undefined;

    if (!result || !result.accessToken) {
      return NextResponse.json(
        { error: "No GitHub connection found" },
        { status: 400 }
      );
    }

    // 3. Provision the vault
    const provisionResult = await provisionVaultIfMissing(result.accessToken);

    return NextResponse.json(provisionResult);
  } catch (error: any) {
    console.error("Vault Provisioning API Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message },
      { status: 500 }
    );
  }
}
