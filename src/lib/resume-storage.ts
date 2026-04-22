import path from "path";
import { promises as fs } from "fs";
import { S3Storage } from "coze-coding-dev-sdk";

export const LOCAL_RESUME_PREFIX = "local://";

function isPlaceholder(value?: string): boolean {
  if (!value) {
    return true;
  }

  return value.startsWith("replace_with_") || value === "your_bucket_name" || value === "your_s3_endpoint";
}

function getConfiguredValue(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed && !isPlaceholder(trimmed)) {
      return trimmed;
    }
  }

  return undefined;
}

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function getLocalUploadsRoot(): string {
  return path.join(process.cwd(), "storage", "private", "uploads");
}

function getLocalResumeDirectory(): string {
  return path.join(getLocalUploadsRoot(), "resumes");
}

export function getResumeStorageConfig(): {
  endpointUrl?: string;
  accessKey: string;
  secretKey: string;
  bucketName?: string;
  region: string;
} {
  return {
    endpointUrl: getConfiguredValue(
      process.env.COZE_BUCKET_ENDPOINT_URL,
      process.env.S3_ENDPOINT
    ),
    accessKey: process.env.COZE_BUCKET_ACCESS_KEY || process.env.S3_ACCESS_KEY || "",
    secretKey: process.env.COZE_BUCKET_SECRET_KEY || process.env.S3_SECRET_KEY || "",
    bucketName: getConfiguredValue(
      process.env.COZE_BUCKET_NAME,
      process.env.S3_BUCKET
    ),
    region: process.env.COZE_BUCKET_REGION || process.env.S3_REGION || "cn-beijing",
  };
}

export function isCloudResumeStorageConfigured(): boolean {
  const config = getResumeStorageConfig();
  return Boolean(config.endpointUrl && config.bucketName);
}

export function createResumeStorageClient(): S3Storage {
  const config = getResumeStorageConfig();

  return new S3Storage({
    endpointUrl: config.endpointUrl,
    accessKey: config.accessKey,
    secretKey: config.secretKey,
    bucketName: config.bucketName,
    region: config.region,
  });
}

export function createLocalResumeFileKey(fileName: string): string {
  const extension = path.extname(fileName);
  const baseName = path.basename(fileName, extension);
  return `${LOCAL_RESUME_PREFIX}resumes/${sanitizeFileName(baseName)}_${Date.now()}${sanitizeFileName(extension)}`;
}

export function createCloudResumeObjectName(fileName: string): string {
  const extension = path.extname(fileName);
  const baseName = path.basename(fileName, extension);
  return `resumes/${sanitizeFileName(baseName)}_${Date.now()}${sanitizeFileName(extension)}`;
}

export function isLocalResumeFileKey(fileKey: string): boolean {
  return fileKey.startsWith(LOCAL_RESUME_PREFIX);
}

export function getLocalResumeUrl(fileKey: string): string {
  return `/api/resume/download?fileKey=${encodeURIComponent(fileKey)}`;
}

export async function saveResumeFileLocally(fileName: string, buffer: Buffer): Promise<{
  fileKey: string;
  downloadUrl: string;
}> {
  const fileKey = createLocalResumeFileKey(fileName);
  const relativePath = fileKey.replace(LOCAL_RESUME_PREFIX, "");
  const absolutePath = path.join(getLocalUploadsRoot(), relativePath);

  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, buffer);

  return {
    fileKey,
    downloadUrl: getLocalResumeUrl(fileKey),
  };
}

export async function storeResumeFile(fileName: string, contentType: string, buffer: Buffer): Promise<{
  fileKey: string;
  downloadUrl: string;
}> {
  if (isCloudResumeStorageConfigured()) {
    const storage = createResumeStorageClient();

    try {
      const fileKey = await storage.uploadFile({
        fileContent: buffer,
        fileName: createCloudResumeObjectName(fileName),
        contentType,
      });

      const downloadUrl = await storage.generatePresignedUrl({
        key: fileKey,
        expireTime: 604800,
      });

      return {
        fileKey,
        downloadUrl,
      };
    } catch (storageError) {
      console.warn("简历上传到对象存储失败，回退到本地存储:", storageError);
    }
  }

  await ensureLocalResumeDirectory();
  return saveResumeFileLocally(fileName, buffer);
}

export async function readLocalResumeFile(fileKey: string): Promise<Buffer> {
  const relativePath = fileKey.replace(LOCAL_RESUME_PREFIX, "");
  const absolutePath = path.join(getLocalUploadsRoot(), relativePath);
  return fs.readFile(absolutePath);
}

export async function readResumeFileByKey(fileKey: string): Promise<Buffer> {
  if (isLocalResumeFileKey(fileKey)) {
    return readLocalResumeFile(fileKey);
  }

  if (!isCloudResumeStorageConfigured()) {
    throw new Error("对象存储未配置，且当前 fileKey 不是本地文件");
  }

  const storage = createResumeStorageClient();
  const presignedUrl = await storage.generatePresignedUrl({
    key: fileKey,
    expireTime: 300,
  });

  const response = await fetch(presignedUrl);
  if (!response.ok) {
    throw new Error(`文件下载失败: HTTP ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export function getResumeContentType(fileName: string): string {
  const extension = path.extname(fileName).toLowerCase();

  const contentTypeMap: Record<string, string> = {
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".rtf": "application/rtf",
    ".txt": "text/plain",
    ".xml": "application/xml",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".bmp": "image/bmp",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".tiff": "image/tiff",
    ".tif": "image/tiff",
  };

  return contentTypeMap[extension] || "application/octet-stream";
}

export async function ensureLocalResumeDirectory(): Promise<void> {
  await fs.mkdir(getLocalResumeDirectory(), { recursive: true });
}
