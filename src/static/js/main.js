import { MultimodalLiveClient } from './core/websocket-client.js';
import { AudioStreamer } from './audio/audio-streamer.js';
import { AudioRecorder } from './audio/audio-recorder.js';
import { CONFIG } from './config/config.js';
import { Logger } from './utils/logger.js';
import { VideoManager } from './video/video-manager.js';
import { ScreenRecorder } from './video/screen-recorder.js';
import { languages } from './language-selector.js';

/**
 * @fileoverview Main entry point for the application.
 * Initializes and manages the UI, audio, video, and WebSocket interactions.
 */

// DOM Elements
const logsContainer = document.getElementById('logs-container');
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
const configToggle = document.getElementById('config-toggle');
const configContainer = document.getElementById('config-container');
const systemInstructionInput = document.getElementById('system-instruction');
systemInstructionInput.value = CONFIG.SYSTEM_INSTRUCTION.TEXT;
const applyConfigButton = document.getElementById('apply-config');
const responseTypeSelect = document.getElementById('response-type-select');
const apiFormatSelect = document.getElementById('api-format-select');

// 新增的 API Key 管理元素
const manageKeysBtn = document.getElementById('manage-keys-btn');
const apiKeysManager = document.getElementById('api-keys-manager');
const apiKeysList = document.getElementById('api-keys-list');
const newApiKeyInput = document.getElementById('new-api-key');
const addApiKeyBtn = document.getElementById('add-api-key');

// 新增的 Auth Token 管理元素
const manageAuthTokensBtn = document.getElementById('manage-auth-tokens-btn');
const authTokensManager = document.getElementById('auth-tokens-manager');
const authTokensList = document.getElementById('auth-tokens-list');
const newAuthTokenInput = document.getElementById('new-auth-token');
const addAuthTokenBtn = document.getElementById('add-auth-token');

// API Key 管理相关变量
let apiKeys = [];
let authTokens = [];


// Load saved values from localStorage
const savedApiKey = localStorage.getItem('gemini_api_key');
const savedVoice = localStorage.getItem('gemini_voice');
const savedLanguage = localStorage.getItem('gemini_language');
const savedFPS = localStorage.getItem('video_fps');
const savedSystemInstruction = localStorage.getItem('system_instruction');


if (savedApiKey) {
    apiKeyInput.value = savedApiKey;
}
if (savedVoice) {
    voiceSelect.value = savedVoice;
}

languages.forEach(lang => {
    const option = document.createElement('option');
    option.value = lang.code;
    option.textContent = lang.name;
    languageSelect.appendChild(option);
});

if (savedLanguage) {
    languageSelect.value = savedLanguage;
}

if (savedFPS) {
    fpsInput.value = savedFPS;
}
if (savedSystemInstruction) {
    systemInstructionInput.value = savedSystemInstruction;
    CONFIG.SYSTEM_INSTRUCTION.TEXT = savedSystemInstruction;
}

// Handle configuration panel toggle
configToggle.addEventListener('click', () => {
    configContainer.classList.toggle('active');
    configToggle.classList.toggle('active');
});

applyConfigButton.addEventListener('click', () => {
    configContainer.classList.toggle('active');
    configToggle.classList.toggle('active');
});

// State variables
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

// Multimodal Client - 将在连接时创建
let client = null;

/**
 * Logs a message to the UI.
 * @param {string} message - The message to log.
 * @param {string} [type='system'] - The type of the message (system, user, ai).
 */
function logMessage(message, type = 'system') {
    const logEntry = document.createElement('div');
    logEntry.classList.add('log-entry', type);

    const timestamp = document.createElement('span');
    timestamp.classList.add('timestamp');
    timestamp.textContent = new Date().toLocaleTimeString();
    logEntry.appendChild(timestamp);

    const emoji = document.createElement('span');
    emoji.classList.add('emoji');
    switch (type) {
        case 'system':
            emoji.textContent = '⚙️';
            break;
        case 'user':
            emoji.textContent = '🫵';
            break;
        case 'ai':
            emoji.textContent = '🤖';
            break;
    }
    logEntry.appendChild(emoji);

    const messageText = document.createElement('span');
    messageText.textContent = message;
    logEntry.appendChild(messageText);

    logsContainer.appendChild(logEntry);
    logsContainer.scrollTop = logsContainer.scrollHeight;
}

/**
 * Updates the microphone icon based on the recording state.
 */
function updateMicIcon() {
    micIcon.textContent = isRecording ? 'mic_off' : 'mic';
    micButton.style.backgroundColor = isRecording ? '#ea4335' : '#4285f4';
}

/**
 * Updates the audio visualizer based on the audio volume.
 * @param {number} volume - The audio volume (0.0 to 1.0).
 * @param {boolean} [isInput=false] - Whether the visualizer is for input audio.
 */
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

/**
 * Initializes the audio context and streamer if not already initialized.
 * @returns {Promise<AudioStreamer>} The audio streamer instance.
 */
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

/**
 * Handles the microphone toggle. Starts or stops audio recording.
 * @returns {Promise<void>}
 */
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
                            interrupt: true     // Model isn't interruptable when using tools, so we do it manually
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
            Logger.info('Microphone started');
            logMessage('Microphone started', 'system');
            updateMicIcon();
        } catch (error) {
            Logger.error('Microphone error:', error);
            logMessage(`Error: ${error.message}`, 'system');
            isRecording = false;
            updateMicIcon();
        }
    } else {
        if (audioRecorder && isRecording) {
            audioRecorder.stop();
        }
        isRecording = false;
        logMessage('Microphone stopped', 'system');
        updateMicIcon();
        updateAudioVisualizer(0, true);
    }
}

/**
 * Resumes the audio context if it's suspended.
 * @returns {Promise<void>}
 */
async function resumeAudioContext() {
    if (audioCtx && audioCtx.state === 'suspended') {
        await audioCtx.resume();
    }
}

/**
 * Connects to the WebSocket server.
 * @returns {Promise<void>}
 */
async function connectToWebsocket() {
    if (!apiKeyInput.value) {
        logMessage('Please input API Key', 'system');
        return;
    }

    // Save values to localStorage
    localStorage.setItem('gemini_api_key', apiKeyInput.value);
    localStorage.setItem('gemini_voice', voiceSelect.value);
    localStorage.setItem('gemini_language', languageSelect.value);
    localStorage.setItem('system_instruction', systemInstructionInput.value);
    localStorage.setItem('api_format', apiFormatSelect.value);

    const config = {
        model: CONFIG.API.MODEL_NAME,
        generationConfig: {
            responseModalities: responseTypeSelect.value,
            speechConfig: {
                languageCode: languageSelect.value,
                voiceConfig: { 
                    prebuiltVoiceConfig: { 
                        voiceName: voiceSelect.value    // You can change voice in the config.js file
                    }
                }
            },

        },
        systemInstruction: {
            parts: [{
                text: systemInstructionInput.value     // You can change system instruction in the config.js file
            }],
        }
    };  

    try {
        // 根据选择的 API 格式创建客户端
        const useNativeFormat = apiFormatSelect.value === 'gemini';
        client = new MultimodalLiveClient({ useNativeFormat });
        
        // 设置事件监听器
        setupClientEventListeners(client);
        
        await client.connect(config, apiKeyInput.value);
        isConnected = true;
        await resumeAudioContext();
        connectButton.textContent = 'Disconnect';
        connectButton.classList.add('connected');
        messageInput.disabled = false;
        sendButton.disabled = false;
        micButton.disabled = false;
        cameraButton.disabled = false;
        screenButton.disabled = false;
        logMessage(`Connected to Gemini Multimodal Live API (${useNativeFormat ? 'Native' : 'OpenAI'} format)`, 'system');
    } catch (error) {
        const errorMessage = error.message || 'Unknown error';
        Logger.error('Connection error:', error);
        logMessage(`Connection error: ${errorMessage}`, 'system');
        isConnected = false;
        client = null;
        connectButton.textContent = 'Connect';
        connectButton.classList.remove('connected');
        messageInput.disabled = true;
        sendButton.disabled = true;
        micButton.disabled = true;
        cameraButton.disabled = true;
        screenButton.disabled = true;
    }
}

/**
 * Disconnects from the WebSocket server.
 */
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
    connectButton.textContent = 'Connect';
    connectButton.classList.remove('connected');
    messageInput.disabled = true;
    sendButton.disabled = true;
    micButton.disabled = true;
    cameraButton.disabled = true;
    screenButton.disabled = true;
    logMessage('Disconnected from server', 'system');
    
    if (videoManager) {
        stopVideo();
    }
    
    if (screenRecorder) {
        stopScreenSharing();
    }
}

/**
 * Handles sending a text message.
 */
function handleSendMessage() {
    const message = messageInput.value.trim();
    if (message && client) {
        logMessage(message, 'user');
        client.send({ text: message });
        messageInput.value = '';
    }
}

// Event Listeners
function setupClientEventListeners(client) {
    client.on('open', () => {
        logMessage('WebSocket connection opened', 'system');
    });

    client.on('log', (log) => {
        logMessage(`${log.type}: ${JSON.stringify(log.message)}`, 'system');
    });

    client.on('close', (event) => {
        logMessage(`WebSocket connection closed (code ${event.code})`, 'system');
    });

    client.on('audio', async (data) => {
        try {
            await resumeAudioContext();
            const streamer = await ensureAudioInitialized();
            streamer.addPCM16(new Uint8Array(data));
        } catch (error) {
            logMessage(`Error processing audio: ${error.message}`, 'system');
        }
    });

    client.on('content', (data) => {
        if (data.modelTurn) {
            if (data.modelTurn.parts.some(part => part.functionCall)) {
                isUsingTool = true;
                Logger.info('Model is using a tool');
            } else if (data.modelTurn.parts.some(part => part.functionResponse)) {
                isUsingTool = false;
                Logger.info('Tool usage completed');
            }

            const text = data.modelTurn.parts.map(part => part.text).join('');
            if (text) {
                logMessage(text, 'ai');
            }
        }
    });

    client.on('interrupted', () => {
        audioStreamer?.stop();
        isUsingTool = false;
        Logger.info('Model interrupted');
        logMessage('Model interrupted', 'system');
    });

    client.on('setupcomplete', () => {
        logMessage('Setup complete', 'system');
    });

    client.on('turncomplete', () => {
        isUsingTool = false;
        logMessage('Turn complete', 'system');
    });

    client.on('error', (error) => {
        if (error instanceof ApplicationError) {
            Logger.error(`Application error: ${error.message}`, error);
        } else {
            Logger.error('Unexpected error', error);
        }
        logMessage(`Error: ${error.message}`, 'system');
    });

    client.on('message', (message) => {
        if (message.error) {
            Logger.error('Server error:', message.error);
            logMessage(`Server error: ${message.error}`, 'system');
        }
    });
}

sendButton.addEventListener('click', handleSendMessage);
messageInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        handleSendMessage();
    }
});

micButton.addEventListener('click', handleMicToggle);

connectButton.addEventListener('click', () => {
    if (isConnected) {
        disconnectFromWebsocket();
    } else {
        connectToWebsocket();
    }
});

messageInput.disabled = true;
sendButton.disabled = true;
micButton.disabled = true;
connectButton.textContent = 'Connect';

/**
 * Handles the video toggle. Starts or stops video streaming.
 * @returns {Promise<void>}
 */
async function handleVideoToggle() {
    Logger.info('Video toggle clicked, current state:', { isVideoActive, isConnected });
    
    localStorage.setItem('video_fps', fpsInput.value);

    if (!isVideoActive) {
        try {
            Logger.info('Attempting to start video');
            if (!videoManager) {
                videoManager = new VideoManager();
            }
            
            await videoManager.start(fpsInput.value,(frameData) => {
                if (isConnected && client) {
                    client.sendRealtimeInput([frameData]);
                }
            });

            isVideoActive = true;
            cameraIcon.textContent = 'videocam_off';
            cameraButton.classList.add('active');
            Logger.info('Camera started successfully');
            logMessage('Camera started', 'system');

        } catch (error) {
            Logger.error('Camera error:', error);
            logMessage(`Error: ${error.message}`, 'system');
            isVideoActive = false;
            videoManager = null;
            cameraIcon.textContent = 'videocam';
            cameraButton.classList.remove('active');
        }
    } else {
        Logger.info('Stopping video');
        stopVideo();
    }
}

/**
 * Stops the video streaming.
 */
function stopVideo() {
    if (videoManager) {
        videoManager.stop();
        videoManager = null;
    }
    isVideoActive = false;
    cameraIcon.textContent = 'videocam';
    cameraButton.classList.remove('active');
    logMessage('Camera stopped', 'system');
}

cameraButton.addEventListener('click', handleVideoToggle);
stopVideoButton.addEventListener('click', stopVideo);

cameraButton.disabled = true;

/**
 * Handles the screen share toggle. Starts or stops screen sharing.
 * @returns {Promise<void>}
 */
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
            Logger.info('Screen sharing started');
            logMessage('Screen sharing started', 'system');

        } catch (error) {
            Logger.error('Screen sharing error:', error);
            logMessage(`Error: ${error.message}`, 'system');
            isScreenSharing = false;
            screenIcon.textContent = 'screen_share';
            screenButton.classList.remove('active');
            screenContainer.style.display = 'none';
        }
    } else {
        stopScreenSharing();
    }
}

/**
 * Stops the screen sharing.
 */
function stopScreenSharing() {
    if (screenRecorder) {
        screenRecorder.stop();
        screenRecorder = null;
    }
    isScreenSharing = false;
    screenIcon.textContent = 'screen_share';
    screenButton.classList.remove('active');
    screenContainer.style.display = 'none';
    logMessage('Screen sharing stopped', 'system');
}

screenButton.addEventListener('click', handleScreenShare);
screenButton.disabled = true;

// API Key 管理功能
async function fetchApiKeys() {
    try {
        const response = await fetch('/api-keys', {
            credentials: 'include' // 包含 Cookie
        });
        if (response.ok) {
            apiKeys = await response.json();
            renderApiKeysList();
        } else {
            logMessage('Failed to fetch API keys', 'system');
        }
    } catch (error) {
        logMessage(`Error fetching API keys: ${error.message}`, 'system');
    }
}

function renderApiKeysList() {
    apiKeysList.innerHTML = '';
    apiKeys.forEach((keyObj, index) => {
        const keyItem = document.createElement('div');
        keyItem.className = 'api-key-item';
        
        const keyValue = document.createElement('div');
        keyValue.className = 'api-key-value';
        // 显示部分隐藏的 API Key
        keyValue.textContent = keyObj.id || keyObj;
        
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-api-key';
        removeBtn.textContent = 'Remove';
        removeBtn.addEventListener('click', () => removeApiKey(keyObj.full || keyObj));
        
        keyItem.appendChild(keyValue);
        keyItem.appendChild(removeBtn);
        apiKeysList.appendChild(keyItem);
    });
}

async function addApiKey() {
    const key = newApiKeyInput.value.trim();
    if (!key) {
        logMessage('Please enter an API key', 'system');
        return;
    }
    
    try {
        const response = await fetch('/api-keys', {
            method: 'POST',
            credentials: 'include', // 包含 Cookie
            headers: {
                'Content-Type': 'text/plain'
            },
            body: key
        });
        
        if (response.ok) {
            newApiKeyInput.value = '';
            logMessage('API key added successfully', 'system');
            fetchApiKeys(); // 重新获取并显示更新后的列表
        } else {
            logMessage('Failed to add API key', 'system');
        }
    } catch (error) {
        logMessage(`Error adding API key: ${error.message}`, 'system');
    }
}

async function removeApiKey(key) {
    try {
        const response = await fetch('/api-keys', {
            method: 'DELETE',
            credentials: 'include', // 包含 Cookie
            headers: {
                'Content-Type': 'text/plain'
            },
            body: key
        });
        
        if (response.ok) {
            logMessage('API key removed successfully', 'system');
            fetchApiKeys(); // 重新获取并显示更新后的列表
        } else {
            logMessage('Failed to remove API key', 'system');
        }
    } catch (error) {
        logMessage(`Error removing API key: ${error.message}`, 'system');
    }
}

// 事件监听器
manageKeysBtn.addEventListener('click', () => {
    apiKeysManager.style.display = apiKeysManager.style.display === 'none' ? 'block' : 'none';
    if (apiKeysManager.style.display === 'block') {
        fetchApiKeys(); // 显示管理器时获取最新的 API Key 列表
    }
});

addApiKeyBtn.addEventListener('click', addApiKey);

// Auth Token 管理功能
async function fetchAuthTokens() {
    try {
        const response = await fetch('/auth-tokens', {
            credentials: 'include' // 包含 Cookie
        });
        if (response.ok) {
            authTokens = await response.json();
            renderAuthTokensList();
        } else {
            logMessage('Failed to fetch auth tokens', 'system');
        }
    } catch (error) {
        logMessage(`Error fetching auth tokens: ${error.message}`, 'system');
    }
}

function renderAuthTokensList() {
    authTokensList.innerHTML = '';
    authTokens.forEach((tokenObj) => {
        const tokenItem = document.createElement('div');
        tokenItem.className = 'api-key-item'; // 复用相同的样式
        
        const tokenValue = document.createElement('div');
        tokenValue.className = 'api-key-value';
        // 显示部分隐藏的 Auth Token
        tokenValue.textContent = tokenObj.id || tokenObj;
        
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-api-key';
        removeBtn.textContent = 'Remove';
        removeBtn.addEventListener('click', () => removeAuthToken(tokenObj.full || tokenObj));
        
        tokenItem.appendChild(tokenValue);
        tokenItem.appendChild(removeBtn);
        authTokensList.appendChild(tokenItem);
    });
}

async function addAuthToken() {
    const token = newAuthTokenInput.value.trim();
    if (!token) {
        logMessage('Please enter an auth token', 'system');
        return;
    }
    
    try {
        const response = await fetch('/auth-tokens', {
            method: 'POST',
            credentials: 'include', // 包含 Cookie
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ token })
        });
        
        if (response.ok) {
            newAuthTokenInput.value = '';
            logMessage('Auth token added successfully', 'system');
            fetchAuthTokens(); // 重新获取并显示更新后的列表
        } else {
            const error = await response.json();
            logMessage(`Failed to add auth token: ${error.message}`, 'system');
        }
    } catch (error) {
        logMessage(`Error adding auth token: ${error.message}`, 'system');
    }
}

async function removeAuthToken(token) {
    try {
        const response = await fetch('/auth-tokens', {
            method: 'DELETE',
            credentials: 'include', // 包含 Cookie
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ token })
        });
        
        if (response.ok) {
            logMessage('Auth token removed successfully', 'system');
            fetchAuthTokens(); // 重新获取并显示更新后的列表
        } else {
            logMessage('Failed to remove auth token', 'system');
        }
    } catch (error) {
        logMessage(`Error removing auth token: ${error.message}`, 'system');
    }
}

// Auth Token 管理事件监听器
manageAuthTokensBtn.addEventListener('click', () => {
    authTokensManager.style.display = authTokensManager.style.display === 'none' ? 'block' : 'none';
    if (authTokensManager.style.display === 'block') {
        fetchAuthTokens(); // 显示管理器时获取最新的 Auth Token 列表
    }
});

addAuthTokenBtn.addEventListener('click', addAuthToken);

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', () => {
    // 可以在这里添加初始化代码
    
    // 添加登出按钮事件处理
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if (confirm('确定要登出吗？')) {
                if (typeof AuthManager !== 'undefined') {
                    AuthManager.logout();
                }
            }
        });
    }
});
