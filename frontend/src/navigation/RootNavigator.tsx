import React, { useRef } from "react";
import { View, ActivityIndicator, Text, StyleSheet } from "react-native";
import { NavigationContainer, NavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { LinearGradient } from "expo-linear-gradient";

import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { NotificationProvider, useNotification } from "../context/NotificationContext";
import { NotificationToast, ToastData } from "../components/NotificationToast";
import { SplashScreen } from "../components/SplashScreen";
import api from "../services/api";

import { LoginScreen } from "../screens/LoginScreen";
import { RegisterScreen } from "../screens/RegisterScreen";
import { FeedScreen } from "../screens/FeedScreen";
import { SearchScreen } from "../screens/SearchScreen";
import { CreatePostScreen } from "../screens/CreatePostScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import { UserProfileScreen } from "../screens/UserProfileScreen";
import { EditProfileScreen } from "../screens/EditProfileScreen";
import { DirectMessageScreen } from "../screens/DirectMessageScreen";
import { ChatRoomScreen } from "../screens/ChatRoomScreen";
import { HashtagScreen } from "../screens/HashtagScreen";
import { NotificationScreen } from "../screens/NotificationScreen";
import { CommunityScreen } from "../screens/CommunityScreen";
import { AdminScreen } from "../screens/AdminScreen";

import { Ionicons } from "@expo/vector-icons";

const Stack = createNativeStackNavigator<any>();
const Tab = createBottomTabNavigator<any>();

const MainTabs = () => {
  const { colors } = useTheme();

  return (
    <Tab.Navigator
      id="main-tabs"
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: colors.bgPrimary,
          borderTopColor: "transparent",
          borderTopWidth: 0,
          height: 68,
          paddingBottom: 4,
          paddingTop: 4,
          justifyContent: "center",
          alignItems: "center",
          elevation: 0,
          shadowColor: "transparent",
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0,
          shadowRadius: 0,
        },
        tabBarActiveTintColor: colors.accentPurple || "#a855f7",
        tabBarInactiveTintColor: "#a1a1aa",
      }}
    >
      <Tab.Screen
        name="Feed"
        component={FeedScreen}
        options={{
          tabBarIcon: ({ color, focused }) => (
            <View style={{ alignItems: "center", justifyContent: "center", width: 68, paddingTop: 4 }}>
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
            <View style={{ alignItems: "center", justifyContent: "center", width: 68, paddingTop: 4 }}>
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
        options={{
          tabBarIcon: () => (
            <LinearGradient
              colors={["#8b5cf6", "#ec4899", "#06b6d4"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                width: 44,
                height: 44,
                borderRadius: 16,
                justifyContent: "center",
                alignItems: "center",
                shadowColor: "#06b6d4",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.8,
                shadowRadius: 10,
                elevation: 8,
                marginTop: 0,
              }}
            >
              <Ionicons name="add" size={28} color="#ffffff" />
            </LinearGradient>
          ),
        }}
      />
      <Tab.Screen
        name="Messages"
        component={DirectMessageScreen}
        options={{
          tabBarIcon: ({ color, focused }) => (
            <View style={{ alignItems: "center", justifyContent: "center", width: 68, paddingTop: 4, position: "relative" }}>
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
            <View style={{ alignItems: "center", justifyContent: "center", width: 68, paddingTop: 4 }}>
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
  const { token, isLoading } = useAuth();
  const { colors } = useTheme();
  const { toastNotification, clearToast } = useNotification();
  const navigationRef = useRef<NavigationContainerRef<any>>(null);

  const handlePressToast = async (toast: ToastData) => {
    if (!navigationRef.current) return;
    if (toast.type === "FOLLOW") {
      navigationRef.current.navigate("UserProfile", { username: toast.sender.username });
    } else if (toast.type === "DIRECT_MESSAGE") {
      try {
        const res = await api.post("/direct/rooms", { target_user_id: toast.sender.id });
        const room = res.data?.data || res.data;
        navigationRef.current.navigate("ChatRoom", {
          roomId: room.id,
          requestStatus: room.request_status,
          isOutgoingRequest: room.is_outgoing_request,
          targetUser: {
            id: toast.sender.id,
            username: toast.sender.username,
            full_name: toast.sender.full_name || toast.sender.username,
            profile_image_url: toast.sender.profile_image_url,
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
      <NavigationContainer ref={navigationRef}>
        <Stack.Navigator id="root-stack" screenOptions={{ headerShown: false }}>
          {token ? (
            <>
              <Stack.Screen name="MainTabs" component={MainTabs} />
              <Stack.Screen name="UserProfile" component={UserProfileScreen} />
              <Stack.Screen name="EditProfile" component={EditProfileScreen} />
              <Stack.Screen name="DirectMessage" component={DirectMessageScreen} />
              <Stack.Screen name="ChatRoom" component={ChatRoomScreen} />
              <Stack.Screen name="Notification" component={NotificationScreen} />
              <Stack.Screen name="Hashtag" component={HashtagScreen} />
              <Stack.Screen name="Community" component={CommunityScreen} />
              <Stack.Screen name="Admin" component={AdminScreen} />
            </>
          ) : (
            <>
              <Stack.Screen name="Login" component={LoginScreen} />
              <Stack.Screen name="Register" component={RegisterScreen} />
            </>
          )}
        </Stack.Navigator>
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
