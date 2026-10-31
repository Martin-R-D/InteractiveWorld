import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { useTheme } from './theme';
import { readSession, writeSession, clearSession } from './sessionStore';
export type AccountSession = {
  endpoint: string;
  token: string;
  user: { id: string; email: string; name: string }};
export default function Account({
  endpoint,
  session,
  onChange,
  onClose}: {
  endpoint: string;
  session: AccountSession | null;
  onChange: (s: AccountSession | null) => void;
  onClose: () => void}) {
  const { s } = useTheme();
  const [register, setRegister] = useState(false),
    [name, setName] = useState(''),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [deleting, setDeleting] = useState(false);
  async function submit(action: string) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(endpoint + '/auth/' + action, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session ? { Authorization: 'Bearer ' + session.token } : {})},
        body: JSON.stringify({ name, email, password }),
        signal: AbortSignal.timeout(15000)});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Account request failed.');
      if (action === 'logout' || action === 'delete') {
        await clearSession();
        onChange(null);
        setDeleting(false);
      } else {
        const next = { endpoint, token: data.token, user: data.user };
        await writeSession(JSON.stringify(next));
        onChange(next);
      }
      setPassword('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Account request failed. Try again.');
    } finally {
      setBusy(false);
    }
  }
  function button(label: string, action: () => void) {
    return <Pressable accessibilityRole="button" disabled={busy} onPress={action} style={s.button}>
        <Text style={s.buttonText}>{label}</Text>
      </Pressable>;
  }
  return <View style={s.card}>
      <Text style={s.cardTitle}>
        {session ? 'Your account' : register ? 'Create account' : 'Sign in'}
      </Text>
      {session ?<>
          <Text style={s.muted}>{session.user.name}</Text>
          <Text style={s.muted}>{session.user.email}</Text>
          {deleting ?<>
              <Text style={s.muted}>Delete your account permanently? Enter your password to confirm.</Text>
              <TextInput
                accessibilityLabel="Confirm password"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                style={s.input}
              />
              {button('Confirm account deletion', () => void submit('delete'))}
              {button('Cancel deletion', () => {
                setDeleting(false);
                setPassword('');
              })}
            </>:<>
              {button('Sign out', () => void submit('logout'))}
              {button('Delete account', () => setDeleting(true))}
            </>}
        </>:<>
          {register &&<TextInput
              accessibilityLabel="Name"
              placeholder="Name"
              value={name}
              onChangeText={setName}
              maxLength={80}
              style={s.input}
            />}
          <TextInput
            accessibilityLabel="Email"
            placeholder="Email"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            value={email}
            onChangeText={setEmail}
            maxLength={254}
            style={s.input}
          />
          <TextInput
            accessibilityLabel="Password"
            placeholder={register ? 'Password (at least 12 characters)' : 'Password'}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            maxLength={128}
            style={s.input}
          />
          {button(
            register ? 'Create account' : 'Sign in',
            () => void submit(register ? 'register' : 'login'))}
          {button(register ? 'Already have an account? Sign in' : 'Create a new account', () => {
            setRegister(!register);
            setPassword('');
            setError('');
          })}
        </>}
      {busy && <ActivityIndicator />}
      {!!error &&<Text accessibilityLiveRegion="polite" style={s.errorText}>
          {error}
        </Text>}
      {button('Close', onClose)}
    </View>;
}
export async function restoreSession(endpoint: string): Promise<AccountSession | null> {
  const raw = await readSession();
  if (!raw) return null;
  const saved = JSON.parse(raw) as AccountSession;
  if (saved.endpoint !== endpoint) return null;
  const response = await fetch(endpoint + '/auth/me', {
    headers: { Authorization: 'Bearer ' + saved.token },
    signal: AbortSignal.timeout(5000)});
  if (response.status === 401) {
    await clearSession();
    return null;
  }
  if (!response.ok) throw new Error('Could not check account');
  const data = await response.json();
  return { ...saved, user: data.user };
}
