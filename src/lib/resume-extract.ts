import "@/app/api/resume/extract/route";
import {
  getExtractResumeFromBuffer,
  type ResumeExtractParams,
  type ResumeExtractResult,
} from "@/lib/resume-helper-registry";

export type { ResumeExtractParams, ResumeExtractResult } from "@/lib/resume-helper-registry";

export async function extractResumeFromBuffer(
  params: ResumeExtractParams
): Promise<ResumeExtractResult> {
  return getExtractResumeFromBuffer()(params);
}
