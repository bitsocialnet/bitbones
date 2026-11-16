import { createContext, useContext } from 'react';
import { create } from 'zustand';

// Whether the inspector pane is on screen: the page renders one (Panes provides InspectorMountedContext;
// inbox and author pages reuse feed rows without one), and the window is wide enough to show it.
// panes.module.css hides it at max-width 1100px. One media query listener serves every row.
export const InspectorMountedContext = createContext(false);

const query = typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia('(min-width: 1101px)') : undefined;

const useInspectorAvailableStore = create<{ available: boolean }>(() => ({ available: query?.matches ?? true }));

// the media query change event is not fired in every case (emulated viewports in devtools, some
// webviews), so a resize also re-reads it; zustand skips the update when the value is unchanged
const update = () => useInspectorAvailableStore.setState({ available: query?.matches ?? true });
query?.addEventListener?.('change', update);
if (typeof window !== 'undefined') {
  window.addEventListener('resize', update);
}

const useInspectorAvailable = (): boolean => {
  const inspectorMounted = useContext(InspectorMountedContext);
  const wideEnough = useInspectorAvailableStore((state) => state.available);
  return inspectorMounted && wideEnough;
};

export default useInspectorAvailable;
