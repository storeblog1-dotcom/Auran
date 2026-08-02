import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { AdminIntegrationItem, adminService } from "../../services/adminService";

const LABELS: Record<string, string> = { openai: "OpenAI Moderation", resend: "Resend", turnstile: "Cloudflare Turnstile", google_vision: "Google Vision" };

export const AdminIntegrationSection = ({ colors, primaryAccent }: any) => {
  const [items, setItems] = useState<AdminIntegrationItem[]>([]);
  const [selected, setSelected] = useState<AdminIntegrationItem | null>(null);
  const [secret, setSecret] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [auditResetPassword, setAuditResetPassword] = useState("");

  const load = async () => {
    try { setItems(await adminService.getIntegrations()); }
    catch { Alert.alert("오류", "외부 연동 상태를 불러오지 못했습니다."); }
  };
  useEffect(() => { void load(); }, []);
  const replace = (next: AdminIntegrationItem) => setItems((current) => current.map((item) => item.provider === next.provider ? next : item));

  const save = async () => {
    if (!selected || !secret.trim() || !password) return;
    setBusy(true);
    try {
      replace(await adminService.saveIntegrationSecret(selected.provider, secret.trim(), password));
      setSecret(""); setPassword(""); setSelected(null);
      Alert.alert("저장 완료", "비밀키를 암호화해 저장했습니다. 연결 검사 전에는 활성화되지 않습니다.");
    } catch (error: any) { Alert.alert("저장 실패", error.response?.data?.detail || "최고 관리자 권한과 마스터 키 설정을 확인해 주세요."); }
    finally { setBusy(false); }
  };

  return <ScrollView contentContainerStyle={styles.content}>
    <Text style={[styles.heading, { color: colors.textPrimary }]}>외부 서비스·비밀키</Text>
    <Text style={[styles.guide, { color: colors.textSecondary }]}>전체 키는 저장 후 다시 표시되지 않습니다. 새 키 등록 → 연결 검사 → 활성화 순서로 진행하세요. Git, APK, 프론트 환경변수에는 키를 넣지 마세요.</Text>
    <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>기능 구현 감사 페이지</Text>
      <Text style={[styles.guide, { color: colors.textSecondary, marginBottom: 0 }]}>비밀번호를 잊은 경우에만 초기화하세요. 모든 감사 페이지 세션이 종료되고 다음 로그인에서 새 비밀번호 설정이 강제됩니다.</Text>
      <TextInput secureTextEntry value={auditResetPassword} onChangeText={setAuditResetPassword} placeholder="최고 관리자 비밀번호 재입력" placeholderTextColor={colors.textSecondary} style={[styles.input, { color: colors.textPrimary, borderColor: colors.borderColor }]} />
      <TouchableOpacity
        disabled={busy || !auditResetPassword}
        style={[styles.button, { backgroundColor: primaryAccent, marginTop: 10 }, (busy || !auditResetPassword) && styles.disabled]}
        onPress={() => Alert.alert("감사 페이지 비밀번호 초기화", "초기화하면 기존 세션이 모두 종료됩니다.", [
          { text: "취소", style: "cancel" },
          { text: "초기화", style: "destructive", onPress: async () => {
            setBusy(true);
            try {
              await adminService.resetFeatureAuditPassword(auditResetPassword);
              setAuditResetPassword("");
              Alert.alert("초기화 완료", "초기 비밀번호로 로그인한 뒤 새 비밀번호를 설정해야 합니다.");
            } catch (error: any) {
              Alert.alert("초기화 실패", error.response?.data?.detail || "최고 관리자 비밀번호를 확인해 주세요.");
            } finally { setBusy(false); }
          } },
        ])}
      ><Text style={{ color: "#fff", fontWeight: "800" }}>감사 페이지 비밀번호 초기화</Text></TouchableOpacity>
    </View>
    {!items.length ? <ActivityIndicator color={primaryAccent} /> : items.map((item) => <View key={item.provider} style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
      <View style={styles.row}><View style={{ flex: 1 }}><Text style={[styles.title, { color: colors.textPrimary }]}>{LABELS[item.provider]}</Text><Text style={{ color: colors.textSecondary }}>{item.configured ? `등록됨 · 끝자리 ${item.last_four || "----"}` : "키 미등록"}</Text></View><View style={[styles.badge, { backgroundColor: item.enabled ? "#16a34a22" : "#64748b22" }]}><Text style={{ color: item.enabled ? "#16a34a" : colors.textSecondary, fontWeight: "800" }}>{item.enabled ? "활성" : "비활성"}</Text></View></View>
      <Text style={[styles.meta, { color: colors.textSecondary }]}>마스터 키: {item.bootstrap_ready ? "준비됨" : "미등록"} · 검사: {item.last_test_status || "대기"}</Text>
      {!!item.last_error && <Text style={styles.error}>{item.last_error}</Text>}
      <View style={styles.actions}>
        <TouchableOpacity style={[styles.button, { borderColor: colors.borderColor }]} onPress={() => setSelected(item)}><Text style={{ color: colors.textPrimary, fontWeight: "700" }}>{item.configured ? "키 교체" : "키 등록"}</Text></TouchableOpacity>
        <TouchableOpacity disabled={!item.configured} style={[styles.button, { borderColor: colors.borderColor }, !item.configured && styles.disabled]} onPress={async () => { setBusy(true); try { replace(await adminService.testIntegration(item.provider)); } catch (error: any) { Alert.alert("검사 실패", error.response?.data?.detail || "연결할 수 없습니다."); } finally { setBusy(false); } }}><Text style={{ color: colors.textPrimary, fontWeight: "700" }}>연결 검사</Text></TouchableOpacity>
        <TouchableOpacity disabled={item.last_test_status !== "success"} style={[styles.button, { backgroundColor: primaryAccent }, item.last_test_status !== "success" && styles.disabled]} onPress={async () => { setBusy(true); try { replace(await adminService.setIntegrationEnabled(item.provider, !item.enabled)); } catch (error: any) { Alert.alert("변경 실패", error.response?.data?.detail || "상태를 변경할 수 없습니다."); } finally { setBusy(false); } }}><Text style={{ color: "#fff", fontWeight: "800" }}>{item.enabled ? "중지" : "활성화"}</Text></TouchableOpacity>
      </View>
    </View>)}
    {selected && <View style={[styles.editor, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}><Text style={[styles.title, { color: colors.textPrimary }]}>{LABELS[selected.provider]} 새 비밀키</Text><TextInput secureTextEntry autoCapitalize="none" value={secret} onChangeText={setSecret} placeholder="API 키 또는 Secret" placeholderTextColor={colors.textSecondary} style={[styles.input, { color: colors.textPrimary, borderColor: colors.borderColor }]} /><TextInput secureTextEntry value={password} onChangeText={setPassword} placeholder="최고 관리자 비밀번호 재입력" placeholderTextColor={colors.textSecondary} style={[styles.input, { color: colors.textPrimary, borderColor: colors.borderColor }]} /><View style={styles.actions}><TouchableOpacity style={[styles.button, { borderColor: colors.borderColor }]} onPress={() => { setSelected(null); setSecret(""); setPassword(""); }}><Text style={{ color: colors.textPrimary }}>취소</Text></TouchableOpacity><TouchableOpacity disabled={busy || !secret.trim() || !password} style={[styles.button, { backgroundColor: primaryAccent }, (busy || !secret.trim() || !password) && styles.disabled]} onPress={save}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800" }}>암호화 저장</Text>}</TouchableOpacity></View></View>}
  </ScrollView>;
};

const styles = StyleSheet.create({ content: { padding: 16, paddingBottom: 50 }, heading: { fontSize: 20, fontWeight: "900" }, guide: { marginTop: 6, marginBottom: 16, lineHeight: 20 }, card: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 12 }, row: { flexDirection: "row", alignItems: "center", gap: 8 }, title: { fontSize: 16, fontWeight: "900" }, badge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999 }, meta: { fontSize: 12, marginTop: 8 }, error: { color: "#dc2626", fontSize: 12, marginTop: 5 }, actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }, button: { minHeight: 40, minWidth: 86, paddingHorizontal: 12, borderWidth: 1, borderRadius: 10, alignItems: "center", justifyContent: "center" }, disabled: { opacity: 0.4 }, editor: { borderWidth: 1, borderRadius: 16, padding: 14, marginTop: 4 }, input: { minHeight: 48, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, marginTop: 10 } });
