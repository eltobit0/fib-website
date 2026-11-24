/* Kept out of the component files: Fast Refresh only preserves state for modules that export nothing but components. */

/* Read live, not cached: the OS setting can change mid-session. */
export const prefersReducedMotion = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export const canObserve = () => typeof IntersectionObserver !== 'undefined';
