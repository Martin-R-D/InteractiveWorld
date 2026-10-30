import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createStyles } from './styles';

const STORAGE_KEY = 'interactiveworld.theme';
const ThemeContext = createContext({ dark: false, toggle: () => {}, s: createStyles(false) });
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [dark, setDark] = useState(false);
  const [changed, setChanged] = useState(false);
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then(value=> {
        if (active && !changed) setDark(value === 'dark');
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [changed]);
  const value = useMemo(
    () => ({
      dark,
      s: createStyles(dark),
      toggle: () => {
        setChanged(true);
        setDark(previous=> {
          const next = !previous;
          void AsyncStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light').catch(() => {});
          return next;
        });
      }}),
    [dark]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
export const useTheme = () => useContext(ThemeContext);
