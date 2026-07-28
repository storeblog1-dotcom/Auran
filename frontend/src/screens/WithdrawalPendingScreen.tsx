import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { AuraLogoText } from "../components/AuraLogoText";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";


export const WithdrawalPendingScreen = () => {
  const {
    withdrawalPending,
    cancelWithdrawal,
    leaveWithdrawalScreen,
  } = useAuth();
  const { colors } = useTheme();
  const [now, setNow] = useState(Date.now());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const remainingText = useMemo(() => {
    if (!withdrawalPending) return "취소 가능 기간을 확인할 수 없습니다.";
    const remaining = Math.max(
      0,
      new Date(withdrawalPending.deadline).getTime() - now,
    );
    const days = Math.floor(remaining / 86_400_000);
    const hours = Math.floor((remaining % 86_400_000) / 3_600_000);
    const minutes = Math.floor((remaining % 3_600_000) / 60_000);
    return `${days}일 ${hours}시간 ${minutes}분 남았습니다.`;
  }, [now, withdrawalPending]);

  const handleCancel = () => {
    Alert.alert(
      "탈퇴 취소",
      "계정을 다시 정상 상태로 복구하시겠습니까?",
      [
        { text: "아니요", style: "cancel" },
        {
          text: "탈퇴 취소",
          onPress: async () => {
            setLoading(true);
            try {
              await cancelWithdrawal();
              Alert.alert("복구 완료", "계정이 정상적으로 복구되었습니다.");
            } catch (error: any) {
              Alert.alert(
                "취소 실패",
                error.response?.data?.error?.message
                  || error.response?.data?.detail
                  || error.message
                  || "탈퇴 취소 가능 기간을 확인해주세요.",
              );
            } finally {
              setLoading(false);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
      <View style={styles.content}>
        <AuraLogoText fontSize={38} />
        <Text style={[styles.title, { color: colors.textPrimary }]}>탈퇴 대기 중입니다</Text>
        <Text style={[styles.remaining, { color: colors.accentPurple || "#8b5cf6" }]}>
          {remainingText}
        </Text>
        <Text style={[styles.description, { color: colors.textSecondary }]}>
          이 기간에는 서비스를 이용할 수 없습니다. 마음이 바뀌었다면 아래 버튼을 눌러 계정을 바로 복구할 수 있습니다.
        </Text>
        <TouchableOpacity
          style={styles.restoreButton}
          onPress={handleCancel}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.restoreText}>탈퇴 취소하고 계정 복구</Text>}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.backButton}
          onPress={leaveWithdrawalScreen}
          disabled={loading}
        >
          <Text style={{ color: colors.textSecondary }}>다른 계정으로 로그인</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};


const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, justifyContent: "center", padding: 30 },
  title: { marginTop: 28, fontSize: 24, fontWeight: "800", textAlign: "center" },
  remaining: { marginTop: 14, fontSize: 18, fontWeight: "800", textAlign: "center" },
  description: { marginTop: 18, fontSize: 14, lineHeight: 22, textAlign: "center" },
  restoreButton: {
    minHeight: 50,
    marginTop: 30,
    borderRadius: 12,
    backgroundColor: "#7c3aed",
    alignItems: "center",
    justifyContent: "center",
  },
  restoreText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  backButton: { minHeight: 46, alignItems: "center", justifyContent: "center", marginTop: 10 },
});
