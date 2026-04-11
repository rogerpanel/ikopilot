/**
 * API client for iKopilot backend.
 */

const API_BASE = import.meta.env.VITE_API_URL || "";

function getToken(): string | null {
  return localStorage.getItem("ikopilot_token");
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiFetch<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...options.headers,
    },
  });

  if (res.status === 401) {
    localStorage.removeItem("ikopilot_token");
    localStorage.removeItem("ikopilot_user");
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail || `API error ${res.status}`);
  }

  return res.json();
}

export async function apiPost<T = any>(path: string, data: any): Promise<T> {
  return apiFetch<T>(path, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function apiPut<T = any>(path: string, data: any): Promise<T> {
  return apiFetch<T>(path, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function apiDelete<T = any>(path: string): Promise<T> {
  return apiFetch<T>(path, { method: "DELETE" });
}

/**
 * Stream chat completions via SSE.
 */
export async function streamChat(
  data: {
    provider: string;
    messages: { role: string; content: string }[];
    conversation_id?: number | null;
    project_id?: number | null;
    research_mode?: string | null;
    response_format?: string | null;
    stream?: boolean;
  },
  onChunk: (text: string) => void,
  onDone: (info: { tokens_input: number; tokens_output: number }) => void,
  onError: (error: string) => void
): Promise<void> {
  const token = getToken();
  const res = await fetch(`${API_BASE}/api/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ ...data, stream: true }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    onError(body.detail || `Error ${res.status}`);
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) {
    onError("No response body");
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (!raw) continue;

      try {
        const event = JSON.parse(raw);
        if (event.error) {
          onError(event.error);
          return;
        }
        if (event.content) {
          onChunk(event.content);
        }
        if (event.done) {
          onDone({
            tokens_input: event.tokens_input || 0,
            tokens_output: event.tokens_output || 0,
          });
          return;
        }
      } catch {
        // Skip malformed lines
      }
    }
  }
}
