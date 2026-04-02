import { betterAuth } from "better-auth";
import { Database } from "bun:sqlite";

export const auth = betterAuth({
    database: new Database("auth.db"),
    socialProviders: {
        github: {
            clientId: process.env.GITHUB_CLIENT_ID as string,
            clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
            scope: ["repo"],
        }
    }
});
