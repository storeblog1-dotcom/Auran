import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AdminAvatar } from "../../../components/AdminIdentity";
import { useTheme } from "../../../context/ThemeContext";
import { useNotification } from "../../../context/NotificationContext";
import { getDisplayName } from "../../../utils/displayName";
import { directService } from "../services/directService";
import { DirectConversation } from "../types/direct";

interface InboxConversation extends DirectConversation {
  last_message?: {
    content?: string | null;
    created_at?: string;
  } | null;
  unread_count?: number;
}

export const DirectInboxScreen: React.FC = () => {
  const { colors } = useTheme();
  const navigation = useNavigation<any>();
  const { refreshDirectUnread } = useNotification();

  const [conversations, setConversations] = useState<InboxConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchConversations = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const data = await directService.getConversations();
      setConversations(data);
      await refreshDirectUnread();
    } catch (err) {
      if (__DEV__) {
        console.log("Error fetching direct conversations", err);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [refreshDirectUnread]);

  useFocusEffect(
    useCallback(() => {
      fetchConversations();
    }, [fetchConversations]),
  );

  const handleSelectConversation = (item: InboxConversation) => {
    const rootNavigation = navigation.getParent?.();
    (rootNavigation || navigation).navigate("DirectChat", {
      conversationId: item.id,
      targetUser: item.target_user,
    });
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "";
    try {
      const date = new Date(dateString);
      const now = new Date();
      if (date.toDateString() === now.toDateString()) {
        return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      }
      return `${date.getMonth() + 1}/${date.getDate()}`;
    } catch {
      return "";
    }
  };

  const renderItem = ({ item }: { item: InboxConversation }) => {
    const targetUser = item.target_user;
    const name = getDisplayName(targetUser);
    const lastMessage = item.last_message?.content?.trim();
    const unreadCount = Math.max(0, item.unread_count || 0);

    return (
      <TouchableOpacity
        style={[
          styles.itemContainer,
          { backgroundColor: colors.bgCard, borderColor: colors.borderColor },
        ]}
        onPress={() => handleSelectConversation(item)}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={`${name}님과의 대화 열기`}
      >
        <AdminAvatar user={targetUser} style={styles.avatar} />
        <View style={styles.itemContent}>
          <View style={styles.itemHeader}>
            <Text
              style={[styles.nicknameText, { color: colors.textPrimary }]}
              numberOfLines={1}
            >
              {name}
            </Text>
            <Text style={[styles.dateText, { color: colors.textMuted }]}>
              {formatDate(
                item.last_message?.created_at || item.updated_at || item.created_at,
              )}
            </Text>
          </View>
          <View style={styles.previewRow}>
            <Text
              style={[styles.previewText, { color: colors.textSecondary }]}
              numberOfLines={2}
              ellipsizeMode="tail"
            >
              {lastMessage || "아직 메시지가 없습니다."}
            </Text>
            {unreadCount > 0 && (
              <View style={[styles.unreadBadge, { backgroundColor: colors.accentPurple }]}>
                <Text style={styles.unreadBadgeText}>
                  {unreadCount > 99 ? "99+" : unreadCount}
                </Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView
      style={[
        styles.container,
        { backgroundColor: colors.bgPrimary },
      ]}
      edges={["top", "left", "right"]}
    >
      <View
        style={[
          styles.header,
          { backgroundColor: colors.headerBg, borderBottomColor: colors.borderLight },
        ]}
      >
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>대화</Text>
      </View>

      {loading && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accentPurple} />
          <Text style={[styles.loadingText, { color: colors.textMuted }]}>대화를 불러오는 중...</Text>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={[
            styles.listContent,
            conversations.length === 0 && styles.listContentEmpty,
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchConversations(true)}
              tintColor={colors.accentPurple}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="chatbubbles-outline" size={48} color={colors.accentPurple} />
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>아직 대화가 없습니다</Text>
              <Text style={[styles.emptySub, { color: colors.textMuted }]}>피드의 종이비행기 아이콘을 눌러{`\n`}1:1 대화를 시작해보세요.</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    height: 60,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 20, fontWeight: "700" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 12, fontSize: 14 },
  listContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24 },
  listContentEmpty: { flexGrow: 1 },
  itemContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderRadius: 16,
  },
  avatar: { width: 44, height: 44, borderRadius: 22, marginRight: 12 },
  itemContent: { flex: 1, minWidth: 0 },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 5,
  },
  nicknameText: { flex: 1, marginRight: 8, fontSize: 15, fontWeight: "700" },
  dateText: { fontSize: 12 },
  previewRow: { flexDirection: "row", alignItems: "center" },
  previewText: { flex: 1, fontSize: 14, lineHeight: 20 },
  unreadBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    marginLeft: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  unreadBadgeText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginTop: 16,
    marginBottom: 6,
    textAlign: "center",
  },
  emptySub: { fontSize: 14, textAlign: "center", lineHeight: 20 },
});
