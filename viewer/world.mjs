import * as THREE from "three";
import { makeScene, dispose } from "./model.mjs";
import { worldSchema, validateWorldActions } from "../shared/world.mjs";

// Each saved object keeps its own interpreter, geometry, materials and actions.
export function makeWorld(data) {
  const document = worldSchema.parse(data.world);
  validateWorldActions(document, data.objects);
  const result = {
    root: new THREE.Group(),
    materials: new Map(),
    actions: new Map(),
    active: new Map(),
    members: new Map(),
    box: new THREE.Box3(),
    plan: document.plan,
  };
  let meshes = 0;
  try {
    for (const member of document.members) {
      const source = data.objects.find((o) => o.id === member.objectId);
      if (!source) throw new Error("Saved object is unavailable.");
      const child = makeScene(source.scene);
      // Adopt immediately so a failed world always disposes allocated resources.
      result.root.add(child.root);
      for (const [id, material] of child.materials)
        result.materials.set(member.id + ":" + id, material);
      child.root.traverse((o) => {
        if (o.isMesh) meshes++;
      });
      if (meshes > 240)
        throw new Error(
          "These objects are too detailed together. Remove an object and try again.",
        );
      const size = child.box.getSize(new THREE.Vector3());
      const center = child.box.getCenter(new THREE.Vector3());
      const normalize = 2.5 / Math.max(size.x, size.y, size.z);
      const container = new THREE.Group();
      const normalized = new THREE.Group();
      child.root.position.x -= center.x;
      child.root.position.z -= center.z;
      normalized.add(child.root);
      normalized.scale.setScalar(normalize);
      container.add(normalized);
      container.position.fromArray(member.position);
      container.rotation.y = member.rotation;
      container.scale.setScalar(member.scale);
      container.userData.memberId = member.id;
      result.root.add(container);
      for (const [id, action] of child.actions) {
        result.actions.set(member.id + ":" + id, {
          ...action,
          colors: action.colors.map((c) => ({
            ...c,
            material: member.id + ":" + c.material,
          })),
        });
      }
      child.root.traverse((o) => {
        if (o.userData.action)
          o.userData.action = member.id + ":" + o.userData.action;
      });
      result.members.set(member.id, {
        container,
        baseline: member,
        size: size.multiplyScalar(normalize * member.scale).toArray(),
      });
    }
    result.box.setFromObject(result.root);
    return result;
  } catch (error) {
    dispose(result);
    throw error;
  }
}

export function resetWorld(world) {
  for (const action of world.actions.values()) {
    for (const track of action.tracks) track.target[track.prop] = track.base;
    for (const color of action.colors) {
      const material = world.materials.get(color.material);
      if (material.userData.worldOriginalColor) {
        material.color.copy(material.userData.worldOriginalColor);
        material.emissive.copy(material.userData.worldOriginalEmissive);
      }
    }
  }
  world.active.clear();
  for (const { container, baseline } of world.members.values()) {
    container.position.fromArray(baseline.position);
    container.rotation.y = baseline.rotation;
  }
}

// Sampling from baseline makes replay deterministic, even after skipped frames.
export function sampleWorld(world, elapsed) {
  for (const [id, { container, baseline }] of world.members) {
    let position = [...baseline.position];
    let rotation = baseline.rotation;
    for (const step of [...(world.plan?.steps ?? [])].sort(
      (a, b) => a.at - b.at,
    )) {
      if (step.memberId !== id || elapsed < step.at) continue;
      const progress = Math.min(1, (elapsed - step.at) / step.duration);
      const eased = progress * progress * (3 - 2 * progress);
      if (step.position)
        position = position.map((v, i) => v + (step.position[i] - v) * eased);
      if (step.rotation !== undefined)
        rotation += (step.rotation - rotation) * eased;
    }
    container.position.fromArray(position);
    container.rotation.y = rotation;
  }
}

export function describeWorld(data) {
  const model = makeWorld(data);
  try {
    return data.world.members.map((member) => {
      const scene = data.objects.find((o) => o.id === member.objectId).scene;
      return {
        ...member,
        name: scene.name,
        description: scene.description,
        size: model.members.get(member.id).size,
        actions: scene.actions,
      };
    });
  } finally {
    dispose(model);
  }
}
