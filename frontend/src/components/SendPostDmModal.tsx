import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import api from "../services/api";
import { getFullImageUrl } from "../config";

interface UserInfo {
  id: string;
  username: string;
  full_name?: string | null;
  profile_image_url?: string | null;
}

interface ChatRoom {
  id: string;
  target_user?: UserInfo | null;
  request_status?: string;
}

interface Recipient {
  user: UserInfo;
  roomId?: string;
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
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
  const [mutualFollowers, setMutualFollowers] = useState<UserInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [sendingUserId, setSendingUserId] = useState<string | null>(null);
  const [sentUserIds, setSentUserIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!visible || !post) return;

    const fetchRecipients = async () => {
      setLoading(true);
      setSentUserIds({});
      try {
        const [roomsResponse, followersResponse] = await Promise.all([
          api.get("/direct/rooms"),
          api.get("/users/me/mutual-followers"),
        ]);
        const roomItems = roomsResponse.data?.data || roomsResponse.data;
        const followerItems = followersResponse.data?.data || followersResponse.data;
        setChatRooms(Array.isArray(roomItems) ? roomItems : []);
        setMutualFollowers(Array.isArray(followerItems) ? followerItems : []);
      } catch (error) {
        console.error("Failed to load DM recipients", error);
        Alert.alert("오류", "메시지를 보낼 사용자를 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    };

    fetchRecipients();
  }, [visible, post]);

  const recipients = useMemo<Recipient[]>(() => {
    const recipientMap = new Map<string, Recipient>();

    mutualFollowers.forEach((user) => {
      recipientMap.set(user.id, { user });
    });
    chatRooms.forEach((room) => {
      if (!room.target_user || room.request_status === "PENDING") return;
      recipientMap.set(room.target_user.id, {
        user: room.target_user,
        roomId: room.id,
      });
    });

    return Array.from(recipientMap.values());
  }, [chatRooms, mutualFollowers]);

  const handleSendDm = async (recipient: Recipient) => {
    if (!post || sendingUserId || sentUserIds[recipient.user.id]) return;

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

      await api.post(`/direct/rooms/${roomId}/messages`, {
        content: `@${post.user?.username || "사용자"}님의 게시물을 보냈습니다.`,
        message_type: "POST",
        shared_post_id: post.id,
      });

      setSentUserIds((previous) => ({
        ...previous,
        [recipient.user.id]: true,
      }));
    } catch (error) {
      console.error("Failed to send post by DM", error);
      Alert.alert("전송 실패", "게시물을 메시지로 보내지 못했습니다.");
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
              메시지로 보내기
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

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

                return (
                  <View
                    style={[
                      styles.recipientRow,
                      { borderBottomColor: colors.borderColor },
                    ]}
                  >
                    <View style={styles.userInfo}>
                      <Image
                        source={{
                          uri: getFullImageUrl(item.user.profile_image_url),
                        }}
                        style={styles.avatar}
                      />
                      <View style={styles.userText}>
                        <Text
                          style={[styles.username, { color: colors.textPrimary }]}
                        >
                          {item.user.username}
                        </Text>
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
                      </View>
                    </View>

                    <TouchableOpacity
                      style={[
                        styles.sendButton,
                        {
                          backgroundColor: isSent
                            ? colors.bgInput
                            : colors.accentBlue,
                        },
                      ]}
                      disabled={isSending || isSent}
                      onPress={() => handleSendDm(item)}
                    >
                      {isSending ? (
                        <ActivityIndicator size="small" color="#ffffff" />
                      ) : (
                        <Text
                          style={[
                            styles.sendButtonText,
                            isSent && { color: colors.textMuted },
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
    maxHeight: 360,
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
