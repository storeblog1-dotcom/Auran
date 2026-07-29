import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { directApi } from "./directApi";
import {
  directMessageReducer,
  initialDirectMessageState,
  selectDirectMessages,
} from "./messageReducer";
import { directRealtime } from "./supabaseRealtime";
import { createDirectClientMessageId } from "./clientMessageId";
import {
  CreateDirectMessage,
  DirectConnectionState,
  DirectMessage,
  DirectMessageKind,
  DirectRealtimeEvent,
  DirectRealtimeSubscription,
  DirectUser,
} from "./types";

const asDirectUser = (user: any): DirectUser => ({
  id: String(user?.id || ""),
  username: String(user?.username || ""),
  nickname: user?.nickname ?? null,
  full_name: user?.full_name ?? null,
  profile_image_url: user?.profile_image_url ?? null,
  is_admin: Boolean(user?.is_admin),
  is_online: Boolean(user?.is_online),
  last_seen_at: user?.last_seen_at ?? null,
});

interface SendMessageInput {
  content?: string | null;
  message_type: DirectMessageKind;
  media_url?: string | null;
  shared_post_id?: string | null;
  client_message_id?: string;
}

interface UseDirectConversationOptions {
  roomId: string;
  currentUser: DirectUser | null | undefined;
  targetUser: DirectUser | null | undefined;
  isActive: boolean;
}

const eventMessageWithKnownSender = (
  message: DirectMessage,
  currentUser: DirectUser,
  targetUser?: DirectUser | null
) => {
  const senderId = message.sender.id;
  if (senderId === currentUser.id) {
    return { ...message, sender: { ...currentUser, ...message.sender } };
  }
  if (targetUser && senderId === targetUser.id) {
    return { ...message, sender: { ...targetUser, ...message.sender } };
  }
  return message;
};

export const useDirectConversation = ({
  roomId,
  currentUser: currentUserValue,
  targetUser,
  isActive,
}: UseDirectConversationOptions) => {
  const currentUser = useMemo(
    () => asDirectUser(currentUserValue),
    [currentUserValue]
  );
  const [state, dispatch] = useReducer(
    directMessageReducer,
    initialDirectMessageState
  );
  const [loading, setLoading] = useState(true);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [connectionState, setConnectionState] =
    useState<DirectConnectionState>("connecting");
  const [realtimeGeneration, setRealtimeGeneration] = useState(0);
  const [peerTyping, setPeerTyping] = useState(false);
  const [peerOnline, setPeerOnline] = useState(
    Boolean(targetUser?.is_online)
  );
  const [peerLastSeenAt, setPeerLastSeenAt] = useState<string | null>(
    targetUser?.last_seen_at ?? null
  );
  const subscriptionRef = useRef<DirectRealtimeSubscription | null>(null);
  const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peerTypingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localTypingRef = useRef(false);
  const mountedRef = useRef(true);
  const knownMessageIdsRef = useRef(new Set<string>());
  const isActiveRef = useRef(isActive);
  const initializedHistoryRef = useRef(false);
  const activeRoomIdRef = useRef(roomId);
  activeRoomIdRef.current = roomId;
  const messages = useMemo(
    () =>
      selectDirectMessages(state).filter(
        (message) => message.room_id === roomId
      ),
    [roomId, state]
  );
  const newestIncomingMessageId = useMemo(
    () =>
      [...messages]
        .reverse()
        .find((message) => message.sender.id !== currentUser.id)?.id,
    [currentUser.id, messages]
  );

  useEffect(() => {
    knownMessageIdsRef.current = new Set(messages.map((message) => message.id));
  }, [messages]);

  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  useEffect(() => {
    dispatch({ type: "conversation.reset" });
    knownMessageIdsRef.current.clear();
    initializedHistoryRef.current = false;
    setHasOlderMessages(false);
    setLoadingOlderMessages(false);
    setLoading(true);
    setPeerTyping(false);
    setPeerOnline(Boolean(targetUser?.is_online));
    setPeerLastSeenAt(targetUser?.last_seen_at ?? null);
  }, [roomId]);

  useEffect(() => {
    let cancelled = false;
    void directApi
      .getRoomPresence(roomId)
      .then((presence) => {
        if (cancelled || !targetUser?.id) return;
        const peerPresence = presence.find(
          (item) => item.user_id === targetUser.id
        );
        if (peerPresence?.last_active_at) {
          setPeerLastSeenAt(peerPresence.last_active_at);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [roomId, targetUser?.id]);

  const loadMessages = useCallback(async () => {
    try {
      const history = await directApi.listMessages(roomId);
      if (!mountedRef.current || activeRoomIdRef.current !== roomId) return;
      const hydratedHistory = history.map((message) =>
        eventMessageWithKnownSender(message, currentUser, targetUser)
      );
      dispatch({
        type: "history.received",
        messages: hydratedHistory,
      });
      if (!initializedHistoryRef.current) {
        initializedHistoryRef.current = true;
        setHasOlderMessages(history.length === 100);
      }
      const newestUnseenIncoming = [...hydratedHistory]
        .reverse()
        .find(
          (message) =>
            message.sender.id !== currentUser.id &&
            !knownMessageIdsRef.current.has(message.id)
        );
      if (newestUnseenIncoming) {
        void directApi
          .markDelivered(roomId, newestUnseenIncoming.id)
          .catch(() => undefined);
        if (isActiveRef.current) {
          void directApi
            .markRead(roomId, newestUnseenIncoming.id)
            .catch(() => undefined);
        }
      }
    } finally {
      if (mountedRef.current && activeRoomIdRef.current === roomId) {
        setLoading(false);
      }
    }
  }, [currentUser, roomId, targetUser]);

  const loadOlderMessages = useCallback(async () => {
    if (loadingOlderMessages || !hasOlderMessages) return;
    const oldestServerMessage = messages.find(
      (message) => !message.id.startsWith("local:")
    );
    if (!oldestServerMessage) return;
    setLoadingOlderMessages(true);
    try {
      const older = await directApi.listMessages(
        roomId,
        oldestServerMessage.id
      );
      if (!mountedRef.current || activeRoomIdRef.current !== roomId) return;
      const unseenOlder = older.filter(
        (message) => !knownMessageIdsRef.current.has(message.id)
      );
      dispatch({
        type: "history.received",
        messages: older.map((message) =>
          eventMessageWithKnownSender(message, currentUser, targetUser)
        ),
      });
      setHasOlderMessages(older.length === 100 && unseenOlder.length > 0);
    } finally {
      if (mountedRef.current && activeRoomIdRef.current === roomId) {
        setLoadingOlderMessages(false);
      }
    }
  }, [
    currentUser,
    hasOlderMessages,
    loadingOlderMessages,
    messages,
    roomId,
    targetUser,
  ]);

  const handleRealtimeEvent = useCallback(
    (event: DirectRealtimeEvent) => {
      if (
        activeRoomIdRef.current !== roomId ||
        event.room_id !== roomId
      ) {
        return;
      }
      if (event.type === "message.created" || event.type === "message.updated") {
        const message = eventMessageWithKnownSender(
          event.message,
          currentUser,
          targetUser
        );
        dispatch({ type: "message.received", message });
        if (message.sender.id !== currentUser.id) {
          void directApi
            .markDelivered(roomId, message.id)
            .catch(() => undefined);
          if (isActiveRef.current) {
            void directApi.markRead(roomId, message.id).catch(() => undefined);
          }
        }
        return;
      }
      if (event.type === "message.read" && event.user_id !== currentUser.id) {
        dispatch({
          type: "messages.read",
          messageIds: event.message_ids,
          senderId: currentUser.id,
          readAt: event.read_at,
        });
        return;
      }
      if (
        event.type === "message.delivered" &&
        event.user_id !== currentUser.id
      ) {
        dispatch({
          type: "messages.delivered",
          messageIds: event.message_ids,
          senderId: currentUser.id,
          deliveredAt: event.delivered_at,
        });
        return;
      }
      if (event.type === "typing" && event.user_id !== currentUser.id) {
        setPeerTyping(event.is_typing);
        if (peerTypingTimerRef.current) {
          clearTimeout(peerTypingTimerRef.current);
        }
        if (event.is_typing) {
          peerTypingTimerRef.current = setTimeout(
            () => setPeerTyping(false),
            2500
          );
        }
        return;
      }
      if (event.type === "presence" && event.user_id === targetUser?.id) {
        setPeerOnline(event.is_online);
        if (event.last_seen_at) setPeerLastSeenAt(event.last_seen_at);
      }
    },
    [currentUser, roomId, targetUser]
  );

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    void loadMessages().catch(() => {
      if (mountedRef.current) setLoading(false);
    });
    void directRealtime
      .subscribe(roomId, currentUser.id, {
        onEvent: handleRealtimeEvent,
        onConnectionChange: (nextState) => {
          if (!cancelled) setConnectionState(nextState);
          if (nextState === "online") void loadMessages();
        },
      })
      .then((subscription) => {
        if (cancelled) {
          subscription.close();
          return;
        }
        subscriptionRef.current = subscription;
      })
      .catch(() => {
        if (!cancelled) setConnectionState("offline");
      });

    return () => {
      cancelled = true;
      mountedRef.current = false;
      if (typingStopTimerRef.current) {
        clearTimeout(typingStopTimerRef.current);
      }
      if (peerTypingTimerRef.current) {
        clearTimeout(peerTypingTimerRef.current);
      }
      subscriptionRef.current?.setTyping(false);
      localTypingRef.current = false;
      subscriptionRef.current?.close();
      subscriptionRef.current = null;
    };
  }, [
    currentUser.id,
    handleRealtimeEvent,
    loadMessages,
    realtimeGeneration,
    roomId,
  ]);

  useEffect(() => {
    if (connectionState !== "offline" || !isActive) return;
    const retryTimer = setTimeout(() => {
      setRealtimeGeneration((generation) => generation + 1);
    }, 15_000);
    return () => clearTimeout(retryTimer);
  }, [connectionState, isActive, roomId]);

  useEffect(() => {
    if (connectionState !== "online") setPeerTyping(false);
  }, [connectionState]);

  useEffect(() => {
    if (connectionState === "online" || !isActive) return;
    // Supabase configuration can be temporarily unavailable during rollout.
    // Keep REST reconciliation as a delivery fallback, but stop the fast
    // polling immediately when the private realtime channel recovers.
    const fallbackTimer = setInterval(() => {
      void loadMessages().catch(() => undefined);
    }, 2000);
    return () => clearInterval(fallbackTimer);
  }, [connectionState, isActive, loadMessages]);

  useEffect(() => {
    subscriptionRef.current?.setPresence(isActive);
    if (!isActive) {
      subscriptionRef.current?.setTyping(false);
      setPeerTyping(false);
      return;
    }
    if (newestIncomingMessageId) {
      void directApi
        .markRead(roomId, newestIncomingMessageId)
        .catch(() => undefined);
    }
  }, [isActive, newestIncomingMessageId, roomId]);

  const signalTyping = useCallback((hasText: boolean) => {
    if (typingStopTimerRef.current) {
      clearTimeout(typingStopTimerRef.current);
    }
    if (hasText) {
      if (!localTypingRef.current) {
        localTypingRef.current = true;
        subscriptionRef.current?.setTyping(true);
      }
      typingStopTimerRef.current = setTimeout(() => {
        localTypingRef.current = false;
        subscriptionRef.current?.setTyping(false);
      }, 1600);
    } else if (localTypingRef.current) {
      localTypingRef.current = false;
      subscriptionRef.current?.setTyping(false);
    }
  }, []);

  const sendMessage = useCallback(
    async (input: SendMessageInput) => {
      const clientMessageId =
        input.client_message_id || createDirectClientMessageId();
      const payload: CreateDirectMessage = {
        content: input.content ?? null,
        message_type: input.message_type,
        media_url: input.media_url ?? null,
        shared_post_id: input.shared_post_id ?? null,
        client_message_id: clientMessageId,
      };
      const optimistic: DirectMessage = {
        id: `local:${clientMessageId}`,
        room_id: roomId,
        sender: currentUser,
        content: payload.content ?? null,
        message_type: payload.message_type,
        media_url: payload.media_url ?? null,
        shared_post_id: payload.shared_post_id ?? null,
        created_at: new Date().toISOString(),
        client_message_id: clientMessageId,
        delivered_at: null,
        read_at: null,
        delivery_status: "pending",
        local_status: "pending",
        error_message: null,
      };
      dispatch({ type: "message.optimistic", message: optimistic });
      signalTyping(false);

      try {
        const saved = eventMessageWithKnownSender(
          await directApi.sendMessage(roomId, payload),
          currentUser,
          targetUser
        );
        if (activeRoomIdRef.current !== roomId) return saved;
        dispatch({
          type: "message.acknowledged",
          clientMessageId,
          message: saved,
        });
        return saved;
      } catch (error: any) {
        const message =
          error?.response?.data?.error?.message ||
          error?.response?.data?.detail ||
          "메시지를 보내지 못했습니다.";
        if (activeRoomIdRef.current === roomId) {
          dispatch({
            type: "message.failed",
            clientMessageId,
            errorMessage: message,
          });
        }
        throw error;
      }
    },
    [currentUser, roomId, signalTyping, targetUser]
  );

  const retryMessage = useCallback(
    async (message: DirectMessage) => {
      if (!message.client_message_id) return;
      await sendMessage({
        content: message.content,
        message_type: message.message_type,
        media_url: message.media_url,
        shared_post_id: message.shared_post_id,
        client_message_id: message.client_message_id,
      });
    },
    [sendMessage]
  );

  return {
    messages,
    loading,
    loadingOlderMessages,
    hasOlderMessages,
    connectionState,
    peerTyping,
    peerOnline,
    peerLastSeenAt,
    reload: loadMessages,
    loadOlderMessages,
    sendMessage,
    retryMessage,
    signalTyping,
  };
};
