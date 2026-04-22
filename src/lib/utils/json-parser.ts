/**
 * JSON 解析和修复工具
 * 用于解析和修复 LLM 返回的可能不规范的 JSON
 */

/**
 * 增强版 JSON 解析函数
 * 尝试多种方法解析 JSON，并自动修复常见错误
 */
export function safeJsonParse(content: string): any {
  console.log('🔧 开始增强版 JSON 解析...');
  console.log('📄 内容长度:', content.length);

  // 预处理：移除可能的外部文字，只保留 JSON 部分
  const trimmed = content.trim();

  // 尝试1：直接解析
  try {
    console.log('尝试1：直接解析...');
    const result = JSON.parse(trimmed);
    console.log('✅ 尝试1成功');
    return result;
  } catch (e) {
    console.log('❌ 尝试1失败:', (e as Error).message);
  }

  // 尝试2：提取 JSON 并修复常见错误
  try {
    console.log('尝试2：提取 JSON 并修复常见错误...');
    const jsonStr = extractJson(trimmed);
    if (jsonStr) {
      const fixedJson = fixCommonJsonErrors(jsonStr);
      const result = JSON.parse(fixedJson);
      console.log('✅ 尝试2成功');
      return result;
    }
  } catch (e) {
    console.log('❌ 尝试2失败:', (e as Error).message);
  }

  // 尝试3：处理 markdown 代码块
  try {
    console.log('尝试3：处理 markdown 代码块...');
    const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
    if (codeBlockMatch) {
      let jsonStr = codeBlockMatch[1].trim();
      jsonStr = fixCommonJsonErrors(jsonStr);
      const result = JSON.parse(jsonStr);
      console.log('✅ 尝试3成功');
      return result;
    }
  } catch (e) {
    console.log('❌ 尝试3失败:', (e as Error).message);
  }

  // 尝试4：使用边界索引提取并修复
  try {
    console.log('尝试4：使用边界索引提取并修复...');
    const startIdx = trimmed.indexOf('{');
    const endIdx = trimmed.lastIndexOf('}');
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      let jsonStr = trimmed.substring(startIdx, endIdx + 1);
      jsonStr = fixCommonJsonErrors(jsonStr);
      const result = JSON.parse(jsonStr);
      console.log('✅ 尝试4成功');
      return result;
    }
  } catch (e) {
    console.log('❌ 尝试4失败:', (e as Error).message);
  }

  // 尝试5：暴力修复（处理更严重的错误）
  try {
    console.log('尝试5：暴力修复 JSON...');
    const jsonStr = extractJson(trimmed);
    if (jsonStr) {
      const fixedJson = aggressiveJsonFix(jsonStr);
      const result = JSON.parse(fixedJson);
      console.log('✅ 尝试5成功');
      return result;
    }
  } catch (e) {
    console.log('❌ 尝试5失败:', (e as Error).message);
  }

  // 所有方法都失败，输出详细的错误信息
  console.log('🚨 所有方法均失败');
  console.log('原始内容前500字符:', trimmed.substring(0, 500));
  console.log('原始内容后500字符:', trimmed.substring(Math.max(0, trimmed.length - 500)));

  throw new Error(`无法解析 JSON 数据：${(JSON.parse(trimmed) as any).message}`);
}

/**
 * 提取 JSON 部分
 */
function extractJson(content: string): string | null {
  // 尝试匹配 JSON 对象
  const objectMatch = content.match(/\{[\s\S]*?\}/);
  if (objectMatch) {
    return objectMatch[0];
  }

  // 尝试匹配 JSON 数组
  const arrayMatch = content.match(/\[[\s\S]*?\]/);
  if (arrayMatch) {
    return arrayMatch[0];
  }

  return null;
}

/**
 * 修复常见的 JSON 错误
 */
function fixCommonJsonErrors(jsonStr: string): string {
  let fixed = jsonStr;

  // 1. 修复缺失的逗号（在数组元素之间）
  // 例如：[1 2 3] → [1, 2, 3]
  fixed = fixed.replace(/(\w+)\s+(\w+)/g, '$1, $2');
  fixed = fixed.replace(/(\])\s*(\[)/g, '$1, $2'); // ] [ → ], [

  // 2. 修复缺失的逗号（在对象属性之间）
  // 例如：{"a": 1 "b": 2} → {"a": 1, "b": 2}
  fixed = fixed.replace(/"\w+"\s*:\s*[^,}]+\s+"?\w+"?\s*:/g, (match) => match.replace(/\s+"?\w+"?\s*:/g, ', $&'));
  fixed = fixed.replace(/("\w+"\s*:\s*[^,}]+)\s+"/g, '$1, "$');

  // 3. 修复多余逗号
  // 例如：[1, 2, 3,] → [1, 2, 3]
  fixed = fixed.replace(/,\s*([\]}])/g, '$1');
  fixed = fixed.replace(/,(\s*[\]}])/g, '$1');

  // 4. 修复单引号
  // 例如：{'a': 1} → {"a": 1}
  fixed = fixed.replace(/'/g, '"');

  // 5. 修复未转义的引号
  // 例如：{"name": "John's car"} → {"name": "John's car"}
  // 注意：这个修复比较复杂，简单处理

  // 6. 修复注释（虽然 JSON 不支持注释，但 LLM 可能会添加）
  fixed = fixed.replace(/\/\/.*$/gm, '');
  fixed = fixed.replace(/\/\*[\s\S]*?\*\//g, '');

  // 7. 移除控制字符
  fixed = fixed.replace(/[\x00-\x1F\x7F]/g, '');

  // 8. 修复 trailing comma（对象或数组末尾的逗号）
  fixed = fixed.replace(/,\s*}/g, '}');
  fixed = fixed.replace(/,\s*\]/g, ']');

  // 9. 修复缺失的引号（在键名中）
  fixed = fixed.replace(/(\{)\s*([a-zA-Z_]\w*)\s*:/g, '$1"$2":');
  fixed = fixed.replace(/,\s*([a-zA-Z_]\w*)\s*:/g, ',"$1":');

  // 10. 修复布尔值和 null（未加引号）
  fixed = fixed.replace(/:\s*true/g, ': true');
  fixed = fixed.replace(/:\s*false/g, ': false');
  fixed = fixed.replace(/:\s*null/g, ': null');

  return fixed;
}

/**
 * 暴力修复 JSON（处理更严重的错误）
 */
function aggressiveJsonFix(jsonStr: string): string {
  let fixed = jsonStr;

  // 1. 修复所有可能的缺失逗号
  fixed = fixed.replace(/([}\]])\s*({\[])/g, '$1,$2');

  // 2. 修复对象属性之间的缺失逗号
  fixed = fixed.replace(/("\w+"\s*:\s*[^,}]+)\s+"/g, '$1, "$');

  // 3. 修复数组元素之间的缺失逗号
  fixed = fixed.replace(/([}\]])\s*([{\[])/g, '$1,$2');
  fixed = fixed.replace(/(\w+)\s+(\w+)/g, '$1,$2');

  // 4. 修复多余的逗号
  fixed = fixed.replace(/,(\s*[}\]])/g, '$1');
  fixed = fixed.replace(/,(\s*[}\]])/g, '$1');

  // 5. 移除所有注释
  fixed = fixed.replace(/\/\/.*$/gm, '');
  fixed = fixed.replace(/\/\*[\s\S]*?\*\//g, '');

  // 6. 转换单引号为双引号
  fixed = fixed.replace(/'/g, '"');

  // 7. 修复布尔值和 null
  fixed = fixed.replace(/:\s*"(true|false|null)"/g, ': $1');

  return fixed;
}

/**
 * 验证 JSON 格式是否正确
 */
export function validateJson(jsonStr: string): { valid: boolean; error?: string } {
  try {
    JSON.parse(jsonStr);
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: (error as Error).message
    };
  }
}

/**
 * 格式化 JSON（美化输出）
 */
export function formatJson(obj: any, indent: number = 2): string {
  return JSON.stringify(obj, null, indent);
}
