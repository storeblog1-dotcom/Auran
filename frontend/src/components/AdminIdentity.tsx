import React, { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Alert,
  Animated,
  Image,
  ImageProps,
  StyleProp,
  StyleSheet,
  Text,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { getFullImageUrl } from "../config";

export interface AdminAwareUser {
  username?: string | null;
  profile_image_url?: string | null;
  is_admin?: boolean;
}

export const ADMIN_PROFILE_BADGE_SOURCE = require("../../assets/admin-profile-badge.png");
export const ADMIN_PROFILE_PRIVATE_MESSAGE =
  "관리자 계정의 프로필은 공개되지 않습니다.";

const useAdminGlow = (enabled: boolean) => {
  const progress = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (mounted) setReduceMotion(value);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled || reduceMotion) {
      progress.stopAnimation();
      progress.setValue(0);
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: 1250,
          useNativeDriver: true,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: 1250,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [enabled, progress, reduceMotion]);

  return progress;
};

export const showAdminProfilePrivateAlert = () => {
  Alert.alert("관리자 계정", ADMIN_PROFILE_PRIVATE_MESSAGE);
};

export const openUserProfile = (
  navigation: any,
  user: AdminAwareUser | null | undefined,
  method: "navigate" | "push" = "navigate"
) => {
  if (user?.is_admin) {
    showAdminProfilePrivateAlert();
    return false;
  }
  if (!user?.username) return false;
  navigation[method]("UserProfile", { username: user.username });
  return true;
};

interface AdminBadgeProps {
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const AdminBadge = ({ compact = false, style }: AdminBadgeProps) => {
  const progress = useAdminGlow(true);
  const scale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.06],
  });
  const shimmerX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-32, 76],
  });

  return (
    <Animated.View
      accessibilityLabel="관리자 계정"
      style={[styles.badgeGlow, style, { transform: [{ scale }] }]}
    >
      <LinearGradient
        colors={["#7c3aed", "#2563eb", "#06b6d4", "#f59e0b"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.badge, compact && styles.badgeCompact]}
      >
        <Ionicons
          name="shield-checkmark"
          size={compact ? 11 : 13}
          color="#fff7c2"
        />
        {!compact && <Text style={styles.badgeText}>관리자</Text>}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.shimmer,
            { transform: [{ translateX: shimmerX }, { rotate: "18deg" }] },
          ]}
        />
      </LinearGradient>
    </Animated.View>
  );
};

type AdminAvatarProps = Omit<ImageProps, "source"> & {
  user?: AdminAwareUser | null;
};

export const AdminAvatar = ({ user, style, ...props }: AdminAvatarProps) => {
  const isAdmin = Boolean(user?.is_admin);
  const progress = useAdminGlow(isAdmin);
  const scale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.045],
  });
  const opacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.9, 1],
  });
  const source = isAdmin
    ? ADMIN_PROFILE_BADGE_SOURCE
    : { uri: getFullImageUrl(user?.profile_image_url) };

  if (!isAdmin) {
    return <Image {...props} source={source} style={style} />;
  }

  return (
    <Animated.Image
      {...props}
      accessibilityLabel="관리자 전용 프로필 배지"
      source={source}
      style={[
        style,
        styles.adminAvatar,
        { opacity, transform: [{ scale }] },
      ]}
    />
  );
};

const styles = StyleSheet.create({
  badgeGlow: {
    borderRadius: 999,
    shadowColor: "#a855f7",
    shadowOpacity: 0.9,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 7,
  },
  badge: {
    minHeight: 23,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#fde68a",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    overflow: "hidden",
  },
  badgeCompact: {
    width: 20,
    minHeight: 20,
    paddingHorizontal: 0,
  },
  badgeText: {
    color: "#ffffff",
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "900",
    textShadowColor: "#312e81",
    textShadowRadius: 3,
  },
  shimmer: {
    position: "absolute",
    top: -8,
    bottom: -8,
    width: 12,
    backgroundColor: "rgba(255,255,255,0.7)",
  },
  adminAvatar: {
    borderWidth: 2,
    borderColor: "#fbbf24",
    shadowColor: "#a855f7",
    shadowOpacity: 1,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 0 },
    elevation: 9,
  },
});
