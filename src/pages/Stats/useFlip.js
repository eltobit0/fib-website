import { useLayoutEffect, useRef } from 'react';

export function useFlipRows(containerRef, key) {
  const previous = useRef(new Map());

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const reduced = typeof matchMedia !== 'undefined'
      && matchMedia('(prefers-reduced-motion: reduce)').matches;

    const rows = [...container.querySelectorAll('[data-flip-key]')];
    const next = new Map();
    const frames = [];

    for (const row of rows) {
      const id = row.getAttribute('data-flip-key');
      const top = row.offsetTop;
      next.set(id, top);

      const before = previous.current.get(id);
      if (reduced || before === undefined || before === top) continue;

      const delta = before - top;
      row.dataset.flipping = 'true';
      row.style.transform = `translateY(${delta}px)`;
      frames.push(requestAnimationFrame(() => {
        delete row.dataset.flipping;
        row.style.transform = '';
      }));
    }

    previous.current = next;
    return () => frames.forEach(cancelAnimationFrame);
  }, [containerRef, key]);
}
