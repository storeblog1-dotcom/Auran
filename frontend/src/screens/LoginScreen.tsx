import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { AuraLogoText } from "../components/AuraLogoText";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";

export const LoginScreen = ({ navigation }: any) => {
  const [emailOrUsername, setEmailOrUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const { login, googleLogin } = useAuth();
  const { colors } = useTheme();

  const handleLogin = async () => {
    const cleanIdentifier = emailOrUsername.trim();
    if (!cleanIdentifier || !password) {
      Alert.alert("알림", "아이디/이메일과 비밀번호를 입력해주세요.");
      return;
    }
    setLoading(true);
    try {
      await login({ identifier: cleanIdentifier, password });
    } catch (error: any) {
      let msg = "로그인에 실패했습니다.";
      if (error.response?.data?.error?.message) {
        msg = error.response.data.error.message;
      } else if (error.response?.data?.detail) {
        msg = typeof error.response.data.detail === "string" ? error.response.data.detail : JSON.stringify(error.response.data.detail);
      } else if (error.message) {
        msg = error.message;
      }
      Alert.alert("로그인 실패", msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    try {
      await googleLogin({
        email: "demo_google_user@gmail.com",
        full_name: "Google 사용자",
        google_id: "google_demo_sub_1001",
      });
    } catch (error: any) {
      let msg = "Google 로그인에 실패했습니다.";
      if (error.response?.data?.error?.message) {
        msg = error.response.data.error.message;
      } else if (error.response?.data?.detail) {
        msg = typeof error.response.data.detail === "string" ? error.response.data.detail : JSON.stringify(error.response.data.detail);
      } else if (error.message) {
        msg = error.message;
      }
      Alert.alert("Google 로그인 실패", msg);
    } finally {
      setGoogleLoading(false);
    }
  };

  const auraGradientColors = (colors.auraGradient || ["#8b5cf6", "#ec4899", "#06b6d4"]) as [string, string, ...string[]];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
      <View style={styles.inner}>
        <View style={{ marginBottom: 36, alignItems: "center" }}>
          <AuraLogoText fontSize={44} />
        </View>

        <TextInput
          style={[styles.input, { backgroundColor: colors.bgInput, borderColor: colors.borderColor, color: colors.textPrimary }]}
          placeholder="사용자 이름 또는 이메일"
          placeholderTextColor={colors.textSecondary}
          value={emailOrUsername}
          onChangeText={setEmailOrUsername}
          autoCapitalize="none"
        />

        <TextInput
          style={[styles.input, { backgroundColor: colors.bgInput, borderColor: colors.borderColor, color: colors.textPrimary }]}
          placeholder="비밀번호"
          placeholderTextColor={colors.textSecondary}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <TouchableOpacity onPress={handleLogin} disabled={loading || googleLoading} activeOpacity={0.8} style={{ marginTop: 10 }}>
          <LinearGradient
            colors={auraGradientColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.buttonGradient}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>로그인</Text>
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
          onPress={handleGoogleLogin}
          disabled={loading || googleLoading}
        >
          {googleLoading ? (
            <ActivityIndicator color="#4285F4" />
          ) : (
            <View style={styles.googleBtnInner}>
              <View style={styles.googleIconCircle}>
                <Text style={styles.googleIconText}>G</Text>
              </View>
              <Text style={[styles.googleButtonText, { color: colors.textPrimary }]}>Google 계정으로 로그인</Text>
            </View>
          )}
        </TouchableOpacity>

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: colors.textSecondary }]}>계정이 없으신가요? </Text>
          <TouchableOpacity onPress={() => navigation.navigate("Register")}>
            <Text style={[styles.linkText, { color: colors.accentPurple || "#8b5cf6" }]}>가입하기</Text>
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
    marginBottom: 40,
    fontFamily: Platform.OS === "ios" ? "Snell Roundhand" : "sans-serif-thin",
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
    marginBottom: 14,
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
    marginVertical: 20,
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
    marginTop: 30,
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
