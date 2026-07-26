import React, { useState } from "react";
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

const ages = Array.from({ length: 83 }, (_, index) => String(index + 18));
const genders = ["\uC5EC\uC131", "\uB0A8\uC131", "\uB17C\uBC14\uC774\uB108\uB9AC", "\uC9C1\uC811 \uC785\uB825", "\uC751\uB2F5\uD558\uC9C0 \uC54A\uC74C"];
const orientations = ["\uC774\uC131\uC560", "\uB3D9\uC131\uC560", "\uC591\uC131\uC560", "\uD310\uC131\uC560", "\uBB34\uC131\uC560", "\uC9C1\uC811 \uC785\uB825", "\uC751\uB2F5\uD558\uC9C0 \uC54A\uC74C"];
const visibilityOptions = [
  { value: "public", label: "\uC804\uCCB4 \uACF5\uAC1C" },
  { value: "mutual_followers", label: "\uB9DE\uD314\uC77C \uACBD\uC6B0\uC5D0\uB9CC \uACF5\uAC1C" },
  { value: "private", label: "\uBE44\uACF5\uAC1C" },
] as const;
type PickerType = "age" | "gender" | "orientation" | "visibility" | null;

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
  const [orientationsSelected, setOrientationsSelected] = useState<string[]>([]);
  const [picker, setPicker] = useState<PickerType>(null);
  const [image, setImage] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const { colors } = useTheme();

  const setField = (field: keyof typeof form, value: string) => setForm((current) => ({ ...current, [field]: value }));
  const inputStyle = [styles.input, { backgroundColor: colors.bgInput, borderColor: colors.borderColor, color: colors.textPrimary }];
  const selectorStyle = [styles.selector, { backgroundColor: colors.bgInput, borderColor: colors.borderColor }];

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (!result.canceled) setImage(result.assets[0].uri);
  };

  const selectSingle = (value: string) => {
    const decodedValue = decode(value);
    if (picker === "age") setField("age", decodedValue);
    if (picker === "gender") setField("gender", decodedValue);
    if (picker === "visibility") setField("visibility", decodedValue);
    setPicker(null);
  };

  const toggleOrientation = (value: string) => {
    const decodedValue = decode(value);
    setOrientationsSelected((current) => current.includes(decodedValue) ? current.filter((item) => item !== decodedValue) : [...current, decodedValue]);
  };

  const submit = async () => {
    if (!form.username || !form.nickname || !form.fullName || !form.email || !form.password || !form.age || !form.gender || !orientationsSelected.length) {
      return Alert.alert("\uD544\uC218 \uD56D\uBAA9 \uD655\uC778", "\uD544\uC218 \uD56D\uBAA9\uC744 \uBAA8\uB450 \uC785\uB825\uD574\uC8FC\uC138\uC694.");
    }
    setLoading(true);
    try {
      await register({
        username: form.username.trim(), nickname: form.nickname.trim(), full_name: form.fullName.trim(), email: form.email.trim().toLowerCase(), password: form.password,
        age: Number(form.age), gender: form.gender, sexual_orientations: orientationsSelected, height: form.height ? Number(form.height) : undefined,
        body_type: form.bodyType || undefined, bio: form.bio || undefined, profile_image_url: image, profile_visibility: form.visibility,
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
      <TextInput style={inputStyle} placeholder="\uC544\uC774\uB514 *" placeholderTextColor={colors.textSecondary} value={form.username} onChangeText={(value) => setField("username", value)} autoCapitalize="none" autoComplete="username" textContentType="username" importantForAutofill="yes" />
      <TextInput style={inputStyle} placeholder="\uB2C9\uB124\uC784 * (\uC571\uC5D0\uC11C \uBCF4\uC5EC\uC9C0\uB294 \uC774\uB984)" placeholderTextColor={colors.textSecondary} value={form.nickname} onChangeText={(value) => setField("nickname", value)} />
      <TextInput style={inputStyle} placeholder="\uC774\uB984 *" placeholderTextColor={colors.textSecondary} value={form.fullName} onChangeText={(value) => setField("fullName", value)} />
      <TextInput style={inputStyle} placeholder="\uC774\uBA54\uC77C \uC8FC\uC18C *" placeholderTextColor={colors.textSecondary} value={form.email} onChangeText={(value) => setField("email", value)} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" importantForAutofill="yes" />
      <TextInput style={inputStyle} placeholder="\uBE44\uBC00\uBC88\uD638 *" placeholderTextColor={colors.textSecondary} value={form.password} onChangeText={(value) => setField("password", value)} secureTextEntry autoComplete="new-password" textContentType="newPassword" importantForAutofill="yes" />
      <Text style={[styles.section, { color: colors.textPrimary }]}>\uD504\uB85C\uD544 \uC815\uBCF4</Text>
      <View style={styles.row}><TouchableOpacity style={[selectorStyle, styles.half]} onPress={() => setPicker("age")}><Text style={{ color: form.age ? colors.textPrimary : colors.textSecondary }}>{form.age ? `${form.age}\uC138` : "\uB098\uC774 *"}</Text></TouchableOpacity><TouchableOpacity style={[selectorStyle, styles.half]} onPress={() => setPicker("gender")}><Text style={{ color: form.gender ? colors.textPrimary : colors.textSecondary }}>{form.gender || "\uC131\uBCC4 *"}</Text></TouchableOpacity></View>
      <TouchableOpacity style={selectorStyle} onPress={() => setPicker("orientation")}><Text style={{ color: orientationsSelected.length ? colors.textPrimary : colors.textSecondary }}>{orientationsSelected.length ? orientationsSelected.join(", ") : "\uC131\uC801 \uC9C0\uD5A5 * (\uBCF5\uC218 \uC120\uD0DD \uAC00\uB2A5)"}</Text></TouchableOpacity>
      <Text style={[styles.privacyHint, { color: colors.textSecondary }]}>\uC131\uBCC4\uC640 \uC131\uC801 \uC9C0\uD5A5\uC740 \uAE30\uBCF8\uC73C\uB85C \uB9DE\uD314\uC778 \uC0AC\uC6A9\uC790\uC5D0\uAC8C\ub9cc \uACF5\uAC1C\ub429\ub2c8\ub2e4.</Text>
      <Text style={[styles.section, { color: colors.textPrimary }]}>\uC120\uD0DD \uC785\uB825</Text>
      <TextInput style={inputStyle} placeholder="\uD0A4 (cm)" placeholderTextColor={colors.textSecondary} value={form.height} onChangeText={(value) => setField("height", value)} keyboardType="numeric" />
      <TextInput style={inputStyle} placeholder="\uCCB4\uD615" placeholderTextColor={colors.textSecondary} value={form.bodyType} onChangeText={(value) => setField("bodyType", value)} />
      <TextInput style={[inputStyle, styles.bio]} placeholder="\uC790\uAE30\uC18C\uAC1C" placeholderTextColor={colors.textSecondary} value={form.bio} onChangeText={(value) => setField("bio", value)} multiline numberOfLines={3} />
      <TouchableOpacity style={selectorStyle} onPress={() => setPicker("visibility")}><Text style={{ color: colors.textPrimary }}>\uD504\uB85C\uD544 \uACF5\uAC1C \uBC94\uC704: {selectedLabel}</Text></TouchableOpacity>
      <TouchableOpacity style={styles.photo} onPress={pickImage}>{image ? <Image source={{ uri: image }} style={styles.avatar} /> : <Text style={{ color: colors.textSecondary }}>\uD504\uB85C\uD544 \uC0AC\uC9C4 \uB4F1\uB85D (\uC120\uD0DD)</Text>}</TouchableOpacity>
      <TouchableOpacity onPress={submit} disabled={loading}><LinearGradient colors={(colors.auraGradient || ["#8b5cf6", "#ec4899", "#06b6d4"]) as [string, string, ...string[]]} style={styles.submit}>{loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>\uD68C\uC6D0\uAC00\uC785</Text>}</LinearGradient></TouchableOpacity>
      <View style={styles.footer}><Text style={{ color: colors.textSecondary }}>\uC774\uBBF8 \uACC4\uC815\uC774 \uC788\uB098\uC694? </Text><TouchableOpacity onPress={() => navigation.navigate("Login")}><Text style={styles.link}>\uB85C\uADF8\uC778</Text></TouchableOpacity></View>
    </ScrollView>
    <Modal transparent visible={!!picker} animationType="slide" onRequestClose={() => setPicker(null)}><View style={styles.modal}><View style={[styles.options, { backgroundColor: colors.bgSecondary }]}><View style={styles.modalHeader}><Text style={{ color: colors.textPrimary, fontWeight: "700" }}>{picker === "orientation" ? "\uC131\uC801 \uC9C0\uD5A5\uC744 \uC120\uD0DD\uD558\uC138\uC694" : "\uC120\uD0DD\uD558\uC138\uC694"}</Text><TouchableOpacity onPress={() => setPicker(null)}><Text style={styles.done}>\uC644\uB8CC</Text></TouchableOpacity></View><ScrollView style={styles.optionsList} nestedScrollEnabled>{pickerOptions.map((option) => { const selected = picker === "orientation" && orientationsSelected.includes(option); const label = picker === "age" ? `${option}\uC138` : picker === "visibility" ? visibilityOptions.find((item) => item.value === option)?.label || option : option; return <TouchableOpacity key={option} style={styles.option} onPress={() => picker === "orientation" ? toggleOrientation(option) : selectSingle(option)}><Text style={{ color: colors.textPrimary }}>{label}</Text>{selected ? <Text style={styles.done}>\u2713</Text> : null}</TouchableOpacity>; })}</ScrollView></View></View></Modal>
  </SafeAreaView>;
};

const styles = StyleSheet.create({ container: { flex: 1 }, content: { padding: 24, paddingBottom: 40 }, subtitle: { textAlign: "center", marginVertical: 12 }, section: { fontWeight: "700", marginTop: 12, marginBottom: 8 }, input: { borderWidth: 1, borderRadius: 10, padding: 14, fontSize: 15, marginBottom: 10 }, flexInput: { flex: 1 }, row: { flexDirection: "row", gap: 10 }, half: { flex: 1 }, selector: { borderWidth: 1, borderRadius: 10, padding: 14, marginBottom: 10 }, emailRow: { flexDirection: "row", gap: 8 }, smallButton: { height: 48, paddingHorizontal: 12, borderRadius: 10, backgroundColor: "#8b5cf6", justifyContent: "center", marginBottom: 10 }, smallButtonText: { color: "#fff", fontWeight: "700" }, verified: { backgroundColor: "#16a34a" }, privacyHint: { fontSize: 12, lineHeight: 18, marginTop: -2, marginBottom: 4 }, bio: { minHeight: 88, textAlignVertical: "top" }, photo: { height: 110, borderWidth: 1, borderColor: "#555", borderRadius: 12, borderStyle: "dashed", alignItems: "center", justifyContent: "center", marginBottom: 14 }, avatar: { width: 90, height: 90, borderRadius: 45 }, submit: { padding: 15, borderRadius: 10, alignItems: "center" }, submitText: { color: "#fff", fontWeight: "700", fontSize: 16 }, footer: { flexDirection: "row", justifyContent: "center", marginTop: 24 }, link: { color: "#8b5cf6", fontWeight: "700" }, modal: { flex: 1, justifyContent: "flex-end", backgroundColor: "#0008" }, options: { borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: "72%", paddingBottom: 24 }, modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 18 }, done: { color: "#8b5cf6", fontWeight: "700" }, optionsList: { flexGrow: 0 }, option: { minHeight: 52, paddingHorizontal: 18, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#ffffff20" } });
