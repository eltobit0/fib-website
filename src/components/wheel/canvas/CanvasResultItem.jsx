import React, { useEffect, useRef, useState } from 'react';
import { IMAGE_BASE_URL } from '../../../config/constants.js';
import { COLORS } from '../config/constants';
import { getItemImageUrl, isInsaneItem, isSpecialItem, isExoticItem, isRelicItem, isRareItem, isMythicItem, isEventItem, isRecursionItem } from '../../../utils/helpers.js';
import { sampleHolo, sampleRamp, createHoloGradient } from '../../../utils/rarityHelpers.jsx';
import { useSaverMode } from '../../../config/power.js';
import { getAtlasSprite, drawItemSprite, needsOwnImage } from './atlas.js';

const DEFAULT_SIZE = 80;
const GLOW_PADDING = 30;

function hexToRgb(hex) {
    if (!hex) return { r: 255, g: 170, b: 0 };
    const cleanHex = hex.replace('#', '');
    return {
        r: parseInt(cleanHex.substring(0, 2), 16) || 0,
        g: parseInt(cleanHex.substring(2, 4), 16) || 0,
        b: parseInt(cleanHex.substring(4, 6), 16) || 0
    };
}

const lerp = (a, b, t) => a + (b - a) * t;

const lerpColor = (c1, c2, t) => {
    const rgb1 = hexToRgb(c1);
    const rgb2 = hexToRgb(c2);
    return {
        r: Math.round(lerp(rgb1.r, rgb2.r, t)),
        g: Math.round(lerp(rgb1.g, rgb2.g, t)),
        b: Math.round(lerp(rgb1.b, rgb2.b, t))
    };
};

const imageCache = new Map();

function loadImage(src) {
    if (imageCache.has(src)) {
        return Promise.resolve(imageCache.get(src));
    }

    return new Promise((resolve) => {
        const img = new Image();
        // Note: crossOrigin not needed since we only draw, never read pixels
        img.onload = () => {
            imageCache.set(src, img);
            resolve(img);
        };
        img.onerror = () => {
            // Try fallback
            const fallback = new Image();
            fallback.onload = () => {
                imageCache.set(src, fallback);
                resolve(fallback);
            };
            fallback.onerror = () => resolve(null);
            fallback.src = `${IMAGE_BASE_URL}/barrier.png`;
        };
        img.src = src;
    });
}

function drawRoundedRectPath(ctx, x, y, w, h, r) {
    if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(x, y, w, h, r);
    } else {
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }
}

export function CanvasResultItem({
                                     item,
                                     size = DEFAULT_SIZE,
                                     isRecursionSpin = false,
                                     isLuckySpin = false,
                                     showAnimation = true,
                                     className = '',
                                     style = {},
                                 }) {
    /** Saver mode folds into `showAnimation={false}` here rather than at every call site, where a missed one is a hidden loop. */
    const saverMode = useSaverMode();
    const animate = showAnimation && !saverMode;
    const canvasRef = useRef(null);
    const animationRef = useRef(null);
    const timeRef = useRef(0);
    const imageRef = useRef(null);
    const [imageLoaded, setImageLoaded] = useState(false);

    const isInsane = isInsaneItem(item);
    const isMythic = isMythicItem(item);
    const isSpecial = isSpecialItem(item);
    const isExotic = isExoticItem(item);
    const isRelic = isRelicItem(item);
    const isRare = isRareItem(item);
    const isEvent = isEventItem(item);
    const isRecursionType = isRecursionItem(item);

    // Every tier must appear in both checks (see CanvasSpinningStrip): `isSpecialType` gates the glow and ring.
    const isLuckyCommon = isLuckySpin && !isInsane && !isMythic && !isSpecial && !isExotic && !isRelic && !isRare && !isEvent && !isRecursionType;

    const isSpecialType = isInsane || isMythic || isSpecial || isExotic || isRelic || isRare || isEvent || isRecursionType || isLuckyCommon;

    const canvasSize = size + GLOW_PADDING * 2;
    const centerX = canvasSize / 2;
    const centerY = canvasSize / 2;

    useEffect(() => {
        if (!item) return;

        imageRef.current = null;
        setImageLoaded(false);

        let cancelled = false;

        // Pool items draw straight from the atlas; only unpacked sprites load here.
        if (!needsOwnImage(item)) {
            setImageLoaded(true);
            return () => { cancelled = true; };
        }

        loadImage(getItemImageUrl(item)).then(img => {
            if (!cancelled && img) {
                imageRef.current = img;
                setImageLoaded(true);
            }
        });

        return () => {
            cancelled = true;
        };
    }, [item]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;

        canvas.width = canvasSize * dpr;
        canvas.height = canvasSize * dpr;
        canvas.style.width = `${canvasSize}px`;
        canvas.style.height = `${canvasSize}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }, [canvasSize]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !item) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            console.warn('CanvasResultItem: Could not get 2d context');
            return;
        }

        const dpr = window.devicePixelRatio || 1;
        let lastTimestamp = performance.now();
        let frameCount = 0;
        const isMobileDevice = typeof window !== 'undefined' && window.innerWidth < 600;

        const render = (timestamp) => {
            frameCount++;
            if (isMobileDevice && !isSpecialType && frameCount % 2 !== 0) {
                animationRef.current = requestAnimationFrame(render);
                return;
            }

            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            if (animate) {
                const dt = (timestamp - lastTimestamp) / 1000;
                lastTimestamp = timestamp;
                timeRef.current += dt;
            }
            const time = timeRef.current;

            ctx.clearRect(0, 0, canvasSize, canvasSize);

            if (isSpecialType) {
                const pulsePhase = (time % 1.5) / 1.5;
                const pulse = Math.sin(pulsePhase * Math.PI * 2) * 0.5 + 0.5;
                const ringSize = size + 20 + pulse * 8;

                let glowColor;
                if (isInsane) {
                    glowColor = sampleHolo((time % 2.4) / 2.4);
                } else if (isMythic) {
                    glowColor = sampleRamp(COLORS.mythicCycle, (time % 1.5) / 1.5);
                } else if (isSpecial) {
                    glowColor = hexToRgb(COLORS.insane);
                } else if (isRelic) {
                    const relicPhase = (time % 2.25) / 2.25;
                    const relicPulse = Math.sin(relicPhase * Math.PI * 2) * 0.5 + 0.5;
                    glowColor = lerpColor(COLORS.relic, '#7FE8A8', relicPulse);
                } else if (isExotic) {
                    const exoticPhase = (time % 2.25) / 2.25;
                    const exoticPulse = Math.sin(exoticPhase * Math.PI * 2) * 0.5 + 0.5;
                    glowColor = lerpColor(COLORS.purple, '#FF44FF', exoticPulse);
                } else if (isRare) {
                    const rarePhase = (time % 2.25) / 2.25;
                    const rarePulse = Math.sin(rarePhase * Math.PI * 2) * 0.5 + 0.5;
                    glowColor = lerpColor(COLORS.red, '#FF7777', rarePulse);
                } else if (isRecursionType || isRecursionSpin) {
                    const recPhase = (time % 0.75) / 0.75;
                    const recPulse = Math.sin(recPhase * Math.PI * 2) * 0.5 + 0.5;
                    glowColor = lerpColor(COLORS.recursion, '#88FF88', recPulse);
                } else if (isEvent) {
                    const eventPhase = (time % 2.25) / 2.25;
                    const eventPulse = Math.sin(eventPhase * Math.PI * 2) * 0.5 + 0.5;
                    glowColor = lerpColor(COLORS.gold, '#FFFF66', eventPulse);
                } else if (isLuckyCommon) {
                    const luckyPhase = (time % 2.25) / 2.25;
                    const luckyPulse = Math.sin(luckyPhase * Math.PI * 2) * 0.5 + 0.5;
                    glowColor = lerpColor(COLORS.green, '#88FF88', luckyPulse);
                } else {
                    glowColor = hexToRgb(COLORS.gold);
                }

                const ringGradient = ctx.createRadialGradient(
                    centerX, centerY, size * 0.3,
                    centerX, centerY, ringSize * 0.7
                );
                ringGradient.addColorStop(0, `rgba(${glowColor.r}, ${glowColor.g}, ${glowColor.b}, ${0.4 + pulse * 0.2})`);
                ringGradient.addColorStop(0.5, `rgba(${glowColor.r}, ${glowColor.g}, ${glowColor.b}, ${0.2 + pulse * 0.1})`);
                ringGradient.addColorStop(1, `rgba(${glowColor.r}, ${glowColor.g}, ${glowColor.b}, 0)`);

                ctx.fillStyle = ringGradient;
                ctx.fillRect(0, 0, canvasSize, canvasSize);
            }

            if (isSpecialType) {
                let glowColor1, glowColor2, intensity;

                if (isInsane) {
                    const phase = (time % 2.4) / 2.4;
                    intensity = 0.85 + Math.sin(phase * Math.PI * 4) * 0.15;
                    // Two points a third of a cycle apart, so the bloom is never one flat hue.
                    glowColor1 = sampleHolo(phase);
                    glowColor2 = sampleHolo(phase + 0.33);
                } else if (isMythic) {
                    const phase = (time % 1.5) / 1.5;
                    intensity = 0.6 + Math.sin(phase * Math.PI * 2) * 0.2 + 0.2;
                    glowColor1 = sampleRamp(COLORS.mythicCycle, phase);
                    glowColor2 = sampleRamp(COLORS.mythicCycle, phase + 0.33);
                } else if (isSpecial) {
                    intensity = 0.8;
                    glowColor1 = hexToRgb(COLORS.insane);
                    glowColor2 = hexToRgb(COLORS.insane);
                } else if (isRelic) {
                    const phase = (time % 2.25) / 2.25;
                    const pulse = Math.sin(phase * Math.PI * 2) * 0.5 + 0.5;
                    intensity = 0.55 + pulse * 0.35;
                    glowColor1 = lerpColor(COLORS.relic, '#7FE8A8', pulse);
                    glowColor2 = hexToRgb(COLORS.relic);
                } else if (isExotic) {
                    const phase = (time % 2.25) / 2.25;
                    const pulse = Math.sin(phase * Math.PI * 2) * 0.5 + 0.5;
                    intensity = 0.5 + pulse * 0.35;
                    glowColor1 = lerpColor(COLORS.purple, '#FF44FF', pulse);
                    glowColor2 = hexToRgb(COLORS.purple);
                } else if (isRare) {
                    const phase = (time % 2.25) / 2.25;
                    const pulse = Math.sin(phase * Math.PI * 2) * 0.5 + 0.5;
                    intensity = 0.5 + pulse * 0.35;
                    glowColor1 = lerpColor(COLORS.red, '#FF7777', pulse);
                    glowColor2 = hexToRgb(COLORS.red);
                } else if (isRecursionType || isRecursionSpin) {
                    const phase = (time % 0.75) / 0.75;
                    const pulse = Math.sin(phase * Math.PI * 2) * 0.5 + 0.5;
                    intensity = 0.7 + pulse * 0.3;
                    glowColor1 = lerpColor(COLORS.recursion, '#88FF88', pulse);
                    glowColor2 = hexToRgb(COLORS.recursion);
                } else if (isEvent) {
                    const phase = (time % 2.25) / 2.25;
                    const pulse = Math.sin(phase * Math.PI * 2) * 0.5 + 0.5;
                    intensity = 0.5 + pulse * 0.3;
                    glowColor1 = lerpColor(COLORS.gold, '#FFFF66', pulse);
                    glowColor2 = hexToRgb(COLORS.gold);
                } else if (isLuckyCommon) {
                    const phase = (time % 2.25) / 2.25;
                    const pulse = Math.sin(phase * Math.PI * 2) * 0.5 + 0.5;
                    intensity = 0.5 + pulse * 0.3;
                    glowColor1 = lerpColor(COLORS.green, '#88FF88', pulse);
                    glowColor2 = hexToRgb(COLORS.green);
                } else {
                    intensity = 0.5;
                    glowColor1 = hexToRgb(COLORS.gold);
                    glowColor2 = hexToRgb(COLORS.gold);
                }

                const innerGlow = ctx.createRadialGradient(
                    centerX, centerY, 0,
                    centerX, centerY, size * 0.7
                );
                innerGlow.addColorStop(0, `rgba(${glowColor1.r}, ${glowColor1.g}, ${glowColor1.b}, ${intensity * 0.5})`);
                innerGlow.addColorStop(0.4, `rgba(${glowColor1.r}, ${glowColor1.g}, ${glowColor1.b}, ${intensity * 0.3})`);
                innerGlow.addColorStop(0.7, `rgba(${glowColor2.r}, ${glowColor2.g}, ${glowColor2.b}, ${intensity * 0.15})`);
                innerGlow.addColorStop(1, `rgba(${glowColor2.r}, ${glowColor2.g}, ${glowColor2.b}, 0)`);

                ctx.fillStyle = innerGlow;
                ctx.fillRect(GLOW_PADDING - 15, GLOW_PADDING - 15, size + 30, size + 30);
            }

            const boxX = GLOW_PADDING;
            const boxY = GLOW_PADDING;
            const radius = 12;

            ctx.beginPath();
            drawRoundedRectPath(ctx, boxX, boxY, size, size, radius);

            const bgGradient = ctx.createLinearGradient(boxX, boxY, boxX + size, boxY + size);
            if (isInsane) {
                bgGradient.addColorStop(0, `${COLORS.insaneHolo[0]}44`);
                bgGradient.addColorStop(0.5, `${COLORS.insaneHolo[1]}3A`);
                bgGradient.addColorStop(1, `${COLORS.insaneHolo[2]}44`);
            } else if (isMythic) {
                bgGradient.addColorStop(0, `${COLORS.mythicCycle[0]}33`);
                bgGradient.addColorStop(0.5, `${COLORS.mythicCycle[1]}33`);
                bgGradient.addColorStop(1, `${COLORS.mythicCycle[2]}33`);
            } else if (isSpecial) {
                bgGradient.addColorStop(0, `${COLORS.insane}33`);
                bgGradient.addColorStop(1, `${COLORS.insane}22`);
            } else if (isRelic) {
                bgGradient.addColorStop(0, `${COLORS.relic}33`);
                bgGradient.addColorStop(1, `${COLORS.relic}22`);
            } else if (isExotic) {
                bgGradient.addColorStop(0, `${COLORS.purple}33`);
                bgGradient.addColorStop(1, `${COLORS.purple}22`);
            } else if (isRare) {
                bgGradient.addColorStop(0, `${COLORS.red}33`);
                bgGradient.addColorStop(1, `${COLORS.red}22`);
            } else if (isRecursionType || isRecursionSpin) {
                bgGradient.addColorStop(0, `${COLORS.recursion}33`);
                bgGradient.addColorStop(1, `${COLORS.recursionDark}33`);
            } else if (isLuckyCommon) {
                bgGradient.addColorStop(0, `${COLORS.green}33`);
                bgGradient.addColorStop(1, `${COLORS.green}22`);
            } else {
                bgGradient.addColorStop(0, COLORS.bgLight);
                bgGradient.addColorStop(1, COLORS.bgLight);
            }

            ctx.fillStyle = bgGradient;
            ctx.fill();

            // borderColor may be a CanvasGradient; borderGlowColor must stay a flat string, since a gradient shadowColor is a silent no-op.
            let borderColor, borderGlowColor;
            if (isInsane) {
                // The whole slick, never one sampled point, or the card impersonates a lesser tier two thirds of every cycle.
                const phase = (time % 2.4) / 2.4;
                borderColor = createHoloGradient(ctx, boxX, size, phase);
                const bc = sampleHolo(phase);
                borderGlowColor = `rgb(${bc.r}, ${bc.g}, ${bc.b})`;
            } else if (isMythic) {
                const bc = sampleRamp(COLORS.mythicCycle, (time % 1.5) / 1.5);
                borderColor = `rgb(${bc.r}, ${bc.g}, ${bc.b})`;
            } else if (isSpecial) {
                borderColor = COLORS.insane;
            } else if (isRelic) {
                const phase = (time % 2.25) / 2.25;
                const pulse = Math.sin(phase * Math.PI * 2) * 0.5 + 0.5;
                const bc = lerpColor(COLORS.relic, '#7FE8A8', pulse);
                borderColor = `rgb(${bc.r}, ${bc.g}, ${bc.b})`;
            } else if (isExotic) {
                const phase = (time % 2.25) / 2.25;
                const pulse = Math.sin(phase * Math.PI * 2) * 0.5 + 0.5;
                const bc = lerpColor(COLORS.purple, '#FF44FF', pulse);
                borderColor = `rgb(${bc.r}, ${bc.g}, ${bc.b})`;
            } else if (isRare) {
                const phase = (time % 2.25) / 2.25;
                const pulse = Math.sin(phase * Math.PI * 2) * 0.5 + 0.5;
                const bc = lerpColor(COLORS.red, '#FF7777', pulse);
                borderColor = `rgb(${bc.r}, ${bc.g}, ${bc.b})`;
            } else if (isRecursionType || isRecursionSpin) {
                const phase = (time % 0.75) / 0.75;
                const pulse = Math.sin(phase * Math.PI * 2) * 0.5 + 0.5;
                const bc = lerpColor(COLORS.recursion, '#88FF88', pulse);
                borderColor = `rgb(${bc.r}, ${bc.g}, ${bc.b})`;
            } else if (isEvent) {
                const phase = (time % 2.25) / 2.25;
                const pulse = Math.sin(phase * Math.PI * 2) * 0.5 + 0.5;
                const bc = lerpColor(COLORS.gold, '#FFFF66', pulse);
                borderColor = `rgb(${bc.r}, ${bc.g}, ${bc.b})`;
            } else if (isLuckyCommon) {
                const phase = (time % 2.25) / 2.25;
                const pulse = Math.sin(phase * Math.PI * 2) * 0.5 + 0.5;
                const bc = lerpColor(COLORS.green, '#88FF88', pulse);
                borderColor = `rgb(${bc.r}, ${bc.g}, ${bc.b})`;
            } else {
                borderColor = COLORS.gold;
            }

            // Every branch except insane sets a flat colour, so it doubles as the glow.
            borderGlowColor = borderGlowColor || borderColor;

            ctx.strokeStyle = borderColor;
            ctx.lineWidth = 3;
            ctx.stroke();

            if (isSpecialType) {
                ctx.shadowColor = borderGlowColor;
                ctx.shadowBlur = 10;
                ctx.stroke();
                ctx.shadowBlur = 0;
            }

            ctx.save();
            ctx.beginPath();
            drawRoundedRectPath(ctx, boxX, boxY, size, size, radius);
            ctx.clip();

            for (let i = 0; i < 2; i++) {
                const basePhase = (time / 4 + i * 0.5) % 1;
                const speedVar = Math.sin(time * 0.3 + i * 2) * 0.15;
                const phase = (basePhase + speedVar + 1) % 1;

                const sweepPos = -60 + phase * (size + 120);

                ctx.save();
                ctx.translate(centerX, centerY);
                ctx.rotate(-0.45);

                const sweepGradient = ctx.createLinearGradient(sweepPos - 20, 0, sweepPos + 20, 0);
                sweepGradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
                sweepGradient.addColorStop(0.35, 'rgba(255, 255, 255, 0.15)');
                sweepGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.28)');
                sweepGradient.addColorStop(0.65, 'rgba(255, 255, 255, 0.15)');
                sweepGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

                ctx.fillStyle = sweepGradient;
                ctx.fillRect(sweepPos - 20, -size, 40, size * 2);
                ctx.restore();
            }

            ctx.restore();

            if (imageRef.current || getAtlasSprite(item)) {
                const imgSize = size * 0.7;
                const imgX = centerX - imgSize / 2;
                const imgY = centerY - imgSize / 2;

                const useSmooth = isInsane || isSpecial || isRare || isMythic || item?.username || isEvent || isRecursionType;
                ctx.imageSmoothingEnabled = useSmooth;
                ctx.imageSmoothingQuality = useSmooth ? 'high' : 'low';

                if (isSpecialType) {
                    ctx.shadowColor = borderGlowColor;
                    ctx.shadowBlur = 8;
                }

                drawItemSprite(ctx, item, imageRef.current, imgX, imgY, imgSize);
                ctx.shadowBlur = 0;
                ctx.imageSmoothingEnabled = true;
            }

            if (animate) {
                animationRef.current = requestAnimationFrame(render);
            }
        };

        animationRef.current = requestAnimationFrame(render);

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, [item, size, isRecursionSpin, isLuckySpin, animate, imageLoaded, canvasSize, centerX, centerY, isInsane, isMythic, isSpecial, isRare, isEvent, isRecursionType, isLuckyCommon, isSpecialType]);

    if (!item) return null;

    return (
        <div
            className={className}
            style={{
                position: 'relative',
                width: `${canvasSize}px`,
                height: `${canvasSize}px`,
                margin: `-${GLOW_PADDING}px`,
                ...style,
            }}
        >
            <canvas
                ref={canvasRef}
                style={{
                    display: 'block',
                    width: '100%',
                    height: '100%',
                }}
            />
        </div>
    );
}

export default CanvasResultItem;