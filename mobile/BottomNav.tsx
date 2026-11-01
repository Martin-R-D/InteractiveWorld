import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "./theme";

export type MainTab = "Home" | "Objects" | "Worlds" | "Account";
const tabs: { label: MainTab; icon: string }[] = [
  { label: "Home", icon: "⌂" },
  { label: "Objects", icon: "◇" },
  { label: "Worlds", icon: "◎" },
  { label: "Account", icon: "○" },
];

export default function BottomNav({
  active,
  disabled,
  onSelect,
}: {
  active: MainTab;
  disabled: boolean;
  onSelect: (tab: MainTab) => void;
}) {
  const { dark } = useTheme();
  return (
    <SafeAreaView
      edges={["bottom", "left", "right"]}
      style={[
        styles.bar,
        {
          backgroundColor: dark ? "#0d181a" : "#ffffff",
          borderTopColor: dark ? "#2b3b39" : "#dce5d8",
        },
      ]}
    >
      <View accessibilityRole="tablist" style={styles.tabs}>
        {tabs.map(({ label, icon }) => (
          <Pressable
            key={label}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: active === label, disabled }}
            disabled={disabled}
            onPress={() => onSelect(label)}
            style={({ pressed }) => [
              styles.tab,
              { opacity: disabled ? 0.45 : pressed ? 0.7 : 1 },
            ]}
          >
            <View
              style={[
                styles.icon,
                active === label && { backgroundColor: "#b7ee8a" },
              ]}
            >
              {label === "Account" ? (
                <View style={{ alignItems: "center", gap: 2 }}>
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      borderWidth: 1.5,
                      borderColor:
                        active === label
                          ? "#173125"
                          : dark
                            ? "#a6b8b1"
                            : "#587065",
                    }}
                  />
                  <View
                    style={{
                      width: 17,
                      height: 10,
                      borderTopLeftRadius: 9,
                      borderTopRightRadius: 9,
                      borderWidth: 1.5,
                      borderColor:
                        active === label
                          ? "#173125"
                          : dark
                            ? "#a6b8b1"
                            : "#587065",
                    }}
                  />
                </View>
              ) : (
                <Text
                  style={{
                    fontSize: 24,
                    lineHeight: 28,
                    color:
                      active === label
                        ? "#173125"
                        : dark
                          ? "#a6b8b1"
                          : "#587065",
                  }}
                >
                  {icon}
                </Text>
              )}
            </View>
            <Text
              style={{
                fontSize: 11,
                fontWeight: active === label ? "700" : "500",
                color: dark ? "#eef1e7" : "#20352c",
              }}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bar: { borderTopWidth: 1 },
  tabs: {
    flexDirection: "row",
    width: "100%",
    maxWidth: 650,
    alignSelf: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  tab: {
    flex: 1,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  icon: {
    width: 54,
    height: 30,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
});
