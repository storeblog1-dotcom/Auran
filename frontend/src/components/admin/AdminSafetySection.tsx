import React, { useCallback, useEffect, useState } from "react";
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { AdminModerationAppeal, AdminModerationCheck, adminService } from "../../services/adminService";

export const AdminSafetySection = ({ colors, primaryAccent }: any) => {
  const [checks, setChecks] = useState<AdminModerationCheck[]>([]);
  const [appeals, setAppeals] = useState<AdminModerationAppeal[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [nextChecks, nextAppeals] = await Promise.all([
        adminService.getModerationChecks(),
        adminService.getModerationAppeals(),
      ]);
      setChecks(nextChecks);
      setAppeals(nextAppeals);
    } catch (error: any) {
      Alert.alert("불러오기 실패", error.response?.data?.detail || "안전 검토 자료를 불러오지 못했습니다.");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const decide = async (item: AdminModerationAppeal, status: "approved" | "rejected") => {
    const note = (notes[item.id] || "").trim();
    if (note.length < 3) {
      Alert.alert("검토 메모 필요", "결정 근거를 3자 이상 입력해 주세요.");
      return;
    }
    try {
      await adminService.decideModerationAppeal(item.id, status, note);
      setNotes((current) => ({ ...current, [item.id]: "" }));
      await load();
    } catch (error: any) {
      Alert.alert("처리 실패", error.response?.data?.detail || "이의신청을 처리하지 못했습니다.");
    }
  };

  const runMaintenance = () => Alert.alert(
    "기간 만료 제재 점검",
    "기간 정지 만료와 영구정지 90일 검토 대상을 확인합니다. 계정을 자동 삭제하지는 않습니다.",
    [
      { text: "취소", style: "cancel" },
      { text: "실행", onPress: async () => {
        try {
          const result = await adminService.runGovernanceMaintenance();
          Alert.alert("점검 완료", `해제 ${result.expired_sanctions}건 · 최종 검토 대상 ${result.permanent_review_due_user_ids.length}명`);
          await load();
        } catch (error: any) {
          Alert.alert("점검 실패", error.response?.data?.detail || "점검을 실행하지 못했습니다.");
        }
      } },
    ],
  );

  const pendingAppeals = appeals.filter((item) => item.status === "received");
  const reviewChecks = checks.filter((item) => ["review_required", "provider_error"].includes(item.status));

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      <View style={[styles.summary, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>안전 검토 센터</Text>
        <Text style={[styles.description, { color: colors.textSecondary }]}>AI 판단은 콘텐츠 공개 여부를 보조합니다. 이용자 계정 제재는 신고 증거와 사람의 검토를 거쳐 별도로 결정합니다.</Text>
        <View style={styles.metrics}>
          <Text style={{ color: colors.textPrimary }}>검토 대기 {reviewChecks.length}</Text>
          <Text style={{ color: colors.textPrimary }}>이의신청 {pendingAppeals.length}</Text>
        </View>
        <TouchableOpacity style={[styles.outlineButton, { borderColor: primaryAccent }]} onPress={runMaintenance}>
          <Text style={{ color: primaryAccent, fontWeight: "800" }}>기간 만료 제재 점검</Text>
        </TouchableOpacity>
      </View>

      <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>이의신청</Text>
      {pendingAppeals.length === 0 ? <Text style={{ color: colors.textMuted }}>처리할 이의신청이 없습니다.</Text> : pendingAppeals.map((item) => (
        <View key={item.id} style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{item.sanction_id ? "계정 제재" : "콘텐츠 검수"} 이의신청</Text>
          <Text style={{ color: colors.textSecondary }}>{item.statement}</Text>
          <TextInput
            value={notes[item.id] || ""}
            onChangeText={(value) => setNotes((current) => ({ ...current, [item.id]: value }))}
            placeholder="결정 근거 및 이용자 안내"
            placeholderTextColor={colors.textMuted}
            multiline
            style={[styles.input, { color: colors.textPrimary, borderColor: colors.borderColor }]}
          />
          <View style={styles.actions}>
            <TouchableOpacity style={[styles.actionButton, { borderColor: colors.borderColor }]} onPress={() => decide(item, "rejected")}><Text style={{ color: colors.textPrimary, fontWeight: "700" }}>기각</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.actionButton, { backgroundColor: primaryAccent }]} onPress={() => decide(item, "approved")}><Text style={{ color: "#fff", fontWeight: "800" }}>인용·제재 해제</Text></TouchableOpacity>
          </View>
        </View>
      ))}

      <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>자동 검수 기록</Text>
      {checks.slice(0, 100).map((item) => (
        <View key={item.id} style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{item.target_type} · {item.status}</Text>
          <Text style={{ color: colors.textSecondary }}>공급자 {item.provider} · {new Date(item.created_at).toLocaleString()}</Text>
          {Object.keys(item.categories || {}).filter((key) => item.categories[key]).length > 0 && (
            <Text style={{ color: colors.textSecondary }}>감지: {Object.keys(item.categories).filter((key) => item.categories[key]).join(", ")}</Text>
          )}
        </View>
      ))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 48, gap: 12 },
  summary: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 10 },
  title: { fontSize: 20, fontWeight: "900" },
  description: { fontSize: 13, lineHeight: 20 },
  metrics: { flexDirection: "row", gap: 18 },
  sectionTitle: { marginTop: 8, fontSize: 17, fontWeight: "900" },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 9 },
  cardTitle: { fontSize: 15, fontWeight: "800" },
  input: { minHeight: 72, borderWidth: 1, borderRadius: 12, padding: 10, textAlignVertical: "top" },
  actions: { flexDirection: "row", gap: 8 },
  actionButton: { flex: 1, minHeight: 42, borderWidth: 1, borderRadius: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  outlineButton: { minHeight: 42, borderWidth: 1, borderRadius: 10, alignItems: "center", justifyContent: "center" },
});
