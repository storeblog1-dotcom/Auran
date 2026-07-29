import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  KeyboardAvoidingView,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { AdminAvatar, AdminBadge } from "../../components/AdminIdentity";
import { PostDetailModal } from "../../components/PostDetailModal";
import { getDisplayName } from "../../utils/displayName";
import api from "../../services/api";
import { setActiveDirectRoomId } from "../../services/pushNotifications";
import { CompositionSafeComposer } from "./CompositionSafeComposer";
import { DirectMessageRow } from "./DirectMessageRow";
import { formatDateDivider, getPresenceLabel } from "./formatters";
import { buildDirectTimeline } from "./messageReducer";
import { DirectMessage, DirectTimelineItem, DirectUser } from "./types";
import { useDirectConversation } from "./useDirectConversation";

const getErrorMessage = (error: any, fallback: string) =>
  error?.response?.data?.error?.message ||
  error?.response?.data?.detail ||
  fallback;

export const DirectChatV2Screen = ({ route, navigation }: any) => {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const [appIsForeground, setAppIsForeground] = useState(
    AppState.currentState === "active"
  );
  const {
    roomId,
    targetUser: targetUserValue,
    autoFocus = false,
    requestStatus = "ACCEPTED",
    isOutgoingRequest = false,
    requestMessageCount: initialRequestMessageCount = 0,
    requestMessageLimit = 5,
    canSendMessage: initialCanSendMessage = true,
    messagePermissionReason,
  } = route.params || {};
  const targetUser = (targetUserValue || null) as DirectUser | null;
  const [roomRequestStatus, setRoomRequestStatus] = useState(requestStatus);
  const [requestMessageCount, setRequestMessageCount] = useState(
    initialRequestMessageCount
  );
  const [canSendMessage, setCanSendMessage] = useState(
    initialCanSendMessage
  );
  const [sendingImage, setSendingImage] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [postModalVisible, setPostModalVisible] = useState(false);
  const [messageAreaWidth, setMessageAreaWidth] = useState(360);
  const listRef = useRef<FlatList<DirectTimelineItem>>(null);
  const shouldAutoScrollRef = useRef(true);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      setAppIsForeground(state === "active");
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    setRoomRequestStatus(requestStatus);
    setRequestMessageCount(initialRequestMessageCount);
    setCanSendMessage(initialCanSendMessage);
    setSelectedPostId(null);
    setPostModalVisible(false);
    shouldAutoScrollRef.current = true;
  }, [
    initialCanSendMessage,
    initialRequestMessageCount,
    requestStatus,
    roomId,
  ]);

  useEffect(() => {
    if (!isFocused || !appIsForeground || !roomId) return;
    setActiveDirectRoomId(String(roomId));
    return () => {
      setActiveDirectRoomId(null);
    };
  }, [appIsForeground, isFocused, roomId]);

  const {
    messages,
    loading,
    loadingOlderMessages,
    hasOlderMessages,
    connectionState,
    peerTyping,
    peerOnline,
    peerLastSeenAt,
    sendMessage,
    retryMessage,
    signalTyping,
    loadOlderMessages,
  } = useDirectConversation({
    roomId,
    currentUser: user,
    targetUser,
    isActive: isFocused && appIsForeground,
  });
  const timeline = useMemo(() => buildDirectTimeline(messages), [messages]);

  const canCompose =
    roomRequestStatus === "ACCEPTED" ||
    (roomRequestStatus === "PENDING" &&
      isOutgoingRequest &&
      canSendMessage &&
      requestMessageCount < requestMessageLimit);

  const presenceLabel = getPresenceLabel({
    peer: targetUser,
    peerOnline,
    peerTyping,
    connectionState,
    lastSeenAt: peerLastSeenAt,
  });

  useEffect(() => {
    const latestMessage = messages[messages.length - 1];
    if (
      !latestMessage ||
      (!shouldAutoScrollRef.current && latestMessage.sender.id !== user?.id)
    ) {
      return;
    }
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
  }, [messages, user?.id]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } =
        event.nativeEvent;
      const distanceFromEnd =
        contentSize.height - layoutMeasurement.height - contentOffset.y;
      shouldAutoScrollRef.current = distanceFromEnd < 120;
    },
    []
  );

  const handleMessageAreaLayout = useCallback((event: LayoutChangeEvent) => {
    setMessageAreaWidth(event.nativeEvent.layout.width);
  }, []);

  const handleSendText = useCallback(
    async (exactText: string) => {
      if (!canCompose) return;
      if (
        roomRequestStatus === "PENDING" &&
        requestMessageCount >= requestMessageLimit
      ) {
        Alert.alert(
          "요청 승인 대기 중",
          messagePermissionReason ||
            `상대방이 승인하기 전에는 ${requestMessageLimit}개까지만 보낼 수 있습니다.`
        );
        return;
      }
      shouldAutoScrollRef.current = true;
      try {
        await sendMessage({
          content: exactText,
          message_type: "TEXT",
        });
        if (roomRequestStatus === "PENDING") {
          setRequestMessageCount((previous) => {
            const next = previous + 1;
            if (next >= requestMessageLimit) setCanSendMessage(false);
            return next;
          });
        }
      } catch {
        // The failed item remains visible and offers an explicit retry.
      }
    },
    [
      canCompose,
      messagePermissionReason,
      requestMessageCount,
      requestMessageLimit,
      roomRequestStatus,
      sendMessage,
    ]
  );

  const handlePickAndSendImage = useCallback(async () => {
    if (roomRequestStatus !== "ACCEPTED") {
      Alert.alert(
        "사진 전송 제한",
        "상대방이 메시지 요청을 승인한 뒤 사진을 보낼 수 있습니다."
      );
      return;
    }
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("사진 권한 필요", "사진을 보내려면 사진 접근을 허용해 주세요.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"] as any,
        quality: 0.82,
      });
      if (result.canceled || !result.assets[0]) return;

      setSendingImage(true);
      const asset = result.assets[0];
      const filename = asset.uri.split("/").pop() || "message-image.jpg";
      const extension = /\.(\w+)$/.exec(filename)?.[1] || "jpeg";
      const formData = new FormData();
      if (Platform.OS === "web") {
        const response = await fetch(asset.uri);
        formData.append("file", await response.blob(), filename);
      } else {
        formData.append("file", {
          uri: asset.uri,
          name: filename,
          type: `image/${extension}`,
        } as any);
      }
      const uploadResponse = await api.post("/posts/upload-media", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const mediaUrl =
        uploadResponse.data?.data?.url || uploadResponse.data?.url;
      if (!mediaUrl) throw new Error("Missing uploaded media URL");
      shouldAutoScrollRef.current = true;
      await sendMessage({
        content: "사진",
        message_type: "IMAGE",
        media_url: mediaUrl,
      });
    } catch (error: any) {
      Alert.alert(
        "사진 전송 실패",
        getErrorMessage(error, "사진을 보내지 못했습니다.")
      );
    } finally {
      setSendingImage(false);
    }
  }, [roomRequestStatus, sendMessage]);

  const handleAcceptRequest = useCallback(async () => {
    try {
      await api.post(`/direct/rooms/${roomId}/accept`);
      setRoomRequestStatus("ACCEPTED");
      setCanSendMessage(true);
    } catch (error: any) {
      Alert.alert(
        "승인 실패",
        getErrorMessage(error, "메시지 요청을 승인하지 못했습니다.")
      );
    }
  }, [roomId]);

  const handleRejectRequest = useCallback(async () => {
    try {
      await api.post(`/direct/rooms/${roomId}/reject`);
      navigation.goBack();
    } catch (error: any) {
      Alert.alert(
        "거절 실패",
        getErrorMessage(error, "메시지 요청을 거절하지 못했습니다.")
      );
    }
  }, [navigation, roomId]);

  const renderTimelineItem = useCallback(
    ({ item }: { item: DirectTimelineItem }) => {
      if (item.type === "date") {
        return (
          <View style={styles.dateRow}>
            <View
              style={[styles.dateLine, { backgroundColor: colors.borderLight }]}
            />
            <Text
              style={[
                styles.dateText,
                {
                  color: colors.textSecondary,
                  backgroundColor: colors.bgPrimary,
                },
              ]}
            >
              {formatDateDivider(item.date)}
            </Text>
            <View
              style={[styles.dateLine, { backgroundColor: colors.borderLight }]}
            />
          </View>
        );
      }
      return (
        <DirectMessageRow
          message={item.message}
          isMine={item.message.sender.id === user?.id}
          availableWidth={messageAreaWidth - 28}
          onOpenPost={(postId) => {
            setSelectedPostId(postId);
            setPostModalVisible(true);
          }}
          onRetry={(message: DirectMessage) => {
            shouldAutoScrollRef.current = true;
            void retryMessage(message).catch(() => undefined);
          }}
        />
      );
    },
    [
      colors.bgPrimary,
      colors.borderLight,
      colors.textSecondary,
      messageAreaWidth,
      retryMessage,
      user?.id,
    ]
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
      <View
        style={[
          styles.header,
          {
            backgroundColor: colors.headerBg,
            borderBottomColor: colors.borderLight,
          },
        ]}
      >
        <TouchableOpacity
          accessibilityLabel="메시지함으로 돌아가기"
          onPress={() => navigation.goBack()}
          style={[
            styles.headerButton,
            { backgroundColor: colors.bgInput },
          ]}
        >
          <Ionicons
            name="chevron-back"
            size={22}
            color={colors.textPrimary}
          />
        </TouchableOpacity>
        <AdminAvatar user={targetUser} style={styles.headerAvatar} />
        <View style={styles.headerCopy}>
          <View style={styles.headerNameRow}>
            <Text
              numberOfLines={1}
              style={[styles.headerName, { color: colors.textPrimary }]}
            >
              {getDisplayName(targetUser, "대화 상대")}
            </Text>
            {targetUser?.is_admin && <AdminBadge compact />}
          </View>
          <View style={styles.presenceRow}>
            <View
              style={[
                styles.presenceDot,
                {
                  backgroundColor:
                    peerOnline && connectionState === "online"
                      ? "#22c55e"
                      : connectionState === "reconnecting"
                        ? "#f59e0b"
                        : colors.textMuted,
                },
              ]}
            />
            <Text
              numberOfLines={1}
              style={[
                styles.presenceText,
                {
                  color: peerTyping
                    ? colors.accentPurple
                    : colors.textSecondary,
                },
              ]}
            >
              {presenceLabel}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          accessibilityLabel="대화 정보"
          style={[
            styles.headerButton,
            { backgroundColor: colors.bgInput },
          ]}
        >
          <Ionicons
            name="information-circle-outline"
            size={22}
            color={colors.textSecondary}
          />
        </TouchableOpacity>
      </View>

      {roomRequestStatus === "PENDING" && (
        <View
          style={[
            styles.requestBanner,
            {
              backgroundColor: colors.accentPurple + "12",
              borderBottomColor: colors.borderLight,
            },
          ]}
        >
          <Ionicons
            name="shield-checkmark-outline"
            size={20}
            color={colors.accentPurple}
          />
          <View style={styles.requestCopy}>
            <Text
              style={[styles.requestTitle, { color: colors.textPrimary }]}
            >
              {isOutgoingRequest ? "승인 대기 중" : "새 메시지 요청"}
            </Text>
            <Text
              style={[styles.requestDescription, { color: colors.textSecondary }]}
            >
              {isOutgoingRequest
                ? `텍스트 ${requestMessageCount}/${requestMessageLimit} · 승인 후 사진과 게시물을 공유할 수 있어요.`
                : "승인하면 이 사용자와 실시간 대화를 시작합니다."}
            </Text>
          </View>
          {!isOutgoingRequest && (
            <View style={styles.requestButtons}>
              <TouchableOpacity
                onPress={handleRejectRequest}
                style={[styles.requestButton, { borderColor: colors.borderColor }]}
              >
                <Text style={{ color: colors.textSecondary, fontWeight: "700" }}>
                  거절
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleAcceptRequest}
                style={[
                  styles.requestButton,
                  { backgroundColor: colors.accentPurple },
                ]}
              >
                <Text style={{ color: "#ffffff", fontWeight: "800" }}>
                  승인
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      <KeyboardAvoidingView
        style={styles.conversation}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <View style={styles.messageArea} onLayout={handleMessageAreaLayout}>
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={colors.accentPurple} />
              <Text
                style={[styles.loadingText, { color: colors.textSecondary }]}
              >
                대화를 안전하게 불러오는 중…
              </Text>
            </View>
          ) : (
            <FlatList
              ref={listRef}
              data={timeline}
              keyExtractor={(item) => item.id}
              renderItem={renderTimelineItem}
              contentContainerStyle={[
                styles.timeline,
                timeline.length === 0 && styles.emptyTimeline,
              ]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              removeClippedSubviews={false}
              maintainVisibleContentPosition={{ minIndexForVisible: 1 }}
              onScroll={handleScroll}
              scrollEventThrottle={80}
              onContentSizeChange={() => {
                if (shouldAutoScrollRef.current) {
                  listRef.current?.scrollToEnd({ animated: false });
                }
              }}
              ListHeaderComponent={
                hasOlderMessages ? (
                  <TouchableOpacity
                    disabled={loadingOlderMessages}
                    onPress={() => void loadOlderMessages()}
                    style={[
                      styles.olderButton,
                      {
                        backgroundColor: colors.bgInput,
                        borderColor: colors.borderLight,
                      },
                    ]}
                  >
                    {loadingOlderMessages ? (
                      <ActivityIndicator
                        size="small"
                        color={colors.accentPurple}
                      />
                    ) : (
                      <>
                        <Ionicons
                          name="time-outline"
                          size={16}
                          color={colors.accentPurple}
                        />
                        <Text
                          style={[
                            styles.olderButtonText,
                            { color: colors.textSecondary },
                          ]}
                        >
                          이전 메시지 불러오기
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                ) : null
              }
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <View
                    style={[
                      styles.emptyIcon,
                      { backgroundColor: colors.accentPurple + "14" },
                    ]}
                  >
                    <Ionicons
                      name="sparkles-outline"
                      size={30}
                      color={colors.accentPurple}
                    />
                  </View>
                  <Text
                    style={[styles.emptyTitle, { color: colors.textPrimary }]}
                  >
                    대화를 시작해 보세요
                  </Text>
                  <Text
                    style={[
                      styles.emptyDescription,
                      { color: colors.textSecondary },
                    ]}
                  >
                    보낸 문장은 원문 그대로 저장되고 즉시 표시됩니다.
                  </Text>
                </View>
              }
            />
          )}
        </View>

        <CompositionSafeComposer
          editable={canCompose}
          placeholder={
            canCompose ? "메시지를 입력하세요" : "요청 승인 대기 중"
          }
          sendingMedia={sendingImage}
          autoFocus={autoFocus}
          onSend={handleSendText}
          onPickImage={handlePickAndSendImage}
          onTypingChange={signalTyping}
        />
      </KeyboardAvoidingView>

      <PostDetailModal
        visible={postModalVisible}
        postId={selectedPostId}
        onClose={() => {
          setPostModalVisible(false);
          setSelectedPostId(null);
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    height: 68,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerButton: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  headerAvatar: {
    width: 42,
    height: 42,
    borderRadius: 15,
    marginLeft: 10,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
    marginHorizontal: 10,
  },
  headerNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  headerName: {
    maxWidth: "78%",
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "900",
  },
  presenceRow: {
    marginTop: 3,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  presenceDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  presenceText: {
    flex: 1,
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: "600",
  },
  requestBanner: {
    minHeight: 68,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
  },
  requestCopy: {
    flex: 1,
    minWidth: 0,
    marginLeft: 9,
  },
  requestTitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
  },
  requestDescription: {
    marginTop: 2,
    fontSize: 11.5,
    lineHeight: 16,
  },
  requestButtons: {
    marginLeft: 8,
    flexDirection: "row",
    gap: 6,
  },
  requestButton: {
    minWidth: 52,
    height: 34,
    paddingHorizontal: 10,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  conversation: {
    flex: 1,
  },
  messageArea: {
    flex: 1,
    minHeight: 0,
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
  timeline: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 16,
    flexGrow: 1,
  },
  emptyTimeline: {
    justifyContent: "center",
  },
  dateRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 13,
  },
  olderButton: {
    alignSelf: "center",
    minWidth: 154,
    height: 36,
    marginTop: 2,
    marginBottom: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  olderButtonText: {
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: "700",
  },
  dateLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  dateText: {
    marginHorizontal: 10,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
  },
  emptyState: {
    alignItems: "center",
    paddingHorizontal: 36,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    marginTop: 15,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "900",
  },
  emptyDescription: {
    marginTop: 7,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },
});
