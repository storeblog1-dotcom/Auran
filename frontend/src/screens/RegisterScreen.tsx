import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { AuraLogoText } from "../components/AuraLogoText";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";

export const RegisterScreen = ({ navigation }: any) => {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const { register, googleLogin } = useAuth();
  const { colors } = useTheme();

  const handleRegister = async () => {
    const cleanUsername = username.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanFullName = fullName.trim();

    if (!cleanUsername || !cleanEmail || !cleanFullName || !password) {
      Alert.alert("알림", "모든 항목을 입력해주세요.");
      return;
    }
    setLoading(true);
    try {
      await register({
        username: cleanUsername,
        email: cleanEmail,
        full_name: cleanFullName,
        password,
      });
    } catch (err: any) {
      let msg = "회원가입에 실패했습니다.";
      if (err.response?.data?.detail) {
        if (Array.isArray(err.response.data.detail)) {
          msg = err.response.data.detail
            .map((d: any) => {
              const cleanMsg = (d.msg || d.message || "").replace("Value error, ", "");
              return cleanMsg;
            })
            .join("\n");
        } else {
          msg = String(err.response.data.detail);
        }
      } else if (err.response?.data?.error?.message) {
        msg = err.response.data.error.message;
      } else if (err.message) {
        msg = err.message;
      }
      Alert.alert("가입 실패", msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleRegister = async () => {
    setGoogleLoading(true);
    try {
      const mockGoogleId = "google_user_" + Math.floor(1000 + Math.random() * 9000);
      await googleLogin({
        google_id: mockGoogleId,
        email: `user_${mockGoogleId}@gmail.com`,
        full_name: fullName || "Google 사용자",
        profile_image_url: "https://lh3.googleusercontent.com/a/default-user=s96-c",
      });
    } catch (err: any) {
      let msg = "Google 계정 연동에 실패했습니다.";
      if (err.message === "Network Error" || !err.response) {
        msg = "서버 연결에 실패했습니다 (네트워크 에러).\nFastAPI 백엔드 서버가 실행 중인지 확인해 주세요.";
      } else if (err.response?.data?.detail) {
        msg = typeof err.response.data.detail === "string" ? err.response.data.detail : JSON.stringify(err.response.data.detail);
      } else if (err.response?.data?.error?.message) {
        msg = err.response.data.error.message;
      } else if (err.message) {
        msg = err.message;
      }
      Alert.alert("Google 가입 실패", msg);
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
      <View style={styles.inner}>
        <View style={{ marginBottom: 30, alignItems: "center" }}>
          <AuraLogoText fontSize={44} />
        </View>

        <TextInput
          style={[styles.input, { backgroundColor: colors.bgInput, borderColor: colors.borderColor, color: colors.textPrimary }]}
          placeholder="사용자 이름 (예: john_doe)"
          placeholderTextColor={colors.textSecondary}
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
        />

        <TextInput
          style={[styles.input, { backgroundColor: colors.bgInput, borderColor: colors.borderColor, color: colors.textPrimary }]}
          placeholder="이메일 주소 (예: john@example.com)"
          placeholderTextColor={colors.textSecondary}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <TextInput
          style={[styles.input, { backgroundColor: colors.bgInput, borderColor: colors.borderColor, color: colors.textPrimary }]}
          placeholder="성명 (Full Name)"
          placeholderTextColor={colors.textSecondary}
          value={fullName}
          onChangeText={setFullName}
        />

        <TextInput
          style={[styles.input, { backgroundColor: colors.bgInput, borderColor: colors.borderColor, color: colors.textPrimary }]}
          placeholder="비밀번호 (8자 이상, 대문자+숫자 포함)"
          placeholderTextColor={colors.textSecondary}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <TouchableOpacity onPress={handleRegister} disabled={loading || googleLoading} activeOpacity={0.8} style={{ marginTop: 10 }}>
          <LinearGradient
            colors={(colors.auraGradient || ["#8b5cf6", "#ec4899", "#06b6d4"]) as [string, string, ...string[]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.buttonGradient}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>회원가입</Text>
            )}
          </LinearGradient>
        </TouchableOpacity>

        <View style={styles.dividerContainer}>
          <View style={[styles.dividerLine, { backgroundColor: colors.borderColor }]} />
          <Text style={[styles.dividerText, { color: colors.textSecondary }]}>또는</Text>
          <View style={[styles.dividerLine, { backgroundColor: colors.borderColor }]} />
        </View>

        <TouchableOpacity
          style={[styles.googleButton, { backgroundColor: colors.bgSecondary, borderColor: colors.borderColor }]}
          onPress={handleGoogleRegister}
          disabled={loading || googleLoading}
        >
          {googleLoading ? (
            <ActivityIndicator color="#4285F4" />
          ) : (
            <View style={styles.googleBtnInner}>
              <View style={styles.googleIconCircle}>
                <Text style={styles.googleIconText}>G</Text>
              </View>
              <Text style={[styles.googleButtonText, { color: colors.textPrimary }]}>Google 계정으로 회원가입</Text>
            </View>
          )}
        </TouchableOpacity>

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: colors.textSecondary }]}>이미 계정이 있으신가요? </Text>
          <TouchableOpacity onPress={() => navigation.navigate("Login")}>
            <Text style={[styles.linkText, { color: colors.accentPurple || "#8b5cf6" }]}>로그인</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  inner: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 30,
  },
  logo: {
    fontSize: 42,
    fontWeight: "bold",
    color: "#fff",
    textAlign: "center",
    marginBottom: 30,
  },
  input: {
    backgroundColor: "#121212",
    borderColor: "#262626",
    borderWidth: 1,
    borderRadius: 8,
    color: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    marginBottom: 12,
  },
  buttonGradient: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
  },
  dividerContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#262626",
  },
  dividerText: {
    marginHorizontal: 16,
    color: "#a8a8a8",
    fontSize: 13,
    fontWeight: "600",
  },
  googleButton: {
    backgroundColor: "#ffffff",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#dbdbdb",
  },
  googleBtnInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  googleIconCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#4285F4",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  googleIconText: {
    color: "#ffffff",
    fontWeight: "900",
    fontSize: 14,
  },
  googleButtonText: {
    color: "#333333",
    fontWeight: "600",
    fontSize: 15,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 25,
  },
  footerText: {
    color: "#a8a8a8",
    fontSize: 14,
  },
  linkText: {
    color: "#0095f6",
    fontWeight: "bold",
    fontSize: 14,
  },
});
