import React, { forwardRef } from "react";
import type { ScrollViewProps } from "react-native";
import {
  KeyboardChatScrollView,
  type KeyboardChatScrollViewProps,
} from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type DirectKeyboardScrollViewProps =
  ScrollViewProps & KeyboardChatScrollViewProps;

export const DirectKeyboardScrollView = forwardRef<
  React.ComponentRef<typeof KeyboardChatScrollView>,
  DirectKeyboardScrollViewProps
>(({ inverted, ...props }, ref) => {
  const { bottom } = useSafeAreaInsets();

  return (
    <KeyboardChatScrollView
      {...props}
      ref={ref}
      automaticallyAdjustContentInsets={false}
      contentInsetAdjustmentBehavior="never"
      inverted={Boolean(inverted)}
      keyboardLiftBehavior="always"
      offset={bottom}
    />
  );
});

DirectKeyboardScrollView.displayName = "DirectKeyboardScrollView";
