import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { AppState, AppStateStatus } from "react-native";
import * as Notifications from "expo-notifications";
import { useAuth } from "./AuthContext";
import {
  notificationService,
  NotificationItem,
} from "../services/notifications";
import { ToastData } from "../components/NotificationToast";
import { directService } from "../features/direct/services/directService";

interface NotificationContextType {
  notifications: NotificationItem[];
  unreadCount: number;
  directUnreadCount: number;
  toastNotification: ToastData | null;
  loading: boolean;
  refreshNotifications: () => Promise<void>;
  refreshDirectUnread: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  clearToast: () => void;
}

const NotificationContext = createContext<NotificationContextType>(
  {} as NotificationContextType
);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [directUnreadCount, setDirectUnreadCount] = useState<number>(0);
  const [toastNotification, setToastNotification] = useState<ToastData | null>(
    null
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [isWsConnected, setIsWsConnected] = useState<boolean>(false);

  const prevUnreadCountRef = useRef<number>(0);
  const recentToastIdsRef = useRef<string[]>([]);
  const isPollingRef = useRef<boolean>(false);
  const currentUserIdRef = useRef<string | undefined>(user?.id);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const pollingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    currentUserIdRef.current = user?.id;
  }, [user?.id]);

  const clearToast = () => {
    setToastNotification(null);
  };

  const triggerToast = useCallback((item: NotificationItem) => {
    if (!item?.id) return;

    // Deduplicate Toast: skip if this notification ID was recently toasted
    if (recentToastIdsRef.current.includes(item.id)) {
      return;
    }

    // Record toasted ID (keep max 20 items in memory)
    recentToastIdsRef.current = [item.id, ...recentToastIdsRef.current.slice(0, 19)];

    setToastNotification({
      id: item.id,
      sender: {
        id: item.sender.id,
        username: item.sender.username,
        nickname: item.sender.nickname,
        full_name: item.sender.full_name,
        profile_image_url: item.sender.profile_image_url,
        is_admin: item.sender.is_admin,
      },
      type: item.type,
      message: item.message,
      post_id: item.post_id,
      comment_id: item.comment_id,
    });
  }, []);

  const refreshNotifications = useCallback(async () => {
    const userId = currentUserIdRef.current;
    if (!userId) return;
    try {
      const data = await notificationService.getNotifications(30, 0);
      if (currentUserIdRef.current !== userId) return;
      setNotifications(data.items);
      setUnreadCount(data.unread_count);
      prevUnreadCountRef.current = data.unread_count;
    } catch (err) {
      console.log("Error refreshing notifications", err);
    }
  }, []);

  const refreshDirectUnread = useCallback(async () => {
    const userId = currentUserIdRef.current;
    if (!userId) return;
    try {
      const count = await directService.getUnreadCount();
      if (currentUserIdRef.current === userId) {
        setDirectUnreadCount(count);
      }
    } catch {
      // The notification channel remains usable if DM sync is temporarily down.
    }
  }, []);

  const markAsRead = useCallback(async (id: string) => {
    try {
      await notificationService.markAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error("Failed to mark notification as read", err);
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    try {
      await notificationService.markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error("Failed to mark all as read", err);
    }
  }, []);

  // 1. Real-time WebSocket Connection with Status Tracking
  useEffect(() => {
    const userId = user?.id;
    if (!userId) {
      setIsWsConnected(false);
      return;
    }

    const unsubscribe = notificationService.subscribeWebSocket(
      (payload) => {
        if (currentUserIdRef.current !== userId) return;
        if (payload?.event === "NEW_NOTIFICATION" && payload?.notification) {
          const newNotif: NotificationItem = payload.notification;
          setNotifications((prev) => {
            if (prev.some((n) => n.id === newNotif.id)) return prev;
            return [newNotif, ...prev];
          });
          setUnreadCount((prev) => prev + 1);
          if (newNotif.type === "DIRECT_MESSAGE") {
            setDirectUnreadCount((prev) => prev + 1);
          }
          triggerToast(newNotif);
        }
      },
      (status) => {
        if (currentUserIdRef.current !== userId) return;
        setIsWsConnected(status === "connected");
      }
    );

    return () => {
      setIsWsConnected(false);
      unsubscribe();
    };
  }, [user?.id, triggerToast]);

  // 2. Polling Logic (In-flight guard, Smart interval & AppState awareness)
  const stopPollingTimer = useCallback(() => {
    if (pollingTimerRef.current) {
      clearInterval(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
  }, []);

  const runPollingCheck = useCallback(async () => {
    const userId = currentUserIdRef.current;
    if (!userId || isPollingRef.current) return;

    isPollingRef.current = true;
    try {
      const count = await notificationService.getUnreadCount();
      if (currentUserIdRef.current !== userId) return;

      if (count > prevUnreadCountRef.current) {
        // New notification detected via polling!
        const data = await notificationService.getNotifications(30, 0);
        if (currentUserIdRef.current !== userId) return;

        setNotifications(data.items);
        setUnreadCount(data.unread_count);

        if (data.items.length > 0) {
          triggerToast(data.items[0]);
        }
      } else {
        setUnreadCount(count);
      }
      prevUnreadCountRef.current = count;
    } catch (e) {
      // quiet error handling during polling
    } finally {
      isPollingRef.current = false;
    }
  }, [triggerToast]);

  // Handle Initial Load, Polling Schedule & AppState Changes
  useEffect(() => {
    const userId = user?.id;
    if (!userId) {
      setNotifications([]);
      setUnreadCount(0);
      setDirectUnreadCount(0);
      setToastNotification(null);
      recentToastIdsRef.current = [];
      stopPollingTimer();
      return;
    }

    setLoading(true);
    Promise.all([refreshNotifications(), refreshDirectUnread()]).finally(() => {
      if (currentUserIdRef.current === userId) {
        setLoading(false);
      }
    });

    const startPolling = () => {
      stopPollingTimer();
      // Smart Interval: 60s when WebSocket connected, 10s fallback when disconnected
      const intervalMs = isWsConnected ? 60000 : 10000;
      pollingTimerRef.current = setInterval(() => {
        if (appStateRef.current === "active") {
          runPollingCheck();
          refreshDirectUnread();
        }
      }, intervalMs);
    };

    startPolling();

    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextAppState === "active"
      ) {
        // Immediate sync upon returning to foreground
        runPollingCheck();
        refreshDirectUnread();
        startPolling();
      } else if (nextAppState.match(/inactive|background/)) {
        stopPollingTimer();
      }
      appStateRef.current = nextAppState;
    };

    const appStateSubscription = AppState.addEventListener(
      "change",
      handleAppStateChange
    );

    return () => {
      stopPollingTimer();
      appStateSubscription.remove();
    };
  }, [
    user?.id,
    isWsConnected,
    refreshNotifications,
    refreshDirectUnread,
    runPollingCheck,
    stopPollingTimer,
  ]);

  useEffect(() => {
    prevUnreadCountRef.current = unreadCount;
    void Notifications.setBadgeCountAsync(unreadCount).catch(() => undefined);
  }, [unreadCount]);

  const value = useMemo(
    () => ({
      notifications,
      unreadCount,
      directUnreadCount,
      toastNotification,
      loading,
      refreshNotifications,
      refreshDirectUnread,
      markAsRead,
      markAllAsRead,
      clearToast,
    }),
    [
      notifications,
      unreadCount,
      directUnreadCount,
      toastNotification,
      loading,
      refreshNotifications,
      refreshDirectUnread,
      markAsRead,
      markAllAsRead,
      clearToast,
    ]
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotification = () => useContext(NotificationContext);
