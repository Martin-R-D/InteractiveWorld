import * as SecureStore from 'expo-secure-store';
export const readSession = () => SecureStore.getItemAsync('interactiveworld.account');
export const writeSession = (value: string) =>
  SecureStore.setItemAsync('interactiveworld.account', value);
export const clearSession = () => SecureStore.deleteItemAsync('interactiveworld.account');
