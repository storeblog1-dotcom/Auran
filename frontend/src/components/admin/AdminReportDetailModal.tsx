import React, { useEffect, useState } from "react";
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
    contentAction: "maintain" | "hide" | "delete",
    sanctionType: "none" | "warning" | "suspend_5d" | "suspend_10d" | "suspend_30d" | "permanent"
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
  const [contentAction, setContentAction] = useState<"maintain" | "hide" | "delete">("maintain");
  const [sanctionType, setSanctionType] = useState<"none" | "warning" | "suspend_5d" | "suspend_10d" | "suspend_30d" | "permanent">("none");
  const [revealedImages, setRevealedImages] = useState<Record<string, boolean>>({});
  useEffect(() => { if (visible) { setContentAction("maintain"); setSanctionType("none"); setRevealedImages({}); } }, [visible, selectedReport?.target_id]);
  const contentOptions = selectedReport?.target_type === "profile" ? [["maintain", "유지"]] : [["maintain", "유지"], ["hide", "숨김"], ["delete", "삭제"]];
  const sanctionOptions = [["none", "제재 없음"], ["warning", "경고"], ["suspend_5d", "5일 정지"], ["suspend_10d", "10일 정지"], ["suspend_30d", "30일 정지"], ["permanent", "영구 정지"]];
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
                        <TouchableOpacity key={`${media.url}-${index}`} onPress={() => setRevealedImages((current) => ({ ...current, [media.url!]: !current[media.url!] }))} style={{ width: 168, height: 168, borderRadius: 12, overflow: "hidden", backgroundColor: colors.bgPrimary, borderWidth: 1, borderColor: colors.borderColor, alignItems: "center", justifyContent: "center" }}>
                          <Ionicons name="image-outline" size={28} color={colors.textMuted} />
                          <Image blurRadius={revealedImages[media.url!] ? 0 : 24} source={{ uri: getFullImageUrl(media.url!) }} style={{ position: "absolute", width: "100%", height: "100%" }} resizeMode="cover" />
                          {!revealedImages[media.url!] && <View style={{ position: "absolute", backgroundColor: "#0009", paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8 }}><Text style={{ color: "#fff", fontWeight: "800" }}>민감 이미지 보기</Text></View>}
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                ) : <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 14 }}><Ionicons name="image-outline" size={16} color={colors.textMuted} /><Text style={{ color: colors.textMuted, fontSize: 12 }}>저장된 게시물 이미지가 없습니다.</Text></View>)}
              </View>
              {selectedReport.reports?.map((report) => (
                <View key={report.id} style={[styles.postCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
                  <Text style={{ color: colors.textPrimary, fontWeight: "800" }}>{(report.reason_codes?.length ? report.reason_codes : [report.reason_code]).join(" · ")}</Text>
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
              <Text style={[styles.optionTitle, { color: colors.textPrimary }]}>콘텐츠 처리</Text>
              <View style={styles.optionRow}>{contentOptions.map(([value, label]) => <TouchableOpacity key={value} onPress={() => setContentAction(value as any)} style={[styles.option, { borderColor: contentAction === value ? primaryAccent : colors.borderColor, backgroundColor: contentAction === value ? `${primaryAccent}22` : colors.bgCard }]}><Text style={{ color: colors.textPrimary, fontWeight: "800" }}>{label}</Text></TouchableOpacity>)}</View>
              <Text style={[styles.optionTitle, { color: colors.textPrimary }]}>이용자 제재</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>콘텐츠 판정과 별개입니다. AI 결과만으로 자동 선택하지 않습니다.</Text>
              <View style={styles.optionRow}>{sanctionOptions.map(([value, label]) => <TouchableOpacity key={value} onPress={() => setSanctionType(value as any)} style={[styles.option, { borderColor: sanctionType === value ? primaryAccent : colors.borderColor, backgroundColor: sanctionType === value ? `${primaryAccent}22` : colors.bgCard }]}><Text style={{ color: value === "permanent" ? "#dc2626" : colors.textPrimary, fontWeight: "800" }}>{label}</Text></TouchableOpacity>)}</View>
              <View style={styles.optionRow}><TouchableOpacity onPress={() => onModerate("reviewing", "maintain", "none")} style={[styles.finalButton, { borderColor: colors.borderColor }]}><Text style={{ color: colors.textPrimary, fontWeight: "800" }}>검토 중 저장</Text></TouchableOpacity><TouchableOpacity onPress={() => onModerate("rejected", "maintain", "none")} style={[styles.finalButton, { borderColor: colors.borderColor }]}><Text style={{ color: colors.textPrimary, fontWeight: "800" }}>신고 기각</Text></TouchableOpacity><TouchableOpacity onPress={() => onModerate("resolved", contentAction, sanctionType)} style={[styles.finalButton, { backgroundColor: sanctionType === "permanent" || contentAction === "delete" ? "#dc2626" : primaryAccent }]}><Text style={{ color: "#fff", fontWeight: "900" }}>처리 완료</Text></TouchableOpacity></View>
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
  optionTitle: { fontSize: 15, fontWeight: "900", marginTop: 16, marginBottom: 8 },
  optionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  option: { minHeight: 42, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" },
  finalButton: { minHeight: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, alignItems: "center", justifyContent: "center" },
});
