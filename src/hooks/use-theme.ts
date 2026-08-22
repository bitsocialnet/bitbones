import { create } from 'zustand';

interface ThemeState {
  theme: string;
  setTheme: (theme: string) => void;
}

const useThemeStore = create<ThemeState>((setState, getState) => ({
  theme: localStorage.getItem('bitbonesTheme') || 'dark',
  setTheme: (theme) => {
    localStorage.setItem('bitbonesTheme', theme);
    setState((state) => ({ theme }));
  },
}));

const useTheme = (): [string, (theme: string) => void] => {
  const { theme, setTheme } = useThemeStore();
  return [theme, setTheme];
};

export default useTheme;
