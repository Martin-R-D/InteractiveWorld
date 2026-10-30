import React, { useEffect, useRef, useState } from 'react';
import { WebView } from 'react-native-webview';
import { viewerHtml } from './generated/viewerHtml';
import { parseMessage, ViewerProps } from './types';
export default function SceneViewer({ scene, sceneId, onMessage, command }: ViewerProps) {
  const ref = useRef<WebView<{}>>(null);
  const [ready, setReady] = useState(false);
  const send = (value: unknown) =>
    ref.current?.injectJavaScript(
      `window.InteractiveWorldReceive(${JSON.stringify(JSON.stringify(value))});true;`);
  useEffect(() => {
    if (ready && scene) send({ type: 'load', id: sceneId, scene });
  }, [ready, scene, sceneId]);
  useEffect(() => {
    if (ready && command) send(command);
  }, [ready, command]);
  return <WebView<{}>
      ref={ref}
      source={{ html: viewerHtml, baseUrl: 'about:blank' }}
      style={{ flex: 1, backgroundColor: '#152225' }}
      originWhitelist={['about:blank']}
      javaScriptEnabled
      domStorageEnabled={false}
      allowFileAccess={false}
      allowFileAccessFromFileURLs={false}
      allowUniversalAccessFromFileURLs={false}
      mixedContentMode="never"
      javaScriptCanOpenWindowsAutomatically={false}
      setSupportMultipleWindows={false}
      onShouldStartLoadWithRequest={r=> r.url === 'about:blank'}
      onMessage={event=> {
        const m = parseMessage(event.nativeEvent.data);
        if (!m) return;
        if (m.type === 'ready') setReady(true);
        onMessage(m);
      }}
      onError={() =>
        onMessage({ type: 'fatal', message: 'The viewer could not load. Reload it to recover.' })
      }
      onContentProcessDidTerminate={() =>
        onMessage({ type: 'fatal', message: 'The viewer stopped. Reload it to recover.' })
      }
      onRenderProcessGone={() =>
        onMessage({ type: 'fatal', message: 'The viewer stopped. Reload it to recover.' })
      }
    />;
}
