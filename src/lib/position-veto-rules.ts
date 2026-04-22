export type PositionVetoRule = {
  id: string;
  ruleName: string;
  description: string;
  keywords: string[];
  enabled: boolean;
};

export type PositionVetoRuleHit = PositionVetoRule & {
  matchedKeywords: string[];
  matchedEvidence: string[];
};

export type PositionVetoCheck = {
  triggered: boolean;
  hits: PositionVetoRuleHit[];
};

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "");
}

function pickString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function normalizeBoolean(value: unknown, defaultValue = true): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  return defaultValue;
}

export function splitVetoRuleKeywords(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[\n,，;；、]/)
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    )
  );
}

function normalizeVetoRuleKeywords(value: unknown): string[] {
  if (typeof value === "string") {
    return splitVetoRuleKeywords(value);
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter((item) => item.length > 0)
    )
  );
}

function normalizeSingleVetoRule(value: unknown, index: number): PositionVetoRule | null {
  if (typeof value === "string") {
    const ruleName = value.trim();
    if (!ruleName) {
      return null;
    }

    return {
      id: `veto-rule-${index + 1}`,
      ruleName,
      description: "",
      keywords: [],
      enabled: true,
    };
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const input = value as Record<string, unknown>;
  const ruleName = pickString(input.ruleName, input.name, input.title, input.label);
  const description = pickString(input.description, input.ruleDescription, input.note, input.notes);
  const keywords = normalizeVetoRuleKeywords(
    input.keywords ?? input.matchKeywords ?? input.triggerKeywords ?? input.triggerWords
  );
  const enabled = normalizeBoolean(input.enabled, true);
  const id = pickString(input.id, input.ruleId, input.key);

  if (!ruleName && !description && keywords.length === 0) {
    return null;
  }

  return {
    id: id || `veto-rule-${index + 1}`,
    ruleName: ruleName || description || `规则 ${index + 1}`,
    description,
    keywords,
    enabled,
  };
}

export function normalizePositionVetoRules(value: unknown): PositionVetoRule[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item, index) => normalizeSingleVetoRule(item, index))
    .filter((item): item is PositionVetoRule => Boolean(item));
}

function matchesKeyword(text: string, compactText: string, keyword: string): boolean {
  const normalizedKeyword = normalizeText(keyword);
  if (!normalizedKeyword) {
    return false;
  }

  return text.includes(normalizedKeyword) || compactText.includes(normalizedKeyword);
}

function collectEvidence(
  resumeContent: string,
  lines: string[],
  keyword: string
): string[] {
  const normalizedKeyword = normalizeText(keyword);
  const lineEvidence = lines
    .filter((line) => matchesKeyword(normalizeText(line), normalizeText(line), normalizedKeyword))
    .slice(0, 2);

  if (lineEvidence.length > 0) {
    return lineEvidence;
  }

  const lowerResume = resumeContent.toLowerCase();
  const rawIndex = lowerResume.indexOf(keyword.toLowerCase());
  if (rawIndex >= 0) {
    const start = Math.max(0, rawIndex - 40);
    const end = Math.min(resumeContent.length, rawIndex + keyword.length + 40);
    return [resumeContent.slice(start, end).replace(/\s+/g, " ").trim()];
  }

  return [];
}

export function evaluatePositionVetoRules(params: {
  resumeContent: string;
  position?: {
    vetoRules?: unknown;
  } | null;
  lines?: string[];
}): PositionVetoCheck {
  const rules = normalizePositionVetoRules(params.position?.vetoRules);
  if (rules.length === 0) {
    return {
      triggered: false,
      hits: [],
    };
  }

  const lines =
    params.lines ||
    params.resumeContent
      .replace(/\r/g, "\n")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => Boolean(line));
  const lowerResume = params.resumeContent.toLowerCase();
  const compactResume = normalizeText(params.resumeContent);

  const hits = rules.flatMap((rule) => {
    if (!rule.enabled || rule.keywords.length === 0) {
      return [];
    }

    const matchedKeywords = rule.keywords.filter((keyword) =>
      matchesKeyword(lowerResume, compactResume, keyword)
    );

    if (matchedKeywords.length === 0) {
      return [];
    }

    const matchedEvidence = Array.from(
      new Set(
        matchedKeywords.flatMap((keyword) => collectEvidence(params.resumeContent, lines, keyword))
      )
    ).slice(0, 4);

    return [
      {
        ...rule,
        matchedKeywords,
        matchedEvidence,
      },
    ];
  });

  return {
    triggered: hits.length > 0,
    hits,
  };
}
