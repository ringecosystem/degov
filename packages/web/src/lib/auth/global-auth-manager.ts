/**
 * Global authentication manager to prevent multiple simultaneous authentication flows
 */

import type { AuthResult } from "@/hooks/useSiweAuth";

class GlobalAuthManager {
  private static instance: GlobalAuthManager;
  private currentAuthPromise: Promise<AuthResult> | null = null;
  private isAuthenticating = false;

  static getInstance(): GlobalAuthManager {
    if (!GlobalAuthManager.instance) {
      GlobalAuthManager.instance = new GlobalAuthManager();
    }
    return GlobalAuthManager.instance;
  }

  /**
   * Execute authentication with global deduplication
   * If authentication is already in progress, return the existing promise
   * Otherwise, start a new authentication flow
   */
  async authenticate(
    authenticateFunction: () => Promise<AuthResult>
  ): Promise<AuthResult> {
    // If authentication is already in progress, return the existing promise
    if (this.currentAuthPromise) {
      console.log("Authentication already in progress, waiting for result...");
      return await this.currentAuthPromise;
    }

    // Start new authentication
    this.isAuthenticating = true;
    this.currentAuthPromise = this.executeAuthentication(authenticateFunction);

    try {
      const result = await this.currentAuthPromise;
      return result;
    } finally {
      // Clean up after authentication completes (success or failure)
      this.isAuthenticating = false;
      this.currentAuthPromise = null;
    }
  }

  private async executeAuthentication(
    authenticateFunction: () => Promise<AuthResult>
  ): Promise<AuthResult> {
    try {
      console.log("Starting global authentication flow...");
      const result = await authenticateFunction();
      console.log(
        "Global authentication flow completed:",
        result.success ? "success" : "failed"
      );
      return result;
    } catch (error) {
      console.error("Global authentication flow error:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Check if authentication is currently in progress
   */
  getIsAuthenticating(): boolean {
    return this.isAuthenticating;
  }

  /**
   * Reset the authentication state (useful for cleanup)
   */
  reset(): void {
    this.isAuthenticating = false;
    this.currentAuthPromise = null;
  }
}

export const globalAuthManager = GlobalAuthManager.getInstance();
