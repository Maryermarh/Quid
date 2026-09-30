import {
  ApiSessionExpiredError,
  apiFetch,
  getSession,
  hasApiSession,
  getStoredSession,
  clearStoredSession,
} from "@/lib/api/client";

/**
 * Issue #324: creator-facing API helper. The SEP-10 flow, token store and
 * 401 handling now live in src/lib/api/client.ts; this module is a thin
 * compatibility layer keeping the existing caller surface:
 *   - isApiConfigured() / hasApiSession() (used by user-api and onboarding)
 *   - creatorApiFetch(path, address, init) with lazy registration for the
 *     first authenticated call.
 */

export { hasApiSession };
export { ApiSessionExpiredError };

export function isApiConfigured(): boolean {
  // Explicit localhost URL pointing at a dead port should still allow fallback.
  if (process.env.NEXT_PUBLIC_API_URL) return true;
  if (typeof window !== "undefined") return true;
  return false;
}

export async function creatorApiFetch(
  path: string,
  address: string,
  init: RequestInit = {},
): Promise<Response> {
  // Lazy registration: the first authenticated call silently signs in so
  // callers do not have to think about the wallet challenge.
  if (!getStoredSession(address)) {
    await getSession(address);
  }

  return apiFetch(path, { address, init });
}

/** Issue #331: drop the token for a wallet without a full disconnect. */
export function clearApiSession(address: string): void {
  clearStoredSession(address);
}