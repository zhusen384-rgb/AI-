import { NextRequest, NextResponse } from "next/server";
import * as mammoth from "mammoth";
import { exec, execFile } from "child_process";
import { promisify } from "util";
import { createCompatibleLlmClient } from "@/lib/ark-llm";
import { mapWithConcurrencyLimit } from "@/lib/concurrency";
import { extractContactInfoFromText, ResumeContactInfo } from "@/lib/resume-contact-info";
import { getResumeVisionModel } from "@/lib/ai-models";
import { buildResumeExtractCacheKey, getOrCreateExtractCache } from "@/lib/resume-pipeline-cache";
import { registerExtractResumeFromBuffer } from "@/lib/resume-helper-registry";
import {
  getResumeContentType,
  readResumeFileByKey,
} from "@/lib/resume-storage";

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
const binaryPathCache = new Map<string, string>();

async function resolveBinaryPath(command: "pdftotext" | "pdftoppm"): Promise<string> {
  const cachedPath = binaryPathCache.get(command);
  if (cachedPath) {
    return cachedPath;
  }

  const fs = await import("fs/promises");
  const envOverride =
    command === "pdftotext" ? process.env.PDFTOTEXT_PATH : process.env.PDFTOPPM_PATH;

  const candidatePaths = [
    envOverride,
    `/opt/homebrew/bin/${command}`,
    `/usr/local/bin/${command}`,
    `/usr/bin/${command}`,
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidatePaths) {
    try {
      await fs.access(candidate);
      binaryPathCache.set(command, candidate);
      return candidate;
    } catch {}
  }

  try {
    const { stdout } = await execAsync(`command -v ${command}`);
    const resolvedPath = stdout.trim();

    if (resolvedPath) {
      binaryPathCache.set(command, resolvedPath);
      return resolvedPath;
    }
  } catch {}

  throw new Error(
    `未找到 ${command} 可执行文件，请安装 poppler（brew install poppler）或设置 ${
      command === "pdftotext" ? "PDFTOTEXT_PATH" : "PDFTOPPM_PATH"
    }`
  );
}

/**
 * 从 PNG Buffer 中解析图片尺寸
 * PNG 文件格式：前8字节是签名，然后是 IHDR 块（包含宽高信息）
 */
async function getImageDimensions(buffer: Buffer): Promise<{ width: number; height: number }> {
  // PNG 签名：89 50 4E 47 0D 0A 1A 0A
  if (buffer.length < 24) {
    throw new Error("无效的 PNG 文件");
  }
  
  // 跳过 PNG 签名（8字节）
  // IHDR 块格式：长度(4) + 类型(4) + 数据(13) + CRC(4)
  // 数据部分：宽度(4) + 高度(4) + 位深度(1) + 颜色类型(1) + 压缩方法(1) + 滤波方法(1) + 隔行扫描(1)
  
  const width = buffer.readUInt32BE(16);  // 宽度在字节 16-19
  const height = buffer.readUInt32BE(20); // 高度在字节 20-23
  
  return { width, height };
}

function isReadablePdfText(params: {
  text: string;
  chineseRatio: number;
  garbageRatio: number;
}): boolean {
  const compactText = params.text.replace(/\s+/g, "");

  if (compactText.length < 80) {
    return false;
  }

  if (params.garbageRatio > 0.18) {
    return false;
  }

  if (params.chineseRatio < 0.01 && !/[A-Za-z]/.test(params.text) && !/\d/.test(params.text)) {
    return false;
  }

  return true;
}

// 最大允许像素数：3600万像素（LLM API限制）
const MAX_PIXELS = 36000000;

interface ResumeExtractPayload {
  fileKey?: string;
  fileName?: string;
}

async function loadResumeFileFromRequest(request: NextRequest): Promise<{
  buffer: Buffer;
  fileName: string;
  fileType: string;
  fileSize: number;
  fileKey?: string;
}> {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const payload = await request.json() as ResumeExtractPayload;

    if (!payload.fileKey) {
      throw new Error("缺少 fileKey");
    }

    console.log(`[简历解析] 从对象存储读取文件: ${payload.fileKey}`);

    const buffer = await readResumeFileByKey(payload.fileKey);
    const resolvedFileName = payload.fileName || payload.fileKey.split("/").pop() || "resume";

    return {
      buffer,
      fileName: resolvedFileName,
      fileType: getResumeContentType(resolvedFileName),
      fileSize: buffer.length,
      fileKey: payload.fileKey,
    };
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    throw new Error("请选择要提取的文件");
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  return {
    buffer,
    fileName: file.name,
    fileType: file.type,
    fileSize: file.size,
    fileKey: undefined,
  };
}

/**
 * 文本后处理函数 - 清理和格式化提取的文本
 * 解决乱码和格式问题
 */
function cleanAndFormatText(text: string): string {
  if (!text || text.trim().length === 0) {
    return text;
  }

  let cleaned = text;

  // 1. 移除常见的乱码字符和不可见字符
  // 移除零宽字符
  cleaned = cleaned.replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '');
  
  // 2. 修复常见的编码错误导致的乱码
  // 例如：正确的中文字符被错误编码
  const encodingFixes: [RegExp, string][] = [
    // 修复常见的编码错误
    [/\ufffd/g, ''], // 替换字符（乱码标记）
    [/\ufeff/g, ''], // BOM标记
    [/\u2014/g, '\u2014'], // 长破折号（保持原样）
    [/\u2013/g, '\u2013'], // 短破折号（保持原样）
    [/\u2018/g, '\u2018'], // 左单引号
    [/\u2019/g, '\u2019'], // 右单引号
    [/\u201c/g, '\u201c'], // 左双引号
    [/\u201d/g, '\u201d'], // 右双引号
    [/\u2026/g, '\u2026'], // 省略号
  ];

  for (const [pattern, replacement] of encodingFixes) {
    cleaned = cleaned.replace(pattern, replacement);
  }

  // 3. 规范化空白字符
  // 将多个连续空格替换为单个空格（保留换行）
  cleaned = cleaned.replace(/[^\S\n]+/g, ' ');
  // 移除行首行尾空格
  cleaned = cleaned.split('\n').map(line => line.trim()).join('\n');
  // 将超过2个连续换行替换为2个（保持段落分隔）
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  // 4. 修复常见的格式问题
  // 修复日期格式（如 2020.09-2023.06 可能被识别为 2020. 09-2023. 06）
  cleaned = cleaned.replace(/(\d{4})\.\s*(\d{2})\s*[-–—]\s*(\d{4})\.\s*(\d{2})/g, '$1.$2-$3.$4');
  // 修复电话号码格式
  cleaned = cleaned.replace(/(\d{3})\s*[-–—]\s*(\d{4})\s*[-–—]\s*(\d{4})/g, '$1-$2-$3');
  // 修复邮箱格式（移除多余空格）
  cleaned = cleaned.replace(/(\S+)\s*@\s*(\S+)/g, '$1@$2');

  // 5. 移除页码和页眉页脚干扰
  cleaned = cleaned.replace(/^\s*第?\s*\d+\s*页?\s*$/gm, ''); // 移除页码行
  cleaned = cleaned.replace(/^\s*\d+\s*\/\s*\d+\s*$/gm, ''); // 移除页码（如 1/3）

  // 6. 最终清理
  cleaned = cleaned.trim();

  console.log(`[文本后处理] 原始长度: ${text.length}, 清理后长度: ${cleaned.length}`);

  return cleaned;
}

// 使用系统级 pdftotext 工具解析 PDF
async function parsePdf(buffer: Buffer): Promise<{ text: string; chineseRatio: number; garbageRatio: number; lineCount: number }> {
  console.log("[PDF解析] 开始使用 pdftotext 解析 PDF");

  try {
    const pdftotextPath = await resolveBinaryPath("pdftotext");

    // 创建临时文件路径
    const tempPdfPath = `/tmp/resume-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.pdf`;
    const fs = await import('fs/promises');
    await fs.writeFile(tempPdfPath, buffer);

    console.log(`[PDF解析] PDF 文件已写入: ${tempPdfPath}, 大小: ${buffer.length} bytes`);

    // 尝试多种编码方式解析 PDF
    const encodings = ['UTF-8', 'GB18030', 'GBK', 'Latin1'] as const;
    let textContent = '';
    let lastError: Error | null = null;
    const readEncodings: BufferEncoding[] = ['utf8', 'latin1', 'binary', 'ascii'];

    for (const encoding of encodings) {
      try {
        console.log(`[PDF解析] 尝试使用 ${encoding} 编码解析...`);

        // 直接输出到 stdout，避免落盘 txt 文件造成额外 IO
        const execResult = await execFileAsync(
          pdftotextPath,
          ["-layout", "-enc", encoding, tempPdfPath, "-"],
          {
            maxBuffer: 10 * 1024 * 1024,
            encoding: "buffer",
          }
        );
        const stdoutBuffer = Buffer.isBuffer(execResult.stdout)
          ? execResult.stdout
          : Buffer.from(execResult.stdout || "");
        const stderrText = Buffer.isBuffer(execResult.stderr)
          ? execResult.stderr.toString("utf8")
          : String(execResult.stderr || "");

        console.log(`[PDF解析] pdftotext 执行完成 (${encoding}), stderr: ${stderrText}`);

        if (stdoutBuffer.length === 0) {
          console.log(`[PDF解析] 输出内容为空 (${encoding})，尝试下一个编码`);
          continue;
        }

        let readSuccess = false;

        for (const readEncoding of readEncodings) {
          try {
            const decodedText = stdoutBuffer.toString(readEncoding);

            // 检查是否有乱码（检测是否包含大量不可打印字符）
            const garbageChars = decodedText.match(/[^\x20-\x7E\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef\s\r\n\t]/g);
            const garbageRatio = garbageChars ? garbageChars.length / decodedText.length : 0;

            // 如果乱码比例超过 10%，说明编码不对
            if (garbageRatio > 0.1) {
              console.log(`[PDF解析] 使用 ${readEncoding} 读取时乱码比例过高: ${(garbageRatio * 100).toFixed(2)}%，尝试下一个读取编码`);
              continue;
            }

            // 检查中文字符比例（简历应该有一定比例的中文）
            const chineseChars = decodedText.match(/[\u4e00-\u9fa5]/g);
            const chineseRatio = chineseChars ? chineseChars.length / decodedText.length : 0;

            console.log(`[PDF解析] 使用 ${readEncoding} 读取成功，中文比例: ${(chineseRatio * 100).toFixed(2)}%，乱码比例: ${(garbageRatio * 100).toFixed(2)}%`);

            textContent = decodedText;
            readSuccess = true;
            break;
          } catch {
            console.log(`[PDF解析] 使用 ${readEncoding} 读取失败，尝试下一个读取编码`);
            continue;
          }
        }

        if (readSuccess && textContent.trim().length > 0) {
          console.log(`[PDF解析] 使用 ${encoding} 编码解析成功`);
          break;
        }
      } catch (error) {
        console.log(`[PDF解析] 使用 ${encoding} 编码解析失败:`, error);
        lastError = error as Error;
        continue;
      }
    }

    // 清理临时 PDF 文件
    await fs.unlink(tempPdfPath).catch((err) => console.log(`[PDF解析] 清理PDF文件失败: ${err}`));

    if (!textContent || textContent.trim().length === 0) {
      console.error(`[PDF解析] 所有编码方式都未能成功提取文本`);
      throw new Error(`PDF解析失败: ${lastError ? lastError.message : '所有编码方式都未能成功提取文本'}`);
    }

    console.log(`[PDF解析] 解析完成，总共提取 ${textContent.trim().length} 个字符`);
    console.log(`[PDF解析] 提取的内容预览（前500字符）: ${textContent.trim().substring(0, 500)}`);

    // 检查内容是否主要是乱码
    const chineseChars = textContent.match(/[\u4e00-\u9fa5]/g);
    const chineseRatio = chineseChars ? chineseChars.length / textContent.length : 0;
    console.log(`[PDF解析] 中文字符比例: ${(chineseRatio * 100).toFixed(2)}%`);

    if (chineseRatio < 0.1 && textContent.length > 100) {
      console.warn(`[PDF解析] ⚠️ 警告：中文字符比例过低（${(chineseRatio * 100).toFixed(2)}%），可能是乱码或扫描件`);
      console.log(`[PDF解析] 将尝试使用 LLM 视觉能力重新解析...`);
      // 不抛出错误，让调用者决定是否使用备用方案
    }

    const trimmedText = textContent.trim();
    const trimmedLength = trimmedText.length || 1;
    const garbageChars = trimmedText.match(/[^\x20-\x7E\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef\s\r\n\t]/g);
    const garbageRatio = garbageChars ? garbageChars.length / trimmedLength : 0;
    const lineCount = trimmedText.split(/\n+/).map((line) => line.trim()).filter(Boolean).length;

    return { text: trimmedText, chineseRatio, garbageRatio, lineCount };
  } catch (error) {
    console.error("[PDF解析] 解析失败:", error);
    throw new Error(`PDF解析失败: ${error instanceof Error ? error.message : '未知错误'}`);
  }
}

// 使用 LLM 视觉能力解析 PDF（主方案 - 对中文简历效果最好）

async function parsePdfWithVision(buffer: Buffer, maxPages: number = 3): Promise<{ text: string }> {
  console.log("[PDF视觉解析] 开始使用 LLM 视觉能力解析 PDF");

  const pdftoppmPath = await resolveBinaryPath("pdftoppm");
  const tempPdfPath = `/tmp/resume-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.pdf`;
  const tempImageDir = `/tmp/pdf-images-${Date.now()}`;
  const fs = await import("fs/promises");

  await fs.writeFile(tempPdfPath, buffer);
  await fs.mkdir(tempImageDir, { recursive: true });

  try {
    console.log(`[PDF视觉解析] PDF 文件已写入: ${tempPdfPath}`);

    // 使用 pdftoppm 将 PDF 转换为 PNG 图片（支持多页）
    const endPage = Math.min(maxPages, 10);

    const resolutions = [150, 120, 100, 72];
    let successResolution = 0;
    let lastError: Error | null = null;
    let imageFiles: string[] = [];

    for (const resolution of resolutions) {
      try {
        console.log(`[PDF视觉解析] 尝试使用 ${resolution} dpi 分辨率...`);

        const { stderr } = await execFileAsync(
          pdftoppmPath,
          ["-png", "-f", "1", "-l", String(endPage), "-r", String(resolution), tempPdfPath, `${tempImageDir}/page`],
          { maxBuffer: 100 * 1024 * 1024 }
        );

        console.log(`[PDF视觉解析] PDF 转图片完成 (${resolution} dpi), stderr: ${stderr}`);

        const files = await fs.readdir(tempImageDir);
        const currentImageFiles = files.filter((f) => f.endsWith(".png")).sort();

        if (currentImageFiles.length === 0) {
          throw new Error("未能从 PDF 生成图片");
        }

        let exceedsLimit = false;
        for (const imageFile of currentImageFiles) {
          const imagePath = `${tempImageDir}/${imageFile}`;
          const imageBuffer = await fs.readFile(imagePath);
          const { width, height } = await getImageDimensions(imageBuffer);
          const pixels = width * height;

          console.log(`[PDF视觉解析] 图片 ${imageFile}: ${width}x${height} = ${pixels} 像素`);

          if (pixels > MAX_PIXELS) {
            console.log(`[PDF视觉解析] 图片超过限制 (${pixels} > ${MAX_PIXELS})，需要降低分辨率`);
            exceedsLimit = true;
            break;
          }
        }

        if (exceedsLimit) {
          for (const f of currentImageFiles) {
            await fs.unlink(`${tempImageDir}/${f}`).catch(() => {});
          }
          continue;
        }

        successResolution = resolution;
        imageFiles = currentImageFiles;
        break;
      } catch (error) {
        lastError = error as Error;
        console.log(`[PDF视觉解析] 使用 ${resolution} dpi 失败:`, error);
      }
    }

    if (imageFiles.length === 0) {
      throw new Error(`未能从 PDF 生成合适的图片: ${lastError?.message || "未知错误"}`);
    }

    console.log(`[PDF视觉解析] 成功使用 ${successResolution} dpi，生成了 ${imageFiles.length} 张图片`);

    const resumeVisionModelId = getResumeVisionModel();
    console.log(`[PDF视觉解析] 使用视觉模型: ${resumeVisionModelId}`);

    const client = createCompatibleLlmClient();
    const pageTexts = await mapWithConcurrencyLimit(
      imageFiles,
      Math.min(2, imageFiles.length),
      async (imageFile, index) => {
        const imagePath = `${tempImageDir}/${imageFile}`;
        const imageBuffer = await fs.readFile(imagePath);
        const base64Image = imageBuffer.toString("base64");
        const dataUri = `data:image/png;base64,${base64Image}`;

        console.log(`[PDF视觉解析] 处理第 ${index + 1}/${imageFiles.length} 页，图片大小: ${imageBuffer.length} bytes`);

        const messages = [
          {
            role: "system" as const,
            content: `你是一个专业的简历文本提取助手。请从简历图片中精确提取所有可见的文本内容。

## 要求：
1. **保持原有格式**：严格按照图片中的排版顺序提取文本
2. **完整提取**：不要遗漏任何文字，包括联系方式、技能标签等
3. **正确换行**：保持原有的段落和换行结构
4. **处理表格**：如果遇到表格，按从上到下、从左到右的顺序提取
5. **识别日期**：正确识别各种日期格式（如 2020.09-2023.06）
6. **不要添加**：只提取原文，不要添加任何解释、说明或格式化标记`,
          },
          {
            role: "user" as const,
            content: [
              {
                type: "text" as const,
                text: `请从这张简历图片中提取所有文本内容。这是简历的第 ${index + 1} 页，共 ${imageFiles.length} 页。请严格按照图片中的排版顺序提取，保持原有格式。`,
              },
              {
                type: "image_url" as const,
                image_url: {
                  url: dataUri,
                  detail: "high" as const,
                },
              },
            ],
          },
        ];

        try {
          const response = await client.invoke(messages, {
            model: resumeVisionModelId,
            temperature: 0.1,
          });

          console.log(`[PDF视觉解析] 第 ${index + 1} 页提取完成，内容长度: ${response.content.length}`);
          return response.content.trim();
        } finally {
          await fs.unlink(imagePath).catch((err) => console.log("[PDF视觉解析] 清理图片文件失败:", err));
        }
      }
    );

    const finalText = pageTexts.join("\n\n--- 第N页分割线 ---\n\n").trim();
    console.log(`[PDF视觉解析] 所有页面提取完成，总内容长度: ${finalText.length}`);
    console.log(`[PDF视觉解析] 提取的内容预览（前300字符）: ${finalText.substring(0, 300)}`);

    return { text: finalText };
  } catch (error) {
    console.error("[PDF视觉解析] 解析失败:", error);
    throw new Error(`PDF视觉解析失败: ${error instanceof Error ? error.message : '未知错误'}`);
  } finally {
    await fs.rm(tempImageDir, { recursive: true, force: true }).catch((err) =>
      console.log("[PDF视觉解析] 清理图片目录失败:", err)
    );
    await fs.unlink(tempPdfPath).catch((err) => console.log("[PDF视觉解析] 清理PDF文件失败:", err));
  }
}

function normalizeResumeFileType(fileName: string, fileType: string): string {
  const normalizedFileName = fileName.toLowerCase();
  let actualFileType = fileType;

  if (!actualFileType || actualFileType === "application/octet-stream") {
    if (normalizedFileName.endsWith(".pdf")) {
      actualFileType = "application/pdf";
    } else if (normalizedFileName.endsWith(".docx")) {
      actualFileType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    } else if (normalizedFileName.endsWith(".doc")) {
      actualFileType = "application/msword";
    } else if (normalizedFileName.endsWith(".txt")) {
      actualFileType = "text/plain";
    } else if (normalizedFileName.endsWith(".xml")) {
      actualFileType = "text/xml";
    } else if (normalizedFileName.endsWith(".rtf")) {
      actualFileType = "application/rtf";
    } else if (
      normalizedFileName.endsWith(".png") ||
      normalizedFileName.endsWith(".jpg") ||
      normalizedFileName.endsWith(".jpeg") ||
      normalizedFileName.endsWith(".gif") ||
      normalizedFileName.endsWith(".webp")
    ) {
      actualFileType = `image/${normalizedFileName.split(".").pop()}`;
    }
    console.log(`[简历解析] 根据扩展名判断文件类型: ${actualFileType}`);
  }

  return actualFileType;
}

async function extractResumeFromBuffer(params: {
  buffer: Buffer;
  fileName: string;
  fileType: string;
  fileSize: number;
  fileKey?: string;
}): Promise<{
  success: true;
  content: string;
  detectedInfo: ResumeContactInfo;
}> {
  const cacheKey = buildResumeExtractCacheKey(params);
  const cachedContent = await getOrCreateExtractCache(cacheKey, async () => {
    let content = "";
    const actualFileType = normalizeResumeFileType(params.fileName, params.fileType);

    if (actualFileType.startsWith("image/")) {
      console.log("[简历解析] 检测到图片格式，使用 LLM 视觉能力提取");
      const base64Image = params.buffer.toString("base64");
      const dataUri = `data:${actualFileType};base64,${base64Image}`;
      const client = createCompatibleLlmClient();
      const resumeVisionModelId = getResumeVisionModel();

      console.log(`[简历解析] 使用视觉模型: ${resumeVisionModelId}`);

      const messages = [
        {
          role: "system" as const,
          content: `你是一个专业的简历文本提取助手。请从简历图片中精确提取所有可见的文本内容。

## 要求：
1. **保持原有格式**：严格按照图片中的排版顺序提取文本
2. **完整提取**：不要遗漏任何文字，包括联系方式、技能标签等
3. **正确换行**：保持原有的段落和换行结构
4. **处理表格**：如果遇到表格，按从上到下、从左到右的顺序提取
5. **识别日期**：正确识别各种日期格式（如 2020.09-2023.06）
6. **不要添加**：只提取原文，不要添加任何解释、说明或格式化标记`,
        },
        {
          role: "user" as const,
          content: [
            {
              type: "text" as const,
              text: "请从这张简历图片中提取所有文本内容，严格按照图片中的排版顺序，保持原有格式。",
            },
            {
              type: "image_url" as const,
              image_url: {
                url: dataUri,
                detail: "high" as const,
              },
            },
          ],
        },
      ];

      const response = await client.invoke(messages, {
        model: resumeVisionModelId,
        temperature: 0.1,
      });

      content = response.content;
      console.log(`[简历解析] LLM 视觉提取完成，内容长度: ${content.length}`);
    } else if (actualFileType === "application/pdf") {
      console.log("[简历解析] 检测到 PDF 格式，优先使用文本解析，视觉解析作为兜底");
      let textExtraction: Awaited<ReturnType<typeof parsePdf>> | null = null;

      try {
        textExtraction = await parsePdf(params.buffer);
        if (isReadablePdfText(textExtraction)) {
          content = textExtraction.text;
          console.log("[简历解析] PDF 文本解析质量良好，直接使用文本结果");
        } else {
          console.log(
            `[简历解析] PDF 文本解析质量不足，准备使用视觉解析（中文比例 ${(textExtraction.chineseRatio * 100).toFixed(2)}%，乱码比例 ${(textExtraction.garbageRatio * 100).toFixed(2)}%）`
          );
        }
      } catch (textError) {
        console.error("[简历解析] PDF 文本解析失败，准备使用视觉解析:", textError);
      }

      if (!content) {
        try {
          const { text } = await parsePdfWithVision(params.buffer);
          content = text;
          console.log("[简历解析] LLM 视觉解析成功");
        } catch (visionError) {
          console.error("[简历解析] LLM 视觉解析失败，尝试使用 pdftotext:", visionError);
          if (textExtraction?.text?.trim()) {
            content = textExtraction.text;
            console.log("[简历解析] 回退到 pdftotext 解析结果");
          } else {
            throw new Error("PDF解析失败: 视觉解析和文本提取都无法完成");
          }
        }
      }
    } else if (
      actualFileType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      actualFileType === "application/msword"
    ) {
      console.log("[简历解析] 检测到 Word 格式，使用 mammoth 解析");
      try {
        const result = await mammoth.extractRawText({ buffer: params.buffer });
        content = result.value;
        console.log(`[简历解析] Word 解析完成，内容长度: ${content.length}`);
      } catch (error) {
        console.error("[简历解析] Word文档解析失败:", error);
        throw new Error("Word文档解析失败，请将文档另存为.docx格式或手动复制内容");
      }
    } else if (
      actualFileType === "text/plain" ||
      actualFileType === "text/xml" ||
      actualFileType === "application/xml" ||
      actualFileType === "application/rtf"
    ) {
      console.log("[简历解析] 检测到文本格式，直接读取");
      content = params.buffer.toString("utf-8");

      if (actualFileType === "application/rtf") {
        content = content
          .replace(/\\[a-z]+\d*/g, "")
          .replace(/[{}]/g, "")
          .replace(/\\u\d+\?/g, "")
          .replace(/\s+/g, " ")
          .trim();
      }
      console.log(`[简历解析] 文本解析完成，内容长度: ${content.length}`);
    } else {
      console.error(`[简历解析] 不支持的文件格式: ${actualFileType} (原始: ${params.fileType}, 文件名: ${params.fileName})`);
      throw new Error(
        `不支持的文件格式: ${params.fileName.endsWith(".") ? params.fileName.split(".").pop() : actualFileType}，支持的格式包括：图片(png/jpg/jpeg)、PDF、Word文档(doc/docx)、文本文件(txt)`
      );
    }

    if (!content || content.trim().length === 0) {
      console.error("[简历解析] 提取的内容为空");
      throw new Error("未能从文件中提取到内容，请检查文件是否有效");
    }

    const cleanedContent = cleanAndFormatText(content);
    console.log(`[简历解析] 解析成功: 原始 ${content.trim().length} 字符，清理后 ${cleanedContent.length} 字符`);

    return {
      success: true as const,
      content: cleanedContent,
    };
  });

  const detectedInfo: ResumeContactInfo = extractContactInfoFromText(cachedContent.content, {
    fileName: params.fileName,
  });

  console.log("[简历解析] 检测到的联系信息:", detectedInfo);

  return {
    success: true as const,
    content: cachedContent.content,
    detectedInfo,
  };
}

registerExtractResumeFromBuffer(extractResumeFromBuffer);

export async function POST(request: NextRequest) {
  console.log("[简历解析] 开始处理简历提取请求");
  try {
    const { buffer, fileName, fileType, fileSize, fileKey } = await loadResumeFileFromRequest(request);

    console.log(`[简历解析] 文件信息: name=${fileName}, type=${fileType}, size=${fileSize} bytes`);
    const response = await extractResumeFromBuffer({
      buffer,
      fileName,
      fileType,
      fileSize,
      fileKey,
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error("[简历解析] 简历内容提取失败:", error);
    const message = error instanceof Error ? error.message : "未知错误";
    return NextResponse.json(
      {
        success: false,
        error: `文本提取失败: ${message}`,
      },
      {
        status:
          message.includes("不支持的文件格式") ||
          message.includes("未能从文件中提取到内容") ||
          message.includes("Word文档解析失败") ||
          message.includes("PDF解析失败")
            ? 400
            : 500,
      }
    );
  }
}
