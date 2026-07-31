import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE_URL } from "../config";

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

type FailedQueueItem = {
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
};

let isRefreshing = false;
let failedQueue: FailedQueueItem[] = [];

const processQueue = (error: unknown, token: string | null = null) => {
  isRefreshing = false;
  const queueToProcess = failedQueue;
  failedQueue = [];
  queueToProcess.forEach((promise) => {
    if (error) {
      promise.reject(error);
    } else if (token) {
      promise.resolve(token);
    }
  });
};

api.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem("access_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (!originalRequest) {
      return Promise.reject(error);
    }

    // Handle 401 Unauthorized with automatic refresh token retry
    if (error.response && error.response.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      // 1. /auth/login 401: return original error without modifying storage or refreshing
      if (originalRequest.url?.includes("/auth/login")) {
        return Promise.reject(error);
      }

      // 2. /auth/refresh 401: clear storage tokens and return original error
      if (originalRequest.url?.includes("/auth/refresh")) {
        await AsyncStorage.removeItem("access_token");
        await AsyncStorage.removeItem("refresh_token");
        return Promise.reject(error);
      }

      // 3. Protected API 401: handle single-flight Refresh Queue
      if (isRefreshing) {
        return new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
            }
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      isRefreshing = true;
      let initialRefreshToken: string | null = null;

      try {
        initialRefreshToken = await AsyncStorage.getItem("refresh_token");
        if (!initialRefreshToken) {
          throw new Error("No refresh token available");
        }

        // Apply explicit timeout to standalone axios.post call
        const res = await axios.post(
          `${API_BASE_URL}/auth/refresh`,
          { refresh_token: initialRefreshToken },
          { timeout: 10000 }
        );

        if (res.data && res.data.data && res.data.data.access_token) {
          const newAccessToken = res.data.data.access_token;
          const newRefreshToken = res.data.data.refresh_token;

          // Verify session hasn't changed (e.g., user logout or new login during in-flight refresh)
          const currentRefreshToken = await AsyncStorage.getItem("refresh_token");
          if (currentRefreshToken !== initialRefreshToken) {
            throw new Error("Session changed during token refresh");
          }

          await AsyncStorage.setItem("access_token", newAccessToken);
          if (newRefreshToken) {
            await AsyncStorage.setItem("refresh_token", newRefreshToken);
          }

          processQueue(null, newAccessToken);

          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
          }
          return api(originalRequest);
        } else {
          throw new Error("Invalid refresh token response");
        }
      } catch (refreshErr) {
        console.log("Token auto-refresh failed:", refreshErr);

        try {
          const latestRefreshToken = await AsyncStorage.getItem("refresh_token");
          if (latestRefreshToken === initialRefreshToken) {
            await AsyncStorage.removeItem("access_token");
            await AsyncStorage.removeItem("refresh_token");
          }
        } catch (storageErr) {
          console.log("Failed to cleanup storage tokens:", storageErr);
        } finally {
          processQueue(refreshErr, null);
        }

        return Promise.reject(refreshErr);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
