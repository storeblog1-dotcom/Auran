import api from "../../services/api";
import {
  CreateDirectMessage,
  DirectDeliveryState,
  DirectMessage,
  DirectMessageKind,
  DirectRoom,
  DirectUser,
} from "./types";

const unwrap = <T>(payload: { data?: T } | T): T => {
  if (
    payload &&
    typeof payload === "object" &&
    "data" in payload &&
    (payload as { data?: T }).data !== undefined
  ) {
    return (payload as { data: T }).data;
  }
  return payload as T;
};

const normalizeUser = (value: any): DirectUser => ({
  id: String(value?.id || value?.sender_id || ""),
  username: String(value?.username || ""),
  nickname: value?.nickname ?? null,
  full_name: value?.full_name ?? null,
  profile_image_url: value?.profile_image_url ?? null,
  is_admin: Boolean(value?.is_admin),
  is_online: Boolean(value?.is_online),
  last_seen_at: value?.last_seen_at ?? null,
});

const normalizeDeliveryState = (
  value: any,
  fallback: DirectDeliveryState
): DirectDeliveryState => {
  const normalized = String(value || "").toLowerCase();
  if (
    normalized === "pending" ||
    normalized === "failed" ||
    normalized === "sent" ||
    normalized === "delivered" ||
    normalized === "read"
  ) {
    return normalized;
  }
  return fallback;
};

export const normalizeDirectMessage = (
  value: any,
  fallbackStatus: DirectDeliveryState = "delivered"
): DirectMessage => ({
  id: String(value?.id || ""),
  room_id: String(value?.room_id || ""),
  sender: normalizeUser(value?.sender || { sender_id: value?.sender_id }),
  content: value?.content == null ? null : String(value.content),
  message_type: String(value?.message_type || "TEXT").toUpperCase() as DirectMessageKind,
  media_url: value?.media_url ?? null,
  shared_post_id: value?.shared_post_id == null
    ? null
    : String(value.shared_post_id),
  created_at: value?.created_at || new Date().toISOString(),
  client_message_id: value?.client_message_id ?? null,
  delivered_at: value?.delivered_at ?? null,
  read_at: value?.read_at ?? null,
  delivery_status: value?.delivery_status ?? null,
  local_status: value?.read_at
    ? "read"
    : value?.delivered_at
      ? "delivered"
      : normalizeDeliveryState(value?.delivery_status, fallbackStatus),
  error_message: null,
});

export const normalizeDirectRoom = (value: any): DirectRoom => ({
  id: String(value?.id || ""),
  is_group: Boolean(value?.is_group),
  name: value?.name ?? null,
  target_user: value?.target_user ? normalizeUser(value.target_user) : null,
  members: Array.isArray(value?.members)
    ? value.members.map(normalizeUser)
    : [],
  last_message: value?.last_message
    ? normalizeDirectMessage(value.last_message)
    : null,
  unread_count: Number(value?.unread_count || 0),
  request_status: value?.request_status || "ACCEPTED",
  is_outgoing_request: Boolean(value?.is_outgoing_request),
  request_message_count: Number(value?.request_message_count || 0),
  request_message_limit: Number(value?.request_message_limit || 5),
  can_send_message: value?.can_send_message !== false,
  can_share_post: value?.can_share_post !== false,
  message_permission_reason: value?.message_permission_reason ?? null,
  updated_at: value?.updated_at || new Date().toISOString(),
});

export const directApi = {
  async listRooms(): Promise<DirectRoom[]> {
    const response = await api.get("/direct/rooms");
    const values = unwrap<any[]>(response.data);
    return Array.isArray(values) ? values.map(normalizeDirectRoom) : [];
  },

  async listRequests(): Promise<DirectRoom[]> {
    const response = await api.get("/direct/requests");
    const values = unwrap<any[]>(response.data);
    return Array.isArray(values) ? values.map(normalizeDirectRoom) : [];
  },

  async listMessages(
    roomId: string,
    beforeMessageId?: string
  ): Promise<DirectMessage[]> {
    const response = await api.get(`/direct/rooms/${roomId}/messages`, {
      params: {
        limit: 100,
        mark_read: false,
        ...(beforeMessageId ? { before: beforeMessageId } : {}),
      },
    });
    const values = unwrap<any[]>(response.data);
    return Array.isArray(values)
      ? values.map((value) => normalizeDirectMessage(value))
      : [];
  },

  async sendMessage(
    roomId: string,
    message: CreateDirectMessage
  ): Promise<DirectMessage> {
    const response = await api.post(
      `/direct/rooms/${roomId}/messages`,
      message
    );
    return normalizeDirectMessage(unwrap(response.data), "sent");
  },

  async markRead(
    roomId: string,
    throughMessageId?: string
  ): Promise<void> {
    await api.post(`/direct/rooms/${roomId}/read`, {
      through_message_id: throughMessageId,
    });
  },

  async markDelivered(
    roomId: string,
    throughMessageId?: string
  ): Promise<void> {
    await api.post(`/direct/rooms/${roomId}/delivered`, {
      through_message_id: throughMessageId,
    });
  },

  async acceptRequest(roomId: string): Promise<DirectRoom> {
    const response = await api.post(`/direct/rooms/${roomId}/accept`);
    return normalizeDirectRoom(unwrap(response.data));
  },

  async rejectRequest(roomId: string): Promise<void> {
    await api.post(`/direct/rooms/${roomId}/reject`);
  },

  async blockRequest(roomId: string): Promise<void> {
    await api.post(`/direct/rooms/${roomId}/block`);
  },

  async createRoom(targetUserId: string): Promise<DirectRoom> {
    const response = await api.post("/direct/rooms", {
      target_user_id: targetUserId,
    });
    return normalizeDirectRoom(unwrap(response.data));
  },

  async searchUser(username: string): Promise<DirectUser> {
    const response = await api.get(`/users/${encodeURIComponent(username)}`);
    return normalizeUser(unwrap(response.data));
  },

  async listMutualFollowers(): Promise<DirectUser[]> {
    const response = await api.get("/users/me/mutual-followers");
    const values = unwrap<any[]>(response.data);
    return Array.isArray(values) ? values.map(normalizeUser) : [];
  },

  async getRoomPresence(
    roomId: string
  ): Promise<Array<{ user_id: string; last_active_at: string }>> {
    const response = await api.get(`/direct/rooms/${roomId}/presence`);
    const values = unwrap<any[]>(response.data);
    return Array.isArray(values)
      ? values.map((value) => ({
          user_id: String(value?.user_id || ""),
          last_active_at: String(value?.last_active_at || ""),
        }))
      : [];
  },
};
