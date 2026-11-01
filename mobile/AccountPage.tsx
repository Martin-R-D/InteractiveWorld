import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import Account, { AccountSession } from "./Account";
import { useTheme } from "./theme";
export default function AccountPage({
  endpoint,
  session,
  restoring,
  onChange,
  onBack,
  onEndpoint,
}: {
  endpoint: string;
  session: AccountSession | null;
  restoring: boolean;
  onChange: (s: AccountSession | null) => void;
  onBack?: () => void;
  onEndpoint: (url: string) => void;
}) {
  const { s, dark, toggle } = useTheme();
  const [settings, setSettings] = useState(false),
    [url, setUrl] = useState(endpoint),
    [error, setError] = useState("");
  return (
    <SafeAreaView
      style={s.safe}
      edges={session ? ["top", "left", "right"] : undefined}
    >
      <StatusBar style={dark ? "light" : "dark"} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={s.page}
          keyboardShouldPersistTaps="handled"
        >
          <View style={s.header}>
            <Text style={s.brand}>InteractiveWorld</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                dark ? "Switch to light mode" : "Switch to dark mode"
              }
              onPress={toggle}
            >
              <Text style={s.link}>{dark ? "Light mode" : "Dark mode"}</Text>
            </Pressable>
          </View>
          <Text style={s.objectTitle}>
            {session ? "Your account" : "Your world starts here."}
          </Text>
          <Text style={s.muted}>
            {session
              ? "Manage your InteractiveWorld account."
              : "Sign in or create an account to use InteractiveWorld."}
          </Text>
          {restoring ? (
            <View style={s.card}>
              <ActivityIndicator />
              <Text style={s.muted}>Checking your session…</Text>
            </View>
          ) : (
            <Account
              key={endpoint}
              endpoint={endpoint}
              session={session}
              onChange={onChange}
              onClose={session ? onBack : undefined}
            />
          )}
          {!session && (
            <>
              <Pressable
                accessibilityRole="button"
                onPress={() => setSettings((v) => !v)}
              >
                <Text style={s.link}>Connection settings</Text>
              </Pressable>
              {settings && (
                <View style={s.card}>
                  <Text style={s.muted}>
                    Enter your backend address to connect.
                  </Text>
                  <TextInput
                    accessibilityLabel="Backend URL"
                    value={url}
                    onChangeText={setUrl}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={s.input}
                  />
                  <Pressable
                    accessibilityRole="button"
                    style={s.button}
                    onPress={() => {
                      try {
                        const parsed = new URL(url.trim());
                        if (!["http:", "https:"].includes(parsed.protocol))
                          throw new Error();
                        setError("");
                        onEndpoint(url.trim().replace(/\/$/, ""));
                        setSettings(false);
                      } catch {
                        setError("Enter a valid http:// or https:// address.");
                      }
                    }}
                  >
                    <Text style={s.buttonText}>Connect</Text>
                  </Pressable>
                  {!!error && <Text style={s.errorText}>{error}</Text>}
                </View>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
