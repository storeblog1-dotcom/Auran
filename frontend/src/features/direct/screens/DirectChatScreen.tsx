import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  LayoutChangeEvent,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  AppState,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { useIsFocused, useNavigation, useRoute } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useSharedValue } from "react-native-reanimated";

import { useTheme } from "../../../context/ThemeContext";
import { useAuth } from "../../../context/AuthContext";
import { useNotification } from "../../../context/NotificationContext";
import { getDisplayName } from "../../../utils/displayName";
import { AdminAvatar } from "../../../components/AdminIdentity";

import { directService } from "../services/directService";
import { useDirectChat } from "../hooks/useDirectChat";
import {
  DirectMessageList,
  type DirectMessageListHandle,
  type OwnSendScrollRequest,
} from "../components/DirectMessageList";
import { DirectComposer } from "../components/DirectComposer";
import { DirectUser } from "../types/direct";

export const DirectChatScreen: React.FC = () => {
  const { colors } = useTheme();
  const { user: currentUser } = useAuth();
  const { refreshDirectUnread, refreshNotifications } = useNotification();
  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();
  const route = useRoute<any>();
  const { bottom: safeAreaBottom } = useSafeAreaInsets();

  const { conversationId, targetUser: initialTargetUser } = route.params || {};

  const [targetUser, setTargetUser] = useState<DirectUser | null>(initialTargetUser || null);
  const [loadingUser, setLoadingUser] = useState<boolean>(!initialTargetUser && !!conversationId);
  const [ownSendScrollRequest, setOwnSendScrollRequest] =
    useState<OwnSendScrollRequest>({
      sequence: 0,
      previousLatestId: null,
    });
  const messageListRef = useRef<DirectMessageListHandle>(null);
  const initialComposerHeightRef = useRef<number | null>(null);
  const extraContentPadding = useSharedValue(0);

  const {
    messages,
    loading: loadingMessages,
    loadingMore,
    hasMore,
    sendMessage,
    loadMoreMessages,
  } = useDirectChat(conversationId || "");

  useEffect(() => {
    if (!loadingMessages && conversationId) {
      void refreshDirectUnread();
      void refreshNotifications();
    }
  }, [conversationId, loadingMessages, refreshDirectUnread, refreshNotifications]);

  useEffect(() => {
    if (!conversationId || !isFocused || AppState.currentState !== "active" || !messages[0]) return;
    void directService.markConversationRead(conversationId).then(() => {
      void refreshDirectUnread();
      void refreshNotifications();
    });
  }, [conversationId, isFocused, messages[0]?.id, refreshDirectUnread, refreshNotifications]);

  useEffect(() => {
    if (!targetUser && conversationId) {
      directService
        .getConversationById(conversationId)
        .then((data) => {
          if (data?.target_user) {
            setTargetUser(data.target_user);
          }
        })
        .catch((err) => {
          if (__DEV__) {
            console.log("Error loading conversation detail in DirectChatScreen", err);
          }
        })
        .finally(() => {
          setLoadingUser(false);
        });
    }
  }, [conversationId, targetUser]);

  const displayName = getDisplayName(targetUser);

  const handleSend = useCallback((content: string) => {
    const trimmed = content.trim();
    if (!trimmed || !conversationId || !currentUser?.id) {
      return;
    }

    setOwnSendScrollRequest((current) => ({
      sequence: current.sequence + 1,
      previousLatestId: messages[0]?.id ?? null,
    }));
    void sendMessage(trimmed);
  }, [conversationId, currentUser?.id, messages, sendMessage]);

  const handleComposerFocus = useCallback(() => {
    messageListRef.current?.scrollToLatestForComposerFocus();
  }, []);

  const handleComposerLayout = useCallback((event: LayoutChangeEvent) => {
    const height = Math.ceil(event.nativeEvent.layout.height);

    if (initialComposerHeightRef.current === null) {
      initialComposerHeightRef.current = height;
    }

    extraContentPadding.value = Math.max(
      height - initialComposerHeightRef.current,
      0,
    );
  }, [extraContentPadding]);

  const handleBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    navigation.navigate("MainTabs", { screen: "DirectInbox" });
  }, [navigation]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          { backgroundColor: colors.headerBg, borderBottomColor: colors.borderLight },
        ]}
      >
        <TouchableOpacity
          style={[styles.backButton, { backgroundColor: colors.bgInput }]}
          onPress={handleBack}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="대화 목록으로 돌아가기"
        >
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>

        {loadingUser ? (
          <ActivityIndicator size="small" color={colors.accentPurple} />
        ) : (
          <View style={styles.headerTitleContainer}>
            <AdminAvatar user={targetUser} style={styles.headerAvatar} />
            <View style={styles.headerTextContainer}>
              <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                {displayName}
              </Text>
              {!!targetUser?.username && (
                <Text style={[styles.headerUsername, { color: colors.textSecondary }]} numberOfLines={1}>
                  @{targetUser.username}
                </Text>
              )}
            </View>
          </View>
        )}
      </View>

      <View style={styles.chatArea}>
        <View style={styles.messageListContainer}>
          {loadingMessages ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={colors.accentPurple} />
            </View>
          ) : (
            <DirectMessageList
              ref={messageListRef}
              conversationId={conversationId || ""}
              messages={messages}
              currentUserId={currentUser?.id}
              targetUser={targetUser}
              loadingMore={loadingMore}
              hasMore={hasMore}
              onLoadMore={loadMoreMessages}
              extraContentPadding={extraContentPadding}
              ownSendScrollRequest={ownSendScrollRequest}
            />
          )}
        </View>

        <KeyboardStickyView
          offset={{ closed: 0, opened: safeAreaBottom }}
        >
          <View onLayout={handleComposerLayout}>
            <DirectComposer
              onSend={handleSend}
              onFocus={handleComposerFocus}
            />
          </View>
        </KeyboardStickyView>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    height: 60,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  headerTitleContainer: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
  },
  headerTextContainer: {
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  headerUsername: {
    marginTop: 1,
    fontSize: 12,
  },
  chatArea: {
    flex: 1,
    minHeight: 0,
  },
  messageListContainer: {
    flex: 1,
    minHeight: 0,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
