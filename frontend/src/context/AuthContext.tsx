import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import api from "../services/api";
import { deactivateCurrentInstallationPushToken } from "../services/pushNotifications";
import { clearCommunityCache } from "../screens/CommunityScreen";

export interface User {
  id: string;
  username: string;
  nickname?: string;
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
  withdrawalPending: { deadline: string } | null;
  login: (data: any) => Promise<void>;
  register: (data: any) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  cancelWithdrawal: () => Promise<void>;
  leaveWithdrawalScreen: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [withdrawalPending, setWithdrawalPending] = useState<{ deadline: string } | null>(null);
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
        const withdrawalToken = await AsyncStorage.getItem("withdrawal_token");
        const withdrawalDeadline = await AsyncStorage.getItem("withdrawal_deadline");
        if (
          withdrawalToken
          && withdrawalDeadline
          && new Date(withdrawalDeadline).getTime() > Date.now()
        ) {
          if (mountedRef.current) {
            setWithdrawalPending({ deadline: withdrawalDeadline });
            setToken(null);
            setUser(null);
          }
          return;
        }
        await AsyncStorage.removeItem("withdrawal_token");
        await AsyncStorage.removeItem("withdrawal_deadline");
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
    if (tokenData.withdrawal_pending) {
      await AsyncStorage.removeItem("access_token");
      await AsyncStorage.removeItem("refresh_token");
      await AsyncStorage.setItem("withdrawal_token", accessToken);
      await AsyncStorage.setItem(
        "withdrawal_deadline",
        tokenData.withdrawal_deadline,
      );
      setToken(null);
      setUser(null);
      setWithdrawalPending({ deadline: tokenData.withdrawal_deadline });
      return;
    }
    await AsyncStorage.setItem("access_token", accessToken);
    if (tokenData.refresh_token) {
      await AsyncStorage.setItem("refresh_token", tokenData.refresh_token);
    }
    setToken(accessToken);
    setWithdrawalPending(null);
    await fetchCurrentUser();
  };

  const register = async (regData: any) => {
    await api.post("/auth/register", regData);
    // Automatic login after register
    await login({ identifier: regData.email, password: regData.password });
  };

  const logout = async () => {
    try {
      await deactivateCurrentInstallationPushToken();
    } catch {
      // Logout must still complete while offline. Invalid/expired tokens are
      // also retired by Expo ticket and receipt processing on the server.
    }
    clearCommunityCache();
    await AsyncStorage.removeItem("access_token");
    await AsyncStorage.removeItem("refresh_token");
    await AsyncStorage.removeItem("withdrawal_token");
    await AsyncStorage.removeItem("withdrawal_deadline");
    setToken(null);
    setUser(null);
    setWithdrawalPending(null);
  };

  const leaveWithdrawalScreen = async () => {
    await AsyncStorage.removeItem("withdrawal_token");
    await AsyncStorage.removeItem("withdrawal_deadline");
    setWithdrawalPending(null);
  };

  const cancelWithdrawal = async () => {
    const withdrawalToken = await AsyncStorage.getItem("withdrawal_token");
    if (!withdrawalToken) throw new Error("탈퇴 취소 인증이 만료되었습니다.");
    const response = await api.post(
      "/auth/withdraw/cancel",
      {},
      { headers: { Authorization: `Bearer ${withdrawalToken}` } },
    );
    const tokenData = response.data.data;
    await AsyncStorage.setItem("access_token", tokenData.access_token);
    await AsyncStorage.setItem("refresh_token", tokenData.refresh_token);
    await AsyncStorage.removeItem("withdrawal_token");
    await AsyncStorage.removeItem("withdrawal_deadline");
    setWithdrawalPending(null);
    setToken(tokenData.access_token);
    await fetchCurrentUser();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        withdrawalPending,
        login,
        register,
        logout,
        cancelWithdrawal,
        leaveWithdrawalScreen,
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
