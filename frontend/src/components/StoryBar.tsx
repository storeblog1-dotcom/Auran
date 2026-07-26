import React from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Image,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { getFullImageUrl } from "../config";
import { useTheme } from "../context/ThemeContext";

interface StoryBarProps {
  storyGroups: any[];
  currentUser: any;
  onPressUserStory: (groupIndex: number) => void;
  onPressCreateStory: () => void;
}

const VIEWED_RING_COLOR = "#52525b";

export const StoryBar: React.FC<StoryBarProps> = ({
  storyGroups,
  currentUser,
  onPressUserStory,
  onPressCreateStory,
}) => {
  const { colors } = useTheme();
  const selfGroupIndex = storyGroups.findIndex((g) => g.is_self);
  const selfGroup = selfGroupIndex !== -1 ? storyGroups[selfGroupIndex] : null;

  const hasSelfStories = selfGroup && selfGroup.stories.length > 0;
  const auraGradientColors = (colors.auraGradient || ["#8b5cf6", "#ec4899", "#06b6d4"]) as [string, string, ...string[]];

  return (
    <View style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* 내 스토리 아이템 */}
        <View style={styles.itemWrapper}>
          <TouchableOpacity
            style={styles.avatarTouchable}
            onPress={() => {
              if (selfGroupIndex !== -1) {
                onPressUserStory(selfGroupIndex);
              } else {
                onPressCreateStory();
              }
            }}
            activeOpacity={0.8}
          >
            {hasSelfStories && selfGroup!.has_unviewed ? (
              <LinearGradient
                colors={auraGradientColors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.ringOuterGradient}
              >
                <View style={[styles.ringInner, { backgroundColor: colors.bgPrimary }]}>
                  {currentUser?.profile_image_url ? (
                    <Image
                      source={{ uri: getFullImageUrl(currentUser.profile_image_url) }}
                      style={styles.avatarImage}
                    />
                  ) : (
                    <View style={[styles.avatarImage, styles.avatarPlaceholder]}>
                      <Text style={styles.avatarInitial}>
                        {currentUser?.username
                          ? currentUser.username[0].toUpperCase()
                          : "ME"}
                      </Text>
                    </View>
                  )}
                </View>
              </LinearGradient>
            ) : (
              <View
                style={[
                  styles.ringOuter,
                  hasSelfStories ? styles.viewedRing : styles.noStoryRing,
                ]}
              >
                <View style={[styles.ringInner, { backgroundColor: colors.bgPrimary }]}>
                  {currentUser?.profile_image_url ? (
                    <Image
                      source={{ uri: getFullImageUrl(currentUser.profile_image_url) }}
                      style={styles.avatarImage}
                    />
                  ) : (
                    <View style={[styles.avatarImage, styles.avatarPlaceholder]}>
                      <Text style={styles.avatarInitial}>
                        {currentUser?.username
                          ? currentUser.username[0].toUpperCase()
                          : "ME"}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            )}
          </TouchableOpacity>
          <Text style={[styles.usernameText, { color: colors.textPrimary }]} numberOfLines={1}>
            {currentUser?.full_name ? currentUser.full_name.split(" ")[0] : (currentUser?.username || "내 스토리")}
          </Text>
        </View>



        {/* 타인 스토리 아이템 목록 */}
        {storyGroups.map((group, index) => {
          if (group.is_self) return null;

          const user = group.user;
          const hasUnviewed = group.has_unviewed;

          return (
            <View key={user.id} style={styles.itemWrapper}>
              <TouchableOpacity
                style={styles.avatarTouchable}
                onPress={() => onPressUserStory(index)}
                activeOpacity={0.8}
              >
                {hasUnviewed ? (
                  <LinearGradient
                    colors={auraGradientColors}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.ringOuterGradient}
                  >
                    <View style={[styles.ringInner, { backgroundColor: colors.bgPrimary }]}>
                      {user.profile_image_url ? (
                        <Image
                          source={{ uri: getFullImageUrl(user.profile_image_url) }}
                          style={styles.avatarImage}
                        />
                      ) : (
                        <View style={[styles.avatarImage, styles.avatarPlaceholder]}>
                          <Text style={styles.avatarInitial}>
                            {user.username ? user.username[0].toUpperCase() : "?"}
                          </Text>
                        </View>
                      )}
                    </View>
                  </LinearGradient>
                ) : (
                  <View style={[styles.ringOuter, styles.viewedRing]}>
                    <View style={[styles.ringInner, { backgroundColor: colors.bgPrimary }]}>
                      {user.profile_image_url ? (
                        <Image
                          source={{ uri: getFullImageUrl(user.profile_image_url) }}
                          style={styles.avatarImage}
                        />
                      ) : (
                        <View style={[styles.avatarImage, styles.avatarPlaceholder]}>
                          <Text style={styles.avatarInitial}>
                            {user.username ? user.username[0].toUpperCase() : "?"}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                )}
              </TouchableOpacity>
              <Text style={[styles.usernameText, { color: colors.textPrimary }]} numberOfLines={1}>
                {user.full_name ? user.full_name.split(" ")[0] : user.username}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#000",
    paddingVertical: 12,
  },
  scrollContent: {
    paddingHorizontal: 14,
    alignItems: "center",
  },
  itemWrapper: {
    alignItems: "center",
    marginRight: 18,
    width: 70,
  },
  verticalDivider: {
    width: 1,
    height: 48,
    marginRight: 18,
    alignSelf: "center",
    opacity: 0.6,
  },
  avatarTouchable: {
    position: "relative",
  },
  ringOuterGradient: {
    width: 70,
    height: 70,
    borderRadius: 35,
    padding: 3,
    justifyContent: "center",
    alignItems: "center",
  },
  ringOuter: {
    width: 70,
    height: 70,
    borderRadius: 35,
    justifyContent: "center",
    alignItems: "center",
  },
  gradientRing: {
    // LinearGradient 없이 단색으로 핑크-레드 표현
    backgroundColor: "#E1306C",
    padding: 2.5,
  },
  viewedRing: {
    backgroundColor: VIEWED_RING_COLOR,
    padding: 2,
  },
  noStoryRing: {
    backgroundColor: "#3a3a3a",
    padding: 2,
  },
  ringInner: {
    width: "100%",
    height: "100%",
    borderRadius: 35,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
    padding: 2,
    overflow: "hidden",
  },
  avatarImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#222",
    overflow: "hidden",
  },
  avatarPlaceholder: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#3a3a3a",
  },
  avatarInitial: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 20,
  },
  addButton: {
    position: "absolute",
    right: 2,
    bottom: 2,
    backgroundColor: "#0095F6",
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#000",
    zIndex: 10,
  },
  addButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
    lineHeight: 16,
    textAlign: "center",
    marginTop: -1,
  },
  usernameText: {
    marginTop: 5,
    fontSize: 11,
    color: "#e0e0e0",
    textAlign: "center",
    width: "100%",
  },
});
