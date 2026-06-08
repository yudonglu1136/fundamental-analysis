const DEFAULT_API_BASE_URL = "http://127.0.0.1:8787";

let apiAccessToken = null;

function apiBaseUrl() {
  return (import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL).trim().replace(/\/+$/, "");
}

export function setApiAccessToken(token) {
  apiAccessToken = token || null;
}

export function apiUrl(path) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${apiBaseUrl()}${normalizedPath}`;
}

export async function apiFetch(path, init = {}) {
  const headers = new Headers(init.headers);
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
    throw new Error(detail ? `${detail} (${response.status})` : `API ${response.status}`);
  }
  return response.json();
}
