import { getClient } from "@/lib/db";
import {
  DEFAULT_CANDIDATE_MAJOR_OPTIONS,
  dedupeCandidateMajorOptions,
  normalizeCandidateMajorOption,
} from "@/lib/candidate-major-library";

const CANDIDATE_MAJOR_OPTIONS_SETTINGS_TABLE = "candidate_major_option_settings";
const GLOBAL_SETTING_KEY = "global_default";

type CandidateMajorOptionsRow = {
  options?: unknown;
  blocked_options?: unknown;
};

function parseStoredOptions(value: unknown): string[] {
  if (Array.isArray(value)) {
    return dedupeCandidateMajorOptions(value.filter((item): item is string => typeof item === "string"));
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parseStoredOptions(parsed);
    } catch {
      return [];
    }
  }

  return [];
}

async function getStoredCandidateMajorOptionsRow(): Promise<CandidateMajorOptionsRow | null> {
  await ensureCandidateMajorOptionsTable();

  const client = await getClient();

  try {
    const result = await client.query(
      `SELECT options, blocked_options
       FROM ${CANDIDATE_MAJOR_OPTIONS_SETTINGS_TABLE}
       WHERE setting_key = $1
       LIMIT 1`,
      [GLOBAL_SETTING_KEY]
    );

    return (result.rows[0] as CandidateMajorOptionsRow | undefined) ?? null;
  } finally {
    client.release();
  }
}

export async function ensureCandidateMajorOptionsTable(): Promise<void> {
  const client = await getClient();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${CANDIDATE_MAJOR_OPTIONS_SETTINGS_TABLE} (
        setting_key TEXT PRIMARY KEY,
        options JSONB NOT NULL DEFAULT '[]'::jsonb,
        blocked_options JSONB NOT NULL DEFAULT '[]'::jsonb,
        updated_by_id TEXT,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(
      `ALTER TABLE ${CANDIDATE_MAJOR_OPTIONS_SETTINGS_TABLE}
       ADD COLUMN IF NOT EXISTS blocked_options JSONB NOT NULL DEFAULT '[]'::jsonb`
    );

    await client.query(
      `INSERT INTO ${CANDIDATE_MAJOR_OPTIONS_SETTINGS_TABLE} (setting_key, options, blocked_options)
       VALUES ($1, $2::jsonb, '[]'::jsonb)
       ON CONFLICT (setting_key) DO NOTHING`,
      [GLOBAL_SETTING_KEY, JSON.stringify(dedupeCandidateMajorOptions(DEFAULT_CANDIDATE_MAJOR_OPTIONS))]
    );
  } finally {
    client.release();
  }
}

export async function getCandidateMajorOptions(): Promise<string[]> {
  const row = await getStoredCandidateMajorOptionsRow();
  return parseStoredOptions(row?.options);
}

export async function getBlockedCandidateMajorOptions(): Promise<string[]> {
  const row = await getStoredCandidateMajorOptionsRow();
  return parseStoredOptions(row?.blocked_options);
}

async function saveCandidateMajorOptionsRow(
  input: {
    options: string[];
    blockedOptions: string[];
  },
  updatedById?: string | null
): Promise<string[]> {
  const options = dedupeCandidateMajorOptions(input.options);
  const blockedSet = new Set(dedupeCandidateMajorOptions(input.blockedOptions));

  options.forEach((option) => blockedSet.delete(option));

  const blockedOptions = Array.from(blockedSet).sort((a, b) => a.localeCompare(b, "zh-CN"));
  const client = await getClient();

  try {
    await client.query(
      `INSERT INTO ${CANDIDATE_MAJOR_OPTIONS_SETTINGS_TABLE} (
         setting_key,
         options,
         blocked_options,
         updated_by_id,
         updated_at
       )
       VALUES ($1, $2::jsonb, $3::jsonb, $4, NOW())
       ON CONFLICT (setting_key)
       DO UPDATE SET
         options = EXCLUDED.options,
         blocked_options = EXCLUDED.blocked_options,
         updated_by_id = EXCLUDED.updated_by_id,
         updated_at = NOW()`,
      [
        GLOBAL_SETTING_KEY,
        JSON.stringify(options),
        JSON.stringify(blockedOptions),
        updatedById || null,
      ]
    );

    return options;
  } finally {
    client.release();
  }
}

export async function addCandidateMajorOptions(
  majors: string[],
  updatedById?: string | null
): Promise<string[]> {
  const currentOptions = await getCandidateMajorOptions();
  const blockedOptions = await getBlockedCandidateMajorOptions();
  const nextOptions = dedupeCandidateMajorOptions([...currentOptions, ...majors]);
  const nextBlockedOptions = blockedOptions.filter((item) => !nextOptions.includes(item));

  return saveCandidateMajorOptionsRow(
    {
      options: nextOptions,
      blockedOptions: nextBlockedOptions,
    },
    updatedById
  );
}

export async function syncCandidateMajorOptions(
  majors: string[],
  updatedById?: string | null
): Promise<string[]> {
  const normalizedMajors = dedupeCandidateMajorOptions(majors);
  if (normalizedMajors.length === 0) {
    return getCandidateMajorOptions();
  }

  const currentOptions = await getCandidateMajorOptions();
  const blockedOptions = new Set(await getBlockedCandidateMajorOptions());
  const syncableMajors = normalizedMajors.filter((major) => !blockedOptions.has(major));

  if (syncableMajors.length === 0) {
    return currentOptions;
  }

  return saveCandidateMajorOptionsRow(
    {
      options: [...currentOptions, ...syncableMajors],
      blockedOptions: Array.from(blockedOptions),
    },
    updatedById
  );
}

export async function renameCandidateMajorOption(
  previousMajor: string,
  nextMajor: string,
  updatedById?: string | null
): Promise<string[]> {
  const normalizedPreviousMajor = normalizeCandidateMajorOption(previousMajor);
  const normalizedNextMajor = normalizeCandidateMajorOption(nextMajor);

  if (!normalizedPreviousMajor || !normalizedNextMajor) {
    throw new Error("专业名称不能为空");
  }

  const currentOptions = await getCandidateMajorOptions();
  const blockedOptions = await getBlockedCandidateMajorOptions();
  const nextOptions = currentOptions
    .filter((option) => option !== normalizedPreviousMajor)
    .concat(normalizedNextMajor);
  const nextBlockedOptions = blockedOptions
    .filter((option) => option !== normalizedNextMajor)
    .concat(normalizedPreviousMajor);

  return saveCandidateMajorOptionsRow(
    {
      options: nextOptions,
      blockedOptions: nextBlockedOptions,
    },
    updatedById
  );
}

export async function deleteCandidateMajorOption(
  major: string,
  updatedById?: string | null
): Promise<string[]> {
  const normalizedMajor = normalizeCandidateMajorOption(major);
  if (!normalizedMajor) {
    throw new Error("专业名称不能为空");
  }

  const currentOptions = await getCandidateMajorOptions();
  const blockedOptions = await getBlockedCandidateMajorOptions();

  return saveCandidateMajorOptionsRow(
    {
      options: currentOptions.filter((option) => option !== normalizedMajor),
      blockedOptions: [...blockedOptions, normalizedMajor],
    },
    updatedById
  );
}
