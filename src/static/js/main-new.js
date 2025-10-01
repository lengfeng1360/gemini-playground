import { MultimodalLiveClient } from './core/websocket-client.js';
import { AudioStreamer } from './audio/audio-streamer.js';
import { AudioRecorder } from './audio/audio-recorder.js';
import { CONFIG } from './config/config.js';
import { Logger } from './utils/logger.js';
import { VideoManager } from './video/video-manager.js';
import { ScreenRecorder } from './video/screen-recorder.js';
import { languages } from './language-selector.js';

/**
 * @fileoverview 重新设计的主入口文件，支持标签页和请求日志
 */

// 请求日志管理
class RequestLogger {
    constructor() {
        this.logs = [];
        this.maxLogs = 100;
    }

    addLog(method, url, headers, body, response, status) {
        const log = {
            id: Date.now(),
            timestamp: new Date(),
            method,
            url,
            headers,
            body,
            response,
            status,
            duration: 0
        };
        
        this.logs.unshift(log);
        if (this.logs.length > this.maxLogs) {
            this.logs.pop();
        }
        
        this.renderLogs();
        return log;
    }

    updateLog(id, updates) {
        const log = this.logs.find(l => l.id === id);
        if (log) {
            Object.assign(log, updates);
            this.renderLogs();
        }
    }

    clearLogs() {
        this.logs = [];
        this.renderLogs();
    }

    renderLogs() {
        const logsList = document.getElementById('logs-list');
        if (!logsList) return;

        if (this.logs.length === 0) {
            logsList.innerHTML = `
                <div class="empty-logs">
                    <span class="material-symbols-outlined">info</span>
                    <p>暂无请求日志</p>
                </div>
            `;
            return;
        }

        logsList.innerHTML = this.logs.map(log => {
            // 格式化状态显示
            const statusDisplay = log.status ? 
                (log.statusText ? `${log.status} ${log.statusText}` : log.status) : 
                'pending';
            
            // 格式化 URL 显示
            const urlDisplay = log.pathname || log.url;
            const queryDisplay = log.search ? `<span class="log-query">${log.search}</span>` : '';
            
            return `
            <div class="log-item" data-log-id="${log.id}">
                <div class="log-header">
                    <div>
                        <span class="log-method ${log.method}">${log.method}</span>
                        <span class="log-time">${log.timestamp.toLocaleTimeString()}</span>
                        ${log.duration ? `<span class="log-duration">${log.duration}ms</span>` : ''}
                    </div>
                    <span class="log-status ${log.status >= 200 && log.status < 300 ? 'success' : log.status === 0 || log.status >= 400 ? 'error' : 'warning'}">
                        ${statusDisplay}
                    </span>
                </div>
                <div class="log-url">${urlDisplay}${queryDisplay}</div>
                <button class="log-toggle" onclick="toggleLogDetails(${log.id})">
                    查看详情
                </button>
                <div class="log-details" id="log-details-${log.id}" style="display: none;">
                    ${log.host ? `
                        <div class="log-section">
                            <h4>请求信息</h4>
                            <div class="log-content">
                                <div><strong>完整 URL:</strong> ${log.url}</div>
                                <div><strong>主机:</strong> ${log.host}</div>
                                <div><strong>协议:</strong> ${log.protocol}</div>
                                ${log.pathname ? `<div><strong>路径:</strong> ${log.pathname}</div>` : ''}
                                ${log.search ? `<div><strong>查询参数:</strong> ${log.search}</div>` : ''}
                            </div>
                        </div>
                    ` : ''}
                    
                    <div class="log-section">
                        <h4>请求头</h4>
                        <div class="log-content">
                            <pre>${JSON.stringify(log.headers, null, 2)}</pre>
                        </div>
                    </div>
                    
                    ${log.body ? `
                        <div class="log-section">
                            <h4>请求体</h4>
                            <div class="log-content">
                                <pre>${typeof log.body === 'string' ? log.body : JSON.stringify(log.body, null, 2)}</pre>
                            </div>
                        </div>
                    ` : ''}
                    
                    ${log.responseHeaders ? `
                        <div class="log-section">
                            <h4>响应头</h4>
                            <div class="log-content">
                                <pre>${JSON.stringify(log.responseHeaders, null, 2)}</pre>
                            </div>
                        </div>
                    ` : ''}
                    
                    ${log.response ? `
                        <div class="log-section">
                            <h4>响应体</h4>
                            <div class="log-content">
                                <pre>${typeof log.response === 'string' ? log.response : JSON.stringify(log.response, null, 2)}</pre>
                            </div>
                        </div>
                    ` : ''}
                    
                    ${log.responseSize ? `
                        <div class="log-section">
                            <h4>响应大小</h4>
                            <div class="log-content">${(log.responseSize / 1024).toFixed(2)} KB</div>
                        </div>
                    ` : ''}
                    
                    ${log.performance ? `
                        <div class="log-section">
                            <h4>性能指标</h4>
                            <div class="log-content">
                                <div><strong>开始时间:</strong> ${new Date(log.performance.startTime).toLocaleTimeString()}</div>
                                <div><strong>结束时间:</strong> ${new Date(log.performance.endTime).toLocaleTimeString()}</div>
                                <div><strong>总耗时:</strong> ${log.performance.duration}ms</div>
                            </div>
                        </div>
                    ` : ''}
                    
                    ${log.response && log.response.error ? `
                        <div class="log-section error">
                            <h4>错误信息</h4>
                            <div class="log-content">
                                <div><strong>错误类型:</strong> ${log.response.type || 'Unknown'}</div>
                                <div><strong>错误消息:</strong> ${log.response.error}</div>
                                ${log.response.stack ? `
                                    <div><strong>错误堆栈:</strong></div>
                                    <pre>${log.response.stack}</pre>
                                ` : ''}
                            </div>
                        </div>
                    ` : ''}
                </div>
            </div>
            `;
        }).join('');
    }
}

// 创建请求日志实例
const requestLogger = new RequestLogger();

// 添加 WebSocket 日志记录方法
requestLogger.addWebSocketLog = function(event, url, data = null, error = null) {
    const log = {
        id: Date.now(),
        timestamp: new Date(),
        method: 'WebSocket',
        url: url,
        headers: { 'Connection': 'Upgrade', 'Upgrade': 'websocket' },
        body: data ? JSON.stringify(data) : null,
        response: error ? { error: error } : { event: event },
        status: error ? 'error' : event,
        duration: 0
    };
    
    this.logs.unshift(log);
    if (this.logs.length > this.maxLogs) {
        this.logs.pop();
    }
    
    this.renderLogs();
    return log;
};

// 拦截 fetch 请求以记录日志
const originalFetch = window.fetch;
window.fetch = async function(...args) {
    const [url, options = {}] = args;
    const startTime = Date.now();
    
    // 解析 URL 以获取更多信息
    let parsedUrl;
    try {
        parsedUrl = new URL(url, window.location.origin);
    } catch {
        parsedUrl = { href: url, pathname: url, search: '' };
    }
    
    // 构建完整的请求头信息
    const requestHeaders = {
        ...options.headers,
        // 添加默认头信息（如果存在）
        'User-Agent': navigator.userAgent,
        'Referer': window.location.href,
        'Origin': window.location.origin
    };
    
    // 处理请求体
    let requestBody = options.body;
    if (requestBody) {
        if (typeof requestBody === 'string') {
            try {
                requestBody = JSON.parse(requestBody);
            } catch {
                // 保持原样
            }
        } else if (requestBody instanceof FormData) {
            requestBody = '<FormData>';
        } else if (requestBody instanceof Blob) {
            requestBody = `<Blob: ${requestBody.size} bytes>`;
        }
    }
    
    // 记录请求
    const logId = requestLogger.addLog(
        options.method || 'GET',
        parsedUrl.href,
        requestHeaders,
        requestBody,
        null,
        null
    );
    
    // 添加额外的请求信息
    requestLogger.updateLog(logId, {
        pathname: parsedUrl.pathname,
        search: parsedUrl.search,
        host: parsedUrl.host,
        protocol: parsedUrl.protocol
    });
    
    try {
        const response = await originalFetch.apply(this, args);
        const duration = Date.now() - startTime;
        
        // 获取响应头
        const responseHeaders = {};
        response.headers.forEach((value, key) => {
            responseHeaders[key] = value;
        });
        
        // 克隆响应以读取内容
        const responseClone = response.clone();
        let responseData;
        let responseSize = 0;
        
        try {
            const contentType = response.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
                responseData = await responseClone.json();
                responseSize = JSON.stringify(responseData).length;
            } else if (contentType.includes('text/')) {
                responseData = await responseClone.text();
                responseSize = responseData.length;
            } else {
                const blob = await responseClone.blob();
                responseSize = blob.size;
                responseData = `<${blob.type || 'Binary'}: ${blob.size} bytes>`;
            }
        } catch (error) {
            responseData = `Error parsing response: ${error.message}`;
        }
        
        // 更新日志
        requestLogger.updateLog(logId, {
            status: response.status,
            statusText: response.statusText,
            response: responseData,
            responseHeaders: responseHeaders,
            responseSize: responseSize,
            duration: duration,
            performance: {
                startTime: startTime,
                endTime: Date.now(),
                duration: duration
            }
        });
        
        return response;
    } catch (error) {
        const duration = Date.now() - startTime;
        requestLogger.updateLog(logId, {
            status: 0,
            statusText: 'Network Error',
            response: {
                error: error.message,
                stack: error.stack,
                type: error.name
            },
            duration: duration,
            performance: {
                startTime: startTime,
                endTime: Date.now(),
                duration: duration
            }
        });
        throw error;
    }
};

// 全局函数，用于切换日志详情
window.toggleLogDetails = function(logId) {
    const details = document.getElementById(`log-details-${logId}`);
    if (details) {
        details.style.display = details.style.display === 'none' ? 'block' : 'none';
    }
};

// 标签页管理
class TabManager {
    constructor() {
        this.tabs = document.querySelectorAll('.tab-btn');
        this.panes = document.querySelectorAll('.tab-pane');
        this.activeTab = 'chat';
        
        this.init();
    }

    init() {
        this.tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.dataset.tab;
                this.switchTab(tabName);
            });
        });
    }

    switchTab(tabName) {
        // 更新标签按钮状态
        this.tabs.forEach(tab => {
            if (tab.dataset.tab === tabName) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });
        
        // 更新标签内容
        this.panes.forEach(pane => {
            if (pane.id === `${tabName}-tab`) {
                pane.classList.add('active');
            } else {
                pane.classList.remove('active');
            }
        });
        
        this.activeTab = tabName;
    }
}

// 聊天消息管理
class ChatManager {
    constructor() {
        this.messagesContainer = document.getElementById('chat-messages');
    }

    addMessage(content, type = 'user', error = false) {
        // 移除欢迎消息
        const welcomeMsg = this.messagesContainer.querySelector('.welcome-message');
        if (welcomeMsg) {
            welcomeMsg.remove();
        }

        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type} ${error ? 'error' : ''}`;
        
        const contentDiv = document.createElement('div');
        contentDiv.textContent = content;
        messageDiv.appendChild(contentDiv);
        
        const timeDiv = document.createElement('div');
        timeDiv.className = 'message-time';
        timeDiv.textContent = new Date().toLocaleTimeString();
        messageDiv.appendChild(timeDiv);
        
        this.messagesContainer.appendChild(messageDiv);
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    clear() {
        this.messagesContainer.innerHTML = `
            <div class="welcome-message">
                <h2>欢迎使用 Gemini API 测试工具</h2>
                <p>请在下方输入消息开始测试</p>
            </div>
        `;
    }
}

// DOM 元素
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const micButton = document.getElementById('mic-button');
const micIcon = document.getElementById('mic-icon');
const audioVisualizer = document.getElementById('audio-visualizer');
const connectButton = document.getElementById('connect-button');
const cameraButton = document.getElementById('camera-button');
const cameraIcon = document.getElementById('camera-icon');
const stopVideoButton = document.getElementById('stop-video');
const screenButton = document.getElementById('screen-button');
const screenIcon = document.getElementById('screen-icon');
const screenContainer = document.getElementById('screen-container');
const screenPreview = document.getElementById('screen-preview');
const inputAudioVisualizer = document.getElementById('input-audio-visualizer');
const apiKeyInput = document.getElementById('api-key');
const voiceSelect = document.getElementById('voice-select');
const languageSelect = document.getElementById('language-select');
const fpsInput = document.getElementById('fps-input');
const systemInstructionInput = document.getElementById('system-instruction');
const applyConfigButton = document.getElementById('apply-config');
const responseTypeSelect = document.getElementById('response-type-select');
const apiFormatSelect = document.getElementById('api-format-select');
const modelSelect = document.getElementById('model-select');
const clearLogsBtn = document.getElementById('clear-logs');

// API Key 管理元素
const apiKeysList = document.getElementById('api-keys-list');
const newApiKeyInput = document.getElementById('new-api-key');
const addApiKeyBtn = document.getElementById('add-api-key');

// Auth Token 管理元素
const authTokensList = document.getElementById('auth-tokens-list');
const newAuthTokenInput = document.getElementById('new-auth-token');
const addAuthTokenBtn = document.getElementById('add-auth-token');

// 初始化管理器
const tabManager = new TabManager();
const chatManager = new ChatManager();

// 加载保存的设置
const savedApiKey = localStorage.getItem('gemini_api_key');
const savedVoice = localStorage.getItem('gemini_voice');
const savedLanguage = localStorage.getItem('gemini_language');
const savedFPS = localStorage.getItem('video_fps');
const savedSystemInstruction = localStorage.getItem('system_instruction');
const savedModel = localStorage.getItem('gemini_model');
const savedApiFormat = localStorage.getItem('api_format');

if (savedApiKey) apiKeyInput.value = savedApiKey;
if (savedVoice) voiceSelect.value = savedVoice;
if (savedFPS) fpsInput.value = savedFPS;
if (savedSystemInstruction) {
    systemInstructionInput.value = savedSystemInstruction;
} else {
    systemInstructionInput.value = CONFIG.SYSTEM_INSTRUCTION.TEXT;
}
if (savedModel) modelSelect.value = savedModel;
if (savedApiFormat) apiFormatSelect.value = savedApiFormat;

// 初始化语言选择
languages.forEach(lang => {
    const option = document.createElement('option');
    option.value = lang.code;
    option.textContent = lang.name;
    languageSelect.appendChild(option);
});
if (savedLanguage) languageSelect.value = savedLanguage;

// 状态变量
let isRecording = false;
let audioStreamer = null;
let audioCtx = null;
let isConnected = false;
let audioRecorder = null;
let isVideoActive = false;
let videoManager = null;
let isScreenSharing = false;
let screenRecorder = null;
let isUsingTool = false;
let client = null;

// 音频相关函数
function updateAudioVisualizer(volume, isInput = false) {
    const visualizer = isInput ? inputAudioVisualizer : audioVisualizer;
    const audioBar = visualizer.querySelector('.audio-bar') || document.createElement('div');
    
    if (!visualizer.contains(audioBar)) {
        audioBar.classList.add('audio-bar');
        visualizer.appendChild(audioBar);
    }
    
    audioBar.style.width = `${volume * 100}%`;
    if (volume > 0) {
        audioBar.classList.add('active');
    } else {
        audioBar.classList.remove('active');
    }
}

async function ensureAudioInitialized() {
    if (!audioCtx) {
        audioCtx = new AudioContext();
    }
    if (!audioStreamer) {
        audioStreamer = new AudioStreamer(audioCtx);
        await audioStreamer.addWorklet('vumeter-out', 'js/audio/worklets/vol-meter.js', (ev) => {
            updateAudioVisualizer(ev.data.volume);
        });
    }
    return audioStreamer;
}

// 更新连接诊断信息
function updateConnectionInfo(status, wsUrl = '-', tokenType = '-', apiFormat = '-', model = '-') {
    const connectionInfo = document.getElementById('connection-info');
    const connectionStatus = document.getElementById('connection-status');
    const wsUrlElement = document.getElementById('ws-url');
    const tokenTypeElement = document.getElementById('token-type');
    const apiFormatInfo = document.getElementById('api-format-info');
    const modelInfo = document.getElementById('model-info');
    
    if (connectionInfo) {
        connectionInfo.style.display = 'block';
    }
    
    if (connectionStatus) {
        connectionStatus.textContent = status;
        connectionStatus.className = '';
        if (status === '已连接') {
            connectionStatus.classList.add('connected');
        } else if (status === '未连接' || status.includes('错误')) {
            connectionStatus.classList.add('disconnected');
        } else if (status === '连接中...') {
            connectionStatus.classList.add('connecting');
        }
    }
    
    if (wsUrlElement) wsUrlElement.textContent = wsUrl;
    if (tokenTypeElement) tokenTypeElement.textContent = tokenType;
    if (apiFormatInfo) apiFormatInfo.textContent = apiFormat;
    if (modelInfo) modelInfo.textContent = model;
}

// WebSocket 连接管理
async function connectToWebsocket() {
    if (!apiKeyInput.value) {
        chatManager.addMessage('请输入验证令牌 (Auth Token)', 'system', true);
        return;
    }

    // 保存设置
    localStorage.setItem('gemini_api_key', apiKeyInput.value);
    localStorage.setItem('gemini_voice', voiceSelect.value);
    localStorage.setItem('gemini_language', languageSelect.value);
    localStorage.setItem('system_instruction', systemInstructionInput.value);
    localStorage.setItem('api_format', apiFormatSelect.value);
    localStorage.setItem('gemini_model', modelSelect.value);
    localStorage.setItem('video_fps', fpsInput.value);

    const config = {
        model: modelSelect.value || CONFIG.API.MODEL_NAME,
        generationConfig: {
            responseModalities: responseTypeSelect.value,
            speechConfig: {
                languageCode: languageSelect.value,
                voiceConfig: { 
                    prebuiltVoiceConfig: { 
                        voiceName: voiceSelect.value
                    }
                }
            },
        },
        systemInstruction: {
            parts: [{
                text: systemInstructionInput.value
            }],
        }
    };

    try {
        const useNativeFormat = apiFormatSelect.value === 'gemini';
        client = new MultimodalLiveClient({ useNativeFormat });
        
        // 构建 WebSocket URL（隐藏敏感信息）
        const wsUrl = client.baseUrl + '?key=***';
        
        // 判断令牌类型
        const tokenType = apiKeyInput.value.startsWith('AIza') ? 'API Key (不推荐)' : '验证令牌 (Auth Token)';
        
        // 更新连接诊断信息
        updateConnectionInfo(
            '连接中...',
            wsUrl,
            tokenType,
            useNativeFormat ? 'Gemini 原生格式' : 'OpenAI 格式',
            config.model
        );
        
        // 记录 WebSocket 连接尝试
        requestLogger.addWebSocketLog('connecting', wsUrl, {
            model: config.model,
            format: useNativeFormat ? 'Gemini Native' : 'OpenAI',
            responseModalities: config.generationConfig.responseModalities
        });
        
        setupClientEventListeners(client);
        
        await client.connect(config, apiKeyInput.value);
        isConnected = true;
        
        // 更新连接诊断信息为已连接
        updateConnectionInfo(
            '已连接',
            wsUrl,
            tokenType,
            useNativeFormat ? 'Gemini 原生格式' : 'OpenAI 格式',
            config.model
        );
        
        // 记录连接成功
        requestLogger.addWebSocketLog('connected', wsUrl);
        
        if (audioCtx && audioCtx.state === 'suspended') {
            await audioCtx.resume();
        }
        
        connectButton.textContent = '断开连接';
        connectButton.classList.add('connected');
        messageInput.disabled = false;
        sendButton.disabled = false;
        micButton.disabled = false;
        cameraButton.disabled = false;
        screenButton.disabled = false;
        
        chatManager.addMessage(`已连接到 Gemini API (${useNativeFormat ? '原生' : 'OpenAI'} 格式)`, 'system');
    } catch (error) {
        const errorMessage = error.message || '未知错误';
        const wsUrl = client ? client.baseUrl + '?key=***' : 'unknown';
        
        // 更新连接诊断信息为错误
        updateConnectionInfo(
            `连接错误: ${errorMessage}`,
            wsUrl,
            apiKeyInput.value.startsWith('AIza') ? 'API Key (不推荐)' : '验证令牌 (Auth Token)',
            apiFormatSelect.value === 'gemini' ? 'Gemini 原生格式' : 'OpenAI 格式',
            modelSelect.value || CONFIG.API.MODEL_NAME
        );
        
        // 记录连接错误
        requestLogger.addWebSocketLog('error', wsUrl, null, errorMessage);
        
        Logger.error('连接错误:', error);
        chatManager.addMessage(`连接错误: ${errorMessage}`, 'system', true);
        isConnected = false;
        client = null;
        connectButton.textContent = '连接 WebSocket';
        connectButton.classList.remove('connected');
        messageInput.disabled = true;
        sendButton.disabled = true;
        micButton.disabled = true;
        cameraButton.disabled = true;
        screenButton.disabled = true;
    }
}

function disconnectFromWebsocket() {
    if (client) {
        client.disconnect();
        client = null;
    }
    isConnected = false;
    if (audioStreamer) {
        audioStreamer.stop();
        if (audioRecorder) {
            audioRecorder.stop();
            audioRecorder = null;
        }
        isRecording = false;
        updateMicIcon();
    }
    connectButton.textContent = '连接 WebSocket';
    connectButton.classList.remove('connected');
    messageInput.disabled = true;
    sendButton.disabled = true;
    micButton.disabled = true;
    cameraButton.disabled = true;
    screenButton.disabled = true;
    chatManager.addMessage('已断开连接', 'system');
    
    // 更新连接诊断信息
    updateConnectionInfo('未连接');
    
    if (videoManager) {
        stopVideo();
    }
    
    if (screenRecorder) {
        stopScreenSharing();
    }
}

// 设置客户端事件监听器
function setupClientEventListeners(client) {
    client.on('open', () => {
        chatManager.addMessage('WebSocket 连接已打开', 'system');
        requestLogger.addWebSocketLog('open', client.baseUrl + '?key=***');
    });

    client.on('log', (log) => {
        chatManager.addMessage(`${log.type}: ${JSON.stringify(log.message)}`, 'system');
        // 记录重要的 WebSocket 事件
        if (log.type.includes('send') || log.type.includes('receive')) {
            requestLogger.addWebSocketLog(log.type, client.baseUrl + '?key=***', log.message);
        }
    });

    client.on('close', (event) => {
        chatManager.addMessage(`WebSocket 连接已关闭 (代码 ${event.code})`, 'system');
        requestLogger.addWebSocketLog('closed', client.baseUrl + '?key=***', {
            code: event.code,
            reason: event.reason || '未知原因'
        });
    });

    client.on('audio', async (data) => {
        try {
            if (audioCtx && audioCtx.state === 'suspended') {
                await audioCtx.resume();
            }
            const streamer = await ensureAudioInitialized();
            streamer.addPCM16(new Uint8Array(data));
        } catch (error) {
            chatManager.addMessage(`音频处理错误: ${error.message}`, 'system', true);
        }
    });

    client.on('content', (data) => {
        if (data.modelTurn) {
            if (data.modelTurn.parts.some(part => part.functionCall)) {
                isUsingTool = true;
                Logger.info('模型正在使用工具');
            } else if (data.modelTurn.parts.some(part => part.functionResponse)) {
                isUsingTool = false;
                Logger.info('工具使用完成');
            }

            const text = data.modelTurn.parts.map(part => part.text).join('');
            if (text) {
                chatManager.addMessage(text, 'assistant');
            }
        }
    });

    client.on('interrupted', () => {
        audioStreamer?.stop();
        isUsingTool = false;
        Logger.info('模型被中断');
        chatManager.addMessage('模型被中断', 'system');
    });

    client.on('setupcomplete', () => {
        chatManager.addMessage('设置完成', 'system');
    });

    client.on('turncomplete', () => {
        isUsingTool = false;
        chatManager.addMessage('回合完成', 'system');
    });

    client.on('error', (error) => {
        Logger.error('错误:', error);
        chatManager.addMessage(`错误: ${error.message}`, 'system', true);
        requestLogger.addWebSocketLog('error', client.baseUrl + '?key=***', null, error.message);
    });

    client.on('message', (message) => {
        if (message.error) {
            Logger.error('服务器错误:', message.error);
            chatManager.addMessage(`服务器错误: ${message.error}`, 'system', true);
            requestLogger.addWebSocketLog('server_error', client.baseUrl + '?key=***', null, message.error);
        }
    });
}

// 消息发送
function handleSendMessage() {
    const message = messageInput.value.trim();
    if (message && client) {
        chatManager.addMessage(message, 'user');
        client.send({ text: message });
        messageInput.value = '';
    }
}

// 麦克风相关
function updateMicIcon() {
    micIcon.textContent = isRecording ? 'mic_off' : 'mic';
    micButton.classList.toggle('active', isRecording);
}

async function handleMicToggle() {
    if (!isRecording) {
        try {
            await ensureAudioInitialized();
            audioRecorder = new AudioRecorder();
            
            const inputAnalyser = audioCtx.createAnalyser();
            inputAnalyser.fftSize = 256;
            const inputDataArray = new Uint8Array(inputAnalyser.frequencyBinCount);
            
            await audioRecorder.start((base64Data) => {
                if (client) {
                    if (isUsingTool) {
                        client.sendRealtimeInput([{
                            mimeType: "audio/pcm;rate=16000",
                            data: base64Data,
                            interrupt: true
                        }]);
                    } else {
                        client.sendRealtimeInput([{
                            mimeType: "audio/pcm;rate=16000",
                            data: base64Data
                        }]);
                    }
                }
                
                inputAnalyser.getByteFrequencyData(inputDataArray);
                const inputVolume = Math.max(...inputDataArray) / 255;
                updateAudioVisualizer(inputVolume, true);
            });

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const source = audioCtx.createMediaStreamSource(stream);
            source.connect(inputAnalyser);
            
            await audioStreamer.resume();
            isRecording = true;
            Logger.info('麦克风已启动');
            chatManager.addMessage('麦克风已启动', 'system');
            updateMicIcon();
            
            // 显示音频可视化
            document.querySelector('.audio-visualizers').style.display = 'flex';
        } catch (error) {
            Logger.error('麦克风错误:', error);
            chatManager.addMessage(`错误: ${error.message}`, 'system', true);
            isRecording = false;
            updateMicIcon();
        }
    } else {
        if (audioRecorder && isRecording) {
            audioRecorder.stop();
        }
        isRecording = false;
        chatManager.addMessage('麦克风已停止', 'system');
        updateMicIcon();
        updateAudioVisualizer(0, true);
        
        // 隐藏音频可视化
        document.querySelector('.audio-visualizers').style.display = 'none';
    }
}

// 视频相关
async function handleVideoToggle() {
    localStorage.setItem('video_fps', fpsInput.value);

    if (!isVideoActive) {
        try {
            if (!videoManager) {
                videoManager = new VideoManager();
            }
            
            await videoManager.start(fpsInput.value, (frameData) => {
                if (isConnected && client) {
                    client.sendRealtimeInput([frameData]);
                }
            });

            isVideoActive = true;
            cameraIcon.textContent = 'videocam_off';
            cameraButton.classList.add('active');
            chatManager.addMessage('摄像头已启动', 'system');
        } catch (error) {
            Logger.error('摄像头错误:', error);
            chatManager.addMessage(`错误: ${error.message}`, 'system', true);
            isVideoActive = false;
            videoManager = null;
            cameraIcon.textContent = 'videocam';
            cameraButton.classList.remove('active');
        }
    } else {
        stopVideo();
    }
}

function stopVideo() {
    if (videoManager) {
        videoManager.stop();
        videoManager = null;
    }
    isVideoActive = false;
    cameraIcon.textContent = 'videocam';
    cameraButton.classList.remove('active');
    chatManager.addMessage('摄像头已停止', 'system');
}

// 屏幕共享相关
async function handleScreenShare() {
    if (!isScreenSharing) {
        try {
            screenContainer.style.display = 'block';
            
            screenRecorder = new ScreenRecorder();
            await screenRecorder.start(screenPreview, (frameData) => {
                if (isConnected && client) {
                    client.sendRealtimeInput([{
                        mimeType: "image/jpeg",
                        data: frameData
                    }]);
                }
            });

            isScreenSharing = true;
            screenIcon.textContent = 'stop_screen_share';
            screenButton.classList.add('active');
            chatManager.addMessage('屏幕共享已启动', 'system');
        } catch (error) {
            Logger.error('屏幕共享错误:', error);
            chatManager.addMessage(`错误: ${error.message}`, 'system', true);
            isScreenSharing = false;
            screenIcon.textContent = 'screen_share';
            screenButton.classList.remove('active');
            screenContainer.style.display = 'none';
        }
    } else {
        stopScreenSharing();
    }
}

function stopScreenSharing() {
    if (screenRecorder) {
        screenRecorder.stop();
        screenRecorder = null;
    }
    isScreenSharing = false;
    screenIcon.textContent = 'screen_share';
    screenButton.classList.remove('active');
    screenContainer.style.display = 'none';
    chatManager.addMessage('屏幕共享已停止', 'system');
}

// API Key 管理
async function fetchApiKeys() {
    try {
        const response = await fetch('/api-keys', {
            credentials: 'include'
        });
        if (response.ok) {
            const apiKeys = await response.json();
            renderApiKeysList(apiKeys);
        }
    } catch (error) {
        chatManager.addMessage(`获取 API Key 失败: ${error.message}`, 'system', true);
    }
}

function renderApiKeysList(apiKeys) {
    apiKeysList.innerHTML = '';
    apiKeys.forEach(keyObj => {
        const keyItem = document.createElement('div');
        keyItem.className = 'key-item';
        
        const keyValue = document.createElement('div');
        keyValue.className = 'key-value';
        keyValue.textContent = keyObj.id || keyObj;
        
        const removeBtn = document.createElement('button');
        removeBtn.className = 'delete-btn';
        removeBtn.textContent = '删除';
        removeBtn.addEventListener('click', () => removeApiKey(keyObj.full || keyObj));
        
        keyItem.appendChild(keyValue);
        keyItem.appendChild(removeBtn);
        apiKeysList.appendChild(keyItem);
    });
}

async function addApiKey() {
    const key = newApiKeyInput.value.trim();
    if (!key) return;
    
    try {
        const response = await fetch('/api-keys', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'text/plain' },
            body: key
        });
        
        if (response.ok) {
            newApiKeyInput.value = '';
            chatManager.addMessage('API Key 添加成功', 'system');
            fetchApiKeys();
        }
    } catch (error) {
        chatManager.addMessage(`添加 API Key 失败: ${error.message}`, 'system', true);
    }
}

async function removeApiKey(key) {
    try {
        const response = await fetch('/api-keys', {
            method: 'DELETE',
            credentials: 'include',
            headers: { 'Content-Type': 'text/plain' },
            body: key
        });
        
        if (response.ok) {
            chatManager.addMessage('API Key 删除成功', 'system');
            fetchApiKeys();
        }
    } catch (error) {
        chatManager.addMessage(`删除 API Key 失败: ${error.message}`, 'system', true);
    }
}

// Auth Token 管理
async function fetchAuthTokens() {
    try {
        const response = await fetch('/auth-tokens', {
            credentials: 'include'
        });
        if (response.ok) {
            const authTokens = await response.json();
            renderAuthTokensList(authTokens);
        }
    } catch (error) {
        chatManager.addMessage(`获取验证令牌失败: ${error.message}`, 'system', true);
    }
}

function renderAuthTokensList(authTokens) {
    authTokensList.innerHTML = '';
    authTokens.forEach(tokenObj => {
        const tokenItem = document.createElement('div');
        tokenItem.className = 'token-item';
        
        const tokenValue = document.createElement('div');
        tokenValue.className = 'token-value';
        tokenValue.textContent = tokenObj.id || tokenObj;
        
        const removeBtn = document.createElement('button');
        removeBtn.className = 'delete-btn';
        removeBtn.textContent = '删除';
        removeBtn.addEventListener('click', () => removeAuthToken(tokenObj.full || tokenObj));
        
        tokenItem.appendChild(tokenValue);
        tokenItem.appendChild(removeBtn);
        authTokensList.appendChild(tokenItem);
    });
}

async function addAuthToken() {
    const token = newAuthTokenInput.value.trim();
    if (!token) return;
    
    try {
        const response = await fetch('/auth-tokens', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token })
        });
        
        if (response.ok) {
            newAuthTokenInput.value = '';
            chatManager.addMessage('验证令牌添加成功', 'system');
            fetchAuthTokens();
        }
    } catch (error) {
        chatManager.addMessage(`添加验证令牌失败: ${error.message}`, 'system', true);
    }
}

async function removeAuthToken(token) {
    try {
        const response = await fetch('/auth-tokens', {
            method: 'DELETE',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token })
        });
        
        if (response.ok) {
            chatManager.addMessage('验证令牌删除成功', 'system');
            fetchAuthTokens();
        }
    } catch (error) {
        chatManager.addMessage(`删除验证令牌失败: ${error.message}`, 'system', true);
    }
}

// 事件监听器
sendButton.addEventListener('click', handleSendMessage);
messageInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        handleSendMessage();
    }
});

micButton.addEventListener('click', handleMicToggle);
cameraButton.addEventListener('click', handleVideoToggle);
screenButton.addEventListener('click', handleScreenShare);
connectButton.addEventListener('click', () => {
    if (isConnected) {
        disconnectFromWebsocket();
    } else {
        connectToWebsocket();
    }
});

if (stopVideoButton) {
    stopVideoButton.addEventListener('click', stopVideo);
}

// 清空日志按钮
if (clearLogsBtn) {
    clearLogsBtn.addEventListener('click', () => {
        requestLogger.clearLogs();
    });
}

// API Key 管理事件
if (addApiKeyBtn) {
    addApiKeyBtn.addEventListener('click', addApiKey);
}

// Auth Token 管理事件
if (addAuthTokenBtn) {
    addAuthTokenBtn.addEventListener('click', addAuthToken);
}

// 保存设置按钮
if (applyConfigButton) {
    applyConfigButton.addEventListener('click', () => {
        // 保存所有设置
        localStorage.setItem('gemini_api_key', apiKeyInput.value);
        localStorage.setItem('gemini_voice', voiceSelect.value);
        localStorage.setItem('gemini_language', languageSelect.value);
        localStorage.setItem('system_instruction', systemInstructionInput.value);
        localStorage.setItem('api_format', apiFormatSelect.value);
        localStorage.setItem('gemini_model', modelSelect.value);
        localStorage.setItem('video_fps', fpsInput.value);
        
        chatManager.addMessage('设置已保存', 'system');
    });
}

// 屏幕共享关闭按钮
const screenCloseBtn = screenContainer?.querySelector('.close-button');
if (screenCloseBtn) {
    screenCloseBtn.addEventListener('click', stopScreenSharing);
}

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', () => {
    // 初始化按钮状态
    messageInput.disabled = true;
    sendButton.disabled = true;
    micButton.disabled = true;
    cameraButton.disabled = true;
    screenButton.disabled = true;
    connectButton.textContent = '连接 WebSocket';
    
    // 添加登出按钮事件处理
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if (confirm('确定要登出吗？')) {
                // 断开 WebSocket 连接
                if (isConnected) {
                    disconnectFromWebsocket();
                }
                
                // 执行登出
                fetch('/auth/logout', {
                    method: 'POST',
                    credentials: 'include'
                }).then(() => {
                    window.location.href = '/login.html';
                });
            }
        });
    }
    
    // 当切换到 API 管理标签时，自动加载数据
    tabManager.tabs.forEach(tab => {
        if (tab.dataset.tab === 'api-keys') {
            tab.addEventListener('click', () => {
                fetchApiKeys();
                fetchAuthTokens();
            });
        }
    });
});

// 导出全局函数供调试使用
window.requestLogger = requestLogger;
window.chatManager = chatManager;
window.tabManager = tabManager;
