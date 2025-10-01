# Gemini Playground 扩展功能说明

本文档介绍了对 Gemini Playground 项目的扩展功能，包括 API Key 负载均衡和 Gemini 原生格式支持。

## 功能特性

### 1. API Key 负载均衡
项目现在支持多个 API Key 的负载均衡，可以通过以下方式配置：

#### 环境变量配置
在启动服务时，可以通过 `GEMINI_API_KEYS` 环境变量设置多个 API Key：
```bash
GEMINI_API_KEYS=your-key-1,your-key-2,your-key-3 deno run --allow-net --allow-read --allow-env src/deno_index.ts
```

#### 运行时管理
前端界面提供了 API Key 管理功能，可以在运行时添加或删除 API Key。

### 2. Gemini 原生格式支持
项目现在支持在 OpenAI 格式和 Gemini 原生格式之间切换：

- **OpenAI 格式**：默认格式，兼容 OpenAI API 调用方式
- **Gemini 原生格式**：直接使用 Gemini API 格式

在前端配置面板中可以选择使用的 API 格式。

## 使用方法

### 配置多个 API Key
1. 通过环境变量设置多个 API Key
2. 或者在前端界面中使用 API Key 管理功能添加多个 Key

### 切换 API 格式
1. 在前端配置面板中找到 "API Format" 选项
2. 选择 "OpenAI Format" 或 "Gemini Native Format"
3. 重新连接到服务

## 技术实现

### 后端实现
- `src/deno_index.ts`：实现了 API Key 负载均衡逻辑
- `src/api_proxy/worker.mjs`：增加了 API Key 管理接口

### 前端实现
- `src/static/index.html`：增加了 API Key 管理界面和格式选择控件
- `src/static/js/main.js`：实现了 API Key 管理功能和格式切换逻辑
- `src/static/js/core/websocket-client.js`：增加了对 Gemini 原生格式的支持

## API 接口

### API Key 管理接口
- `GET /api-keys`：获取所有 API Key（部分隐藏）
- `POST /api-keys`：添加新的 API Key
- `DELETE /api-keys`：删除指定的 API Key

## 部署说明

### Deno 部署
```bash
# 设置环境变量
export GEMINI_API_KEYS=your-key-1,your-key-2,your-key-3

# 启动服务
deno run --allow-net --allow-read --allow-env src/deno_index.ts
```

### Cloudflare Worker 部署
在 Cloudflare Worker 的环境变量中设置 `GEMINI_API_KEYS`。
