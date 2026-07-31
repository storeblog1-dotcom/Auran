import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "../../../context/ThemeContext";
import { getDisplayName } from "../../../utils/displayName";
import { AdminAvatar } from "../../../components/AdminIdentity";
import { directService } from "../services/directService";
import { DirectConversation } from "../types/direct";

export const DirectInboxScreen: React.FC = () => {
  const { colors } = useTheme();
  const navigation = useNavigation<any>();

  const [conversations, setConversations] = useState<DirectConversation[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const fetchConversations = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const data = await directService.getConversations();
      setConversations(data);
    } catch (err) {
      console.log("Error fetching direct conversations", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchConversations();
    }, [fetchConversations])
  );

  const handleSelectConversation = (item: DirectConversation) => {
    navigation.navigate("DirectChat", {
      conversationId: item.id,
      targetUser: item.target_user,
    });
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "";
    try {
      const d = new Date(dateString);
      const now = new Date();
      if (d.toDateString() === now.toDateString()) {
        return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      }
      return `${d.getMonth() + 1}/${d.getDate()}`;
    } catch {
      return "";
    }
  };

  const renderItem = ({ item }: { item: DirectConversation }) => {
    const targetUser = item.target_user;
    const name = getDisplayName(targetUser);

    return (
      <TouchableOpacity
        style={[styles.itemContainer, { borderBottomColor: colors.borderLight }]}
        onPress={() => handleSelectConversation(item)}
        activeOpacity={0.7}
      >
        <AdminAvatar user={targetUser} style={styles.avatar} />
        <View style={styles.itemContent}>
          <View style={styles.itemHeader}>
            <Text style={[styles.nicknameText, { color: colors.textPrimary }]}>
              {name}
            </Text>
            <Text style={[styles.dateText, { color: colors.textMuted }]}>
              {formatDate(item.created_at)}
            </Text>
          </View>
          <Text style={[styles.subText, { color: colors.textMuted }]}>
            @{targetUser?.username || "unknown"}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.borderLight }]}>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>대화</Text>
      </View>

      {/* Content */}
      {loading && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accentPurple} />
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchConversations(true)}
              tintColor={colors.accentPurple}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="chatbubbles-outline" size={56} color={colors.textMuted} />
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                아직 대화 내역이 없습니다.
              </Text>
              <Text style={[styles.emptySub, { color: colors.textMuted }]}>
                피드 게시글에서 대화 아이콘을 눌러 1:1 대화를 시작해보세요.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  itemContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 14,
  },
  itemContent: {
    flex: 1,
    marginRight: 8,
  },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  nicknameText: {
    fontSize: 16,
    fontWeight: "600",
  },
  dateText: {
    fontSize: 12,
  },
  subText: {
    fontSize: 13,
  },
  emptyContainer: {
    paddingTop: 100,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "600",
    marginTop: 16,
    marginBottom: 6,
    textAlign: "center",
  },
  emptySub: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
});
