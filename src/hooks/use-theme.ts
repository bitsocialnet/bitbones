import { create } from 'zustand';

export const themes: string[] = ['dark', 'light', 'auto', 'classic', 'none', 'term', 'contrast'];

const readStorage = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeStorage = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {}
};

interface ThemeState {
  theme: string;
  customCss: string;
  setTheme: (theme: string) => void;
  setCustomCss: (customCss: string) => void;
}

const useThemeStore = create<ThemeState>((setState) => ({
  // a theme from an older version that no longer exists falls back to the default
  theme: themes.find((theme) => theme === readStorage('bitbonesTheme')) || 'dark',
  customCss: readStorage('bitbonesCustomCss') || '',
  setTheme: (theme) => {
    writeStorage('bitbonesTheme', theme);
    setState({ theme });
  },
  setCustomCss: (customCss) => {
    writeStorage('bitbonesCustomCss', customCss);
    setState({ customCss });
  },
}));

const useTheme = (): [string, (theme: string) => void] => {
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);
  return [theme, setTheme];
};

// user CSS applied after the theme, edited in settings
export const useCustomCss = (): [string, (customCss: string) => void] => {
  const customCss = useThemeStore((state) => state.customCss);
  const setCustomCss = useThemeStore((state) => state.setCustomCss);
  return [customCss, setCustomCss];
};

export default useTheme;
