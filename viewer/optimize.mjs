import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export function sceneStats(root) {
  let meshes = 0,
    triangles = 0;
  root.traverse((object) => {
    if (!object.isMesh) return;
    meshes++;
    triangles +=
      (object.geometry.index?.count ??
        object.geometry.attributes.position.count) / 3;
  });
  return { meshes, triangles };
}

// Batch only stationary siblings with identical material and click behavior.
// Their parent may still move: all geometry stays in that parent's coordinates.
export function optimizeScene(scene) {
  const before = sceneStats(scene.root);
  const animated = new Set();
  for (const action of scene.actions.values()) {
    for (const track of action.tracks) animated.add(track.target);
  }
  const parents = [];
  scene.root.traverse((parent) => {
    if (parent.children.length > 1) parents.push(parent);
  });
  for (const parent of parents) {
    const buckets = new Map();
    for (const mesh of parent.children) {
      if (
        !mesh.isMesh ||
        mesh.children.length ||
        animated.has(mesh.position) ||
        animated.has(mesh.rotation) ||
        animated.has(mesh.scale)
      )
        continue;
      const key = [
        mesh.material.uuid,
        mesh.userData.action ?? "",
        mesh.castShadow,
        mesh.receiveShadow,
      ].join("|");
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(mesh);
    }
    for (const meshes of buckets.values()) {
      if (meshes.length < 2) continue;
      const geometries = meshes.map((mesh) => {
        mesh.updateMatrix();
        return mesh.geometry.clone().applyMatrix4(mesh.matrix);
      });
      let merged;
      try {
        merged = mergeGeometries(geometries, false);
      } finally {
        for (const geometry of geometries) geometry.dispose();
      }
      if (!merged) continue;
      const batch = new THREE.Mesh(merged, meshes[0].material);
      batch.userData.action = meshes[0].userData.action;
      batch.castShadow = meshes[0].castShadow;
      batch.receiveShadow = meshes[0].receiveShadow;
      batch.name = "Static parts";
      parent.add(batch);
      for (const mesh of meshes) {
        parent.remove(mesh);
        mesh.geometry.dispose();
      }
    }
  }
  return { before, after: sceneStats(scene.root) };
}
