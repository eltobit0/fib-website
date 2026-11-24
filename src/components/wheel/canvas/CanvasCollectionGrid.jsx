import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { IMAGE_BASE_URL } from '../../../config/constants.js';
import { COLORS } from '../config/constants';
import { getItemImageUrl } from '../../../utils/helpers.js';
import { getRarityColor, getRarityInk, getRarityOnColor, getRarityStops, sampleHolo, sampleRamp, createHoloGradient } from '../../../utils/rarityHelpers.jsx';
import { isSaverOn, useSaverMode } from '../../../config/power.js';
import { getAtlasSprite, drawItemSprite, needsOwnImage } from './atlas.js';

// Platform geometry lives with the renderer below (TARGET_CELL / ITEM_GAP / GRID_PADDING); do not restate it here.

function hexToRgb(hex) {
    if (!hex) return { r: 0, g: 0, b: 0 };
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
}

const MAX_CACHE_SIZE = 500;
const imageCache = new Map();
const inFlightPromises = new Map();

function touchCache(src) {
    if (imageCache.has(src)) {
        const value = imageCache.get(src);
        imageCache.delete(src);
        imageCache.set(src, value);
    }
}

function evictIfNeeded() {
    while (imageCache.size > MAX_CACHE_SIZE) {
        // Map iterates in insertion order, so first key is oldest
        const oldestKey = imageCache.keys().next().value;
        imageCache.delete(oldestKey);
    }
}

function loadImage(src) {
    if (imageCache.has(src)) {
        touchCache(src);
        return Promise.resolve(imageCache.get(src));
    }

    if (inFlightPromises.has(src)) {
        return inFlightPromises.get(src);
    }

    const loadPromise = new Promise((resolve) => {
        const img = new Image();
        // Note: crossOrigin not needed since we only draw, never read pixels
        img.onload = () => {
            imageCache.set(src, img);
            evictIfNeeded();
            inFlightPromises.delete(src);
            resolve(img);
        };
        img.onerror = () => {
            const fallback = new Image();
            fallback.onload = () => {
                imageCache.set(src, fallback);
                evictIfNeeded();
                inFlightPromises.delete(src);
                resolve(fallback);
            };
            fallback.onerror = () => {
                // Cache null to prevent repeated attempts
                imageCache.set(src, null);
                evictIfNeeded();
                inFlightPromises.delete(src);
                resolve(null);
            };
            fallback.src = `${IMAGE_BASE_URL}/barrier.png`;
        };
        img.src = src;
    });

    inFlightPromises.set(src, loadPromise);
    return loadPromise;
}

// Tier is a rim around the mount, not the reel's floor wash: a still grid has no travel for a shaft of light to mean.
// A collected common gets no tier colour; a missing item is a dark recess. Tier hues come only from rarityHelpers.jsx.

const ITEM_GAP = 8;      // Room for a rim and its bloom to breathe.
const GRID_PADDING = 14; // So the first row's bloom is not clipped by the mount.
const TARGET_CELL = 88;  // Cell pitch target; the real pitch fills the platform.
const BADGE_SIZE = 15;

function rgbaOf(colour, alpha) {
    const c = typeof colour === 'string' ? hexToRgb(colour) : colour;
    return `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`;
}

/**
 * The tier's live rim, as {stroke, bloom, drift}. Animated tiers stroke with the whole gradient, never one sampled point
 * (insane's ramp passes through other tiers' hues); bloom is flat only because canvas shadowColor cannot take a gradient.
 */
function tierRim(ctx, type, x, size, time) {
    switch (type) {
        case 'insane': {
            const phase = (time % 2.4) / 2.4;
            const s = sampleHolo(phase);
            return {
                stroke: createHoloGradient(ctx, x, size, phase),
                bloom: `rgb(${s.r}, ${s.g}, ${s.b})`,
                drift: 0.18 + Math.sin(phase * Math.PI * 4) * 0.06,
                blur: 20,
            };
        }
        case 'mythic': {
            const s = sampleRamp(COLORS.mythicCycle, (time % 1.5) / 1.5);
            const flat = `rgb(${s.r}, ${s.g}, ${s.b})`;
            return { stroke: flat, bloom: flat, drift: 0.14 + Math.sin((time % 2) / 2 * Math.PI * 2) * 0.06, blur: 18 };
        }
        case 'legendary': {
            // Steady on purpose: motion belongs to the tiers above legendary.
            const flat = getRarityColor('legendary');
            return { stroke: flat, bloom: flat, drift: 0.17, blur: 15 };
        }
        case 'relic':
        case 'exotic':
        case 'rare':
        case 'event': {
            const flat = getRarityColor(type);
            const pulse = Math.sin((time % 2.5) / 2.5 * Math.PI * 2) * 0.5 + 0.5;
            return { stroke: flat, bloom: flat, drift: 0.10 + pulse * 0.07, blur: 13 };
        }
        default:
            return null;
    }
}

function drawTierGlyph(ctx, type, cx, cy, r) {
    ctx.beginPath();
    switch (type) {
        case 'insane': {
            ctx.moveTo(cx - r, cy + r * 0.55);
            ctx.lineTo(cx - r * 1.05, cy - r * 0.75);
            ctx.lineTo(cx - r * 0.42, cy - r * 0.05);
            ctx.lineTo(cx, cy - r * 0.95);
            ctx.lineTo(cx + r * 0.42, cy - r * 0.05);
            ctx.lineTo(cx + r * 1.05, cy - r * 0.75);
            ctx.lineTo(cx + r, cy + r * 0.55);
            ctx.closePath();
            break;
        }
        case 'mythic': {
            ctx.moveTo(cx, cy - r);
            ctx.quadraticCurveTo(cx + r * 0.18, cy - r * 0.18, cx + r, cy);
            ctx.quadraticCurveTo(cx + r * 0.18, cy + r * 0.18, cx, cy + r);
            ctx.quadraticCurveTo(cx - r * 0.18, cy + r * 0.18, cx - r, cy);
            ctx.quadraticCurveTo(cx - r * 0.18, cy - r * 0.18, cx, cy - r);
            break;
        }
        case 'legendary': {
            for (let i = 0; i < 10; i++) {
                const rad = i % 2 === 0 ? r : r * 0.45;
                const a = -Math.PI / 2 + (i * Math.PI) / 5;
                const px = cx + Math.cos(a) * rad;
                const py = cy + Math.sin(a) * rad;
                if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.closePath();
            break;
        }
        case 'relic': {
            ctx.moveTo(cx - r, cy - r * 0.62);
            ctx.lineTo(cx - r * 0.33, cy - r * 0.9);
            ctx.lineTo(cx + r * 0.33, cy - r * 0.62);
            ctx.lineTo(cx + r, cy - r * 0.9);
            ctx.lineTo(cx + r, cy + r * 0.62);
            ctx.lineTo(cx + r * 0.33, cy + r * 0.9);
            ctx.lineTo(cx - r * 0.33, cy + r * 0.62);
            ctx.lineTo(cx - r, cy + r * 0.9);
            ctx.closePath();
            break;
        }
        case 'exotic': {
            ctx.moveTo(cx, cy - r);
            ctx.lineTo(cx + r * 0.92, cy - r * 0.2);
            ctx.lineTo(cx, cy + r);
            ctx.lineTo(cx - r * 0.92, cy - r * 0.2);
            ctx.closePath();
            break;
        }
        default: {
            ctx.moveTo(cx, cy - r);
            ctx.lineTo(cx + r * 0.78, cy);
            ctx.lineTo(cx, cy + r);
            ctx.lineTo(cx - r * 0.78, cy);
            ctx.closePath();
        }
    }
    ctx.fill();
}

function drawItem(ctx, item, x, y, size, isCollected, count, images, time, isHovered, isFocused) {
    const type = item.type || 'common';
    const isSpecial = type !== 'common';
    const tierColor = getRarityColor(type);
    const rim = isSpecial && isCollected ? tierRim(ctx, type, x, size, time) : null;

    ctx.save();

    if (isHovered && isCollected) ctx.translate(0, -3);

    if (rim) {
        const spread = size * 1.25;
        const g = ctx.createRadialGradient(
            x + size / 2, y + size / 2, size * 0.34,
            x + size / 2, y + size / 2, spread * 0.55,
        );
        g.addColorStop(0, rgbaOf(rim.bloom, rim.drift));
        g.addColorStop(0.6, rgbaOf(rim.bloom, rim.drift * 0.3));
        g.addColorStop(1, rgbaOf(rim.bloom, 0));
        ctx.fillStyle = g;
        ctx.fillRect(x - (spread - size) / 2, y - (spread - size) / 2, spread, spread);
    }

    if (isCollected) {
        if (isSpecial) {
            const fill = ctx.createLinearGradient(x, y, x + size, y + size);
            const stops = getRarityStops(type);
            if (stops && stops.length >= 3) {
                // Animated tiers fill with the whole ramp: one sampled point is another tier's colour two thirds of the time.
                fill.addColorStop(0, `${stops[0]}24`);
                fill.addColorStop(0.5, `${stops[1]}1A`);
                fill.addColorStop(1, `${stops[2]}22`);
            } else {
                fill.addColorStop(0, `${tierColor}24`);
                fill.addColorStop(1, `${tierColor}16`);
            }
            ctx.fillStyle = fill;
        } else {
            ctx.fillStyle = 'rgba(206,214,236,0.045)';
        }
    } else {
        ctx.fillStyle = 'rgba(0,0,0,0.34)';
    }
    ctx.fillRect(x, y, size, size);

    ctx.lineWidth = 2;
    if (rim) {
        // Always stroke with rim.stroke (the full gradient on insane); only shadowColor takes the flat sample.
        ctx.strokeStyle = rim.stroke;
        ctx.shadowColor = rim.bloom;
        ctx.shadowBlur = rim.blur;
        ctx.strokeRect(x + 1, y + 1, size - 2, size - 2);
        ctx.shadowBlur = rim.blur * 0.6;
        ctx.strokeRect(x + 1, y + 1, size - 2, size - 2);
        ctx.shadowBlur = 0;
        ctx.strokeRect(x + 1, y + 1, size - 2, size - 2);
    } else {
        ctx.shadowBlur = 0;
        // A held common gets no tier colour: gold means legendary.
        ctx.strokeStyle = isCollected
            ? 'rgba(206,214,236,0.20)'
            : (isSpecial ? `${tierColor}44` : 'rgba(206,214,236,0.07)');
        ctx.lineWidth = isCollected ? 1 : 2;
        ctx.strokeRect(x + 1, y + 1, size - 2, size - 2);
        ctx.lineWidth = 2;
    }

    const imgSrc = getItemImageUrl(item);
    const img = images.get(imgSrc);
    const imgSize = Math.round(size * 0.62);
    const imgX = x + (size - imgSize) / 2;
    const imgY = y + (size - imgSize) / 2;

    if (img || getAtlasSprite(item)) {
        ctx.save();
        if (!isCollected) {
            ctx.globalAlpha = 0.18;
            if ('filter' in ctx) ctx.filter = 'grayscale(100%)';
        }
        // Every sprite here is a downscale, and nearest-neighbour downscaling shimmers frame to frame.
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        drawItemSprite(ctx, item, img, imgX, imgY, imgSize);
        ctx.filter = 'none';
        ctx.globalAlpha = 1;
        ctx.restore();
    } else if (isCollected) {
        ctx.fillStyle = 'rgba(206,214,236,0.05)';
        ctx.fillRect(imgX, imgY, imgSize, imgSize);
    }

    // Vector marks, not unicode glyphs, which differ per OS from the DOM's Lucide icons.
    if (isSpecial) {
        const bx = x + size - BADGE_SIZE / 2 - 1;
        const by = y + BADGE_SIZE / 2 + 1;

        ctx.beginPath();
        ctx.arc(bx, by, BADGE_SIZE / 2, 0, Math.PI * 2);
        ctx.fillStyle = isCollected ? (rim ? rim.bloom : tierColor) : 'rgba(10,13,24,0.92)';
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = isCollected ? 'rgba(0,0,0,0.35)' : `${tierColor}55`;
        ctx.stroke();

        ctx.fillStyle = isCollected ? getRarityOnColor(type) : `${tierColor}99`;
        drawTierGlyph(ctx, type, bx, by, BADGE_SIZE * 0.29);
    }

    if (count > 1) {
        ctx.font = "700 13px 'Barlow Condensed', system-ui, sans-serif";
        ctx.textAlign = 'right';
        ctx.textBaseline = 'alphabetic';
        ctx.shadowColor = 'rgba(0,0,0,0.9)';
        ctx.shadowBlur = 3;
        ctx.fillStyle = isSpecial
            ? rgbaOf(hexToRgb(getRarityInk(type)), 0.98)
            : 'rgba(206,214,236,0.86)';
        ctx.fillText(`${count}`, x + size - 5, y + size - 5);
        ctx.shadowBlur = 0;
    }

    // Focus caret in station amber, never a tier colour, drawn outside the rim.
    if (isFocused) {
        ctx.strokeStyle = '#FFAA00';
        ctx.lineWidth = 2;
        ctx.strokeRect(x - 2, y - 2, size + 4, size + 4);
    }

    ctx.restore();
}

export function CanvasCollectionGrid({
                                         items = [],
                                         collection = {},
                                         onItemClick,
                                         onItemFocus,
                                         containerHeight = 400,
                                     }) {
    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const animationRef = useRef(null);
    const imagesRef = useRef(new Map());
    const timeRef = useRef(0);

    const scrollTopRef = useRef(0);
    const containerWidthRef = useRef(400);
    const hoveredIndexRef = useRef(-1);
    // A ref: the loop reads it every frame and a state write per arrow key would tear down the RAF effect.
    const focusedIndexRef = useRef(-1);
    const scrollerRef = useRef(null);

    const [containerWidth, setContainerWidth] = useState(400);
    const [scrollTop, setScrollTop] = useState(0);

    const layout = useMemo(() => {
        // `cellSize` is the pitch (divides the platform exactly); `tileSize` is the mount drawn inside it, leaving room for the rim.
        const availableWidth = Math.max(TARGET_CELL, containerWidth - GRID_PADDING * 2);
        const cols = Math.max(1, Math.round(availableWidth / TARGET_CELL));
        const cellSize = availableWidth / cols;
        const tileSize = cellSize - ITEM_GAP;
        const rows = Math.ceil(items.length / cols);
        const totalHeight = rows * cellSize + GRID_PADDING * 2;
        return { cols, rows, cellSize, tileSize, totalHeight };
    }, [containerWidth, items.length]);

    const layoutRef = useRef(layout);
    useEffect(() => {
        layoutRef.current = layout;
    }, [layout]);

    useEffect(() => {
        if (items.length === 0) return;

        const { cols, cellSize } = layout;
        const adjustedScrollTop = Math.max(0, scrollTop - GRID_PADDING);
        const startRow = Math.floor(adjustedScrollTop / cellSize);
        const visibleRows = Math.ceil(containerHeight / cellSize) + 2;
        const endRow = Math.min(startRow + visibleRows, layout.rows);

        const visibleItems = [];
        for (let row = startRow; row < endRow; row++) {
            for (let col = 0; col < cols; col++) {
                const idx = row * cols + col;
                if (idx < items.length) {
                    visibleItems.push(items[idx]);
                }
            }
        }

        // Pool sprites come from the atlas, so this loads only heads and custom art.
        Promise.all(visibleItems.filter(needsOwnImage).map(item => {
            const src = getItemImageUrl(item);
            return loadImage(src).then(img => {
                if (img) imagesRef.current.set(src, img);
            });
        })).then(() => {
            // In saver mode a parked loop has no next frame, so a late sprite must ask for one.
            requestDrawRef.current?.();
        }).catch(err => {
            console.warn('Failed to preload some collection images:', err);
        });
    }, [items, layout, scrollTop, containerHeight]);

    useEffect(() => {
        if (!containerRef.current) return;

        const updateWidth = (width) => {
            containerWidthRef.current = width;
            setContainerWidth(width);
        };

        if (typeof ResizeObserver !== 'undefined') {
            const observer = new ResizeObserver(entries => {
                for (const entry of entries) {
                    updateWidth(entry.contentRect.width);
                }
            });

            observer.observe(containerRef.current);
            return () => observer.disconnect();
        } else {
            const handleResize = () => {
                if (containerRef.current) {
                    updateWidth(containerRef.current.getBoundingClientRect().width);
                }
            };
            handleResize();
            window.addEventListener('resize', handleResize);
            return () => window.removeEventListener('resize', handleResize);
        }
    }, []);

    const lastSizeRef = useRef({ width: 0, height: 0, dpr: 1 });

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const dpr = window.devicePixelRatio || 1;
        const width = containerWidth;
        const height = containerHeight;

        if (lastSizeRef.current.width !== width ||
            lastSizeRef.current.height !== height ||
            lastSizeRef.current.dpr !== dpr) {

            canvas.width = width * dpr;
            canvas.height = height * dpr;
            canvas.style.width = `${width}px`;
            canvas.style.height = `${height}px`;

            const ctx = canvas.getContext('2d');
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            lastSizeRef.current = { width, height, dpr };
        }
    }, [containerWidth, containerHeight]);

    const itemsRef = useRef(items);
    const collectionRef = useRef(collection);
    const parkedRef = useRef(false);
    const renderRef = useRef(null);
    const saverMode = useSaverMode();
    // A ref because `requestDraw` is declared after the sprite preloader that calls it.
    const requestDrawRef = useRef(null);
    useEffect(() => {
        itemsRef.current = items;
    }, [items]);
    useEffect(() => {
        collectionRef.current = collection;
    }, [collection]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let lastTime = performance.now();
        let frameCount = 0;
        const isMobileDevice = typeof window !== 'undefined' && window.innerWidth < 600;

        const render = (timestamp) => {
            frameCount++;
            if (isMobileDevice && frameCount % 2 !== 0) {
                animationRef.current = requestAnimationFrame(render);
                return;
            }

            // Saver mode draws one frame and parks; `requestDraw` wakes it on scroll, hover or new data.
            if (parkedRef.current) {
                animationRef.current = null;
                return;
            }
            const shouldPark = isSaverOn();

            const dt = (timestamp - lastTime) / 1000;
            lastTime = timestamp;
            timeRef.current += dt;
            const time = timeRef.current;

            const currentItems = itemsRef.current;
            const currentCollection = collectionRef.current;
            const currentLayout = layoutRef.current;
            const currentScrollTop = scrollTopRef.current;
            const currentHoveredIndex = hoveredIndexRef.current;
            const height = containerHeight;

            const dpr = window.devicePixelRatio || 1;
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            const { cols, cellSize, tileSize, rows } = currentLayout;
            const adjustedScrollTop = Math.max(0, currentScrollTop - GRID_PADDING);
            const startRow = Math.floor(adjustedScrollTop / cellSize);
            const visibleRows = Math.ceil(height / cellSize) + 2;
            const endRow = Math.min(startRow + visibleRows, rows);

            for (let row = startRow; row < endRow; row++) {
                for (let col = 0; col < cols; col++) {
                    const idx = row * cols + col;
                    if (idx >= currentItems.length) continue;

                    const item = currentItems[idx];
                    const x = GRID_PADDING + col * cellSize + ITEM_GAP / 2;
                    const y = GRID_PADDING + row * cellSize + ITEM_GAP / 2 - currentScrollTop;
                    const count = currentCollection[item.texture] || 0;
                    const isCollected = count > 0;
                    const isHovered = idx === currentHoveredIndex;
                    const isFocused = idx === focusedIndexRef.current;

                    drawItem(ctx, item, x, y, tileSize, isCollected, count, imagesRef.current, time, isHovered, isFocused);
                }
            }

            if (shouldPark) {
                parkedRef.current = true;
                animationRef.current = null;
                return;
            }

            animationRef.current = requestAnimationFrame(render);
        };

        renderRef.current = render;
        parkedRef.current = false;
        animationRef.current = requestAnimationFrame(render);

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
                animationRef.current = null;
            }
        };
    }, [containerHeight]);

    /** Ask for a frame. Cheap and idempotent: called on every scroll and pointer move. */
    const requestDraw = useCallback(() => {
        if (!parkedRef.current || !renderRef.current) return;
        parkedRef.current = false;
        animationRef.current = requestAnimationFrame(renderRef.current);
    }, []);

    // Published in an effect, not during render (a discarded render would leave its callback in the ref).
    // The cleanup clears the slot only if it still holds this callback.
    useEffect(() => {
        requestDrawRef.current = requestDraw;
        return () => {
            if (requestDrawRef.current === requestDraw) requestDrawRef.current = null;
        };
    }, [requestDraw]);

    useEffect(() => { requestDraw(); }, [items, collection, saverMode, requestDraw]);

    const getItemIndexAtPoint = useCallback((clientX, clientY, rect) => {
        const x = clientX - rect.left - GRID_PADDING;
        const y = clientY - rect.top;

        const { cols, cellSize } = layoutRef.current;
        const col = Math.floor(x / cellSize);
        const row = Math.floor((y + scrollTopRef.current - GRID_PADDING) / cellSize);
        const idx = row * cols + col;

        if (idx >= 0 && idx < itemsRef.current.length && col >= 0 && col < cols && row >= 0) {
            return idx;
        }
        return -1;
    }, []);

    // onItemFocus fires only when the index changes; that early return is also the gate for waking a parked loop on hover.
    const announce = useCallback((idx, force = false) => {
        if (idx === hoveredIndexRef.current && !force) return;
        hoveredIndexRef.current = idx;
        requestDraw();
        if (!onItemFocus) return;
        const item = idx >= 0 ? itemsRef.current[idx] : null;
        const rect = scrollerRef.current?.getBoundingClientRect();
        const { cols, cellSize } = layoutRef.current;
        const left = rect ? Math.min(rect.left + GRID_PADDING + (idx % cols) * cellSize, window.innerWidth - 284) : 16;
        const top = rect ? Math.max(8, rect.top + GRID_PADDING + Math.floor(idx / cols) * cellSize - scrollTopRef.current - 88) : 16;
        onItemFocus(item
            ? { name: item.name, type: item.type || 'common', held: collectionRef.current[item.texture] || 0, left: Math.max(8, left), top }
            : null);
    }, [onItemFocus, requestDraw]);

    // Scrolling fires no mousemove, so the last pointer position re-resolves the hover after a scroll.
    const pointerRef = useRef(null);

    const handleMouseMove = useCallback((e) => {
        pointerRef.current = { x: e.clientX, y: e.clientY };
        const rect = e.currentTarget.getBoundingClientRect();
        announce(getItemIndexAtPoint(e.clientX, e.clientY, rect));
    }, [getItemIndexAtPoint, announce]);

    const handleMouseLeave = useCallback(() => {
        pointerRef.current = null;
        announce(-1);
    }, [announce]);

    const handleScroll = useCallback((e) => {
        const newScrollTop = e.target.scrollTop;
        scrollTopRef.current = newScrollTop;
        setScrollTop(newScrollTop);

        // Before the hover check: the board moved, so a parked canvas is stale even if the hovered item did not change.
        requestDraw();

        // Skip if the keyboard owns the platform.
        const pt = pointerRef.current;
        if (pt && focusedIndexRef.current < 0) {
            announce(getItemIndexAtPoint(pt.x, pt.y, e.target.getBoundingClientRect()), true);
        }
    }, [announce, getItemIndexAtPoint, requestDraw]);

    /** Arrow-key navigation: one tab stop for the whole platform, with a caret drawn by drawItem. */
    const handleKeyDown = useCallback((e) => {
        const items = itemsRef.current;
        if (items.length === 0) return;

        const { cols, cellSize } = layoutRef.current;
        const current = focusedIndexRef.current;
        let next = current;

        switch (e.key) {
            case 'ArrowRight': next = current < 0 ? 0 : Math.min(current + 1, items.length - 1); break;
            case 'ArrowLeft': next = current < 0 ? 0 : Math.max(current - 1, 0); break;
            case 'ArrowDown': next = current < 0 ? 0 : Math.min(current + cols, items.length - 1); break;
            case 'ArrowUp': next = current < 0 ? 0 : Math.max(current - cols, 0); break;
            case 'Home': next = 0; break;
            case 'End': next = items.length - 1; break;
            case 'Enter':
            case ' ':
                if (current >= 0 && onItemClick) { e.preventDefault(); onItemClick(items[current]); }
                return;
            default: return;
        }

        e.preventDefault();
        focusedIndexRef.current = next;
        // Request a frame directly: `announce` returns early when arrowing onto the already-hovered cell.
        requestDraw();
        announce(next);

        // Measured against the scroller's own height: the platform flexes with the board.
        const scroller = scrollerRef.current;
        if (scroller) {
            const top = GRID_PADDING + Math.floor(next / cols) * cellSize;
            const view = scroller.clientHeight;
            if (top < scroller.scrollTop) scroller.scrollTop = top;
            else if (top + cellSize > scroller.scrollTop + view) scroller.scrollTop = top + cellSize - view;
        }
    }, [onItemClick, announce, requestDraw]);

    // Tap to open, but not after a fling: more than eight pixels of movement, or any scroll, means it was a scroll.
    const pressRef = useRef(null);

    const handlePointerDown = useCallback((e) => {
        pressRef.current = { x: e.clientX, y: e.clientY, scroll: scrollTopRef.current };
    }, []);

    const handleClick = useCallback((e) => {
        if (!onItemClick) return;

        const press = pressRef.current;
        pressRef.current = null;
        if (press) {
            const moved = Math.hypot(e.clientX - press.x, e.clientY - press.y);
            if (moved > 8 || Math.abs(scrollTopRef.current - press.scroll) > 2) return;
        }

        const rect = e.currentTarget.getBoundingClientRect();
        const idx = getItemIndexAtPoint(e.clientX, e.clientY, rect);

        if (idx >= 0) {
            onItemClick(itemsRef.current[idx]);
        }
    }, [getItemIndexAtPoint, onItemClick]);

    return (
        <div
            ref={containerRef}
            style={{
                position: 'relative',
                width: '100%',
                height: `${containerHeight}px`,
                overflow: 'hidden',
            }}
        >
            <div id="fib-collection-count" className="fib-sr-only">
                {items.length} items
            </div>

            <canvas
                ref={canvasRef}
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    pointerEvents: 'none',
                }}
            />

            <div
                ref={scrollerRef}
                onScroll={handleScroll}
                onClick={handleClick}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                onKeyDown={handleKeyDown}
                onPointerDown={handlePointerDown}
                // Focus lands on the first cell, or the first arrow key appears to do nothing.
                onFocus={() => {
                    if (focusedIndexRef.current < 0 && itemsRef.current.length > 0) {
                        focusedIndexRef.current = 0;
                        announce(0);
                    }
                }}
                onBlur={() => {
                    focusedIndexRef.current = -1;
                    const pt = pointerRef.current;
                    if (pt && scrollerRef.current) {
                        announce(getItemIndexAtPoint(pt.x, pt.y, scrollerRef.current.getBoundingClientRect()));
                    } else {
                        announce(-1);
                    }
                }}
                tabIndex={0}
                aria-label="Collection items"
                aria-describedby="fib-collection-count"
                className="fib-board-scroll fib-platform-scroll"
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    overflowY: 'auto',
                    overflowX: 'hidden',
                    cursor: 'pointer',
                    zIndex: 1,
                }}
            >
                <div style={{ height: `${layout.totalHeight}px`, pointerEvents: 'none' }} />
            </div>

            {/* Fallback only: the board upstairs explains an empty filtered platform itself. */}
            {items.length === 0 && (
                <div style={{
                    position: 'absolute', inset: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: "'Barlow Condensed', system-ui, sans-serif",
                    fontSize: '13px', fontWeight: 700, letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: 'rgba(206,214,236,0.34)',
                    zIndex: 2,
                }}>
                    No items on this board
                </div>
            )}
        </div>
    );
}

export default CanvasCollectionGrid;