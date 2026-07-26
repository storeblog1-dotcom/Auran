import React from "react";
import { Text, StyleSheet, TextStyle, Platform } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useTheme } from "../context/ThemeContext";

interface HashtagTextProps {
  text: string;
  style?: TextStyle;
  numberOfLines?: number;
}

export const HashtagText: React.FC<HashtagTextProps> = ({
  text,
  style,
  numberOfLines,
}) => {
  const navigation = useNavigation<any>();
  const { colors } = useTheme();

  if (!text) return null;

  // Split caption into normal text, hashtags (#...), and mentions (@...)
  const parts = text.split(/((?:#[a-zA-Z0-9_가-힣]+)|(?:@[a-zA-Z0-9_가-힣\.]+))/g);

  return (
    <Text style={[{ color: colors.textPrimary, fontFamily: Platform.OS === 'web' ? "'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans KR', sans-serif" : undefined }, style]} numberOfLines={numberOfLines}>
      {parts.map((part, index) => {
        if (part.startsWith("#")) {
          const tagName = part.substring(1);
          return (
            <Text
              key={index}
              style={[styles.highlightText, { color: colors.accentBlue }]}
              onPress={() => navigation.navigate("Hashtag", { tagName })}
            >
              {part}
            </Text>
          );
        }
        if (part.startsWith("@")) {
          const username = part.substring(1);
          return (
            <Text
              key={index}
              style={[styles.highlightText, { color: colors.accentBlue }]}
              onPress={() => navigation.navigate("UserProfile", { username })}
            >
              {part}
            </Text>
          );
        }
        return part;
      })}
    </Text>
  );
};

const styles = StyleSheet.create({
  highlightText: {
    fontWeight: "700",
  },
});
