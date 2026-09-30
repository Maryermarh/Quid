import { getApiBaseUrl } from "@/lib/api-base";
import {
  ApiSessionExpiredError,
  authenticate,
  clearStoredSession,
  getStoredSession,
} from "@/lib/api/client";

export interface FeedbackPayload {
  missionId: string | number;
  hunterAddress: string;
  feedbackText: string;
  proofUrl?: string;
  sentiment?: number;
  metadata?: Record<string, unknown>;
}

export interface UploadResponse {
  cid: string;
  filename?: string;
  size?: number;
  [key: string]: unknown;
}

export const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export const ALLOWED_UPLOAD_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "video/mp4",
  "application/pdf",
];

/** Issue #324: SEP-10 session lives in lib/api/client.ts. */
export async function authenticateHunter(address: string): Promise<string> {
  const session = await authenticate(address);
  return session.accessToken;
}

export class FileValidationError extends Error {}

function validateFile(file: File): void {
  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    throw new FileValidationError(
      `"${file.name}" is ${(file.size / (1024 * 1024)).toFixed(1)}MB, which exceeds the ${
        MAX_UPLOAD_SIZE_BYTES / (1024 * 1024)
      }MB limit.`,
    );
  }
  if (!ALLOWED_UPLOAD_MIME_TYPES.includes(file.type)) {
    throw new FileValidationError(
      `"${file.name}" has an unsupported file type (${file.type || "unknown"}). Allowed: images, video/mp4, or PDF.`,
    );
  }
}

/**
 * Uploads a proof file (image/video/pdf) as multipart/form-data to the backend
 * IPFS endpoint, reporting progress, and returns the pinned CID.
 * Validates size/type client-side before attempting the network request.
 */
export function uploadFileToIpfs(
  file: File,
  hunterAddress: string,
  onProgress?: (percent: number) => void,
): Promise<{ cid: string; data: UploadResponse }> {
  validateFile(file);

  return new Promise((resolve, reject) => {
    const send = async () => {
      let token = getStoredSession(hunterAddress)?.accessToken;
      if (!token) {
        try {
          token = await authenticateHunter(hunterAddress);
        } catch (authErr) {
          const msg = authErr instanceof Error ? authErr.message : "Authentication failed";
          reject(new Error(`IPFS Upload Failed: ${msg}`));
          return;
        }
      }

      const attempt = (authToken: string) => {
        const formData = new FormData();
        formData.append("file", file);

        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${getApiBaseUrl()}/upload`);
        xhr.setRequestHeader("Authorization", `Bearer ${authToken}`);

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable && onProgress) {
            onProgress(Math.round((event.loaded / event.total) * 100));
          }
        };

        xhr.onload = async () => {
          if (xhr.status === 401) {
            // Issue #324: an expired token clears the session; we do not
            // silently re-open the Freighter signature prompt mid-upload.
            clearStoredSession(hunterAddress);
            reject(
              new ApiSessionExpiredError(),
            );
            return;
          }

          if (xhr.status < 200 || xhr.status >= 300) {
            reject(
              new Error(
                `IPFS Upload Failed: backend responded with status ${xhr.status}: ${
                  xhr.responseText || xhr.statusText
                }`,
              ),
            );
            return;
          }

          try {
            const data = JSON.parse(xhr.responseText) as UploadResponse;
            if (!data.cid) {
              reject(new Error("IPFS Upload Failed: response did not include a CID"));
              return;
            }
            resolve({ cid: data.cid, data });
          } catch {
            reject(new Error("IPFS Upload Failed: could not parse backend response"));
          }
        };

        xhr.onerror = () => {
          reject(new Error("IPFS Upload Failed: network error while uploading file"));
        };

        xhr.send(formData);
      };

      attempt(token);
    };

    send();
  });
}

/**
 * Uploads structured feedback JSON to backend IPFS endpoint and returns the CID.
 * Fails loudly so caller can prevent on-chain transaction if upload fails.
 */
export async function uploadFeedbackToIpfs(
  payload: FeedbackPayload,
): Promise<{ cid: string; data: UploadResponse }> {
  try {
    const apiBase = getApiBaseUrl();

    const doUpload = async (authToken?: string) => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (authToken) {
        headers["Authorization"] = `Bearer ${authToken}`;
      }

      return fetch(`${apiBase}/upload/json`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          ...payload,
          timestamp: new Date().toISOString(),
        }),
      });
    };

    const token = getStoredSession(payload.hunterAddress)?.accessToken;
    const response = await doUpload(token);

    // Issue #324: a stale token clears the session; no silent re-prompt.
    if (response.status === 401) {
      clearStoredSession(payload.hunterAddress);
      throw new ApiSessionExpiredError();
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        `Backend IPFS upload failed with status ${response.status}: ${errorText || response.statusText}`,
      );
    }

    const data = (await response.json()) as UploadResponse;

    if (!data.cid) {
      throw new Error("Upload response did not return a valid IPFS CID");
    }

    return { cid: data.cid, data };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown IPFS upload error";
    console.error("IPFS Upload Error:", error);
    throw new Error(`IPFS Upload Failed: ${msg}. On-chain submission aborted.`);
  }
}
