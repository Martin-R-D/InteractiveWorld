import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { modelBytes, modelFilename } from './modelFile';
export async function saveModel(data: string, name: string) {
  if (!await Sharing.isAvailableAsync())throw new Error('Sharing is unavailable');
  const file = new File(Paths.cache, modelFilename(name));
  await file.write(modelBytes(data));
  await Sharing.shareAsync(file.uri, {
    mimeType: 'model/gltf-binary',
    dialogTitle: 'Save or share your 3D model',
    UTI: 'org.khronos.glb'});
  return 'Save/share dialog closed. Choose a destination there to keep your GLB file.';
}
