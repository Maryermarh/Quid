import {
  creatorApiFetch,
  hasApiSession,
  isApiConfigured,
  ApiSessionExpiredError,
} from '@/lib/creator-api';
import { isApiUnreachableError } from '@/lib/api-network';
import {
  fromServerRole,
  saveUserRole,
  toServerRole,
  type UserRole,
} from '@/lib/onboarding';

interface ServerUser {
  id: string;
  address: string;
  role: string;
}

/**
 * Issue #331: the role the backend holds for this wallet, or null when there is
 * nothing to read - no API configured, no SEP-10 session yet, or a user the API
 * does not know. Callers fall back to the local role in that case rather than
 * blocking the dashboard.
 *
 * Deliberately does *not* authenticate: reading a role is not worth a wallet
 * signature prompt on every dashboard mount.
 */
export async function fetchServerUserRole(
  address: string,
): Promise<UserRole | null> {
  if (!isApiConfigured() || !hasApiSession(address)) return null;

  try {
    const response = await creatorApiFetch('/users/me', address);
    if (!response.ok) return null;

    const user = (await response.json()) as ServerUser;
    return fromServerRole(user.role);
  } catch (error) {
    // Issue #324: an expired token now clears the session instead of silently
    // re-signing. Without a session there is no server role to read.
    if (error instanceof ApiSessionExpiredError) {
      console.warn('[Quid] API session expired while reading the user role.');
      return null;
    }
    throw error;
  }
}

/**
 * Issue #331: persist the onboarding choice server-side, and mirror it into
 * localStorage so the next paint does not have to wait on the network.
 *
 * Authenticates if needed - this runs straight after the wallet connects, which
 * is exactly when a SEP-10 signature is expected. Returns false when there is
 * no API to talk to, so onboarding still completes locally in a frontend-only
 * setup; a reachable API that refuses the write throws instead of pretending.
 */
export async function persistUserRole(
  address: string,
  role: UserRole,
): Promise<boolean> {
  if (!isApiConfigured()) {
    saveUserRole(role);
    return false;
  }

  try {
    const response = await creatorApiFetch('/users/me/role', address, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: toServerRole(role) }),
    });

    if (!response.ok) {
      throw new Error('Could not save your account type. Please try again.');
    }

    saveUserRole(role);
    return true;
  } catch (error) {
    if (isApiUnreachableError(error)) {
      console.warn(
        '[Quid] API unreachable — saving account type locally. Start the backend (npm run start:dev in backend/) or unset NEXT_PUBLIC_API_URL for frontend-only mode.',
        error,
      );
      saveUserRole(role);
      return false;
    }

    if (error instanceof ApiSessionExpiredError) {
      console.warn(
        '[Quid] API session expired while saving the account type — saved locally.',
        error,
      );
      saveUserRole(role);
      return false;
    }

    throw error;
  }
}
