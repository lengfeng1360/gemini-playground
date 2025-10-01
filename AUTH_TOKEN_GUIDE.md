# 验证令牌使用指南

本指南介绍如何使用自定义验证令牌来保护您的 Gemini API 代理服务。

## 功能概述

新增的验证令牌功能允许您：
1. 使用自定义的验证字符串代替直接暴露真实的 API Key
2. 在服务器端管理真实的 API Key，客户端只需要知道验证令牌
3. 支持多个验证令牌和多个 API Key 的管理
4. **强制身份验证**：所有访问都必须使用验证令牌，不再支持直接使用 API Key
5. **Web 界面保护**：访问主页面前需要先通过身份验证

## 配置方法

### 1. 设置环境变量

在启动服务器之前，设置以下环境变量：

**Windows:**
```bash
set GEMINI_API_KEYS=YOUR_API_KEY_1,YOUR_API_KEY_2
set AUTH_TOKENS=YOUR_TOKEN_1,YOUR_TOKEN_2,YOUR_TOKEN_3
```

**Linux/Mac:**
```bash
export GEMINI_API_KEYS=YOUR_API_KEY_1,YOUR_API_KEY_2
export AUTH_TOKENS=YOUR_TOKEN_1,YOUR_TOKEN_2,YOUR_TOKEN_3
```

### 2. 启动服务器

```bash
deno run --allow-net --allow-read --allow-env src/deno_index.ts
```

## 使用方法

### 使用验证令牌访问 API

使用您设置的验证令牌代替真实的 API Key：

```bash
# OpenAI 格式
curl -X POST "http://localhost:8000/v1/openai/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -d '{
    "model": "gemini-2.5-pro",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'

# Gemini 格式
curl -X POST "http://localhost:8000/v1/gemini/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -d '{
    "model": "gemini-2.5-pro",
    "contents": [{"parts": [{"text": "Hello!"}]}]
  }'
```

### 管理验证令牌

#### 查看当前验证令牌列表
```bash
curl "http://localhost:8000/auth-tokens"
```

#### 添加新的验证令牌
```bash
curl -X POST "http://localhost:8000/auth-tokens" \
  -d "YOUR_NEW_TOKEN"
```

#### 删除验证令牌
```bash
curl -X DELETE "http://localhost:8000/auth-tokens" \
  -d "TOKEN_TO_REMOVE"
```

## 模型选择

现在支持在请求中指定模型，如果不指定则使用默认模型 `gemini-2.5-pro`：

```bash
# 使用特定模型
curl -X POST "http://localhost:8000/v1/openai/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -d '{
    "model": "gemini-1.5-flash",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

## 重要变更

**从 2025-10-01 起，系统不再支持直接使用 API Key：**
1. 所有 API 请求必须使用验证令牌
2. 访问 Web 界面需要先登录
3. 直接使用 API Key 的请求将被拒绝（返回 401 错误）

## Web 界面身份验证

### 登录流程
1. 访问主页面时会自动重定向到登录页面
2. 输入正确的验证令牌（AUTH_TOKENS 中的任意一个）
3. 验证成功后会创建会话（有效期 24 小时）
4. 会话过期后需要重新登录

### 安全特性
- 登录失败次数限制：连续 5 次失败后锁定 15 分钟
- 会话管理：使用 localStorage 存储加密的会话信息
- 自动登出：会话过期后自动要求重新登录

## 安全建议

1. **不要在客户端代码中硬编码验证令牌**
2. **定期更换验证令牌**
3. **使用 HTTPS 在生产环境中部署**
4. **限制验证令牌的访问权限**
5. **监控 API 使用情况**
6. **设置强密码策略**：使用复杂的验证令牌
7. **定期检查登录日志**：监控异常登录行为

## 示例：在 JavaScript 中使用

```javascript
async function callGeminiAPI() {
  const response = await fetch('http://localhost:8000/v1/openai/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_AUTH_TOKEN'
    },
    body: JSON.stringify({
      model: 'gemini-2.5-pro',
      messages: [
        { role: 'user', content: 'What is the weather like today?' }
      ]
    })
  });
  
  const data = await response.json();
  console.log(data.choices[0].message.content);
}
```

## 故障排除

### 常见错误

1. **"Invalid authentication token"**
   - 确保使用的令牌在 AUTH_TOKENS 环境变量中
   - 检查是否有拼写错误

2. **"No API Key available"**
   - 确保设置了 GEMINI_API_KEYS 环境变量
   - 检查 API Key 是否有效

3. **"Authentication required"**
   - 确保在请求头中包含了 Authorization 字段
   - 格式应为：`Authorization: Bearer YOUR_TOKEN`

### 调试技巧

1. 查看服务器日志以了解认证过程
2. 使用 `/api-keys` 和 `/auth-tokens` 端点检查配置
3. 先使用简单的 curl 命令测试，确认工作正常后再集成到应用中

## 更新记录

- 2025-10-01: 添加验证令牌功能
- 2025-10-01: 更新默认模型为 gemini-2.5-pro
- 2025-10-01: 支持在请求中动态指定模型
