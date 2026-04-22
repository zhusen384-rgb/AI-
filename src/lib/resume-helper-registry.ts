import type { ResumeContactInfo } from "@/lib/resume-contact-info";

export type ResumeExtractParams = {
  buffer: Buffer;
  fileName: string;
  fileType: string;
  fileSize: number;
  fileKey?: string;
};

export type ResumeExtractResult = {
  success: true;
  content: string;
  detectedInfo: ResumeContactInfo;
};

export type ResumeParseParams = {
  resumeContent: string;
  position?: unknown;
};

export type ResumeParseResult = {
  success: true;
  data: unknown;
  fallbackUsed: boolean;
  warning?: string;
};

export type ExtractResumeFromBufferFn = (
  params: ResumeExtractParams
) => Promise<ResumeExtractResult>;

export type ParseResumeContentFn = (
  params: ResumeParseParams
) => Promise<ResumeParseResult>;

type ResumeHelperRegistry = {
  extractResumeFromBuffer?: ExtractResumeFromBufferFn;
  parseResumeContent?: ParseResumeContentFn;
};

type ResumeHelperGlobal = typeof globalThis & {
  __resumeHelperRegistry?: ResumeHelperRegistry;
};

const resumeHelperGlobal = globalThis as ResumeHelperGlobal;

const registry =
  resumeHelperGlobal.__resumeHelperRegistry ||
  (resumeHelperGlobal.__resumeHelperRegistry = {});

export function registerExtractResumeFromBuffer(fn: ExtractResumeFromBufferFn) {
  registry.extractResumeFromBuffer = fn;
}

export function registerParseResumeContent(fn: ParseResumeContentFn) {
  registry.parseResumeContent = fn;
}

export function getExtractResumeFromBuffer(): ExtractResumeFromBufferFn {
  if (!registry.extractResumeFromBuffer) {
    throw new Error("简历提取 helper 尚未注册");
  }

  return registry.extractResumeFromBuffer;
}

export function getParseResumeContent(): ParseResumeContentFn {
  if (!registry.parseResumeContent) {
    throw new Error("简历解析 helper 尚未注册");
  }

  return registry.parseResumeContent;
}
