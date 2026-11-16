import { create } from 'zustand';

// Whether the inspector pane is on screen. panes.module.css hides it at max-width 1100px, so rows
// only become inspectable (and highlighted) from 1101px. One media query listener serves every row.
const query = typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia('(min-width: 1101px)') : undefined;

const useInspectorAvailableStore = create<{ available: boolean }>(() => ({ available: query?.matches ?? true }));

// the media query change event is not fired in every case (emulated viewports in devtools, some
// webviews), so a resize also re-reads it; zustand skips the update when the value is unchanged
const update = () => useInspectorAvailableStore.setState({ available: query?.matches ?? true });
query?.addEventListener?.('change', update);
if (typeof window !== 'undefined') {
  window.addEventListener('resize', update);
}

const useInspectorAvailable = (): boolean => useInspectorAvailableStore((state) => state.available);

export default useInspectorAvailable;
