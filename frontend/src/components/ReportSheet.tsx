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
  ["spam", "스팸"],
  ["harassment", "욕설·괴롭힘"],
  ["adult", "음란물"],
  ["scam", "사기"],
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
  const [reason, setReason] = useState<string | null>(null);
  const [detail, setDetail] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reportId, setReportId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setReason(null);
      setDetail("");
      setConfirming(false);
      setSubmitting(false);
      setReportId(null);
      setError(null);
    }
  }, [visible]);

  const submit = async () => {
    if (!targetId || !reason) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await api.post("/reports", {
        target_type: targetType,
        target_id: targetId,
        reason_code: reason,
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
                관리자 검토 후 결과를 알림으로 알려드립니다.
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
                    onPress={() => setReason(code)}
                  >
                    <Text style={[styles.reasonText, { color: colors.textPrimary }]}>{label}</Text>
                    <Ionicons
                      name={reason === code ? "radio-button-on" : "radio-button-off"}
                      size={22}
                      color={reason === code ? "#7c3aed" : colors.textMuted}
                    />
                  </TouchableOpacity>
                ))}
                {reason === "other" && (
                  <TextInput
                    value={detail}
                    onChangeText={setDetail}
                    maxLength={500}
                    multiline
                    placeholder="신고 사유를 자세히 적어 주세요."
                    placeholderTextColor={colors.textMuted}
                    style={[styles.input, { color: colors.textPrimary, borderColor: colors.borderColor }]}
                  />
                )}
              </ScrollView>
              {error && <Text style={styles.error}>{error}</Text>}
              <TouchableOpacity
                disabled={!reason || (reason === "other" && !detail.trim())}
                style={[styles.primaryButton, (!reason || (reason === "other" && !detail.trim())) && styles.disabled]}
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
