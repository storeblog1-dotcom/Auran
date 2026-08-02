import React from "react";
import {
  StyleSheet,
  Text,
  View,
  Modal,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useTheme } from "../context/ThemeContext";
import { useNotification } from "../context/NotificationContext";
import api from "../services/api";
import { NotificationItem } from "../services/notifications";
import { PostDetailModal } from "./PostDetailModal";
import { getDisplayName } from "../utils/displayName";
import {
  AdminAvatar,
  AdminBadge,
  showAdminProfilePrivateAlert,
} from "./AdminIdentity";
import { NotificationActor, NotificationActorsModal } from "./NotificationActorsModal";

interface NotificationsModalProps {
  visible: boolean;
  onClose: () => void;
  onNavigateProfile?: (username: string) => void;
}

export const NotificationsModal: React.FC<NotificationsModalProps> = ({
  visible,
  onClose,
  onNavigateProfile,
}) => {
  const navigation = useNavigation<any>();
  const [selectedPostId, setSelectedPostId] = React.useState<string | null>(null);
  const [autoOpenComments, setAutoOpenComments] = React.useState<boolean>(false);
  const [notificationActors, setNotificationActors] = React.useState<NotificationActor[]>([]);
  const { colors } = useTheme();
  const {
    notifications,
    unreadCount,
    loading,
    refreshNotifications,
    markAsRead,
    markAllAsRead,
  } = useNotification();

  const [refreshing, setRefreshing] = React.useState(false);

  const unreadItems = notifications.filter((n) => !n.is_read);
  const readItems = notifications.filter((n) => n.is_read);

  const openSenderProfile = (item: NotificationItem) => {
    if (item.sender.is_admin) {
      showAdminProfilePrivateAlert();
      return;
    }
    onClose();
    if (onNavigateProfile) {
      onNavigateProfile(item.sender.username);
    } else {
      navigation.navigate("UserProfile", { username: item.sender.username });
    }
  };
  const confirmProfile = (actor: NotificationActor) => Alert.alert(actor.nickname || actor.username, "이 사용자의 프로필로 이동할까요?", [{ text: "취소", style: "cancel" }, { text: "프로필 보기", onPress: () => { setNotificationActors([]); onClose(); if (onNavigateProfile) onNavigateProfile(actor.username); else navigation.navigate("UserProfile", { username: actor.username }); } }]);

  const formatTimeAgo = (dateStr?: string) => {
    if (!dateStr) return "";
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

  const renderNotificationMarker = (type: NotificationItem["type"]) => {
    if (type === "REPORT_RESULT") return { icon: "shield-checkmark" as const, color: "#7c3aed" };
    if (type === "MODERATION_WARNING") return { icon: "warning" as const, color: "#ef4444" };
    return null;
  };

  const handlePressItem = async (item: NotificationItem) => {
    if (!item.is_read) {
      await markAsRead(item.id);
    }

    if (item.type === "FOLLOW") {
      if (item.sender?.username) {
        confirmProfile(item.sender as NotificationActor);
      }
    } else if (item.type === "COMMENT") {
      if (item.post_id) {
        setAutoOpenComments(true);
        setSelectedPostId(item.post_id);
      } else if (item.sender?.username) {
        openSenderProfile(item);
      }
    } else if (item.type === "LIKE" || item.type === "MENTION") {
      setNotificationActors(item.actors?.length ? item.actors : [item.sender]);
    } else if (item.type === "DIRECT_MESSAGE") {
      onClose();
      navigation.navigate("DirectInbox");
    } else if (item.type === "CONTENT_MODERATION_RESULT" || item.type === "SANCTION_NOTICE") {
      onClose();
      navigation.navigate("SafetyCenter");
    }
  };

  const renderItemRow = (item: NotificationItem) => {
    const isRead = item.is_read;
    const marker = renderNotificationMarker(item.type);
    return (
      <TouchableOpacity
        key={item.id}
        style={[
          styles.itemRow,
          {
            borderBottomColor: colors.borderColor,
            backgroundColor: isRead ? "transparent" : colors.accentBlue + "0d",
          },
        ]}
        onPress={() => handlePressItem(item)}
      >
        <View style={styles.avatarWrapper}><AdminAvatar user={item.sender} style={[styles.avatar, isRead && { opacity: 0.75 }]} />{marker && <View style={[styles.notificationMarker, { backgroundColor: marker.color }]}><Ionicons name={marker.icon} size={10} color="#ffffff" /></View>}</View>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 5 }}>
            <Text
              style={[
                styles.username,
                { color: isRead ? colors.textSecondary : colors.textPrimary },
              ]}
            >
              {getDisplayName(item.sender)}
            </Text>
            {item.sender.is_admin && <AdminBadge />}
            <Text
              style={[
                styles.itemText,
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
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <SafeAreaView style={[styles.modalOverlay, { backgroundColor: colors.modalBg || colors.bgPrimary }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.borderColor }]}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>알림</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            {unreadCount > 0 && (
              <TouchableOpacity onPress={() => markAllAsRead()}>
                <Text style={{ fontSize: 13, color: "#3897f0", fontWeight: "600" }}>모두 읽음</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Content */}
        {loading && notifications.length === 0 ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={colors.accentBlue} />
          </View>
        ) : notifications.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="notifications-off-outline" size={56} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              새로운 알림이 없습니다.
            </Text>
          </View>
        ) : (
          <FlatList
            data={[1]}
            keyExtractor={() => "modal-notification-list"}
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
                {/* 새로운 알림 섹션 */}
                {unreadItems.length > 0 && (
                  <View>
                    <View style={[styles.sectionHeader, { borderBottomColor: colors.borderColor }]}>
                      <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                        새로운 알림
                      </Text>
                    </View>
                    {unreadItems.map(renderItemRow)}
                  </View>
                )}

                {/* 이전 알림 섹션 */}
                {readItems.length > 0 && (
                  <View style={{ marginTop: unreadItems.length > 0 ? 12 : 0 }}>
                    <View style={[styles.sectionHeader, { borderBottomColor: colors.borderColor }]}>
                      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                        이전 알림
                      </Text>
                    </View>
                    {readItems.map(renderItemRow)}
                  </View>
                )}
              </View>
            )}
          />
        )}

        <PostDetailModal
          visible={!!selectedPostId}
          postId={selectedPostId}
          initialOpenComments={autoOpenComments}
          onClose={() => setSelectedPostId(null)}
        />
        <NotificationActorsModal visible={notificationActors.length > 0} actors={notificationActors} onClose={() => setNotificationActors([])} onSelect={confirmProfile} />
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
  },
  header: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    borderBottomWidth: 0.5,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "bold",
  },
  closeBtn: {
    padding: 4,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "bold",
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 0.5,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  avatarWrapper: { width: 54, height: 42 },
  notificationMarker: { position: "absolute", right: 7, bottom: -1, width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#ffffff" },
  itemText: {
    fontSize: 13,
    lineHeight: 18,
    flexShrink: 1,
    flexWrap: "wrap",
  },
  username: {
    fontWeight: "bold",
  },
  timeText: {
    fontSize: 11,
    marginTop: 2,
  },
  unreadDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "#3897f0",
    marginLeft: 6,
  },
  emptyContainer: {
    paddingTop: 80,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 15,
    lineHeight: 20,
    textAlign: "center",
    paddingHorizontal: 16,
    width: "100%",
  },
});
