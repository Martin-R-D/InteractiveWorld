import * as THREE from "three";
import { executeScene } from "./sandbox.mjs";

const finite = (n, fallback = 0, max = 30) => {
  if (n === undefined) return fallback;
  if (typeof n !== "number" || !Number.isFinite(n) || Math.abs(n) > max)
    throw new Error("Invalid numeric scene value");
  return n;
};
const vector = (a, fallback = [0, 0, 0]) => {
  if (a === undefined) return fallback;
  if (!Array.isArray(a) || a.length !== 3)
    throw new Error("Expected three coordinates");
  return a.map((n) => finite(n));
};
const color = (c) => {
  if (typeof c !== "string" || !/^#[0-9a-f]{6}$/i.test(c))
    throw new Error("Use six-digit hex colors");
  return c;
};
export const dispose = (s) => {
  if (!s) return;
  s.root.traverse((o) => o.geometry?.dispose());
  for (const m of s.materials.values()) m.dispose();
};
export function makeScene(data) {
  const root = new THREE.Group(),
    parts = new Map(),
    materials = new Map(),
    actions = new Map(),
    active = new Map();
  const toolkit = {
    material(id, s) {
      if (materials.has(id) || materials.size >= 12)
        throw new Error("Duplicate material or material limit");
      materials.set(
        id,
        new THREE.MeshStandardMaterial({
          color: color(s.color),
          roughness: THREE.MathUtils.clamp(finite(s.roughness, 0.45), 0, 1),
          metalness: THREE.MathUtils.clamp(finite(s.metalness, 0.05), 0, 1),
          emissive: s.emissive ? color(s.emissive) : "#000000",
          emissiveIntensity: finite(s.emissiveIntensity, 0, 5),
        }),
      );
    },
    part(id, s) {
      if (parts.has(id) || parts.size >= 120)
        throw new Error("Duplicate part or part limit");
      let geometry, object;
      const raw = s.size ?? [1, 1, 1];
      if (!Array.isArray(raw) || raw.length < 1 || raw.length > 3)
        throw new Error("Invalid shape dimensions");
      const a = [
        finite(raw[0], 1),
        finite(raw[1], raw[0] ?? 1),
        finite(raw[2], 1),
      ];
      if ((s.shape === "cylinder" || s.shape === "cone") && raw.length === 2) {
        a[1] = a[0];
        a[2] = finite(raw[1]);
      }
      if (a.some((v) => v < 0) || a.every((v) => v === 0))
        throw new Error("Invalid geometry size");
      switch (s.shape) {
        case "group":
          object = new THREE.Group();
          break;
        case "box":
          geometry = new THREE.BoxGeometry(...a);
          break;
        case "sphere":
          geometry = new THREE.SphereGeometry(a[0], 16, 12);
          break;
        case "cylinder":
          geometry = new THREE.CylinderGeometry(
            a[0],
            a[1],
            a[2],
            20,
            1,
            s.openEnded === true,
          );
          break;
        case "cone":
          geometry = new THREE.ConeGeometry(a[1], a[2], 20);
          break;
        case "torus":
          geometry = new THREE.TorusGeometry(
            a[0],
            a[1],
            8,
            24,
            finite(s.arc, Math.PI * 2, Math.PI * 2),
          );
          break;
        default:
          throw new Error("Unsupported shape");
      }
      if (!object) {
        if (!materials.has(s.material)) {
          geometry.dispose();
          throw new Error("Missing material");
        }
        object = new THREE.Mesh(geometry, materials.get(s.material));
        object.castShadow = true;
        object.receiveShadow = true;
      }
      object.position.fromArray(vector(s.position));
      object.rotation.set(...vector(s.rotation));
      const scale = vector(s.scale, [1, 1, 1]);
      if (scale.some((v) => v <= 0 || v > 5))
        throw new Error("Invalid part scale");
      object.scale.fromArray(scale);
      object.userData.action = s.action;
      object.name = id;
      const parent = s.parent ? parts.get(s.parent) : root;
      if (!parent) throw new Error("Parent must be defined first");
      parent.add(object);
      parts.set(id, object);
    },
    action(id, s) {
      if (actions.has(id) || actions.size >= 6)
        throw new Error("Duplicate action or action limit");
      if (
        !Array.isArray(s.tracks) ||
        s.tracks.length > 24 ||
        !Array.isArray(s.colors ?? []) ||
        (s.colors ?? []).length > 12
      )
        throw new Error("Invalid action tracks");
      const tracks = s.tracks.map((t) => {
        const part = parts.get(t.part);
        if (!part) throw new Error("Unknown animated part");
        if (
          !/^(rotation|position|scale)\.[xyz]$|^emissiveIntensity$/.test(
            t.property,
          )
        )
          throw new Error("Unsupported animated property");
        if (!["sine", "spin", "toggle"].includes(t.mode))
          throw new Error("Unsupported animation mode");
        const [key, axis] = t.property.split(".");
        const target = key === "emissiveIntensity" ? part.material : part[key];
        const prop = axis ?? key;
        if (!target || typeof target[prop] !== "number")
          throw new Error("Invalid animated target");
        return {
          ...t,
          target,
          prop,
          base: target[prop],
          value: finite(t.value, 1, 15),
          seconds: Math.max(0.15, finite(t.seconds, 2, 30)),
        };
      });
      const colors = (s.colors ?? []).map((c) => {
        if (!materials.has(c.material))
          throw new Error("Unknown color material");
        return {
          ...c,
          color: color(c.color),
          alternate: color(c.alternate ?? "#ffffff"),
        };
      });
      actions.set(id, { tracks, colors });
    },
  };
  try {
    const declarations = new Map();
    executeScene(data.code, {
      ...toolkit,
      action(id, spec) {
        if (declarations.has(id) || declarations.size >= 6)
          throw new Error("Duplicate action or action limit");
        declarations.set(id, spec);
      },
    });
    for (const [id, spec] of declarations) toolkit.action(id, spec);
    if (!parts.size || !data.actions?.length) throw new Error("Scene is empty");
    if (
      data.actions.length !== actions.size ||
      data.actions.some((a) => !actions.has(a.id))
    )
      throw new Error("Action metadata does not match scene");
    for (const p of parts.values())
      if (p.userData.action && !actions.has(p.userData.action))
        throw new Error("Part action does not exist");
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    if (
      !Number.isFinite(size.length()) ||
      size.length() < 0.1 ||
      size.length() > 35
    )
      throw new Error("Scene dimensions are invalid");
    root.position.y -= box.min.y;
    box.setFromObject(root);
    for (const meta of data.actions) actions.get(meta.id).sound = meta.sound;
    return { root, parts, materials, actions, active, box };
  } catch (e) {
    dispose({ root, materials });
    throw e;
  }
}
