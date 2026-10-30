import { modelBytes, modelFilename } from './modelFile';
export async function saveModel(data: string, name: string) {
  const blob = new Blob([modelBytes(data)], { type: 'model/gltf-binary' }),
    url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = modelFilename(name);
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return 'Download started. Check your browser downloads for the GLB file.';
}
