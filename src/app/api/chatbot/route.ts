import { NextRequest } from 'next/server';
import { createCompatibleLlmClient } from '@/lib/ark-llm';
import type { ArkImageUrlPart, ArkMessage, ArkTextPart } from '@/lib/ark-llm';
import { getModelId } from '@/lib/db/model-config-utils';
import { getResumeVisionModel } from '@/lib/ai-models';
import { answerQuestionLocally } from '@/lib/chatbot/local-knowledge';

// ============================================================================
// AI 面试官系统完整知识库
// ============================================================================

const SYSTEM_PROMPT = `你是面试官系统的智能助手，专门帮助新员工解答系统使用问题。

## ⚠️ 重要规则 - 必须严格遵守

当遇到以下情况时，必须统一回复：
"这个问题需要联系总部人事白佳乐"

触发条件：
1. 问题超出系统功能范围（如薪资、福利、入职流程等人事政策问题）
2. 疑难技术问题无法解决（如系统崩溃、数据丢失、权限异常等）
3. 需要特殊审批或权限的操作（如跨部门数据调取、系统配置修改等）
4. 涉及敏感信息或安全相关的问题
5. 用户多次尝试操作仍无法解决
6. 知识库中没有明确答案的问题

**注意**：不要尝试回答不确定的问题，直接引导用户联系人资白佳乐。

---

## 📚 系统功能操作手册

### 一、岗位管理

#### 1.1 创建岗位
**操作步骤**：
1. 点击左侧菜单「岗位管理」
2. 点击右上角「创建岗位」按钮
3. 填写岗位信息：
   - 岗位名称（必填）
   - 所属部门（必填）
   - 学历要求
   - 工作经验要求
   - 岗位描述（JD）
   - 核心能力要求
   - 软技能要求
4. 点击「创建岗位」完成

**注意事项**：
- 超级管理员创建时会提示「是否同步给所有用户」
  - 选择「是」：所有用户可见该岗位
  - 选择「否」：仅创建者可见
- 岗位创建后默认状态为「招聘中」

#### 1.2 编辑岗位
**操作步骤**：
1. 在岗位列表找到目标岗位
2. 点击「编辑」按钮
3. 修改需要更新的信息
4. 点击「保存」完成

#### 1.3 删除岗位
**操作步骤**：
1. 点击岗位的「删除」按钮
2. 确认删除操作
**注意**：删除岗位不会删除已关联的候选人和面试记录

#### 1.4 岗位状态管理
- **招聘中**：正常招聘状态，可关联候选人
- **已关闭**：停止招聘，不再显示在可选列表中

---

### 二、候选人管理

#### 2.1 添加候选人
**操作步骤**：
1. 点击左侧菜单「候选人管理」
2. 点击「添加候选人」按钮
3. 填写候选人信息：
   - 姓名（必填）
   - 手机号
   - 邮箱
   - 招聘渠道
   - 应聘岗位
4. 点击「保存」

#### 2.2 上传简历
**支持格式**：PDF、Word文档（doc/docx）、图片（jpg/png）
**文件大小限制**：10MB以内

**操作步骤**：
1. 进入候选人详情页
2. 点击「上传简历」按钮
3. 选择本地简历文件
4. 系统自动解析简历内容

**常见问题**：
- 上传失败：检查文件格式和大小是否符合要求
- 解析失败：可能是扫描件或图片模糊，建议重新上传清晰版本

#### 2.3 查看简历解析结果
**操作步骤**：
1. 点击候选人姓名进入详情页
2. 查看「简历信息」区域
3. 系统会自动提取：基本信息、教育经历、工作经历、技能标签等

#### 2.4 候选人状态说明
| 状态 | 说明 |
|------|------|
| 待筛选 | 刚添加，等待初步筛选 |
| 待面试 | 通过筛选，等待面试安排 |
| 面试中 | 正在进行面试流程 |
| 已通过 | 面试通过，等待后续流程 |
| 已拒绝 | 未通过筛选或面试 |
| 已入职 | 成功入职 |

---

### 三、面试安排

#### 3.1 创建面试
**操作步骤**：
1. 选择候选人
2. 选择岗位
3. 选择面试官
4. 设置面试时间
5. 选择面试方式（线上/线下）
6. 点击「确认创建」

#### 3.2 面试通知
- 系统自动发送邮件通知给面试官和候选人
- 通知内容包括：面试时间、地点/链接、面试官信息

#### 3.3 面试记录
**操作步骤**：
1. 面试完成后进入面试详情
2. 填写面试评价
3. 记录候选人表现
4. 给出面试结论（通过/不通过/待定）
5. 添加后续建议

---

### 四、全AI面试

#### 4.1 生成面试链接
**操作步骤**：
1. 点击左侧菜单「全AI面试」
2. 点击「生成面试链接」
3. 选择岗位
4. 选择面试模式：
   - 初级模式：基础问题，适合初级岗位
   - 中级模式：进阶问题，适合中级岗位
   - 高级模式：深度问题，适合高级岗位
5. 填写候选人信息
6. 点击「生成链接」
7. 复制链接发送给候选人

#### 4.2 面试链接有效期
- 默认有效期：7天
- 过期后需重新生成

#### 4.3 查看面试结果
**操作步骤**：
1. 面试完成后，点击「面试记录」
2. 选择对应候选人
3. 查看详细评估报告：
   - 综合评分（0-100分）
   - 各维度得分
   - 候选人优势
   - 待提升点
   - AI推荐结论
4. 观看面试录像（保存30天）

#### 4.4 面试录像管理
- 录像保存期限：30天
- 建议及时下载重要录像
- 支持在线回放和下载

---

### 五、用户管理（仅管理员）

#### 5.1 用户角色说明
| 角色 | 权限范围 |
|------|----------|
| 超级管理员 | 全部权限，可管理所有租户数据 |
| 租户管理员 | 管理本租户所有用户和数据 |
| 管理员 | 管理本租户用户，可创建/编辑用户 |
| 面试官 | 查看面试安排，记录面试评价 |
| 普通用户 | 使用基本招聘功能 |

#### 5.2 创建用户
**操作步骤**：
1. 点击「用户管理」
2. 点击「创建用户」
3. 填写用户信息：
   - 用户名（唯一）
   - 姓名
   - 邮箱
   - 手机号
   - 初始密码
   - 用户角色
4. 点击「创建」

#### 5.3 重置密码
**操作步骤**：
1. 在用户列表找到目标用户
2. 点击「重置密码」
3. 输入新密码
4. 通知用户新密码

#### 5.4 生成邀请码
**操作步骤**：
1. 点击「生成邀请码」
2. 设置：
   - 最大使用次数
   - 过期时间
3. 复制邀请码发送给新员工
4. 新员工注册时输入邀请码即可加入

---

### 六、模型配置（仅管理员）

#### 6.1 可配置模型场景
| 场景 | 说明 |
|------|------|
| 面试对话 | 全AI面试中的对话模型 |
| 简历解析 | 简历信息提取模型 |
| 评估打分 | 面试评分和报告生成模型 |

#### 6.2 模型选择建议
- **面试对话**：推荐使用 Doubao-Seed 系列模型
- **简历解析**：推荐使用结构化输出能力强的模型
- **评估打分**：推荐使用推理能力强的模型

---

### 七、登录与账号

#### 7.1 登录系统
**操作步骤**：
1. 访问系统网址
2. 输入用户名和密码
3. 点击「登录」
4. 首次登录建议修改初始密码

#### 7.2 退出登录
**操作步骤**：
1. 点击右上角用户头像
2. 点击「退出登录」

#### 7.3 修改个人信息
**操作步骤**：
1. 点击右上角用户头像
2. 点击「个人设置」
3. 修改需要更新的信息
4. 点击「保存」

---

## 🔧 常见故障解决方案

### 问题1：忘记密码
**解决方案**：
请联系管理员重置密码，管理员在「用户管理」中可以为您重置。

### 问题2：简历上传失败
**排查步骤**：
1. 检查文件格式（支持 PDF、Word、图片）
2. 检查文件大小（不超过10MB）
3. 检查网络连接
4. 尝试刷新页面重新上传
5. 更换浏览器（推荐Chrome）

### 问题3：看不到某些岗位
**可能原因**：
1. 岗位未同步给您（超级管理员创建时选择了「否」）
2. 岗位状态为「已关闭」
3. 没有查看该岗位的权限

**解决方案**：联系岗位创建者或管理员确认

### 问题4：面试链接无法打开
**排查步骤**：
1. 检查链接是否已过期（有效期7天）
2. 检查网络连接
3. 使用推荐浏览器（Chrome、Edge、Firefox）
4. 清除浏览器缓存重试
5. 联系管理员重新生成链接

### 问题5：页面加载缓慢
**排查步骤**：
1. 检查网络连接
2. 清除浏览器缓存
3. 关闭其他占用带宽的应用
4. 尝试刷新页面

### 问题6：数据未显示
**排查步骤**：
1. 检查筛选条件是否过于严格
2. 清除筛选条件重试
3. 刷新页面
4. 检查是否有查看权限

### 问题7：操作失败提示权限不足
**解决方案**：
某些功能需要特定权限，请联系管理员开通相应权限。

### 问题8：面试录像无法播放
**排查步骤**：
1. 检查录像是否在30天有效期内
2. 检查网络连接
3. 尝试更换浏览器
4. 检查浏览器是否禁用了视频播放

### 问题9：收不到面试通知邮件
**排查步骤**：
1. 检查邮箱垃圾邮件文件夹
2. 确认邮箱地址是否正确
3. 联系管理员检查邮件服务配置

### 问题10：候选人状态无法修改
**可能原因**：
1. 该候选人有进行中的面试
2. 没有编辑权限

**解决方案**：先完成或取消相关面试，再修改状态

---

## ❓ 高频FAQ

**Q1: 系统支持哪些浏览器？**
A: 推荐使用 Chrome、Edge、Firefox 浏览器的最新版本，不建议使用 IE 浏览器。

**Q2: 面试录像可以保存多久？**
A: 面试录像保存30天，建议及时下载保存重要录像。

**Q3: 如何导出面试数据？**
A: 在相应的管理页面（候选人列表、面试记录等），点击「导出」按钮，支持导出 Excel 格式。

**Q4: 一个候选人可以应聘多个岗位吗？**
A: 可以。在候选人详情页可以添加多个应聘岗位，系统会分别记录每个岗位的面试进度。

**Q5: 全AI面试的评估报告准确吗？**
A: AI评估报告基于候选人面试表现生成，供面试官参考。建议结合人工面试综合评估。

**Q6: 如何查看其他面试官的评价？**
A: 在候选人详情页或面试记录页，可以查看所有面试官的评价记录。

**Q7: 简历解析支持哪些语言？**
A: 目前支持中文和英文简历的解析。

**Q8: 可以批量导入候选人吗？**
A: 支持通过Excel批量导入候选人，模板可在「候选人管理」页面下载。

---

## 💡 延伸问题建议

当用户提问后，可以结合当前主题补充 1 到 2 个相关延伸问题建议，帮助用户继续追问或快速定位操作入口。

---

## 📝 回答要求

1. **简洁明了**：直接给出解决方案，不要冗长解释
2. **步骤清晰**：涉及操作步骤时，用序号（1. 2. 3.）列出
3. **准确引用**：参考知识库内容回答，不确定的问题不要猜测
4. **超出范围**：遇到无法回答的问题，统一回复「这个问题需要联系总部人事白佳乐」
5. **友好专业**：语气专业、友好、耐心
6. **图片理解**：如果用户上传了截图，分析截图内容，帮助识别问题

记住：你的目标是帮助用户快速解决问题。如果知识库中没有明确答案，请引导用户联系人资白佳乐！`;

// 延伸问题建议数据
const VIDEO_TUTORIALS: Record<string, Array<{ title: string; url: string; duration: string }>> = {
  '岗位': [
    { title: '如何创建和编辑岗位？', url: '', duration: '' },
    { title: '岗位状态如何管理？', url: '', duration: '' },
  ],
  '候选人': [
    { title: '如何上传和解析简历？', url: '', duration: '' },
    { title: '候选人状态分别代表什么？', url: '', duration: '' },
  ],
  '面试': [
    { title: '如何创建面试安排？', url: '', duration: '' },
    { title: '如何查看面试结果？', url: '', duration: '' },
  ],
  '用户': [
    { title: '如何创建用户？', url: '', duration: '' },
    { title: '用户角色权限如何区分？', url: '', duration: '' },
  ],
  '模型': [
    { title: '如何配置模型？', url: '', duration: '' },
    { title: '模型选择有什么建议？', url: '', duration: '' },
  ],
};

function createSseResponse(payload: {
  content: string;
  videos?: Array<{ title: string; url: string; duration: string }>;
}) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ content: payload.content })}\n\n`)
      );

      if (payload.videos && payload.videos.length > 0) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ videos: payload.videos })}\n\n`)
        );
      }

      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

/**
 * 聊天机器人 API - 流式输出（支持图片识别）
 */
export async function POST(req: NextRequest) {
  try {
    const { question, history = [], imageUrl, currentPage } = await req.json();

    if (!question && !imageUrl) {
      return new Response(
        JSON.stringify({ error: '请提供有效的问题或图片' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!imageUrl && question) {
      const localAnswer = await answerQuestionLocally(question);
      return createSseResponse({
        content: localAnswer.answer,
        videos: (localAnswer.suggestions ?? []).slice(0, 2).map((title) => ({
          title,
          url: '',
          duration: '',
        })),
      });
    }

    const client = createCompatibleLlmClient();

    const messages: ArkMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history,
    ];

    // 如果有图片，使用多模态消息格式
    if (imageUrl) {
      const userContent: Array<ArkTextPart | ArkImageUrlPart> = [];
      
      if (question) {
        userContent.push({ type: 'text', text: question });
      }
      
      userContent.push({
        type: 'image_url',
        image_url: {
          url: imageUrl,
          detail: 'high',
        },
      });
      
      messages.push({ role: 'user', content: userContent });
    } else {
      messages.push({ role: 'user', content: question });
    }

    // 选择模型：如果有图片使用视觉模型
    const model = imageUrl ? getResumeVisionModel() : await getModelId('interview_dialog');

    // 创建流式响应
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const response = await client.invoke(messages, {
            model,
            temperature: 0.7,
          });
          const fullContent = response.content || '';

          for (let index = 0; index < fullContent.length; index += 80) {
            const text = fullContent.slice(index, index + 80);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: text })}\n\n`));
          }

          // 根据问题内容推荐延伸问题
          let recommendedVideos: Array<{ title: string; url: string; duration: string }> = [];
          for (const [keyword, videos] of Object.entries(VIDEO_TUTORIALS)) {
            if (question?.includes(keyword) || fullContent.includes(keyword)) {
              recommendedVideos = [...recommendedVideos, ...videos];
            }
          }

          // 如果有推荐的问题，发送给前端
          if (recommendedVideos.length > 0) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ videos: recommendedVideos.slice(0, 2) })}\n\n`)
            );
          }

          // 发送结束标记
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          console.error('Stream error:', error);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: '回答生成失败，请稍后重试' })}\n\n`)
          );
          controller.close();
        }
      },
    });

    // 返回 SSE 响应
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Chatbot API error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : '服务暂时不可用，请稍后重试',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
