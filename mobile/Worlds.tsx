import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as Crypto from "expo-crypto";
import { AccountSession } from "./Account";
import { useTheme } from "./theme";
import SceneViewer from "./SceneViewer";
import {
  Scene,
  ViewerMessage,
  ViewerProps,
  WorldDocument,
  WorldMember,
  WorldScene,
} from "./types";

type WorldEntry = { id: string; name: string; updatedAt: number };
type ObjectEntry = { id: string; name: string; description: string };
type WorldData = {
  id?: string;
  world: WorldDocument;
  objects: WorldScene["objects"];
};
type Request = (
  path: string,
  body?: unknown,
  signal?: AbortSignal,
) => Promise<any>;

function Button({
  label,
  onPress,
  disabled = false,
  secondary = false,
  selected = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  selected?: boolean;
}) {
  const { s, dark } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        s.button,
        secondary && s.secondary,
        selected && { borderColor: "#78a957", borderWidth: 2 },
        { opacity: disabled ? 0.4 : pressed ? 0.7 : 1, paddingVertical: 12 },
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

function Collection({
  kind,
  request,
  onPick,
}: {
  kind: "objects" | "worlds";
  request: Request;
  onPick: (id: string) => void;
}) {
  const { s } = useTheme();
  const [page, setPage] = useState(0);
  const [next, setNext] = useState<number | null>(null);
  const [items, setItems] = useState<(ObjectEntry & WorldEntry)[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    setLoading(true);
    setError("");
    request(`/${kind}?offset=${page}`, undefined, controller.signal)
      .then((data) => {
        if (alive) {
          setItems(data[kind]);
          setNext(data.nextOffset);
        }
      })
      .catch(() => {
        if (alive)
          setError("Could not load your collection. Please try again.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [page, retry, request, kind]);
  if (loading)
    return <ActivityIndicator accessibilityLabel="Loading collection" />;
  if (error)
    return (
      <View style={s.error}>
        <Text style={s.errorText}>{error}</Text>
        <Button label="Try again" onPress={() => setRetry((v) => v + 1)} />
      </View>
    );
  return (
    <View style={{ gap: 12 }}>
      {!items.length && (
        <View style={s.card}>
          <Text style={s.cardTitle}>
            {kind === "objects"
              ? "Save your first object"
              : "Your next little world starts here"}
          </Text>
          <Text style={s.muted}>
            {kind === "objects"
              ? "Go back to the app, scan an object and tap Save. Only your saved objects can join a world."
              : "Bring a few objects from your collection together, and give them a story."}
          </Text>
        </View>
      )}
      {items.map((item) => (
        <Pressable
          key={item.id}
          accessibilityRole="button"
          accessibilityLabel={
            (kind === "objects" ? "Add " : "Open ") + item.name
          }
          onPress={() => onPick(item.id)}
          style={s.card}
        >
          <Text style={s.cardTitle}>{item.name}</Text>
          <Text numberOfLines={2} style={s.muted}>
            {kind === "objects"
              ? item.description
              : "Updated " + new Date(item.updatedAt).toLocaleDateString()}
          </Text>
          <Text style={s.link}>
            {kind === "objects" ? "+ Add to world" : "Open world →"}
          </Text>
        </Pressable>
      ))}
      <View style={s.actions}>
        {page > 0 && (
          <Button
            label="Previous page"
            secondary
            onPress={() => setPage(Math.max(0, page - 20))}
          />
        )}
        {next !== null && (
          <Button label="Next page" secondary onPress={() => setPage(next)} />
        )}
      </View>
    </View>
  );
}

export default function Worlds({
  account,
  onBack,
  onExpired,
}: {
  account: AccountSession;
  onBack: () => void;
  onExpired: () => void;
}) {
  const { s, dark } = useTheme();
  const [editing, setEditing] = useState<WorldData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const opening = useRef(false);
  const expired = useRef(onExpired);
  expired.current = onExpired;
  const request = useMemo<Request>(
    () => async (path, body, signal) => {
      const controller = new AbortController();
      const abort = () => controller.abort();
      if (signal?.aborted) abort();
      signal?.addEventListener("abort", abort);
      const timeout = setTimeout(
        abort,
        path === "/worlds/animate" ? 110000 : 15000,
      );
      try {
        const response = await fetch(account.endpoint + path, {
          method: body === undefined ? "GET" : "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + account.token,
          },
          signal: controller.signal,
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        if (response.status === 401) {
          expired.current();
          throw new Error("Please sign in again.");
        }
        const data = await response.json();
        if (!response.ok)
          throw new Error(
            data.error ?? "Something went wrong. Please try again.",
          );
        return data;
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", abort);
      }
    },
    [account.endpoint, account.token],
  );
  async function open(id: string) {
    if (opening.current) return;
    opening.current = true;
    setLoading(true);
    setError("");
    try {
      setEditing(await request("/worlds/" + id));
    } catch {
      setError("Could not open this world. Tap it again to retry.");
    } finally {
      opening.current = false;
      setLoading(false);
    }
  }
  if (editing)
    return (
      <WorldEditor
        initial={editing}
        request={request}
        onBack={() => setEditing(null)}
      />
    );
  return (
    <SafeAreaView style={s.safe}>
      <StatusBar style={dark ? "light" : "dark"} />
      <ScrollView contentContainerStyle={s.page}>
        <View style={s.row}>
          <Text style={s.brand}>InteractiveWorld</Text>
          <Button
            label="Back to app"
            secondary
            onPress={onBack}
            disabled={loading}
          />
        </View>
        <View style={s.hero}>
          <Text style={s.eyebrow}>BRING THEM TOGETHER</Text>
          <Text style={s.title}>My worlds</Text>
          <Text style={s.subtitle}>
            Your objects. A shared stage. See what happens when they meet.
          </Text>
        </View>
        <Button
          label="+ Create a world"
          disabled={loading}
          onPress={() =>
            setEditing({
              world: { name: "My little world", members: [], plan: null },
              objects: [],
            })
          }
        />
        {loading && <ActivityIndicator />}
        {!!error && <Text style={s.errorText}>{error}</Text>}
        <Collection
          kind="worlds"
          request={request}
          onPick={(id) => void open(id)}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function WorldEditor({
  initial,
  request,
  onBack,
}: {
  initial: WorldData;
  request: Request;
  onBack: () => void;
}) {
  const { s, dark } = useTheme();
  const [document, setDocument] = useState(initial.world);
  const [objects, setObjects] = useState(initial.objects);
  const [worldId, setWorldId] = useState(initial.id);
  const [selected, setSelected] = useState(initial.world.members[0]?.id ?? "");
  const [picker, setPicker] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [retry, setRetry] = useState<(() => void) | null>(null);
  const [ready, setReady] = useState(false);
  const [viewerError, setViewerError] = useState("");
  const [viewerKey, setViewerKey] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [touching, setTouching] = useState(false);
  const [command, setCommand] = useState<ViewerProps["command"]>(null);
  const lock = useRef(false);
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const mounted = useRef(true);
  const viewerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const scene = useMemo<WorldScene>(
    () => ({
      kind: "world",
      world: { name: "World", members: document.members, plan: document.plan },
      objects: objects.filter((o) =>
        document.members.some((m) => m.objectId === o.id),
      ),
    }),
    [document.members, document.plan, objects],
  );
  const sceneId = useMemo(() => Crypto.randomUUID(), [scene, viewerKey]);
  const selectedMember = document.members.find((m) => m.id === selected);
  const selectedScene = objects.find(
    (o) => o.id === selectedMember?.objectId,
  )?.scene;
  const disabled = !!busy || playing;
  function send(
    type: NonNullable<ViewerProps["command"]>["type"],
    id?: string,
  ) {
    setCommand({ type, id, serial: Date.now(), sceneId });
  }
  function leave() {
    if (lock.current || playing) return;
    if (dirty) setLeaving(true);
    else onBack();
  }
  useEffect(() => {
    const handler = BackHandler.addEventListener("hardwareBackPress", () => {
      leave();
      return true;
    });
    return () => handler.remove();
  }, [dirty, playing]);
  useEffect(() => {
    setReady(false);
    setViewerError("");
    setPlaying(false);
    if (!document.members.length) return;
    viewerTimer.current = setTimeout(
      () =>
        setViewerError(
          "The world took too long to load. Try reloading the viewer.",
        ),
      20000,
    );
    return () => {
      if (viewerTimer.current) clearTimeout(viewerTimer.current);
    };
  }, [sceneId]);
  // A separate deadline is cleared as soon as the viewer acknowledges the scene.
  useEffect(() => {
    if (!ready) return;
    if (viewerTimer.current) clearTimeout(viewerTimer.current);
    setViewerError("");
  }, [ready]);
  async function run(
    label: string,
    operation: () => Promise<void>,
    again: () => void,
  ) {
    if (lock.current) return;
    lock.current = true;
    setBusy(label);
    setError("");
    setStatus("");
    setRetry(null);
    try {
      await operation();
    } catch (e) {
      if (mounted.current) {
        const message = e instanceof Error ? e.message : "";
        setError(
          /fetch|network|abort|timeout/i.test(message)
            ? "Could not reach the service. Your world is still here. Please try again."
            : message || "Something went wrong. Please try again.",
        );
        setRetry(() => again);
      }
    } finally {
      lock.current = false;
      if (mounted.current) setBusy("");
    }
  }
  function change(next: WorldDocument, resetPlan = false) {
    setDocument({ ...next, plan: resetPlan ? null : next.plan });
    setDirty(true);
    setStatus("");
    setError("");
    setRetry(null);
    setCommand(null);
    if (resetPlan && document.plan)
      setStatus(
        "Layout changed. Create a new interaction for this arrangement.",
      );
  }
  function add(id: string) {
    if (document.members.length >= 4) return;
    void run(
      "Adding your object…",
      async () => {
        const data = await request("/objects/" + id);
        if (!mounted.current) return;
        const member: WorldMember = {
          id: Crypto.randomUUID(),
          objectId: id,
          position: [
            [-1.8, 0, 0],
            [1.8, 0, 0],
            [-1.8, 0, 3.5],
            [1.8, 0, 3.5],
          ][document.members.length] as [number, number, number],
          rotation: 0,
          scale: 1,
        };
        setObjects((previous) =>
          previous.some((o) => o.id === id)
            ? previous
            : [...previous, { id, scene: data.scene as Scene }],
        );
        change({ ...document, members: [...document.members, member] }, true);
        setSelected(member.id);
        setPicker(false);
      },
      () => add(id),
    );
  }
  function transform(values: Partial<WorldMember>) {
    if (!selectedMember || disabled) return;
    change(
      {
        ...document,
        members: document.members.map((m) =>
          m.id === selected ? { ...m, ...values } : m,
        ),
      },
      true,
    );
  }
  function move(axis: 0 | 1 | 2, delta: number) {
    if (!selectedMember) return;
    const p = [...selectedMember.position] as [number, number, number];
    p[axis] = Math.max(axis === 1 ? 0 : -8, Math.min(8, p[axis] + delta));
    transform({ position: p });
  }
  function save(andLeave = false) {
    if (!document.members.length || !ready) return;
    void run(
      "Saving your world…",
      async () => {
        const data = await request("/worlds", {
          ...(worldId ? { id: worldId } : {}),
          world: document,
        });
        if (!mounted.current) return;
        setWorldId(data.id);
        setDirty(false);
        setStatus("Saved to My worlds.");
        if (andLeave) onBack();
      },
      () => save(andLeave),
    );
  }
  function animate() {
    if (!prompt.trim() || !ready) return;
    const requestId = Crypto.randomUUID();
    const attempt = () => {
      void run(
        "Bringing them together…",
        async () => {
          const data = await request("/worlds/animate", {
            world: document,
            prompt: prompt.trim(),
            requestId,
          });
          if (!mounted.current) return;
          change({ ...document, plan: data.plan });
          setStatus("Your interaction is ready. Press Play to watch.");
          scroll.current?.scrollTo({ y: 0, animated: false });
        },
        attempt,
      );
    };
    attempt();
  }
  function message(m: ViewerMessage) {
    if (m.type === "loaded" && m.id === sceneId) {
      if (viewerTimer.current) clearTimeout(viewerTimer.current);
      setReady(true);
      setViewerError("");
      if (selected) send("select", selected);
    }
    if ((m.type === "error" && m.id === sceneId) || m.type === "fatal") {
      setReady(false);
      setPlaying(false);
      setViewerError(m.message ?? "The world could not load. Try again.");
    }
    if (m.type === "selected" && m.id) setSelected(m.id);
    if (m.id === sceneId && m.type === "playing") setPlaying(true);
    if (m.id === sceneId && (m.type === "stopped" || m.type === "finished"))
      setPlaying(false);
  }
  return (
    <SafeAreaView style={s.safe}>
      <StatusBar style={dark ? "light" : "dark"} />
      <ScrollView
        ref={scroll}
        contentContainerStyle={s.page}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={!touching}
      >
        <View style={s.row}>
          <Button
            label="← My worlds"
            secondary
            disabled={disabled}
            onPress={leave}
          />
          <Button
            label={dirty || !worldId ? "Save world" : "Saved"}
            disabled={disabled || !ready || !document.name.trim()}
            onPress={() => save()}
          />
        </View>
        {leaving && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Keep your changes?</Text>
            <Text style={s.muted}>
              Save this world so you can come back to it.
            </Text>
            <Button
              label="Save and leave"
              onPress={() => save(true)}
              disabled={disabled || !ready || !document.name.trim()}
            />
            <Button
              label="Keep editing"
              secondary
              onPress={() => setLeaving(false)}
              disabled={disabled}
            />
            <Button
              label="Discard changes"
              secondary
              onPress={onBack}
              disabled={disabled}
            />
          </View>
        )}
        <Text style={s.eyebrow}>BRING THEM TOGETHER</Text>
        <TextInput
          accessibilityLabel="World name"
          value={document.name}
          maxLength={80}
          editable={!disabled}
          onChangeText={(name) => change({ ...document, name })}
          style={[s.input, { fontSize: 24, fontWeight: "600" }]}
        />
        {!document.members.length ? (
          <View style={s.captureCard}>
            <Text style={[s.spark, { fontSize: 54 }]}>✦</Text>
            <Text style={s.cardTitle}>A shared stage for your objects</Text>
            <Text style={[s.muted, { textAlign: "center" }]}>
              Start with something from your collection. Add a companion,
              arrange them, then imagine what happens next.
            </Text>
            <Button
              label="Add your first object"
              onPress={() => setPicker(true)}
            />
          </View>
        ) : (
          <View style={s.viewerCard}>
            <View
              style={[s.viewer, { height: 330 }]}
              onTouchStart={() => setTouching(true)}
              onTouchEnd={() => setTouching(false)}
              onTouchCancel={() => setTouching(false)}
            >
              <SceneViewer
                key={viewerKey}
                scene={scene}
                sceneId={sceneId}
                dark={dark}
                muted={muted}
                command={command}
                onMessage={message}
              />
            </View>
            {document.plan && (
              <View style={{ padding: 12 }}>
                <View style={s.actions}>
                  <Button
                    label={playing ? "Playing…" : "Play / Replay"}
                    disabled={disabled || !ready}
                    onPress={() => {
                      scroll.current?.scrollTo({ y: 0, animated: false });
                      setPlaying(true);
                      send("world-play");
                    }}
                  />
                  <Button
                    label="Reset to start"
                    secondary
                    disabled={!!busy || !ready}
                    onPress={() => send("world-stop")}
                  />
                </View>
              </View>
            )}
            <View style={[s.viewerFooter, { flexWrap: "wrap", gap: 10 }]}>
              <Text style={s.small}>
                {playing
                  ? "Your story is playing…"
                  : "Drag to orbit · pinch to zoom · tap to select"}
              </Text>
              <View style={s.actions}>
                <Button
                  label="Center view"
                  secondary
                  onPress={() => send("reset")}
                  disabled={!ready}
                />
                <Button
                  label={muted ? "Sound off" : "Sound on"}
                  secondary
                  onPress={() => setMuted((v) => !v)}
                />
              </View>
            </View>
          </View>
        )}
        {document.plan && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Your little story</Text>
            <Text style={s.muted}>{document.plan.summary}</Text>
          </View>
        )}
        {!!viewerError && (
          <View style={s.error}>
            <Text style={s.errorTitle}>This world couldn’t load</Text>
            <Text style={s.errorText}>{viewerError}</Text>
            <Button
              label="Try again"
              onPress={() => setViewerKey((k) => k + 1)}
            />
            <Text style={s.small}>
              You can also remove an object below if the world is too detailed.
            </Text>
          </View>
        )}
        {!!busy && (
          <View style={s.progress}>
            <ActivityIndicator />
            <Text style={s.progressText}>{busy}</Text>
          </View>
        )}
        {!!error && (
          <View style={s.error}>
            <Text style={s.errorTitle}>Something went wrong</Text>
            <Text accessibilityLiveRegion="polite" style={s.errorText}>
              {error}
            </Text>
            {retry && (
              <Button label="Try again" disabled={disabled} onPress={retry} />
            )}
          </View>
        )}
        {!!status && (
          <Text accessibilityLiveRegion="polite" style={s.muted}>
            {status}
          </Text>
        )}
        <View style={s.sectionRow}>
          <Text style={s.cardTitle}>
            1. Your cast · {document.members.length}/4
          </Text>
          <Button
            label="+ Add object"
            secondary
            disabled={disabled || document.members.length >= 4}
            onPress={() => setPicker(true)}
          />
        </View>
        <Text style={s.small}>
          Only objects saved in your account can join. Each one keeps its
          original design.
        </Text>
        <View style={s.actions}>
          {document.members.map((member, index) => (
            <Button
              key={member.id}
              label={`${index + 1}. ${objects.find((o) => o.id === member.objectId)?.scene.name ?? "Object"}`}
              secondary
              selected={selected === member.id}
              disabled={disabled}
              onPress={() => {
                setSelected(member.id);
                send("select", member.id);
              }}
            />
          ))}
        </View>
        {selectedMember && (
          <View style={s.card}>
            <Text style={s.cardTitle}>2. Arrange · {selectedScene?.name}</Text>
            <Text style={s.small}>
              Moves follow the world’s axes. Changing the layout clears its
              interaction.
            </Text>
            <View style={s.actions}>
              {(
                ["Left", "Right", "Forward", "Back", "Up", "Down"] as const
              ).map((label, i) => (
                <Button
                  key={label}
                  label={label}
                  secondary
                  disabled={disabled}
                  onPress={() =>
                    move(
                      i < 2 ? 0 : i < 4 ? 2 : 1,
                      i % 2 === 0
                        ? i === 4
                          ? 0.5
                          : -0.5
                        : i === 5
                          ? -0.5
                          : 0.5,
                    )
                  }
                />
              ))}
            </View>
            <View style={s.actions}>
              <Button
                label="Turn left"
                secondary
                disabled={disabled}
                onPress={() =>
                  transform({
                    rotation:
                      (selectedMember.rotation - Math.PI / 4) % (Math.PI * 2),
                  })
                }
              />
              <Button
                label="Turn right"
                secondary
                disabled={disabled}
                onPress={() =>
                  transform({
                    rotation:
                      (selectedMember.rotation + Math.PI / 4) % (Math.PI * 2),
                  })
                }
              />
              <Button
                label="Smaller"
                secondary
                disabled={disabled || selectedMember.scale <= 0.3}
                onPress={() =>
                  transform({
                    scale: Math.max(
                      0.3,
                      +(selectedMember.scale - 0.1).toFixed(1),
                    ),
                  })
                }
              />
              <Button
                label="Bigger"
                secondary
                disabled={disabled || selectedMember.scale >= 2}
                onPress={() =>
                  transform({
                    scale: Math.min(
                      2,
                      +(selectedMember.scale + 0.1).toFixed(1),
                    ),
                  })
                }
              />
            </View>
            <Text style={s.small}>
              Size {Math.round(selectedMember.scale * 100)}% · Height{" "}
              {selectedMember.position[1].toFixed(1)}
            </Text>
            {!!selectedScene && (
              <View style={s.actions}>
                {selectedScene.actions.map((a) => (
                  <Button
                    key={a.id}
                    label={a.label}
                    secondary
                    disabled={disabled || !ready}
                    onPress={() => send("action", selected + ":" + a.id)}
                  />
                ))}
              </View>
            )}
            <Button
              label="Remove from world"
              secondary
              disabled={disabled}
              onPress={() => {
                const members = document.members.filter(
                  (m) => m.id !== selected,
                );
                change({ ...document, members }, true);
                setSelected(members[0]?.id ?? "");
              }}
            />
          </View>
        )}
        {!!document.members.length && (
          <View style={s.card}>
            <Text style={s.cardTitle}>3. What happens when they meet?</Text>
            <Text style={s.muted}>
              Describe a little story. They can move together, jump, turn and
              use their own actions.
            </Text>
            <TextInput
              accessibilityLabel="Describe the interaction"
              value={prompt}
              onChangeText={setPrompt}
              editable={!disabled}
              multiline
              maxLength={700}
              style={[s.input, { minHeight: 90, textAlignVertical: "top" }]}
              placeholder="Make them gather in a circle, then take turns showing off."
              placeholderTextColor={dark ? "#9fb6ae" : "#65776b"}
            />
            <View style={s.actions}>
              {[
                "Have them greet each other",
                "Make one jump onto the other",
              ].map((idea) => (
                <Button
                  key={idea}
                  label={idea}
                  secondary
                  disabled={disabled}
                  onPress={() => setPrompt(idea)}
                />
              ))}
            </View>
            <Button
              label={
                document.plan
                  ? "Create a new interaction"
                  : "Bring them together"
              }
              disabled={disabled || !ready || !prompt.trim()}
              onPress={animate}
            />
            <Text style={s.small}>
              A short animated interpretation. Shapes stay intact; movements are
              stylized.
            </Text>
          </View>
        )}
      </ScrollView>
      <Modal
        visible={picker}
        animationType="slide"
        onRequestClose={() => {
          if (!busy) setPicker(false);
        }}
      >
        <SafeAreaView style={s.safe}>
          <ScrollView contentContainerStyle={s.page}>
            <View style={s.row}>
              <Text style={s.objectTitle}>Your saved objects</Text>
              <Button
                label="Done"
                secondary
                disabled={!!busy}
                onPress={() => setPicker(false)}
              />
            </View>
            <Text style={s.muted}>
              Choose a character for your world. You can add the same object
              more than once.
            </Text>
            {!!busy && <ActivityIndicator />}
            {!!error && (
              <View style={s.error}>
                <Text style={s.errorText}>{error}</Text>
                {retry && (
                  <Button label="Try again" disabled={!!busy} onPress={retry} />
                )}
              </View>
            )}
            <Collection kind="objects" request={request} onPick={add} />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
