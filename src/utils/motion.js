import { prefersCalm, useCalm } from '../config/power.js';

// Re-export of config/power.js: "reduced motion" here includes saver mode. New code should import from power.js.
export const prefersReducedMotion = prefersCalm;

export const usePrefersReducedMotion = useCalm;
