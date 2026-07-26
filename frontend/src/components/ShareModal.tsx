import React, { useEffect, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  Modal,
  TouchableOpacity,
  FlatList,
  Image,
  Share,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import api from "../services/api";
import { getFullImageUrl } from "../config";

interface ShareModalProps {
  visible: boolean;
  post: any | null;
  onClose: () => void;
}

export const ShareModal: React.FC<ShareModalProps> = ({ visible, post, onClose }) => {
  const { colors } = useTheme();
  const [chatRooms, setChatRooms] = useState<any[]>([]);
  const [loadingRooms, setLoadingRooms] = useState<boolean>(false);
  const [sentMap, setSentMap] = useState<{ [roomId: string]: boolean }>({});

  const fetchRooms = async () => {
    setLoadingRooms(true);
    try {
      const response = await api.get("/direct/rooms");
      if (response.data && response.data.data) {
        setChatRooms(response.data.data);
      }
    } catch (err) {
      console.log("Error fetching rooms for share modal", err);
    } finally {
      setLoadingRooms(false);
    }
  };

  useEffect(() => {
    if (visible && post) {
      setSentMap({});
      fetchRooms();
    }
  }, [visible, post]);

  const handleNativeShare = async () => {
    if (!post) return;
    try {
      const shareUrl = `https://instagram.com/p/${post.id}`;
      const message = `@${post.user?.username || "user"} 님의 게시물을 확인해보세요!\n${post.caption || ""}\n${shareUrl}`;
      await Share.share({
        message,
        url: shareUrl,
        title: "Aura+n 게시물 공유",
      });
      onClose();
    } catch (error: any) {
      Alert.alert("공유 실패", error.message);
    }
  };

  const handleSendDM = async (roomId: string) => {
    if (!post) return;
    try {
      const shareMsg = `📸 [게시물 공유]\n@${post.user?.username} 님의 게시물:\n"${post.caption || "이미지 게시물"}"`;
      await api.post(`/direct/rooms/${roomId}/messages`, {
        content: shareMsg,
      });
      setSentMap((prev) => ({ ...prev, [roomId]: true }));
      Alert.alert("전송 완료", "다이렉트 메시지로 게시물을 전송했습니다.");
    } catch (e) {
      console.error("Error sending DM share", e);
      Alert.alert("오류", "메시지 전송에 실패했습니다.");
    }
  };

  if (!post) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity
          activeOpacity={1}
          style={[styles.modalContent, { backgroundColor: colors.bgCard }]}
        >
          {/* Header handle */}
          <View style={styles.handleBar} />

          <View style={styles.header}>
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>게시물 공유하기</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Quick Actions (Native Share, Copy Link) */}
          <View style={styles.quickActionsRow}>
            <TouchableOpacity style={styles.quickActionItem} onPress={handleNativeShare}>
              <View style={[styles.quickActionIcon, { backgroundColor: colors.accentBlue }]}>
                <Ionicons name="paper-plane-outline" size={22} color="#fff" />
              </View>
              <Text style={[styles.quickActionText, { color: colors.textPrimary }]}>외부 공유</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.quickActionItem} onPress={handleNativeShare}>
              <View style={[styles.quickActionIcon, { backgroundColor: colors.bgInput, borderColor: colors.borderColor, borderWidth: 1 }]}>
                <Ionicons name="link-outline" size={22} color={colors.textPrimary} />
              </View>
              <Text style={[styles.quickActionText, { color: colors.textPrimary }]}>링크 복사</Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>다이렉트 메시지 전송</Text>

          {loadingRooms ? (
            <ActivityIndicator size="small" color={colors.accentBlue} style={{ marginVertical: 20 }} />
          ) : (
            <FlatList
              data={chatRooms}
              keyExtractor={(item) => item.id}
              style={{ maxHeight: 240 }}
              renderItem={({ item }) => {
                const partner = item.target_user || {};
                const isSent = sentMap[item.id];

                return (
                  <View style={[styles.roomRow, { borderBottomColor: colors.borderColor }]}>
                    <View style={styles.roomUser}>
                      <Image
                        source={{ uri: getFullImageUrl(partner.profile_image_url) }}
                        style={styles.avatar}
                      />
                      <View>
                        <Text style={[styles.usernameText, { color: colors.textPrimary }]}>
                          {partner.username || "채팅 상대"}
                        </Text>
                        <Text style={[styles.fullNameText, { color: colors.textSecondary }]}>
                          {partner.full_name || ""}
                        </Text>
                      </View>
                    </View>

                    <TouchableOpacity
                      style={[
                        styles.sendBtn,
                        isSent
                          ? { backgroundColor: colors.bgInput }
                          : { backgroundColor: colors.accentBlue },
                      ]}
                      disabled={isSent}
                      onPress={() => handleSendDM(item.id)}
                    >
                      <Text style={[styles.sendBtnText, isSent && { color: colors.textMuted }]}>
                        {isSent ? "보냄" : "보내기"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              }}
              ListEmptyComponent={
                <Text style={[styles.emptyRoomsText, { color: colors.textMuted }]}>
                  개설된 1:1 대화방이 없습니다.
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
    paddingBottom: 30,
    paddingTop: 10,
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
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "bold",
  },
  quickActionsRow: {
    flexDirection: "row",
    gap: 20,
    marginBottom: 20,
  },
  quickActionItem: {
    alignItems: "center",
    gap: 6,
  },
  quickActionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  quickActionText: {
    fontSize: 12,
    fontWeight: "500",
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "bold",
    marginBottom: 10,
    textTransform: "uppercase",
  },
  roomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 0.5,
  },
  roomUser: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  usernameText: {
    fontSize: 14,
    fontWeight: "bold",
  },
  fullNameText: {
    fontSize: 12,
  },
  sendBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
  },
  sendBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "bold",
  },
  emptyRoomsText: {
    textAlign: "center",
    paddingVertical: 15,
    paddingHorizontal: 16,
    fontSize: 13,
    lineHeight: 18,
    width: "100%",
  },
});
