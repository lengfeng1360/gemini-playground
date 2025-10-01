// 身份验证逻辑
(function() {
    'use strict';

    // 配置
    const MAX_ATTEMPTS = 5;
    const LOCKOUT_TIME = 15 * 60 * 1000; // 15分钟
    const SESSION_KEY = 'gemini_auth_session';
    const ATTEMPTS_KEY = 'gemini_auth_attempts';
    const LOCKOUT_KEY = 'gemini_auth_lockout';

    // DOM 元素
    const loginForm = document.getElementById('loginForm');
    const authTokenInput = document.getElementById('authToken');
    const submitBtn = document.getElementById('submitBtn');
    const errorMessage = document.getElementById('errorMessage');
    const attemptsWarning = document.getElementById('attemptsWarning');

    // 检查是否已经登录
    function checkExistingSession() {
        const session = localStorage.getItem(SESSION_KEY);
        if (session) {
            try {
                const sessionData = JSON.parse(session);
                if (sessionData.expiresAt > Date.now()) {
                    // 会话有效，延迟重定向到主页，避免循环
                    setTimeout(() => {
                        window.location.href = '/';
                    }, 200);
                    return true;
                } else {
                    // 会话过期，清除
                    localStorage.removeItem(SESSION_KEY);
                }
            } catch (e) {
                localStorage.removeItem(SESSION_KEY);
            }
        }
        return false;
    }

    // 检查是否被锁定
    function checkLockout() {
        const lockoutTime = localStorage.getItem(LOCKOUT_KEY);
        if (lockoutTime) {
            const lockoutEnd = parseInt(lockoutTime);
            if (Date.now() < lockoutEnd) {
                const remainingMinutes = Math.ceil((lockoutEnd - Date.now()) / 60000);
                showError(`账户已被锁定，请在 ${remainingMinutes} 分钟后重试`);
                submitBtn.disabled = true;
                return true;
            } else {
                // 锁定时间已过
                localStorage.removeItem(LOCKOUT_KEY);
                localStorage.removeItem(ATTEMPTS_KEY);
            }
        }
        return false;
    }

    // 获取失败尝试次数
    function getFailedAttempts() {
        const attempts = localStorage.getItem(ATTEMPTS_KEY);
        return attempts ? parseInt(attempts) : 0;
    }

    // 增加失败尝试次数
    function incrementFailedAttempts() {
        const attempts = getFailedAttempts() + 1;
        localStorage.setItem(ATTEMPTS_KEY, attempts.toString());
        
        if (attempts >= MAX_ATTEMPTS) {
            // 锁定账户
            const lockoutEnd = Date.now() + LOCKOUT_TIME;
            localStorage.setItem(LOCKOUT_KEY, lockoutEnd.toString());
            showError(`尝试次数过多，账户已被锁定 15 分钟`);
            submitBtn.disabled = true;
        } else if (attempts >= MAX_ATTEMPTS - 2) {
            // 显示警告
            attemptsWarning.textContent = `警告：您还有 ${MAX_ATTEMPTS - attempts} 次尝试机会`;
            attemptsWarning.style.display = 'block';
        }
        
        return attempts;
    }

    // 清除失败尝试
    function clearFailedAttempts() {
        localStorage.removeItem(ATTEMPTS_KEY);
        localStorage.removeItem(LOCKOUT_KEY);
        attemptsWarning.style.display = 'none';
    }

    // 显示错误信息
    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
        
        // 3秒后自动隐藏
        setTimeout(() => {
            errorMessage.style.display = 'none';
        }, 3000);
    }

    // 显示加载状态
    function setLoading(loading) {
        if (loading) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="loading"></span>验证中...';
        } else {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '验证身份';
        }
    }

    // 验证令牌
    async function verifyToken(token) {
        try {
            const response = await fetch('/auth/verify', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include', // 包含 Cookie
                body: JSON.stringify({ token })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                // 验证成功
                clearFailedAttempts();
                
                // 创建会话
                const sessionData = {
                    token: data.sessionToken || token,
                    expiresAt: Date.now() + (data.expiresIn || 24 * 60 * 60 * 1000) // 默认24小时
                };
                localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
                
                // 重定向到主页或返回页面
                const returnUrl = new URLSearchParams(window.location.search).get('return') || '/';
                window.location.href = returnUrl;
            } else {
                // 验证失败
                incrementFailedAttempts();
                showError(data.message || '验证令牌无效');
            }
        } catch (error) {
            console.error('验证错误:', error);
            showError('验证服务暂时不可用，请稍后重试');
        }
    }

    // 处理表单提交
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            if (checkLockout()) {
                return;
            }

            const token = authTokenInput.value.trim();
            if (!token) {
                showError('请输入验证令牌');
                return;
            }

            setLoading(true);
            await verifyToken(token);
            setLoading(false);
        });
    }

    // 页面加载时检查
    window.addEventListener('DOMContentLoaded', () => {
        // 只在登录页面执行这些操作
        if (window.location.pathname === '/login.html') {
            // 不自动检查会话，让用户手动登录
            // 这样避免了重定向循环
            
            // 检查是否被锁定
            checkLockout();
            
            // 聚焦输入框
            if (authTokenInput) {
                authTokenInput.focus();
            }
        }
    });

    // 导出会话管理函数供其他页面使用
    window.AuthManager = {
        // 检查是否已认证
        isAuthenticated: function() {
            const session = localStorage.getItem(SESSION_KEY);
            if (session) {
                try {
                    const sessionData = JSON.parse(session);
                    return sessionData.expiresAt > Date.now();
                } catch (e) {
                    return false;
                }
            }
            return false;
        },

        // 获取会话令牌
        getSessionToken: function() {
            const session = localStorage.getItem(SESSION_KEY);
            if (session) {
                try {
                    const sessionData = JSON.parse(session);
                    if (sessionData.expiresAt > Date.now()) {
                        return sessionData.token;
                    }
                } catch (e) {
                    return null;
                }
            }
            return null;
        },

        // 登出
        logout: async function() {
            // 调用服务器端登出接口
            try {
                await fetch('/auth/logout', {
                    method: 'POST',
                    credentials: 'include' // 包含 Cookie
                });
            } catch (error) {
                console.error('登出错误:', error);
            }
            
            // 清除本地存储
            localStorage.removeItem(SESSION_KEY);
            window.location.href = '/login.html';
        },

        // 要求认证
        requireAuth: function() {
            if (!this.isAuthenticated()) {
                const currentPath = window.location.pathname + window.location.search;
                window.location.href = `/login.html?return=${encodeURIComponent(currentPath)}`;
                return false;
            }
            return true;
        }
    };
})();
