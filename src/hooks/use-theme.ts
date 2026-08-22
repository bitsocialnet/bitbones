import createStore from 'zustand';

const useThemeStore = createStore((setState, getState) => ({
  theme: localStorage.getItem('bitbonesTheme') || 'dark',
  setTheme: (theme) => {
    localStorage.setItem('bitbonesTheme', theme);
    setState((state) => ({ theme }));
  },
}));

const useTheme = () => {
  const { theme, setTheme } = useThemeStore();
  return [theme, setTheme];
};

export default useTheme;
