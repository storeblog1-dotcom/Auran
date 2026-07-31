import React from "react";
import { StyleSheet, View } from "react-native";
import { DirectMessageItemV2, DirectMessageItemV2Props } from "./DirectMessageItemV2";

export interface DirectMessageGroupV2Props {
  items: DirectMessageItemV2Props[];
}

export const DirectMessageGroupV2 = ({ items }: DirectMessageGroupV2Props) => {
  return (
    <View style={styles.groupWrapper}>
      {items.map((itemProps, index) => {
        const stableKey =
          itemProps.message.client_message_id ||
          itemProps.message.id ||
          `msg-idx-${index}`;
        return (
          <DirectMessageItemV2 key={`v2-${stableKey}`} {...itemProps} />
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  groupWrapper: {
    width: "100%",
  },
});
