import { getApiBaseUrl } from "@/lib/api-base";
import { ApiUnreachableError } from "@/lib/api-network";
import { signFreighterTransaction } from "@/lib/freighter-wallet";
import type { Networks } from "@stellar/stellar-sdk";

/**
 * Issue #324: central API client and SEP-10 session.
 *
 * The client owns the single store of wallet-scoped JWTs and the one SEP-10
 * challenge -> sign -> verify flow. Older ad-hoc tokens (quid_creator_auth,
 * quid_hunter_auth_*) are retired in favour of `quid_api_session_<address>`.
 */

export const API_SESSION_KEY_PREFIX = "quid_api_session_";

export interface ApiSession {
  address: string;
  accessToken: string;
}

export interface ChallengeResponse {
  transaction: string;
  networkPassphrase: Networks;
}

export interface VerifyResponse {
  access_token: string;
}

/** Thrown when the backend answers 401: the stored JWT is gone/expired. */
export class ApiSessionExpiredError extends Error {
  constructor() {
    super("Your API session expired. Please reconnect your wallet.");
    this.name = "ApiSessionExpiredError";
  }
}

type SessionListener = (address: string, session: ApiSession | null) => void;
const sessionListeners = new Set<SessionListener>();

/** Subscribe to session changes (used by WalletProvider to mirror state). */
export function onSessionChanged(
  listener: SessionListener,
): () => void {
  sessionListeners.add(listener);
  return () => sessionListeners.delete(listener);
}

function notifySessionChanged(address: string, session: ApiSession | null): void {
  sessionListeners.forEach((listener) => listener(address, session));
}

function sessionKey(address: string): string {
  return `${API_SESSION_KEY_PREFIX}${address}`;
}

function getApiUrl(path: string): string {
  const base = getApiBaseUrl();
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export function getStoredSession(address: string): ApiSession | null {
  if (typeof window === "undefined") return null;

  try {
    const stored = localStorage.getItem(sessionKey(address));
    if (!stored) return null;

    const parsed = JSON.parse(stored) as Partial<ApiSession>;
    if (parsed.address !== address || !parsed.accessToken) {
      localStorage.removeItem(sessionKey(address));
      return null;
    }

    return parsed as ApiSession;
  } catch {
    localStorage.removeItem(sessionKey(address));
    return null;
  }
}

export function setStoredSession(session: ApiSession): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(sessionKey(session.address), JSON.stringify(session));
    notifySessionChanged(session.address, session);
  } catch {
    // localStorage full/blocked - fail the session write silently so callers
    // still get the in-memory token back from authenticate().
  }
}

export function clearStoredSession(address: string): void {
  if (typeof window === "undefined") return;

  localStorage.removeItem(sessionKey(address));
  notifySessionChanged(address, null);
}

/** Issue #331: whether a SEP-10 session exists for this address already. */
export function hasApiSession(address: string): boolean {
  return getStoredSession(address) !== null;
}

/**
 * Runs challenge -> Freighter sign -> verify and stores the resulting JWT.
 * The only place a wallet signature prompt should fire for API auth.
 */
export async function authenticate(address: string): Promise<ApiSession> {
  const base = getApiBaseUrl();

  const challengeResponse = await fetch(
    `${base}/auth/challenge?address=${encodeURIComponent(address)}`,
  );
  if (
    challengeResponse.status === 404 ||
    challengeResponse.status === 502 ||
    challengeResponse.status === 503
  ) {
    throw new ApiUnreachableError(
      "Backend API not found. Start the backend or unset NEXT_PUBLIC_API_URL.",
    );
  }
  if (!challengeResponse.ok) {
    throw new Error("Unable to start wallet authentication");
  }

  const challenge = (await challengeResponse.json()) as ChallengeResponse;
  const signedXdr = await signFreighterTransaction(
    challenge.transaction,
    address,
    challenge.networkPassphrase,
  );

  const verifyResponse = await fetch(`${base}/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signedXdr }),
  });
  if (!verifyResponse.ok) {
    throw new Error("Wallet authentication failed");
  }

  const verified = (await verifyResponse.json()) as VerifyResponse;
  if (!verified.access_token) {
    throw new Error("Authentication response did not include an access token");
  }

  const session = { address, accessToken: verified.access_token };
  setStoredSession(session);
  return session;
}

/** Returns the stored session or authenticates (and stores) a fresh one. */
export async function getSession(address: string): Promise<ApiSession> {
  return getStoredSession(address) ?? authenticate(address);
}

/**
 * The one authenticated request helper. Attaches `Authorization: Bearer` from
 * the stored session; on a 401 it clears the session and notifies listeners
 * (it never silently re-prompts with a fresh Freighter signature).
 */
export async function apiFetch(
  path: string,
  { address, init }: { address: string; init?: RequestInit },
): Promise<Response> {
  const session = getStoredSession(address);
  const headers = new Headers(init?.headers);
  if (session?.accessToken) {
    headers.set("Authorization", `Bearer ${session.accessToken}`);
  }

  const response = await fetch(getApiUrl(path), { ...init, headers });

  if (response.status === 401) {
    clearStoredSession(address);
    throw new ApiSessionExpiredError();
  }

  return response;
}