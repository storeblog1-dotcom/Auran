import api from "./api";
import { WS_BASE_URL } from "../config";

export interface SenderSummary {
  id: string;
  username: string;
  nickname?: string | null;
  full_name: string;
  profile_image_url?: string | null;
}

export interface NotificationItem {
  id: string;
  recipient_id: string;
  sender: SenderSummary;
  type: "LIKE" | "COMMENT" | "FOLLOW" | "MENTION" | "DIRECT_MESSAGE";
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

  subscribeWebSocket(userId: string, onMessage: (data: any) => void) {
    if (!userId) return null;
    const wsUrl = `${WS_BASE_URL}/notifications/ws?user_id=${userId}`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        onMessage(parsed);
      } catch (err) {
        // ignore non-json
      }
    };

    // Ping interval
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send("ping");
      }
    }, 25000);

    ws.onclose = () => {
      clearInterval(pingInterval);
    };

    return ws;
  },
};
