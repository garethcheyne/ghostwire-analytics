/**
 * Browser-side client for the app's own /api routes. Same origin, so the Better Auth session
 * cookie is sent automatically (Umami kept a bearer token in localStorage instead).
 */

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

type Params = Record<string, string | number | boolean | null | undefined>;

// Set on public share pages: requests authenticate with the share's token instead of a session.
let shareToken: string | null = null;

export function setShareToken(token: string | null) {
  shareToken = token;
}

function toQueryString(params?: Params) {
  if (!params) return '';

  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  }

  const query = search.toString();

  return query ? `?${query}` : '';
}

async function request<T>(
  method: string,
  path: string,
  params?: Params,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api${path}${toQueryString(params)}`, {
    method,
    headers: {
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
      ...(shareToken && {
        'x-ghostwire-share-token': shareToken,
        'x-ghostwire-share-context': '1',
      }),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const error = data?.error ?? {};
    throw new ApiError(error.message || response.statusText, response.status, error.code);
  }

  return data as T;
}

export const api = {
  get: <T>(path: string, params?: Params) => request<T>('GET', path, params),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, undefined, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, undefined, body ?? {}),
  del: <T>(path: string) => request<T>('DELETE', path),
};

export interface PageResult<T> {
  data: T[];
  count: number;
  page: number;
  pageSize: number;
  orderBy?: string;
  search?: string;
}
