import { exportModel } from "./export.mjs";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createSoundPlayer } from "./sounds.mjs";
import { makeScene, dispose } from "./model.mjs";

const send = (type, payload = {}) => {
  const message = JSON.stringify({ type, ...payload });
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(message);
  else window.parent.postMessage(message, "*");
};
let renderer,
  camera,
  controls,
  world,
  current,
  candidate,
  currentId,
  currentData,
  exporting = false,
  dirty = true;
const soundPlayer = createSoundPlayer();
const raycaster = new THREE.Raycaster();
function resetView() {
  if (!current) return;
  const center = current.box.getCenter(new THREE.Vector3());
  const size = current.box.getSize(new THREE.Vector3()).length();
  controls.target.copy(center);
  camera.position
    .copy(center)
    .add(new THREE.Vector3(size * 0.7, size * 0.4, size * 0.95));
  controls.minDistance = size * 0.35;
  controls.maxDistance = size * 3;
  controls.update();
}
function action(id) {
  dirty = true;
  const a = current?.actions.get(id);
  if (!a) return;
  soundPlayer.play(a.sound);
  const was = current.active.get(id);
  const on = !was?.on;
  // Remove conflicting property tracks so the latest requested action has control.
  for (const [other, state] of current.active)
    if (other !== id)
      state.tracks = state.tracks.filter(
        (t) =>
          !a.tracks.some((n) => n.target === t.target && n.prop === t.prop),
      );
  current.active.set(id, {
    on,
    start: performance.now() / 1000,
    tracks: a.tracks.map((t) => ({ ...t, from: t.target[t.prop] })),
  });
  for (const c of a.colors) {
    const m = current.materials.get(c.material);
    m.color.set(on ? c.color : c.alternate);
    if (m.emissiveIntensity > 0) m.emissive.set(on ? c.color : c.alternate);
  }
  send("action", { id, sceneId: currentId });
}
function receive(raw) {
  try {
    if (typeof raw !== "string" || raw.length > 40000) return;
    const m = JSON.parse(raw);
    dirty = true;
    if (m.type === "load" && typeof m.id === "string") {
      let next;
      try {
        next = makeScene(m.scene);
        // Compile and render offscreen before replacing the last good scene.
        const previous = current;
        if (previous) world.remove(previous.root);
        world.add(next.root);
        try {
          renderer.compile(world, camera);
          renderer.render(world, camera);
        } catch (e) {
          world.remove(next.root);
          if (previous) world.add(previous.root);
          throw e;
        }
        soundPlayer.stop();
        current = next;
        currentId = m.id;
        currentData = m.scene;
        dispose(previous);
        resetView();
        send("loaded", { id: m.id });
      } catch (e) {
        if (next && next !== current) dispose(next);
        send("error", { id: m.id, message: String(e.message).slice(0, 300) });
      }
    } else if (
      m.type === "export" &&
      typeof m.id === "string" &&
      m.sceneId === currentId &&
      !exporting
    ) {
      exporting = true;
      let snapshot;
      try {
        snapshot = makeScene(currentData);
        exportModel(snapshot.root)
          .then((data) => send("exported", { id: m.id, data }))
          .catch(() =>
            send("export-error", {
              id: m.id,
              message: "Could not export this model. Try again.",
            }),
          )
          .finally(() => {
            dispose(snapshot);
            exporting = false;
          });
      } catch {
        dispose(snapshot);
        exporting = false;
        send("export-error", {
          id: m.id,
          message: "Could not prepare the model for export.",
        });
      }
    } else if (m.type === "action" && typeof m.id === "string") action(m.id);
    else if (m.type === "mute" && typeof m.muted === "boolean")
      soundPlayer.mute(m.muted);
    else if (m.type === "reset") resetView();
    else if (m.type === "theme" && typeof m.dark === "boolean") {
      const bg = m.dark ? "#152225" : "#edf3e9";
      world.background.set(bg);
      world.fog.color.set(bg);
      world
        .getObjectByName("studioFloor")
        .material.color.set(m.dark ? "#1d3030" : "#dde8d4");
      document.body.style.background = bg;
    }
  } catch {
    /* Invalid bridge input has no effect. */
  }
}
try {
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  document.body.appendChild(renderer.domElement);
  world = new THREE.Scene();
  world.background = new THREE.Color("#152225");
  world.fog = new THREE.Fog("#152225", 20, 50);
  camera = new THREE.PerspectiveCamera(40, 1, 0.05, 100);
  camera.position.set(5, 4, 7);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.addEventListener("change", () => {
    dirty = true;
  });
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.target.set(0, 1.5, 0);
  world.add(new THREE.HemisphereLight("#d9f3ff", "#5a6550", 2.6));
  const light = new THREE.DirectionalLight("#fff0d4", 4);
  light.position.set(4, 7, 5);
  light.castShadow = true;
  light.shadow.mapSize.set(512, 512);
  Object.assign(light.shadow.camera, {
    left: -8,
    right: 8,
    top: 8,
    bottom: -8,
  });
  light.shadow.bias = -0.001;
  world.add(light);
  const rim = new THREE.DirectionalLight("#a7ffe3", 2);
  rim.position.set(-4, 3, -4);
  world.add(rim);
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(30, 64),
    new THREE.MeshStandardMaterial({ color: "#1d3030", roughness: 0.95 }),
  );
  floor.name = "studioFloor";
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.03;
  floor.receiveShadow = true;
  world.add(floor);
  let width = 0,
    height = 0;
  const resize = () => {
    const w = Math.max(1, innerWidth),
      h = Math.max(1, innerHeight);
    if (w === width && h === height) return;
    width = w;
    height = h;
    dirty = true;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  addEventListener("resize", resize);
  new ResizeObserver(resize).observe(document.documentElement);
  resize();
  let down;
  renderer.domElement.addEventListener("pointerdown", (e) => {
    soundPlayer.unlock();
    down = { x: e.clientX, y: e.clientY, t: performance.now() };
  });
  renderer.domElement.addEventListener("pointerup", (e) => {
    if (
      !down ||
      Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8 ||
      performance.now() - down.t > 450 ||
      !current
    )
      return;
    raycaster.setFromCamera(
      new THREE.Vector2(
        (e.clientX / innerWidth) * 2 - 1,
        (-e.clientY / innerHeight) * 2 + 1,
      ),
      camera,
    );
    const hit = raycaster.intersectObject(current.root, true)[0];
    let o = hit?.object;
    while (o) {
      if (o.userData.action) {
        action(o.userData.action);
        break;
      }
      o = o.parent;
    }
  });
  function frame() {
    requestAnimationFrame(frame);
    if (document.hidden) return;
    resize();
    const now = performance.now() / 1000;
    if (current)
      for (const a of current.active.values())
        for (const t of a.tracks) {
          const elapsed = now - a.start;
          let v = t.base;
          if (t.mode === "toggle") {
            const f = Math.min(elapsed / t.seconds, 1);
            v = THREE.MathUtils.lerp(
              t.from,
              t.base + (a.on ? t.value : 0),
              f * f * (3 - 2 * f),
            );
          } else if (a.on)
            v +=
              t.mode === "sine"
                ? Math.sin((elapsed / t.seconds) * Math.PI * 2) * t.value
                : elapsed * t.value;
          if (t.target[t.prop] !== v) dirty = true;
          t.target[t.prop] = v;
        }
    controls.update();
    const moving =
      current &&
      Array.from(current.active.values()).some((a) =>
        a.tracks.some((t) =>
          t.mode === "toggle" ? now - a.start < t.seconds : a.on,
        ),
      );
    if (dirty || moving) {
      renderer.render(world, camera);
      dirty = false;
    }
  }
  frame();
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) soundPlayer.stop();
    else dirty = true;
  });
  window.addEventListener("pagehide", () => soundPlayer.stop());
  window.InteractiveWorldReceive = receive;
  window.addEventListener("message", (e) => {
    if (e.source === window.parent) receive(e.data);
  });
  renderer.domElement.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    send("fatal", { message: "Graphics context lost. Reload the viewer." });
  });
  send("ready");
} catch (e) {
  send("fatal", {
    message: "3D viewer could not start: " + String(e.message).slice(0, 180),
  });
  document.body.innerHTML =
    '<div id="error">3D graphics are unavailable. Reload the viewer.</div>';
}
