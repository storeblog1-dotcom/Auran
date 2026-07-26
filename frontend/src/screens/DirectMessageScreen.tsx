import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Modal,
  TextInput,
  RefreshControl,
  StatusBar,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import api from "../services/api";
import { getFullImageUrl } from "../config";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";

interface UserInfo {
  id: string;
  username: string;
  full_name: string;
  profile_image_url: string | null;
}

interface LastMessage {
  id: string;
  content: string | null;
  message_type: string;
  created_at: string;
  sender: UserInfo;
}

interface ChatRoom {
  id: string;
  is_group: boolean;
  name: string | null;
  target_user: UserInfo | null;
  members: UserInfo[];
  last_message: LastMessage | null;
  unread_count: number;
  updated_at: string;
}

export const DirectMessageScreen = ({ navigation, route }: any) => {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const isTabScreen = route?.name === "Messages";
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [targetUsernameInput, setTargetUsernameInput] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [mutualFollowers, setMutualFollowers] = useState<UserInfo[]>([]);
  const [loadingMutual, setLoadingMutual] = useState(false);
  const fetchRooms = useCallback(async () => {
    try {
      const response = await api.get("/direct/rooms");
      const roomItems = response.data?.data || response.data;
      setRooms(Array.isArray(roomItems) ? roomItems : []);
    } catch (error) {
      console.error("Failed to fetch chat rooms", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const safetyTimeout = setTimeout(() => setLoading(false), 2000);
    const unsubscribe = navigation.addListener("focus", () => {
      fetchRooms();
    });
    fetchRooms().finally(() => clearTimeout(safetyTimeout));
    return () => {
      clearTimeout(safetyTimeout);
      unsubscribe();
    };
  }, [navigation, fetchRooms]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchRooms();
  };

  const fetchMutualFollowers = useCallback(async () => {
    setLoadingMutual(true);
    try {
      const response = await api.get("/users/me/mutual-followers");
      if (response.data && response.data.data) {
        setMutualFollowers(response.data.data);
      }
    } catch (err) {
      console.log("Error fetching mutual followers", err);
    } finally {
      setLoadingMutual(false);
    }
  }, []);

  useEffect(() => {
    if (modalVisible) {
      fetchMutualFollowers();
    }
  }, [modalVisible, fetchMutualFollowers]);

  const startChatWithUser = async (targetUser: UserInfo) => {
    try {
      const response = await api.post("/direct/rooms", { target_user_id: targetUser.id });
      setModalVisible(false);
      setTargetUsernameInput("");
      navigation.navigate("ChatRoom", {
        roomId: response.data.id,
        targetUser: targetUser,
        autoFocus: true,
      });
    } catch (error) {
      console.error("Failed to create room", error);
      Alert.alert("오류", "대화방을 생성할 수 없습니다.");
    }
  };

  const handleSearchClick = async () => {
    if (!targetUsernameInput.trim()) {
      Alert.alert("알림", "찾고자 하는 사용자 아이디를 입력해 주세요.");
      return;
    }
    const cleanUsername = targetUsernameInput.trim().replace(/^@/, "");
    setSearchLoading(true);
    try {
      const userRes = await api.get(`/users/${cleanUsername}`);
      if (userRes.data && userRes.data.data) {
        const targetUser = userRes.data.data;
        await startChatWithUser({
          id: targetUser.id,
          username: targetUser.username,
          full_name: targetUser.full_name,
          profile_image_url: targetUser.profile_image_url,
        });
      } else {
        throw new Error("User not found");
      }
    } catch (err) {
      Alert.alert("알림", `@${cleanUsername} 님은 존재하지 않는 사용자 아이디입니다.`);
    } finally {
      setSearchLoading(false);
    }
  };

  const formatTime = (isoString?: string) => {
    if (!isoString) return "";
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    if (diffMins < 1) return "방금 전";
    if (diffMins < 60) return `${diffMins}분 전`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}시간 전`;
    return `${Math.floor(diffHours / 24)}일 전`;
  };

  const renderRoomItem = ({ item }: { item: ChatRoom }) => {
    const target = item.target_user;
    const avatarUrl = getFullImageUrl(target?.profile_image_url);

    const lastMsgText = item.last_message
      ? item.last_message.message_type?.toUpperCase() === "IMAGE"
        ? "📷 사진"
        : item.last_message.message_type?.toUpperCase() === "POST"
          ? "게시물"
        : item.last_message.content || "메시지"
      : "대화를 시작해보세요.";

    return (
      <TouchableOpacity
        style={[styles.roomItem, { borderBottomColor: colors.borderColor }]}
        activeOpacity={0.7}
        onPress={() =>
          navigation.navigate("ChatRoom", {
            roomId: item.id,
            targetUser: target,
          })
        }
      >
        <Image source={{ uri: avatarUrl }} style={styles.avatar} />
        <View style={styles.roomInfo}>
          <Text style={[styles.username, { color: colors.textPrimary }]}>{target?.full_name || target?.username || "대화 상대"}</Text>
          <Text
            style={[
              styles.lastMessage,
              { color: colors.textSecondary },
              item.unread_count > 0 && { color: colors.textPrimary, fontWeight: "bold" },
            ]}
            numberOfLines={1}
          >
            {lastMsgText}
          </Text>
        </View>
        <View style={styles.metaContainer}>
          <Text style={[styles.timeText, { color: colors.textMuted }]}>{formatTime(item.updated_at)}</Text>
          {item.unread_count > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadCount}>
                {item.unread_count > 99 ? "99+" : item.unread_count}
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bgPrimary, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.borderColor }]}>
        {isTabScreen ? (
          <View style={styles.backButton} />
        ) : (
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
          </TouchableOpacity>
        )}
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>메시지</Text>
        <TouchableOpacity onPress={() => setModalVisible(true)} style={styles.newChatButton}>
          <Ionicons name="create-outline" size={25} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Main List */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.accentBlue} />
        </View>
      ) : (
        <FlatList
          data={rooms}
          keyExtractor={(item) => item.id}
          renderItem={renderRoomItem}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textPrimary} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="chatbubbles-outline" size={48} color={colors.textSecondary} style={{ marginBottom: 12 }} />
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>메시지가 없습니다</Text>
              <Text style={[styles.emptySub, { color: colors.textSecondary }]}>친구들에게 메시지를 보내 대화를 시작해보세요.</Text>
              <TouchableOpacity
                style={styles.startBtn}
                onPress={() => setModalVisible(true)}
              >
                <Text style={styles.startBtnText}>메시지 보내기</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      {/* New Chat Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent={false}>
        <View style={[styles.modalContainer, { backgroundColor: colors.bgPrimary, paddingTop: insets.top }]}>
          {/* Header */}
          <View style={[styles.modalHeader, { borderBottomColor: colors.borderColor }]}>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Text style={[styles.cancelText, { color: colors.accentBlue }]}>취소</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>새 대화 시작</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* Mutual Followers List */}
          <View style={[styles.sectionHeader, { borderBottomColor: colors.borderColor }]}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              맞팔로우한 친구 목록
            </Text>
          </View>

          {loadingMutual ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.accentBlue} />
            </View>
          ) : mutualFollowers.length === 0 ? (
            <View style={styles.emptyMutualContainer}>
              <Ionicons name="people-outline" size={40} color={colors.textMuted} style={{ marginBottom: 8 }} />
              <Text style={[styles.emptyMutualText, { color: colors.textSecondary }]}>
                아직 맞팔로우한 친구가 없습니다.
              </Text>
              <Text style={[styles.emptyMutualSub, { color: colors.textMuted }]}>
                상대방과 서로 팔로우를 맺으면 이곳에 표시됩니다.
              </Text>
            </View>
          ) : (
            <FlatList
              data={mutualFollowers}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.mutualUserItem, { borderBottomColor: colors.borderColor }]}
                  onPress={() => startChatWithUser(item)}
                >
                  <View style={styles.mutualUserLeft}>
                    <Image
                      source={{ uri: getFullImageUrl(item.profile_image_url) }}
                      style={styles.avatar}
                    />
                    <View style={{ marginLeft: 12 }}>
                      <Text style={[styles.username, { color: colors.textPrimary }]}>{item.username}</Text>
                      {item.full_name ? (
                        <Text style={[styles.userFullName, { color: colors.textSecondary }]}>{item.full_name}</Text>
                      ) : null}
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[styles.chatBtn, { backgroundColor: colors.accentBlue }]}
                    onPress={() => startChatWithUser(item)}
                  >
                    <Text style={styles.chatBtnText}>대화하기</Text>
                  </TouchableOpacity>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    height: 54,
    borderBottomWidth: 0.5,
    borderBottomColor: "#262626",
  },
  backButton: {
    padding: 8,
  },
  backIcon: {
    color: "#fff",
    fontSize: 22,
  },
  headerTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  newChatButton: {
    padding: 8,
  },
  newChatIcon: {
    fontSize: 18,
    color: "#fff",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingContainer: {
    padding: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  roomItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#262626",
  },
  roomInfo: {
    flex: 1,
    marginLeft: 14,
    justifyContent: "center",
  },
  username: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 2,
  },
  lastMessage: {
    color: "#8e8e8e",
    fontSize: 13,
  },
  unreadMessageText: {
    color: "#fff",
    fontWeight: "700",
  },
  metaContainer: {
    alignItems: "flex-end",
    justifyContent: "center",
    marginLeft: 8,
  },
  timeText: {
    color: "#8e8e8e",
    fontSize: 12,
    marginBottom: 6,
  },
  unreadBadge: {
    backgroundColor: "#0095f6",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
  },
  unreadCount: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  emptyContainer: {
    flex: 1,
    marginTop: 100,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 8,
  },
  emptySub: {
    color: "#8e8e8e",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 24,
  },
  startBtn: {
    backgroundColor: "#0095f6",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  startBtnText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },

  // Modal
  modalContainer: {
    flex: 1,
    backgroundColor: "#000",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    height: 54,
    borderBottomWidth: 0.5,
    borderBottomColor: "#262626",
  },
  cancelText: {
    color: "#0095f6",
    fontSize: 15,
    fontWeight: "600",
  },
  modalTitle: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
  },
  searchBoxContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: "#262626",
  },
  searchInput: {
    flex: 1,
    color: "#fff",
    fontSize: 14.5,
    paddingVertical: 6,
  },
  searchBtn: {
    backgroundColor: "#0095f6",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    marginLeft: 8,
  },
  searchBtnText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 13.5,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    borderBottomWidth: 0.5,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  mutualUserItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  mutualUserLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  chatBtn: {
    backgroundColor: "#0095f6",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  chatBtnText: {
    color: "#ffffff",
    fontSize: 12.5,
    fontWeight: "700",
  },
  emptyMutualContainer: {
    padding: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyMutualText: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 4,
    textAlign: "center",
  },
  emptyMutualSub: {
    fontSize: 12.5,
    textAlign: "center",
  },
  userFullName: {
    color: "#8e8e8e",
    fontSize: 13,
    marginTop: 2,
  },
});
