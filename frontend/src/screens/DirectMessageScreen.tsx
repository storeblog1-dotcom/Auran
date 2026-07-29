import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
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
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { getDisplayName } from "../utils/displayName";
import { AdminAvatar, AdminBadge } from "../components/AdminIdentity";

interface UserInfo {
  id: string;
  username: string;
  nickname?: string | null;
  full_name: string;
  profile_image_url: string | null;
  is_admin?: boolean;
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
  request_status: "ACCEPTED" | "PENDING" | "REJECTED";
  is_outgoing_request: boolean;
  request_message_count: number;
  request_message_limit: number;
  can_send_message: boolean;
  can_share_post: boolean;
  message_permission_reason: string | null;
  updated_at: string;
}

export const DirectMessageScreen = ({ navigation, route }: any) => {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const isTabScreen = route?.name === "Messages";
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [requests, setRequests] = useState<ChatRoom[]>([]);
  const [activeTab, setActiveTab] = useState<"inbox" | "requests">("inbox");
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
      const [roomResponse, requestResponse] = await Promise.all([
        api.get("/direct/rooms"),
        api.get("/direct/requests"),
      ]);
      const roomItems = roomResponse.data?.data || roomResponse.data;
      const requestItems = requestResponse.data?.data || requestResponse.data;
      setRooms(Array.isArray(roomItems) ? roomItems : []);
      setRequests(Array.isArray(requestItems) ? requestItems : []);
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
      const room = response.data?.data || response.data;
      setModalVisible(false);
      setTargetUsernameInput("");
      navigation.navigate("ChatRoom", {
        roomId: room.id,
        targetUser: targetUser,
        autoFocus: true,
        requestStatus: room.request_status,
        isOutgoingRequest: room.is_outgoing_request,
        requestMessageCount: room.request_message_count,
        requestMessageLimit: room.request_message_limit,
        canSendMessage: room.can_send_message,
        messagePermissionReason: room.message_permission_reason,
      });
    } catch (error: any) {
      console.error("Failed to create room", error);
      Alert.alert(
        "메시지를 보낼 수 없음",
        error.response?.data?.error?.message ||
          error.response?.data?.detail ||
          "대화방을 생성할 수 없습니다."
      );
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
          is_admin: targetUser.is_admin,
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
            requestStatus: item.request_status,
            isOutgoingRequest: item.is_outgoing_request,
            requestMessageCount: item.request_message_count,
            requestMessageLimit: item.request_message_limit,
            canSendMessage: item.can_send_message,
            messagePermissionReason: item.message_permission_reason,
          })
        }
      >
        <AdminAvatar user={target} style={styles.avatar} />
        <View style={styles.roomInfo}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={[styles.username, { color: colors.textPrimary }]}>{getDisplayName(target, "대화 상대")}</Text>
            {target?.is_admin && <AdminBadge />}
          </View>
          <Text
            style={[
              styles.lastMessage,
              { color: colors.textSecondary },
              item.unread_count > 0 && { color: colors.textPrimary, fontWeight: "bold" },
            ]}
            numberOfLines={1}
          >
            {item.request_status === "PENDING"
              ? `${lastMsgText} · 요청 승인 대기 중`
              : lastMsgText}
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

  const handleRequestAction = async (
    roomId: string,
    action: "accept" | "reject" | "block"
  ) => {
    const actionLabels = {
      accept: "승인",
      reject: "거절",
      block: "차단",
    };
    try {
      await api.post(`/direct/rooms/${roomId}/${action}`);
      await fetchRooms();
      if (action === "accept") {
        setActiveTab("inbox");
      }
    } catch (error: any) {
      const message =
        error.response?.data?.error?.message ||
        error.response?.data?.detail ||
        `메시지 요청 ${actionLabels[action]}에 실패했습니다.`;
      Alert.alert("오류", message);
    }
  };

  const renderRequestItem = ({ item }: { item: ChatRoom }) => {
    const target = item.target_user;
    const lastMessage = item.last_message?.content || "메시지 요청";

    return (
      <View style={[styles.requestItem, { borderBottomColor: colors.borderColor }]}>
        <TouchableOpacity
          style={styles.requestUserRow}
          onPress={() =>
            navigation.navigate("ChatRoom", {
              roomId: item.id,
              targetUser: target,
              requestStatus: item.request_status,
              isOutgoingRequest: false,
              requestMessageCount: item.request_message_count,
              requestMessageLimit: item.request_message_limit,
              canSendMessage: false,
              messagePermissionReason: item.message_permission_reason,
            })
          }
        >
          <AdminAvatar user={target} style={styles.avatar} />
          <View style={styles.roomInfo}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={[styles.username, { color: colors.textPrimary }]}>
                {getDisplayName(target, "요청 보낸 사용자")}
              </Text>
              {target?.is_admin && <AdminBadge />}
            </View>
            <Text
              style={[styles.lastMessage, { color: colors.textSecondary }]}
              numberOfLines={1}
            >
              {lastMessage}
            </Text>
          </View>
        </TouchableOpacity>
        <View style={styles.requestActions}>
          <TouchableOpacity
            style={[styles.requestButton, { backgroundColor: colors.accentBlue }]}
            onPress={() => handleRequestAction(item.id, "accept")}
          >
            <Text style={styles.requestPrimaryText}>승인</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.requestButton, { backgroundColor: colors.bgInput }]}
            onPress={() => handleRequestAction(item.id, "reject")}
          >
            <Text style={[styles.requestSecondaryText, { color: colors.textPrimary }]}>
              거절
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.requestButton, { backgroundColor: colors.bgInput }]}
            onPress={() =>
              Alert.alert(
                "사용자 차단",
                "이 사용자를 차단하고 메시지 요청을 삭제할까요?",
                [
                  { text: "취소", style: "cancel" },
                  {
                    text: "차단",
                    style: "destructive",
                    onPress: () => handleRequestAction(item.id, "block"),
                  },
                ]
              )
            }
          >
            <Text style={styles.blockText}>차단</Text>
          </TouchableOpacity>
        </View>
      </View>
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

      <View style={[styles.tabs, { borderBottomColor: colors.borderColor }]}>
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === "inbox" && {
              borderBottomColor: colors.accentBlue,
              borderBottomWidth: 2,
            },
          ]}
          onPress={() => setActiveTab("inbox")}
        >
          <Text
            style={[
              styles.tabText,
              {
                color:
                  activeTab === "inbox"
                    ? colors.textPrimary
                    : colors.textSecondary,
              },
            ]}
          >
            일반
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === "requests" && {
              borderBottomColor: colors.accentBlue,
              borderBottomWidth: 2,
            },
          ]}
          onPress={() => setActiveTab("requests")}
        >
          <Text
            style={[
              styles.tabText,
              {
                color:
                  activeTab === "requests"
                    ? colors.textPrimary
                    : colors.textSecondary,
              },
            ]}
          >
            요청{requests.length > 0 ? ` ${requests.length}` : ""}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Main List */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.accentBlue} />
        </View>
      ) : (
        <FlatList
          data={activeTab === "inbox" ? rooms : requests}
          keyExtractor={(item) => item.id}
          renderItem={
            activeTab === "inbox" ? renderRoomItem : renderRequestItem
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textPrimary} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="chatbubbles-outline" size={48} color={colors.textSecondary} style={{ marginBottom: 12 }} />
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                {activeTab === "inbox"
                  ? "메시지가 없습니다"
                  : "메시지 요청이 없습니다"}
              </Text>
              <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
                {activeTab === "inbox"
                  ? "메시지를 보내 대화를 시작해보세요."
                  : "비팔로워가 보낸 첫 메시지가 여기에 표시됩니다."}
              </Text>
              {activeTab === "inbox" && (
                <TouchableOpacity
                  style={styles.startBtn}
                  onPress={() => setModalVisible(true)}
                >
                  <Text style={styles.startBtnText}>메시지 보내기</Text>
                </TouchableOpacity>
              )}
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

          <View style={[styles.searchBoxContainer, { borderBottomColor: colors.borderColor }]}>
            <TextInput
              style={[styles.searchInput, { color: colors.textPrimary }]}
              placeholder="아이디로 사용자 검색"
              placeholderTextColor={colors.textMuted}
              value={targetUsernameInput}
              onChangeText={setTargetUsernameInput}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={handleSearchClick}
            />
            <TouchableOpacity
              style={styles.searchBtn}
              onPress={handleSearchClick}
              disabled={searchLoading}
            >
              {searchLoading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.searchBtnText}>찾기</Text>
              )}
            </TouchableOpacity>
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
                    <AdminAvatar user={item} style={styles.avatar} />
                    <View style={{ marginLeft: 12 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={[styles.username, { color: colors.textPrimary }]}>{getDisplayName(item)}</Text>
                        {item.is_admin && <AdminBadge />}
                      </View>
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
  tabs: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
  },
  tab: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  tabText: {
    fontSize: 14,
    fontWeight: "700",
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
  requestItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  requestUserRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  requestActions: {
    flexDirection: "row",
    marginTop: 10,
    marginLeft: 62,
    gap: 8,
  },
  requestButton: {
    minWidth: 62,
    minHeight: 32,
    paddingHorizontal: 12,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  requestPrimaryText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
  },
  requestSecondaryText: {
    fontSize: 13,
    fontWeight: "700",
  },
  blockText: {
    color: "#ef4444",
    fontSize: 13,
    fontWeight: "700",
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
