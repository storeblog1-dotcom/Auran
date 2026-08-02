import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import api from "../services/api";
import { useTheme } from "../context/ThemeContext";

export type ReportTargetType = "post" | "comment" | "profile";

interface ReportSheetProps {
  visible: boolean;
  targetType: ReportTargetType;
  targetId: string | null;
  targetUsername?: string | null;
  onClose: () => void;
  onHidden?: () => void;
}

const REASONS = [
  ["hate", "혐오·차별 표현"],
  ["sexual_harassment", "성희롱"],
  ["outing", "아웃팅·신상 노출"],
  ["nonconsensual_sexual", "비동의 성적 이미지"],
  ["child_safety", "아동·청소년 성착취 의심"],
  ["spam", "스팸"],
  ["harassment", "괴롭힘·협박"],
  ["adult", "음란물"],
  ["impersonation", "사칭"],
  ["scam", "사기"],
  ["self_harm", "자해·긴급 위험"],
  ["illegal", "불법정보"],
  ["privacy", "개인정보 노출"],
  ["other", "기타"],
] as const;

export const ReportSheet = ({
  visible,
  targetType,
  targetId,
  targetUsername,
  onClose,
  onHidden,
}: ReportSheetProps) => {
  const { colors } = useTheme();
  const [reasons, setReasons] = useState<string[]>([]);
  const [detail, setDetail] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reportId, setReportId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setReasons([]);
      setDetail("");
      setConfirming(false);
      setSubmitting(false);
      setReportId(null);
      setError(null);
    }
  }, [visible]);

  const submit = async () => {
    if (!targetId || !reasons.length) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await api.post("/reports", {
        target_type: targetType,
        target_id: targetId,
        reason_codes: reasons,
        detail: detail.trim() || null,
      });
      setReportId(response.data?.data?.id);
    } catch (err: any) {
      setError(err.response?.data?.detail || "신고 접수에 실패했습니다.");
      setConfirming(false);
    } finally {
      setSubmitting(false);
    }
  };

  const hideTarget = async () => {
    if (!reportId) return;
    await api.post(`/reports/${reportId}/hide`);
    onHidden?.();
    onClose();
  };

  const blockUser = async () => {
    if (!targetUsername) return;
    try {
      await api.post(`/users/${targetUsername}/block`);
      onHidden?.();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.detail || "사용자 차단에 실패했습니다.");
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: colors.bgCard }]}>
          <View style={[styles.handle, { backgroundColor: colors.borderColor }]} />
          <View style={styles.header}>
            <View>
              <Text style={[styles.title, { color: colors.textPrimary }]}>신고하기</Text>
              <Text style={[styles.subtitle, { color: colors.textMuted }]}>
                신고 내용은 관리자만 확인합니다.
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.close}>
              <Ionicons name="close" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {reportId ? (
            <View style={styles.success}>
              <View style={styles.successIcon}>
                <Ionicons name="checkmark" size={28} color="#fff" />
              </View>
              <Text style={[styles.successTitle, { color: colors.textPrimary }]}>신고가 접수되었습니다</Text>
              <Text style={[styles.successText, { color: colors.textMuted }]}>
                관리자가 안전하게 검토합니다. 신고자의 신원과 구체적인 제재 결과는 작성자에게 공개되지 않습니다.
              </Text>
              {targetType !== "profile" && (
                <TouchableOpacity style={styles.primaryButton} onPress={hideTarget}>
                  <Text style={styles.primaryButtonText}>이 콘텐츠 숨기기</Text>
                </TouchableOpacity>
              )}
              {!!targetUsername && (
                <TouchableOpacity style={[styles.secondaryButton, { borderColor: colors.borderColor }]} onPress={blockUser}>
                  <Text style={[styles.secondaryButtonText, { color: colors.textPrimary }]}>@{targetUsername} 차단하기</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.doneButton} onPress={onClose}>
                <Text style={{ color: colors.textMuted, fontWeight: "700" }}>완료</Text>
              </TouchableOpacity>
            </View>
          ) : confirming ? (
            <View style={styles.confirm}>
              <Ionicons name="shield-checkmark-outline" size={42} color="#7c3aed" />
              <Text style={[styles.confirmTitle, { color: colors.textPrimary }]}>이 내용으로 신고할까요?</Text>
              <Text style={[styles.confirmText, { color: colors.textMuted }]}>
                허위 신고나 반복적인 악의적 신고는 이용 제한 사유가 될 수 있습니다.
              </Text>
              {error && <Text style={styles.error}>{error}</Text>}
              <TouchableOpacity disabled={submitting} style={styles.dangerButton} onPress={submit}>
                {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>신고 접수</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setConfirming(false)} style={styles.doneButton}>
                <Text style={{ color: colors.textMuted, fontWeight: "700" }}>이전으로</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <ScrollView style={styles.reasonList} showsVerticalScrollIndicator={false}>
                {REASONS.map(([code, label]) => (
                  <TouchableOpacity
                    key={code}
                    style={[styles.reasonRow, { borderBottomColor: colors.borderColor }]}
                    onPress={() => setReasons((current) => current.includes(code) ? current.filter((item) => item !== code) : [...current, code])}
                  >
                    <Text style={[styles.reasonText, { color: colors.textPrimary }]}>{label}</Text>
                    <Ionicons
                      name={reasons.includes(code) ? "checkbox" : "square-outline"}
                      size={22}
                      color={reasons.includes(code) ? "#7c3aed" : colors.textMuted}
                    />
                  </TouchableOpacity>
                ))}
                <TextInput
                  value={detail}
                  onChangeText={setDetail}
                  maxLength={500}
                  multiline
                  placeholder={reasons.includes("other") ? "기타 신고 사유를 적어 주세요. (필수)" : "상세 내용을 추가할 수 있습니다. (선택)"}
                  placeholderTextColor={colors.textMuted}
                  style={[styles.input, { color: colors.textPrimary, borderColor: colors.borderColor }]}
                />
              </ScrollView>
              {error && <Text style={styles.error}>{error}</Text>}
              <TouchableOpacity
                disabled={!reasons.length || (reasons.includes("other") && !detail.trim())}
                style={[styles.primaryButton, (!reasons.length || (reasons.includes("other") && !detail.trim())) && styles.disabled]}
                onPress={() => setConfirming(true)}
              >
                <Text style={styles.primaryButtonText}>다음</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15,23,42,0.55)" },
  backdrop: { flex: 1 },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, maxHeight: "82%" },
  handle: { width: 44, height: 5, borderRadius: 3, alignSelf: "center", marginBottom: 16 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  title: { fontSize: 21, fontWeight: "900" },
  subtitle: { fontSize: 12, marginTop: 3 },
  close: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  reasonList: { maxHeight: 430 },
  reasonRow: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth },
  reasonText: { fontSize: 15, fontWeight: "700" },
  input: { minHeight: 96, borderWidth: 1, borderRadius: 14, padding: 12, marginTop: 12, textAlignVertical: "top" },
  primaryButton: { minHeight: 50, borderRadius: 15, backgroundColor: "#7c3aed", alignItems: "center", justifyContent: "center", marginTop: 14 },
  dangerButton: { minHeight: 50, width: "100%", borderRadius: 15, backgroundColor: "#ef4444", alignItems: "center", justifyContent: "center", marginTop: 20 },
  primaryButtonText: { color: "#fff", fontWeight: "900", fontSize: 15 },
  disabled: { opacity: 0.4 },
  secondaryButton: { minHeight: 50, borderWidth: 1, borderRadius: 15, alignItems: "center", justifyContent: "center", marginTop: 10 },
  secondaryButtonText: { fontWeight: "800" },
  doneButton: { minHeight: 44, alignItems: "center", justifyContent: "center", marginTop: 4 },
  success: { alignItems: "center", paddingVertical: 16 },
  successIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: "#16a34a", alignItems: "center", justifyContent: "center" },
  successTitle: { fontSize: 19, fontWeight: "900", marginTop: 14 },
  successText: { textAlign: "center", marginTop: 6, marginBottom: 8 },
  confirm: { alignItems: "center", paddingVertical: 18 },
  confirmTitle: { fontSize: 19, fontWeight: "900", marginTop: 12 },
  confirmText: { textAlign: "center", lineHeight: 20, marginTop: 7 },
  error: { color: "#ef4444", fontSize: 12, textAlign: "center", marginTop: 10 },
});
