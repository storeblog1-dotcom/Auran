import React from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { ThemeColors } from "../../theme/colors";
import { AdminReportDetail } from "../../services/adminService";
import { getFullImageUrl } from "../../config";

export interface AdminReportDetailModalProps {
  visible: boolean;
  selectedReport: AdminReportDetail | null;
  reportNote: string;
  colors: ThemeColors;
  primaryAccent: string;
  onChangeReportNote: (note: string) => void;
  onClose: () => void;
  onModerate: (
    status: "reviewing" | "resolved" | "rejected",
    action: "maintain" | "hide" | "delete" | "warn" | "suspend"
  ) => void | Promise<void>;
}

const getReportedPostImages = (snapshot: Record<string, any> | null | undefined) => {
  const media = Array.isArray(snapshot?.media) ? snapshot.media : [];
  return media
    .map((item: any) => ({
      url: item?.url || item?.media_url || item?.image_url || null,
      type: String(item?.type || item?.media_type || "image").toLowerCase(),
    }))
    .filter((item: { url: string | null; type: string }) => item.url && item.type === "image");
};

export const AdminReportDetailModal: React.FC<AdminReportDetailModalProps> = ({
  visible,
  selectedReport,
  reportNote,
  colors,
  primaryAccent,
  onChangeReportNote,
  onClose,
  onModerate,
}) => {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
        <View style={[styles.header, { borderBottomColor: colors.borderColor }]}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={25} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>신고 상세</Text>
          <View style={{ width: 25 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 36 }}>
          {selectedReport && (
            <>
              <View style={[styles.postCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
                <Text style={{ color: primaryAccent, fontWeight: "900" }}>
                  {selectedReport.target_type.toUpperCase()} · {selectedReport.report_count}건
                </Text>
                <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: "800", marginTop: 10 }}>
                  {selectedReport.snapshot.title || selectedReport.snapshot.comment_content || selectedReport.snapshot.caption || selectedReport.snapshot.bio || "(내용 없음)"}
                </Text>
                {!!selectedReport.snapshot.content_ip && <Text style={{ color: colors.textMuted, marginTop: 8 }}>작성 IP: {selectedReport.snapshot.content_ip}</Text>}
                {!!selectedReport.snapshot.comment_ip && <Text style={{ color: colors.textMuted, marginTop: 8 }}>댓글 IP: {selectedReport.snapshot.comment_ip}</Text>}
                <Text style={{ color: colors.textMuted, marginTop: 6 }}>
                  고유번호: {selectedReport.snapshot.display_number || selectedReport.snapshot.comment_display_number || "-"}
                </Text>
                {selectedReport.target_type === "post" && (getReportedPostImages(selectedReport.snapshot).length > 0 ? (
                  <View style={{ marginTop: 14 }}>
                    <Text style={{ color: colors.textSecondary, fontWeight: "800", marginBottom: 8 }}>신고 게시물 이미지</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                      {getReportedPostImages(selectedReport.snapshot).map((media, index) => (
                        <View key={`${media.url}-${index}`} style={{ width: 168, height: 168, borderRadius: 12, overflow: "hidden", backgroundColor: colors.bgPrimary, borderWidth: 1, borderColor: colors.borderColor, alignItems: "center", justifyContent: "center" }}>
                          <Ionicons name="image-outline" size={28} color={colors.textMuted} />
                          <Image source={{ uri: getFullImageUrl(media.url!) }} style={{ position: "absolute", width: "100%", height: "100%" }} resizeMode="cover" />
                        </View>
                      ))}
                    </ScrollView>
                  </View>
                ) : <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 14 }}><Ionicons name="image-outline" size={16} color={colors.textMuted} /><Text style={{ color: colors.textMuted, fontSize: 12 }}>저장된 게시물 이미지가 없습니다.</Text></View>)}
              </View>
              {selectedReport.reports?.map((report) => (
                <View key={report.id} style={[styles.postCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
                  <Text style={{ color: colors.textPrimary, fontWeight: "800" }}>{report.reason_code}</Text>
                  {!!report.detail && <Text style={{ color: colors.textPrimary, marginTop: 5 }}>{report.detail}</Text>}
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 7 }}>신고 IP: {report.reporter_ip || "기록 없음"}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 3 }}>{new Date(report.created_at).toLocaleString("ko-KR")}</Text>
                </View>
              ))}
              <TextInput
                value={reportNote}
                onChangeText={onChangeReportNote}
                multiline
                placeholder="처리 메모 또는 경고 내용을 입력하세요."
                placeholderTextColor={colors.textMuted}
                style={[styles.searchInput, { color: colors.textPrimary, backgroundColor: colors.bgCard, borderColor: colors.borderColor, borderWidth: 1, borderRadius: 12, minHeight: 90, padding: 12, textAlignVertical: "top" }]}
              />
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
                {[
                  ["reviewing", "maintain", "검토 중"],
                  ["resolved", "maintain", "유지"],
                  ["resolved", "hide", "숨김"],
                  ["resolved", "delete", "삭제"],
                  ["resolved", "warn", "경고"],
                  ["resolved", "suspend", "정지"],
                  ["rejected", "maintain", "기각"],
                ].map(([statusValue, actionValue, label]) => (
                  <TouchableOpacity
                    key={`${statusValue}:${actionValue}`}
                    onPress={() => onModerate(statusValue as any, actionValue as any)}
                    style={{ backgroundColor: actionValue === "delete" || actionValue === "suspend" ? "#ef4444" : primaryAccent, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 12 }}
                  >
                    <Text style={{ color: "#fff", fontWeight: "800" }}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "bold",
  },
  postCard: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    height: 40,
    paddingVertical: 0,
    textAlignVertical: "center",
  },
});
