import React, { useEffect, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  Image,
  TouchableOpacity,
  Animated,
  SafeAreaView,
  Platform,
  StatusBar,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getFullImageUrl } from "../config";
import { useTheme } from "../context/ThemeContext";
import { getDisplayName } from "../utils/displayName";

export interface ToastData {
  id: string;
  sender: {
    id: string;
    username: string;
    nickname?: string | null;
    full_name?: string;
    profile_image_url?: string | null;
  };
  type: string;
  message?: string | null;
  post_id?: string | null;
  comment_id?: string | null;
}

interface NotificationToastProps {
  toast: ToastData | null;
  onPressToast?: (toast: ToastData) => void;
  onDismiss?: () => void;
}

export const NotificationToast: React.FC<NotificationToastProps> = ({
  toast,
  onPressToast,
  onDismiss,
}) => {
  const { colors } = useTheme();
  const slideAnim = useRef(new Animated.Value(-120)).current;

  useEffect(() => {
    if (toast) {
      // Slide Down
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 6,
      }).start();

      // Auto Hide after 4 seconds
      const timer = setTimeout(() => {
        hideToast();
      }, 4000);

      return () => clearTimeout(timer);
    } else {
      hideToast();
    }
  }, [toast]);

  const hideToast = () => {
    Animated.timing(slideAnim, {
      toValue: -120,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      if (onDismiss) onDismiss();
    });
  };

  if (!toast) return null;

  const renderBadgeIcon = (type: string) => {
    switch (type) {
      case "LIKE":
        return <Ionicons name="heart" size={10} color="#ffffff" />;
      case "COMMENT":
        return <Ionicons name="chatbubble" size={10} color="#ffffff" />;
      case "FOLLOW":
        return <Ionicons name="person-add" size={10} color="#ffffff" />;
      case "MENTION":
        return <Ionicons name="at" size={10} color="#ffffff" />;
      default:
        return <Ionicons name="notifications" size={10} color="#ffffff" />;
    }
  };

  const renderBadgeBg = (type: string) => {
    switch (type) {
      case "LIKE":
        return "#ed4956";
      case "COMMENT":
        return "#3897f0";
      case "FOLLOW":
        return "#7000ff";
      case "MENTION":
        return "#f59e0b";
      default:
        return "#10b981";
    }
  };

  return (
    <Animated.View
      style={[
        styles.toastWrapper,
        {
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <SafeAreaView>
        <TouchableOpacity
          activeOpacity={0.9}
          style={[
            styles.toastCard,
            {
              backgroundColor: colors.modalBg || colors.bgSecondary,
              borderColor: colors.borderColor,
            },
          ]}
          onPress={() => {
            if (onPressToast && toast) onPressToast(toast);
            hideToast();
          }}
        >
          <View style={styles.avatarWrapper}>
            <Image
              source={{ uri: getFullImageUrl(toast.sender.profile_image_url) }}
              style={styles.avatar}
            />
            <View
              style={[
                styles.badge,
                { backgroundColor: renderBadgeBg(toast.type) },
              ]}
            >
              {renderBadgeIcon(toast.type)}
            </View>
          </View>

          <View style={styles.textContainer}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              {getDisplayName(toast.sender)}
            </Text>
            <Text
              style={[styles.message, { color: colors.textSecondary }]}
              numberOfLines={2}
            >
              {toast.message || "새로운 알림이 도착했습니다."}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.closeBtn}
            onPress={hideToast}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </TouchableOpacity>
      </SafeAreaView>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  toastWrapper: {
    position: "absolute",
    top: Platform.OS === "android" ? (StatusBar.currentHeight || 24) + 4 : 8,
    left: 12,
    right: 12,
    zIndex: 99999,
  },
  toastCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  avatarWrapper: {
    position: "relative",
    marginRight: 10,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  badge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ffffff",
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 13,
    fontWeight: "700",
  },
  message: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
    flexWrap: "wrap",
  },
  closeBtn: {
    padding: 4,
    marginLeft: 6,
  },
});
