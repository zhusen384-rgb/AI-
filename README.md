# 智能面试官系统

一个基于 Next.js 和 AI 的智能面试官系统，支持简历解析、智能问题生成、实时视频面试和结构化评估报告生成。

AI 面试官语音合成当前仅保留 `豆包 TTS -> 浏览器朗读` 链路。

## 功能特性

### 1. 仪表盘 (Dashboard)
- 面试概览统计
- 今日面试安排
- 面试数据分析

### 2. 岗位管理 (Positions)
- 创建招聘岗位
- 编辑岗位信息
- 查看岗位详情
- 管理岗位状态

### 3. 候选人管理 (Candidates)
- 候选人列表
- 状态管理（待处理/面试中/已通过/已拒绝）
- 搜索候选人
- 查看候选人详情

### 4. 简历解析 (Resumes)
- 上传简历文件
- AI 自动解析简历
- 提取关键信息（工作经历、教育背景、技能、项目经验等）
- 标记冲突信息

### 5. 面试准备 (Interview Prepare)
- 基于简历和岗位需求生成智能问题库
- 多维度问题分类（基础验证/能力考察/缺口补全/情景模拟）
- 配套追问设计
- 难度等级标记

### 6. 实时面试 (Interview Room)
- 视频通话功能（WebRTC）
- 音视频控制
- 实时问题引导
- 答案记录
- 面试计时
- 多阶段流程管理（破冰/基础验证/核心考察/互动/收尾）

### 7. 评估报告 (Reports)
- 基于面试记录生成结构化评估报告
- 多维度评分（硬技能/经验/沟通/问题解决/职业素养等）
- 优势与不足分析
- 岗位适配度评估
- 复试建议
- 报告打印和下载

## 技术栈

- **框架**: Next.js 16 (App Router)
- **UI 组件**: shadcn/ui (基于 Radix UI)
- **样式**: Tailwind CSS 4
- **语言**: TypeScript 5
- **AI 集成**: Coze LLM (doubao-seed 模型)
- **数据库**: PostgreSQL + Drizzle ORM
- **视频通话**: WebRTC

## 快速开始

### 环境要求

- Node.js 24+
- PostgreSQL 数据库

### 安装依赖

```bash
pnpm install
```

### 配置环境变量

复制 `.env.example` 为 `.env` 并配置以下变量：

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=interview_system

# Coze Integration (for LLM services)
COZE_API_KEY=your_coze_api_key
COZE_API_ENDPOINT=https://api.coze.com

# Doubao Voice Integration (ASR / TTS)
DOUBAO_VOICE_APP_ID=your_app_id
DOUBAO_VOICE_ACCESS_TOKEN=your_access_token
DOUBAO_VOICE_SECRET_KEY=your_secret_key
DOUBAO_ASR_ENDPOINT=wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_nostream
DOUBAO_ASR_RESOURCE_ID=volc.seedasr.sauc.duration
DOUBAO_TTS_ENDPOINT=wss://openspeech.bytedance.com/api/v3/tts/bidirection
DOUBAO_TTS_RESOURCE_ID=seed-tts-2.0

# Object Storage (optional)
S3_ENDPOINT=your_s3_endpoint
S3_ACCESS_KEY=your_s3_access_key
S3_SECRET_KEY=your_s3_secret_key
S3_BUCKET=your_bucket_name
S3_REGION=your_region

# App Configuration
APP_BASE_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 启动开发服务器

```bash
coze dev
```

服务将在 http://localhost:3000 启动

### 构建生产版本

```bash
pnpm build
```

### 启动生产服务

```bash
pnpm start
```

## 使用指南

### 完整面试流程

1. **创建岗位**：在"岗位管理"页面创建招聘岗位并填写JD

2. **上传候选人**：在"候选人管理"页面添加候选人信息

3. **解析简历**：
   - 进入"简历解析"页面
   - 上传或粘贴简历内容
   - 点击"开始解析"获取结构化简历数据

4. **生成问题库**：
   - 进入"面试准备"页面
   - 填写候选人姓名、岗位描述
   - 粘贴简历解析数据
   - 点击"生成智能问题库"

5. **开始面试**：
   - 进入"面试室"页面
   - 启动视频通话
   - 按照问题库依次提问
   - 记录候选人回答
   - 完成面试

6. **生成报告**：
   - 进入"评估报告"页面
   - 填写候选人信息
   - 粘贴面试问答记录
   - 生成结构化评估报告

## 数据库结构

系统使用以下数据表：

- `interviewers` - 面试官信息
- `positions` - 岗位信息
- `candidates` - 候选人信息
- `resumes` - 简历数据
- `interviews` - 面试记录
- `interview_questions` - 面试问题
- `interview_answers` - 面试回答
- `interview_evaluations` - 面试评估

## 项目结构

```
src/
├── app/
│   ├── api/                    # API 路由
│   │   ├── resume/
│   │   │   └── parse/          # 简历解析API
│   │   ├── questions/
│   │   │   └── generate/       # 问题生成API
│   │   └── reports/
│   │       └── generate/       # 报告生成API
│   ├── candidates/             # 候选人管理页面
│   ├── interview/              # 面试相关页面
│   │   ├── prepare/            # 面试准备
│   │   └── room/               # 面试室
│   ├── positions/              # 岗位管理页面
│   ├── reports/                # 评估报告页面
│   ├── resumes/                # 简历解析页面
│   └── page.tsx                # 仪表盘
├── components/
│   ├── ui/                     # shadcn/ui 组件
│   └── app-sidebar.tsx         # 侧边栏导航
└── lib/
    ├── db/
    │   ├── index.ts            # 数据库连接
    │   └── schema.ts           # 数据库表结构
    └── utils.ts                # 工具函数
```

## 核心功能说明

### 简历解析

使用 AI 大语言模型自动解析简历，提取以下信息：
- 工作经历（公司、岗位、任职时长、职责、成果）
- 教育背景（院校、专业、学历、GPA、奖学金）
- 技能特长（熟练度分级）
- 资格证书
- 项目经验
- 冲突信息标记

### 智能问题生成

基于简历和岗位需求，生成多维度问题库：
- **基础验证题**：验证简历信息真实性
- **能力考察题**：考察硬技能和软技能
- **缺口补全题**：针对能力缺口设计问题
- **情景模拟题**：考察实际问题解决能力

每个问题配套 1-2 个追问，基于 STAR 法则设计。

### 结构化评估

从 8 个维度进行评分（0-10 分）：
1. 硬技能匹配度
2. 工作经验适配度
3. 沟通表达能力
4. 问题解决能力
5. 职业素养
6. 团队协作能力
7. 学习能力
8. 抗压能力

输出综合得分（0-100）和岗位适配度评估。

## 注意事项

1. 视频功能需要 HTTPS 环境或 localhost
2. 简历解析支持 .txt 格式
3. AI 功能需要配置 COZE_API_KEY
4. 数据库需要在启动前创建并配置

## 许可证

MIT

## 支持

如有问题，请提交 Issue。
