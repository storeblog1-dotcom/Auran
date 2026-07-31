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
    <View
      style={[styles.row, isMe ? styles.alignRight : styles.alignLeft]}
      onLayout={(event) => {
        console.log("[DM_ROW_BOX]", {
          content: item.content,
          layout: event.nativeEvent.layout,
        });
      }}
    >
      <View
        style={[
          styles.content,
          {
            borderWidth: 1,
            borderColor: "red",
          },
        ]}
        onLayout={(event) => {
          console.log("[DM_CONTENT_BOX]", {
            content: item.content,
            layout: event.nativeEvent.layout,
          });
        }}
      >
        <Text
          style={[
            styles.messageText,
            { color: colors.textPrimary, borderWidth: 1, borderColor: "blue" },
          ]}
          onLayout={(event) => {
            console.log("[DM_TEXT_BOX]", {
              content: item.content,
              layout: event.nativeEvent.layout,
            });
          }}
          onTextLayout={(event) => {
            console.log("[DM_TEXT_LINES]", {
              content: item.content,
              lines: event.nativeEvent.lines.map((line) => ({
                text: line.text,
                width: line.width,
                height: line.height,
                x: line.x,
                y: line.y,
              })),
            });
          }}
        >
          {item.content}
        </Text>

        {/* 고정 폭 비교용 120px 임시 박스 */}
        <View style={{ width: 120, borderWidth: 1, borderColor: "green", marginTop: 4 }}>
          <Text style={{ fontSize: 15, lineHeight: 22, color: colors.textPrimary }}>
            {item.content} (120px Test)
          </Text>
        </View>

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
