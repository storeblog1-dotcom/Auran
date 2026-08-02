import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../../context/AuthContext";
import { directService } from "../services/directService";
import { DirectMessage } from "../types/direct";

export function useDirectChat(conversationId: string) {
  const { user, token } = useAuth();
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [hasMore, setHasMore] = useState<boolean>(true);

  const wsRef = useRef<WebSocket | null>(null);

  // 1. Initial message loading
  const fetchInitialMessages = useCallback(async () => {
    if (!conversationId) return;
    setLoading(true);
    try {
      const data = await directService.getMessages(conversationId, 30);
      setMessages([...data].reverse());
      setHasMore(data.length >= 30);
    } catch (err) {
      if (__DEV__) {
        console.log("Error loading initial direct messages", err);
      }
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  // 2. Load older messages (pagination structure)
  const loadMoreMessages = useCallback(async () => {
    if (!conversationId || loadingMore || !hasMore || messages.length === 0) return;

    const oldestMsg = messages[messages.length - 1];
    if (!oldestMsg || oldestMsg.isOptimistic) return;

    setLoadingMore(true);
    try {
      const olderData = await directService.getMessages(
        conversationId,
        30,
        oldestMsg.id,
      );
      if (olderData.length > 0) {
        const normalizedOlder = [...olderData].reverse();
        setMessages((prev) => {
          // Avoid duplicate keys
          const existingIds = new Set(prev.map((m) => m.id));
          const filteredNew = normalizedOlder.filter((m) => !existingIds.has(m.id));
          return [...prev, ...filteredNew];
        });
      }
      setHasMore(olderData.length >= 30);
    } catch (err) {
      if (__DEV__) {
        console.log("Error loading older messages", err);
      }
    } finally {
      setLoadingMore(false);
    }
  }, [conversationId, hasMore, loadingMore, messages]);

  // 3. WebSocket Realtime Receiver
  useEffect(() => {
    if (!conversationId) return;

    let socket: WebSocket | null = null;
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    try {
      if (!token) return;
      const wsUrl = directService.getWebSocketUrl(conversationId, token);
      socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload && payload.event === "DIRECT_MESSAGE_CREATED" && payload.data) {
            const incomingMsg: DirectMessage = payload.data;

            setMessages((prev) => {
              // If we sent it optimistically, or it already exists, replace or ignore
              const exists = prev.some((m) => m.id === incomingMsg.id);
              if (exists) return prev;

              // Remove temporary optimistic message with same content if from self
              const cleanPrev = prev.filter(
                (m) =>
                  !(
                    m.isOptimistic &&
                    m.sender_id === incomingMsg.sender_id &&
                    m.content === incomingMsg.content
                  )
              );
              return [incomingMsg, ...cleanPrev];
            });
          }
        } catch (e) {
          if (__DEV__) {
            console.log("[DirectWS] Error parsing websocket message", e);
          }
        }
      };
      socket.onopen = () => {
        socket?.send("ping");
        heartbeat = setInterval(() => {
          if (socket?.readyState === WebSocket.OPEN) socket.send("ping");
        }, 45_000);
      };

      socket.onerror = (err) => {
        if (__DEV__) {
          console.log("[DirectWS] Socket error", err);
        }
      };
    } catch (e) {
      if (__DEV__) {
        console.log("[DirectWS] Error creating socket", e);
      }
    }

    return () => {
      if (heartbeat) clearInterval(heartbeat);
      if (socket) {
        socket.close();
      }
      wsRef.current = null;
    };
  }, [conversationId, token]);

  // 4. Initial Load
  useEffect(() => {
    fetchInitialMessages();
  }, [fetchInitialMessages]);

  // 5. Optimistic Send Message
  const sendMessage = useCallback(
    async (content: string) => {
      if (!conversationId || !content.trim() || !user) return;

      const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const optimisticMsg: DirectMessage = {
        id: tempId,
        conversation_id: conversationId,
        sender_id: user.id,
        sender: {
          id: user.id,
          username: user.username,
          full_name: user.full_name || user.username,
          profile_image_url: user.profile_image_url,
        },
        content,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        isOptimistic: true,
      };

      // 1. Optimistically insert at the inverted list's latest position
      setMessages((prev) => [optimisticMsg, ...prev]);

      try {
        // 2. Call API
        const realMsg = await directService.sendMessage(conversationId, content);

        // 3. Replace temp with confirmed server data
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? realMsg : m))
        );
      } catch (err) {
        if (__DEV__) {
          console.log("Error sending direct message", err);
        }
        // 4. On failure, remove optimistic message
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
      }
    },
    [conversationId, user]
  );

  return {
    messages,
    loading,
    loadingMore,
    hasMore,
    sendMessage,
    loadMoreMessages,
  };
}
