import api from "../../../services/api";
import { API_BASE_URL } from "../../../config";
import { DirectConversation, DirectMessage } from "../types/direct";

export const directService = {
  createOrGetConversation: async (targetUserId: string): Promise<DirectConversation> => {
    const res = await api.post("/direct/conversations", { target_user_id: targetUserId });
    const data = res.data?.data || res.data;
    return data;
  },

  getConversations: async (): Promise<DirectConversation[]> => {
    const res = await api.get("/direct/conversations");
    const data = res.data?.data || res.data;
    return Array.isArray(data) ? data : [];
  },

  getUnreadCount: async (): Promise<number> => {
    const res = await api.get("/direct/conversations-unread-count");
    return Math.max(0, Number(res.data?.data?.unread_count || 0));
  },

  getConversationById: async (conversationId: string): Promise<DirectConversation> => {
    const res = await api.get(`/direct/conversations/${conversationId}`);
    const data = res.data?.data || res.data;
    return data;
  },

  getMessages: async (
    conversationId: string,
    limit: number = 30,
    before?: string
  ): Promise<DirectMessage[]> => {
    const params: Record<string, any> = { limit };
    if (before) params.before = before;
    const res = await api.get(`/direct/conversations/${conversationId}/messages`, { params });
    const data = res.data?.data || res.data;
    return Array.isArray(data) ? data : [];
  },

  markConversationRead: async (conversationId: string): Promise<void> => {
    await api.post(`/direct/conversations/${conversationId}/read`);
  },

  sendMessage: async (conversationId: string, content: string): Promise<DirectMessage> => {
    const res = await api.post(`/direct/conversations/${conversationId}/messages`, {
      content,
    });
    const data = res.data?.data || res.data;
    return data;
  },

  getWebSocketUrl: (conversationId: string, token: string): string => {
    const wsBase = API_BASE_URL.replace(/^http/, "ws");
    return `${wsBase}/direct/conversations/${conversationId}/ws?token=${encodeURIComponent(token)}`;
  },
};
