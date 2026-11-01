import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { makeScene, dispose } from "../viewer/model.mjs";
import { optimizeScene, sceneStats } from "../viewer/optimize.mjs";

const fixture = {
  kind: "scene",
  name: "Performance fixture",
  description: "Repeated details and an articulated group.",
  code: `api.material('m',{color:'#44aa88'});
    api.part('pivot',{shape:'group'});
    for(var i=0;i<30;i++)api.part('detail'+i,{shape:'box',size:[0.1,0.2,0.3],position:[(i%10)*0.2,Math.floor(i/10)*0.3,0],parent:'pivot',material:'m',action:'turn'});
    api.part('moving',{shape:'sphere',size:[0.2],position:[0,2,0],material:'m',action:'bounce'});
    api.action('turn',{tracks:[{part:'pivot',property:'rotation.y',mode:'spin',value:1,seconds:2}]});
    api.action('bounce',{tracks:[{part:'moving',property:'position.y',mode:'sine',value:0.2,seconds:1}]});`,
  actions: [
    { id: "turn", label: "Turn" },
    { id: "bounce", label: "Bounce" },
  ],
};

test("batching reduces repeated meshes while preserving bounds, picking and articulated movement", () => {
  const scene = makeScene(fixture);
  try {
    const before = new THREE.Box3().setFromObject(scene.root);
    const moving = scene.parts.get("moving");
    const stats = optimizeScene(scene);
    assert.equal(stats.before.meshes, 31);
    assert.equal(stats.after.meshes, 2);
    assert.equal(stats.before.triangles, stats.after.triangles);
    const after = new THREE.Box3().setFromObject(scene.root);
    assert.ok(before.min.distanceTo(after.min) < 0.000001);
    assert.ok(before.max.distanceTo(after.max) < 0.000001);
    assert.equal(moving.parent, scene.root);
    const pivot = scene.parts.get("pivot");
    assert.equal(pivot.children.length, 1);
    assert.equal(pivot.children[0].userData.action, "turn");
    scene.actions.get("turn").tracks[0].target.y = Math.PI / 2;
    scene.actions.get("bounce").tracks[0].target.y = 3;
    scene.root.updateMatrixWorld(true);
    assert.equal(moving.position.y, 3);
    const ray = new THREE.Raycaster(
      new THREE.Vector3(0, 1, 5),
      new THREE.Vector3(0, 0, -1),
    );
    // A separate exact ray checks the merged mesh still exposes its action.
    pivot.rotation.y = 0;
    scene.root.updateMatrixWorld(true);
    ray.set(
      new THREE.Vector3(0.4, scene.root.position.y, 5),
      new THREE.Vector3(0, 0, -1),
    );
    assert.equal(
      ray.intersectObject(pivot, true)[0]?.object.userData.action,
      "turn",
    );
    assert.equal(optimizeScene(scene).after.meshes, 2);
  } finally {
    dispose(scene);
  }
});

test("different click targets and animated transforms are never batched together", () => {
  const scene = makeScene({
    ...fixture,
    code: fixture.code.replace("action:'turn'", "action:i%2?'turn':'bounce'"),
  });
  try {
    assert.equal(optimizeScene(scene).after.meshes, 3);
    assert.equal(
      new Set(scene.parts.get("pivot").children.map((m) => m.userData.action))
        .size,
      2,
    );
  } finally {
    dispose(scene);
  }
});
