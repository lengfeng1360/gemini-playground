//Author: PublicAffairs
//Project: https://github.com/PublicAffairs/openai-gemini
//MIT License : https://github.com/PublicAffairs/openai-gemini/blob/main/LICENSE

import { Buffer } from "node:buffer";

// API Key 管理 - 这些函数将从外部注入
let API_KEYS = [];
let currentKeyIndex = 0;
let addApiKey, removeApiKey, getNextApiKey, getApiKeys;
let AUTH_TOKENS = []; // 自定义验证令牌
let getAuthTokens, addAuthToken, removeAuthToken, validateAuthToken;

// 初始化 API Key 管理函数（由 deno_index.ts 注入）
function initializeApiKeyManagement(keyManagement) {
  API_KEYS = keyManagement.getApiKeys();
  addApiKey = keyManagement.addApiKey;
  removeApiKey = keyManagement.removeApiKey;
  getNextApiKey = keyManagement.getNextApiKey;
  getApiKeys = keyManagement.getApiKeys;
  
  // 初始化验证令牌管理
  AUTH_TOKENS = keyManagement.getAuthTokens ? keyManagement.getAuthTokens() : [];
  getAuthTokens = keyManagement.getAuthTokens;
  addAuthToken = keyManagement.addAuthToken;
  removeAuthToken = keyManagement.removeAuthToken;
  validateAuthToken = keyManagement.validateAuthToken;
}

// 导出初始化函数供外部使用
export { initializeApiKeyManagement };

export default {
  async fetch (request) {
    if (request.method === "OPTIONS") {
      return handleOPTIONS();
    }
    const errHandler = (err) => {
      console.error(err);
      return new Response(err.message, fixCors({ status: err.status ?? 500 }));
    };
    try {
      // 添加详细的认证调试日志
      console.log(`=== Authentication Debug ===`);
      const auth = request.headers.get("Authorization");
      console.log(`Authorization header: ${auth ? auth.substring(0, 20) + '...' : 'null'}`);
      
      let providedToken = auth?.split(" ")[1];
      console.log(`Extracted token: ${providedToken ? providedToken.substring(0, 10) + '...' : 'null'}`);
      console.log(`Token length: ${providedToken ? providedToken.length : 0}`);
      
      let apiKey;
      
      // 验证令牌逻辑 - 只允许使用验证令牌
      if (providedToken) {
        console.log(`Validating token with validateAuthToken function...`);
        // 检查是否是自定义验证令牌
        if (validateAuthToken && validateAuthToken(providedToken)) {
          console.log(`✓ Token validation successful`);
          // 验证通过，使用真实的 API Key
          apiKey = getNextApiKey ? getNextApiKey() : null;
          if (!apiKey) {
            console.log(`✗ No API Key available from pool`);
            throw new HttpError("No API Key available", 500);
          }
          console.log(`Auth token validated, using API Key: ${apiKey.substring(0, 8)}...`);
        } else {
          console.log(`✗ Token validation failed`);
          console.log(`validateAuthToken function exists: ${!!validateAuthToken}`);
          if (validateAuthToken) {
            console.log(`Available auth tokens count: ${getAuthTokens ? getAuthTokens().length : 'unknown'}`);
          }
          // 不是有效的验证令牌
          throw new HttpError("Invalid authentication token", 401);
        }
      } else {
        console.log(`✗ No token provided in Authorization header`);
        console.log(`Full Authorization header: "${auth}"`);
        // 没有提供令牌
        throw new HttpError("Authentication required", 401);
      }
      
      const assert = (success) => {
        if (!success) {
          throw new HttpError("The specified HTTP method is not allowed for the requested resource", 400);
        }
      };
      const { pathname } = new URL(request.url);
      
      // 路由处理 - 支持双格式API
      const route = parseRoute(pathname);
      
      // 添加调试日志
      console.log(`Using API Key: ${apiKey ? apiKey.substring(0, 8) + '...' : 'None'}`);
      console.log(`Request path: ${pathname}`);
      console.log(`Route format: ${route.format}, endpoint: ${route.endpoint}`);
      
      switch (route.endpoint) {
        case "chat/completions":
          assert(request.method === "POST");
          return handleCompletions(await request.json(), apiKey, route.format, route)
            .catch(errHandler);
        case "embeddings":
          assert(request.method === "POST");
          return handleEmbeddings(await request.json(), apiKey, route.format)
            .catch(errHandler);
        case "models":
          assert(request.method === "GET");
          return handleModels(apiKey, route.format)
            .catch(errHandler);
        case "batch":
          assert(request.method === "POST");
          return handleBatch(await request.json(), apiKey, route.format)
            .catch(errHandler);
        // 新增管理 API Key 的端点
        case "api-keys":
          switch (request.method) {
            case "GET":
              const keys = getApiKeys ? getApiKeys() : [];
              // 返回部分隐藏的 API Keys 用于前端显示
              const maskedKeys = keys.map(key => ({
                id: key.substring(0, 8) + '...' + key.substring(key.length - 4),
                full: key
              }));
              return new Response(JSON.stringify(maskedKeys), fixCors({ headers: { "Content-Type": "application/json" } }));
            case "POST":
              const newKey = await request.text();
              if (addApiKey) {
                addApiKey(newKey);
                return new Response("API Key added", fixCors({ status: 201 }));
              } else {
                throw new HttpError("API Key management not initialized", 500);
              }
            case "DELETE":
              const keyToRemove = await request.text();
              if (removeApiKey) {
                removeApiKey(keyToRemove);
                return new Response("API Key removed", fixCors());
              } else {
                throw new HttpError("API Key management not initialized", 500);
              }
            default:
              throw new HttpError("Method not allowed", 405);
          }
        case "auth-tokens":
          switch (request.method) {
            case "GET":
              const tokens = getAuthTokens ? getAuthTokens() : [];
              // 返回部分隐藏的验证令牌
              const maskedTokens = tokens.map(token => ({
                id: token.substring(0, 8) + '...' + token.substring(token.length - 4),
                full: token
              }));
              return new Response(JSON.stringify(maskedTokens), fixCors({ headers: { "Content-Type": "application/json" } }));
            case "POST":
              const newToken = await request.text();
              if (addAuthToken) {
                addAuthToken(newToken);
                return new Response("Auth token added", fixCors({ status: 201 }));
              } else {
                throw new HttpError("Auth token management not initialized", 500);
              }
            case "DELETE":
              const tokenToRemove = await request.text();
              if (removeAuthToken) {
                removeAuthToken(tokenToRemove);
                return new Response("Auth token removed", fixCors());
              } else {
                throw new HttpError("Auth token management not initialized", 500);
              }
            default:
              throw new HttpError("Method not allowed", 405);
          }
        default:
          throw new HttpError("404 Not Found", 404);
      }
    } catch (err) {
      return errHandler(err);
    }
  }
};

class HttpError extends Error {
  constructor(message, status) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
  }
}

const fixCors = ({ headers, status, statusText }) => {
  headers = new Headers(headers);
  headers.set("Access-Control-Allow-Origin", "*");
  return { headers, status, statusText };
};

const handleOPTIONS = async () => {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "*",
      "Access-Control-Allow-Headers": "*",
    }
  });
};

const BASE_URL = "https://generativelanguage.googleapis.com";
const API_VERSION = "v1beta";

// https://github.com/google-gemini/generative-ai-js/blob/cf223ff4a1ee5a2d944c53cddb8976136382bee6/src/requests/request.ts#L71
const API_CLIENT = "genai-js/0.21.0"; // npm view @google/generative-ai version
const makeHeaders = (apiKey, more) => ({
  "x-goog-api-client": API_CLIENT,
  ...(apiKey && { "x-goog-api-key": apiKey }),
  ...more
});

// 路由解析函数 - 支持双格式API
function parseRoute(pathname) {
  // 添加详细的路径解析日志
  console.log(`=== parseRoute Debug ===`);
  console.log(`Original pathname: ${pathname}`);
  
  // 支持的路径格式:
  // /v1/openai/chat/completions
  // /v1/gemini/chat/completions
  // /chat/completions (默认为openai格式)
  // /v1beta/models/{model}:generateContent (Google SDK 格式)
  // /v1beta/models/{model}:streamGenerateContent (Google SDK 格式)
  // /v1beta/models (Google SDK 格式)
  
  const pathParts = pathname.split('/').filter(part => part);
  console.log(`Path parts: [${pathParts.join(', ')}]`);
  
  // 检查 Google SDK 原生路径格式
  if (pathParts.length >= 2 && pathParts[0] === 'v1beta') {
    if (pathParts[1] === 'models') {
      // /v1beta/models - 列出模型
      if (pathParts.length === 2) {
        return { format: 'google-sdk', endpoint: 'models' };
      }
      
      // /v1beta/models/{model}:generateContent 或 :streamGenerateContent
      if (pathParts.length === 3) {
        const modelPart = pathParts[2];
        if (modelPart.includes(':generateContent')) {
          const model = modelPart.split(':')[0];
          const isStream = modelPart.includes(':streamGenerateContent');
          return { 
            format: 'google-sdk', 
            endpoint: 'chat/completions',
            model: model,
            stream: isStream
          };
        }
      }
    }
  }
  
  // 检查是否是新的双格式路径
  if (pathParts.length >= 3 && pathParts[0] === 'v1') {
    const format = pathParts[1]; // openai 或 gemini
    const endpoint = pathParts.slice(2).join('/'); // chat/completions, embeddings, etc.
    
    if (['openai', 'gemini'].includes(format)) {
      return { format, endpoint };
    }
  }
  
  // 兼容旧的路径格式
  if (pathname.endsWith("/chat/completions")) {
    return { format: 'openai', endpoint: 'chat/completions' };
  }
  if (pathname.endsWith("/embeddings")) {
    return { format: 'openai', endpoint: 'embeddings' };
  }
  if (pathname.endsWith("/models")) {
    return { format: 'openai', endpoint: 'models' };
  }
  if (pathname.endsWith("/api-keys")) {
    return { format: 'openai', endpoint: 'api-keys' };
  }
  if (pathname.endsWith("/auth-tokens")) {
    return { format: 'openai', endpoint: 'auth-tokens' };
  }
  
  // 检查批量请求
  if (pathname.includes("/batch")) {
    const format = pathname.includes('/v1/gemini/') ? 'gemini' : 'openai';
    return { format, endpoint: 'batch' };
  }
  
  // 增强的 Gemini 格式路径支持
  // 检查是否是 CherryStudio 可能使用的其他 Gemini 格式
  if (pathParts.length >= 1) {
    // 检查 /gemini/... 格式
    if (pathParts[0] === 'gemini') {
      if (pathParts.length >= 2) {
        const endpoint = pathParts.slice(1).join('/');
        console.log(`Detected gemini format path: /${pathParts.join('/')}, endpoint: ${endpoint}`);
        return { format: 'gemini', endpoint };
      }
    }
    
    // 检查 /v1/... 但不是 openai/gemini 的情况
    if (pathParts[0] === 'v1' && pathParts.length >= 2) {
      const secondPart = pathParts[1];
      // 如果第二部分不是 openai 或 gemini，可能是其他格式
      if (!['openai', 'gemini'].includes(secondPart)) {
        const endpoint = pathParts.slice(1).join('/');
        console.log(`Detected v1 format path: /${pathParts.join('/')}, endpoint: ${endpoint}`);
        // 默认当作 gemini 格式处理
        return { format: 'gemini', endpoint };
      }
    }
    
    // 检查直接的模型调用格式，如 /models/gemini-pro:generateContent
    if (pathParts[0] === 'models' && pathParts.length >= 2) {
      const modelPart = pathParts[1];
      if (modelPart.includes(':generateContent')) {
        const model = modelPart.split(':')[0];
        const isStream = modelPart.includes(':streamGenerateContent');
        console.log(`Detected direct model call: ${modelPart}, model: ${model}, stream: ${isStream}`);
        return { 
          format: 'google-sdk', 
          endpoint: 'chat/completions',
          model: model,
          stream: isStream
        };
      }
    }
  }
  
  // 记录未匹配的路径用于调试
  console.log(`No route match found for: ${pathname}`);
  console.log(`Returning null route`);
  
  return { format: null, endpoint: null };
}

async function handleModels (apiKey, format = 'openai') {
  const response = await fetch(`${BASE_URL}/${API_VERSION}/models`, {
    headers: makeHeaders(apiKey),
  });
  let { body } = response;
  if (response.ok) {
    const { models } = JSON.parse(await response.text());
    
    if (format === 'gemini' || format === 'google-sdk') {
      // Gemini原生格式或Google SDK格式
      body = JSON.stringify({ models }, null, "  ");
    } else {
      // OpenAI格式
      body = JSON.stringify({
        object: "list",
        data: models.map(({ name }) => ({
          id: name.replace("models/", ""),
          object: "model",
          created: 0,
          owned_by: "",
        })),
      }, null, "  ");
    }
  }
  return new Response(body, fixCors(response));
}

const DEFAULT_EMBEDDINGS_MODEL = "text-embedding-004";
async function handleEmbeddings (req, apiKey, format = 'openai') {
  if (typeof req.model !== "string") {
    throw new HttpError("model is not specified", 400);
  }
  if (!Array.isArray(req.input)) {
    req.input = [ req.input ];
  }
  let model;
  if (req.model.startsWith("models/")) {
    model = req.model;
  } else {
    req.model = DEFAULT_EMBEDDINGS_MODEL;
    model = "models/" + req.model;
  }
  const response = await fetch(`${BASE_URL}/${API_VERSION}/${model}:batchEmbedContents`, {
    method: "POST",
    headers: makeHeaders(apiKey, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      "requests": req.input.map(text => ({
        model,
        content: { parts: { text } },
        outputDimensionality: req.dimensions,
      }))
    })
  });
  let { body } = response;
  if (response.ok) {
    const { embeddings } = JSON.parse(await response.text());
    body = JSON.stringify({
      object: "list",
      data: embeddings.map(({ values }, index) => ({
        object: "embedding",
        index,
        embedding: values,
      })),
      model: req.model,
    }, null, "  ");
  }
  return new Response(body, fixCors(response));
}

const DEFAULT_MODEL = "gemini-2.5-pro";
async function handleCompletions (req, apiKey, format = 'openai', routeInfo = {}) {
  // 添加详细的调试日志
  console.log(`=== handleCompletions Debug Info ===`);
  console.log(`Format: ${format}`);
  console.log(`API Key (masked): ${apiKey ? apiKey.substring(0, 8) + '...' + apiKey.substring(apiKey.length - 4) : 'None'}`);
  console.log(`Request model: ${req.model || 'undefined'}`);
  
  let model = req.model || DEFAULT_MODEL;
  
  // 如果是 Google SDK 格式，从路由信息中获取模型和流式设置
  if (format === 'google-sdk' && routeInfo.model) {
    model = routeInfo.model;
    // 对于 Google SDK 格式，stream 信息已经在 URL 中，不需要在请求体中
    if (routeInfo.stream !== undefined) {
      req.stream = routeInfo.stream;
    }
  }
  
  switch(true) {
    case typeof model !== "string":
      model = DEFAULT_MODEL;
      break;
    case model.startsWith("models/"):
      model = model.substring(7);
      break;
    case model.startsWith("gemini-"):
    case model.startsWith("learnlm-"):
      // model is already in correct format
      break;
    default:
      // 如果模型名称不符合预期格式，使用默认模型
      console.log(`Unknown model format: ${model}, using default: ${DEFAULT_MODEL}`);
      model = DEFAULT_MODEL;
  }
  
  const TASK = req.stream ? "streamGenerateContent" : "generateContent";
  let url = `${BASE_URL}/${API_VERSION}/models/${model}:${TASK}`;
  
  // 支持不同的流式响应格式
  if (req.stream) {
    if (req.stream_format === 'streamable') {
      // 使用streamable格式
      url += "?alt=json";
    } else {
      // 默认使用SSE格式
      url += "?alt=sse";
    }
  }
  
  // 根据格式处理请求体
  let requestBody;
  if (format === 'gemini' || format === 'google-sdk') {
    // Gemini原生格式或Google SDK格式 - 需要确保包含必要的配置
    console.log(`Processing ${format} format request`);
    const geminiRequest = {
      ...req,
      // 确保包含安全设置（如果没有提供的话）
      safetySettings: req.safetySettings || safetySettings,
      // 确保有生成配置
      generationConfig: req.generationConfig || {}
    };
    
    // 对于 Google SDK 格式，移除不支持的字段
    if (format === 'google-sdk') {
      delete geminiRequest.stream;
      delete geminiRequest.stream_format;
      delete geminiRequest.model; // 模型已经在 URL 中指定
    }
    
    requestBody = JSON.stringify(geminiRequest);
    console.log(`${format} request body structure:`, Object.keys(geminiRequest));
  } else {
    // OpenAI格式 - 需要转换
    console.log(`Processing OpenAI format request`);
    requestBody = JSON.stringify(await transformRequest(req));
  }
  
  // 添加网络连接诊断和超时处理
  console.log(`Making request to: ${url}`);
  console.log(`Using API Key: ${apiKey ? apiKey.substring(0, 8) + '...' : 'None'}`);
  console.log(`Request body preview: ${requestBody.substring(0, 200)}...`);
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30秒超时
  
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: makeHeaders(apiKey, { "Content-Type": "application/json" }),
      body: requestBody,
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    console.log(`Response status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`API Error: ${response.status} - ${errorText}`);
      throw new HttpError(`Gemini API Error: ${response.status} - ${errorText}`, response.status);
    }

    let body = response.body;
    if (format === 'gemini' || format === 'google-sdk') {
      // Gemini原生格式或Google SDK格式 - 直接返回响应
      console.log(`Returning ${format} format response directly`);
      body = await response.text();
    } else {
      // OpenAI格式 - 需要转换响应
      console.log(`Converting response to OpenAI format`);
      let id = generateChatcmplId();
      if (req.stream) {
        body = response.body
          .pipeThrough(new TextDecoderStream())
          .pipeThrough(new TransformStream({
            transform: parseStream,
            flush: parseStreamFlush,
            buffer: "",
          }))
          .pipeThrough(new TransformStream({
            transform: toOpenAiStream,
            flush: toOpenAiStreamFlush,
            streamIncludeUsage: req.stream_options?.include_usage,
            model, id, last: [],
          }))
          .pipeThrough(new TextEncoderStream());
      } else {
        body = await response.text();
        body = processCompletionsResponse(JSON.parse(body), model, id);
      }
    }
    return new Response(body, fixCors(response));
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      console.error('Request timeout');
      throw new HttpError('Request timeout', 408);
    }
    console.error('Network error:', error);
    throw new HttpError(`Network error: ${error.message}`, 500);
  }
}

// 批量请求处理函数
async function handleBatch(req, apiKey, format = 'openai') {
  if (!Array.isArray(req.requests)) {
    throw new HttpError("requests must be an array", 400);
  }
  
  const results = [];
  const promises = req.requests.map(async (request, index) => {
    try {
      const response = await handleCompletions(request, apiKey, format);
      const responseData = await response.json();
      return {
        id: request.custom_id || `batch_${index}`,
        response: {
          status_code: 200,
          body: responseData
        }
      };
    } catch (error) {
      return {
        id: request.custom_id || `batch_${index}`,
        response: {
          status_code: error.status || 500,
          body: { error: { message: error.message } }
        }
      };
    }
  });
  
  const batchResults = await Promise.all(promises);
  
  const responseBody = {
    object: "list",
    data: batchResults,
    has_more: false
  };
  
  return new Response(JSON.stringify(responseBody), fixCors({
    headers: { "Content-Type": "application/json" }
  }));
}

const harmCategory = [
  "HARM_CATEGORY_HATE_SPEECH",
  "HARM_CATEGORY_SEXUALLY_EXPLICIT",
  "HARM_CATEGORY_DANGEROUS_CONTENT",
  "HARM_CATEGORY_HARASSMENT",
  "HARM_CATEGORY_CIVIC_INTEGRITY",
];
const safetySettings = harmCategory.map(category => ({
  category,
  threshold: "BLOCK_NONE",
}));
const fieldsMap = {
  stop: "stopSequences",
  n: "candidateCount", // not for streaming
  max_tokens: "maxOutputTokens",
  max_completion_tokens: "maxOutputTokens",
  temperature: "temperature",
  top_p: "topP",
  top_k: "topK", // non-standard
  frequency_penalty: "frequencyPenalty",
  presence_penalty: "presencePenalty",
};
const transformConfig = (req) => {
  let cfg = {};
  //if (typeof req.stop === "string") { req.stop = [req.stop]; } // no need
  for (let key in req) {
    const matchedKey = fieldsMap[key];
    if (matchedKey) {
      cfg[matchedKey] = req[key];
    }
  }
  if (req.response_format) {
    switch(req.response_format.type) {
      case "json_schema":
        cfg.responseSchema = req.response_format.json_schema?.schema;
        if (cfg.responseSchema && "enum" in cfg.responseSchema) {
          cfg.responseMimeType = "text/x.enum";
          break;
        }
        // eslint-disable-next-line no-fallthrough
      case "json_object":
        cfg.responseMimeType = "application/json";
        break;
      case "text":
        cfg.responseMimeType = "text/plain";
        break;
      default:
        throw new HttpError("Unsupported response_format.type", 400);
    }
  }
  return cfg;
};

const parseImg = async (url) => {
  let mimeType, data;
  if (url.startsWith("http://") || url.startsWith("https://")) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText} (${url})`);
      }
      mimeType = response.headers.get("content-type");
      data = Buffer.from(await response.arrayBuffer()).toString("base64");
    } catch (err) {
      throw new Error("Error fetching image: " + err.toString());
    }
  } else {
    const match = url.match(/^data:(?<mimeType>.*?)(;base64)?,(?<data>.*)$/);
    if (!match) {
      throw new Error("Invalid image data: " + url);
    }
    ({ mimeType, data } = match.groups);
  }
  return {
    inlineData: {
      mimeType,
      data,
    },
  };
};

const transformMsg = async ({ role, content }) => {
  const parts = [];
  if (!Array.isArray(content)) {
    // system, user: string
    // assistant: string or null (Required unless tool_calls is specified.)
    parts.push({ text: content });
    return { role, parts };
  }
  // user:
  // An array of content parts with a defined type.
  // Supported options differ based on the model being used to generate the response.
  // Can contain text, image, or audio inputs.
  for (const item of content) {
    switch (item.type) {
      case "text":
        parts.push({ text: item.text });
        break;
      case "image_url":
        parts.push(await parseImg(item.image_url.url));
        break;
      case "input_audio":
        parts.push({
          inlineData: {
            mimeType: "audio/" + item.input_audio.format,
            data: item.input_audio.data,
          }
        });
        break;
      default:
        throw new TypeError(`Unknown "content" item type: "${item.type}"`);
    }
  }
  if (content.every(item => item.type === "image_url")) {
    parts.push({ text: "" }); // to avoid "Unable to submit request because it must have a text parameter"
  }
  return { role, parts };
};

const transformMessages = async (messages) => {
  if (!messages) { return; }
  const contents = [];
  let system_instruction;
  for (const item of messages) {
    if (item.role === "system") {
      delete item.role;
      system_instruction = await transformMsg(item);
    } else {
      item.role = item.role === "assistant" ? "model" : "user";
      contents.push(await transformMsg(item));
    }
  }
  if (system_instruction && contents.length === 0) {
    contents.push({ role: "model", parts: { text: " " } });
  }
  //console.info(JSON.stringify(contents, 2));
  return { system_instruction, contents };
};

const transformRequest = async (req) => ({
  ...await transformMessages(req.messages),
  safetySettings,
  generationConfig: transformConfig(req),
});

const generateChatcmplId = () => {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const randomChar = () => characters[Math.floor(Math.random() * characters.length)];
  return "chatcmpl-" + Array.from({ length: 29 }, randomChar).join("");
};

const reasonsMap = { //https://ai.google.dev/api/rest/v1/GenerateContentResponse#finishreason
  //"FINISH_REASON_UNSPECIFIED": // Default value. This value is unused.
  "STOP": "stop",
  "MAX_TOKENS": "length",
  "SAFETY": "content_filter",
  "RECITATION": "content_filter",
  //"OTHER": "OTHER",
  // :"function_call",
};
const SEP = "\n\n|>";
const transformCandidates = (key, cand) => ({
  index: cand.index || 0, // 0-index is absent in new -002 models response
  [key]: {
    role: "assistant",
    content: cand.content?.parts.map(p => p.text).join(SEP) },
  logprobs: null,
  finish_reason: reasonsMap[cand.finishReason] || cand.finishReason,
});
const transformCandidatesMessage = transformCandidates.bind(null, "message");
const transformCandidatesDelta = transformCandidates.bind(null, "delta");

const transformUsage = (data) => ({
  completion_tokens: data.candidatesTokenCount,
  prompt_tokens: data.promptTokenCount,
  total_tokens: data.totalTokenCount
});

const processCompletionsResponse = (data, model, id) => {
  return JSON.stringify({
    id,
    choices: data.candidates.map(transformCandidatesMessage),
    created: Math.floor(Date.now()/1000),
    model,
    //system_fingerprint: "fp_69829325d0",
    object: "chat.completion",
    usage: transformUsage(data.usageMetadata),
  });
};

const responseLineRE = /^data: (.*)(?:\n\n|\r\r|\r\n\r\n)/;
async function parseStream (chunk, controller) {
  chunk = await chunk;
  if (!chunk) { return; }
  this.buffer += chunk;
  do {
    const match = this.buffer.match(responseLineRE);
    if (!match) { break; }
    controller.enqueue(match[1]);
    this.buffer = this.buffer.substring(match[0].length);
  } while (true); // eslint-disable-line no-constant-condition
}
async function parseStreamFlush (controller) {
  if (this.buffer) {
    console.error("Invalid data:", this.buffer);
    controller.enqueue(this.buffer);
  }
}

function transformResponseStream (data, stop, first) {
  const item = transformCandidatesDelta(data.candidates[0]);
  if (stop) { item.delta = {}; } else { item.finish_reason = null; }
  if (first) { item.delta.content = ""; } else { delete item.delta.role; }
  const output = {
    id: this.id,
    choices: [item],
    created: Math.floor(Date.now()/1000),
    model: this.model,
    //system_fingerprint: "fp_69829325d0",
    object: "chat.completion.chunk",
  };
  if (data.usageMetadata && this.streamIncludeUsage) {
    output.usage = stop ? transformUsage(data.usageMetadata) : null;
  }
  return "data: " + JSON.stringify(output) + delimiter;
}
const delimiter = "\n\n";
async function toOpenAiStream (chunk, controller) {
  const transform = transformResponseStream.bind(this);
  const line = await chunk;
  if (!line) { return; }
  let data;
  try {
    data = JSON.parse(line);
  } catch (err) {
    console.error(line);
    console.error(err);
    const length = this.last.length || 1; // at least 1 error msg
    const candidates = Array.from({ length }, (_, index) => ({
      finishReason: "error",
      content: { parts: [{ text: err }] },
      index,
    }));
    data = { candidates };
  }
  const cand = data.candidates[0];
  console.assert(data.candidates.length === 1, "Unexpected candidates count: %d", data.candidates.length);
  cand.index = cand.index || 0; // absent in new -002 models response
  if (!this.last[cand.index]) {
    controller.enqueue(transform(data, false, "first"));
  }
  this.last[cand.index] = data;
  if (cand.content) { // prevent empty data (e.g. when MAX_TOKENS)
    controller.enqueue(transform(data));
  }
}
async function toOpenAiStreamFlush (controller) {
  const transform = transformResponseStream.bind(this);
  if (this.last.length > 0) {
    for (const data of this.last) {
      controller.enqueue(transform(data, "stop"));
    }
    controller.enqueue("data: [DONE]" + delimiter);
  }
}
