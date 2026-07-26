import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import api from "../services/api";

export interface User {
  id: string;
  username: string;
  email: string;
  full_name: string;
  bio?: string;
  website?: string;
  is_private?: boolean;
  allow_message_requests?: boolean;
  is_admin?: boolean;
  profile_image_url?: string;
  posts_count?: number;
  followers_count?: number;
  following_count?: number;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (data: any) => Promise<void>;
  register: (data: any) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const mountedRef = useRef(true);

  const fetchCurrentUser = async (): Promise<boolean> => {
    try {
      const response = await api.get("/users/me");
      if (response.data && response.data.data) {
        if (mountedRef.current) setUser(response.data.data);
        return true;
      }
      return false;
    } catch (error) {
      console.log("Failed to fetch user me:", error);
      return false;
    }
  };

  useEffect(() => {
    mountedRef.current = true;

    let timerId: any;
    const startTime = Date.now();
    const MINIMUM_SPLASH_TIME = 3000; // 3 second splash screen delay (testing)

    const initAuth = async () => {
      try {
        const storedToken = await AsyncStorage.getItem("access_token");
        if (!storedToken) {
          if (mountedRef.current) {
            setToken(null);
            setUser(null);
          }
          return;
        }

        const res = await api.get("/users/me", {
          headers: { Authorization: `Bearer ${storedToken}` },
          timeout: 3000,
        });

        if (res.data && res.data.data && mountedRef.current) {
          setToken(storedToken);
          setUser(res.data.data);
        } else if (mountedRef.current) {
          await AsyncStorage.removeItem("access_token");
          await AsyncStorage.removeItem("refresh_token");
          setToken(null);
          setUser(null);
        }
      } catch (e) {
        console.log("Auth token validation failed", e);
        await AsyncStorage.removeItem("access_token");
        await AsyncStorage.removeItem("refresh_token");
        if (mountedRef.current) {
          setToken(null);
          setUser(null);
        }
      } finally {
        const elapsedTime = Date.now() - startTime;
        const remainingTime = Math.max(0, MINIMUM_SPLASH_TIME - elapsedTime);
        timerId = setTimeout(() => {
          if (mountedRef.current) {
            setIsLoading(false);
          }
        }, remainingTime);
      }
    };

    initAuth();

    return () => {
      mountedRef.current = false;
      if (timerId) clearTimeout(timerId);
    };
  }, []);

  const login = async (loginData: any) => {
    const res = await api.post("/auth/login", loginData);
    const tokenData = res.data.data;
    const accessToken = tokenData.access_token;
    await AsyncStorage.setItem("access_token", accessToken);
    if (tokenData.refresh_token) {
      await AsyncStorage.setItem("refresh_token", tokenData.refresh_token);
    }
    setToken(accessToken);
    await fetchCurrentUser();
  };

  const register = async (regData: any) => {
    await api.post("/auth/register", regData);
    // Automatic login after register
    await login({ identifier: regData.email, password: regData.password });
  };

  const logout = async () => {
    await AsyncStorage.removeItem("access_token");
    await AsyncStorage.removeItem("refresh_token");
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        login,
        register,
        logout,
        refreshProfile: async () => {
          await fetchCurrentUser();
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
