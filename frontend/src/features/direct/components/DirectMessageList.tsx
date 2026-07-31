import React from "react";
import {
  FlatList,
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
} from "react-native";

import { useTheme } from "../../../context/ThemeContext";
import { DirectMessage } from "../types/direct";
import { DirectMessageItem } from "./DirectMessageItem";
import { DateSeparator } from "./DateSeparator";

interface DirectMessageListProps {
  messages: DirectMessage[];
  currentUserId?: string;
  loadingMore?: boolean;
  onLoadMore?: () => void;
}

export const DirectMessageList: React.FC<DirectMessageListProps> = ({
  messages,
  currentUserId,
  loadingMore = false,
  onLoadMore,
}) => {
  const { colors } = useTheme();

  const renderItem = ({ item, index }: { item: DirectMessage; index: number }) => {
    const isMe = item.sender_id === currentUserId;

    // Check if date changed compared to previous message
    let showDateSeparator = false;
    let dateStr = "";

    if (item.created_at) {
      try {
        const itemDate = new Date(item.created_at).toLocaleDateString();
        const prevMsg = index > 0 ? messages[index - 1] : null;
        const prevDate = prevMsg?.created_at
          ? new Date(prevMsg.created_at).toLocaleDateString()
          : null;

        if (index === 0 || itemDate !== prevDate) {
          showDateSeparator = true;
          dateStr = new Date(item.created_at).toLocaleDateString(undefined, {
            year: "numeric",
            month: "long",
            day: "numeric",
          });
        }
      } catch {
        showDateSeparator = false;
      }
    }

    return (
      <View>
        {showDateSeparator && <DateSeparator dateString={dateStr} />}
        <DirectMessageItem item={item} isMe={isMe} />
      </View>
    );
  };

  return (
    <FlatList
      data={messages}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      contentContainerStyle={styles.listContainer}
      ListHeaderComponent={
        loadingMore ? (
          <View style={styles.loadingHeader}>
            <ActivityIndicator size="small" color={colors.accentPurple} />
          </View>
        ) : null
      }
      onEndReached={onLoadMore}
      onEndReachedThreshold={0.1}
      ListEmptyComponent={
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            아직 대화를 시작하지 않았습니다.
          </Text>
        </View>
      }
    />
  );
};

const styles = StyleSheet.create({
  listContainer: {
    paddingVertical: 12,
    flexGrow: 1,
  },
  loadingHeader: {
    paddingVertical: 12,
    alignItems: "center",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 120,
  },
  emptyText: {
    fontSize: 15,
  },
});
