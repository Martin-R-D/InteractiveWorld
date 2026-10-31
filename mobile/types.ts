export type Scene = {
  kind: "scene";
  name: string;
  description: string;
  code: string;
  actions: { id: string; label: string; sound?: string }[];
};
export type WorldMember = {
  id: string;
  objectId: string;
  position: [number, number, number];
  rotation: number;
  scale: number;
};
export type WorldPlan = {
  summary: string;
  steps: {
    memberId: string;
    at: number;
    duration: number;
    position?: [number, number, number];
    rotation?: number;
    actionId?: string;
  }[];
};
export type WorldDocument = {
  name: string;
  members: WorldMember[];
  plan: WorldPlan | null;
};
export type WorldScene = {
  kind: "world";
  world: WorldDocument;
  objects: { id: string; scene: Scene }[];
};
export type ViewerMessage = {
  type:
    | "ready"
    | "loaded"
    | "error"
    | "fatal"
    | "action"
    | "exported"
    | "export-error"
    | "selected"
    | "playing"
    | "stopped"
    | "finished";
  id?: string;
  message?: string;
  data?: string;
};
export type ViewerProps = {
  dark: boolean;
  muted: boolean;
  scene: Scene | WorldScene | null;
  sceneId: string;
  onMessage: (message: ViewerMessage) => void;
  command: {
    type:
      "reset" | "action" | "export" | "world-play" | "world-stop" | "select";
    id?: string;
    sceneId?: string;
    serial: number;
  } | null;
};
export function parseMessage(raw: string): ViewerMessage | null {
  if (raw.length > 12 * 1024 * 1024 + 1000) return null;
  try {
    const m = JSON.parse(raw);
    if (
      ![
        "ready",
        "loaded",
        "error",
        "fatal",
        "action",
        "exported",
        "export-error",
        "selected",
        "playing",
        "stopped",
        "finished",
      ].includes(m.type)
    )
      return null;
    if (m.id !== undefined && (typeof m.id !== "string" || m.id.length > 80))
      return null;
    if (
      m.message !== undefined &&
      (typeof m.message !== "string" || m.message.length > 400)
    )
      return null;
    if (m.type === "exported") {
      if (
        typeof m.id !== "string" ||
        typeof m.data !== "string" ||
        m.data.length > 12 * 1024 * 1024 ||
        !m.data.length ||
        m.data.length % 4 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(m.data)
      )
        return null;
    } else if (raw.length > 1000) return null;
    return m;
  } catch {
    return null;
  }
}
