import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { useAuth } from "./AuthContext";
import {
  notificationService,
  NotificationItem,
} from "../services/notifications";
import { ToastData } from "../components/NotificationToast";

interface NotificationContextType {
  notifications: NotificationItem[];
  unreadCount: number;
  toastNotification: ToastData | null;
  loading: boolean;
  refreshNotifications: () => Promise<void>;
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
  const [toastNotification, setToastNotification] = useState<ToastData | null>(
    null
  );
  const [loading, setLoading] = useState<boolean>(false);

  const prevUnreadCountRef = useRef<number>(0);

  const refreshNotifications = useCallback(async () => {
    if (!user?.id) return;
    try {
      const data = await notificationService.getNotifications(30, 0);
      setNotifications(data.items);
      setUnreadCount(data.unread_count);
    } catch (err) {
      console.log("Error refreshing notifications", err);
    }
  }, [user?.id]);

  const markAsRead = async (id: string) => {
    try {
      await notificationService.markAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error("Failed to mark notification as read", err);
    }
  };

  const markAllAsRead = async () => {
    try {
      await notificationService.markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error("Failed to mark all as read", err);
    }
  };

  const clearToast = () => {
    setToastNotification(null);
  };

  const triggerToast = (item: NotificationItem) => {
    setToastNotification({
      id: item.id,
      sender: {
        id: item.sender.id,
        username: item.sender.username,
        full_name: item.sender.full_name,
        profile_image_url: item.sender.profile_image_url,
      },
      type: item.type,
      message: item.message,
      post_id: item.post_id,
      comment_id: item.comment_id,
    });
  };

  // 1. Initial Load & Periodic Smart Polling (Every 5 seconds)
  useEffect(() => {
    if (!user?.id) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    setLoading(true);
    refreshNotifications().finally(() => setLoading(false));

    const interval = setInterval(async () => {
      try {
        const count = await notificationService.getUnreadCount();
        if (count > prevUnreadCountRef.current) {
          // New notification detected via polling!
          const data = await notificationService.getNotifications(30, 0);
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
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [user?.id, refreshNotifications]);

  // 2. Real-time WebSocket Connection
  useEffect(() => {
    if (!user?.id) return;

    const ws = notificationService.subscribeWebSocket(user.id, (payload) => {
      if (payload?.event === "NEW_NOTIFICATION" && payload?.notification) {
        const newNotif: NotificationItem = payload.notification;
        setNotifications((prev) => [newNotif, ...prev]);
        setUnreadCount((prev) => prev + 1);
        triggerToast(newNotif);
      }
    });

    return () => {
      ws?.close();
    };
  }, [user?.id]);

  useEffect(() => {
    prevUnreadCountRef.current = unreadCount;
  }, [unreadCount]);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        toastNotification,
        loading,
        refreshNotifications,
        markAsRead,
        markAllAsRead,
        clearToast,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotification = () => useContext(NotificationContext);
