import { readdir, readFile } from "fs/promises";
import path from "path";
import mammoth from "mammoth";
import * as XLSX from "xlsx";

export type LocalQuickReply = {
  answer: string;
  suggestions?: string[];
};

export type LocalKnowledgeAnswer = {
  answer: string;
  suggestions: string[];
  source: "quick_reply" | "system_guide" | "company_assets" | "fallback";
  topic?: string;
  documents?: Array<{ fileName: string; score: number }>;
};

type SystemTopic = {
  title: string;
  keywords: string[];
  answer: string;
  suggestions?: string[];
};

type AssetDoc = {
  fileName: string;
  ext: string;
  content: string;
};

const HUMAN_CONTACT_REPLY = "这个问题需要联系总部人事白佳乐";
const ASSETS_DIR = path.join(process.cwd(), "assets");
const ASSET_CACHE_TTL_MS = 30 * 1000;

const OUT_OF_SCOPE_KEYWORDS = [
  "薪资",
  "工资",
  "社保",
  "公积金",
  "福利",
  "假期",
  "年假",
  "报销",
  "转正",
  "入职流程",
  "离职",
  "考勤",
  "审批流",
  "发薪",
];

const COMPANY_KEYWORDS = [
  "公司",
  "集团",
  "人康",
  "企业文化",
  "发展史",
  "历史",
  "荣誉",
  "品牌",
  "合作",
  "未来规划",
  "员工风采",
  "架构",
  "总部",
  "画册",
  "介绍",
];

const COMPANY_DOC_PRIORITY_KEYWORDS = [
  "公司",
  "集团",
  "企业",
  "人康",
  "文化",
  "荣誉",
  "品牌",
  "合作",
  "未来",
  "历史",
  "画册",
  "风采",
];

const GENERIC_COMPANY_TERMS = ["公司", "集团", "企业", "介绍", "总部"];

const NON_COMPANY_DOC_KEYWORDS = [
  "岗位",
  "评分",
  "题库",
  "面试",
  "候选人",
  "打招呼",
  "截图",
];

const SYSTEM_TOPICS: SystemTopic[] = [
  {
    title: "创建岗位",
    keywords: ["创建岗位", "新增岗位", "岗位管理", "岗位新建"],
    answer:
      "创建岗位步骤：\n1. 点击左侧菜单「岗位管理」\n2. 点击右上角「创建岗位」\n3. 填写岗位名称、部门、学历要求、经验要求和岗位描述\n4. 点击「创建」完成保存\n\n超级管理员创建时，还可以选择是否同步给所有用户。",
    suggestions: ["如何编辑岗位信息？", "岗位状态如何管理？"],
  },
  {
    title: "编辑岗位",
    keywords: ["编辑岗位", "修改岗位", "岗位信息"],
    answer:
      "编辑岗位步骤：\n1. 进入「岗位管理」\n2. 找到目标岗位\n3. 点击「编辑」按钮\n4. 修改岗位信息后点击「保存」",
    suggestions: ["如何创建岗位？", "岗位状态如何管理？"],
  },
  {
    title: "岗位状态",
    keywords: ["岗位状态", "关闭岗位", "暂停招聘", "招聘中"],
    answer:
      "岗位状态管理说明：\n1. 在「岗位管理」列表找到岗位\n2. 可切换为「招聘中 / 暂停招聘 / 已关闭」\n3. 已关闭岗位会停止招聘，不再作为正常招聘岗位使用",
    suggestions: ["如何创建岗位？", "如何编辑岗位信息？"],
  },
  {
    title: "添加候选人",
    keywords: ["添加候选人", "新增候选人", "候选人管理"],
    answer:
      "添加候选人步骤：\n1. 点击左侧菜单「候选人管理」\n2. 点击「添加候选人」\n3. 填写姓名、手机号、邮箱、招聘渠道、应聘岗位\n4. 点击「保存」",
    suggestions: ["如何上传简历？", "候选人状态说明"],
  },
  {
    title: "上传简历",
    keywords: ["上传简历", "导入简历", "简历上传", "简历解析"],
    answer:
      "上传简历步骤：\n1. 进入「候选人管理」\n2. 添加候选人或进入候选人详情\n3. 点击「上传简历」\n4. 选择 PDF、Word 或图片格式文件\n5. 系统会自动解析简历内容\n\n如果上传失败，请先检查文件格式和大小是否符合要求。",
    suggestions: ["如何查看简历解析结果？", "候选人状态说明"],
  },
  {
    title: "查看简历解析结果",
    keywords: ["查看简历解析", "简历解析结果", "简历信息"],
    answer:
      "查看简历解析结果步骤：\n1. 打开候选人详情\n2. 查看「简历信息」区域\n3. 系统会展示基础信息、教育经历、工作经历、技能等解析内容",
    suggestions: ["如何上传简历？", "如何添加候选人？"],
  },
  {
    title: "候选人状态",
    keywords: ["候选人状态", "待筛选", "待面试", "已通过", "已拒绝"],
    answer:
      "候选人常见状态包括：\n1. 待筛选\n2. 待面试\n3. 面试中\n4. 已通过\n5. 已拒绝\n6. 已入职\n\n不同页面里还会结合初试、复试、终试阶段显示更细的状态。",
    suggestions: ["如何添加候选人？", "如何上传简历？"],
  },
  {
    title: "生成面试链接",
    keywords: ["生成面试链接", "ai面试链接", "全ai面试", "开始ai面试"],
    answer:
      "生成 AI 面试链接步骤：\n1. 进入「全AI面试」\n2. 选择岗位和面试模式\n3. 填写候选人信息并上传或填写简历\n4. 点击生成链接\n5. 复制链接发给候选人",
    suggestions: ["面试链接有效期？", "如何查看面试结果？"],
  },
  {
    title: "面试链接有效期",
    keywords: ["有效期", "链接过期", "面试链接有效期"],
    answer: "默认情况下，面试链接有效期为 7 天。过期后需要重新生成新的链接。",
    suggestions: ["如何生成面试链接？", "如何查看面试结果？"],
  },
  {
    title: "查看面试结果",
    keywords: ["查看面试结果", "面试记录", "评估报告", "综合评分"],
    answer:
      "查看面试结果步骤：\n1. 进入对应的面试记录或全AI面试记录页面\n2. 选择候选人\n3. 查看综合评分、维度得分、优势、改进建议和推荐结论\n4. 如有录屏，可在线查看或下载",
    suggestions: ["如何生成面试链接？", "面试模式说明"],
  },
  {
    title: "面试模式",
    keywords: ["面试模式", "初级模式", "中级模式", "高级模式"],
    answer:
      "面试模式通常分为初级、中级、高级等类型，不同模式会影响问题深度和考察强度。你可以在生成 AI 面试链接时进行选择。",
    suggestions: ["如何生成面试链接？", "如何查看面试结果？"],
  },
  {
    title: "创建用户",
    keywords: ["创建用户", "新增用户", "用户管理"],
    answer:
      "创建用户步骤：\n1. 进入「用户管理」\n2. 点击「创建用户」\n3. 填写用户名、姓名、邮箱、手机号、初始密码、角色\n4. 点击「创建」完成",
    suggestions: ["如何重置密码？", "用户角色权限说明"],
  },
  {
    title: "重置密码",
    keywords: ["重置密码", "忘记密码", "密码怎么办"],
    answer:
      "忘记密码时，请联系管理员重置密码。管理员可以在「用户管理」中找到目标用户，点击「重置密码」后输入新密码并保存。",
    suggestions: ["如何创建用户？", "用户角色权限说明"],
  },
  {
    title: "用户角色权限",
    keywords: ["角色权限", "用户角色", "权限说明", "管理员权限"],
    answer:
      "常见角色包括：\n1. 超级管理员\n2. 租户管理员\n3. 管理员\n4. 面试官\n5. 普通用户\n\n不同角色看到的菜单和可操作的数据范围不同。",
    suggestions: ["如何创建用户？", "如何重置密码？"],
  },
  {
    title: "常见故障",
    keywords: ["上传失败", "看不到岗位", "权限不足", "打不开", "页面加载慢", "数据未显示"],
    answer:
      "常见排查步骤：\n1. 先检查筛选条件、网络和浏览器缓存\n2. 简历上传失败时检查文件格式与大小\n3. 看不到岗位时确认岗位状态和权限范围\n4. 提示权限不足时联系管理员开通权限\n\n如果多次尝试仍无法解决，请联系总部人事白佳乐。",
    suggestions: ["如何上传简历？", "用户角色权限说明"],
  },
];

const QUICK_REPLIES: Array<{
  aliases: string[];
  answer: string;
  suggestions?: string[];
}> = SYSTEM_TOPICS.map((topic) => ({
  aliases: [topic.title, ...(topic.suggestions ?? []), ...topic.keywords],
  answer: topic.answer,
  suggestions: topic.suggestions,
}));

let cachedAssetDocs: AssetDoc[] | null = null;
let cachedAt = 0;

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[\s\r\n\t`"'“”‘’.,，。!?！？:：;；\-_/\\()[\]{}]/g, "");
}

function looksLikeCompanyQuestion(question: string): boolean {
  return COMPANY_KEYWORDS.some((keyword) => question.includes(keyword));
}

function looksOutOfScope(question: string): boolean {
  return OUT_OF_SCOPE_KEYWORDS.some((keyword) => question.includes(keyword));
}

function scoreKeywordMatch(text: string, keywords: string[]): number {
  let score = 0;
  for (const keyword of keywords) {
    if (text.includes(keyword.toLowerCase())) {
      score += keyword.length >= 4 ? 3 : 2;
    }
  }
  return score;
}

function splitIntoSnippets(content: string): string[] {
  const byLine = content
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 20);

  if (byLine.length > 0) {
    return byLine.flatMap((line) => {
      if (line.length <= 180) {
        return [line];
      }
      const chunks: string[] = [];
      for (let index = 0; index < line.length; index += 160) {
        chunks.push(line.slice(index, index + 160).trim());
      }
      return chunks.filter(Boolean);
    });
  }

  const compact = content.replace(/\s+/g, " ").trim();
  const chunks: string[] = [];
  for (let index = 0; index < compact.length; index += 160) {
    chunks.push(compact.slice(index, index + 160).trim());
  }
  return chunks.filter((chunk) => chunk.length >= 20);
}

function trimSnippet(value: string, maxLength = 140): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) {
    return compact;
  }
  return `${compact.slice(0, maxLength - 1).trim()}…`;
}

function cleanExtractedText(value: string): string {
  return value
    .replace(/([\u4e00-\u9fa5A-Za-z0-9])\s+(?=[\u4e00-\u9fa5A-Za-z0-9])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function buildCompanySuggestions(question: string): string[] {
  if (question.includes("历史") || question.includes("发展")) {
    return ["公司有哪些重要里程碑？", "公司获得过哪些荣誉？"];
  }
  if (question.includes("品牌") || question.includes("合作")) {
    return ["公司有哪些品牌合作？", "公司的未来规划是什么？"];
  }
  if (question.includes("文化") || question.includes("员工")) {
    return ["公司的企业文化是什么？", "公司员工风采有哪些介绍？"];
  }
  return ["公司的企业文化是什么？", "公司有哪些品牌合作？"];
}

async function parsePdf(buffer: Buffer): Promise<string> {
  const PDFParser = await import("pdf2json");
  const pdfParser = new PDFParser.default(null, true);

  return new Promise<string>((resolve, reject) => {
    pdfParser.on("pdfParser_dataError", (errData: Error | { parserError: Error }) => {
      reject(errData instanceof Error ? errData : errData.parserError);
    });

    pdfParser.on("pdfParser_dataReady", (pdfData: { Pages?: Array<{ Texts?: Array<{ R?: Array<{ T?: string }> }> }> }) => {
      try {
        let fullText = "";
        for (const page of pdfData.Pages ?? []) {
          for (const textItem of page.Texts ?? []) {
            for (const run of textItem.R ?? []) {
              if (!run.T) {
                continue;
              }
              try {
                fullText += `${decodeURIComponent(run.T)} `;
              } catch {
                fullText += `${run.T} `;
              }
            }
          }
          fullText += "\n";
        }
        resolve(fullText.trim());
      } catch (error) {
        reject(error);
      }
    });

    pdfParser.parseBuffer(buffer);
  });
}

async function parseOfficeText(filePath: string, ext: string): Promise<string> {
  const buffer = await readFile(filePath);

  if (ext === ".doc" || ext === ".docx") {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return result.value.trim();
    } catch {
      return "";
    }
  }

  if (ext === ".pdf") {
    return parsePdf(buffer);
  }

  if (ext === ".xls" || ext === ".xlsx") {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    return workbook.SheetNames.map((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(sheet);
      return `[${sheetName}]\n${csv}`;
    }).join("\n\n");
  }

  return "";
}

async function loadAssetDocs(): Promise<AssetDoc[]> {
  const now = Date.now();
  if (cachedAssetDocs && now - cachedAt < ASSET_CACHE_TTL_MS) {
    return cachedAssetDocs;
  }

  const entries = await readdir(ASSETS_DIR, { withFileTypes: true });
  const docs: AssetDoc[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const fileName = entry.name;
    const ext = path.extname(fileName).toLowerCase();

    if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"].includes(ext)) {
      continue;
    }

    const filePath = path.join(ASSETS_DIR, fileName);

    try {
      let content = "";

      if ([".md", ".txt", ".json", ".csv"].includes(ext)) {
        content = await readFile(filePath, "utf8");
      } else if ([".doc", ".docx", ".pdf", ".xls", ".xlsx"].includes(ext)) {
        content = await parseOfficeText(filePath, ext);
      } else {
        continue;
      }

      const compact = cleanExtractedText(content.replace(/\0/g, " "));
      if (compact.length < 20) {
        continue;
      }

      docs.push({ fileName, ext, content: compact });
    } catch (error) {
      console.warn(`[local-knowledge] 解析文件失败: ${fileName}`, error);
    }
  }

  cachedAssetDocs = docs;
  cachedAt = now;
  return docs;
}

export function getLocalQuickReply(question: string): LocalQuickReply | null {
  const normalizedQuestion = normalizeText(question);

  for (const reply of QUICK_REPLIES) {
    if (
      reply.aliases.some((alias) => {
        const normalizedAlias = normalizeText(alias);
        return (
          normalizedQuestion === normalizedAlias ||
          normalizedQuestion.includes(normalizedAlias) ||
          normalizedAlias.includes(normalizedQuestion)
        );
      })
    ) {
      return {
        answer: reply.answer,
        suggestions: reply.suggestions ?? [],
      };
    }
  }

  return null;
}

export function answerFromSystemGuide(question: string): LocalKnowledgeAnswer | null {
  if (looksOutOfScope(question)) {
    return {
      answer: HUMAN_CONTACT_REPLY,
      suggestions: [],
      source: "fallback",
    };
  }

  const quickReply = getLocalQuickReply(question);
  if (quickReply) {
    return {
      answer: quickReply.answer,
      suggestions: quickReply.suggestions ?? [],
      source: "quick_reply",
    };
  }

  const normalizedQuestion = question.toLowerCase();
  const scoredTopics = SYSTEM_TOPICS.map((topic) => ({
    topic,
    score: scoreKeywordMatch(normalizedQuestion, topic.keywords),
  }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  const bestMatch = scoredTopics[0];
  if (!bestMatch || bestMatch.score < 2) {
    return null;
  }

  return {
    answer: bestMatch.topic.answer,
    suggestions: bestMatch.topic.suggestions ?? [],
    source: "system_guide",
    topic: bestMatch.topic.title,
  };
}

export async function searchCompanyKnowledge(question: string): Promise<{
  results: Array<{ fileName: string; score: number; snippet: string }>;
}> {
  const docs = await loadAssetDocs();
  const normalizedQuestion = question.toLowerCase();
  const matchedCompanyTerms = COMPANY_KEYWORDS.filter((keyword) => question.includes(keyword));
  const specificMatchedTerms = matchedCompanyTerms.filter(
    (keyword) => !GENERIC_COMPANY_TERMS.includes(keyword)
  );
  const terms = Array.from(new Set([
    ...question
      .split(/[\s,，。！？、/:：；;（）()\[\]]+/)
      .map((item) => item.trim())
      .filter((item) => item.length >= 2),
    ...matchedCompanyTerms,
  ]));

  const results = docs
    .filter((doc) => {
      if (specificMatchedTerms.length === 0) {
        return true;
      }
      return specificMatchedTerms.some((keyword) => doc.fileName.includes(keyword));
    })
    .flatMap((doc) => {
      const loweredFileName = doc.fileName.toLowerCase();
      const priorityBoost = scoreKeywordMatch(loweredFileName, COMPANY_DOC_PRIORITY_KEYWORDS) * 2;
      const penalty = scoreKeywordMatch(loweredFileName, NON_COMPANY_DOC_KEYWORDS) * 2;
      const matchedKeywordBoost = matchedCompanyTerms.reduce((score, keyword) => {
        return score + (loweredFileName.includes(keyword.toLowerCase()) ? 10 : 0);
      }, 0);
      const fileScore =
        scoreKeywordMatch(loweredFileName, terms) * 2 +
        priorityBoost +
        matchedKeywordBoost -
        penalty;
      const snippets = splitIntoSnippets(doc.content);

      return snippets.map((snippet) => {
        const score =
          fileScore +
          scoreKeywordMatch(snippet.toLowerCase(), terms) +
          scoreKeywordMatch(snippet.toLowerCase(), COMPANY_KEYWORDS) * (looksLikeCompanyQuestion(question) ? 1 : 0) +
          (snippet.toLowerCase().includes(normalizedQuestion) ? 8 : 0);

        return {
          fileName: doc.fileName,
          score,
          snippet: trimSnippet(snippet),
        };
      });
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return {
    results: results.slice(0, 8),
  };
}

export async function answerFromCompanyAssets(question: string): Promise<LocalKnowledgeAnswer | null> {
  const { results } = await searchCompanyKnowledge(question);
  if (results.length === 0) {
    return null;
  }

  const topResults = results.slice(0, 3);
  const lines = topResults.map(
    (item, index) => `${index + 1}. 来自《${item.fileName}》：${item.snippet}`
  );

  return {
    answer: `根据 assets 知识库，和“${question}”最相关的信息如下：\n${lines.join("\n")}`,
    suggestions: buildCompanySuggestions(question),
    source: "company_assets",
    documents: topResults.map((item) => ({
      fileName: item.fileName,
      score: item.score,
    })),
  };
}

export async function answerQuestionLocally(question: string): Promise<LocalKnowledgeAnswer> {
  if (!question.trim()) {
    return {
      answer: HUMAN_CONTACT_REPLY,
      suggestions: [],
      source: "fallback",
    };
  }

  const systemAnswer = answerFromSystemGuide(question);
  if (systemAnswer) {
    return systemAnswer;
  }

  if (looksLikeCompanyQuestion(question)) {
    const companyAnswer = await answerFromCompanyAssets(question);
    if (companyAnswer) {
      return companyAnswer;
    }
  }

  return {
    answer: HUMAN_CONTACT_REPLY,
    suggestions: [],
    source: "fallback",
  };
}

export function isLikelyCompanyQuestion(question: string): boolean {
  return looksLikeCompanyQuestion(question);
}
