import React, { useCallback, useEffect, useState } from "react";
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import api from "../services/api";
import { useTheme } from "../context/ThemeContext";

type ModerationActionData = {
  moderation_checks: Array<{ id: string; target_type: string; status: string; created_at: string }>;
  sanctions: Array<{ id: string; sanction_type: string; reason: string; status: string; starts_at: string; ends_at?: string | null }>;
  appeals: Array<{ id: string; sanction_id?: string | null; moderation_check_id?: string | null; statement: string; status: string; decision_note?: string | null; created_at: string }>;
};

export const SafetyCenterScreen = ({ navigation }: any) => {
  const { colors, isDark } = useTheme();
  const accent = isDark ? "#38bdf8" : "#0284c7";
  const [data, setData] = useState<ModerationActionData>({ moderation_checks: [], sanctions: [], appeals: [] });
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<{ sanction_id?: string; moderation_check_id?: string } | null>(null);
  const [statement, setStatement] = useState("");

  const load = useCallback(async () => {
    const response = await api.get("/governance/me/moderation-actions");
    setData(response.data.data);
  }, []);

  useEffect(() => { load().catch(() => Alert.alert("오류", "안전 센터 내역을 불러오지 못했습니다.")); }, [load]);

  const hasOpenAppeal = (target: { sanction_id?: string; moderation_check_id?: string }) => data.appeals.some((item) =>
    item.status === "received" && item.sanction_id === target.sanction_id && item.moderation_check_id === target.moderation_check_id,
  );

  const submit = async () => {
    if (!selected || statement.trim().length < 10) {
      Alert.alert("내용 확인", "사실관계와 이의 사유를 10자 이상 적어 주세요.");
      return;
    }
    try {
      await api.post("/governance/appeals", { ...selected, statement: statement.trim() });
      setSelected(null);
      setStatement("");
      await load();
      Alert.alert("접수 완료", "관리자가 검토한 뒤 안전 센터와 알림으로 안내합니다.");
    } catch (error: any) {
      Alert.alert("접수 실패", error.response?.data?.detail || "이의신청을 접수하지 못했습니다.");
    }
  };

  const appealButton = (target: { sanction_id?: string; moderation_check_id?: string }) => (
    <TouchableOpacity
      disabled={hasOpenAppeal(target)}
      style={[styles.appealButton, { borderColor: accent }, hasOpenAppeal(target) && styles.disabled]}
      onPress={() => setSelected(target)}
    >
      <Text style={{ color: accent, fontWeight: "800" }}>{hasOpenAppeal(target) ? "검토 중" : "이의신청"}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
      <View style={[styles.header, { borderBottomColor: colors.borderColor }]}>
        <TouchableOpacity accessibilityLabel="뒤로 가기" onPress={() => navigation.goBack()}><Ionicons name="chevron-back" size={26} color={colors.textPrimary} /></TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>안전 센터</Text>
        <View style={{ width: 26 }} />
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); try { await load(); } finally { setRefreshing(false); } }} />}
      >
        <View style={[styles.notice, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
          <Ionicons name="information-circle-outline" size={22} color={accent} />
          <Text style={[styles.noticeText, { color: colors.textSecondary }]}>자동 검수는 이미지·텍스트 공개 여부를 판단합니다. 계정 제재와는 별도이며, 잘못된 판단은 이곳에서 이의를 신청할 수 있습니다.</Text>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>계정 조치</Text>
        {data.sanctions.length === 0 ? <Text style={{ color: colors.textMuted }}>계정 조치 내역이 없습니다.</Text> : data.sanctions.map((item) => (
          <View key={item.id} style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{item.sanction_type} · {item.status}</Text>
            <Text style={{ color: colors.textSecondary }}>{item.reason}</Text>
            {appealButton({ sanction_id: item.id })}
          </View>
        ))}

        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>콘텐츠 검수</Text>
        {data.moderation_checks.length === 0 ? <Text style={{ color: colors.textMuted }}>콘텐츠 검수 내역이 없습니다.</Text> : data.moderation_checks.map((item) => (
          <View key={item.id} style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{item.target_type} · {item.status}</Text>
            <Text style={{ color: colors.textSecondary }}>{new Date(item.created_at).toLocaleString()}</Text>
            {appealButton({ moderation_check_id: item.id })}
          </View>
        ))}

        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>이의신청 내역</Text>
        {data.appeals.map((item) => (
          <View key={item.id} style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{item.status}</Text>
            <Text style={{ color: colors.textSecondary }}>{item.statement}</Text>
            {item.decision_note ? <Text style={{ color: colors.textSecondary }}>검토 안내: {item.decision_note}</Text> : null}
          </View>
        ))}
      </ScrollView>

      {selected && (
        <View style={[styles.composer, { backgroundColor: colors.bgCard, borderTopColor: colors.borderColor }]}>
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>이의신청 작성</Text>
          <TextInput
            autoFocus
            value={statement}
            onChangeText={setStatement}
            placeholder="판단이 잘못되었다고 보는 이유와 사실관계를 적어 주세요."
            placeholderTextColor={colors.textMuted}
            multiline
            style={[styles.input, { color: colors.textPrimary, borderColor: colors.borderColor }]}
          />
          <View style={styles.actions}>
            <TouchableOpacity style={[styles.actionButton, { borderColor: colors.borderColor }]} onPress={() => { setSelected(null); setStatement(""); }}><Text style={{ color: colors.textPrimary }}>취소</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.actionButton, { backgroundColor: accent }]} onPress={submit}><Text style={{ color: "#fff", fontWeight: "800" }}>접수</Text></TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { height: 56, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 18, fontWeight: "900" },
  content: { padding: 16, paddingBottom: 42, gap: 12 },
  notice: { borderWidth: 1, borderRadius: 14, padding: 14, flexDirection: "row", gap: 10 },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 20 },
  sectionTitle: { marginTop: 8, fontSize: 16, fontWeight: "900" },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 8 },
  cardTitle: { fontSize: 14, fontWeight: "800" },
  appealButton: { alignSelf: "flex-start", borderWidth: 1, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 },
  disabled: { opacity: 0.45 },
  composer: { borderTopWidth: StyleSheet.hairlineWidth, padding: 14, gap: 10 },
  input: { minHeight: 90, maxHeight: 180, borderWidth: 1, borderRadius: 12, padding: 12, textAlignVertical: "top" },
  actions: { flexDirection: "row", gap: 8 },
  actionButton: { flex: 1, minHeight: 44, borderWidth: 1, borderRadius: 10, alignItems: "center", justifyContent: "center" },
});
