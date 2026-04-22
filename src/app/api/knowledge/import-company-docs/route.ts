import { NextRequest, NextResponse } from "next/server";
import { KnowledgeClient, Config, KnowledgeDocument, DataSourceType } from "coze-coding-dev-sdk";
import { readFile } from "fs/promises";
import path from "path";

/**
 * 导入公司文档到知识库
 * 将assets目录下的公司介绍文件（PDF和PPTX）导入到知识库
 */
export async function POST(request: NextRequest) {
  try {
    console.log("[知识库导入] 开始导入公司文档...");

    // 初始化知识库客户端
    const config = new Config();
    const knowledgeClient = new KnowledgeClient(config);

    // 定义要导入的文件列表
    const filesToImport = [
      {
        name: "公司简介",
        path: "assets/公司简介.pptx",
        type: "pptx"
      },
      {
        name: "企业集团画册",
        path: "assets/企业集团画册.pdf",
        type: "pdf"
      },
      {
        name: "人康集团介绍-品牌合作、未来规划",
        path: "assets/1人康集团介绍-品牌合作、未来规划.pdf",
        type: "pdf"
      },
      {
        name: "人康集团介绍-企业发展史、大事件、企业荣誉",
        path: "assets/1人康集团介绍-企业发展史、大事件、企业荣誉.pdf",
        type: "pdf"
      },
      {
        name: "人康集团介绍-企业文化、公司架构、员工风采",
        path: "assets/1 人康集团介绍-企业文化、公司架构、员工风采.pdf",
        type: "pdf"
      }
    ];

    const documents: KnowledgeDocument[] = [];
    const importResults: Array<{ name: string; success: boolean; message: string }> = [];

    // 处理每个文件
    for (const file of filesToImport) {
      try {
        console.log(`[知识库导入] 处理文件: ${file.name} (${file.path})`);

        const filePath = path.join(process.cwd(), file.path);
        const buffer = await readFile(filePath);

        let content = "";

        if (file.type === "pdf") {
          // 使用 pdf2json 解析 PDF
          const PDFParser = await import('pdf2json');
          const pdfParser = new PDFParser.default(null, true);

          content = await new Promise<string>((resolve, reject) => {
            pdfParser.on('pdfParser_dataError', (errData: any) => {
              reject(errData.parserError);
            });

            pdfParser.on('pdfParser_dataReady', (pdfData: any) => {
              try {
                // 提取所有页面的文本
                let fullText = '';
                if (pdfData.Pages) {
                  for (const page of pdfData.Pages) {
                    if (page.Texts) {
                      for (const textItem of page.Texts) {
                        if (textItem.R && textItem.R.length > 0) {
                          for (const r of textItem.R) {
                            if (r.T) {
                              // 解码 Unicode 文本
                              let text = r.T;
                              try {
                                // 尝试解码十六进制编码的文本
                                text = decodeURIComponent(text);
                              } catch (e) {
                                // 如果解码失败，保留原始文本
                              }
                              fullText += text + ' ';
                            }
                          }
                        }
                      }
                    }
                    fullText += '\n';
                  }
                }

                if (!fullText || fullText.trim().length === 0) {
                  reject(new Error("PDF 文件为空或无法提取文本"));
                  return;
                }

                resolve(fullText.trim());
              } catch (error) {
                reject(error);
              }
            });

            pdfParser.parseBuffer(buffer);
          });
        } else if (file.type === "pptx") {
          // PPTX文件处理在Node.js环境中受限，暂时跳过
          // 可以使用 mammoth (针对Word) 或其他专门的PPTX解析库
          throw new Error("PPTX文件暂不支持自动导入，请转换为PDF格式");
        }

        // 清理和验证内容
        content = content.trim();
        if (content.length === 0) {
          throw new Error("文件内容为空");
        }

        console.log(`[知识库导入] ${file.name} 提取文本长度: ${content.length} 字符`);

        // 添加到文档列表
        documents.push({
          source: DataSourceType.TEXT,
          raw_data: `[${file.name}]\n\n${content}`,
        });

        importResults.push({
          name: file.name,
          success: true,
          message: `成功提取 ${content.length} 字符`
        });

      } catch (error) {
        console.error(`[知识库导入] 处理文件失败: ${file.name}`, error);
        importResults.push({
          name: file.name,
          success: false,
          message: error instanceof Error ? error.message : "未知错误"
        });
      }
    }

    // 批量导入到知识库
    console.log(`[知识库导入] 开始导入 ${documents.length} 个文档到知识库...`);

    if (documents.length === 0) {
      return NextResponse.json({
        success: false,
        error: "没有可导入的文档",
        results: importResults
      }, { status: 400 });
    }

    const addResponse = await knowledgeClient.addDocuments(
      documents,
      "company_docs", // 使用专门的数据集名称
      {
        separator: "\n\n",
        max_tokens: 2000,
        remove_extra_spaces: true,
        remove_urls_emails: false
      }
    );

    if (addResponse.code === 0) {
      console.log(`[知识库导入] 导入成功，文档 IDs: ${addResponse.doc_ids?.join(', ')}`);

      return NextResponse.json({
        success: true,
        message: `成功导入 ${documents.length} 个文档到知识库`,
        docIds: addResponse.doc_ids,
        results: importResults
      });
    } else {
      console.error(`[知识库导入] 导入失败: ${addResponse.msg}`);

      return NextResponse.json({
        success: false,
        error: addResponse.msg,
        results: importResults
      }, { status: 500 });
    }

  } catch (error) {
    console.error("[知识库导入] 处理异常:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "导入文档失败"
      },
      { status: 500 }
    );
  }
}
