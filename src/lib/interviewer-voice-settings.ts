import { getClient } from "@/lib/db";
import {
  DEFAULT_INTERVIEWER_VOICE_ID,
  getInterviewerVoiceOption,
  normalizeInterviewerVoiceId,
} from "@/lib/interviewer-voice";
import {
  createDefaultInterviewerVoiceTtsSettings,
  normalizeInterviewerVoiceTtsSettings,
  type InterviewerVoiceTtsSettings,
} from "@/lib/interviewer-voice-tts";

const VOICE_SETTINGS_TABLE = "ai_interviewer_voice_settings";
const GLOBAL_SETTING_KEY = "global_default";

function isUsableEnvValue(value?: string | null): value is string {
  if (!value) {
    return false;
  }

  const normalized = value.trim();
  if (!normalized) {
    return false;
  }

  return !(
    normalized.startsWith("replace_with_") ||
    normalized.startsWith("your_")
  );
}

function getOptionalEnvValue(envName: string): string | undefined {
  const value = process.env[envName]?.trim();
  return isUsableEnvValue(value) ? value : undefined;
}

function getOptionalBooleanEnv(envName: string): boolean | undefined {
  const value = process.env[envName]?.trim().toLowerCase();
  if (!value) {
    return undefined;
  }

  if (["1", "true", "yes", "on"].includes(value)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(value)) {
    return false;
  }

  return undefined;
}

function parseStoredTtsSettings(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

export function getEnvironmentInterviewerVoiceTtsSettings(): InterviewerVoiceTtsSettings {
  const defaults = createDefaultInterviewerVoiceTtsSettings();

  return normalizeInterviewerVoiceTtsSettings({
    meloTts: {
      enabled:
        getOptionalBooleanEnv("MELOTTS_ENABLED") ?? defaults.meloTts.enabled,
      baseUrl: getOptionalEnvValue("MELOTTS_BASE_URL") || defaults.meloTts.baseUrl,
    },
  }, defaults);
}

export type GlobalInterviewerVoiceSettings = {
  voiceId: string;
  ttsSettings: InterviewerVoiceTtsSettings;
};

export async function ensureInterviewerVoiceSettingsTable(): Promise<void> {
  const client = await getClient();
  const defaultTtsSettings = getEnvironmentInterviewerVoiceTtsSettings();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${VOICE_SETTINGS_TABLE} (
        setting_key TEXT PRIMARY KEY,
        voice_id TEXT NOT NULL DEFAULT '${DEFAULT_INTERVIEWER_VOICE_ID}',
        tts_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_by_id TEXT,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(
      `ALTER TABLE ${VOICE_SETTINGS_TABLE} ADD COLUMN IF NOT EXISTS tts_settings JSONB NOT NULL DEFAULT '{}'::jsonb`
    );

    await client.query(
      `INSERT INTO ${VOICE_SETTINGS_TABLE} (setting_key, voice_id, tts_settings)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (setting_key) DO NOTHING`,
      [GLOBAL_SETTING_KEY, DEFAULT_INTERVIEWER_VOICE_ID, JSON.stringify(defaultTtsSettings)]
    );

    await client.query(
      `UPDATE ${VOICE_SETTINGS_TABLE}
       SET voice_id = $1,
           updated_at = NOW()
       WHERE setting_key = $2
         AND voice_id = $3
         AND updated_by_id IS NULL`,
      [DEFAULT_INTERVIEWER_VOICE_ID, GLOBAL_SETTING_KEY, "steady_professional"]
    );
  } finally {
    client.release();
  }
}

export async function getGlobalInterviewerVoiceSetting(): Promise<string> {
  const settings = await getGlobalInterviewerVoiceSettings();
  return settings.voiceId;
}

export async function getGlobalInterviewerVoiceSettings(): Promise<GlobalInterviewerVoiceSettings> {
  await ensureInterviewerVoiceSettingsTable();

  const client = await getClient();
  const fallbackTtsSettings = getEnvironmentInterviewerVoiceTtsSettings();

  try {
    const result = await client.query(
      `SELECT voice_id, tts_settings FROM ${VOICE_SETTINGS_TABLE} WHERE setting_key = $1 LIMIT 1`,
      [GLOBAL_SETTING_KEY]
    );

    return {
      voiceId: normalizeInterviewerVoiceId(result.rows[0]?.voice_id),
      ttsSettings: normalizeInterviewerVoiceTtsSettings(
        parseStoredTtsSettings(result.rows[0]?.tts_settings),
        fallbackTtsSettings
      ),
    };
  } finally {
    client.release();
  }
}

export async function getGlobalInterviewerVoiceTtsSettings(): Promise<InterviewerVoiceTtsSettings> {
  const settings = await getGlobalInterviewerVoiceSettings();
  return settings.ttsSettings;
}

export async function updateGlobalInterviewerVoiceSetting(
  voiceId: string,
  updatedById?: string | null
): Promise<string> {
  const settings = await updateGlobalInterviewerVoiceSettings(
    { voiceId },
    updatedById
  );

  return settings.voiceId;
}

export async function updateGlobalInterviewerVoiceSettings(
  input: {
    voiceId?: string | null;
    ttsSettings?: unknown;
  },
  updatedById?: string | null
): Promise<GlobalInterviewerVoiceSettings> {
  await ensureInterviewerVoiceSettingsTable();

  const currentSettings = await getGlobalInterviewerVoiceSettings();
  const normalizedVoiceId = input.voiceId
    ? normalizeInterviewerVoiceId(input.voiceId)
    : currentSettings.voiceId;
  const normalizedTtsSettings =
    input.ttsSettings === undefined
      ? currentSettings.ttsSettings
      : normalizeInterviewerVoiceTtsSettings(
          input.ttsSettings,
          currentSettings.ttsSettings
        );
  const client = await getClient();

  try {
    await client.query(
      `INSERT INTO ${VOICE_SETTINGS_TABLE} (setting_key, voice_id, tts_settings, updated_by_id, updated_at)
       VALUES ($1, $2, $3::jsonb, $4, NOW())
       ON CONFLICT (setting_key)
       DO UPDATE SET
         voice_id = EXCLUDED.voice_id,
         tts_settings = EXCLUDED.tts_settings,
         updated_by_id = EXCLUDED.updated_by_id,
         updated_at = NOW()`,
      [
        GLOBAL_SETTING_KEY,
        normalizedVoiceId,
        JSON.stringify(normalizedTtsSettings),
        updatedById || null,
      ]
    );

    return {
      voiceId: normalizedVoiceId,
      ttsSettings: normalizedTtsSettings,
    };
  } finally {
    client.release();
  }
}

export function getGlobalInterviewerVoiceOption(voiceId?: string | null) {
  return getInterviewerVoiceOption(voiceId);
}
