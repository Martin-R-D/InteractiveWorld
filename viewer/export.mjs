import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
export async function exportModel(root) {
  // The caller supplies a fresh resting-pose object, never the live animated world.
  root.traverse(object=> {
    object.userData = {};
  });
  root.updateMatrixWorld(true);
  const binary = await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: true });
  if (!(binary instanceof ArrayBuffer) || binary.byteLength > 9 * 1024 * 1024)
    throw new Error('Model exceeds export size limit');
  const bytes = new Uint8Array(binary);
  let text = '';
  for (let i = 0; i < bytes.length; i += 8192)
    text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text);
}
