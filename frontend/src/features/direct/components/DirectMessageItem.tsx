import React, { useState } from "react";
import { LayoutChangeEvent, View, Text, StyleSheet } from "react-native";
import { useTheme } from "../../../context/ThemeContext";
import { AdminAvatar } from "../../../components/AdminIdentity";
import { DirectMessage, DirectUser } from "../types/direct";
import { SkiaAppText } from "../../../components/text/SkiaAppText";

interface DirectMessageItemProps {
  item: DirectMessage;
  isMe: boolean;
  targetUser?: DirectUser | null;
  systemBold: boolean;
}

export const DirectMessageItem: React.FC<DirectMessageItemProps> = ({
  item,
  isMe,
  targetUser,
  systemBold,
}) => {
  const { colors } = useTheme();

  const sender = item.sender || targetUser;
  const senderName = sender?.nickname || sender?.username || "상대방";
  const textColor = isMe ? "#FFFFFF" : colors.textPrimary;
  const [availableTextWidth, setAvailableTextWidth] = useState(0);

  const handleMessageWrapperLayout = (event: LayoutChangeEvent) => {
    const nextMaxWidth = Math.max(
      0,
      event.nativeEvent.layout.width * 0.75 - 28,
    );
    setAvailableTextWidth((current) =>
      current === nextMaxWidth ? current : nextMaxWidth,
    );
  };

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
    <View style={[styles.row, isMe ? styles.rowRight : styles.rowLeft]}>
      {!isMe && (
        <View style={styles.avatarContainer}>
          <AdminAvatar user={sender} style={styles.avatar} />
        </View>
      )}

      <View
        style={[styles.messageWrapper, isMe ? styles.alignRight : styles.alignLeft]}
        onLayout={handleMessageWrapperLayout}
      >
        {!isMe && (
          <Text style={[styles.nickname, { color: colors.textMuted }]}>
            {senderName}
          </Text>
        )}

        <View
          style={[
            styles.bubble,
            isMe
              ? [styles.bubbleSelf, { backgroundColor: colors.chatBubbleSelf || colors.accentPurple }]
              : [
                  styles.bubbleOther,
                  {
                    backgroundColor: colors.bgCard,
                    borderColor: colors.borderColor,
                  },
                ],
          ]}
        >
          <SkiaAppText
            maxWidth={availableTextWidth}
            color={textColor}
            fontSize={15}
            lineHeight={22}
            systemBold={systemBold}
          >
            {item.content}
          </SkiaAppText>
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
    marginVertical: 4,
    flexDirection: "row",
    overflow: "visible",
  },
  rowLeft: {
    justifyContent: "flex-start",
  },
  rowRight: {
    justifyContent: "flex-end",
  },
  avatarContainer: {
    marginRight: 10,
    marginTop: 2,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  messageWrapper: {
    flex: 1,
    minWidth: 0,
    overflow: "visible",
  },
  alignLeft: {
    alignItems: "flex-start",
  },
  alignRight: {
    alignItems: "flex-end",
  },
  nickname: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 4,
    marginLeft: 2,
  },
  bubble: {
    maxWidth: "75%",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    overflow: "visible",
  },
  bubbleSelf: {
    borderTopRightRadius: 4,
  },
  bubbleOther: {
    borderTopLeftRadius: 4,
    borderWidth: 1,
  },
  timeText: {
    fontSize: 11,
    marginTop: 4,
  },
  textLeft: {
    textAlign: "left",
  },
  textRight: {
    textAlign: "right",
  },
});
