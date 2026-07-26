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

    // Handle 401 Unauthorized with automatic refresh token retry
    if (error.response && error.response.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      // Do not attempt refresh on auth endpoints to avoid infinite loop
      if (!originalRequest.url?.includes("/auth/login") && !originalRequest.url?.includes("/auth/refresh")) {
        try {
          const refreshToken = await AsyncStorage.getItem("refresh_token");
          if (refreshToken) {
            const res = await axios.post(`${API_BASE_URL}/auth/refresh`, {
              refresh_token: refreshToken,
            });

            if (res.data && res.data.data && res.data.data.access_token) {
              const newAccessToken = res.data.data.access_token;
              const newRefreshToken = res.data.data.refresh_token;

              await AsyncStorage.setItem("access_token", newAccessToken);
              if (newRefreshToken) {
                await AsyncStorage.setItem("refresh_token", newRefreshToken);
              }

              originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
              return api(originalRequest);
            }
          }
        } catch (refreshErr) {
          console.log("Token auto-refresh failed:", refreshErr);
        }
      }

      await AsyncStorage.removeItem("access_token");
      await AsyncStorage.removeItem("refresh_token");
    }

    return Promise.reject(error);
  }
);

export default api;
