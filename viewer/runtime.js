import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { executeScene } from './sandbox.mjs';

const send = (type, payload = {}) => {
  const message = JSON.stringify({ type, ...payload });
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(message);
  else window.parent.postMessage(message, '*');
};
const finite = (n, fallback = 0, max = 30) => {
  if (n === undefined) return fallback;
  if (typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n) > max)
    throw new Error('Invalid numeric scene value');
  return n;
};
const vector = (a, fallback = [0, 0, 0]) => {
  if (a === undefined) return fallback;
  if (!Array.isArray(a) || a.length !== 3) throw new Error('Expected three coordinates');
  return a.map(n=> finite(n));
};
const color = c => {
  if (typeof c !== 'string' || !/^#[0-9a-f]{6}$/i.test(c))
    throw new Error('Use six-digit hex colors');
  return c;
};
let renderer, camera, controls, world, current, candidate, currentId;
const raycaster = new THREE.Raycaster();
const dispose = s => {
  if (!s) return;
  s.root.traverse(o=> o.geometry?.dispose()); for(const m of s.materials.values()) m.dispose();
};
function makeScene(data) {
  const root = new THREE.Group(), parts= new Map(), materials= new Map(), actions= new Map(), active= new Map();
  const toolkit = {
    material(id, s) {
      if (materials.has(id) || materials.size >= 12)
        throw new Error('Duplicate material or material limit');
      materials.set(
        id,
        new THREE.MeshStandardMaterial({
          color: color(s.color),
          roughness: THREE.MathUtils.clamp(finite(s.roughness,.45), 0, 1),
          metalness: THREE.MathUtils.clamp(finite(s.metalness,.05), 0, 1),
          emissive: s.emissive ? color(s.emissive) : '#000000',
          emissiveIntensity: finite(s.emissiveIntensity, 0, 5)}));
    },
    part(id, s) {
      if (parts.has(id) || parts.size >= 120) throw new Error('Duplicate part or part limit');
      let geometry, object;
      const raw = s.size ?? [1, 1, 1];
      if (!Array.isArray(raw) || raw.length < 1 || raw.length > 3)
        throw new Error('Invalid shape dimensions');
      const a = [finite(raw[0], 1), finite(raw[1], raw[0] ?? 1), finite(raw[2], 1)];
      if ((s.shape === 'cylinder' || s.shape === 'cone') && raw.length === 2) {
        a[1] = a[0];
        a[2] = finite(raw[1]);
      }
      if (a.some(v=> v < 0) || a.every(v=> v === 0)) throw new Error('Invalid geometry size');
      switch (s.shape) {
        case 'group': object= new THREE.Group();
          break;
        case 'box':
          geometry = new THREE.BoxGeometry(...a);
          break;
        case 'sphere':
          geometry = new THREE.SphereGeometry(a[0], 24, 16);
          break;
        case 'cylinder':
          geometry = new THREE.CylinderGeometry(a[0], a[1], a[2], 32, 1, s.openEnded === true);
          break;
        case 'cone':
          geometry = new THREE.ConeGeometry(a[1], a[2], 24);
          break;
        case 'torus':
          geometry = new THREE.TorusGeometry(
            a[0],
            a[1],
            12,
            40,
            finite(s.arc, Math.PI * 2, Math.PI * 2));
          break;
        default:
          throw new Error('Unsupported shape');
      }
      if (!object) {
        if (!materials.has(s.material)) {
          geometry.dispose();
          throw new Error('Missing material');
        }
        object = new THREE.Mesh(geometry, materials.get(s.material));
        object.castShadow = true;
        object.receiveShadow = true;
      }
      object.position.fromArray(vector(s.position));
      object.rotation.set(...vector(s.rotation));
      const scale = vector(s.scale, [1, 1, 1]);
      if (scale.some(v=> v <= 0 || v > 5)) throw new Error('Invalid part scale');
      object.scale.fromArray(scale);
      object.userData.action = s.action;
      object.name = id;
      const parent = s.parent ? parts.get(s.parent) : root;
      if (!parent) throw new Error('Parent must be defined first');
      parent.add(object);
      parts.set(id, object);
    },
    action(id, s) {
      if (actions.has(id) || actions.size >= 6) throw new Error('Duplicate action or action limit');
      if (
        !Array.isArray(s.tracks) ||
        s.tracks.length > 24 ||
        !Array.isArray(s.colors ?? []) ||
        (s.colors ?? []).length > 12
      )
        throw new Error('Invalid action tracks');
      const tracks = s.tracks.map(t=> {
        const part = parts.get(t.part);
        if (!part) throw new Error('Unknown animated part');
        if (!/^(rotation|position|scale)\.[xyz]$|^emissiveIntensity$/.test(t.property))
          throw new Error('Unsupported animated property');
        if (!['sine', 'spin', 'toggle'].includes(t.mode))
          throw new Error('Unsupported animation mode');
        const [key, axis] = t.property.split('.');
        const target = key === 'emissiveIntensity' ? part.material : part[key];
        const prop = axis ?? key;
        if (!target || typeof target[prop] !== 'number') throw new Error('Invalid animated target');
        return {
          ...t,
          target,
          prop,
          base: target[prop],
          value: finite(t.value, 1, 15),
          seconds: Math.max(.15, finite(t.seconds, 2, 30))};
      });
      const colors = (s.colors ?? []).map(c=> {
        if (!materials.has(c.material)) throw new Error('Unknown color material');
        return { ...c, color: color(c.color), alternate: color(c.alternate ?? '#ffffff') };
      });
      actions.set(id, { tracks, colors });
    }
  };
  try {
    executeScene(data.code, toolkit);
    if (!parts.size || !data.actions?.length) throw new Error('Scene is empty');
    if (data.actions.length !== actions.size || data.actions.some(a=> !actions.has(a.id)))
      throw new Error('Action metadata does not match scene');
    for (const p of parts.values())
      if (p.userData.action && !actions.has(p.userData.action))
        throw new Error('Part action does not exist');
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    if (!Number.isFinite(size.length()) || size.length() <.1 || size.length() > 35)
      throw new Error('Scene dimensions are invalid');
    root.position.y -= box.min.y;
    box.setFromObject(root);
    return { root, parts, materials, actions, active, box };
  } catch (e) {
    dispose({ root, materials });
    throw e;
  }
}
function resetView() {
  if (!current) return;
  const center = current.box.getCenter(new THREE.Vector3());
  const size = current.box.getSize(new THREE.Vector3()).length();
  controls.target.copy(center);
  camera.position.copy(center).add(new THREE.Vector3(size *.7, size *.4, size *.95));
  controls.minDistance = size *.35;
  controls.maxDistance = size * 3;
  controls.update();
}
function action(id) {
  const a = current?.actions.get(id);
  if (!a) return;
  const was = current.active.get(id);
  const on = !(was?.on);
  // Remove conflicting property tracks so the latest requested action has control.
  for (const [other, state] of current.active)
    if (other !== id)
      state.tracks = state.tracks.filter(t=> !a.tracks.some(n=> n.target === t.target && n.prop === t.prop));
  current.active.set(id, {
    on,
    start: performance.now() / 1000,
    tracks: a.tracks.map(t=> ({ ...t, from: t.target[t.prop] }))});
  for (const c of a.colors) {
    const m = current.materials.get(c.material);
    m.color.set(on ? c.color : c.alternate);
    if (m.emissiveIntensity > 0) m.emissive.set(on ? c.color : c.alternate);
  }
  send('action', { id, sceneId: currentId });
}
function receive(raw) {
  try {
    if (typeof raw !== 'string' || raw.length > 40000) return;
    const m = JSON.parse(raw);
    if (m.type === 'load' && typeof m.id === 'string') {
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
        current = next;
        currentId = m.id;
        dispose(previous);
        resetView();
        send('loaded', { id: m.id });
      } catch (e) {
        if (next && next !== current) dispose(next);
        send('error', { id: m.id, message: String(e.message).slice(0, 300) });
      }
    } else if (m.type === 'action' && typeof m.id === 'string') action(m.id);
    else if (m.type === 'reset') resetView();
  } catch {
    /* Invalid bridge input has no effect. */
  }
}
try {
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'low-power'});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  document.body.appendChild(renderer.domElement);
  world = new THREE.Scene();
  world.background = new THREE.Color('#152225');
  world.fog = new THREE.Fog('#152225', 20, 50);
  camera = new THREE.PerspectiveCamera(40, 1,.05, 100);
  camera.position.set(5, 4, 7);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.target.set(0, 1.5, 0);
  world.add(new THREE.HemisphereLight('#d9f3ff', '#5a6550', 2.6));
  const light = new THREE.DirectionalLight('#fff0d4', 4);
  light.position.set(4, 7, 5);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  Object.assign(light.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8 });
  light.shadow.bias = -.001;
  world.add(light);
  const rim = new THREE.DirectionalLight('#a7ffe3', 2);
  rim.position.set(-4, 3, -4);
  world.add(rim);
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(30, 64),
    new THREE.MeshStandardMaterial({ color: '#1d3030', roughness:.95 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -.03;
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
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  addEventListener('resize', resize);
  new ResizeObserver(resize).observe(document.documentElement);
  resize();
  let down;
  renderer.domElement.addEventListener('pointerdown',e=> {
    down = { x: e.clientX, y: e.clientY, t: performance.now() };
  });
  renderer.domElement.addEventListener('pointerup',e=> {
    if (
      !down ||
      Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8 ||
      performance.now() - down.t > 450 ||
      !current
    )
      return;
    raycaster.setFromCamera(
      new THREE.Vector2(e.clientX / innerWidth* 2 - 1,-e.clientY / innerHeight* 2 + 1),
      camera);
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
    resize();
    const now = performance.now() / 1000;
    if (current)
      for (const a of current.active.values())
        for (const t of a.tracks) {
          const elapsed = now - a.start;
          let v = t.base;
          if (t.mode === 'toggle') {
            const f = Math.min(elapsed / t.seconds, 1);
            v = THREE.MathUtils.lerp(t.from, t.base + (a.on ? t.value : 0), f * f * (3 - 2 * f));
          } else if (a.on)
            v +=
              t.mode === 'sine'
                ? Math.sin(elapsed / t.seconds* Math.PI * 2) * t.value
                : elapsed * t.value;
          t.target[t.prop] = v;
        }
    controls.update();
    renderer.render(world, camera);
  }
  frame();
  window.InteractiveWorldReceive = receive;
  window.addEventListener('message',e=> {
    if (e.source === window.parent) receive(e.data);
  });
  renderer.domElement.addEventListener('webglcontextlost',e=> {
    e.preventDefault();
    send('fatal', { message: 'Graphics context lost. Reload the viewer.' });
  });
  send('ready');
} catch (e) {
  send('fatal', { message: '3D viewer could not start: ' + String(e.message).slice(0, 180) });
  document.body.innerHTML = '<div id="error">3D graphics are unavailable. Reload the viewer.</div>';
}
