# Gemini Playground API 文档

本项目提供了一个强大的API代理服务，支持OpenAI格式、Gemini原生格式和Google SDK格式三种API接口，具有负载均衡、批量请求、验证令牌管理和多种流式响应格式等高级功能。

## 功能特性

- ✅ **三格式支持**：同时支持OpenAI格式、Gemini原生格式和Google SDK格式
- ✅ **验证令牌系统**：支持自定义验证令牌，增强安全性
- ✅ **API Key负载均衡**：自动轮询多个API Key
- ✅ **批量请求处理**：支持批量处理多个请求
- ✅ **多种流式响应**：支持SSE和Streamable格式
- ✅ **边缘函数优化**：适用于Cloudflare Workers和Deno Deploy
- ✅ **前端测试界面**：提供便捷的API测试工具

## API 端点

### 1. OpenAI 格式 API

#### 聊天完成
```
POST /v1/openai/chat/completions
POST /chat/completions  # 兼容旧格式
```

#### 文本嵌入
```
POST /v1/openai/embeddings
POST /embeddings  # 兼容旧格式
```

#### 模型列表
```
GET /v1/openai/models
GET /models  # 兼容旧格式
```

#### 批量请求
```
POST /v1/openai/batch
```

### 2. Gemini 原生格式 API

#### 聊天完成
```
POST /v1/gemini/chat/completions
```

#### 文本嵌入
```
POST /v1/gemini/embeddings
```

#### 模型列表
```
GET /v1/gemini/models
```

#### 批量请求
```
POST /v1/gemini/batch
```

### 3. Google SDK 原生格式 API

#### 模型列表
```
GET /v1beta/models
```

#### 内容生成（非流式）
```
POST /v1beta/models/{model}:generateContent
```

#### 内容生成（流式）
```
POST /v1beta/models/{model}:streamGenerateContent
```

### 4. API Key 管理

#### 获取API Key列表
```
GET /api-keys
```

#### 添加API Key
```
POST /api-keys
Content-Type: text/plain

YOUR_API_KEY_HERE
```

#### 删除API Key
```
DELETE /api-keys
Content-Type: text/plain

YOUR_API_KEY_HERE
```

### 5. 验证令牌管理

#### 获取验证令牌列表
```
GET /auth-tokens
```

#### 添加验证令牌
```
POST /auth-tokens
Content-Type: text/plain

YOUR_AUTH_TOKEN_HERE
```

#### 删除验证令牌
```
DELETE /auth-tokens
Content-Type: text/plain

YOUR_AUTH_TOKEN_HERE
```

## 请求格式

### OpenAI 格式示例

#### 基本聊天请求
```json
{
  "model": "gemini-1.5-pro-latest",
  "messages": [
    {
      "role": "user",
      "content": "Hello, how are you?"
    }
  ],
  "stream": false
}
```

#### 流式请求
```json
{
  "model": "gemini-1.5-pro-latest",
  "messages": [
    {
      "role": "user",
      "content": "Tell me a story"
    }
  ],
  "stream": true,
  "stream_format": "sse"  // 或 "streamable"
}
```

#### 批量请求
```json
{
  "requests": [
    {
      "custom_id": "request-1",
      "model": "gemini-1.5-pro-latest",
      "messages": [
        {
          "role": "user",
          "content": "What is AI?"
        }
      ]
    },
    {
      "custom_id": "request-2",
      "model": "gemini-1.5-pro-latest",
      "messages": [
        {
          "role": "user",
          "content": "Explain machine learning"
        }
      ]
    }
  ]
}
```

### Gemini 原生格式示例

#### 基本请求
```json
{
  "contents": [
    {
      "parts": [
        {
          "text": "Hello, how are you?"
        }
      ]
    }
  ],
  "generationConfig": {
    "temperature": 0.7,
    "maxOutputTokens": 1024
  }
}
```

### Google SDK 格式示例

#### 生成内容请求
```bash
POST /v1beta/models/gemini-1.5-pro:generateContent
```

请求体：
```json
{
  "contents": [
    {
      "parts": [
        {
          "text": "Explain how AI works"
        }
      ]
    }
  ],
  "generationConfig": {
    "temperature": 0.9,
    "topK": 1,
    "topP": 1,
    "maxOutputTokens": 2048
  }
}
```

#### 流式生成内容
```bash
POST /v1beta/models/gemini-1.5-pro:streamGenerateContent?alt=sse
```

## 认证

### 重要说明
从安全性考虑，系统现在**强制要求使用验证令牌**进行认证。直接使用 Gemini API Key 将被拒绝。

### 认证流程
1. 管理员配置 Gemini API Keys 到系统中
2. 管理员创建验证令牌（Auth Tokens）
3. 用户使用验证令牌进行 API 调用
4. 系统验证令牌后，自动使用配置的 API Key 调用 Gemini API

### 使用验证令牌
```
Authorization: Bearer YOUR_AUTH_TOKEN
```

### 环境变量配置
```bash
# 配置 Gemini API Keys
export GEMINI_API_KEYS=YOUR_KEY_1,YOUR_KEY_2,YOUR_KEY_3

# 配置验证令牌
export AUTH_TOKENS=YOUR_TOKEN_1,YOUR_TOKEN_2,YOUR_TOKEN_3
```

### 验证令牌管理
通过 API 端点动态管理验证令牌：
- 添加新令牌：`POST /auth-tokens`
- 查看令牌列表：`GET /auth-tokens`
- 删除令牌：`DELETE /auth-tokens`

## 流式响应

### SSE 格式（默认）
```
data: {"id":"chatcmpl-xxx","choices":[{"delta":{"content":"Hello"}}]}

data: {"id":"chatcmpl-xxx","choices":[{"delta":{"content":" there"}}]}

data: [DONE]
```

### Streamable 格式
设置 `stream_format: "streamable"` 以使用JSON流格式。

## 错误处理

### 标准错误响应
```json
{
  "error": {
    "message": "Error description",
    "type": "invalid_request_error",
    "code": "invalid_api_key"
  }
}
```

### 常见错误码
- `401`: 验证令牌无效或缺失
- `400`: 请求格式错误
- `404`: 端点不存在
- `405`: HTTP 方法不允许
- `408`: 请求超时
- `429`: 请求频率限制
- `500`: 服务器内部错误

## 部署配置

### Deno Deploy
```bash
# 设置环境变量
export GEMINI_API_KEYS=YOUR_KEY_1,YOUR_KEY_2,YOUR_KEY_3

# 启动服务
deno run --allow-net --allow-read --allow-env src/deno_index.ts
```

### Cloudflare Workers
在Cloudflare Workers的环境变量中设置：
```
GEMINI_API_KEYS=YOUR_KEY_1,YOUR_KEY_2,YOUR_KEY_3
```

## 使用示例

### cURL 示例
```bash
# OpenAI格式聊天
curl -X POST "https://your-domain.com/v1/openai/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -d '{
    "model": "gemini-1.5-pro-latest",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'

# Gemini原生格式
curl -X POST "https://your-domain.com/v1/gemini/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -d '{
    "contents": [{"parts": [{"text": "Hello!"}]}]
  }'

# Google SDK格式
curl -X POST "https://your-domain.com/v1beta/models/gemini-1.5-pro:generateContent" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -d '{
    "contents": [{"parts": [{"text": "Hello!"}]}]
  }'

# 批量请求
curl -X POST "https://your-domain.com/v1/openai/batch" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -d '{
    "requests": [
      {
        "custom_id": "req-1",
        "model": "gemini-1.5-pro-latest",
        "messages": [{"role": "user", "content": "Hello!"}]
      }
    ]
  }'

# 管理验证令牌
curl -X POST "https://your-domain.com/auth-tokens" \
  -H "Content-Type: text/plain" \
  -d "YOUR_NEW_TOKEN"
```

### JavaScript 示例
```javascript
// OpenAI格式
const response = await fetch('/v1/openai/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_AUTH_TOKEN'
  },
  body: JSON.stringify({
    model: 'gemini-1.5-pro-latest',
    messages: [
      { role: 'user', content: 'Hello!' }
    ],
    stream: true
  })
});

// 处理流式响应
const reader = response.body.getReader();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const chunk = new TextDecoder().decode(value);
  const lines = chunk.split('\n');
  
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = line.slice(6);
      if (data === '[DONE]') return;
      
      try {
        const parsed = JSON.parse(data);
        console.log(parsed.choices[0].delta.content);
      } catch (e) {
        // 忽略解析错误
      }
    }
  }
}
```

### Python 示例
```python
import requests
import json

# OpenAI格式请求
def chat_completion(message, auth_token):
    url = "https://your-domain.com/v1/openai/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {auth_token}"
    }
    data = {
        "model": "gemini-1.5-pro-latest",
        "messages": [
            {"role": "user", "content": message}
        ]
    }
    
    response = requests.post(url, headers=headers, json=data)
    return response.json()

# Google SDK格式请求
def generate_content(prompt, auth_token):
    url = "https://your-domain.com/v1beta/models/gemini-1.5-pro:generateContent"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {auth_token}"
    }
    data = {
        "contents": [{
            "parts": [{"text": prompt}]
        }]
    }
    
    response = requests.post(url, headers=headers, json=data)
    return response.json()

# 使用示例
auth_token = "YOUR_AUTH_TOKEN"
result = chat_completion("Hello, how are you?", auth_token)
print(result["choices"][0]["message"]["content"])
```

## 性能优化

### 边缘函数优化
- 使用连接池减少延迟
- 智能API Key轮询
- 自动重试机制
- 响应缓存（可选）

### 批量处理
- 并发处理多个请求
- 智能错误处理
- 部分成功响应

## 监控和日志

### 请求日志
系统会记录以下信息：
- 请求路径和方法
- 使用的API Key（部分隐藏）
- 响应状态和耗时
- 错误信息

### 性能指标
- API Key使用分布
- 请求成功率
- 平均响应时间
- 错误率统计

## 限制和注意事项

1. **验证令牌安全**：验证令牌应当妥善保管，定期更换
2. **API Key管理**：确保API Key的安全性，定期轮换
3. **请求频率**：遵守Gemini API的频率限制
4. **数据大小**：注意请求和响应的大小限制
5. **流式响应**：确保客户端正确处理流式数据
6. **错误处理**：实现适当的重试和错误恢复机制
7. **超时设置**：API 请求默认30秒超时，可根据需要调整

## 故障排除

### 常见问题

**Q: 验证令牌无效错误**
A: 确保使用的是验证令牌而非 API Key，检查令牌是否已添加到系统中

**Q: API Key无效错误**
A: 检查API Key是否正确，是否已添加到系统中

**Q: 请求超时**
A: 检查网络连接，考虑增加超时时间

**Q: 流式响应中断**
A: 检查客户端的流处理逻辑，确保正确处理连接

**Q: 批量请求部分失败**
A: 检查响应中的错误信息，单独处理失败的请求

**Q: 401 认证错误**
A: 系统现在强制要求使用验证令牌，不再接受直接使用 API Key

## 更新日志

### v3.0.0
- 新增 Google SDK 原生格式支持
- 实现验证令牌（Auth Token）系统
- 增强安全性：强制使用验证令牌认证
- 支持动态管理验证令牌
- 改进错误处理和超时机制
- 优化网络请求诊断

### v2.0.0
- 添加双格式API支持
- 实现批量请求处理
- 增强流式响应格式
- 优化边缘函数性能
- 改进API Key管理

### v1.0.0
- 基础OpenAI格式支持
- API Key负载均衡
- 前端测试界面

## 支持的模型

系统支持所有 Gemini 模型，包括但不限于：
- gemini-2.5-pro (默认模型)
- gemini-1.5-pro
- gemini-1.5-pro-latest
- gemini-1.5-flash
- gemini-1.5-flash-latest
- learnlm 系列模型

模型名称可以带或不带 "models/" 前缀，系统会自动处理。

## 高级功能

### 响应格式控制
支持通过 `response_format` 参数控制响应格式：
- `json_object`: 返回 JSON 格式
- `json_schema`: 返回符合指定 schema 的 JSON
- `text`: 返回纯文本格式

### 生成参数
支持的生成参数包括：
- `temperature`: 控制随机性 (0-2)
- `max_tokens` / `max_completion_tokens`: 最大输出令牌数
- `top_p`: 核采样参数
- `top_k`: Top-K 采样参数
- `frequency_penalty`: 频率惩罚
- `presence_penalty`: 存在惩罚
- `stop` / `stopSequences`: 停止序列

### 多模态支持
支持处理多种内容类型：
- 文本内容
- 图片（URL 或 base64 编码）
- 音频输入（需要指定格式）

## 安全建议

1. **定期更换令牌**：建议定期更换验证令牌和 API Key
2. **最小权限原则**：为不同用户/应用创建不同的验证令牌
3. **监控使用情况**：定期检查 API 使用日志
4. **加密传输**：始终使用 HTTPS 进行 API 调用
5. **错误信息处理**：避免在生产环境暴露详细错误信息
