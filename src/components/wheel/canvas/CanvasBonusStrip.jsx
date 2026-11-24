import React, { useEffect, useRef, useState } from 'react';
import { BONUS_IDENTITY, BONUS_IDENTITY_FALLBACK } from '../config/constants';
import { ITEM_WIDTH, STRIP_HEIGHT } from '../../../config/constants.js';

// Must equal the reel's pitch: spinBonusWheel lands on it, and a mismatch puts a random filler slot under the pointer.
// WheelSpinner imports the length and landing index from here rather than restating them.
export const BONUS_PITCH = ITEM_WIDTH;
export const BONUS_STRIP_LENGTH = 80;
export const BONUS_FINAL_INDEX = BONUS_STRIP_LENGTH - 16;

/** Phone pitch (vertical, like the reel); shorter than the shaft's 128 since a slot holds only an icon and a word. */
export const BONUS_PITCH_MOBILE = 104;

const STRIP_HEIGHT_MOBILE = 90;

// Event identities come from BONUS_IDENTITY in config/constants; do not keep a private copy.

function hexToRgb(hex) {
    if (!hex) return { r: 255, g: 170, b: 0 };
    const cleanHex = hex.replace('#', '');
    return {
        r: parseInt(cleanHex.substr(0, 2), 16) || 0,
        g: parseInt(cleanHex.substr(2, 2), 16) || 0,
        b: parseInt(cleanHex.substr(4, 2), 16) || 0
    };
}

function drawZapIcon(ctx, x, y, size, color) {
    ctx.save();
    ctx.translate(x, y);

    ctx.shadowColor = color;
    ctx.shadowBlur = 12;

    ctx.fillStyle = color;
    ctx.beginPath();
    const s = size / 24;
    ctx.moveTo(13 * s, 2 * s);
    ctx.lineTo(3 * s, 14 * s);
    ctx.lineTo(12 * s, 14 * s);
    ctx.lineTo(11 * s, 22 * s);
    ctx.lineTo(21 * s, 10 * s);
    ctx.lineTo(12 * s, 10 * s);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
}

function drawLayersIcon(ctx, x, y, size, color) {
    ctx.save();
    ctx.translate(x, y);

    ctx.shadowColor = color;
    ctx.shadowBlur = 10;

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const s = size / 24;

    ctx.beginPath();
    ctx.moveTo(12 * s, 20 * s);
    ctx.lineTo(2 * s, 14 * s);
    ctx.lineTo(12 * s, 8 * s);
    ctx.lineTo(22 * s, 14 * s);
    ctx.closePath();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(2 * s, 10 * s);
    ctx.lineTo(12 * s, 16 * s);
    ctx.lineTo(22 * s, 10 * s);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(2 * s, 6 * s);
    ctx.lineTo(12 * s, 12 * s);
    ctx.lineTo(22 * s, 6 * s);
    ctx.lineTo(12 * s, 0 * s);
    ctx.closePath();
    ctx.stroke();

    ctx.restore();
}

function drawCrownIcon(ctx, x, y, size, color) {
    ctx.save();
    ctx.translate(x, y);

    ctx.shadowColor = color;
    ctx.shadowBlur = 15;

    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const s = size / 24;

    ctx.beginPath();
    ctx.moveTo(2 * s, 17 * s);
    ctx.lineTo(2 * s, 7 * s);
    ctx.lineTo(7 * s, 12 * s);
    ctx.lineTo(12 * s, 4 * s);
    ctx.lineTo(17 * s, 12 * s);
    ctx.lineTo(22 * s, 7 * s);
    ctx.lineTo(22 * s, 17 * s);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillRect(2 * s, 18 * s, 20 * s, 3 * s);

    ctx.restore();
}

function drawEventSlot(ctx, event, x, y, width, height, isSelected, time, isMobile) {
    if (!event) return;

    const isLucky = event.id === 'lucky_spin';
    const isTriple = event.id === 'triple_spin';
    const isTripleLucky = event.id === 'triple_lucky_spin';
    const identity = BONUS_IDENTITY[event.id] || BONUS_IDENTITY_FALLBACK;
    const eventColor = identity.color;
    const iconColor = identity.iconColor;
    const rgb = hexToRgb(eventColor);

    ctx.save();

    // Wash only the bottom of the tile, in the event's own single hue: lighting both ends turns the board into a row of plates.
    const wash = ctx.createLinearGradient(x, y + height * 0.32, x, y + height);
    wash.addColorStop(0, `${eventColor}00`);
    wash.addColorStop(0.62, `${eventColor}14`);
    wash.addColorStop(1, `${eventColor}33`);
    ctx.fillStyle = wash;
    ctx.fillRect(x, y + height * 0.32, width, height * 0.68);

    if (isSelected) {
        const pulse = Math.sin(time * Math.PI * 2) * 0.5 + 0.5;

        ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${0.10 + pulse * 0.07})`;
        ctx.fillRect(x, y, width, height);

        ctx.strokeStyle = eventColor;
        ctx.lineWidth = 1;
        ctx.shadowColor = eventColor;
        ctx.shadowBlur = 10;
        ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
        ctx.shadowBlur = 0;

        ctx.fillStyle = eventColor;
        ctx.fillRect(x + 6, y + height - 3, width - 12, 2);
    }

    const sepGradient = isMobile
        ? ctx.createLinearGradient(x, y + height, x + width, y + height)
        : ctx.createLinearGradient(x + width, y, x + width, y + height);
    sepGradient.addColorStop(0, 'transparent');
    sepGradient.addColorStop(0.5, 'rgba(190,198,220,0.08)');
    sepGradient.addColorStop(1, 'transparent');

    ctx.strokeStyle = sepGradient;
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (isMobile) {
        ctx.moveTo(x + width * 0.1, y + height);
        ctx.lineTo(x + width * 0.9, y + height);
    } else {
        ctx.moveTo(x + width, y + height * 0.1);
        ctx.lineTo(x + width, y + height * 0.9);
    }
    ctx.stroke();

    const iconSize = isMobile ? 36 : 44;
    const iconX = x + (width - iconSize) / 2;
    const iconY = y + (height - iconSize) / 2 - (isMobile ? 10 : 14);

    const circleRadius = iconSize / 2 + 4;
    const circleX = x + width / 2;
    const circleY = iconY + iconSize / 2;

    const iconPulse = Math.sin(time * Math.PI * 1.5) * 0.3 + 0.7;

    const iconRgb = hexToRgb(iconColor);
    ctx.beginPath();
    ctx.arc(circleX, circleY, circleRadius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${iconRgb.r}, ${iconRgb.g}, ${iconRgb.b}, ${0.22 * iconPulse})`;
    ctx.fill();

    if (isLucky) {
        drawZapIcon(ctx, iconX, iconY, iconSize, iconColor);
    } else if (isTriple) {
        drawLayersIcon(ctx, iconX, iconY, iconSize, iconColor);
    } else if (isTripleLucky) {
        drawCrownIcon(ctx, iconX, iconY, iconSize, iconColor);
    }

    const labelY = y + height - (isMobile ? 18 : 22);
    const fontSize = isMobile ? 10 : 12;

    ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.shadowColor = eventColor;
    ctx.shadowBlur = 6;
    ctx.fillStyle = eventColor;

    let label = '';
    if (isLucky) label = 'LUCKY SPIN';
    else if (isTriple) label = '5x SPIN';
    else if (isTripleLucky) label = 'TRIPLE LUCKY';

    ctx.fillText(label, x + width / 2, labelY);
    ctx.shadowBlur = 0;

    ctx.restore();
}

/** One frame of the board. The restart effect calls this too; keep it the only copy of the loop. */
function drawBoard(ctx, { width, height, events, offset, isResult, finalIndex, time, isMobile }) {
    ctx.clearRect(0, 0, width, height);

    const deckGradient = ctx.createLinearGradient(0, 0, 0, height);
    deckGradient.addColorStop(0, '#0d1322');
    deckGradient.addColorStop(0.45, '#0a0d18');
    deckGradient.addColorStop(1, '#05060a');
    ctx.fillStyle = deckGradient;
    ctx.fillRect(0, 0, width, height);

    const edgeFade = isMobile
        ? ctx.createLinearGradient(0, 0, 0, height)
        : ctx.createLinearGradient(0, 0, width, 0);
    edgeFade.addColorStop(0, 'rgba(5,6,10,0.85)');
    edgeFade.addColorStop(0.14, 'rgba(5,6,10,0)');
    edgeFade.addColorStop(0.86, 'rgba(5,6,10,0)');
    edgeFade.addColorStop(1, 'rgba(5,6,10,0.85)');
    ctx.fillStyle = edgeFade;
    ctx.fillRect(0, 0, width, height);

    if (isMobile) {
        // On a phone the board is a shaft of full-width rows; drawEventSlot lays out inside any box, so only the arrangement changes.
        const centerY = height / 2 - BONUS_PITCH_MOBILE / 2;
        events.forEach((event, idx) => {
            const eventY = centerY + idx * BONUS_PITCH_MOBILE - offset;
            if (eventY > -BONUS_PITCH_MOBILE && eventY < height + BONUS_PITCH_MOBILE) {
                drawEventSlot(ctx, event, 0, eventY, width, BONUS_PITCH_MOBILE, isResult && idx === finalIndex, time, isMobile);
            }
        });
        return;
    }

    const centerX = width / 2 - BONUS_PITCH / 2;
    events.forEach((event, idx) => {
        const eventX = centerX + idx * BONUS_PITCH - offset;
        if (eventX > -BONUS_PITCH && eventX < width + BONUS_PITCH) {
            drawEventSlot(ctx, event, eventX, 0, BONUS_PITCH, height, isResult && idx === finalIndex, time, isMobile);
        }
    });
}

export function CanvasBonusStrip({
                                     events = [],
                                     offsetRef = null, // Ref object for offset (avoids re-renders during animation)
                                     offset: offsetProp = 0,
                                     isMobile = false,
                                     isSpinning = false,
                                     isResult = false,
                                     finalIndex = 35,
                                 }) {
    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const animationRef = useRef(null);
    const timeRef = useRef(0);
    const [containerWidth, setContainerWidth] = useState(800);
    // Height is measured too: on a phone the board fills the row, so a fixed height would draw a sliver.
    const [containerHeight, setContainerHeight] = useState(STRIP_HEIGHT_MOBILE);

    const propsRef = useRef({ isSpinning, isResult, finalIndex });
    useEffect(() => {
        propsRef.current = { isSpinning, isResult, finalIndex };
    });

    const getOffset = () => offsetRef ? offsetRef.current : offsetProp;

    const height = isMobile ? containerHeight : STRIP_HEIGHT;
    const width = containerWidth;

    useEffect(() => {
        if (!containerRef.current) return;

        const updateWidth = () => {
            if (containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                if (rect && rect.width > 0) {
                    setContainerWidth(rect.width);
                }
                if (rect && rect.height > 0) {
                    setContainerHeight(rect.height);
                }
            }
        };

        const resizeObserver = new ResizeObserver(updateWidth);
        resizeObserver.observe(containerRef.current);
        updateWidth();

        return () => resizeObserver.disconnect();
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || events.length === 0) return;

        const ctx = canvas.getContext('2d');
        let dpr = window.devicePixelRatio || 1;
        let lastTime = performance.now();

        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        ctx.scale(dpr, dpr);

        const render = (timestamp) => {
            const { isSpinning, isResult, finalIndex } = propsRef.current;
            const offset = getOffset();

            const dt = (timestamp - lastTime) / 1000;
            lastTime = timestamp;

            if (isSpinning || isResult) {
                timeRef.current += dt;
            }
            const time = timeRef.current;

            drawBoard(ctx, { width, height, events, offset, isResult, finalIndex, time, isMobile });

            if (isSpinning || isResult) {
                animationRef.current = requestAnimationFrame(render);
            } else {
                animationRef.current = null;
            }
        };

        animationRef.current = requestAnimationFrame(render);

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
                animationRef.current = null;
            }
        };
    }, [events, width, height, isMobile]);

    useEffect(() => {
        if ((isSpinning || isResult) && !animationRef.current) {
            const canvas = canvasRef.current;
            if (!canvas) return;

            const ctx = canvas.getContext('2d');
            const dpr = window.devicePixelRatio || 1;
            let lastTime = performance.now();

            const render = (timestamp) => {
                const { isSpinning: spinning, isResult: result, finalIndex } = propsRef.current;
                const offset = getOffset();
                const dt = (timestamp - lastTime) / 1000;
                lastTime = timestamp;

                if (spinning || result) {
                    timeRef.current += dt;
                }
                const time = timeRef.current;

                ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
                drawBoard(ctx, { width, height, events, offset, isResult: result, finalIndex, time, isMobile });

                if (spinning || result) {
                    animationRef.current = requestAnimationFrame(render);
                } else {
                    animationRef.current = null;
                }
            };
            animationRef.current = requestAnimationFrame(render);
        }
    }, [isSpinning, isResult, events, width, height, isMobile]);

    return (
        <div
            ref={containerRef}
            style={{
                position: 'relative',
                width: '100%',
                // Fills its mount on a phone: sizing from the value being measured would be a feedback loop.
                height: isMobile ? '100%' : `${height}px`,
                overflow: 'hidden',
                zIndex: 6,
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

export default CanvasBonusStrip;