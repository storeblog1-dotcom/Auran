import React, { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import api from "../services/api";
import { useTheme } from "../context/ThemeContext";

export const CommunityAdminScreen = ({ navigation }: any) => {
  const { colors } = useTheme();
  const [boards, setBoards] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [parentId, setParentId] = useState<string | null>(null);
  const [anonymous, setAnonymous] = useState(false);
  const [noticeTitle, setNoticeTitle] = useState("");
  const [noticeContent, setNoticeContent] = useState("");

  const load = useCallback(async () => {
    const res = await api.get("/community/boards?include_inactive=true");
    setBoards(res.data?.data || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const reset = () => { setEditing(null); setName(""); setSlug(""); setParentId(null); setAnonymous(false); };
  const select = (board: any) => { setEditing(board); setName(board.name); setSlug(board.slug); setParentId(board.parent_id); setAnonymous(board.is_anonymous); };
  const save = async () => {
    if (!name.trim() || !slug.trim()) return Alert.alert("알림", "게시판명과 영문 식별자를 입력하세요.");
    try {
      const body = { name: name.trim(), slug: slug.trim().toLowerCase(), parent_id: parentId, is_anonymous: anonymous };
      if (editing) await api.patch(`/community/admin/boards/${editing.id}`, body); else await api.post("/community/admin/boards", body);
      reset(); load();
    } catch (e: any) { Alert.alert("오류", e.response?.data?.detail || "게시판 저장에 실패했습니다."); }
  };
  const closeBoard = (board: any) => Alert.alert("게시판 폐쇄", `‘${board.name}’ 게시판을 폐쇄할까요?`, [{ text: "취소", style: "cancel" }, { text: "다음", style: "destructive", onPress: () => Alert.alert("최종 확인", "기존 글은 보존되고 새 글 작성만 막힙니다.", [{ text: "취소", style: "cancel" }, { text: "폐쇄", style: "destructive", onPress: async () => { try { await api.delete(`/community/admin/boards/${board.id}?confirm_name=${encodeURIComponent(board.name)}`); load(); } catch (e: any) { Alert.alert("오류", e.response?.data?.detail || "폐쇄에 실패했습니다."); } } }]) }]);
  const postNotice = async () => { if (!noticeTitle.trim() || !noticeContent.trim()) return Alert.alert("알림", "공지 제목과 내용을 입력하세요."); try { await api.post("/community/admin/notices", { title: noticeTitle.trim(), content: noticeContent.trim() }); setNoticeTitle(""); setNoticeContent(""); Alert.alert("완료", "전체 공지가 모든 게시판 상단에 고정됩니다."); } catch { Alert.alert("오류", "공지 등록에 실패했습니다."); } };
  const parents = boards.filter((b) => !b.parent_id && b.is_active);

  return <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
    <View style={[styles.header, { borderBottomColor: colors.borderColor }]}><TouchableOpacity onPress={() => navigation.goBack()}><Ionicons name="chevron-back" size={26} color={colors.textPrimary} /></TouchableOpacity><Text style={[styles.title, { color: colors.textPrimary }]}>커뮤니티 관리</Text><TouchableOpacity onPress={reset}><Text style={{ color: colors.accentBlue, fontWeight: "700" }}>새 게시판</Text></TouchableOpacity></View>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={[styles.section, { color: colors.textPrimary }]}>게시판</Text>
      {boards.map((board) => <TouchableOpacity key={board.id} onPress={() => select(board)} style={[styles.boardRow, { borderColor: colors.borderColor, opacity: board.is_active ? 1 : .5 }]}><View><Text style={{ color: colors.textPrimary, fontWeight: "700" }}>{board.parent_id ? "└ " : ""}{board.name}</Text><Text style={{ color: colors.textSecondary, fontSize: 12 }}>{board.slug} · {board.is_anonymous ? "익명" : "일반"}</Text></View><TouchableOpacity onPress={() => closeBoard(board)}><Text style={{ color: "#ef4444", fontWeight: "700" }}>폐쇄</Text></TouchableOpacity></TouchableOpacity>)}
      <Text style={[styles.section, { color: colors.textPrimary }]}>{editing ? "게시판 수정" : "게시판 생성"}</Text>
      <TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.borderColor }]} placeholder="게시판명" placeholderTextColor={colors.textMuted} value={name} onChangeText={setName} />
      <TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.borderColor }]} placeholder="영문 식별자 (예: health-info)" placeholderTextColor={colors.textMuted} value={slug} onChangeText={setSlug} autoCapitalize="none" />
      <Text style={{ color: colors.textSecondary, marginBottom: 6 }}>상위 게시판 선택 (선택하면 하위 게시판)</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}><TouchableOpacity onPress={() => setParentId(null)} style={[styles.chip, { backgroundColor: !parentId ? colors.accentPurple : colors.bgCard }]}><Text style={{ color: !parentId ? "#fff" : colors.textPrimary }}>상위 없음</Text></TouchableOpacity>{parents.map((parent) => <TouchableOpacity key={parent.id} onPress={() => setParentId(parent.id)} style={[styles.chip, { backgroundColor: parentId === parent.id ? colors.accentPurple : colors.bgCard }]}><Text style={{ color: parentId === parent.id ? "#fff" : colors.textPrimary }}>{parent.name}</Text></TouchableOpacity>)}</ScrollView>
      <View style={styles.switchRow}><Text style={{ color: colors.textPrimary }}>익명 게시판</Text><Switch value={anonymous} onValueChange={setAnonymous} /></View>
      <TouchableOpacity style={[styles.primary, { backgroundColor: colors.accentBlue }]} onPress={save}><Text style={styles.primaryText}>{editing ? "수정 저장" : "게시판 생성"}</Text></TouchableOpacity>
      <Text style={[styles.section, { color: colors.textPrimary }]}>전체 공지</Text>
      <TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.borderColor }]} placeholder="공지 제목" placeholderTextColor={colors.textMuted} value={noticeTitle} onChangeText={setNoticeTitle} />
      <TextInput style={[styles.input, styles.noticeInput, { color: colors.textPrimary, borderColor: colors.borderColor }]} placeholder="모든 게시판 상단에 표시할 공지 내용" placeholderTextColor={colors.textMuted} value={noticeContent} onChangeText={setNoticeContent} multiline />
      <TouchableOpacity style={[styles.primary, { backgroundColor: colors.accentPurple }]} onPress={postNotice}><Text style={styles.primaryText}>전체 공지 등록</Text></TouchableOpacity>
    </ScrollView>
  </SafeAreaView>;
};

const styles = StyleSheet.create({ container: { flex: 1 }, header: { height: 54, paddingHorizontal: 16, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, title: { fontSize: 17, fontWeight: "800" }, content: { padding: 16, paddingBottom: 50 }, section: { fontSize: 16, fontWeight: "800", marginTop: 12, marginBottom: 10 }, boardRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 8 }, input: { borderWidth: 1, borderRadius: 10, minHeight: 46, paddingHorizontal: 12, marginBottom: 10 }, chips: { gap: 8, paddingBottom: 12 }, chip: { paddingHorizontal: 12, height: 34, justifyContent: "center", borderRadius: 17 }, switchRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }, primary: { minHeight: 46, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 8 }, primaryText: { color: "#fff", fontWeight: "800" }, noticeInput: { minHeight: 100, textAlignVertical: "top", paddingTop: 12 } });
