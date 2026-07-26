import { Platform } from "react-native";
import Constants from "expo-constants";

/**
 * Detect the backend host IP based on the current environment:
 *  - Web: use window.location.hostname (same machine)
 *  - Expo Go on physical device: extract IP from Expo's debuggerHost
 *  - Android emulator: 10.0.2.2 maps to host loopback
 *  - iOS simulator / fallback: localhost
 */
const getHostIp = (): string => {
  // Expo Go on physical device — extract host IP from debuggerHost
  const debuggerHost =
    Constants.expoConfig?.hostUri ??
    (Constants as any).manifest?.debuggerHost ??
    (Constants as any).manifest2?.extra?.expoGo?.debuggerHost;

  if (debuggerHost) {
    const hostIp = debuggerHost.split(":")[0];
    if (hostIp && hostIp !== "localhost" && hostIp !== "127.0.0.1") {
      return hostIp;
    }
  }

  // Web browser
  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && window.location && window.location.hostname) {
      return window.location.hostname;
    }
    return "localhost";
  }

  // Android emulator fallback if debuggerHost is not present
  if (Platform.OS === "android") {
    return "10.0.2.2";
  }

  // Fallback to PC local network IP (172.30.1.31) for physical devices & Expo Go
  return "172.30.1.31";
};

const HOST_IP = getHostIp();

export const API_BASE_URL = `https://instagram-backend-110122614099.asia-northeast3.run.app/api/v1`;
export const WS_BASE_URL = `wss://instagram-backend-110122614099.asia-northeast3.run.app/api/v1`;

export const getFullImageUrl = (url?: string | null): string => {
  if (!url || !url.trim()) return "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `http://${HOST_IP}:8000${url.startsWith("/") ? "" : "/"}${url}`;
};


