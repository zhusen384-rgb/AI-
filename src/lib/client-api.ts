"use client";

export class ClientApiError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ClientApiError";
    this.status = status;
    this.details = details;
  }
}

type JsonCacheEntry = {
  value: unknown;
  expiresAt: number;
};

const jsonResponseCache = new Map<string, JsonCacheEntry>();
const inflightJsonRequests = new Map<string, Promise<unknown>>();
const DEFAULT_JSON_CACHE_TTL_MS = 15_000;

function getStoredAuthToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem("auth_token");
}

export function createClientHeaders(headers?: HeadersInit): Headers {
  const finalHeaders = new Headers(headers);
  const token = getStoredAuthToken();

  if (token && !finalHeaders.has("Authorization")) {
    finalHeaders.set("Authorization", `Bearer ${token}`);
  }

  return finalHeaders;
}

function cloneJsonValue<T>(value: T): T {
  if (value === null || value === undefined || typeof value !== "object") {
    return value;
  }

  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch {
      // 回退到 JSON 方式复制
    }
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

function buildRequestCacheKey(input: RequestInfo | URL, init: RequestInit): string {
  const method = (init.method || "GET").toUpperCase();
  const token = getStoredAuthToken() || "";
  const url = typeof input === "string" ? input : input.toString();
  const body = typeof init.body === "string" ? init.body : "";

  return [method, url, token, body].join("::");
}

export function clearClientApiCache() {
  jsonResponseCache.clear();
  inflightJsonRequests.clear();
}

export function fetchClient(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  return fetch(input, {
    ...init,
    credentials: init.credentials ?? "include",
    headers: createClientHeaders(init.headers),
  });
}

export async function fetchClientJson<T>(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<T> {
  const response = await fetchClient(input, init);

  const data = await response.json();

  if (!response.ok) {
    const message =
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      typeof data.error === "string"
        ? data.error
        : `请求失败: HTTP ${response.status}`;

    throw new ClientApiError(message, response.status, data);
  }

  return data as T;
}

export async function fetchClientJsonCached<T>(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: {
    forceRefresh?: boolean;
    ttlMs?: number;
  } = {}
): Promise<T> {
  const method = (init.method || "GET").toUpperCase();
  if (method !== "GET") {
    return fetchClientJson<T>(input, init);
  }

  const cacheKey = buildRequestCacheKey(input, init);
  const ttlMs = options.ttlMs ?? DEFAULT_JSON_CACHE_TTL_MS;

  if (!options.forceRefresh) {
    const cached = jsonResponseCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cloneJsonValue(cached.value) as T;
    }

    const inflight = inflightJsonRequests.get(cacheKey);
    if (inflight) {
      return inflight as Promise<T>;
    }
  } else {
    jsonResponseCache.delete(cacheKey);
    inflightJsonRequests.delete(cacheKey);
  }

  const requestPromise = fetchClientJson<T>(input, init).then((value) => {
    const cachedValue = cloneJsonValue(value);
    const shouldCache =
      !(cachedValue && typeof cachedValue === "object" && "success" in cachedValue && (cachedValue as { success?: unknown }).success === false);

    if (shouldCache) {
      jsonResponseCache.set(cacheKey, {
        value: cachedValue,
        expiresAt: Date.now() + ttlMs,
      });
    }

    return cloneJsonValue(cachedValue) as T;
  }).finally(() => {
    inflightJsonRequests.delete(cacheKey);
  });

  inflightJsonRequests.set(cacheKey, requestPromise);
  return requestPromise;
}
