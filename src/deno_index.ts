/// <reference lib="deno.ns" />

const getContentType = (path: string): string => {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const types: Record<string, string> = {
    'js': 'application/javascript',
    'css': 'text/css',
    'html': 'text/html',
    'json': 'application/json',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif'
  };
  return types[ext] || 'text/plain';
};

// API Key 列表和当前索引（用于轮询负载均衡）
let API_KEYS: string[] = [];
let currentKeyIndex = 0;

// 验证令牌列表
let AUTH_TOKENS: string[] = [];

// 初始化 API Key 列表
function initializeApiKeys(): void {
  console.log("=== Initializing API Keys and Auth Tokens ===");
  
  // 从环境变量中读取 API Key 列表
  const apiKeyEnv = Deno.env.get("GEMINI_API_KEYS");
  if (apiKeyEnv) {
    API_KEYS = apiKeyEnv.split(",").map(key => key.trim()).filter(key => key.length > 0);
    console.log(`✓ Loaded ${API_KEYS.length} API keys from GEMINI_API_KEYS environment variable`);
    API_KEYS.forEach((key, index) => {
      console.log(`  API Key ${index + 1}: ${maskApiKey(key)}`);
    });
  } else {
    console.log("⚠️  No GEMINI_API_KEYS environment variable found");
    console.log("   To set API keys, use: set GEMINI_API_KEYS=key1,key2,key3");
    console.log("   Or on Unix/Mac: export GEMINI_API_KEYS=key1,key2,key3");
  }
  
  // 从环境变量中读取验证令牌列表
  const authTokenEnv = Deno.env.get("AUTH_TOKENS");
  if (authTokenEnv) {
    AUTH_TOKENS = authTokenEnv.split(",").map(token => token.trim()).filter(token => token.length > 0);
    console.log(`✓ Loaded ${AUTH_TOKENS.length} auth tokens from AUTH_TOKENS environment variable`);
  } else {
    // 如果没有环境变量，使用默认的 Auth Token
    AUTH_TOKENS = ["123456"];
    console.log("⚠️  No AUTH_TOKENS environment variable found, using default: 123456");
  }
  
  console.log("=== Initialization Complete ===");
  console.log(`Total API Keys: ${API_KEYS.length}`);
  console.log(`Total Auth Tokens: ${AUTH_TOKENS.length}`);
}

// 安全地格式化API Key用于日志记录
function maskApiKey(key: string): string {
  if (key.length <= 12) {
    return key.substring(0, 4) + '...';
  }
  return key.substring(0, 8) + '...' + key.substring(key.length - 4);
}

// 添加 API Key 到列表
function addApiKey(key: string): void {
  if (!API_KEYS.includes(key)) {
    API_KEYS.push(key);
    console.log(`Added API Key: ${maskApiKey(key)}`);
  }
}

// 从列表中移除 API Key
function removeApiKey(key: string): void {
  const index = API_KEYS.indexOf(key);
  if (index > -1) {
    API_KEYS.splice(index, 1);
    console.log(`Removed API Key: ${maskApiKey(key)}`);
    // 重置当前索引，避免越界
    if (currentKeyIndex >= API_KEYS.length) {
      currentKeyIndex = 0;
    }
  }
}

// 获取下一个 API Key（轮询方式）
function getNextApiKey(): string | null {
  if (API_KEYS.length === 0) {
    return null;
  }
  
  const key = API_KEYS[currentKeyIndex];
  currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
  return key;
}

// 获取所有 API Keys（用于管理）
function getApiKeys(): string[] {
  return [...API_KEYS]; // 返回副本，防止外部修改
}

// 验证令牌管理函数
function addAuthToken(token: string): void {
  if (!AUTH_TOKENS.includes(token)) {
    AUTH_TOKENS.push(token);
    console.log(`Added auth token: ${maskApiKey(token)}`);
  }
}

function removeAuthToken(token: string): void {
  const index = AUTH_TOKENS.indexOf(token);
  if (index > -1) {
    AUTH_TOKENS.splice(index, 1);
    console.log(`Removed auth token: ${maskApiKey(token)}`);
  }
}

function getAuthTokens(): string[] {
  return [...AUTH_TOKENS]; // 返回副本
}

function validateAuthToken(token: string): boolean {
  return AUTH_TOKENS.includes(token);
}

// 检查是否为API路径
function isAPIPath(pathname: string): boolean {
  // 支持的API路径格式:
  // /v1/openai/chat/completions
  // /v1/gemini/chat/completions
  // /chat/completions (兼容旧格式)
  // /embeddings
  // /models
  // /v1/openai/batch
  // /v1/gemini/batch
  // /v1beta/models/{model}:generateContent (Google SDK 格式)
  // /v1beta/models/{model}:streamGenerateContent (Google SDK 格式)
  // /v1beta/models (Google SDK 格式)
  
  const pathParts = pathname.split('/').filter(part => part);
  
  // 检查 Google SDK 原生路径格式
  if (pathParts.length >= 2 && pathParts[0] === 'v1beta') {
    if (pathParts[1] === 'models') {
      // /v1beta/models
      if (pathParts.length === 2) return true;
      
      // /v1beta/models/{model}:generateContent 或 :streamGenerateContent
      if (pathParts.length === 3) {
        const modelPart = pathParts[2];
        return modelPart.includes(':generateContent') || 
               modelPart.includes(':streamGenerateContent');
      }
    }
  }
  
  // 检查新的双格式路径
  if (pathParts.length >= 3 && pathParts[0] === 'v1') {
    const format = pathParts[1]; // openai 或 gemini
    const endpoint = pathParts.slice(2).join('/'); // chat/completions, embeddings, etc.
    
    if (['openai', 'gemini'].includes(format)) {
      return ['chat/completions', 'embeddings', 'models', 'batch'].some(ep => 
        endpoint === ep || endpoint.startsWith(ep + '/')
      );
    }
  }
  
  // 兼容旧的路径格式
  return pathname.endsWith("/chat/completions") ||
         pathname.endsWith("/embeddings") ||
         pathname.endsWith("/models") ||
         pathname.includes("/batch");
}

// 检查是否需要身份验证的路径
function requiresAuth(pathname: string): boolean {
  // 不需要验证的路径
  const publicPaths = [
    '/login.html',
    '/auth/verify',
    '/js/auth.js',
    '/css/style.css',
    '/favicon.ico',
    '/test_redirect_fix.html' // 临时添加测试页面
  ];
  
  // 检查是否是公开路径
  const isPublic = publicPaths.some(path => pathname === path || pathname.startsWith(path));
  
  // 检查是否是需要保护的路径
  const protectedPaths = [
    '/',
    '/index.html'
  ];
  
  const isProtected = protectedPaths.some(path => pathname === path);
  
  // 只有明确需要保护的路径才需要验证
  return isProtected;
}

// 会话存储（在生产环境中应该使用数据库或 Redis）
const sessions = new Map<string, { token: string; expiresAt: number }>();

// 生成会话 ID
function generateSessionId(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

// 创建会话
function createSession(token: string): string {
  const sessionId = generateSessionId();
  const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24小时
  sessions.set(sessionId, { token, expiresAt });
  
  // 定期清理过期会话
  setTimeout(() => {
    sessions.delete(sessionId);
  }, 24 * 60 * 60 * 1000);
  
  return sessionId;
}

// 验证会话
function validateSession(sessionId: string): boolean {
  const session = sessions.get(sessionId);
  if (!session) return false;
  
  if (session.expiresAt < Date.now()) {
    sessions.delete(sessionId);
    return false;
  }
  
  return true;
}

// 从 Cookie 中获取会话 ID
function getSessionIdFromCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  
  const cookies = cookieHeader.split(';').map(c => c.trim());
  for (const cookie of cookies) {
    const [name, value] = cookie.split('=');
    if (name === 'gemini_session') {
      return value;
    }
  }
  
  return null;
}

// 在服务器启动时初始化 API Keys
initializeApiKeys();

async function handleWebSocket(req: Request): Promise<Response> {
  const { socket: clientWs, response } = Deno.upgradeWebSocket(req);
  
  const url = new URL(req.url);
  // 从请求中获取 API Key
  const urlParams = new URLSearchParams(url.search);
  let apiKey = urlParams.get('key');
  
  // 如果没有提供 API Key，则从列表中获取一个
  if (!apiKey) {
    apiKey = getNextApiKey();
    if (!apiKey) {
      console.error('No API Key available for WebSocket connection');
      // 不能在WebSocket升级后关闭连接，应该返回错误响应
      return new Response('No API Key available', { 
        status: 401,
        headers: { 
          'content-type': 'text/plain',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
  }
  
  // 构建目标 URL，包含选定的 API Key
  const targetUrl = `wss://generativelanguage.googleapis.com${url.pathname}?key=${apiKey}`;
  
  console.log('Target URL:', targetUrl);
  
  const pendingMessages: string[] = [];
  const targetWs = new WebSocket(targetUrl);
  
  targetWs.onopen = () => {
    console.log('Connected to Gemini with API Key:', apiKey?.substring(0, 8) + '...');
    pendingMessages.forEach(msg => targetWs.send(msg));
    pendingMessages.length = 0;
  };

  clientWs.onmessage = (event) => {
    console.log('Client message received');
    if (targetWs.readyState === WebSocket.OPEN) {
      targetWs.send(event.data);
    } else {
      pendingMessages.push(event.data);
    }
  };

  targetWs.onmessage = (event) => {
    console.log('Gemini message received');
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(event.data);
    }
  };

  clientWs.onclose = (event) => {
    console.log('Client connection closed');
    if (targetWs.readyState === WebSocket.OPEN) {
      targetWs.close(1000, event.reason);
    }
  };

  targetWs.onclose = (event) => {
    console.log('Gemini connection closed');
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close(event.code, event.reason);
    }
  };

  targetWs.onerror = (error) => {
    console.error('Gemini WebSocket error:', error);
  };

  return response;
}

async function handleAPIRequest(req: Request): Promise<Response> {
  try {
    const worker = await import('./api_proxy/worker.mjs');
    
    // 初始化 worker 的 API Key 管理
    const keyManagement = {
      getApiKeys: () => [...API_KEYS],
      addApiKey: (key: string) => addApiKey(key),
      removeApiKey: (key: string) => removeApiKey(key),
      getNextApiKey: () => getNextApiKey(),
      getAuthTokens: () => [...AUTH_TOKENS],
      addAuthToken: (token: string) => addAuthToken(token),
      removeAuthToken: (token: string) => removeAuthToken(token),
      validateAuthToken: (token: string) => validateAuthToken(token)
    };
    
    worker.initializeApiKeyManagement(keyManagement);
    
    return await worker.default.fetch(req);
  } catch (error) {
    console.error('API request error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    const errorStatus = (error as { status?: number }).status || 500;
    return new Response(errorMessage, {
      status: errorStatus,
      headers: {
        'content-type': 'text/plain;charset=UTF-8',
      }
    });
  }
}

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  console.log('Request URL:', req.url);

  // 处理验证端点
  if (url.pathname === '/auth/verify' && req.method === 'POST') {
    try {
      const body = await req.json();
      const token = body.token;
      
      if (validateAuthToken(token)) {
        // 创建服务器端会话
        const sessionId = createSession(token);
        
        return new Response(JSON.stringify({
          success: true,
          message: '验证成功',
          expiresIn: 24 * 60 * 60 * 1000 // 24小时
        }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Set-Cookie': `gemini_session=${sessionId}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`
          }
        });
      } else {
        return new Response(JSON.stringify({
          success: false,
          message: '验证令牌无效'
        }), {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }
    } catch (error) {
      return new Response(JSON.stringify({
        success: false,
        message: '请求格式错误'
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
  }
  
  // 处理登出端点
  if (url.pathname === '/auth/logout' && req.method === 'POST') {
    const sessionId = getSessionIdFromCookie(req.headers.get('Cookie'));
    if (sessionId) {
      sessions.delete(sessionId);
    }
    
    return new Response(JSON.stringify({
      success: true,
      message: '已登出'
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Set-Cookie': 'gemini_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'
      }
    });
  }

  // 处理 Auth Token 管理端点
  if (url.pathname === '/auth-tokens') {
    // 验证会话
    const sessionId = getSessionIdFromCookie(req.headers.get('Cookie'));
    if (!sessionId || !validateSession(sessionId)) {
      return new Response(JSON.stringify({
        success: false,
        message: '未授权'
      }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    switch (req.method) {
      case 'GET':
        // 获取 Auth Token 列表（部分隐藏）
        const maskedTokens = AUTH_TOKENS.map(token => ({
          id: token.substring(0, Math.min(4, token.length)) + '...',
          full: token
        }));
        return new Response(JSON.stringify(maskedTokens), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      
      case 'POST':
        try {
          const body = await req.json();
          const newToken = body.token;
          if (newToken && newToken.trim()) {
            addAuthToken(newToken.trim());
            return new Response(JSON.stringify({
              success: true,
              message: 'Auth Token 添加成功'
            }), {
              status: 201,
              headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
              }
            });
          } else {
            return new Response(JSON.stringify({
              success: false,
              message: 'Token 不能为空'
            }), {
              status: 400,
              headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
              }
            });
          }
        } catch (error) {
          return new Response(JSON.stringify({
            success: false,
            message: '请求格式错误'
          }), {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          });
        }
      
      case 'DELETE':
        try {
          const body = await req.json();
          const tokenToRemove = body.token;
          if (tokenToRemove) {
            removeAuthToken(tokenToRemove);
            return new Response(JSON.stringify({
              success: true,
              message: 'Auth Token 删除成功'
            }), {
              headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
              }
            });
          } else {
            return new Response(JSON.stringify({
              success: false,
              message: 'Token 不能为空'
            }), {
              status: 400,
              headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
              }
            });
          }
        } catch (error) {
          return new Response(JSON.stringify({
            success: false,
            message: '请求格式错误'
          }), {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          });
        }
      
      default:
        return new Response('Method not allowed', {
          status: 405,
          headers: {
            'Content-Type': 'text/plain',
            'Access-Control-Allow-Origin': '*'
          }
        });
    }
  }

  // 处理 API Key 管理端点
  if (url.pathname === '/api-keys') {
    // 验证会话
    const sessionId = getSessionIdFromCookie(req.headers.get('Cookie'));
    if (!sessionId || !validateSession(sessionId)) {
      return new Response(JSON.stringify({
        success: false,
        message: '未授权'
      }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    switch (req.method) {
      case 'GET':
        // 获取 API Key 列表（部分隐藏）
        const maskedKeys = API_KEYS.map(key => ({
          id: key.substring(0, 8) + '...' + key.substring(key.length - 4),
          full: key
        }));
        return new Response(JSON.stringify(maskedKeys), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      
      case 'POST':
        try {
          const newKey = await req.text();
          if (newKey && newKey.trim()) {
            addApiKey(newKey.trim());
            return new Response(JSON.stringify({
              success: true,
              message: 'API Key 添加成功'
            }), {
              status: 201,
              headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
              }
            });
          } else {
            return new Response(JSON.stringify({
              success: false,
              message: 'API Key 不能为空'
            }), {
              status: 400,
              headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
              }
            });
          }
        } catch (error) {
          return new Response(JSON.stringify({
            success: false,
            message: '请求格式错误'
          }), {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          });
        }
      
      case 'DELETE':
        try {
          const keyToRemove = await req.text();
          if (keyToRemove) {
            removeApiKey(keyToRemove);
            return new Response(JSON.stringify({
              success: true,
              message: 'API Key 删除成功'
            }), {
              headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
              }
            });
          } else {
            return new Response(JSON.stringify({
              success: false,
              message: 'API Key 不能为空'
            }), {
              status: 400,
              headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
              }
            });
          }
        } catch (error) {
          return new Response(JSON.stringify({
            success: false,
            message: '请求格式错误'
          }), {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          });
        }
      
      default:
        return new Response('Method not allowed', {
          status: 405,
          headers: {
            'Content-Type': 'text/plain',
            'Access-Control-Allow-Origin': '*'
          }
        });
    }
  }

  // WebSocket 处理
  if (req.headers.get("Upgrade")?.toLowerCase() === "websocket") {
    return handleWebSocket(req);
  }

  // 检查API路径 - 支持双格式
  if (isAPIPath(url.pathname)) {
    return handleAPIRequest(req);
  }

  // 静态文件处理
  try {
    let filePath = url.pathname;
    
    // 服务器端身份验证检查
    if (requiresAuth(filePath)) {
      const sessionId = getSessionIdFromCookie(req.headers.get('Cookie'));
      
      // 如果没有有效会话，重定向到登录页面
      if (!sessionId || !validateSession(sessionId)) {
        // 避免重定向循环：如果已经在登录页面，不要重定向
        if (filePath !== '/login.html') {
          return new Response(null, {
            status: 302,
            headers: {
              'Location': '/login.html',
              'Access-Control-Allow-Origin': '*'
            }
          });
        }
      }
    }
    
    if (filePath === '/' || filePath === '/index.html') {
      filePath = '/index.html';
    }

    // 路径安全验证 - 防止路径遍历攻击
    if (filePath.includes('..') || filePath.includes('\\') || filePath.includes('\0')) {
      console.warn(`Blocked potentially dangerous path: ${filePath}`);
      return new Response('Forbidden', { 
        status: 403,
        headers: {
          'content-type': 'text/plain;charset=UTF-8',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // 确保路径在允许的静态文件目录内
    const normalizedPath = filePath.replace(/\/+/g, '/'); // 规范化路径
    if (!normalizedPath.startsWith('/')) {
      return new Response('Bad Request', { 
        status: 400,
        headers: {
          'content-type': 'text/plain;charset=UTF-8',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    const fullPath = `${Deno.cwd()}/src/static${normalizedPath}`;

    const file = await Deno.readFile(fullPath);
    const contentType = getContentType(normalizedPath);

    return new Response(file, {
      headers: {
        'content-type': `${contentType};charset=UTF-8`,
        'Access-Control-Allow-Origin': '*'
      },
    });
  } catch (e) {
    console.error('Static file error:', e);
    
    // 区分不同类型的错误
    if (e instanceof Deno.errors.NotFound) {
      return new Response('File Not Found', { 
        status: 404,
        headers: {
          'content-type': 'text/plain;charset=UTF-8',
          'Access-Control-Allow-Origin': '*'
        }
      });
    } else if (e instanceof Deno.errors.PermissionDenied) {
      return new Response('Permission Denied', { 
        status: 403,
        headers: {
          'content-type': 'text/plain;charset=UTF-8',
          'Access-Control-Allow-Origin': '*'
        }
      });
    } else {
      return new Response('Internal Server Error', { 
        status: 500,
        headers: {
          'content-type': 'text/plain;charset=UTF-8',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
  }
}

Deno.serve(handleRequest);
