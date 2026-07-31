import AsyncStorage from "@react-native-async-storage/async-storage";
import api from "./api";
import { WS_BASE_URL } from "../config";

export interface SenderSummary {
  id: string;
  username: string;
  nickname?: string | null;
  full_name: string;
  profile_image_url?: string | null;
  is_admin?: boolean;
}

export interface NotificationItem {
  id: string;
  recipient_id: string;
  sender: SenderSummary;
  type: "LIKE" | "COMMENT" | "FOLLOW" | "MENTION" | "DIRECT_MESSAGE" | "REPORT_RESULT" | "MODERATION_WARNING";
  message?: string | null;
  post_id?: string | null;
  comment_id?: string | null;
  direct_message_id?: string | null;
  is_read: boolean;
  created_at: string;
}

export interface NotificationListResponse {
  items: NotificationItem[];
  unread_count: number;
}

export const notificationService = {
  async getNotifications(limit = 30, offset = 0) {
    const res = await api.get<{ data: { items: NotificationItem[]; unread_count: number } }>(
      `/notifications?limit=${limit}&offset=${offset}`
    );
    return res.data.data;
  },

  async getUnreadCount() {
    const res = await api.get<{ data: { unread_count: number } }>("/notifications/unread-count");
    return res.data.data.unread_count;
  },

  async markAsRead(id: string) {
    const res = await api.patch(`/notifications/${id}/read`);
    return res.data;
  },

  async markAllAsRead() {
    const res = await api.patch("/notifications/read-all");
    return res.data;
  },

  subscribeWebSocket(
    onMessage: (data: any) => void,
    onStatusChange?: (status: "connected" | "disconnected" | "error") => void
  ): () => void {
    let cancelled = false;
    let ws: WebSocket | null = null;
    let pingInterval: ReturnType<typeof setInterval> | null = null;

    const clearPing = () => {
      if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
      }
    };

    void AsyncStorage.getItem("access_token")
      .then((token) => {
        if (cancelled || !token) {
          onStatusChange?.("disconnected");
          return;
        }

        const wsUrl =
          `${WS_BASE_URL}/notifications/ws?token=${encodeURIComponent(token)}`;
        const socket = new WebSocket(wsUrl);
        if (cancelled) {
          socket.close();
          return;
        }
        ws = socket;

        socket.onopen = () => {
          if (cancelled) return;
          onStatusChange?.("connected");
        };

        socket.onmessage = (event) => {
          if (cancelled) return;
          try {
            const parsed = JSON.parse(event.data);
            onMessage(parsed);
          } catch {
            // Ignore non-JSON WebSocket frames such as a pong response.
          }
        };

        socket.onerror = () => {
          if (cancelled) return;
          onStatusChange?.("error");
        };

        pingInterval = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send("ping");
          }
        }, 25000);

        socket.onclose = () => {
          clearPing();
          if (cancelled) return;
          onStatusChange?.("disconnected");
        };
      })
      .catch(() => {
        if (!cancelled) {
          onStatusChange?.("error");
        }
      });

    return () => {
      cancelled = true;
      clearPing();
      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        try {
          ws.close();
        } catch {
          // The socket may already have been closed by the native runtime.
        }
        ws = null;
      }
      onStatusChange?.("disconnected");
    };
  },
};
