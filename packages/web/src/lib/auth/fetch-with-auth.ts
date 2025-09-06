"use client";

import { clearToken, getToken } from "@/lib/auth/token-manager";
import { ensureAuthenticated } from "@/lib/auth/auth-client";

type FetchOptions = {
  retryOn401?: boolean;
};

type NextFetchInit = RequestInit & { next?: unknown };

export async function fetchWithAuth(
  input: RequestInfo | URL,
  init: NextFetchInit = {},
  options: FetchOptions = { retryOn401: true }
): Promise<Response> {
  const token = getToken();
  const headers = new Headers(init.headers || {});
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  let response = await fetch(input, { ...init, headers });
  if (response.status !== 401 || options.retryOn401 === false) {
    return response;
  }

  // 401: clear token and try to re-authenticate once
  clearToken();
  const ok = await ensureAuthenticated();
  if (!ok) return response; // give original 401 back

  const newToken = getToken();
  const retryHeaders = new Headers(init.headers || {});
  if (newToken) {
    retryHeaders.set("Authorization", `Bearer ${newToken}`);
  }
  response = await fetch(input, { ...init, headers: retryHeaders });
  return response;
}
