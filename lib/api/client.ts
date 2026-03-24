const API_BASE_URL = "/api/v1";

interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
}

function buildQueryString(
  params: Record<string, string | number | boolean | undefined>,
): string {
  const entries = Object.entries(params).filter(
    (kv): kv is [string, string | number | boolean] => kv[1] !== undefined,
  );
  if (entries.length === 0) return "";
  return (
    "?" +
    new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()
  );
}

function getSessionToken(): string {
  try {
    return (
      localStorage.getItem("session_token") ||
      localStorage.getItem("access_token") ||
      ""
    );
  } catch {
    return "";
  }
}

async function request<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
  options?: RequestOptions,
): Promise<T> {
  const { params, headers, ...init } = options ?? {};
  const qs = params ? buildQueryString(params) : "";
  const token = getSessionToken();
  const finalHeaders: HeadersInit = {
    ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    ...(headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const response = await fetch(`${API_BASE_URL}${path}${qs}`, {
    ...init,
    method,
    headers: finalHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed (${response.status})`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const apiClient = {
  async get<T>(path: string, options?: RequestOptions): Promise<{ data: T }> {
    const data = await request<T>("GET", path, undefined, options);
    return { data };
  },

  async post<T>(
    path: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<{ data: T }> {
    const data = await request<T>("POST", path, body, options);
    return { data };
  },

  async put<T>(
    path: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<{ data: T }> {
    const data = await request<T>("PUT", path, body, options);
    return { data };
  },

  async delete<T>(
    path: string,
    options?: RequestOptions,
  ): Promise<{ data: T }> {
    const data = await request<T>("DELETE", path, undefined, options);
    return { data };
  },
};

export default apiClient;
