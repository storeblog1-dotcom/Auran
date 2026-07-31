import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "../../../context/ThemeContext";
import { DirectMessage } from "../types/direct";

interface DirectMessageItemProps {
  item: DirectMessage;
  isMe: boolean;
}

export const DirectMessageItem: React.FC<DirectMessageItemProps> = ({ item, isMe }) => {
  const { colors } = useTheme();

  const formatTime = (dateString?: string) => {
    if (!dateString) return "";
    try {
      const d = new Date(dateString);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  return (
    <View style={[styles.row, isMe ? styles.alignRight : styles.alignLeft]}>
      <View
        style={[styles.content, isMe ? styles.alignSelfRight : styles.alignSelfLeft]}
        onLayout={(event) => {
          console.log("[DM_CONTENT_LAYOUT]", {
            id: item.id,
            content: item.content,
            layout: event.nativeEvent.layout,
          });
        }}
      >
        <Text style={[styles.messageText, { color: colors.textPrimary }]}>
          {item.content}
        </Text>
        <Text
          style={[
            styles.timeText,
            { color: colors.textMuted },
            isMe ? styles.textRight : styles.textLeft,
          ]}
        >
          {formatTime(item.created_at)} {item.isOptimistic ? "• 전송 중..." : ""}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    width: "100%",
    paddingHorizontal: 16,
    marginVertical: 6,
  },
  alignLeft: {
    alignItems: "flex-start",
  },
  alignRight: {
    alignItems: "flex-end",
  },
  content: {
    maxWidth: "85%",
  },
  alignSelfLeft: {
    alignSelf: "flex-start",
  },
  alignSelfRight: {
    alignSelf: "flex-end",
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  timeText: {
    fontSize: 10,
    marginTop: 3,
  },
  textLeft: {
    textAlign: "left",
  },
  textRight: {
    textAlign: "right",
  },
});
