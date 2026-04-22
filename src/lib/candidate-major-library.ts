export const DEFAULT_CANDIDATE_MAJOR_OPTIONS = [
  "计算机科学与技术",
  "软件工程",
  "信息管理与信息系统",
  "人工智能",
  "数据科学与大数据技术",
  "电子信息工程",
  "通信工程",
  "自动化",
  "机械设计制造及其自动化",
  "电气工程及其自动化",
  "工商管理",
  "市场营销",
  "人力资源管理",
  "财务管理",
  "会计学",
  "汉语言文学",
  "英语",
  "法学",
  "产品设计",
  "视觉传达设计",
] as const;

export function normalizeCandidateMajorOption(value: string | undefined | null): string {
  if (!value) {
    return "";
  }

  return value.replace(/\s+/g, " ").trim();
}

export function sortCandidateMajorOptions(values: Iterable<string>): string[] {
  return Array.from(values).sort((a, b) => a.localeCompare(b, "zh-CN"));
}

export function dedupeCandidateMajorOptions(values: Iterable<string>): string[] {
  const uniqueValues = new Set<string>();

  for (const value of values) {
    const normalizedValue = normalizeCandidateMajorOption(value);
    if (normalizedValue) {
      uniqueValues.add(normalizedValue);
    }
  }

  return sortCandidateMajorOptions(uniqueValues);
}
