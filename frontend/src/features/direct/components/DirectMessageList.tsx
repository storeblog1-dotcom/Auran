import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import {
  ActivityIndicator,
  FlatList,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  ScrollViewProps,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { SharedValue } from "react-native-reanimated";

import { useTheme } from "../../../context/ThemeContext";
import { useSystemBoldText } from "../../../native/SystemFontWeight";
import { DirectMessage, DirectUser } from "../types/direct";
import { DateSeparator } from "./DateSeparator";
import { DirectKeyboardScrollView } from "./DirectKeyboardScrollView";
import { DirectMessageItem } from "./DirectMessageItem";

interface DirectMessageListProps {
  conversationId: string;
  messages: DirectMessage[];
  currentUserId?: string;
  targetUser?: DirectUser | null;
  loadingMore?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  extraContentPadding: SharedValue<number>;
  ownSendScrollRequest: OwnSendScrollRequest;
}

export interface OwnSendScrollRequest {
  sequence: number;
  previousLatestId: string | null;
}

export interface DirectMessageListHandle {
  scrollToLatestForComposerFocus: () => void;
}

const NEAR_LATEST_THRESHOLD = 80;
const LOAD_OLDER_THRESHOLD = 80;

export const DirectMessageList = forwardRef<
  DirectMessageListHandle,
  DirectMessageListProps
>(({
  conversationId,
  messages,
  currentUserId,
  targetUser,
  loadingMore = false,
  hasMore = false,
  onLoadMore,
  extraContentPadding,
  ownSendScrollRequest,
}, ref) => {
  const { colors } = useTheme();
  const isSystemBold = useSystemBoldText();
  const listRef = useRef<FlatList<DirectMessage>>(null);
  const isNearLatestRef = useRef(true);
  const loadingOlderLockRef = useRef(false);
  const hasLeftOlderThresholdRef = useRef(false);
  const pendingScrollReasonRef = useRef<"incoming-near-latest" | null>(null);
  const lastConsumedOwnSendSequenceRef = useRef(0);
  const pendingOwnSendScrollRequestRef =
    useRef<OwnSendScrollRequest | null>(null);
  const previousMessageBoundsRef = useRef<{
    newestId?: string;
    oldestId?: string;
  }>({});
  const composerFocusScrollPendingRef = useRef(false);
  const viewportHeightRef = useRef(0);
  const messagesRef = useRef(messages);
  const currentUserIdRef = useRef(currentUserId);

  messagesRef.current = messages;
  currentUserIdRef.current = currentUserId;

  const scrollToLatest = useCallback((animated: boolean) => {
    if (!listRef.current || messages.length === 0) {
      return;
    }

    listRef.current.scrollToOffset({
      offset: 0,
      animated,
    });
  }, [messages.length]);

  const flushPendingScroll = useCallback(() => {
    const reason = pendingScrollReasonRef.current;
    if (!reason || messages.length === 0) {
      return;
    }

    pendingScrollReasonRef.current = null;
    isNearLatestRef.current = true;
    scrollToLatest(true);
  }, [messages.length, scrollToLatest]);

  const consumePendingOwnSendScroll = useCallback((
    trigger: "content-size" | "latest-id-raf",
  ) => {
    const pendingRequest = pendingOwnSendScrollRequestRef.current;
    if (pendingRequest === null) {
      return;
    }

    if (
      pendingRequest.sequence <= lastConsumedOwnSendSequenceRef.current
    ) {
      pendingOwnSendScrollRequestRef.current = null;
      return;
    }

    const latestMessage = messagesRef.current[0];
    const latestChanged =
      !!latestMessage &&
      (
        pendingRequest.previousLatestId === null ||
        latestMessage.id !== pendingRequest.previousLatestId
      );
    const latestMessageIsOwn =
      !!latestMessage &&
      !!currentUserIdRef.current &&
      latestMessage.sender_id === currentUserIdRef.current;
    const canScroll =
      !!listRef.current && latestChanged && latestMessageIsOwn;

    if (__DEV__) {
      console.log("[DM Own Send Scroll]", {
        sequence: pendingRequest.sequence,
        previousLatestId: pendingRequest.previousLatestId,
        currentLatestId: latestMessage?.id ?? null,
        latestChanged,
        latestIsOwn: latestMessageIsOwn,
        consumed: canScroll,
        trigger,
        offset: canScroll ? 0 : null,
      });
    }

    if (!canScroll) {
      return;
    }

    listRef.current?.scrollToOffset({
      offset: 0,
      animated: false,
    });
    isNearLatestRef.current = true;
    lastConsumedOwnSendSequenceRef.current = pendingRequest.sequence;
    pendingOwnSendScrollRequestRef.current = null;
  }, []);

  useImperativeHandle(ref, () => ({
    scrollToLatestForComposerFocus: () => {
      composerFocusScrollPendingRef.current = true;
      scrollToLatest(true);
    },
  }), [scrollToLatest]);

  useEffect(() => {
    isNearLatestRef.current = true;
    loadingOlderLockRef.current = false;
    hasLeftOlderThresholdRef.current = false;
    pendingScrollReasonRef.current = null;
    lastConsumedOwnSendSequenceRef.current = ownSendScrollRequest.sequence;
    pendingOwnSendScrollRequestRef.current = null;
    previousMessageBoundsRef.current = {};
    composerFocusScrollPendingRef.current = false;
    viewportHeightRef.current = 0;
  }, [conversationId]);

  useEffect(() => {
    if (
      ownSendScrollRequest.sequence <=
      lastConsumedOwnSendSequenceRef.current
    ) {
      return;
    }

    pendingOwnSendScrollRequestRef.current = {
      sequence: ownSendScrollRequest.sequence,
      previousLatestId: ownSendScrollRequest.previousLatestId,
    };

    if (__DEV__) {
      console.log("[DM Own Send Scroll]", {
        sequence: ownSendScrollRequest.sequence,
        previousLatestId: ownSendScrollRequest.previousLatestId,
        currentLatestId: messagesRef.current[0]?.id ?? null,
        latestChanged:
          !!messagesRef.current[0] &&
          (
            ownSendScrollRequest.previousLatestId === null ||
            messagesRef.current[0].id !==
              ownSendScrollRequest.previousLatestId
          ),
        latestIsOwn:
          messagesRef.current[0]?.sender_id === currentUserIdRef.current,
        consumed: false,
        trigger: "request",
        offset: null,
      });
    }
  }, [
    ownSendScrollRequest.previousLatestId,
    ownSendScrollRequest.sequence,
  ]);

  const latestMessageId = messages[0]?.id ?? null;

  useEffect(() => {
    const pendingRequest = pendingOwnSendScrollRequestRef.current;
    if (
      !pendingRequest ||
      !latestMessageId ||
      latestMessageId === pendingRequest.previousLatestId
    ) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      consumePendingOwnSendScroll("latest-id-raf");
    });

    return () => cancelAnimationFrame(frame);
  }, [
    consumePendingOwnSendScroll,
    latestMessageId,
    ownSendScrollRequest.sequence,
  ]);

  useEffect(() => {
    const newestMessage = messages[0];
    const oldestMessage = messages[messages.length - 1];
    const previousBounds = previousMessageBoundsRef.current;
    const insertedAtLatestPosition =
      !!previousBounds.newestId &&
      !!newestMessage &&
      previousBounds.newestId !== newestMessage.id &&
      previousBounds.oldestId === oldestMessage?.id;

    if (
      insertedAtLatestPosition &&
      newestMessage.sender_id !== currentUserId
    ) {
      if (isNearLatestRef.current) {
        pendingScrollReasonRef.current = "incoming-near-latest";
      }
    }

    previousMessageBoundsRef.current = {
      newestId: newestMessage?.id,
      oldestId: oldestMessage?.id,
    };
    flushPendingScroll();
  }, [currentUserId, flushPendingScroll, messages]);

  const handleContentSizeChange = useCallback(() => {
    consumePendingOwnSendScroll("content-size");
  }, [consumePendingOwnSendScroll]);

  const handleScroll = useCallback((
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const offsetFromLatest = Math.max(0, contentOffset.y);
    const contentFitsViewport = contentSize.height <= layoutMeasurement.height;
    const isNearLatest =
      contentFitsViewport || offsetFromLatest <= NEAR_LATEST_THRESHOLD;
    const distanceFromOlderEnd = Math.max(
      0,
      contentSize.height - layoutMeasurement.height - offsetFromLatest,
    );

    isNearLatestRef.current = isNearLatest;

    if (distanceFromOlderEnd > LOAD_OLDER_THRESHOLD) {
      hasLeftOlderThresholdRef.current = true;
      loadingOlderLockRef.current = false;
      return;
    }

    if (
      distanceFromOlderEnd <= LOAD_OLDER_THRESHOLD &&
      hasLeftOlderThresholdRef.current &&
      hasMore &&
      !loadingMore &&
      !loadingOlderLockRef.current &&
      onLoadMore
    ) {
      loadingOlderLockRef.current = true;
      onLoadMore();
    }
  }, [hasMore, loadingMore, onLoadMore]);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const nextViewportHeight = event.nativeEvent.layout.height;
    const previousViewportHeight = viewportHeightRef.current;
    viewportHeightRef.current = nextViewportHeight;

    const viewportChanged =
      previousViewportHeight > 0 &&
      Math.abs(nextViewportHeight - previousViewportHeight) > 1;

    if (!composerFocusScrollPendingRef.current || !viewportChanged) {
      return;
    }

    composerFocusScrollPendingRef.current = false;
    requestAnimationFrame(() => {
      scrollToLatest(false);
    });
  }, [scrollToLatest]);

  const renderItem = ({ item, index }: {
    item: DirectMessage;
    index: number;
  }) => {
    const isMe = item.sender_id === currentUserId;
    let showDateSeparator = false;
    let dateStr = "";

    if (item.created_at) {
      try {
        const itemDate = new Date(item.created_at).toLocaleDateString();
        const visuallyPreviousMessage =
          index < messages.length - 1 ? messages[index + 1] : null;
        const visuallyPreviousDate = visuallyPreviousMessage?.created_at
          ? new Date(visuallyPreviousMessage.created_at).toLocaleDateString()
          : null;

        if (
          index === messages.length - 1 ||
          itemDate !== visuallyPreviousDate
        ) {
          showDateSeparator = true;
          dateStr = new Date(item.created_at).toLocaleDateString(undefined, {
            year: "numeric",
            month: "long",
            day: "numeric",
          });
        }
      } catch {
        showDateSeparator = false;
      }
    }

    return (
      <View>
        {showDateSeparator && <DateSeparator dateString={dateStr} />}
        <DirectMessageItem
          item={item}
          isMe={isMe}
          targetUser={targetUser}
          systemBold={isSystemBold}
        />
      </View>
    );
  };

  const renderScrollComponent = useCallback(
    (props: ScrollViewProps) => (
      <DirectKeyboardScrollView
        {...props}
        extraContentPadding={extraContentPadding}
      />
    ),
    [extraContentPadding],
  );

  return (
    <FlatList
      key={conversationId}
      ref={listRef}
      style={styles.list}
      data={messages}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      inverted
      renderScrollComponent={renderScrollComponent}
      contentContainerStyle={styles.listContainer}
      maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={
        Platform.OS === "ios" ? "interactive" : "on-drag"
      }
      onLayout={handleLayout}
      onScroll={handleScroll}
      onContentSizeChange={handleContentSizeChange}
      scrollEventThrottle={16}
      ListFooterComponent={
        loadingMore ? (
          <View style={styles.loadingOlder}>
            <ActivityIndicator size="small" color={colors.accentPurple} />
          </View>
        ) : null
      }
      ListEmptyComponent={
        <View style={styles.emptyContainer}>
          <Ionicons
            name="chatbubble-ellipses-outline"
            size={48}
            color={colors.accentPurple}
          />
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>대화를 시작해보세요</Text>
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            첫 메시지를 보내면 여기에 표시됩니다.
          </Text>
        </View>
      }
    />
  );
});

const styles = StyleSheet.create({
  list: {
    flex: 1,
    minHeight: 0,
  },
  listContainer: {
    paddingVertical: 16,
    flexGrow: 1,
  },
  loadingOlder: {
    paddingVertical: 12,
    alignItems: "center",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  emptyTitle: {
    marginTop: 16,
    marginBottom: 6,
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
});
