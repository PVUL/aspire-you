/**
 * Dev-only fetch interceptor.
 * Patches window.fetch to record all API requests/responses.
 * Only active in development. Tree-shaken in production.
 */

export interface ApiCall {
  id: string;
  method: string;
  url: string;
  requestHeaders: Record<string, string>;
  requestBody?: string;
  status?: number;
  statusText?: string;
  responseHeaders?: Record<string, string>;
  responseBody?: string;
  duration?: number;
  startedAt: number;
  completedAt?: number;
  error?: string;
}

type Listener = (calls: ApiCall[]) => void;

class FetchInterceptor {
  private calls: ApiCall[] = [];
  private listeners: Set<Listener> = new Set();
  private original: typeof fetch | null = null;
  private installed = false;

  install() {
    if (this.installed || typeof window === "undefined") return;
    this.installed = true;
    this.original = window.fetch.bind(window);

    const self = this;
    window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      const id = Math.random().toString(36).slice(2, 9);
      const startedAt = Date.now();

      const method = (init?.method ?? (typeof input === "object" && "method" in input ? (input as Request).method : "GET")).toUpperCase();
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;

      // Capture request headers
      const requestHeaders: Record<string, string> = {};
      try {
        let h: Headers | undefined;
        if (init?.headers) {
          h = new Headers(init.headers);
        } else if (typeof input === "object" && "headers" in input) {
          h = (input as Request).headers;
        }
        h?.forEach((v, k) => { requestHeaders[k] = v; });
      } catch {}

      // Capture request body
      let requestBody: string | undefined;
      try {
        if (init?.body) {
          requestBody = typeof init.body === "string" ? init.body : JSON.stringify(init.body);
        }
      } catch {}

      const call: ApiCall = { id, method, url, requestHeaders, requestBody, startedAt };
      self.calls.unshift(call);
      if (self.calls.length > 100) self.calls.pop();
      self.notify();

      try {
        const response = await self.original!(input, init);
        const clone = response.clone();

        const completedAt = Date.now();
        const duration = completedAt - startedAt;

        const responseHeaders: Record<string, string> = {};
        clone.headers.forEach((v, k) => { responseHeaders[k] = v; });

        let responseBody: string | undefined;
        try {
          const contentType = responseHeaders["content-type"] ?? "";
          if (contentType.includes("json")) {
            const json = await clone.json();
            responseBody = JSON.stringify(json, null, 2);
          } else if (contentType.includes("text")) {
            responseBody = await clone.text();
          } else {
            responseBody = `[Binary: ${responseHeaders["content-length"] ?? "??"} bytes]`;
          }
        } catch {}

        const idx = self.calls.findIndex((c) => c.id === id);
        if (idx !== -1) {
          self.calls[idx] = {
            ...self.calls[idx],
            status: response.status,
            statusText: response.statusText,
            responseHeaders,
            responseBody,
            duration,
            completedAt,
          };
          self.notify();
        }

        return response;
      } catch (err: any) {
        const idx = self.calls.findIndex((c) => c.id === id);
        if (idx !== -1) {
          self.calls[idx] = {
            ...self.calls[idx],
            error: err?.message ?? "Network error",
            completedAt: Date.now(),
            duration: Date.now() - startedAt,
          };
          self.notify();
        }
        throw err;
      }
    };
  }

  uninstall() {
    if (!this.installed || !this.original || typeof window === "undefined") return;
    window.fetch = this.original;
    this.installed = false;
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    fn(this.calls);
    return () => this.listeners.delete(fn);
  }

  clear() {
    this.calls = [];
    this.notify();
  }

  private notify() {
    const snapshot = [...this.calls];
    this.listeners.forEach((fn) => fn(snapshot));
  }
}

export const fetchInterceptor = new FetchInterceptor();
if (typeof window !== "undefined" && import.meta.env.DEV) {
  fetchInterceptor.install();
}
