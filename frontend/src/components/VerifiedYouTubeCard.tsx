import React from "react";
import { Image, Linking, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";

interface VerifiedYouTubeCardProps {
  url?: string | null;
  title?: string | null;
  thumbnailUrl?: string | null;
  compact?: boolean;
}

export const VerifiedYouTubeCard: React.FC<VerifiedYouTubeCardProps> = ({
  url,
  title,
  thumbnailUrl,
  compact = false,
}) => {
  const { colors } = useTheme();
  if (!url) return null;

  return (
    <TouchableOpacity
      style={[styles.card, compact && styles.compactCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}
      onPress={() => Linking.openURL(url).catch(() => undefined)}
      activeOpacity={0.84}
      accessibilityRole="link"
      accessibilityLabel={`YouTube 영상 열기: ${title || "YouTube 영상"}`}
    >
      {thumbnailUrl ? <Image source={{ uri: thumbnailUrl }} style={[styles.thumbnail, compact && styles.compactThumbnail]} /> : null}
      <View style={styles.content}>
        <View style={styles.sourceRow}>
          <Ionicons name="logo-youtube" size={18} color="#ff0033" />
          <Text style={[styles.source, { color: colors.textSecondary }]}>YouTube · 검증된 일반 영상</Text>
        </View>
        <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={compact ? 1 : 2}>
          {title || "YouTube 영상"}
        </Text>
      </View>
      <Ionicons name="open-outline" size={18} color={colors.textSecondary} />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: { minHeight: 72, marginTop: 4, marginBottom: 4, borderWidth: 1, borderRadius: 12, padding: 8, flexDirection: "row", alignItems: "center", gap: 10 },
  compactCard: { minHeight: 60, marginTop: 8 },
  thumbnail: { width: 92, height: 58, borderRadius: 8, backgroundColor: "#18181b" },
  compactThumbnail: { width: 72, height: 44 },
  content: { flex: 1, minWidth: 0 },
  sourceRow: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 4 },
  source: { fontSize: 11, fontWeight: "700" },
  title: { fontSize: 14, fontWeight: "700", lineHeight: 19 },
});
