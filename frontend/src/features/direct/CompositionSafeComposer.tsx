import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  NativeSyntheticEvent,
  StyleSheet,
  TextInput,
  TextInputEndEditingEventData,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../../context/ThemeContext";

interface CompositionSafeComposerProps {
  editable: boolean;
  placeholder: string;
  sendingMedia?: boolean;
  autoFocus?: boolean;
  onSend: (exactText: string) => Promise<unknown> | unknown;
  onPickImage: () => void;
  onTypingChange: (hasText: boolean) => void;
}

export const CompositionSafeComposer = ({
  editable,
  placeholder,
  sendingMedia = false,
  autoFocus = false,
  onSend,
  onPickImage,
  onTypingChange,
}: CompositionSafeComposerProps) => {
  const { colors } = useTheme();
  const inputRef = useRef<TextInput>(null);
  const nativeTextRef = useRef("");
  const pendingCommitRef = useRef(false);
  const ignoreEndEditingUntilRef = useRef(0);
  const commitFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hasText, setHasText] = useState(false);
  const [inputHeight, setInputHeight] = useState(44);

  useEffect(() => {
    if (!autoFocus || !editable) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 350);
    return () => clearTimeout(timer);
  }, [autoFocus, editable]);

  const updateNativeText = useCallback(
    (text: string) => {
      nativeTextRef.current = text;
      setHasText(Boolean(text.trim()));
      onTypingChange(Boolean(text));
    },
    [onTypingChange]
  );

  const clearNativeInput = useCallback(() => {
    nativeTextRef.current = "";
    setHasText(false);
    setInputHeight(44);
    onTypingChange(false);
    inputRef.current?.clear();
  }, [onTypingChange]);

  const sendCommittedText = useCallback(
    (text: string, sentByFallback = false) => {
      if (!pendingCommitRef.current && text !== nativeTextRef.current) {
        nativeTextRef.current = text;
      }
      pendingCommitRef.current = false;
      ignoreEndEditingUntilRef.current = sentByFallback
        ? Date.now() + 1000
        : 0;
      if (commitFallbackRef.current) {
        clearTimeout(commitFallbackRef.current);
        commitFallbackRef.current = null;
      }
      const exactText = text;
      if (!exactText.trim()) return;

      // onSend dispatches the optimistic message synchronously. Only after
      // that exact native string is captured do we clear the uncontrolled
      // input, so an Android IME composition cannot be overwritten by React.
      void Promise.resolve(onSend(exactText)).catch(() => undefined);
      clearNativeInput();
      requestAnimationFrame(() => inputRef.current?.focus());
    },
    [clearNativeInput, onSend]
  );

  const commitFromNative = useCallback(() => {
    if (!editable || pendingCommitRef.current || !nativeTextRef.current.trim()) {
      return;
    }
    pendingCommitRef.current = true;
    inputRef.current?.blur();
    commitFallbackRef.current = setTimeout(() => {
      if (pendingCommitRef.current) {
        sendCommittedText(nativeTextRef.current, true);
      }
    }, 350);
  }, [editable, sendCommittedText]);

  const handleEndEditing = useCallback(
    (event: NativeSyntheticEvent<TextInputEndEditingEventData>) => {
      if (Date.now() < ignoreEndEditingUntilRef.current) {
        ignoreEndEditingUntilRef.current = 0;
        return;
      }
      const finalNativeText = event.nativeEvent.text;
      updateNativeText(finalNativeText);
      if (pendingCommitRef.current) sendCommittedText(finalNativeText);
    },
    [sendCommittedText, updateNativeText]
  );

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.bgPrimary,
          borderTopColor: colors.borderLight,
        },
      ]}
    >
      <TouchableOpacity
        accessibilityLabel="사진 보내기"
        activeOpacity={0.7}
        disabled={!editable || sendingMedia}
        onPress={onPickImage}
        style={[
          styles.mediaButton,
          { backgroundColor: colors.accentPurple + "14" },
        ]}
      >
        {sendingMedia ? (
          <ActivityIndicator size="small" color={colors.accentPurple} />
        ) : (
          <Ionicons
            name="image-outline"
            size={22}
            color={editable ? colors.accentPurple : colors.textMuted}
          />
        )}
      </TouchableOpacity>

      <View
        style={[
          styles.inputShell,
          {
            backgroundColor: colors.bgInput,
            borderColor: hasText ? colors.accentPurple + "80" : colors.borderColor,
          },
        ]}
      >
        <TextInput
          ref={inputRef}
          accessibilityLabel="메시지 입력"
          style={[
            styles.input,
            {
              height: inputHeight,
              color: colors.textPrimary,
            },
          ]}
          editable={editable}
          multiline
          autoCorrect
          autoCapitalize="sentences"
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          returnKeyType="send"
          submitBehavior="submit"
          onChangeText={updateNativeText}
          onEndEditing={handleEndEditing}
          onSubmitEditing={commitFromNative}
          onContentSizeChange={(event) => {
            const measured = event.nativeEvent.contentSize.height + 12;
            setInputHeight(Math.max(44, Math.min(112, measured)));
          }}
          textAlignVertical="center"
        />
      </View>

      <TouchableOpacity
        accessibilityLabel="메시지 보내기"
        activeOpacity={0.8}
        disabled={!editable || !hasText}
        onPress={commitFromNative}
        style={styles.sendButtonTouch}
      >
        <LinearGradient
          colors={
            editable && hasText
              ? colors.auraGradient
              : [colors.borderColor, colors.borderColor]
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.sendButton}
        >
          <Ionicons
            name="arrow-up"
            size={21}
            color={editable && hasText ? "#ffffff" : colors.textMuted}
          />
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    minHeight: 66,
    paddingHorizontal: 12,
    paddingTop: 9,
    paddingBottom: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  mediaButton: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  inputShell: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderRadius: 18,
    overflow: "visible",
  },
  input: {
    width: "100%",
    minHeight: 44,
    maxHeight: 112,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 15,
    lineHeight: 21,
    includeFontPadding: true,
  },
  sendButtonTouch: {
    width: 44,
    height: 44,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
});
