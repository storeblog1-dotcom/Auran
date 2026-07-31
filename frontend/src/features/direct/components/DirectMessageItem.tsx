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
    <View style={[styles.container, isMe ? styles.rightContainer : styles.leftContainer]}>
      <Text style={[styles.messageText, { color: colors.textPrimary }, isMe ? styles.textRight : styles.textLeft]}>
        {item.content}
      </Text>
      <Text style={[styles.timeText, { color: colors.textMuted }, isMe ? styles.textRight : styles.textLeft]}>
        {formatTime(item.created_at)} {item.isOptimistic ? "• 전송 중..." : ""}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 6,
    paddingHorizontal: 16,
    maxWidth: "85%",
  },
  leftContainer: {
    alignSelf: "flex-start",
  },
  rightContainer: {
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
