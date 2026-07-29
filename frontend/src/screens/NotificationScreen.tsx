import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useFocusEffect, useRoute } from "@react-navigation/native";
import { useTheme } from "../context/ThemeContext";
import { useNotification } from "../context/NotificationContext";
import api from "../services/api";
import { NotificationItem } from "../services/notifications";
import { PostDetailModal } from "../components/PostDetailModal";
import { getDisplayName } from "../utils/displayName";
import {
  AdminAvatar,
  AdminBadge,
  openUserProfile,
} from "../components/AdminIdentity";

export const NotificationScreen = () => {
  const { colors } = useTheme();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const {
    notifications,
    unreadCount,
    loading,
    refreshNotifications,
    markAsRead,
    markAllAsRead,
  } = useNotification();

  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [autoOpenComments, setAutoOpenComments] = useState<boolean>(false);

  useFocusEffect(
    useCallback(() => {
      refreshNotifications();
    }, [refreshNotifications])
  );

  useEffect(() => {
    if (route.params?.openPostId) {
      setSelectedPostId(route.params.openPostId);
      setAutoOpenComments(!!route.params?.autoOpenComments);
      // Clear the params so it doesn't reopen if the user closes it and stays on the screen
      navigation.setParams({ openPostId: undefined, autoOpenComments: undefined });
    }
  }, [route.params?.openPostId]);

  const unreadItems = notifications.filter((n) => !n.is_read);
  const readItems = notifications.filter((n) => n.is_read);

  const handlePressItem = async (item: NotificationItem) => {
    if (!item.is_read) {
      await markAsRead(item.id);
    }

    if (item.type === "FOLLOW") {
      openUserProfile(navigation, item.sender);
    } else if (item.type === "DIRECT_MESSAGE") {
      try {
        const res = await api.post("/direct/rooms", { target_user_id: item.sender.id });
        const room = res.data?.data || res.data;
        navigation.navigate("MainTabs", {
          screen: "Messages",
          params: {
            screen: "ChatRoom",
            params: {
              roomId: room.id,
              requestStatus: room.request_status,
              isOutgoingRequest: room.is_outgoing_request,
              targetUser: {
                id: item.sender.id,
                username: item.sender.username,
                nickname: item.sender.nickname,
                full_name: item.sender.full_name,
                profile_image_url: item.sender.profile_image_url,
                is_admin: item.sender.is_admin,
              },
            },
          },
        });
      } catch (err) {
        console.log("Error opening DM from notification screen", err);
      }
    } else if (item.type === "COMMENT") {
      if (item.post_id) {
        setAutoOpenComments(true);
        setSelectedPostId(item.post_id);
      } else {
        openUserProfile(navigation, item.sender);
      }
    } else if (item.type === "LIKE" || item.type === "MENTION") {
      if (item.post_id) {
        setAutoOpenComments(false);
        setSelectedPostId(item.post_id);
      } else {
        openUserProfile(navigation, item.sender);
      }
    }
  };

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
      case "DIRECT_MESSAGE":
        return <Ionicons name="paper-plane" size={10} color="#ffffff" />;
      default:
        return <Ionicons name="notifications" size={10} color="#ffffff" />;
    }
  };

  const renderBadgeBg = (type: string, isRead: boolean) => {
    if (isRead) return colors.textMuted + "aa";
    switch (type) {
      case "LIKE":
        return "#ed4956";
      case "COMMENT":
        return "#3897f0";
      case "FOLLOW":
        return "#7000ff";
      case "MENTION":
        return "#f59e0b";
      case "DIRECT_MESSAGE":
        return "#10b981";
      default:
        return "#8e8e8e";
    }
  };

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diffSec < 60) return "방금 전";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}분 전`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}시간 전`;
    const diffDay = Math.floor(diffHour / 24);
    return `${diffDay}일 전`;
  };

  const renderNotificationCard = (item: NotificationItem) => {
    const isRead = item.is_read;
    return (
      <TouchableOpacity
        key={item.id}
        style={[
          styles.itemContainer,
          {
            backgroundColor: isRead
              ? "transparent"
              : colors.accentBlue + "0f",
          },
        ]}
        onPress={() => handlePressItem(item)}
        activeOpacity={0.7}
      >
        <View style={styles.avatarWrapper}>
          <AdminAvatar
            user={item.sender}
            style={[styles.avatar, isRead && { opacity: 0.75 }]}
          />
          <View
            style={[
              styles.badge,
              { backgroundColor: renderBadgeBg(item.type, isRead) },
            ]}
          >
            {renderBadgeIcon(item.type)}
          </View>
        </View>

        <View style={styles.contentWrapper}>
          <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 5 }}>
            <Text
              style={[
                styles.usernameBold,
                { color: isRead ? colors.textSecondary : colors.textPrimary },
              ]}
            >
              {getDisplayName(item.sender)}
            </Text>
            {item.sender.is_admin && <AdminBadge />}
            <Text
              style={[
                styles.messageText,
                { color: isRead ? colors.textMuted : colors.textPrimary },
              ]}
            >
              {item.message || "새로운 알림이 도착했습니다."}
            </Text>
          </View>
          <Text
            style={[
              styles.timeText,
              { color: isRead ? colors.textMuted : colors.textSecondary },
            ]}
          >
            {formatTimeAgo(item.created_at)}
          </Text>
        </View>

        {!isRead && <View style={styles.unreadDot} />}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={["top"]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.borderColor }]}>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>알림</Text>
        {unreadCount > 0 && (
          <TouchableOpacity onPress={markAllAllRead} style={styles.readAllButton}>
            <Text style={styles.readAllText}>모두 읽음</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading && notifications.length === 0 ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.accentBlue} />
        </View>
      ) : notifications.length === 0 ? (
        <View style={styles.centerContainer}>
          <Ionicons name="notifications-off-outline" size={64} color={colors.textMuted} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            새로운 알림이 없습니다.
          </Text>
        </View>
      ) : (
        <FlatList
          data={[1]}
          keyExtractor={() => "notification-list"}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await refreshNotifications();
                setRefreshing(false);
              }}
              tintColor={colors.textPrimary}
            />
          }
          renderItem={() => (
            <View style={{ paddingBottom: 24 }}>
              {/* 1. 새로운 알림 섹션 */}
              {unreadItems.length > 0 && (
                <View>
                  <View style={[styles.sectionHeader, { borderBottomColor: colors.borderColor }]}>
                    <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                      새로운 알림
                    </Text>
                    <View style={styles.sectionBadge}>
                      <Text style={styles.sectionBadgeText}>{unreadItems.length}</Text>
                    </View>
                  </View>
                  {unreadItems.map(renderNotificationCard)}
                </View>
              )}

              {/* 2. 이전 알림 섹션 */}
              {readItems.length > 0 && (
                <View style={{ marginTop: unreadItems.length > 0 ? 16 : 0 }}>
                  <View style={[styles.sectionHeader, { borderBottomColor: colors.borderColor }]}>
                    <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                      이전 알림
                    </Text>
                  </View>
                  {readItems.map(renderNotificationCard)}
                </View>
              )}
            </View>
          )}
        />
      )}

      {/* Post Detail Modal for Notification Deep Link */}
      <PostDetailModal
        visible={!!selectedPostId}
        postId={selectedPostId}
        initialOpenComments={autoOpenComments}
        onClose={() => setSelectedPostId(null)}
      />
    </SafeAreaView>
  );

  function markAllAllRead() {
    markAllAsRead();
  }
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    borderBottomWidth: 0.5,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
  },
  readAllButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  readAllText: {
    fontSize: 14,
    color: "#3897f0",
    fontWeight: "600",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 16,
    textAlign: "center",
    paddingHorizontal: 20,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  sectionBadge: {
    backgroundColor: "#ed4956",
    borderRadius: 9,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  sectionBadgeText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "bold",
  },
  itemContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  avatarWrapper: {
    position: "relative",
    marginRight: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  badge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#ffffff",
  },
  contentWrapper: {
    flex: 1,
    paddingRight: 8,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 19,
    flexWrap: "wrap",
  },
  usernameBold: {
    fontWeight: "700",
  },
  timeText: {
    fontSize: 12,
    marginTop: 3,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#3897f0",
    marginLeft: 6,
  },
});
