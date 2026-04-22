# 生产环境初始化指南

## 重要提示

部署后如果数据库还没有默认租户和管理员，必须先执行初始化，否则无法登录系统。

从现在开始，生产环境的初始化接口需要使用 `INIT_API_TOKEN` 保护，不再建议裸露调用。

## 初始化前准备

在生产环境配置以下环境变量：

```bash
INIT_API_TOKEN=请设置一个足够复杂的一次性初始化令牌
JWT_SECRET=请设置正式环境 JWT 密钥
REFRESH_TOKEN_SECRET=建议单独设置刷新令牌密钥
```

说明：

- `INIT_API_TOKEN` 用于保护 `/api/init` 和 `/api/reset-admin`
- 开发环境可以不填 `INIT_API_TOKEN`
- 生产环境如果未配置 `INIT_API_TOKEN`，初始化接口会被直接禁用

## 初始化方法

### 方法 1：使用初始化页面（推荐）

1. 访问初始化页面：`https://你的域名/initialize`
2. 输入 `INIT_API_TOKEN`
3. 点击“初始化数据库”按钮
4. 等待初始化完成
5. 系统自动跳转到登录页

如果系统中已有租户数据但忘记了管理员密码：

1. 访问 `https://你的域名/initialize`
2. 输入 `INIT_API_TOKEN`
3. 点击“重置管理员密码”
4. 等待重置完成
5. 使用默认管理员账号登录

### 方法 2：直接调用 API

```bash
# 初始化数据库（创建默认租户和管理员）
curl -X POST https://你的域名/api/init \
  -H "x-init-token: 你的 INIT_API_TOKEN"

# 或仅重置管理员密码
curl -X POST https://你的域名/api/reset-admin \
  -H "x-init-token: 你的 INIT_API_TOKEN"
```

## 默认登录信息

初始化或重置后，默认管理员信息如下：

- 用户名：`admin`
- 密码：`admin123`
- 角色：`super_admin`

首次登录后请立即修改默认密码。

## 常见问题

### Q: 为什么生产环境访问初始化接口返回 403？

A: 请求里没有携带正确的 `x-init-token`，或者它和服务端 `INIT_API_TOKEN` 不一致。

### Q: 为什么生产环境访问初始化接口返回 503？

A: 服务端没有配置 `INIT_API_TOKEN`，为了安全，初始化接口已经被禁用。

### Q: 为什么登录一直提示“用户名或密码错误”？

A: 很可能数据库还没有初始化，或者管理员密码已经被重置过。

建议按下面顺序排查：

1. 访问 `/initialize`
2. 输入 `INIT_API_TOKEN`
3. 先尝试“重置管理员密码”
4. 再使用 `admin / admin123` 登录

## 安全建议

1. 初始化完成后立即修改 `admin` 默认密码
2. 初始化完成后建议轮换或移除 `INIT_API_TOKEN`
3. 如有条件，限制 `/initialize` 页面的访问来源
4. 始终启用 HTTPS
5. 定期备份数据库

## API 端点说明

### POST /api/init

- 生产环境要求请求头 `x-init-token` 与 `INIT_API_TOKEN` 一致
- 创建默认租户（`code: default`）
- 创建超级管理员用户（`admin / admin123`）
- 如果数据已存在，则跳过重复创建

### POST /api/reset-admin

- 生产环境要求请求头 `x-init-token` 与 `INIT_API_TOKEN` 一致
- 将 `admin` 密码重置为 `admin123`
- 确保管理员状态为 `active`
- 确保管理员角色为 `super_admin`
- 如果 `admin` 用户不存在，则自动创建

## 默认数据说明

### 默认租户

- 名称：默认组织
- 代码：`default`
- 邮箱：`admin@example.com`
- 电话：`400-888-8888`

### 默认管理员

- 用户名：`admin`
- 邮箱：`admin@example.com`
- 姓名：系统管理员
- 角色：`super_admin`
- 密码：`admin123`
