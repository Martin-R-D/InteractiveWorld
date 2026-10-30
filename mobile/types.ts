export type Scene = {
  kind: 'scene';
  name: string;
  description: string;
  code: string;
  actions: { id: string; label: string }[]};
export type ViewerMessage = {
  type: 'ready' | 'loaded' | 'error' | 'fatal' | 'action';
  id?: string;
  message?: string};
export type ViewerProps = {
  scene: Scene | null;
  sceneId: string;
  onMessage: (message: ViewerMessage) => void;
  command: { type: 'reset' | 'action'; id?: string; serial: number } | null};
export function parseMessage(raw: string): ViewerMessage | null {
  if (raw.length > 1000) return null;
  try {
    const m = JSON.parse(raw);
    if (!['ready', 'loaded', 'error', 'fatal', 'action'].includes(m.type)) return null;
    if (m.id !== undefined && (typeof m.id !== 'string' || m.id.length > 80)) return null;
    if (m.message !== undefined && (typeof m.message !== 'string' || m.message.length > 400))
      return null;
    return m;
  } catch {
    return null;
  }
}
