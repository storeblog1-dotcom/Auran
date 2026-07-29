import React, { useCallback, useEffect, useRef } from "react";
import { View, ActivityIndicator, Text, StyleSheet } from "react-native";
import { NavigationContainer, NavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { LinearGradient } from "expo-linear-gradient";

import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { ContextualComposeProvider, useContextualCompose } from "../context/ContextualComposeContext";
import { NotificationProvider, useNotification } from "../context/NotificationContext";
import { NotificationToast, ToastData } from "../components/NotificationToast";
import { openUserProfile } from "../components/AdminIdentity";
import { SplashScreen } from "../components/SplashScreen";
import api from "../services/api";
import {
  consumePendingDirectMessagePushNavigation,
  DirectMessagePushData,
  subscribeToDirectMessagePushNavigation,
} from "../services/pushNotifications";

import { LoginScreen } from "../screens/LoginScreen";
import { WithdrawalPendingScreen } from "../screens/WithdrawalPendingScreen";
import { RegisterScreen } from "../screens/RegisterScreen";
import { FeedScreen } from "../screens/FeedScreen";
import { SearchScreen } from "../screens/SearchScreen";
import { CreatePostScreen } from "../screens/CreatePostScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import { UserProfileScreen } from "../screens/UserProfileScreen";
import { EditProfileScreen } from "../screens/EditProfileScreen";
import { DirectInboxV2Screen } from "../features/direct/DirectInboxV2Screen";
import { DirectChatV2Screen } from "../features/direct/DirectChatV2Screen";
import { HashtagScreen } from "../screens/HashtagScreen";
import { NotificationScreen } from "../screens/NotificationScreen";
import { CommunityScreen } from "../screens/CommunityScreen";
import { AdminScreen } from "../screens/AdminScreen";
import { CommunityAdminScreen } from "../screens/CommunityAdminScreen";

import { Ionicons } from "@expo/vector-icons";

const Stack = createNativeStackNavigator<any>();
const Tab = createBottomTabNavigator<any>();
const FeedStack = createNativeStackNavigator<any>();
const MessagesStack = createNativeStackNavigator<any>();

const FeedStackNavigator = () => (
  <FeedStack.Navigator id="feed-stack" screenOptions={{ headerShown: false, animation: "none" }}>
    <FeedStack.Screen name="FeedHome" component={FeedScreen} />
    <FeedStack.Screen name="Community" component={CommunityScreen} />
  </FeedStack.Navigator>
);

const MessagesStackNavigator = () => (
  <MessagesStack.Navigator id="messages-stack" screenOptions={{ headerShown: false }}>
    <MessagesStack.Screen name="DirectMessageHome" component={DirectInboxV2Screen} />
    <MessagesStack.Screen name="ChatRoom" component={DirectChatV2Screen} />
  </MessagesStack.Navigator>
);

const MainTabs = () => {
  const { colors } = useTheme();
  const { communityComposeDisabled } = useContextualCompose();

  return (
    <Tab.Navigator
      id="main-tabs"
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: colors.tabBarBg,
          borderTopColor: colors.borderLight,
          borderTopWidth: 1,
          height: 72,
          paddingBottom: 6,
          paddingTop: 6,
          justifyContent: "center",
          alignItems: "center",
          elevation: 12,
          shadowColor: "#17152e",
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.07,
          shadowRadius: 14,
        },
        tabBarActiveTintColor: colors.accentPurple,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tab.Screen
        name="Feed"
        component={FeedStackNavigator}
        options={{
          tabBarIcon: ({ color, focused }) => (
            <View style={{ alignItems: "center", justifyContent: "center", width: 64, height: 52, borderRadius: 18, paddingTop: 4, backgroundColor: focused ? colors.accentPurple + "12" : "transparent" }}>
              <Ionicons name={focused ? "home" : "home-outline"} size={22} color={color} />
              <Text numberOfLines={1} style={{ fontSize: 10, lineHeight: 14, color, marginTop: 2, fontWeight: focused ? "700" : "500", textAlign: "center" }}>
                홈
              </Text>
            </View>
          ),
        }}
      />
      <Tab.Screen
        name="Search"
        component={SearchScreen}
        options={{
          tabBarIcon: ({ color, focused }) => (
            <View style={{ alignItems: "center", justifyContent: "center", width: 64, height: 52, borderRadius: 18, paddingTop: 4, backgroundColor: focused ? colors.accentPurple + "12" : "transparent" }}>
              <Ionicons name={focused ? "compass" : "compass-outline"} size={23} color={color} />
              <Text numberOfLines={1} style={{ fontSize: 10, lineHeight: 14, color, marginTop: 2, fontWeight: focused ? "700" : "500", textAlign: "center" }}>
                탐색
              </Text>
            </View>
          ),
        }}
      />
      <Tab.Screen
        name="CreatePost"
        component={CreatePostScreen}
        options={({ navigation }) => ({
          tabBarButton: ({ children, style, accessibilityState, testID }) => (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityState={accessibilityState}
              testID={testID}
              style={style}
              disabled={communityComposeDisabled}
              onPress={() => {
                if (communityComposeDisabled) return;
                const tabState = navigation.getState();
                const activeTab = tabState.routes[tabState.index] as any;
                const nestedState = activeTab?.state;
                const activeNestedRoute = nestedState?.routes?.[nestedState.index ?? 0];
                const composeNonce = Date.now();

                if (activeTab?.name === "Feed" && activeNestedRoute?.name === "Community") {
                  navigation.navigate("Feed", { screen: "Community", params: { composeNonce } });
                  return;
                }
                if (activeTab?.name === "Messages") {
                  navigation.navigate("Messages", { screen: "DirectMessageHome", params: { composeNonce } });
                  return;
                }
                navigation.navigate({
                  name: "CreatePost",
                  params: { mode: "create", editPost: null, onPostUpdated: undefined },
                  merge: false,
                });
              }}
            >
              {children}
            </TouchableOpacity>
          ),
          tabBarIcon: () => (
            <LinearGradient
              colors={communityComposeDisabled ? ["#cbd5e1", "#94a3b8"] : colors.auraGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                width: 44,
                height: 44,
                borderRadius: 16,
                justifyContent: "center",
                alignItems: "center",
                shadowColor: colors.accentPurple,
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.8,
                shadowRadius: 10,
                elevation: 8,
                marginTop: 0,
              }}
            >
              <Ionicons name={communityComposeDisabled ? "lock-closed" : "add"} size={communityComposeDisabled ? 20 : 28} color="#ffffff" />
            </LinearGradient>
          ),
        })}
      />
      <Tab.Screen
        name="Messages"
        component={MessagesStackNavigator}
        options={{
          tabBarIcon: ({ color, focused }) => (
            <View style={{ alignItems: "center", justifyContent: "center", width: 64, height: 52, borderRadius: 18, paddingTop: 4, position: "relative", backgroundColor: focused ? colors.accentPurple + "12" : "transparent" }}>
              <Ionicons name={focused ? "chatbubble" : "chatbubble-outline"} size={22} color={color} />
              <Text numberOfLines={1} style={{ fontSize: 10, lineHeight: 14, color, marginTop: 2, fontWeight: focused ? "700" : "500", textAlign: "center" }}>
                메시지
              </Text>
            </View>
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarIcon: ({ color, focused }) => (
            <View style={{ alignItems: "center", justifyContent: "center", width: 64, height: 52, borderRadius: 18, paddingTop: 4, backgroundColor: focused ? colors.accentPurple + "12" : "transparent" }}>
              <Ionicons name={focused ? "person" : "person-outline"} size={22} color={color} />
              <Text numberOfLines={1} style={{ fontSize: 10, lineHeight: 14, color, marginTop: 2, fontWeight: focused ? "700" : "500", textAlign: "center" }}>
                프로필
              </Text>
            </View>
          ),
        }}
      />
    </Tab.Navigator>
  );
};

const AppContent = () => {
  const { token, isLoading, withdrawalPending } = useAuth();
  const { colors } = useTheme();
  const { toastNotification, clearToast } = useNotification();
  const navigationRef = useRef<NavigationContainerRef<any>>(null);

  const openDirectMessagePush = useCallback(
    (data: DirectMessagePushData): boolean => {
      const navigator = navigationRef.current;
      if (!token || !navigator?.isReady()) return false;

      navigator.navigate("MainTabs", {
        screen: "Messages",
        params: {
          screen: "ChatRoom",
          params: {
            roomId: data.room_id,
            targetUser: {
              id: data.sender_id,
              username: data.sender_username,
              nickname: data.sender_nickname,
              full_name: data.sender_full_name,
              profile_image_url: data.sender_profile_image_url,
              is_admin: data.sender_is_admin,
            },
          },
        },
      });
      return true;
    },
    [token],
  );

  useEffect(
    () => subscribeToDirectMessagePushNavigation(openDirectMessagePush),
    [openDirectMessagePush],
  );

  const handleNavigationReady = useCallback(() => {
    if (!token) return;
    const pending = consumePendingDirectMessagePushNavigation();
    if (pending) openDirectMessagePush(pending);
  }, [openDirectMessagePush, token]);

  const handlePressToast = async (toast: ToastData) => {
    if (!navigationRef.current) return;
    if (toast.type === "FOLLOW") {
      openUserProfile(navigationRef.current, toast.sender);
    } else if (toast.type === "DIRECT_MESSAGE") {
      try {
        const res = await api.post("/direct/rooms", { target_user_id: toast.sender.id });
        const room = res.data?.data || res.data;
        navigationRef.current.navigate("MainTabs", {
          screen: "Messages",
          params: {
            screen: "ChatRoom",
            params: {
              roomId: room.id,
              requestStatus: room.request_status,
              isOutgoingRequest: room.is_outgoing_request,
              targetUser: {
                id: toast.sender.id,
                username: toast.sender.username,
                full_name: toast.sender.full_name || toast.sender.username,
                profile_image_url: toast.sender.profile_image_url,
                is_admin: toast.sender.is_admin,
              },
            },
          },
        });
      } catch (err) {
        console.log("Error launching ChatRoom from toast", err);
      }
    } else if (toast.post_id) {
      navigationRef.current.navigate("Notification", {
        openPostId: toast.post_id,
        autoOpenComments: toast.type === "COMMENT",
      });
    } else {
      navigationRef.current.navigate("Notification");
    }
  };

  if (isLoading) {
    return <SplashScreen />;
  }

  return (
    <View style={{ flex: 1 }}>
      <NotificationToast
        toast={toastNotification}
        onPressToast={handlePressToast}
        onDismiss={clearToast}
      />
      <NavigationContainer
        ref={navigationRef}
        onReady={handleNavigationReady}
      >
        <ContextualComposeProvider>
        <Stack.Navigator id="root-stack" screenOptions={{ headerShown: false }}>
          {withdrawalPending ? (
            <Stack.Screen
              name="WithdrawalPending"
              component={WithdrawalPendingScreen}
              options={{ animation: "none" }}
            />
          ) : token ? (
            <>
              <Stack.Screen name="MainTabs" component={MainTabs} options={{ animation: "none" }} />
              <Stack.Screen name="UserProfile" component={UserProfileScreen} />
              <Stack.Screen name="EditProfile" component={EditProfileScreen} />
              <Stack.Screen name="Notification" component={NotificationScreen} />
              <Stack.Screen name="Hashtag" component={HashtagScreen} />
              <Stack.Screen name="Admin" component={AdminScreen} />
              <Stack.Screen name="CommunityAdmin" component={CommunityAdminScreen} />
            </>
          ) : (
            <>
              <Stack.Screen name="Login" component={LoginScreen} />
              <Stack.Screen name="Register" component={RegisterScreen} />
            </>
          )}
        </Stack.Navigator>
        </ContextualComposeProvider>
      </NavigationContainer>
    </View>
  );
};

export const RootNavigator = () => {
  return (
    <NotificationProvider>
      <AppContent />
    </NotificationProvider>
  );
};
