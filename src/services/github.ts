import { Octokit } from "@octokit/rest";

const VAULT_REPO_NAME = "aspire-vault";

export async function provisionVaultIfMissing(accessToken: string) {
  const octokit = new Octokit({ auth: accessToken });

  // 1. Get the authenticated user
  const { data: user } = await octokit.rest.users.getAuthenticated();
  const username = user.login;

  try {
    // 2. Check if the vault repo exists
    await octokit.rest.repos.get({
      owner: username,
      repo: VAULT_REPO_NAME,
    });
    console.log(`Vault already exists for ${username}`);
    return { success: true, message: "Vault exists", repo: VAULT_REPO_NAME };
  } catch (error: any) {
    if (error.status === 404) {
      // 3. Repo doesn't exist, create it
      console.log(`Vault not found for ${username}. Creating ${VAULT_REPO_NAME}...`);
      
      const { data: newRepo } = await octokit.rest.repos.createForAuthenticatedUser({
        name: VAULT_REPO_NAME,
        private: true,
        description: "My Aspire You Journal Vault. Managed locally via CRDT.",
        auto_init: true, // creates an initial commit with a README
      });

      console.log(`Vault created successfully: ${newRepo.html_url}`);

      // 4. Optionally, we can inject a .aspire config or base Yjs document here.
      // For now, the README is sufficient to establish the branch.
      return { success: true, message: "Vault created", repo: VAULT_REPO_NAME };
    }
    
    console.error("Failed to check/create vault:", error);
    throw error;
  }
}
