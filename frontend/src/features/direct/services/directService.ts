import api from "../../../services/api";
import { DirectConversation } from "../types/direct";

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

  getConversationById: async (conversationId: string): Promise<DirectConversation> => {
    const res = await api.get(`/direct/conversations/${conversationId}`);
    const data = res.data?.data || res.data;
    return data;
  },
};
