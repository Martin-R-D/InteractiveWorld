import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from './theme';
import { AccountSession } from './Account';
import { Scene } from './types';
type Entry = { id: string; name: string; description: string; createdAt: number };
export default function MyObjects({
  account,
  onBack,
  onOpen,
  onExpired}: {
  account: AccountSession;
  onBack: () => void;
  onOpen: (scene: Scene) => void;
  onExpired: () => void}) {
  const { s, dark } = useTheme();
  const [items, setItems] = useState<Entry[]>([]),
    [offset, setOffset] = useState(0),
    [next, setNext] = useState<number | null>(null),
    [loading, setLoading] = useState(true),
    [opening, setOpening] = useState(false),
    [error, setError] = useState(''),
    [refresh, setRefresh] = useState(0);
  async function request(path: string, signal?: AbortSignal) {
    const response = await fetch(account.endpoint + '/objects' + path, {
      headers: { Authorization: 'Bearer ' + account.token },
      signal: signal ?? AbortSignal.timeout(15000)});
    if (response.status === 401) {
      onExpired();
      throw new Error('Please sign in again.');
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? 'Could not load your objects.');
    return data;
  }
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    setLoading(true);
    setError('');
    request('?offset=' + offset, controller.signal)
      .then(data=> {
        if (active) {
          setItems(data.objects);
          setNext(data.nextOffset);
        }
      })
      .catch(() => {
        if (active) setError('Could not load your objects. Please try again.');
      })
      .finally(() => {
        clearTimeout(timeout);
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [offset, refresh]);
  async function open(id: string) {
    if (opening) return;
    setOpening(true);
    setError('');
    try {
      const data = await request('/' + id);
      onOpen(data.scene);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open this object.');
    } finally {
      setOpening(false);
    }
  }
  function button(label: string, action: () => void) {
    return <Pressable accessibilityRole="button" onPress={action} disabled={opening} style={s.button}>
        <Text style={s.buttonText}>{label}</Text>
      </Pressable>;
  }
  return <SafeAreaView style={s.safe}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <ScrollView contentContainerStyle={s.page}>
        <Text style={s.brand}>InteractiveWorld</Text>
        <Text style={s.objectTitle}>My objects</Text>
        {button('Back to app', onBack)}
        {loading ?<ActivityIndicator />:<>
            {!error && !items.length &&<View style={s.card}>
                <Text style={s.cardTitle}>Your collection starts here</Text>
                <Text style={s.muted}>Scan an object, then tap Save to keep it in your account.</Text>
              </View>}
            {items.map(item=><View key={item.id} style={s.card}>
                <Text style={s.cardTitle}>{item.name}</Text>
                <Text style={s.muted}>{item.description}</Text>
                <Text style={s.small}>Saved {new Date(item.createdAt).toLocaleDateString()}</Text>
                {button('Open ' + item.name, () => void open(item.id))}
              </View>)}
            {offset > 0 && button('Previous page', () => setOffset(Math.max(0, offset - 20)))}
            {next !== null && button('Next page', () => setOffset(next))}
          </>}
        {opening && <ActivityIndicator />}
        {!!error &&<View style={s.card}>
            <Text accessibilityLiveRegion="polite" style={s.errorText}>
              {error}
            </Text>
            {button('Try again', () => setRefresh(v=> v + 1))}
          </View>}
      </ScrollView>
    </SafeAreaView>;
}
