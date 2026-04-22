"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { clearClientApiCache } from '@/lib/client-api';

interface AuthUser {
  id: string;
  username: string;
  email: string;
  name: string;
  role: string;
  tenantId: string;
  status: string;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  isAdmin: () => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const AUTH_USER_STORAGE_KEY = 'auth_user';

// 检查是否在浏览器环境中
const isBrowser = typeof window !== 'undefined';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const clearAuthState = useCallback(() => {
    if (isBrowser) {
      localStorage.removeItem('auth_token');
      sessionStorage.removeItem(AUTH_USER_STORAGE_KEY);
    }
    clearClientApiCache();
    setUser(null);
    setToken(null);
  }, []);

  const persistUser = useCallback((nextUser: AuthUser | null) => {
    if (!isBrowser) {
      return;
    }

    if (nextUser) {
      sessionStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(nextUser));
    } else {
      sessionStorage.removeItem(AUTH_USER_STORAGE_KEY);
    }
  }, []);

  const hydrateFromCookieSession = useCallback(async () => {
    console.log('[AuthProvider] hydrateFromCookieSession: 开始通过 Cookie 检查会话');

    try {
      const response = await fetch('/api/auth/me', {
        cache: 'no-store',
        credentials: 'include',
      });

      console.log('[AuthProvider] hydrateFromCookieSession: 响应状态:', response.status);

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          console.log('[AuthProvider] hydrateFromCookieSession: 会话有效');
          setUser(data.data);
          persistUser(data.data);
          if (isBrowser) {
            setToken(localStorage.getItem('auth_token'));
          }
          return true;
        }
      }

      console.log('[AuthProvider] hydrateFromCookieSession: 会话无效，清除本地状态');
      clearAuthState();
      return false;
    } catch (error) {
      console.error('[AuthProvider] hydrateFromCookieSession: 检查会话失败:', error);
      clearAuthState();
      return false;
    }
  }, [clearAuthState, persistUser]);

  // 验证 token 并获取用户信息
  const verifyToken = useCallback(async (tokenToVerify: string) => {
    console.log('[AuthProvider] verifyToken: 开始验证 token');
    
    try {
      const response = await fetch('/api/auth/me', {
        credentials: 'include',
        headers: {
          'Authorization': 'Bearer ' + tokenToVerify,
        },
      });

      console.log('[AuthProvider] verifyToken: 响应状态:', response.status);

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          console.log('[AuthProvider] verifyToken: 验证成功');
          setUser(data.data);
          persistUser(data.data);
          setToken(tokenToVerify);
          return true;
        }
      }
      
      console.log('[AuthProvider] verifyToken: 验证失败，清除状态');
      clearAuthState();
      return false;
    } catch (error) {
      console.error('[AuthProvider] verifyToken: 验证出错:', error);
      clearAuthState();
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [clearAuthState, persistUser]);

  // 客户端挂载后初始化
  useEffect(() => {
    if (!isBrowser) return;

    console.log('[AuthProvider] init: 开始初始化');

    const cachedToken = localStorage.getItem('auth_token');
    const cachedUser = sessionStorage.getItem(AUTH_USER_STORAGE_KEY);

    if (cachedToken) {
      setToken(cachedToken);
    }

    if (cachedUser) {
      try {
        setUser(JSON.parse(cachedUser) as AuthUser);
      } catch (error) {
        console.error('[AuthProvider] init: 解析缓存用户失败:', error);
        sessionStorage.removeItem(AUTH_USER_STORAGE_KEY);
      }
    }

    hydrateFromCookieSession().finally(() => {
      setIsLoading(false);
    });
  }, [hydrateFromCookieSession]);

  const refreshUser = useCallback(async () => {
    if (!isBrowser) return;

    setIsLoading(true);
    await hydrateFromCookieSession();
    setIsLoading(false);
  }, [hydrateFromCookieSession]);

  const login = useCallback(async (username: string, password: string) => {
    console.log('[AuthProvider] login: 开始登录, username:', username);
    
    // 发送登录请求
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    
    console.log('[AuthProvider] login: 响应状态:', response.status);
    
    const data = await response.json();
    console.log('[AuthProvider] login: 响应数据:', data);
    
    if (!response.ok || !data.success) {
      throw new Error(data.error || `登录失败: HTTP ${response.status}`);
    }
    
    if (!data.data?.token) {
      throw new Error('服务器未返回 token');
    }
    
    if (!data.data?.user) {
      throw new Error('服务器未返回用户信息');
    }
    
    // 保存 token 和用户信息
    console.log('[AuthProvider] login: 登录成功');
    if (isBrowser) {
      localStorage.setItem('auth_token', data.data.token);
    }
    clearClientApiCache();
    setUser(data.data.user);
    persistUser(data.data.user);
    setToken(data.data.token);
    setIsLoading(false);
  }, [persistUser]);

  const logout = useCallback(async () => {
    console.log('[AuthProvider] logout: 退出登录');
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error('[AuthProvider] logout: 服务端退出失败:', error);
    }

    if (isBrowser) {
      localStorage.removeItem('auth_token');
      sessionStorage.removeItem(AUTH_USER_STORAGE_KEY);
    }
    setUser(null);
    setToken(null);
    window.location.href = '/login';
  }, []);

  const isAdmin = useCallback(() => {
    return user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'tenant_admin';
  }, [user]);

  const value: AuthContextType = {
    user,
    token,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
    refreshUser,
    isAdmin,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
