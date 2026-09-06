"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { authApi } from "../lib/api";

const AuthContext = createContext(undefined);

function getUserFromResponse(response) {
  const authenticatedUser = response?.user ?? response;

  if (
    !authenticatedUser ||
    typeof authenticatedUser !== "object" ||
    Array.isArray(authenticatedUser)
  ) {
    throw new Error("The authentication server returned an invalid user.");
  }

  return authenticatedUser;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const requestIdRef = useRef(0);

  useEffect(() => {
    let active = true;
    const requestId = ++requestIdRef.current;

    async function loadSession() {
      try {
        const response = await authApi.me();

        if (active && requestId === requestIdRef.current) {
          setUser(getUserFromResponse(response));
        }
      } catch {
        if (active && requestId === requestIdRef.current) {
          setUser(null);
        }
      } finally {
        if (active && requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    }

    loadSession();

    return () => {
      active = false;
    };
  }, []);

  const signup = useCallback(async (credentials) => {
    const requestId = ++requestIdRef.current;
    setLoading(true);

    try {
      const response = await authApi.signup(credentials);
      const authenticatedUser = getUserFromResponse(response);

      if (requestId === requestIdRef.current) {
        setUser(authenticatedUser);
      }

      return authenticatedUser;
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  const login = useCallback(async (credentials) => {
    const requestId = ++requestIdRef.current;
    setLoading(true);

    try {
      const response = await authApi.login(credentials);
      const authenticatedUser = getUserFromResponse(response);

      if (requestId === requestIdRef.current) {
        setUser(authenticatedUser);
      }

      return authenticatedUser;
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  const logout = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);

    try {
      const response = await authApi.logout();

      if (requestId === requestIdRef.current) {
        setUser(null);
      }

      return response;
    } catch (error) {
      const status = error?.status ?? error?.statusCode;

      if (status === 401) {
        if (requestId === requestIdRef.current) {
          setUser(null);
        }

        return null;
      }

      throw error;
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      signup,
      login,
      logout,
    }),
    [user, loading, signup, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider.");
  }

  return context;
}