import { createHash } from "crypto";
import path from "path";
import { promises as fs } from "fs";

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const DEFAULT_TTL_MS = 30 * 60 * 1000;
const MAX_CACHE_SIZE = 128;
const CACHE_VERSION = 1;
const DISK_CACHE_ROOT = path.join(process.cwd(), ".cache", "resume-pipeline");

type ResumePipelineCacheGlobal = typeof globalThis & {
  __resumeExtractCache?: Map<string, CacheEntry<unknown>>;
  __resumeExtractInflight?: Map<string, Promise<unknown>>;
  __resumeParseCache?: Map<string, CacheEntry<unknown>>;
  __resumeParseInflight?: Map<string, Promise<unknown>>;
};

const resumePipelineGlobal = globalThis as ResumePipelineCacheGlobal;

const extractCache =
  resumePipelineGlobal.__resumeExtractCache ||
  (resumePipelineGlobal.__resumeExtractCache = new Map<string, CacheEntry<unknown>>());
const extractInflight =
  resumePipelineGlobal.__resumeExtractInflight ||
  (resumePipelineGlobal.__resumeExtractInflight = new Map<string, Promise<unknown>>());
const parseCache =
  resumePipelineGlobal.__resumeParseCache ||
  (resumePipelineGlobal.__resumeParseCache = new Map<string, CacheEntry<unknown>>());
const parseInflight =
  resumePipelineGlobal.__resumeParseInflight ||
  (resumePipelineGlobal.__resumeParseInflight = new Map<string, Promise<unknown>>());

type DiskCacheRecord<T> = {
  version: number;
  expiresAt: number;
  value: T;
};

function pruneExpired<T>(cache: Map<string, CacheEntry<T>>) {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (entry.expiresAt <= now) {
      cache.delete(key);
    }
  }
}

function enforceLimit<T>(cache: Map<string, CacheEntry<T>>) {
  while (cache.size > MAX_CACHE_SIZE) {
    const oldestKey = cache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    cache.delete(oldestKey);
  }
}

function stableStringify(value: unknown): string {
  if (value === undefined) {
    return "undefined";
  }

  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

function hashCacheKey(namespace: string, key: string): string {
  return createHash("sha256").update(namespace).update("|").update(key).digest("hex");
}

function getCacheablePositionFingerprint(position: unknown): unknown {
  if (!position || typeof position !== "object" || Array.isArray(position)) {
    return position;
  }

  const input = position as Record<string, unknown>;
  return {
    title: input.title,
    department: input.department,
    jobDescription: input.jobDescription,
    education: input.education,
    experience: input.experience,
    coreRequirements: input.coreRequirements,
    softSkills: input.softSkills,
    interviewerPreferences: input.interviewerPreferences,
    vetoRules: input.vetoRules,
  };
}

function getDiskCacheFilePath(namespace: string, key: string): string {
  return path.join(DISK_CACHE_ROOT, namespace, `${hashCacheKey(namespace, key)}.json`);
}

async function readDiskCache<T>(namespace: string, key: string): Promise<CacheEntry<T> | null> {
  try {
    const filePath = getDiskCacheFilePath(namespace, key);
    const raw = await fs.readFile(filePath, "utf8");
    const record = JSON.parse(raw) as DiskCacheRecord<T>;

    if (!record || record.version !== CACHE_VERSION || typeof record.expiresAt !== "number") {
      return null;
    }

    if (record.expiresAt <= Date.now()) {
      await fs.unlink(filePath).catch(() => {});
      return null;
    }

    return {
      value: record.value,
      expiresAt: record.expiresAt,
    };
  } catch {
    return null;
  }
}

async function writeDiskCache<T>(
  namespace: string,
  key: string,
  entry: CacheEntry<T>
): Promise<void> {
  try {
    const directory = path.join(DISK_CACHE_ROOT, namespace);
    await fs.mkdir(directory, { recursive: true });

    const filePath = getDiskCacheFilePath(namespace, key);
    const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    const payload: DiskCacheRecord<T> = {
      version: CACHE_VERSION,
      expiresAt: entry.expiresAt,
      value: entry.value,
    };

    await fs.writeFile(tempPath, JSON.stringify(payload));
    await fs.rename(tempPath, filePath);
  } catch {
    // 磁盘缓存失败不影响主流程
  }
}

async function getOrCreateCachedValue<T>(
  namespace: string,
  cache: Map<string, CacheEntry<T>>,
  inflight: Map<string, Promise<T>>,
  key: string,
  producer: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL_MS
): Promise<T> {
  pruneExpired(cache);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const diskCached = await readDiskCache<T>(namespace, key);
  if (diskCached) {
    cache.set(key, diskCached);
    enforceLimit(cache);
    return diskCached.value;
  }

  const running = inflight.get(key);
  if (running) {
    return running;
  }

  const task = producer()
    .then((value) => {
      const entry = {
        value,
        expiresAt: Date.now() + ttlMs,
      };
      cache.set(key, entry);
      enforceLimit(cache);
      void writeDiskCache(namespace, key, entry);
      return value;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, task);
  return task;
}

export function buildResumeBufferHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function buildResumeExtractCacheKey(params: {
  fileKey?: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  buffer?: Buffer;
}): string {
  if (params.buffer) {
    const bufferHash = buildResumeBufferHash(params.buffer);
    return `extract:buffer:${bufferHash}:${params.fileType}:${params.fileSize}`;
  }

  if (params.fileKey) {
    return `extract:file:${params.fileKey}`;
  }

  return `extract:upload:${params.fileName}:${params.fileType}:${params.fileSize}`;
}

export function buildResumeParseCacheKey(params: {
  resumeContent: string;
  position?: unknown;
}): string {
  const normalizedContent = params.resumeContent.replace(/\s+/g, " ").trim();
  const positionFingerprint = params.position ? stableStringify(getCacheablePositionFingerprint(params.position)) : "";
  const hash = createHash("sha256")
    .update(normalizedContent)
    .update("|")
    .update(positionFingerprint)
    .digest("hex");
  return `parse:${hash}`;
}

export async function getOrCreateExtractCache<T>(
  key: string,
  producer: () => Promise<T>,
  ttlMs?: number
): Promise<T> {
  return getOrCreateCachedValue(
    "extract",
    extractCache as Map<string, CacheEntry<T>>,
    extractInflight as Map<string, Promise<T>>,
    key,
    producer,
    ttlMs
  );
}

export async function getOrCreateParseCache<T>(
  key: string,
  producer: () => Promise<T>,
  ttlMs?: number
): Promise<T> {
  return getOrCreateCachedValue(
    "parse",
    parseCache as Map<string, CacheEntry<T>>,
    parseInflight as Map<string, Promise<T>>,
    key,
    producer,
    ttlMs
  );
}
