import React, { useState } from "react";
import { ActivityIndicator, Alert, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { AuraLogoText } from "../components/AuraLogoText";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";

export const LoginScreen = ({ navigation }: any) => {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const { colors } = useTheme();
  const inputStyle = [styles.input, { backgroundColor: colors.bgInput, borderColor: colors.borderColor, color: colors.textPrimary }];

  const submit = async () => {
    if (!identifier.trim() || !password) return Alert.alert("입력 확인", "이메일 또는 사용자명과 비밀번호를 입력해주세요.");
    setLoading(true);
    try { await login({ identifier: identifier.trim(), password }); }
    catch (e: any) { Alert.alert("로그인 실패", e.response?.data?.error?.message || e.response?.data?.detail || e.message || "로그인에 실패했습니다."); }
    finally { setLoading(false); }
  };

  return <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]}><View style={styles.inner}>
    <AuraLogoText fontSize={44} />
    <Text style={[styles.subtitle, { color: colors.textSecondary }]}>계정에 로그인하세요</Text>
    <TextInput style={inputStyle} placeholder="이메일 또는 사용자명" placeholderTextColor={colors.textSecondary} value={identifier} onChangeText={setIdentifier} autoCapitalize="none" />
    <TextInput style={inputStyle} placeholder="비밀번호" placeholderTextColor={colors.textSecondary} value={password} onChangeText={setPassword} secureTextEntry />
    <TouchableOpacity onPress={submit} disabled={loading} activeOpacity={0.85}><LinearGradient colors={(colors.auraGradient || ["#8b5cf6", "#ec4899", "#06b6d4"]) as [string, string, ...string[]]} style={styles.button}><Text style={styles.buttonText}>{loading ? <ActivityIndicator color="#fff" /> : "로그인"}</Text></LinearGradient></TouchableOpacity>
    <View style={styles.footer}><Text style={{ color: colors.textSecondary }}>계정이 없으신가요? </Text><TouchableOpacity onPress={() => navigation.navigate("Register")}><Text style={[styles.link, { color: colors.accentPurple || "#8b5cf6" }]}>회원가입</Text></TouchableOpacity></View>
  </View></SafeAreaView>;
};

const styles = StyleSheet.create({ container: { flex: 1 }, inner: { flex: 1, justifyContent: "center", padding: 30 }, subtitle: { textAlign: "center", marginTop: 10, marginBottom: 30 }, input: { borderWidth: 1, borderRadius: 10, padding: 15, fontSize: 15, marginBottom: 12 }, button: { borderRadius: 10, padding: 15, alignItems: "center", marginTop: 8 }, buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 }, footer: { flexDirection: "row", justifyContent: "center", marginTop: 28 }, link: { fontWeight: "700" } });
