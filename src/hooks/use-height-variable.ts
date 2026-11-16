import { useEffect, type RefObject } from 'react';

// Writes an element's rendered height to a CSS variable on its parent. The topbar and status bar wrap
// onto more lines at tablet widths, and the sticky panes are offset by these variables, so a fixed
// height would let a wrapped bar cover the top or bottom of the panes.
const useHeightVariable = (ref: RefObject<HTMLElement | null>, variableName: string) => {
  useEffect(() => {
    const element = ref.current;
    const parent = element?.parentElement;
    if (!element || !parent || typeof ResizeObserver === 'undefined') {
      return;
    }
    const update = () => parent.style.setProperty(variableName, `${element.offsetHeight}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => {
      observer.disconnect();
      parent.style.removeProperty(variableName);
    };
  }, [ref, variableName]);
};

export default useHeightVariable;
