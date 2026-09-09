// Offline fetch stub for HTTP API tests. Never opens sockets: every
// response comes from the in-memory route table keyed by URL path, and the
// default global fetch is never touched (tests stub it to throw).

export interface RecordedRoute {
  readonly status: number;
  readonly body: unknown;
}

export interface RecordedCall {
  readonly url: string;
  readonly method: string;
  readonly headers: Record<string, string>;
}

export interface RecordedFetch {
  readonly calls: RecordedCall[];
  readonly fetchImpl: (input: string | URL, init?: RequestInit) => Promise<Response>;
}

function normalizeHeaders(init?: RequestInit): Record<string, string> {
  const raw = init?.headers;
  if (!raw) return {};
  if (raw instanceof Headers) {
    const out: Record<string, string> = {};
    raw.forEach((value, key) => {
      out[key.toLowerCase()] = value;
    });
    return out;
  }
  if (Array.isArray(raw)) {
    const out: Record<string, string> = {};
    for (const [key, value] of raw) out[String(key).toLowerCase()] = String(value);
    return out;
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) out[key.toLowerCase()] = String(value);
  return out;
}

export function createRecordedFetch(routes: Record<string, RecordedRoute>): RecordedFetch {
  const calls: RecordedCall[] = [];
  const fetchImpl = async (input: string | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    calls.push({
      headers: normalizeHeaders(init),
      method: (init?.method ?? "GET").toUpperCase(),
      url
    });
    const path = url.replace(/^https?:\/\/[^/]+/, "").split("?")[0];
    const route = routes[path ?? url] ?? routes[url];
    if (!route) {
      return Response.json(
        { error: { code: "not-found", message: `No recorded route for ${path}.` }, ok: false },
        { status: 404 }
      );
    }
    return Response.json(route.body, { status: route.status });
  };
  return { calls, fetchImpl };
}
