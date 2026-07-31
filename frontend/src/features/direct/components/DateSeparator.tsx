import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "../../../context/ThemeContext";

interface DateSeparatorProps {
  dateString: string;
}

export const DateSeparator: React.FC<DateSeparatorProps> = ({ dateString }) => {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      <View style={[styles.line, { backgroundColor: colors.borderLight }]} />
      <Text style={[styles.dateText, { color: colors.textMuted }]}>{dateString}</Text>
      <View style={[styles.line, { backgroundColor: colors.borderLight }]} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 12,
    paddingHorizontal: 16,
  },
  line: {
    flex: 1,
    height: 1,
  },
  dateText: {
    fontSize: 11,
    fontWeight: "500",
    marginHorizontal: 10,
  },
});
