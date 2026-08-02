import React from "react";
import { FlatList, Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";

export interface NotificationActor { id: string; username: string; nickname?: string | null; profile_image_url?: string | null; is_admin?: boolean }

export const NotificationActorsModal = ({ visible, actors, onClose, onSelect }: { visible: boolean; actors: NotificationActor[]; onClose: () => void; onSelect: (actor: NotificationActor) => void }) => {
  const { colors } = useTheme();
  return <Modal visible={visible} animationType="slide" onRequestClose={onClose}><SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]}><View style={[styles.header, { borderBottomColor: colors.borderColor }]}><Text style={[styles.title, { color: colors.textPrimary }]}>알림에 참여한 사람</Text><TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color={colors.textPrimary} /></TouchableOpacity></View><FlatList data={actors} keyExtractor={(item) => item.id} renderItem={({ item }) => <TouchableOpacity style={[styles.row, { borderBottomColor: colors.borderColor }]} onPress={() => onSelect(item)}><View style={[styles.avatar, { backgroundColor: colors.bgCard }]}><Ionicons name="person" size={20} color={colors.textSecondary} /></View><View><Text style={{ color: colors.textPrimary, fontWeight: "800" }}>{item.nickname || item.username}</Text><Text style={{ color: colors.textSecondary }}>@{item.username}</Text></View></TouchableOpacity>} ListEmptyComponent={<Text style={{ color: colors.textSecondary, padding: 20 }}>표시할 사용자가 없습니다.</Text>} /></SafeAreaView></Modal>;
};

const styles = StyleSheet.create({ container: { flex: 1 }, header: { height: 56, borderBottomWidth: 1, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, title: { fontSize: 18, fontWeight: "900" }, row: { minHeight: 66, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: StyleSheet.hairlineWidth }, avatar: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" } });
