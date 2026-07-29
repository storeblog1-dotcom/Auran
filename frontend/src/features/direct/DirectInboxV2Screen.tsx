import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../../context/ThemeContext";
import { AdminAvatar, AdminBadge } from "../../components/AdminIdentity";
import { getDisplayName } from "../../utils/displayName";
import { directApi } from "./directApi";
import { formatRoomTime, getMessagePreview } from "./formatters";
import { DirectRoom, DirectUser } from "./types";
import { useDirectPresence } from "./DirectPresenceContext";

type InboxTab = "inbox" | "requests";

const getErrorMessage = (error: any, fallback: string) =>
  error?.response?.data?.error?.message ||
  error?.response?.data?.detail ||
  fallback;

const matchesRoomSearch = (room: DirectRoom, query: string) => {
  if (!query) return true;
  const target = room.target_user;
  const haystack = [
    target?.nickname,
    target?.username,
    target?.full_name,
    room.last_message?.content,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
  return haystack.includes(query.toLocaleLowerCase());
};

interface RoomCardProps {
  room: DirectRoom;
  isRequest: boolean;
  onOpen: () => void;
  onAccept?: () => void;
  onReject?: () => void;
  onBlock?: () => void;
  isOnline?: boolean;
}

const RoomCard = ({
  room,
  isRequest,
  onOpen,
  onAccept,
  onReject,
  onBlock,
  isOnline,
}: RoomCardProps) => {
  const { colors } = useTheme();
  const target = room.target_user;
  const hasUnread = room.unread_count > 0;
  return (
    <View
      style={[
        styles.roomCard,
        {
          backgroundColor: colors.bgCard,
          borderColor: hasUnread
            ? colors.accentPurple + "50"
            : colors.borderLight,
        },
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.72}
        onPress={onOpen}
        style={styles.roomMain}
      >
        <View style={styles.avatarWrap}>
          <AdminAvatar user={target} style={styles.roomAvatar} />
          {isOnline && (
            <View
              style={[
                styles.onlineDot,
                {
                  borderColor: colors.bgCard,
                },
              ]}
            />
          )}
        </View>
        <View style={styles.roomCopy}>
          <View style={styles.roomTitleRow}>
            <Text
              numberOfLines={1}
              style={[
                styles.roomName,
                {
                  color: colors.textPrimary,
                  fontWeight: hasUnread ? "900" : "800",
                },
              ]}
            >
              {getDisplayName(target, "대화 상대")}
            </Text>
            {target?.is_admin && <AdminBadge compact />}
          </View>
          <Text
            numberOfLines={1}
            style={[
              styles.preview,
              {
                color: hasUnread ? colors.textPrimary : colors.textSecondary,
                fontWeight: hasUnread ? "700" : "500",
              },
            ]}
          >
            {getMessagePreview(room.last_message)}
          </Text>
          {isRequest && (
            <Text
              numberOfLines={1}
              style={[styles.requestHint, { color: colors.accentPurple }]}
            >
              메시지 요청 · 승인 전에는 사진과 게시물이 제한됩니다.
            </Text>
          )}
        </View>
        <View style={styles.roomMeta}>
          <Text style={[styles.roomTime, { color: colors.textMuted }]}>
            {formatRoomTime(
              room.last_message?.created_at || room.updated_at
            )}
          </Text>
          {hasUnread && (
            <LinearGradient
              colors={colors.auraGradient}
              style={styles.unreadBadge}
            >
              <Text style={styles.unreadText}>
                {room.unread_count > 99 ? "99+" : room.unread_count}
              </Text>
            </LinearGradient>
          )}
          {!hasUnread && !isRequest && (
            <Ionicons
              name="chevron-forward"
              size={17}
              color={colors.textMuted}
            />
          )}
        </View>
      </TouchableOpacity>

      {isRequest && (
        <View
          style={[
            styles.requestActions,
            { borderTopColor: colors.borderLight },
          ]}
        >
          <TouchableOpacity
            onPress={onBlock}
            style={styles.requestTextButton}
          >
            <Text style={[styles.blockText, { color: "#ef4444" }]}>차단</Text>
          </TouchableOpacity>
          <View style={styles.requestPrimaryActions}>
            <TouchableOpacity
              onPress={onReject}
              style={[
                styles.requestActionButton,
                { borderColor: colors.borderColor },
              ]}
            >
              <Text
                style={[
                  styles.requestActionText,
                  { color: colors.textSecondary },
                ]}
              >
                거절
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onAccept}
              style={[
                styles.requestActionButton,
                { backgroundColor: colors.accentPurple },
              ]}
            >
              <Text
                style={[styles.requestActionText, { color: "#ffffff" }]}
              >
                승인
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
};

export const DirectInboxV2Screen = ({ navigation, route }: any) => {
  const { colors } = useTheme();
  const { presenceByUserId, refreshPresencePeers } = useDirectPresence();
  const insets = useSafeAreaInsets();
  const [rooms, setRooms] = useState<DirectRoom[]>([]);
  const [requests, setRequests] = useState<DirectRoom[]>([]);
  const [activeTab, setActiveTab] = useState<InboxTab>("inbox");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [composeVisible, setComposeVisible] = useState(false);
  const [usernameQuery, setUsernameQuery] = useState("");
  const [searchingUser, setSearchingUser] = useState(false);
  const [mutualFollowers, setMutualFollowers] = useState<DirectUser[]>([]);
  const [loadingMutuals, setLoadingMutuals] = useState(false);

  const loadRooms = useCallback(async () => {
    try {
      const [nextRooms, nextRequests] = await Promise.all([
        directApi.listRooms(),
        directApi.listRequests(),
      ]);
      setRooms(nextRooms);
      setRequests(nextRequests);
    } catch (error) {
      console.log("메시지함을 불러오지 못했습니다.", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadRooms();
    }, [loadRooms])
  );

  useEffect(() => {
    if (!composeVisible) return;
    setLoadingMutuals(true);
    void directApi
      .listMutualFollowers()
      .then(setMutualFollowers)
      .catch(() => setMutualFollowers([]))
      .finally(() => setLoadingMutuals(false));
  }, [composeVisible]);

  useEffect(() => {
    if (!route?.params?.composeNonce) return;
    navigation.setParams({ composeNonce: undefined });
    setComposeVisible(true);
  }, [route?.params?.composeNonce, navigation]);

  const filteredItems = useMemo(() => {
    const source = activeTab === "inbox" ? rooms : requests;
    const cleanQuery = searchQuery.trim();
    return source.filter((room) => matchesRoomSearch(room, cleanQuery));
  }, [activeTab, requests, rooms, searchQuery]);

  const openRoom = useCallback(
    (room: DirectRoom, autoFocus = false) => {
      navigation.navigate("ChatRoom", {
        roomId: room.id,
        targetUser: room.target_user,
        autoFocus,
        requestStatus: room.request_status,
        isOutgoingRequest: room.is_outgoing_request,
        requestMessageCount: room.request_message_count,
        requestMessageLimit: room.request_message_limit,
        canSendMessage: room.can_send_message,
        canSharePost: room.can_share_post,
        messagePermissionReason: room.message_permission_reason,
      });
    },
    [navigation]
  );

  const startChat = useCallback(
    async (targetUser: DirectUser) => {
      try {
        const room = await directApi.createRoom(targetUser.id);
        setComposeVisible(false);
        setUsernameQuery("");
        refreshPresencePeers();
        openRoom(
          {
            ...room,
            target_user: room.target_user || targetUser,
          },
          true
        );
      } catch (error: any) {
        Alert.alert(
          "대화를 시작할 수 없음",
          getErrorMessage(error, "대화방을 만들지 못했습니다.")
        );
      }
    },
    [openRoom, refreshPresencePeers]
  );

  const searchAndStart = useCallback(async () => {
    const username = usernameQuery.trim().replace(/^@/, "");
    if (!username) {
      Alert.alert("사용자 검색", "사용자 아이디를 입력해 주세요.");
      return;
    }
    setSearchingUser(true);
    try {
      const target = await directApi.searchUser(username);
      await startChat(target);
    } catch (error: any) {
      Alert.alert(
        "사용자를 찾을 수 없음",
        getErrorMessage(error, `@${username} 사용자를 찾지 못했습니다.`)
      );
    } finally {
      setSearchingUser(false);
    }
  }, [startChat, usernameQuery]);

  const handleRequestAction = useCallback(
    async (room: DirectRoom, action: "accept" | "reject" | "block") => {
      try {
        if (action === "accept") {
          await directApi.acceptRequest(room.id);
          setActiveTab("inbox");
          refreshPresencePeers();
        } else if (action === "reject") {
          await directApi.rejectRequest(room.id);
        } else {
          await directApi.blockRequest(room.id);
        }
        await loadRooms();
      } catch (error: any) {
        Alert.alert(
          "요청 처리 실패",
          getErrorMessage(error, "메시지 요청을 처리하지 못했습니다.")
        );
      }
    },
    [loadRooms, refreshPresencePeers]
  );

  return (
    <View
      style={[
        styles.screen,
        {
          backgroundColor: colors.bgPrimary,
          paddingTop: insets.top,
        },
      ]}
    >
      <View style={styles.header}>
        <View>
          <Text style={[styles.eyebrow, { color: colors.accentPurple }]}>
            AURAN DIRECT
          </Text>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            메시지
          </Text>
        </View>
        <View style={styles.headerActionSpacer} />
      </View>

      <View
        style={[
          styles.searchBar,
          {
            backgroundColor: colors.bgInput,
            borderColor: colors.borderLight,
          },
        ]}
      >
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="닉네임, 아이디, 메시지 검색"
          placeholderTextColor={colors.textMuted}
          autoCorrect={false}
          style={[styles.searchInput, { color: colors.textPrimary }]}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery("")}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      <View
        style={[
          styles.segmented,
          { backgroundColor: colors.bgInput },
        ]}
      >
        {(["inbox", "requests"] as InboxTab[]).map((tab) => {
          const selected = tab === activeTab;
          const label =
            tab === "inbox"
              ? `대화 ${rooms.length}`
              : `요청 ${requests.length}`;
          return (
            <TouchableOpacity
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={[
                styles.segment,
                selected && {
                  backgroundColor: colors.bgCard,
                  borderColor: colors.borderLight,
                },
              ]}
            >
              <Text
                style={[
                  styles.segmentText,
                  {
                    color: selected
                      ? colors.textPrimary
                      : colors.textSecondary,
                  },
                ]}
              >
                {label}
              </Text>
              {tab === "requests" && requests.length > 0 && (
                <View
                  style={[
                    styles.segmentDot,
                    { backgroundColor: colors.accentPink },
                  ]}
                />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accentPurple} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            메시지함을 불러오는 중…
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredItems}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <RoomCard
              room={item}
              isRequest={activeTab === "requests"}
              isOnline={Boolean(
                item.target_user?.id &&
                  (presenceByUserId[item.target_user.id]?.is_online ||
                    item.target_user.is_online)
              )}
              onOpen={() => openRoom(item)}
              onAccept={() => handleRequestAction(item, "accept")}
              onReject={() => handleRequestAction(item, "reject")}
              onBlock={() =>
                Alert.alert(
                  "사용자 차단",
                  "이 사용자를 차단하고 메시지 요청을 삭제할까요?",
                  [
                    { text: "취소", style: "cancel" },
                    {
                      text: "차단",
                      style: "destructive",
                      onPress: () => handleRequestAction(item, "block"),
                    },
                  ]
                )
              }
            />
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void loadRooms();
              }}
              tintColor={colors.accentPurple}
            />
          }
          contentContainerStyle={[
            styles.listContent,
            filteredItems.length === 0 && styles.emptyListContent,
          ]}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <LinearGradient
                colors={[
                  colors.accentPurple + "22",
                  colors.accentPink + "14",
                ]}
                style={styles.emptyIcon}
              >
                <Ionicons
                  name={
                    activeTab === "inbox"
                      ? "chatbubble-ellipses-outline"
                      : "mail-unread-outline"
                  }
                  size={34}
                  color={colors.accentPurple}
                />
              </LinearGradient>
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                {searchQuery
                  ? "검색 결과가 없습니다"
                  : activeTab === "inbox"
                    ? "아직 대화가 없습니다"
                    : "새 메시지 요청이 없습니다"}
              </Text>
              <Text
                style={[
                  styles.emptyDescription,
                  { color: colors.textSecondary },
                ]}
              >
                {searchQuery
                  ? "다른 닉네임이나 메시지로 검색해 보세요."
                  : activeTab === "inbox"
                    ? "친구에게 첫 메시지를 보내 대화를 시작해 보세요."
                    : "받은 요청은 안전하게 검토한 뒤 승인할 수 있습니다."}
              </Text>
            </View>
          }
        />
      )}

      <Modal
        visible={composeVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setComposeVisible(false)}
      >
        <View
          style={[
            styles.modal,
            {
              backgroundColor: colors.bgPrimary,
              paddingTop: insets.top,
            },
          ]}
        >
          <View
            style={[
              styles.modalHeader,
              { borderBottomColor: colors.borderLight },
            ]}
          >
            <TouchableOpacity
              onPress={() => setComposeVisible(false)}
              style={styles.modalHeaderButton}
            >
              <Text style={[styles.cancelText, { color: colors.textSecondary }]}>
                취소
              </Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
              새 대화
            </Text>
            <View style={styles.modalHeaderButton} />
          </View>

          <View
            style={[
              styles.userSearch,
              {
                backgroundColor: colors.bgInput,
                borderColor: colors.borderLight,
              },
            ]}
          >
            <Text style={[styles.atMark, { color: colors.accentPurple }]}>@</Text>
            <TextInput
              autoFocus
              value={usernameQuery}
              onChangeText={setUsernameQuery}
              onSubmitEditing={searchAndStart}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              placeholder="사용자 아이디"
              placeholderTextColor={colors.textMuted}
              style={[styles.userSearchInput, { color: colors.textPrimary }]}
            />
            <TouchableOpacity
              disabled={searchingUser}
              onPress={searchAndStart}
              style={[
                styles.findButton,
                { backgroundColor: colors.accentPurple },
              ]}
            >
              {searchingUser ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.findButtonText}>찾기</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.modalSectionHeader}>
            <Text style={[styles.modalSectionTitle, { color: colors.textPrimary }]}>
              맞팔로우한 친구
            </Text>
            <Text style={[styles.modalSectionCount, { color: colors.textMuted }]}>
              {mutualFollowers.length}명
            </Text>
          </View>

          {loadingMutuals ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={colors.accentPurple} />
            </View>
          ) : (
            <FlatList
              data={mutualFollowers}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.mutualList}
              renderItem={({ item }) => (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => startChat(item)}
                  style={[
                    styles.mutualRow,
                    {
                      backgroundColor: colors.bgCard,
                      borderColor: colors.borderLight,
                    },
                  ]}
                >
                  <AdminAvatar user={item} style={styles.mutualAvatar} />
                  <View style={styles.mutualCopy}>
                    <View style={styles.mutualNameRow}>
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.mutualName,
                          { color: colors.textPrimary },
                        ]}
                      >
                        {getDisplayName(item)}
                      </Text>
                      {item.is_admin && <AdminBadge compact />}
                    </View>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.mutualUsername,
                        { color: colors.textSecondary },
                      ]}
                    >
                      @{item.username}
                    </Text>
                  </View>
                  <Ionicons
                    name="paper-plane-outline"
                    size={20}
                    color={colors.accentPurple}
                  />
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={styles.modalEmpty}>
                  <Ionicons
                    name="people-outline"
                    size={38}
                    color={colors.textMuted}
                  />
                  <Text
                    style={[
                      styles.modalEmptyText,
                      { color: colors.textSecondary },
                    ]}
                  >
                    맞팔로우한 친구가 없습니다.
                  </Text>
                </View>
              }
            />
          )}
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    minHeight: 84,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  eyebrow: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  title: {
    marginTop: 2,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "900",
    letterSpacing: -0.8,
  },
  composeButton: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  headerActionSpacer: { width: 46, height: 46 },
  searchBar: {
    height: 46,
    marginHorizontal: 16,
    paddingHorizontal: 13,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    height: 44,
    paddingVertical: 0,
    fontSize: 14,
  },
  segmented: {
    height: 46,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    padding: 4,
    borderRadius: 15,
    flexDirection: "row",
  },
  segment: {
    flex: 1,
    borderWidth: 1,
    borderColor: "transparent",
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  segmentText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
  },
  segmentDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 13,
  },
  listContent: {
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 20,
  },
  emptyListContent: {
    flexGrow: 1,
    justifyContent: "center",
  },
  roomCard: {
    marginVertical: 5,
    borderWidth: 1,
    borderRadius: 21,
  },
  roomMain: {
    minHeight: 84,
    paddingHorizontal: 13,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  avatarWrap: {
    position: "relative",
  },
  roomAvatar: {
    width: 56,
    height: 56,
    borderRadius: 19,
  },
  onlineDot: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 15,
    height: 15,
    borderRadius: 8,
    borderWidth: 3,
    backgroundColor: "#22c55e",
  },
  roomCopy: {
    flex: 1,
    minWidth: 0,
    marginLeft: 12,
  },
  roomTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  roomName: {
    maxWidth: "76%",
    fontSize: 15.5,
    lineHeight: 21,
  },
  preview: {
    marginTop: 5,
    fontSize: 12.5,
    lineHeight: 17,
  },
  requestHint: {
    marginTop: 3,
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: "700",
  },
  roomMeta: {
    width: 58,
    minHeight: 48,
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginLeft: 8,
  },
  roomTime: {
    fontSize: 10.5,
    lineHeight: 15,
  },
  unreadBadge: {
    minWidth: 24,
    height: 24,
    paddingHorizontal: 7,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  unreadText: {
    color: "#ffffff",
    fontSize: 10.5,
    fontWeight: "900",
  },
  requestActions: {
    height: 52,
    marginHorizontal: 13,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  requestTextButton: {
    minWidth: 50,
    height: 34,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  blockText: {
    fontSize: 12,
    fontWeight: "800",
  },
  requestPrimaryActions: {
    flexDirection: "row",
    gap: 7,
  },
  requestActionButton: {
    minWidth: 64,
    height: 34,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  requestActionText: {
    fontSize: 12,
    fontWeight: "800",
  },
  emptyState: {
    alignItems: "center",
    paddingHorizontal: 38,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    marginTop: 17,
    fontSize: 19,
    lineHeight: 25,
    fontWeight: "900",
  },
  emptyDescription: {
    marginTop: 7,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },
  emptyAction: {
    marginTop: 18,
    minWidth: 132,
    height: 42,
    paddingHorizontal: 18,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyActionText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },
  modal: {
    flex: 1,
  },
  modalHeader: {
    height: 58,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalHeaderButton: {
    width: 54,
  },
  modalTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "900",
  },
  cancelText: {
    fontSize: 14,
    fontWeight: "700",
  },
  userSearch: {
    height: 52,
    marginHorizontal: 16,
    marginTop: 18,
    paddingLeft: 13,
    paddingRight: 5,
    borderWidth: 1,
    borderRadius: 17,
    flexDirection: "row",
    alignItems: "center",
  },
  atMark: {
    fontSize: 18,
    fontWeight: "900",
  },
  userSearchInput: {
    flex: 1,
    minWidth: 0,
    height: 50,
    paddingHorizontal: 7,
    fontSize: 15,
  },
  findButton: {
    minWidth: 62,
    height: 40,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  findButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },
  modalSectionHeader: {
    paddingHorizontal: 18,
    marginTop: 24,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalSectionTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "900",
  },
  modalSectionCount: {
    fontSize: 12,
  },
  mutualList: {
    paddingHorizontal: 14,
    paddingBottom: 20,
  },
  mutualRow: {
    minHeight: 72,
    marginVertical: 4,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 19,
    flexDirection: "row",
    alignItems: "center",
  },
  mutualAvatar: {
    width: 46,
    height: 46,
    borderRadius: 16,
  },
  mutualCopy: {
    flex: 1,
    minWidth: 0,
    marginHorizontal: 11,
  },
  mutualNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  mutualName: {
    maxWidth: "78%",
    fontSize: 14.5,
    lineHeight: 20,
    fontWeight: "800",
  },
  mutualUsername: {
    marginTop: 2,
    fontSize: 11.5,
    lineHeight: 16,
  },
  modalEmpty: {
    alignItems: "center",
    paddingTop: 70,
  },
  modalEmptyText: {
    marginTop: 10,
    fontSize: 13,
  },
});
