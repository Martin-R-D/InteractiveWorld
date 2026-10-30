export function modelFilename(name: string) {
  return (name
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'InteractiveWorld-model') + '.glb';
}
export function modelBytes(base64: string) {
  const binary = atob(base64),
    bytes = Uint8Array.from(binary,c=> c.charCodeAt(0));
  const view = new DataView(bytes.buffer);
  if (
    bytes.length < 20 ||
    view.getUint32(0, true) !== 0x46546c67 ||
    view.getUint32(4, true) !== 2 ||
    view.getUint32(8, true) !== bytes.length
  )
    throw new Error('Invalid GLB file');
  return bytes;
}
