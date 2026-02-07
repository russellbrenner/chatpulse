/**
 * API client for the ChatPulse web service.
 *
 * All functions target /api/* endpoints on the same origin (proxied to
 * Fastify in dev via Vite, served directly in production).
 */

const API_BASE = '/api';

/** Standard error shape returned by the server. */
interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Perform a fetch request to the API and return parsed JSON.
 * Throws an Error with the server's message on non-2xx responses.
 */
async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    let message = `Request failed: ${response.status} ${response.statusText}`;
    try {
      const body = (await response.json()) as ApiError;
      if (body.error?.message) {
        message = body.error.message;
      }
    } catch {
      // Response wasn't JSON — use the default message
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

/**
 * Build a query string from a params object.
 * Omits undefined and null values.
 */
function buildQuery(params?: Record<string, string | number | undefined | null>): string {
  if (!params) return '';
  const entries = Object.entries(params).filter(
    (pair): pair is [string, string | number] => pair[1] != null,
  );
  if (entries.length === 0) return '';
  const searchParams = new URLSearchParams(
    entries.map(([k, v]) => [k, String(v)]),
  );
  return `?${searchParams.toString()}`;
}

// --- Analysis endpoints ---

/**
 * Fetch analysis data from a specific endpoint.
 *
 * Valid endpoints: message-counts, timeline, top-contacts,
 * response-times, heatmap, reactions.
 */
export async function fetchAnalysis<T = unknown>(
  endpoint: string,
  params?: Record<string, string | number | undefined>,
): Promise<T> {
  return apiFetch<T>(`/analysis/${endpoint}${buildQuery(params)}`);
}

// --- Upload endpoint ---

/** Upload a chat.db file and return the server's response. */
export async function uploadDatabase(
  file: File,
): Promise<{ path: string; size: number; messageCount: number }> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    let message = `Upload failed: ${response.status}`;
    try {
      const body = (await response.json()) as ApiError;
      if (body.error?.message) {
        message = body.error.message;
      }
    } catch {
      // Non-JSON error response
    }
    throw new Error(message);
  }

  return response.json() as Promise<{ path: string; size: number; messageCount: number }>;
}

// --- Message/contact/chat endpoints ---

/** Fetch messages with optional query parameters (limit, offset, chat_id, etc.). */
export async function fetchMessages<T = unknown>(
  params?: Record<string, string | number | undefined>,
): Promise<T> {
  return apiFetch<T>(`/messages${buildQuery(params)}`);
}

/** Fetch all contacts/handles. */
export async function fetchContacts<T = unknown>(
  params?: Record<string, string | number | undefined>,
): Promise<T> {
  return apiFetch<T>(`/contacts${buildQuery(params)}`);
}

/** Fetch all chat threads. */
export async function fetchChats<T = unknown>(
  params?: Record<string, string | number | undefined>,
): Promise<T> {
  return apiFetch<T>(`/chats${buildQuery(params)}`);
}

/** Fetch messages for a specific chat thread. */
export async function fetchChatMessages<T = unknown>(
  chatId: number | string,
  params?: Record<string, string | number | undefined>,
): Promise<T> {
  return apiFetch<T>(`/chats/${chatId}/messages${buildQuery(params)}`);
}
