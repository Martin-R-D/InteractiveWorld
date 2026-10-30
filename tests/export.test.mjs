import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { exportModel } from '../viewer/export.mjs';
import { modelBytes, modelFilename } from '../mobile/modelFile.ts';
import { parseMessage } from '../mobile/types.ts';
// GLTFExporter uses the browser FileReader to assemble binary chunks.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(result=> {
      this.result = result;
      this.onloadend?.();
    });
  }
};
test('exported GLB round-trips geometry, hierarchy and materials without app metadata', async () => {
  const root = new THREE.Group();
  root.name = 'Pen';
  const material = new THREE.MeshStandardMaterial({
    color: '#663399',
    roughness:.35,
    metalness:.2});
  const body = new THREE.Mesh(new THREE.CylinderGeometry(.2,.2, 3, 16), material);
  body.name = 'body';
  body.position.y = 1.5;
  body.userData = { action: 'click' };
  root.add(body);
  const encoded = await exportModel(root);
  const bytes = modelBytes(encoded);
  const result = await new GLTFLoader().parseAsync(bytes.buffer, '');
  const loaded = result.scene.getObjectByName('body');
  assert.ok(loaded?.isMesh);
  assert.equal(loaded.position.y, 1.5);
  assert.equal(loaded.material.color.getHexString(), '663399');
  assert.equal(loaded.material.roughness,.35);
  assert.equal(loaded.material.metalness,.2);
  assert.equal(loaded.userData.action, undefined);
  assert.equal(result.animations.length, 0);
  assert.equal(result.scene.getObjectByName('studioFloor'), undefined);
  assert.equal(loaded.geometry.attributes.position.count, body.geometry.attributes.position.count);
});
test('file validation rejects malformed binary and produces safe filenames', () => {
  assert.throws(() => modelBytes(btoa('not a model')));
  assert.equal(modelFilename('../My pen / nice'), 'My-pen-nice.glb');
  assert.equal(modelFilename(''), 'InteractiveWorld-model.glb');
});
test('bridge accepts bounded export results and rejects invalid messages', () => {
  assert.ok(parseMessage(JSON.stringify({ type: 'exported', id: 'test', data: 'Z2xURg==' })));
  for (const data of ['', null, '../../file', 'abc', 'a'.repeat(12 * 1024 * 1024 + 4)])
    assert.equal(parseMessage(JSON.stringify({ type: 'exported', id: 'test', data })), null);
  assert.equal(parseMessage(JSON.stringify({ type: 'action', data: 'a'.repeat(1200) })), null);
});
