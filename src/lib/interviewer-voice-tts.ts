export interface InterviewerVoiceTtsSettings {
  meloTts: {
    enabled: boolean;
    baseUrl: string;
  };
}

export const DEFAULT_MELOTTS_BASE_URL = "http://127.0.0.1:5001";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function createDefaultInterviewerVoiceTtsSettings(): InterviewerVoiceTtsSettings {
  return {
    meloTts: {
      enabled: false,
      baseUrl: DEFAULT_MELOTTS_BASE_URL,
    },
  };
}

export function normalizeInterviewerVoiceTtsSettings(
  value?: unknown,
  fallback?: Partial<InterviewerVoiceTtsSettings>
): InterviewerVoiceTtsSettings {
  const defaults = createDefaultInterviewerVoiceTtsSettings();
  const source = isRecord(value) ? value : {};
  const sourceMeloTts = isRecord(source.meloTts) ? source.meloTts : {};
  const fallbackMeloTts = fallback?.meloTts;

  return {
    meloTts: {
      enabled: readBoolean(
        sourceMeloTts.enabled,
        fallbackMeloTts?.enabled ?? defaults.meloTts.enabled
      ),
      baseUrl: readString(
        sourceMeloTts.baseUrl,
        fallbackMeloTts?.baseUrl || defaults.meloTts.baseUrl
      ),
    },
  };
}
