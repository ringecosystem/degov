"use client";

import { getToken } from "@/lib/auth/token-manager";

export type AuthResult = { success: boolean; token?: string; error?: string };
type Authenticator = () => Promise<AuthResult>;

let authenticator: Authenticator | null = null;
let reauthPromise: Promise<boolean> | null = null;

export function registerAuthenticator(fn: Authenticator) {
  authenticator = fn;
}

export function clearAuthenticator() {
  authenticator = null;
}

export async function ensureAuthenticated(): Promise<boolean> {
  // If token already exists, assume authenticated and skip.
  if (getToken()) return true;
  if (!authenticator) return false;

  if (reauthPromise) return reauthPromise;

  reauthPromise = (async () => {
    try {
      const result = await authenticator!();
      return !!(result && result.success);
    } catch {
      return false;
    } finally {
      reauthPromise = null;
    }
  })();

  return reauthPromise;
}

