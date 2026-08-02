import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextInput as RNTextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { AuraLogoText } from "../components/AuraLogoText";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import api from "../services/api";
import { getPushInstallationId } from "../services/pushNotifications";

const ages = Array.from({ length: 107 }, (_, index) => String(index + 14));
const genders = ["\uC5EC\uC131", "\uB0A8\uC131", "\uB17C\uBC14\uC774\uB108\uB9AC", "\uC9C1\uC811 \uC785\uB825", "\uC751\uB2F5\uD558\uC9C0 \uC54A\uC74C"];
const orientations = ["\uC774\uC131\uC560", "\uB3D9\uC131\uC560", "\uC591\uC131\uC560", "\uD310\uC131\uC560", "\uBB34\uC131\uC560", "\uC9C1\uC811 \uC785\uB825", "\uC751\uB2F5\uD558\uC9C0 \uC54A\uC74C"];
const visibilityOptions = [
  { value: "public", label: "\uC804\uCCB4 \uACF5\uAC1C" },
  { value: "mutual_followers", label: "\uB9DE\uD314\uC77C \uACBD\uC6B0\uC5D0\uB9CC \uACF5\uAC1C" },
  { value: "private", label: "\uBE44\uACF5\uAC1C" },
] as const;
type PickerType = "age" | "gender" | "orientation" | "visibility" | null;
type PolicyItem = { policy_key: string; version: string; title: string; content: string; content_hash: string; is_required: boolean; is_sensitive: boolean };
const DIRECT_INPUT = "\uc9c1\uc811 \uc785\ub825";

// Earlier escaped Korean labels are decoded here so every mobile platform renders them correctly.
const decode = (value: any): any => {
  if (typeof value === "string") return value.replace(/\\u([0-9a-fA-F]{4})/g, (_match, hex) => String.fromCharCode(parseInt(hex, 16)));
  if (Array.isArray(value)) return value.map(decode);
  return value;
};
const Text = ({ children, ...props }: any) => <RNText {...props}>{decode(children)}</RNText>;
const TextInput = ({ placeholder, ...props }: any) => <RNTextInput {...props} placeholder={decode(placeholder)} />;

export const RegisterScreen = ({ navigation }: any) => {
  const [form, setForm] = useState({
    username: "", nickname: "", fullName: "", email: "", password: "", age: "", gender: "", height: "", bodyType: "", bio: "", visibility: "mutual_followers",
  });
  const [orientation, setOrientation] = useState("");
  const [customOrientation, setCustomOrientation] = useState("");
  const [picker, setPicker] = useState<PickerType>(null);
  const [image, setImage] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [nicknameStatus, setNicknameStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const [policies, setPolicies] = useState<PolicyItem[]>([]);
  const [acceptedPolicies, setAcceptedPolicies] = useState<Record<string, boolean>>({});
  const [selectedPolicy, setSelectedPolicy] = useState<PolicyItem | null>(null);
  const { register } = useAuth();
  const { colors } = useTheme();

  useEffect(() => {
    let mounted = true;
    api.get("/governance/policies/active").then((response) => {
      if (mounted) setPolicies(response.data?.data || []);
    }).catch(() => {
      if (mounted) setPolicies([]);
    });
    return () => { mounted = false; };
  }, []);

  const setField = (field: keyof typeof form, value: string) => setForm((current) => ({ ...current, [field]: value }));
  const inputStyle = [styles.input, { backgroundColor: colors.bgInput, borderColor: colors.borderColor, color: colors.textPrimary }];
  const selectorStyle = [styles.selector, { backgroundColor: colors.bgInput, borderColor: colors.borderColor }];

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (!result.canceled) setImage(result.assets[0].uri);
  };

  const checkNickname = async () => {
    const nickname = form.nickname.trim();
    if (!nickname) return false;
    setNicknameStatus("checking");
    try {
      const response = await api.get("/auth/nickname-availability", { params: { nickname } });
      const available = response.data?.data?.available === true;
      setNicknameStatus(available ? "available" : "taken");
      return available;
    } catch {
      setNicknameStatus("idle");
      return false;
    }
  };

  const selectSingle = (value: string) => {
    const decodedValue = decode(value);
    if (picker === "age") setField("age", decodedValue);
    if (picker === "gender") setField("gender", decodedValue);
    if (picker === "visibility") setField("visibility", decodedValue);
    if (picker === "orientation") setOrientation(decodedValue);
    setPicker(null);
  };

  const submit = async () => {
    if (!form.username || !form.nickname || !form.fullName || !form.email || !form.password || !form.age || !form.gender || !orientation || (orientation === DIRECT_INPUT && !customOrientation.trim())) {
      return Alert.alert("\uD544\uC218 \uD56D\uBAA9 \uD655\uC778", "\uD544\uC218 \uD56D\uBAA9\uC744 \uBAA8\uB450 \uC785\uB825\uD574\uC8FC\uC138\uC694.");
    }
    if (!(await checkNickname())) {
      return Alert.alert("닉네임 확인", "이미 사용 중인 닉네임이거나 확인에 실패했습니다.");
    }
    if (!policies.length) {
      return Alert.alert("정책 확인 실패", "현재 운영정책을 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.");
    }
    const missingPolicy = policies.find((policy) => policy.is_required && !acceptedPolicies[policy.policy_key]);
    if (missingPolicy) {
      return Alert.alert("필수 동의", `${missingPolicy.title}에 동의해 주세요.`);
    }
    const sensitivePolicy = policies.find((policy) => policy.is_sensitive);
    if (orientation !== "응답하지 않음" && sensitivePolicy && !acceptedPolicies[sensitivePolicy.policy_key]) {
      return Alert.alert("민감정보 동의", "성적 지향 정보를 입력하려면 민감 프로필 정보 처리에 별도로 동의해야 합니다.");
    }
    setLoading(true);
    try {
      const installationId = await getPushInstallationId();
      await register({
        username: form.username.trim(), nickname: form.nickname.trim(), full_name: form.fullName.trim(), email: form.email.trim().toLowerCase(), password: form.password,
        age: Number(form.age), gender: form.gender, sexual_orientation: orientation === DIRECT_INPUT ? customOrientation.trim() : orientation, height: form.height ? Number(form.height) : undefined,
        body_type: form.bodyType || undefined, bio: form.bio || undefined, profile_image_url: image, profile_visibility: form.visibility,
        installation_id: installationId,
        policy_acceptances: policies.map((policy) => ({ policy_key: policy.policy_key, version: policy.version, accepted: !!acceptedPolicies[policy.policy_key] })),
      });
    } catch (error: any) {
      Alert.alert("\uD68C\uC6D0\uAC00\uC785 \uC2E4\uD328", error.response?.data?.error?.message || error.response?.data?.detail || error.message || "\uD68C\uC6D0\uAC00\uC785\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.");
    } finally { setLoading(false); }
  };

  const pickerOptions = picker === "age" ? ages : picker === "gender" ? genders : picker === "orientation" ? orientations : visibilityOptions.map((item) => item.value);
  const selectedLabel = form.visibility === "public" ? "\uC804\uCCB4 \uACF5\uAC1C" : form.visibility === "private" ? "\uBE44\uACF5\uAC1C" : "\uB9DE\uD314\uC77C \uACBD\uC6B0\uC5D0\uB9CC \uACF5\uAC1C";

  return <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <AuraLogoText fontSize={40} />
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>\uC0C8 \uACC4\uC815 \uB9CC\uB4E4\uAE30</Text>
      <Text style={[styles.section, { color: colors.textPrimary }]}>\uACC4\uC815 \uC815\uBCF4</Text>
      <TextInput style={inputStyle} placeholder="\uC544\uC774\uB514 *" placeholderTextColor={colors.textSecondary} value={form.username} onChangeText={(value: string) => setField("username", value)} autoCapitalize="none" autoComplete="username" textContentType="username" importantForAutofill="yes" />
      <TextInput style={inputStyle} placeholder="\uB2C9\uB124\uC784 * (\uC571\uC5D0\uC11C \uBCF4\uC5EC\uC9C0\uB294 \uC774\uB984)" placeholderTextColor={colors.textSecondary} value={form.nickname} onChangeText={(value: string) => { setField("nickname", value); setNicknameStatus("idle"); }} onBlur={checkNickname} />
      {nicknameStatus !== "idle" ? <Text style={[styles.nicknameStatus, { color: nicknameStatus === "available" ? "#16a34a" : nicknameStatus === "taken" ? "#ef4444" : colors.textSecondary }]}>{nicknameStatus === "checking" ? "닉네임 확인 중..." : nicknameStatus === "available" ? "사용 가능한 닉네임입니다." : "이미 사용 중인 닉네임입니다."}</Text> : null}
      <TextInput style={inputStyle} placeholder="\uC774\uB984 *" placeholderTextColor={colors.textSecondary} value={form.fullName} onChangeText={(value: string) => setField("fullName", value)} />
      <TextInput style={inputStyle} placeholder="\uC774\uBA54\uC77C \uC8FC\uC18C *" placeholderTextColor={colors.textSecondary} value={form.email} onChangeText={(value: string) => setField("email", value)} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" importantForAutofill="yes" />
      <TextInput style={inputStyle} placeholder="\uBE44\uBC00\uBC88\uD638 *" placeholderTextColor={colors.textSecondary} value={form.password} onChangeText={(value: string) => setField("password", value)} secureTextEntry autoComplete="new-password" textContentType="newPassword" importantForAutofill="yes" />
      <Text style={[styles.section, { color: colors.textPrimary }]}>\uD504\uB85C\uD544 \uC815\uBCF4</Text>
      <View style={styles.row}><TouchableOpacity style={[selectorStyle, styles.half]} onPress={() => setPicker("age")}><Text style={{ color: form.age ? colors.textPrimary : colors.textSecondary }}>{form.age ? `${form.age}\uC138` : "\uB098\uC774 *"}</Text></TouchableOpacity><TouchableOpacity style={[selectorStyle, styles.half]} onPress={() => setPicker("gender")}><Text style={{ color: form.gender ? colors.textPrimary : colors.textSecondary }}>{form.gender || "\uC131\uBCC4 *"}</Text></TouchableOpacity></View>
      <TouchableOpacity style={selectorStyle} onPress={() => setPicker("orientation")}><Text style={{ color: orientation ? colors.textPrimary : colors.textSecondary }}>{orientation || "\uC131\uC801 \uC9C0\uD5A5 *"}</Text></TouchableOpacity>
      {orientation === DIRECT_INPUT ? <TextInput style={inputStyle} placeholder="\uC131\uC801 \uC9C0\uD5A5\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694 *" placeholderTextColor={colors.textSecondary} value={customOrientation} onChangeText={setCustomOrientation} /> : null}
      <Text style={[styles.privacyHint, { color: colors.textSecondary }]}>\uC131\uBCC4\uC640 \uC131\uC801 \uC9C0\uD5A5\uC740 \uAE30\uBCF8\uC73C\uB85C \uB9DE\uD314\uC778 \uC0AC\uC6A9\uC790\uC5D0\uAC8C\ub9cc \uACF5\uAC1C\ub429\ub2c8\ub2e4.</Text>
      <Text style={[styles.section, { color: colors.textPrimary }]}>\uC120\uD0DD \uC785\uB825</Text>
      <TextInput style={inputStyle} placeholder="\uD0A4 (cm)" placeholderTextColor={colors.textSecondary} value={form.height} onChangeText={(value: string) => setField("height", value)} keyboardType="numeric" />
      <TextInput style={inputStyle} placeholder="\uCCB4\uD615" placeholderTextColor={colors.textSecondary} value={form.bodyType} onChangeText={(value: string) => setField("bodyType", value)} />
      <TextInput style={[inputStyle, styles.bio]} placeholder="\uC790\uAE30\uC18C\uAC1C" placeholderTextColor={colors.textSecondary} value={form.bio} onChangeText={(value: string) => setField("bio", value)} multiline numberOfLines={3} />
      <TouchableOpacity style={selectorStyle} onPress={() => setPicker("visibility")}><Text style={{ color: colors.textPrimary }}>\uD504\uB85C\uD544 \uACF5\uAC1C \uBC94\uC704: {selectedLabel}</Text></TouchableOpacity>
      <Text style={[styles.section, { color: colors.textPrimary }]}>운영정책 및 개인정보 동의</Text>
      {policies.map((policy) => (
        <View
          key={`${policy.policy_key}:${policy.version}`}
          style={[styles.policyRow, { borderColor: colors.borderColor, backgroundColor: colors.bgInput }]}
        >
          <TouchableOpacity
            style={styles.policyConsent}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: !!acceptedPolicies[policy.policy_key] }}
            onPress={() => setAcceptedPolicies((current) => ({ ...current, [policy.policy_key]: !current[policy.policy_key] }))}
          >
            <Text style={[styles.policyCheck, { color: acceptedPolicies[policy.policy_key] ? "#8b5cf6" : colors.textSecondary }]}>{acceptedPolicies[policy.policy_key] ? "☑" : "☐"}</Text>
            <View style={{ flex: 1 }}><Text style={{ color: colors.textPrimary, fontWeight: "700" }}>{policy.is_required ? "[필수]" : policy.is_sensitive ? "[민감정보 선택]" : "[선택]"} {policy.title}</Text><Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>버전 {policy.version}</Text></View>
          </TouchableOpacity>
          <TouchableOpacity accessibilityLabel={`${policy.title} 내용 보기`} onPress={() => setSelectedPolicy(policy)}><Text style={styles.policyLink}>내용 보기</Text></TouchableOpacity>
        </View>
      ))}
      <Text style={[styles.privacyHint, { color: colors.textSecondary }]}>보안·부정이용 방지를 위해 가입 IP와 앱 설치 식별자의 서버 HMAC 값을 처리합니다. IMEI·MAC·광고 ID는 수집하지 않습니다.</Text>
      <TouchableOpacity style={styles.photo} onPress={pickImage}>{image ? <Image source={{ uri: image }} style={styles.avatar} /> : <Text style={{ color: colors.textSecondary }}>\uD504\uB85C\uD544 \uC0AC\uC9C4 \uB4F1\uB85D (\uC120\uD0DD)</Text>}</TouchableOpacity>
      <TouchableOpacity onPress={submit} disabled={loading}><LinearGradient colors={(colors.auraGradient || ["#8b5cf6", "#ec4899", "#06b6d4"]) as [string, string, ...string[]]} style={styles.submit}>{loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>\uD68C\uC6D0\uAC00\uC785</Text>}</LinearGradient></TouchableOpacity>
      <View style={styles.footer}><Text style={{ color: colors.textSecondary }}>\uC774\uBBF8 \uACC4\uC815\uC774 \uC788\uB098\uC694? </Text><TouchableOpacity onPress={() => navigation.navigate("Login")}><Text style={styles.link}>\uB85C\uADF8\uC778</Text></TouchableOpacity></View>
    </ScrollView>
    <Modal transparent visible={!!picker} animationType="slide" onRequestClose={() => setPicker(null)}><View style={styles.modal}><View style={[styles.options, { backgroundColor: colors.bgSecondary }]}><View style={styles.modalHeader}><Text style={{ color: colors.textPrimary, fontWeight: "700" }}>{picker === "orientation" ? "\uC131\uC801 \uC9C0\uD5A5\uC744 \uC120\uD0DD\uD558\uC138\uC694" : "\uC120\uD0DD\uD558\uC138\uC694"}</Text><TouchableOpacity onPress={() => setPicker(null)}><Text style={styles.done}>\uC644\uB8CC</Text></TouchableOpacity></View><ScrollView style={styles.optionsList} nestedScrollEnabled>{pickerOptions.map((option) => { const label = picker === "age" ? `${option}\uC138` : picker === "visibility" ? visibilityOptions.find((item) => item.value === option)?.label || option : option; return <TouchableOpacity key={option} style={styles.option} onPress={() => selectSingle(option)}><Text style={{ color: colors.textPrimary }}>{label}</Text></TouchableOpacity>; })}</ScrollView></View></View></Modal>
    <Modal transparent visible={!!selectedPolicy} animationType="fade" onRequestClose={() => setSelectedPolicy(null)}>
      <View style={styles.modal}><View style={[styles.policyModal, { backgroundColor: colors.bgSecondary }]}>
        <Text style={[styles.policyModalTitle, { color: colors.textPrimary }]}>{selectedPolicy?.title}</Text>
        <Text style={{ color: colors.textSecondary, marginBottom: 12 }}>버전 {selectedPolicy?.version}</Text>
        <ScrollView><Text style={[styles.policyContent, { color: colors.textPrimary }]}>{selectedPolicy?.content}</Text></ScrollView>
        <TouchableOpacity style={styles.policyClose} onPress={() => setSelectedPolicy(null)}><Text style={{ color: "#fff", fontWeight: "800" }}>확인</Text></TouchableOpacity>
      </View></View>
    </Modal>
  </SafeAreaView>;
};

const styles = StyleSheet.create({ container: { flex: 1 }, content: { padding: 24, paddingBottom: 40 }, subtitle: { textAlign: "center", marginVertical: 12 }, section: { fontWeight: "700", marginTop: 12, marginBottom: 8 }, input: { borderWidth: 1, borderRadius: 10, padding: 14, fontSize: 15, marginBottom: 10 }, nicknameStatus: { marginTop: -6, marginBottom: 10, fontSize: 12 }, flexInput: { flex: 1 }, row: { flexDirection: "row", gap: 10 }, half: { flex: 1 }, selector: { borderWidth: 1, borderRadius: 10, padding: 14, marginBottom: 10 }, emailRow: { flexDirection: "row", gap: 8 }, smallButton: { height: 48, paddingHorizontal: 12, borderRadius: 10, backgroundColor: "#8b5cf6", justifyContent: "center", marginBottom: 10 }, smallButtonText: { color: "#fff", fontWeight: "700" }, verified: { backgroundColor: "#16a34a" }, privacyHint: { fontSize: 12, lineHeight: 18, marginTop: 6, marginBottom: 8 }, policyRow: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 8 }, policyConsent: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 }, policyCheck: { fontSize: 22 }, policyLink: { color: "#8b5cf6", fontSize: 12, fontWeight: "800" }, policyModal: { maxHeight: "70%", borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 20 }, policyModalTitle: { fontSize: 19, fontWeight: "900" }, policyContent: { fontSize: 14, lineHeight: 22 }, policyClose: { backgroundColor: "#8b5cf6", minHeight: 44, borderRadius: 10, alignItems: "center", justifyContent: "center", marginTop: 18 }, bio: { minHeight: 88, textAlignVertical: "top" }, photo: { height: 110, borderWidth: 1, borderColor: "#555", borderRadius: 12, borderStyle: "dashed", alignItems: "center", justifyContent: "center", marginBottom: 14 }, avatar: { width: 90, height: 90, borderRadius: 45 }, submit: { padding: 15, borderRadius: 10, alignItems: "center" }, submitText: { color: "#fff", fontWeight: "700", fontSize: 16 }, footer: { flexDirection: "row", justifyContent: "center", marginTop: 24 }, link: { color: "#8b5cf6", fontWeight: "700" }, modal: { flex: 1, justifyContent: "flex-end", backgroundColor: "#0008" }, options: { borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: "72%", paddingBottom: 24 }, modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 18 }, done: { color: "#8b5cf6", fontWeight: "700" }, optionsList: { flexGrow: 0 }, option: { minHeight: 52, paddingHorizontal: 18, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#ffffff20" } });
