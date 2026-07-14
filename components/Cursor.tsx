'use client';
import { useEffect, useRef } from 'react';

// Additive gold dot + lerped ring (section 16). Native cursor is kept visible
// for text-input usability; this is a premium overlay, not a replacement.
export default function Cursor() {
  const dot = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia('(pointer: fine)').matches === false) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let mx = window.innerWidth / 2;
    let my = window.innerHeight / 2;
    let rx = mx;
    let ry = my;
    let raf = 0;
    let hovering = false;

    const move = (e: MouseEvent) => {
      mx = e.clientX;
      my = e.clientY;
      if (dot.current) dot.current.style.transform = `translate(${mx}px, ${my}px) translate(-50%, -50%) scale(${hovering ? 2 : 1})`;
      const t = e.target as HTMLElement;
      hovering = !!t.closest('button, a, input, textarea, [role="button"], .interactive');
    };

    const loop = () => {
      rx += (mx - rx) * 0.12;
      ry += (my - ry) * 0.12;
      if (ring.current)
        ring.current.style.transform = `translate(${rx}px, ${ry}px) translate(-50%, -50%) scale(${hovering ? 1.5 : 1})`;
      raf = requestAnimationFrame(loop);
    };

    window.addEventListener('mousemove', move);
    raf = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener('mousemove', move);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <>
      <div ref={dot} className="cursor-dot" aria-hidden />
      <div ref={ring} className="cursor-ring" aria-hidden />
    </>
  );
}
