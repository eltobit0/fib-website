import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { prefersReducedMotion, canObserve } from './env.js';

/* Seeds to true when observation is impossible, so a missing capability shows content rather than hiding it. */
export function useSeen(ref) {
  const [seen, setSeen] = useState(() => !canObserve());

  useEffect(() => {
    if (seen || !ref.current || !canObserve()) return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.01 },
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, [ref, seen]);

  return seen;
}

/* Applied only after mount, with motion possible, below the fold, so any failure ships the content visible.
   Consumers must define the pending state as a transition FROM, never a keyframe gated on the attribute. */
export function usePendingReveal(ref, key = 'reveal') {
  const seen = useSeen(ref);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !canObserve() || prefersReducedMotion()) return;
    // A hidden tab runs no transitions and may never report an intersection, so
    // anything hidden here would still be hidden when the reader switched back.
    if (typeof document !== 'undefined' && document.hidden) return;
    if (el.getBoundingClientRect().top > (window.innerHeight || 0) * 0.92) {
      el.dataset[key] = 'pending';
    }
    // Deliberately once, on mount: this decides the starting frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Drop the flag if the tab is backgrounded while pending, or the content comes back blank. */
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const onVisibility = () => {
      if (document.hidden && ref.current) delete ref.current.dataset[key];
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [ref, key]);

  useEffect(() => {
    if (seen && ref.current) delete ref.current.dataset[key];
  }, [seen, ref, key]);

  return seen;
}

export function useRevealRef(key = 'reveal') {
  const ref = useRef(null);
  usePendingReveal(ref, key);
  return ref;
}
