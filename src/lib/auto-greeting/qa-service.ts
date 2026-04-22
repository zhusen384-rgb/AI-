import type { Platform } from '@/lib/auto-greeting/types';

interface QueryableClient {
  query: (query: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
}

interface TriggerKeywordConfig {
  keywords: string[];
  matchType: 'exact' | 'contains' | 'fuzzy';
}

export interface MatchedQaAnswer {
  id: string;
  category: string;
  answer: string;
  matchedKeywords: string[];
  priority: number;
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[，。！？；：,.!?;:（）()\[\]{}"']/g, '');
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(item => String(item || '').trim()).filter(Boolean);
}

function parseTriggerKeywords(value: unknown): TriggerKeywordConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      keywords: [],
      matchType: 'contains',
    };
  }

  const raw = value as Record<string, unknown>;
  const matchType = raw.matchType;

  return {
    keywords: parseStringArray(raw.keywords),
    matchType:
      matchType === 'exact' || matchType === 'fuzzy' || matchType === 'contains'
        ? matchType
        : 'contains',
  };
}

function parsePlatformAnswers(value: unknown): Array<{ platform: string; answer: string }> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(item => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return null;
      }

      const raw = item as Record<string, unknown>;
      if (!raw.platform || !raw.answer) {
        return null;
      }

      return {
        platform: String(raw.platform),
        answer: String(raw.answer),
      };
    })
    .filter((item): item is { platform: string; answer: string } => Boolean(item));
}

function keywordMatches(message: string, keyword: string, matchType: TriggerKeywordConfig['matchType']): boolean {
  const normalizedMessage = normalizeText(message);
  const normalizedKeyword = normalizeText(keyword);

  if (!normalizedKeyword) {
    return false;
  }

  if (matchType === 'exact') {
    return normalizedMessage === normalizedKeyword || normalizedMessage.includes(normalizedKeyword);
  }

  if (matchType === 'contains') {
    return normalizedMessage.includes(normalizedKeyword);
  }

  if (normalizedMessage.includes(normalizedKeyword) || normalizedKeyword.includes(normalizedMessage)) {
    return true;
  }

  if (normalizedKeyword.length < 2) {
    return false;
  }

  let longestCommon = 0;
  for (let index = 0; index < normalizedKeyword.length; index += 1) {
    for (let size = 2; index + size <= normalizedKeyword.length; size += 1) {
      const fragment = normalizedKeyword.slice(index, index + size);
      if (normalizedMessage.includes(fragment)) {
        longestCommon = Math.max(longestCommon, fragment.length);
      }
    }
  }

  return longestCommon >= Math.min(3, normalizedKeyword.length);
}

function resolveQaAnswer(row: Record<string, unknown>, platform: Platform): string {
  const platformAnswer = parsePlatformAnswers(row.platform_answers).find(
    item => item.platform === platform
  );

  if (platformAnswer?.answer) {
    return platformAnswer.answer;
  }

  return String(row.answer || '');
}

export async function findBestQaAnswer(
  client: QueryableClient,
  input: {
    jobId: string;
    platform: Platform;
    message: string;
  }
): Promise<MatchedQaAnswer | null> {
  const result = await client.query(
    `
      SELECT *
      FROM ag_qa_library
      WHERE is_active = true
        AND (job_id = $1 OR job_id IS NULL)
      ORDER BY CASE WHEN job_id = $1 THEN 0 ELSE 1 END, priority ASC, created_at DESC
    `,
    [input.jobId]
  );

  const candidates = result.rows
    .map(row => {
      const triggerKeywords = parseTriggerKeywords(row.trigger_keywords);
      const questionExamples = parseStringArray(row.question_examples);
      const searchableKeywords = [...triggerKeywords.keywords, ...questionExamples];
      const matchedKeywords = searchableKeywords.filter(keyword =>
        keywordMatches(input.message, keyword, triggerKeywords.matchType)
      );

      if (matchedKeywords.length === 0) {
        return null;
      }

      return {
        id: String(row.id),
        category: String(row.category || ''),
        answer: resolveQaAnswer(row, input.platform),
        matchedKeywords,
        priority: Number(row.priority || 100),
      } satisfies MatchedQaAnswer;
    })
    .filter((item): item is MatchedQaAnswer => Boolean(item))
    .sort((left, right) => {
      if (left.priority !== right.priority) {
        return left.priority - right.priority;
      }

      return right.matchedKeywords.length - left.matchedKeywords.length;
    });

  return candidates[0] || null;
}
