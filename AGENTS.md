# AI 面试系统 - 项目文档

## 项目概览

AI 面试系统是一个企业级面试管理平台，支持全AI面试、候选人管理、岗位管理等功能。系统采用多租户架构，支持数据隔离和权限管理。

### 技术栈
- **框架**: Next.js 16 (App Router)
- **前端**: React 19, TypeScript 5
- **UI**: shadcn/ui (基于 Radix UI), Tailwind CSS 4
- **数据库**: PostgreSQL + Drizzle ORM
- **认证**: JWT (jsonwebtoken)
- **AI**: coze-coding-dev-sdk (LLM 集成)

## 核心功能模块

### 1. 用户管理 (`/users`)
- 用户 CRUD 操作
- 角色管理: super_admin, admin, user
- 邀请码注册机制
- 登录日志追踪

### 2. 岗位管理 (`/positions`)
- 岗位 CRUD
- 全局岗位同步（超级管理员）
- 部门、状态筛选
- 用户筛选（管理员）

### 3. 候选人管理 (`/candidates`)
- 候选人信息管理
- 简历上传与解析
- 面试状态追踪

### 4. 全AI面试 (`/full-ai-interview`)
- AI 驱动的自动化面试
- 实时状态监控
- 面试记录与评估

### 5. 管理员数据看板 (`/admin/dashboard`)
- 系统整体数据统计
- 各用户数据量统计
- 用户活动日志
- 数据导出

## 目录结构

```
src/
├── app/                    # Next.js App Router
│   ├── admin/             # 管理员功能
│   │   └── dashboard/     # 数据看板
│   ├── api/               # API 路由
│   │   ├── admin/         # 管理员 API
│   │   ├── positions/     # 岗位 API
│   │   ├── full-ai-interview/  # 面试 API
│   │   └── ...
│   ├── candidates/        # 候选人页面
│   ├── positions/         # 岗位页面
│   ├── users/             # 用户管理页面
│   └── ...
├── components/            # React 组件
│   ├── ui/               # shadcn/ui 组件
│   └── ...
├── lib/                   # 工具库
│   ├── db/               # 数据库配置 (本地 schema)
│   ├── auth-provider.tsx # 认证上下文
│   └── tenant-filter.ts  # 租户数据过滤
├── storage/
│   └── database/
│       └── shared/       # 共享 schema (多租户)
└── public/               # 静态资源
```

## 数据库 Schema

系统使用两套 schema:
- `src/lib/db/schema.ts`: 本地表 (positions, candidates, resumes 等)
- `src/storage/database/shared/schema.ts`: 共享表 (users, tenants, loginLogs 等)

### 核心表
- **users**: 用户表，支持多角色
- **positions**: 岗位表，支持全局同步
- **candidates**: 候选人表
- **fullAiInterviewResults**: AI 面试结果表
- **loginLogs**: 登录日志表
- **userActivityLogs**: 用户活动日志表

## 权限控制

### 角色层级
1. **super_admin**: 超级管理员，可查看所有数据
2. **admin**: 管理员，可管理用户和数据
3. **user**: 普通用户，仅可查看自己的数据

### 数据隔离
- 基于 `tenant_id` 的租户隔离
- 基于 `user_id` 的用户级权限
- 管理员可跨租户/用户查看数据

## 开发命令

```bash
# 安装依赖
pnpm install

# 开发模式
coze dev

# 构建生产版本
coze build

# 启动生产服务
coze start
```

## API 接口

### 认证 API
- `POST /api/auth/login` - 登录
- `GET /api/auth/me` - 获取当前用户

### 管理员 API
- `GET /api/admin/stats` - 系统统计数据
- `GET /api/admin/user-stats` - 各用户数据统计
- `GET /api/admin/activity-logs` - 用户活动日志
- `GET /api/admin/users-list` - 用户列表（筛选用）
- `POST /api/admin/migrate-activity-logs` - 创建活动日志表

### 岗位 API
- `GET /api/positions` - 获取岗位列表
- `POST /api/positions` - 创建岗位
- `PUT /api/positions/[id]` - 更新岗位
- `DELETE /api/positions/[id]` - 删除岗位

### 面试 API
- `GET /api/full-ai-interview/records` - 获取面试记录
- `POST /api/full-ai-interview/start` - 开始面试
- `POST /api/full-ai-interview/save-result` - 保存结果

## 注意事项

1. **Schema 引用**: 注意区分本地 schema 和 shared schema
2. **权限检查**: 所有 API 都需要认证，管理员 API 需要额外权限检查
3. **数据过滤**: 使用 `buildTenantUserFilter` 进行数据隔离
4. **HMR**: 开发模式下代码修改自动热更新

## 最近更新

### 2024-01-XX
- 新增管理员数据看板 (`/admin/dashboard`)
- 新增用户活动日志功能
- 岗位管理、面试记录页面新增用户筛选功能
- 侧边栏增加管理员专属菜单
