import React, { useState } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
  Keyboard,
} from "react-native";
import { useTheme } from "../../../context/ThemeContext";

interface DirectComposerProps {
  onSend: (text: string) => void;
  disabled?: boolean;
}

export const DirectComposer: React.FC<DirectComposerProps> = ({ onSend, disabled = false }) => {
  const { colors } = useTheme();
  const [text, setText] = useState("");

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bgInput, borderTopColor: colors.borderLight }]}>
      <TextInput
        style={[styles.input, { color: colors.textPrimary }]}
        placeholder="메시지 보내기..."
        placeholderTextColor={colors.textMuted}
        value={text}
        onChangeText={setText}
        multiline
        editable={!disabled}
      />
      <TouchableOpacity
        style={[styles.sendButton, { opacity: text.trim() && !disabled ? 1 : 0.4 }]}
        onPress={handleSend}
        disabled={!text.trim() || disabled}
        activeOpacity={0.7}
      >
        <Text style={[styles.sendButtonText, { color: colors.accentPurple }]}>전송</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    minHeight: 38,
    maxHeight: 100,
    borderRadius: 19,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    fontSize: 15,
  },
  sendButton: {
    marginLeft: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sendButtonText: {
    fontSize: 15,
    fontWeight: "700",
  },
});
