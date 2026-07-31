import React from "react";
import { FlatList, FlatListProps, StyleSheet, View } from "react-native";
import { DirectTimelineItem } from "../types";
import { DirectMessageItemV2 } from "./DirectMessageItemV2";

export interface DirectConversationListV2Props {
  timeline: DirectTimelineItem[];
  currentUserId?: string;
  renderDateDivider?: (date: Date) => React.ReactElement;
  onOpenPost?: (postId: string) => void;
  onRetryMessage?: (message: any) => void;
  flatListRef?: React.Ref<FlatList<DirectTimelineItem>>;
  flatListProps?: Partial<FlatListProps<DirectTimelineItem>>;
}

export const DirectConversationListV2 = ({
  timeline,
  currentUserId,
  renderDateDivider,
  onOpenPost,
  onRetryMessage,
  flatListRef,
  flatListProps,
}: DirectConversationListV2Props) => {
  const renderItem = ({ item }: { item: DirectTimelineItem }) => {
    if (item.type === "date") {
      return renderDateDivider?.(item.date) ?? null;
    }

    const isMine = item.message.sender.id === currentUserId;

    return (
      <DirectMessageItemV2
        message={item.message}
        isMine={isMine}
        isFirstInGroup={item.isFirstInGroup}
        isLastInGroup={item.isLastInGroup}
        onOpenPost={(postId) => onOpenPost?.(postId)}
        onRetry={(msg) => onRetryMessage?.(msg)}
      />
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={timeline}
        keyExtractor={(item) =>
          item.type === "message"
            ? `v2-msg-${item.message.client_message_id || item.message.id}`
            : `v2-date-${item.id}`
        }
        renderItem={renderItem}
        {...flatListProps}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: "100%",
  },
});
