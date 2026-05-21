const DEFAULT_API_BASE_URL = "http://127.0.0.1:8787";

let apiAccessToken: string | null = null;
let authenticatedFetchInstalled = false;
let originalFetch: typeof window.fetch | null = null;
let unauthorizedHandler: (() => void) | null = null;

function apiBaseUrl() {
  const configured = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  return configured || DEFAULT_API_BASE_URL;
}

function apiUrl(path: string) {
  const base = apiBaseUrl().replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

function requestUrl(input: RequestInfo | URL) {
  const raw = typeof input === "string" || input instanceof URL ? String(input) : input.url;
  return new URL(raw, window.location.origin);
}

function isApiRequest(input: RequestInfo | URL) {
  const url = requestUrl(input);
  const apiBase = new URL(apiBaseUrl(), window.location.origin);
  return url.origin === apiBase.origin && url.pathname.startsWith("/api/");
}

function withAuthorization(input: RequestInfo | URL, init: RequestInit | undefined, token: string) {
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  if (!headers.has("authorization")) headers.set("authorization", `Bearer ${token}`);
  if (input instanceof Request) {
    return { input: new Request(input, { headers }), init };
  }
  return { input, init: { ...init, headers } };
}

export function setApiAccessToken(token: string | null) {
  apiAccessToken = token;
}

export function installAuthenticatedFetch(onUnauthorized: () => void) {
  unauthorizedHandler = onUnauthorized;
  if (authenticatedFetchInstalled || typeof window === "undefined") return;
  originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const shouldAttachToken = isApiRequest(input) && Boolean(apiAccessToken);
    const request = shouldAttachToken && apiAccessToken ? withAuthorization(input, init, apiAccessToken) : { input, init };
    const response = await originalFetch!(request.input, request.init);
    if (response.status === 401 && isApiRequest(input)) {
      unauthorizedHandler?.();
    }
    return response;
  };
  authenticatedFetchInstalled = true;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (apiAccessToken && !headers.has("authorization")) {
    headers.set("authorization", `Bearer ${apiAccessToken}`);
  }
  const response = await fetch(apiUrl(path), { ...init, headers });
  if (!response.ok) {
    let detail = "";
    try {
      const payload = await response.clone().json();
      detail = payload?.message || payload?.error || "";
    } catch {
      detail = await response.text().catch(() => "");
    }
    throw new Error(detail ? `${detail} (${response.status})` : `API returned ${response.status} for ${path}`);
  }
  return (await response.json()) as T;
}
