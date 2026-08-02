import React, { useCallback, useRef, useState } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Keyboard,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../../context/ThemeContext";

interface DirectComposerProps {
  onSend: (text: string) => void | Promise<void>;
  onFocus?: () => void;
  disabled?: boolean;
}

export const DirectComposer: React.FC<DirectComposerProps> = ({
  onSend,
  onFocus,
  disabled = false,
}) => {
  const { colors } = useTheme();
  const [text, setText] = useState("");
  const inputRef = useRef<TextInput>(null);
  const submittingRef = useRef(false);

  const submitMessage = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled || submittingRef.current) return;

    submittingRef.current = true;
    try {
      void onSend(trimmed);
      setText("");
      inputRef.current?.blur();
      Keyboard.dismiss();
    } finally {
      requestAnimationFrame(() => {
        submittingRef.current = false;
      });
    }
  }, [disabled, onSend, text]);

  return (
    <View style={[styles.container, { backgroundColor: colors.bgPrimary, borderTopColor: colors.borderLight }]}>
      <TextInput
        ref={inputRef}
        style={[
          styles.input,
          {
            color: colors.textPrimary,
            backgroundColor: colors.bgInput,
            borderColor: colors.borderColor,
          },
        ]}
        placeholder="메시지 보내기..."
        placeholderTextColor={colors.textMuted}
        value={text}
        onChangeText={setText}
        onFocus={() => onFocus?.()}
        onSubmitEditing={submitMessage}
        multiline
        returnKeyType="send"
        submitBehavior="submit"
        editable={!disabled}
        accessibilityLabel="메시지 입력"
      />
      <TouchableOpacity
        style={[
          styles.sendButton,
          {
            backgroundColor: colors.accentPurple,
            opacity: text.trim() && !disabled ? 1 : 0.4,
          },
        ]}
        onPress={submitMessage}
        disabled={!text.trim() || disabled}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="메시지 보내기"
      >
        <Ionicons name="send" size={18} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 100,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
    fontSize: 15,
  },
  sendButton: {
    width: 44,
    minHeight: 42,
    borderRadius: 12,
    marginLeft: 8,
    alignItems: "center",
    justifyContent: "center",
  },
});
