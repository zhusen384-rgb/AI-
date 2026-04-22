import "@/app/api/resume/parse/route";
import {
  getParseResumeContent,
  type ResumeParseParams,
  type ResumeParseResult,
} from "@/lib/resume-helper-registry";

export type { ResumeParseParams, ResumeParseResult } from "@/lib/resume-helper-registry";

export async function parseResumeContent(
  params: ResumeParseParams
): Promise<ResumeParseResult> {
  return getParseResumeContent()(params);
}
