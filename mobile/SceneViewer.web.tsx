import React, { useEffect, useRef, useState } from 'react';
import { viewerHtml } from './generated/viewerHtml';
import { parseMessage, ViewerProps } from './types';
export default function SceneViewer({ scene, sceneId, onMessage, command }: ViewerProps) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const callback = useRef(onMessage);
  callback.current = onMessage;
  const latest = useRef({ scene, sceneId });
  latest.current = { scene, sceneId };
  useEffect(() => {
    const receive = (e: MessageEvent) => {
      if (e.source !== ref.current?.contentWindow || typeof e.data !== 'string') return;
      const m = parseMessage(e.data);
      if (m) {
        if (m.type === 'ready') {
          setReady(true);
          if (latest.current.scene)
            ref.current?.contentWindow?.postMessage(
              JSON.stringify({
                type: 'load',
                id: latest.current.sceneId,
                scene: latest.current.scene}),
              '*');
        }
        callback.current(m);
      }
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, []);
  useEffect(() => {
    if (ready && scene)
      ref.current?.contentWindow?.postMessage(
        JSON.stringify({ type: 'load', id: sceneId, scene }),
        '*');
  }, [ready, scene, sceneId]);
  useEffect(() => {
    if (ready && command) ref.current?.contentWindow?.postMessage(JSON.stringify(command), '*');
  }, [ready, command]);
  return <iframe
      title="InteractiveWorld 3D viewer"
      ref={ref}
      srcDoc={viewerHtml}
      sandbox="allow-scripts"
      style={{ border: 0, width: '100%', height: '100%', background: '#152225' }}
    />;
}
