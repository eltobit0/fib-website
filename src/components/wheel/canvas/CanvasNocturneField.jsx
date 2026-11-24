// The page field behind the spin surface: barely-there night air (sub-4% alpha), so the reel stays the brightest thing.
// Stars are ambient and draw once, statically, under reduced motion and saver mode.

import React, { useEffect, useRef } from 'react';
import { COLORS, SURFACE_NOISE } from '../config/constants';
import { useCalm } from '../../../config/power.js';

export function CanvasStarField({ starCount = 40 }) {
    const canvasRef = useRef(null);
    const animationRef = useRef(null);
    const timeRef = useRef(0);
    // State rather than a live read: toggling saver mode mid-session must re-run this effect to cancel the loop.
    const calm = useCalm();

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');

        // Generated here, not in render: render-phase Math.random redraws differently every render (react-hooks/purity).
        const stars = Array.from({ length: starCount }, () => ({
            x: Math.random(),
            y: Math.random(),
            size: Math.random() * 1.8 + 0.8,
            phase: Math.random() * Math.PI * 2,
            speed: 0.3 + Math.random() * 0.5,
            duration: 2 + Math.random() * 3,
        }));

        const dpr = 1;

        let lastRenderTime = 0;
        const TARGET_FPS = 15;
        const FRAME_TIME = 1000 / TARGET_FPS;

        // Reduced motion and saver mode both get one static sky drawn at a fixed phase.
        const reduceMotion = calm;

        const resize = () => {
            canvas.width = window.innerWidth * dpr;
            canvas.height = window.innerHeight * dpr;
            canvas.style.width = `${window.innerWidth}px`;
            canvas.style.height = `${window.innerHeight}px`;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };

        // Resize must repaint: under reduced motion there is no next rAF tick to fill a cleared canvas.
        const onResize = () => {
            resize();
            if (reduceMotion) drawStars(0);
        };
        resize();
        window.addEventListener('resize', onResize);

        const drawStars = (time) => {
            const width = window.innerWidth;
            const height = window.innerHeight;

            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, width, height);

            for (const star of stars) {
                const x = star.x * width;
                const y = star.y * height;

                const twinkle = reduceMotion
                    ? 0.5
                    : Math.sin(time / star.duration * Math.PI * 2 + star.phase) * 0.5 + 0.5;
                const opacity = 0.12 + twinkle * 0.45;
                const scale = 0.8 + twinkle * 0.3;
                const size = star.size * scale;

                const glowRadius = size * 3;
                const gradient = ctx.createRadialGradient(x, y, 0, x, y, glowRadius);
                gradient.addColorStop(0, `rgba(210, 222, 244, ${0.16 * opacity})`);
                gradient.addColorStop(0.5, `rgba(210, 222, 244, ${0.08 * opacity})`);
                gradient.addColorStop(1, 'rgba(210, 222, 244, 0)');

                ctx.beginPath();
                ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
                ctx.fillStyle = gradient;
                ctx.fill();

                ctx.beginPath();
                ctx.arc(x, y, size / 2, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(210, 222, 244, ${opacity})`;
                ctx.fill();
            }
        };

        if (reduceMotion) {
            drawStars(0);
            return () => {
                window.removeEventListener('resize', onResize);
            };
        }

        const render = (timestamp) => {
            const elapsed = timestamp - lastRenderTime;
            if (elapsed < FRAME_TIME) {
                animationRef.current = requestAnimationFrame(render);
                return;
            }
            lastRenderTime = timestamp - (elapsed % FRAME_TIME);

            timeRef.current += FRAME_TIME / 1000;
            drawStars(timeRef.current);

            animationRef.current = requestAnimationFrame(render);
        };

        animationRef.current = requestAnimationFrame(render);

        return () => {
            window.removeEventListener('resize', onResize);
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, [starCount, calm]);

    return (
        <canvas
            ref={canvasRef}
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
            }}
        />
    );
}

export function CanvasNocturneField() {
    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            overflow: 'hidden',
            pointerEvents: 'none',
            zIndex: 0
        }}>
            <div style={{
                position: 'absolute',
                inset: 0,
                background: `
                    radial-gradient(90% 45% at 50% -5%, rgba(148,168,212,0.06) 0%, transparent 60%),
                    radial-gradient(55% 26% at 50% 52%, rgba(255,183,94,0.045) 0%, transparent 70%),
                    linear-gradient(180deg, ${COLORS.bg} 0%, ${COLORS.bg} 55%, rgba(0,0,0,0.25) 100%)
                `,
            }} />

            <CanvasStarField starCount={40} />

            <div style={{
                position: 'absolute',
                inset: 0,
                backgroundImage: SURFACE_NOISE,
            }} />

            <div style={{
                position: 'absolute',
                inset: 0,
                background: 'radial-gradient(ellipse at center, transparent 0%, rgba(0,0,0,0.4) 100%)',
            }} />
        </div>
    );
}

export default CanvasNocturneField;