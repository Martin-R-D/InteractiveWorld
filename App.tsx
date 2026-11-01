import BottomNav, { MainTab } from "./mobile/BottomNav";
import { usePhotoLimit } from "./mobile/usePhotoLimit";
import MyObjects from "./mobile/MyObjects";
import Worlds from "./mobile/Worlds";
import AccountPage from "./mobile/AccountPage";
import { restoreSession, AccountSession } from "./mobile/Account";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import Constants from "expo-constants";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as Crypto from "expo-crypto";
import { saveModel } from "./mobile/saveModel";
import SceneViewer from "./mobile/SceneViewer";
import { Scene, ViewerMessage } from "./mobile/types";
import { ThemeProvider, useTheme } from "./mobile/theme";

type Photo = { uri: string; data: string; mediaType: "image/jpeg" };
const host = Constants.expoConfig?.hostUri?.split(":")[0] ?? "localhost";
function Button({
  label,
  onPress,
  disabled = false,
  secondary = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  const { s, dark } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        secondary && s.secondary,
        disabled && { opacity: 0.4 },
        pressed && { opacity: 0.75 },
      ]}
    >
      <Text
        style={[
          s.buttonText,
          secondary && { color: dark ? "#e6eee5" : "#35513e" },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}
export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <Main />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
function Main() {
  const { s, dark, toggle } = useTheme();
  const [url, setUrl] = useState(`http://${host}:3001`),
    [settings, setSettings] = useState(false),
    [connection, setConnection] = useState("Checking connection…");
  const [libraryOpen, setLibraryOpen] = useState(false),
    [saveMessage, setSaveMessage] = useState("");
  const [worldsOpen, setWorldsOpen] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [accountOpen, setAccountOpen] = useState(false),
    [account, setAccount] = useState<AccountSession | null>(null);
  const [worldEditing, setWorldEditing] = useState(false);
  const photoLimit = usePhotoLimit(account);
  const generation = useRef<AbortController | null>(null);
  const generationDeadline = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [generationNotice, setGenerationNotice] = useState("");
  useEffect(
    () => () => {
      generation.current?.abort();
      generation.current = null;
      if (generationDeadline.current) clearTimeout(generationDeadline.current);
    },
    [],
  );
  const [home, setHome] = useState(true);
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const [photo, setPhoto] = useState<Photo | null>(null),
    [target, setTarget] = useState(""),
    [prompt, setPrompt] = useState("");
  const [current, setCurrent] = useState<Scene | null>(null),
    [candidate, setCandidate] = useState<{ scene: Scene; id: string } | null>(
      null,
    ),
    [failed, setFailed] = useState<Scene | null>(null);
  const [phase, setPhase] = useState(""),
    [error, setError] = useState(""),
    [clarification, setClarification] = useState<{
      question: string;
      choices: string[];
    } | null>(null);
  const [exporting, setExporting] = useState(false),
    [exportMessage, setExportMessage] = useState("");
  const exportRequest = useRef<{
    id: string;
    name: string;
    saving?: boolean;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  const [muted, setMuted] = useState(false);
  const [viewerKey, setViewerKey] = useState(0),
    [command, setCommand] = useState<{
      type: "reset" | "action" | "export";
      id?: string;
      sceneId?: string;
      serial: number;
    } | null>(null),
    [note, setNote] = useState(""),
    [repaired, setRepaired] = useState(false);
  const retryRequest = useRef<{
    mode: "generate" | "edit" | "repair";
    body: Record<string, unknown>;
  } | null>(null);
  const [errorTitle, setErrorTitle] = useState("Let’s try that again");
  const [viewerTouch, setViewerTouch] = useState(false);
  const workingId = useRef("working");
  const locked = useRef(false),
    pending = useRef<typeof candidate>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busy = !!phase;
  const viewing = !!candidate || (!home && !!current);
  const endpoint = url.trim().replace(/\/$/, "");
  async function check() {
    try {
      const r = await fetch(endpoint + "/health", {
        signal: AbortSignal.timeout(5000),
      });
      const h = await r.json();
      if (!r.ok || h.name !== "InteractiveWorld") throw new Error();
      setConnection(
        h.ready ? "Connected · Sonnet 4.6" : "Backend needs CLAUDE_API",
      );
    } catch {
      setConnection("Backend offline · check connection");
    }
  }
  useEffect(() => {
    void check();
  }, []);
  useEffect(() => {
    let active = true;
    setRestoring(true);
    setAccount(null);
    restoreSession(endpoint)
      .then((value) => {
        if (active) setAccount(value);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setRestoring(false);
      });
    return () => {
      active = false;
    };
  }, [endpoint]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (exportRequest.current) clearTimeout(exportRequest.current.timer);
    },
    [],
  );
  async function choose(camera: boolean) {
    if (locked.current || exportRequest.current) return;
    try {
      if (camera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setError(
            "Camera access is off. Enable it in phone settings, or choose a photo instead.",
          );
          return;
        }
      }
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ["images"],
        quality: 0.85,
        allowsEditing: false,
      };
      const selection = camera
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
      if (selection.canceled) return;
      const asset = selection.assets[0];
      const resized = await ImageManipulator.manipulateAsync(
        asset.uri,
        [
          {
            resize:
              asset.width >= asset.height ? { width: 1024 } : { height: 1024 },
          },
        ],
        {
          compress: 0.75,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: true,
        },
      );
      if (!resized.base64 || resized.base64.length > 1600000)
        throw new Error("That photo is too large. Try another image.");
      retryRequest.current = null;
      setError("");
      setErrorTitle("Let’s try that again");
      setPhoto({
        uri: resized.uri,
        data: resized.base64,
        mediaType: "image/jpeg",
      });
      setClarification(null);
      setTarget("");
      setFailed(null);
      setRepaired(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open this photo.");
    }
  }
  function unlock() {
    if (generationDeadline.current) clearTimeout(generationDeadline.current);
    generationDeadline.current = null;
    generation.current = null;
    locked.current = false;
    setPhase("");
    if (timer.current) clearTimeout(timer.current);
  }
  function stopGeneration() {
    generation.current?.abort();
    generation.current = null;
    pending.current = null;
    retryRequest.current = null;
    setCandidate(null);
    setFailed(null);
    setError("");
    setViewerKey((k) => k + 1);
    setGenerationNotice("Stopped. You can try again when you’re ready.");
    unlock();
    void photoLimit.refresh();
  }
  async function generate(
    mode: "generate" | "edit" | "repair",
    targetOverride?: string,
    retryBody?: Record<string, unknown>,
  ) {
    if (locked.current || exportRequest.current) return;
    if (!account || account.endpoint !== endpoint) {
      setAccountOpen(true);
      scroll.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    if (!retryBody && mode === "generate" && !photo) return;
    if (!retryBody && mode === "edit" && (!current || !prompt.trim())) return;
    if (!/^https?:\/\//.test(endpoint)) {
      setError("Enter a backend URL beginning with http:// or https://.");
      setSettings(true);
      return;
    }
    if (mode === "generate" && photoLimit.seconds > 0) return;
    const controller = new AbortController();
    generation.current = controller;
    setGenerationNotice("");
    const repairError = error;
    retryRequest.current = null;
    setErrorTitle("Something went wrong");
    const requestBody = retryBody ?? {
      mode,
      ...(mode === "generate"
        ? {
            image: { data: photo!.data, mediaType: photo!.mediaType },
            target: targetOverride ?? target,
          }
        : {
            scene: mode === "repair" ? failed : current,
            prompt: mode === "edit" ? prompt : undefined,
            error: mode === "repair" ? repairError.slice(0, 400) : undefined,
          }),
    };
    generationDeadline.current = setTimeout(() => {
      if (generation.current !== controller) return;
      stopGeneration();
      setGenerationNotice("");
      setErrorTitle("This request took too long");
      setError(
        "The request reached the 2-minute limit and was stopped. Please try again.",
      );
      retryRequest.current = { mode, body: requestBody };
    }, 120000);
    locked.current = true;
    setPhase(
      mode === "generate"
        ? "Observing your object and building its world…"
        : mode === "edit"
          ? "Bringing your idea to life…"
          : "Repairing the scene…",
    );
    setError("");
    setClarification(null);
    if (mode !== "repair") {
      setFailed(null);
      setRepaired(false);
    } else setRepaired(true);
    try {
      const requestId = Crypto.randomUUID();
      const response = await fetch(endpoint + "/scene", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + account.token,
        },
        signal: controller.signal,
        body: JSON.stringify({ ...requestBody, requestId }),
      });
      const body = await response.json();
      if (generation.current !== controller) return;
      photoLimit.update(body.photoLimit);
      if (response.status === 401) {
        setAccount(null);
        setAccountOpen(true);
      }
      if (!response.ok) throw new Error(body.error ?? "Scene request failed.");
      if (body.result.kind === "unrecognized") {
        setErrorTitle("We couldn’t find an object");
        setError(
          "Try a clearer photo with one object in good lighting. Move closer and keep the whole object in view.",
        );
        unlock();
        return;
      }
      if (body.result.kind === "clarification") {
        setClarification(body.result);
        unlock();
        return;
      }
      const next = { scene: body.result as Scene, id: requestId };
      pending.current = next;
      setCandidate(next);
      setPhase("Preparing your interactive scene…");
      timer.current = setTimeout(() => {
        if (pending.current?.id === requestId) {
          setFailed(next.scene);
          pending.current = null;
          setCandidate(null);
          setError(
            "The viewer took too long to load. Your previous scene is safe.",
          );
          setViewerKey((k) => k + 1);
          unlock();
        }
      }, 15000);
    } catch (e) {
      if (generation.current !== controller) return;
      if (mode !== "repair") retryRequest.current = { mode, body: requestBody };
      const message = (e instanceof Error ? e.message : "").replace(
        /Claude|Anthropic/gi,
        "The service",
      );
      setError(
        /fetch|network|abort|timeout/i.test(message)
          ? "Could not reach the backend. Check your Wi-Fi and connection settings. Your previous scene is safe."
          : message || "Connection interrupted. Your previous scene is safe.",
      );
      unlock();
      void check();
    }
  }
  function finishExport(message: string) {
    if (exportRequest.current) clearTimeout(exportRequest.current.timer);
    exportRequest.current = null;
    setExporting(false);
    setExportMessage(message);
  }
  function navigateHome(showHome: boolean) {
    if (locked.current || exportRequest.current) return;
    retryRequest.current = null;
    setHome(showHome);
    setPhoto(null);
    setClarification(null);
    setTarget("");
    setError("");
    setFailed(null);
    setRepaired(false);
    setExportMessage("");
    setCommand(null);
    setViewerTouch(false);
    scroll.current?.scrollTo({ y: 0, animated: false });
  }
  function exportCurrent() {
    if (!current || busy || exportRequest.current) return;
    const id = Crypto.randomUUID();
    setExporting(true);
    setExportMessage("");
    exportRequest.current = {
      id,
      name: current.name,
      timer: setTimeout(
        () =>
          finishExport("Export timed out. Reload the viewer and try again."),
        30000,
      ),
    };
    setCommand({
      type: "export",
      id,
      sceneId: workingId.current,
      serial: Date.now(),
    });
  }
  async function receiveExport(m: ViewerMessage) {
    const request = exportRequest.current;
    if (!request || request.id !== m.id || request.saving) return;
    request.saving = true;
    clearTimeout(request.timer);
    if (m.type === "export-error") {
      finishExport(
        m.message ?? "Could not export the model. Please try again.",
      );
      return;
    }
    try {
      const message = await saveModel(m.data!, request.name);
      finishExport(message);
    } catch {
      finishExport("Could not save the model. Please try exporting again.");
    }
  }
  function viewerMessage(m: ViewerMessage) {
    if (m.type === "exported" || m.type === "export-error") {
      void receiveExport(m);
      return;
    }
    if (m.type === "loaded" && pending.current && m.id === pending.current.id) {
      workingId.current = m.id;
      setCurrent(pending.current.scene);
      setSaveMessage("");
      setHome(false);
      pending.current = null;
      setCandidate(null);
      setFailed(null);
      setPhoto(null);
      setPrompt("");
      setNote("Ready to explore. Try an action below.");
      unlock();
    }
    if (m.type === "error" && pending.current && m.id === pending.current.id) {
      setFailed(pending.current.scene);
      pending.current = null;
      setCandidate(null);
      setError(m.message ?? "This scene could not load.");
      unlock();
    }
    if (m.type === "fatal") {
      if (exportRequest.current)
        finishExport("Viewer stopped. Reload it and try exporting again.");
      setError(m.message ?? "Reload the viewer to recover.");
      if (pending.current) setFailed(pending.current.scene);
      pending.current = null;
      setCandidate(null);
      unlock();
    }
    if (m.type === "action")
      setNote("Interaction activated · tap again to reset");
  }
  function retryViewer() {
    if (!failed || busy) return;
    const next = { scene: failed, id: Crypto.randomUUID() };
    pending.current = next;
    locked.current = true;
    setCandidate(next);
    setError("");
    setPhase("Preparing your interactive scene…");
    setViewerKey((k) => k + 1);
    timer.current = setTimeout(() => {
      pending.current = null;
      setCandidate(null);
      setError("Viewer did not respond. Try repairing the scene.");
      unlock();
    }, 15000);
  }
  async function saveCurrent() {
    if (!current || !account || locked.current || exportRequest.current) return;
    locked.current = true;
    setPhase("Saving your object…");
    setSaveMessage("");
    try {
      const response = await fetch(endpoint + "/objects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + account.token,
        },
        body: JSON.stringify({ scene: current }),
        signal: AbortSignal.timeout(15000),
      });
      if (response.status === 401) {
        changeAccount(null);
        return;
      }
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Could not save this object.");
      setSaveMessage("Saved to My objects.");
    } catch {
      setSaveMessage("Could not save this object. Tap Save to try again.");
    } finally {
      unlock();
    }
  }
  function openSaved(scene: Scene) {
    const next = { scene, id: Crypto.randomUUID() };
    setLibraryOpen(false);
    setCommand(null);
    setError("");
    setSaveMessage("");
    pending.current = next;
    setCandidate(next);
    locked.current = true;
    setPhase("Opening your saved object…");
    timer.current = setTimeout(() => {
      if (pending.current?.id === next.id) {
        pending.current = null;
        setCandidate(null);
        setFailed(scene);
        setError("Could not open this saved object. Try again.");
        unlock();
      }
    }, 15000);
  }
  function changeAccount(next: AccountSession | null) {
    setWorldsOpen(false);
    setLibraryOpen(false);
    setSaveMessage("");
    if (account && account.user.id !== next?.user.id) {
      setCurrent(null);
      setCandidate(null);
      setPhoto(null);
      setFailed(null);
      setPrompt("");
      setHome(true);
      retryRequest.current = null;
    }
    setAccount(next);
    setAccountOpen(false);
  }
  const activeTab: MainTab = accountOpen
    ? "Account"
    : libraryOpen
      ? "Objects"
      : worldsOpen
        ? "Worlds"
        : "Home";
  function selectTab(tab: MainTab) {
    if (busy || exporting) return;
    setCommand(null);
    setViewerTouch(false);
    setAccountOpen(tab === "Account");
    setLibraryOpen(tab === "Objects");
    setWorldsOpen(tab === "Worlds");
    if (tab === "Home") navigateHome(true);
  }
  function shell(content: React.ReactNode) {
    return (
      <View style={s.safe}>
        <View style={{ flex: 1 }}>{content}</View>
        {account &&
          !restoring &&
          account.endpoint === endpoint &&
          !(worldsOpen && worldEditing) && (
            <BottomNav
              active={activeTab}
              disabled={busy || exporting}
              onSelect={selectTab}
            />
          )}
      </View>
    );
  }
  useEffect(() => {
    const listener = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!account || (worldsOpen && worldEditing)) return false;
      if (busy || exporting) return true;
      if (accountOpen || libraryOpen || worldsOpen || !home || photo) {
        selectTab("Home");
        return true;
      }
      return false;
    });
    return () => listener.remove();
  }, [
    account,
    accountOpen,
    libraryOpen,
    worldsOpen,
    worldEditing,
    busy,
    exporting,
    home,
    photo,
  ]);
  if (restoring || !account || account.endpoint !== endpoint || accountOpen)
    return shell(
      <AccountPage
        key={endpoint}
        endpoint={endpoint}
        session={account?.endpoint === endpoint ? account : null}
        restoring={restoring}
        onChange={changeAccount}
        onEndpoint={setUrl}
      />,
    );
  if (libraryOpen)
    return shell(
      <MyObjects
        key={account.user.id}
        account={account}
        onBack={() => selectTab("Home")}
        onOpen={openSaved}
        onExpired={() => changeAccount(null)}
        onWorlds={() => {
          setLibraryOpen(false);
          setWorldsOpen(true);
        }}
      />,
    );
  if (worldsOpen)
    return shell(
      <Worlds
        key={account.user.id}
        account={account}
        onBack={() => selectTab("Home")}
        onEditingChange={setWorldEditing}
        onExpired={() => changeAccount(null)}
      />,
    );
  return shell(
    <SafeAreaView style={s.safe} edges={["top", "left", "right"]}>
      <StatusBar style={dark ? "light" : "dark"} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          ref={scroll}
          contentContainerStyle={s.page}
          keyboardShouldPersistTaps="handled"
          scrollEnabled={!viewerTouch}
        >
          <View style={s.header}>
            <View style={s.brandRow}>
              <View style={s.logo}>
                <Text style={s.logoText}>iw</Text>
              </View>
              <Text style={s.brand}>InteractiveWorld</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  dark ? "Switch to light mode" : "Switch to dark mode"
                }
                onPress={toggle}
                style={s.settings}
              >
                <Text style={s.settingsText}>
                  {dark ? "☀ Light" : "☾ Dark"}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Connection settings"
                onPress={() => setSettings(!settings)}
                style={s.settings}
              >
                <Text style={s.settingsText}>•••</Text>
              </Pressable>
            </View>
          </View>
          {settings && (
            <View style={s.card}>
              <Text style={s.cardTitle}>Connect your workspace</Text>
              <Text style={s.muted}>
                Use your computer’s Wi-Fi address, port 3001. Your phone and
                computer must share a network.
              </Text>
              <TextInput
                accessibilityLabel="Backend URL"
                value={url}
                onChangeText={setUrl}
                autoCapitalize="none"
                autoCorrect={false}
                style={s.input}
              />
              <Button
                label="Test connection"
                onPress={() => void check()}
                secondary
              />
              <Text style={s.small}>API credentials stay on the backend.</Text>
            </View>
          )}
          {viewing && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Home"
              onPress={() => navigateHome(true)}
              disabled={busy || exporting}
              style={{
                alignSelf: "flex-start",
                minHeight: 44,
                justifyContent: "center",
                paddingHorizontal: 4,
              }}
            >
              <Text style={s.link}>← Home</Text>
            </Pressable>
          )}
          {!viewing && (
            <View style={s.hero}>
              <Text style={s.eyebrow}>
                EVERYDAY OBJECTS. EXTRAORDINARY POSSIBILITIES.
              </Text>
              <Text style={s.title}>
                Your world,{"\n"}a little more{" "}
                <Text style={{ color: dark ? "#b7ee8a" : "#4d7a35" }}>
                  alive.
                </Text>
              </Text>
              <Text style={s.subtitle}>
                A photo becomes a playful 3D creation.{"\n"}Touch it. Change it.
                See what happens.
              </Text>
            </View>
          )}
          {viewing && (
            <View style={s.sceneHeading}>
              <Text style={s.eyebrow}>YOUR INTERACTIVE CREATION</Text>
              <Text style={s.objectTitle}>
                {current?.name ?? candidate?.scene.name}
              </Text>
              <Text style={s.muted}>
                {current?.description ?? candidate?.scene.description}
              </Text>
            </View>
          )}
          {viewing && (
            <View style={s.viewerCard}>
              <View
                style={s.viewer}
                onTouchStart={() => setViewerTouch(true)}
                onTouchEnd={() => setViewerTouch(false)}
                onTouchCancel={() => setViewerTouch(false)}
              >
                <SceneViewer
                  key={viewerKey}
                  dark={dark}
                  muted={muted}
                  scene={candidate?.scene ?? current}
                  sceneId={candidate?.id ?? workingId.current}
                  onMessage={viewerMessage}
                  command={command}
                />
              </View>
              <View style={s.viewerFooter}>
                <Text style={s.small}>DRAG TO ORBIT · PINCH TO ZOOM</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Reset view"
                  onPress={() =>
                    setCommand({ type: "reset", serial: Date.now() })
                  }
                >
                  <Text style={s.link}>Reset view ↺</Text>
                </Pressable>
              </View>
            </View>
          )}
          {!viewing && !photo && (
            <View style={s.captureCard}>
              <View style={s.orbit}>
                <View style={s.objectGraphic}>
                  <Text style={s.spark}>✧</Text>
                </View>
                <View style={s.orbitDot} />
              </View>
              <Text style={s.cardTitle}>What will you bring to life?</Text>
              <Text style={[s.muted, { textAlign: "center" }]}>
                Start with one object and a clear photo.{"\n"}A lamp, a sneaker,
                your favorite mug…
              </Text>
              <View style={[s.twoButtons, { width: "100%", marginTop: 8 }]}>
                <View style={{ flex: 1 }}>
                  <Button
                    label="Camera"
                    onPress={() => void choose(true)}
                    disabled={busy}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    label="Gallery"
                    onPress={() => void choose(false)}
                    disabled={busy}
                    secondary
                  />
                </View>
              </View>
              <Text style={s.small}>STYLIZED 3D · MADE FROM YOUR PHOTO</Text>
            </View>
          )}
          {!viewing && !photo && current && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={"Open " + current.name}
              onPress={() => navigateHome(false)}
              disabled={busy || exporting}
              style={[s.card, s.row]}
            >
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={s.small}>CONTINUE EXPLORING</Text>
                <Text style={s.cardTitle}>{current.name}</Text>
              </View>
              <Text style={s.link}>Open →</Text>
            </Pressable>
          )}
          {photo && (
            <View style={s.card}>
              <View style={s.row}>
                <Text style={s.cardTitle}>A new perspective</Text>
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => {
                    setPhoto(null);
                    setClarification(null);
                  }}
                >
                  <Text style={s.link}>Cancel</Text>
                </Pressable>
              </View>
              <Image
                source={{ uri: photo.uri }}
                style={s.preview}
                resizeMode="contain"
              />
              <Text style={s.muted}>
                Is this the object? Add a hint if there’s more than one.
              </Text>
              <TextInput
                accessibilityLabel="Object hint"
                placeholder="e.g. the yellow desk lamp"
                placeholderTextColor="#7e9392"
                value={target}
                onChangeText={setTarget}
                maxLength={300}
                style={s.input}
                editable={!busy}
              />
              <Button
                label={
                  photoLimit.seconds > 0
                    ? `Try again in ${photoLimit.label}`
                    : "Bring it to life  ↗"
                }
                onPress={() => void generate("generate")}
                disabled={busy || photoLimit.seconds > 0}
              />
            </View>
          )}
          {clarification && (
            <View style={s.card}>
              <Text style={s.cardTitle}>{clarification.question}</Text>
              {clarification.choices.map((choice) => (
                <Button
                  key={choice}
                  label={choice}
                  onPress={() => {
                    setTarget(choice);
                    void generate("generate", choice);
                  }}
                  disabled={busy || photoLimit.seconds > 0}
                  secondary
                />
              ))}
            </View>
          )}
          {photoLimit.seconds > 0 && (
            <View style={s.card}>
              <Text style={s.cardTitle}>A short pause for photo analysis</Text>
              <Text style={s.muted}>
                You can analyze up to 10 photos every 3 minutes. Try again in{" "}
                {photoLimit.label}.
              </Text>
            </View>
          )}
          {!!generationNotice && (
            <Text accessibilityLiveRegion="polite" style={s.muted}>
              {generationNotice}
            </Text>
          )}
          {busy && (
            <View accessibilityLiveRegion="polite" style={s.progress}>
              <ActivityIndicator color="#b7ee8a" />
              <View style={{ flex: 1 }}>
                <Text style={s.progressText}>{phase}</Text>
                <Text style={s.small}>
                  A little imagination takes a moment.
                </Text>
              </View>
              {(generation.current || pending.current) && (
                <Button label="Stop" secondary onPress={stopGeneration} />
              )}
            </View>
          )}
          {!!error && (
            <View accessibilityLiveRegion="polite" style={s.error}>
              <Text style={s.errorTitle}>{errorTitle}</Text>
              <Text style={s.errorText}>{error}</Text>
              {retryRequest.current && (
                <Button
                  label="Try again"
                  onPress={() => {
                    const request = retryRequest.current;
                    if (request)
                      void generate(request.mode, undefined, request.body);
                  }}
                  disabled={
                    busy ||
                    exporting ||
                    (retryRequest.current.mode === "generate" &&
                      photoLimit.seconds > 0)
                  }
                />
              )}
              <Button
                label="Choose photo"
                onPress={() => void choose(false)}
                disabled={busy}
              />
              <Button
                label="Camera"
                onPress={() => void choose(true)}
                disabled={busy}
                secondary
              />
              {failed && (
                <Button
                  label="Try again"
                  onPress={retryViewer}
                  disabled={busy}
                  secondary
                />
              )}
              {failed && !repaired && (
                <Button
                  label="Repair model"
                  onPress={() => void generate("repair")}
                  disabled={busy}
                  secondary
                />
              )}
              {viewing && (
                <Button
                  label="Reload"
                  onPress={() => {
                    setViewerKey((k) => k + 1);
                    setError("");
                  }}
                  disabled={busy}
                  secondary
                />
              )}
            </View>
          )}
          {viewing && current && (
            <>
              <View style={s.card}>
                <View style={s.twoButtons}>
                  <View style={{ flex: 1 }}>
                    <Button
                      label="Save"
                      onPress={() => void saveCurrent()}
                      disabled={busy || exporting}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button
                      label={exporting ? "Exporting…" : "Export"}
                      onPress={exportCurrent}
                      disabled={busy || exporting}
                      secondary
                    />
                  </View>
                </View>
                {!!saveMessage && (
                  <Text accessibilityLiveRegion="polite" style={s.muted}>
                    {saveMessage}
                  </Text>
                )}
                <Text style={s.small}>
                  GLB file · static model · no sounds or animations
                </Text>
                {!!exportMessage && (
                  <Text accessibilityLiveRegion="polite" style={s.muted}>
                    {exportMessage}
                  </Text>
                )}
              </View>
              <View style={s.sectionRow}>
                <Text style={s.cardTitle}>Give it a little nudge</Text>
                <Text style={s.small}>TRY AN ACTION</Text>
              </View>
              <View style={s.actions}>
                {current.actions.map((a) => (
                  <Pressable
                    key={a.id}
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() =>
                      setCommand({
                        type: "action",
                        id: a.id,
                        serial: Date.now(),
                      })
                    }
                    style={[s.action, busy && { opacity: 0.4 }]}
                  >
                    <Text style={s.actionText}>{a.label}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={s.small}>{note}</Text>
              <View style={s.card}>
                <Text style={s.cardTitle}>What if…?</Text>
                <Text style={s.muted}>Give your creation a new twist.</Text>
                <TextInput
                  accessibilityLabel="Scene modification"
                  placeholder="Make it dance, or turn it purple…"
                  placeholderTextColor="#7e9392"
                  value={prompt}
                  onChangeText={setPrompt}
                  multiline
                  maxLength={700}
                  editable={!busy}
                  style={[s.input, { minHeight: 76, textAlignVertical: "top" }]}
                />
                <Button
                  label="Reimagine  ↗"
                  onPress={() => void generate("edit")}
                  disabled={busy || !prompt.trim()}
                />
              </View>
              {!photo && (
                <View style={s.twoButtons}>
                  <View style={{ flex: 1 }}>
                    <Button
                      label="New photo"
                      onPress={() => void choose(true)}
                      disabled={busy}
                      secondary
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button
                      label="Gallery"
                      onPress={() => void choose(false)}
                      disabled={busy}
                      secondary
                    />
                  </View>
                </View>
              )}
            </>
          )}
          <View style={s.footer}>
            <Text style={s.footerBrand}>
              Small objects. Endless possibilities.
            </Text>
            <Text style={s.disclaimer}>
              An imaginative interpretation, inspired by your photo.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>,
  );
}
