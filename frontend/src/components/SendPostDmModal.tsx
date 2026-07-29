import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import api from "../services/api";
import { getDisplayName } from "../utils/displayName";
import { AdminAvatar, AdminBadge } from "./AdminIdentity";

interface UserInfo {
  id: string;
  username: string;
  nickname?: string | null;
  full_name?: string | null;
  profile_image_url?: string | null;
  is_admin?: boolean;
}

interface ChatRoom {
  id: string;
  target_user?: UserInfo | null;
  request_status?: string;
  is_outgoing_request?: boolean;
  request_message_count?: number;
  request_message_limit?: number;
  can_send_message?: boolean;
  can_share_post?: boolean;
  message_permission_reason?: string | null;
}

interface Recipient {
  user: UserInfo;
  roomId?: string;
  requestStatus: string;
  requestMessageCount: number;
  requestMessageLimit: number;
  canSendMessage: boolean;
  canSharePost: boolean;
  permissionReason?: string | null;
  isAuthor?: boolean;
}

interface DirectMessageEligibility {
  target_user: UserInfo;
  room_id?: string | null;
  request_status: string;
  request_message_count: number;
  request_message_limit: number;
  can_send_message: boolean;
  can_share_post: boolean;
  message_permission_reason?: string | null;
}

interface SendPostDmModalProps {
  visible: boolean;
  post: any | null;
  onClose: () => void;
}

export const SendPostDmModal: React.FC<SendPostDmModalProps> = ({
  visible,
  post,
  onClose,
}) => {
  const { colors } = useTheme();
  const { user: currentUser } = useAuth();
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
  const [mutualFollowers, setMutualFollowers] = useState<UserInfo[]>([]);
  const [authorEligibility, setAuthorEligibility] =
    useState<DirectMessageEligibility | null>(null);
  const [loading, setLoading] = useState(false);
  const [sendingUserId, setSendingUserId] = useState<string | null>(null);
  const [sentUserIds, setSentUserIds] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!visible || !post) return;

    const fetchRecipients = async () => {
      setLoading(true);
      setSentUserIds({});
      setMessage("");
      setAuthorEligibility(null);
      try {
        const authorId = post.user?.id;
        const isOwnPost =
          post.is_mine ||
          authorId === currentUser?.id ||
          post.user?.username === currentUser?.username;
        const [roomsResponse, followersResponse, eligibilityResponse] = await Promise.all([
          api.get("/direct/rooms"),
          api.get("/users/me/mutual-followers"),
          authorId && !isOwnPost
            ? api.get(`/direct/eligibility/${authorId}`)
            : Promise.resolve(null),
        ]);
        const roomItems = roomsResponse.data?.data || roomsResponse.data;
        const followerItems = followersResponse.data?.data || followersResponse.data;
        setChatRooms(Array.isArray(roomItems) ? roomItems : []);
        setMutualFollowers(Array.isArray(followerItems) ? followerItems : []);
        if (eligibilityResponse) {
          const eligibility =
            eligibilityResponse.data?.data || eligibilityResponse.data;
          setAuthorEligibility(eligibility);
        }
      } catch (error) {
        console.error("Failed to load DM recipients", error);
        Alert.alert("오류", "메시지를 보낼 사용자를 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    };

    fetchRecipients();
  }, [visible, post, currentUser?.id, currentUser?.username]);

  const recipients = useMemo<Recipient[]>(() => {
    const recipientMap = new Map<string, Recipient>();

    mutualFollowers.forEach((user) => {
      recipientMap.set(user.id, {
        user,
        requestStatus: "ACCEPTED",
        requestMessageCount: 0,
        requestMessageLimit: 5,
        canSendMessage: true,
        canSharePost: true,
      });
    });
    chatRooms.forEach((room) => {
      if (!room.target_user) return;
      recipientMap.set(room.target_user.id, {
        user: room.target_user,
        roomId: room.id,
        requestStatus: room.request_status || "ACCEPTED",
        requestMessageCount: room.request_message_count || 0,
        requestMessageLimit: room.request_message_limit || 5,
        canSendMessage: room.can_send_message !== false,
        canSharePost: room.can_share_post !== false,
        permissionReason: room.message_permission_reason,
      });
    });

    if (authorEligibility) {
      recipientMap.set(authorEligibility.target_user.id, {
        user: authorEligibility.target_user,
        roomId: authorEligibility.room_id || undefined,
        requestStatus: authorEligibility.request_status,
        requestMessageCount: authorEligibility.request_message_count || 0,
        requestMessageLimit: authorEligibility.request_message_limit || 5,
        canSendMessage: authorEligibility.can_send_message,
        canSharePost: authorEligibility.can_share_post,
        permissionReason: authorEligibility.message_permission_reason,
        isAuthor: true,
      });
    }

    const items = Array.from(recipientMap.values());
    return items.sort((first, second) => Number(second.isAuthor) - Number(first.isAuthor));
  }, [authorEligibility, chatRooms, mutualFollowers]);

  const handleSendDm = async (recipient: Recipient) => {
    const note = message.trim();
    const needsRequestText = !recipient.canSharePost;
    if (
      !post ||
      !recipient.canSendMessage ||
      (needsRequestText && !note) ||
      sendingUserId ||
      sentUserIds[recipient.user.id]
    ) return;

    setSendingUserId(recipient.user.id);
    try {
      let roomId = recipient.roomId;
      if (!roomId) {
        const roomResponse = await api.post("/direct/rooms", {
          target_user_id: recipient.user.id,
        });
        const room = roomResponse.data?.data || roomResponse.data;
        roomId = room.id;
      }

      await api.post(
        `/direct/rooms/${roomId}/messages`,
        recipient.canSharePost
          ? {
              content: note || "게시물을 공유했습니다.",
              message_type: "POST",
              shared_post_id: post.id,
            }
          : {
              content: note,
              message_type: "TEXT",
            }
      );

      setSentUserIds((previous) => ({
        ...previous,
        [recipient.user.id]: true,
      }));
    } catch (error: any) {
      console.error("Failed to send post by DM", error);
      Alert.alert(
        "전송 실패",
        error.response?.data?.error?.message ||
          error.response?.data?.detail ||
          "게시물을 메시지로 보내지 못했습니다."
      );
    } finally {
      setSendingUserId(null);
    }
  };

  if (!post) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity
          activeOpacity={1}
          style={[styles.modalContent, { backgroundColor: colors.bgCard }]}
        >
          <View style={styles.handleBar} />
          <View style={styles.header}>
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
              메시지 보내기
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <TextInput
            style={[
              styles.messageInput,
              {
                backgroundColor: colors.bgInput,
                borderColor: colors.borderColor,
                color: colors.textPrimary,
              },
            ]}
            placeholder="보낼 메시지를 입력하세요"
            placeholderTextColor={colors.textMuted}
            value={message}
            onChangeText={setMessage}
            maxLength={500}
            multiline
          />

          {loading ? (
            <ActivityIndicator
              size="small"
              color={colors.accentBlue}
              style={styles.loading}
            />
          ) : (
            <FlatList
              data={recipients}
              keyExtractor={(item) => item.user.id}
              style={styles.list}
              renderItem={({ item }) => {
                const isSending = sendingUserId === item.user.id;
                const isSent = Boolean(sentUserIds[item.user.id]);
                const needsRequestText = !item.canSharePost;
                const isDisabled =
                  !item.canSendMessage || (needsRequestText && !message.trim());
                const statusText = item.isAuthor
                  ? item.requestStatus === "PENDING"
                    ? `작성자 · 승인 대기 · ${item.requestMessageCount}/${item.requestMessageLimit}`
                    : item.requestStatus === "NEW_REQUEST"
                      ? "작성자 · 메시지 요청"
                      : item.requestStatus === "ACCEPTED"
                        ? "작성자"
                        : `작성자 · ${item.permissionReason || "전송 불가"}`
                  : item.requestStatus === "PENDING"
                    ? `승인 대기 · ${item.requestMessageCount}/${item.requestMessageLimit}`
                    : item.permissionReason;

                return (
                  <View
                    style={[
                      styles.recipientRow,
                      { borderBottomColor: colors.borderColor },
                    ]}
                  >
                    <View style={styles.userInfo}>
                      <AdminAvatar user={item.user} style={styles.avatar} />
                      <View style={styles.userText}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Text
                            style={[styles.username, { color: colors.textPrimary }]}
                          >
                            {getDisplayName(item.user)}
                          </Text>
                          {item.user.is_admin && <AdminBadge />}
                        </View>
                        {!!item.user.full_name && (
                          <Text
                            style={[
                              styles.fullName,
                              { color: colors.textSecondary },
                            ]}
                          >
                            {item.user.full_name}
                          </Text>
                        )}
                        {!!statusText && (
                          <Text
                            style={[styles.statusText, { color: colors.textMuted }]}
                            numberOfLines={1}
                          >
                            {statusText}
                          </Text>
                        )}
                      </View>
                    </View>

                    <TouchableOpacity
                      style={[
                        styles.sendButton,
                        {
                          backgroundColor: isSent
                            ? colors.bgInput
                            : !isDisabled
                              ? colors.accentBlue
                              : colors.bgInput,
                        },
                      ]}
                      disabled={isSending || isSent || isDisabled}
                      onPress={() => handleSendDm(item)}
                    >
                      {isSending ? (
                        <ActivityIndicator size="small" color="#ffffff" />
                      ) : (
                        <Text
                          style={[
                            styles.sendButtonText,
                            (isSent || isDisabled) && { color: colors.textMuted },
                          ]}
                        >
                          {isSent ? "보냄" : "보내기"}
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                );
              }}
              ListEmptyComponent={
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                  메시지를 보낼 수 있는 사용자가 없습니다.
                </Text>
              }
            />
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 30,
  },
  handleBar: {
    width: 36,
    height: 4,
    backgroundColor: "#666",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
  },
  loading: {
    marginVertical: 36,
  },
  list: {
    maxHeight: 280,
  },
  messageInput: {
    minHeight: 44,
    maxHeight: 96,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    textAlignVertical: "top",
    marginBottom: 10,
  },
  recipientRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  userInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  userText: {
    flex: 1,
    marginLeft: 12,
  },
  username: {
    fontSize: 14,
    fontWeight: "700",
  },
  fullName: {
    fontSize: 12,
    marginTop: 2,
  },
  statusText: {
    fontSize: 11,
    marginTop: 2,
  },
  sendButton: {
    minWidth: 66,
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
  },
  emptyText: {
    textAlign: "center",
    paddingVertical: 36,
    fontSize: 13,
  },
});
