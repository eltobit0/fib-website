import { ARENA } from '../config/arenaTheme.js';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ITEM_WIDTH, STRIP_HEIGHT, IMAGE_BASE_URL } from '../../../config/constants.js';
import { COLORS } from '../config/constants';
import { getItemImageUrl, isInsaneItem, isSpecialItem, isExoticItem, isRelicItem, isRareItem, isMythicItem, isEventItem, isRecursionItem } from '../../../utils/helpers.js';
import { sampleRamp } from '../../../utils/rarityHelpers.jsx';
import { prefersCalm, isSaverOn, useSaverMode } from '../../../config/power.js';
import { getAtlasSprite, drawItemSprite, needsOwnImage } from './atlas.js';

// Shared with WheelSpinner's landing maths as MOBILE_ROW_PITCH; keep it the single definition.
export const MOBILE_ROW_PITCH = 128;

/** The desktop band's front lip, in pixels. Columns stand on the shelf behind it (see `floorInset` in drawItem). */
const LIP_H = 3;

/** The phone shaft's per-row sill, in pixels: LIP_H's counterpart, smaller because a 128px row cannot spare three. */
const SILL_H = 2;

/** Seconds a landed result keeps the loop alive in saver mode: the ~450ms bloom decay plus margin for slow phones. */
const PARK_AFTER_RESULT = 1.2;

/**
 * Whether the viewer asked for less motion; read live because it can change mid-session.
 * Freezes ambient motion (breath, embers, hue drift, line pulse) but never the reel's travel, and keeps the gradients.
 */
function prefersReducedMotion() {
    return prefersCalm();
}

// Tier colours come from utils/rarityHelpers.jsx (sampleRamp for the animated tiers); do not add a local copy.

const imageCache = new Map();
let barrierImage = null;

function loadBarrierImage() {
    if (barrierImage) return Promise.resolve(barrierImage);
    if (typeof Image === 'undefined') return Promise.resolve(null);

    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            barrierImage = img;
            resolve(img);
        };
        img.onerror = () => resolve(null);
        // Vendored, not remote: the fallback is most wanted while the network is already failing.
        img.src = `${IMAGE_BASE_URL}/barrier.png`;
    });
}

function loadImage(src) {
    if (imageCache.has(src)) {
        return Promise.resolve(imageCache.get(src));
    }

    if (typeof Image === 'undefined') {
        imageCache.set(src, null);
        return Promise.resolve(null);
    }

    return new Promise((resolve) => {
        const img = new Image();
        // Note: crossOrigin not needed since we only draw, never read pixels
        img.onload = () => {
            imageCache.set(src, img);
            resolve(img);
        };
        img.onerror = () => {
            loadBarrierImage().then(fallback => {
                imageCache.set(src, fallback);
                resolve(fallback);
            });
        };
        img.src = src;
    });
}

/** A colour pushed toward white, for the hot core of a light; the falloff keeps the tier's hue. */
function mixWhite(c, t) {
    return {
        r: Math.round(c.r + (255 - c.r) * t),
        g: Math.round(c.g + (255 - c.g) * t),
        b: Math.round(c.b + (255 - c.b) * t),
    };
}

function hexToRgb(hex) {
    if (!hex) return { r: 255, g: 170, b: 0 };
    const cleanHex = hex.replace('#', '');
    return {
        r: parseInt(cleanHex.substr(0, 2), 16) || 0,
        g: parseInt(cleanHex.substr(2, 2), 16) || 0,
        b: parseInt(cleanHex.substr(4, 2), 16) || 0
    };
}

/** A stable 0..1 number from a string. Keyed off the item, not x, or per-slot effects swim as the strip travels. */
function hashUnit(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 10000) / 10000;
}

/**
 * One reel slot, drawn as a column of light over a base bar.
 * `bandTop`/`bandHeight` are the band it fills: the whole canvas on desktop, the slot's own row on mobile.
 */
/**
 * The candidacy rim, cached per item as a white rim tinted at draw time. Stamping it live with canvas shadows
 * cost ~17.8 ms per slot; measure canvas shadows. The sprite is punched out, so the rim can never touch the art.
 */
const RIM_CAN = 96;
const RIM_PAD = 18;
const RIM_BOX = RIM_CAN + RIM_PAD * 2;
const RIM_CACHE_MAX = 96;
const rimCache = new Map();
let rimScratch = null;

function getRimSprite(item, img) {
    const key = getItemImageUrl(item) || item.texture || item.item_name || item.name;
    if (!key) return null;

    const hit = rimCache.get(key);
    if (hit) {
        rimCache.delete(key);
        rimCache.set(key, hit);
        return hit;
    }

    const rc = document.createElement('canvas');
    rc.width = RIM_BOX;
    rc.height = RIM_BOX;
    const r = rc.getContext('2d');
    if (!r) return null;
    r.imageSmoothingEnabled = true;
    r.imageSmoothingQuality = 'high';
    r.globalCompositeOperation = 'lighter';
    r.shadowColor = 'rgba(255,255,255,1)';

    // The sprite is drawn a box above the canvas and only its shadow lands, outlining the silhouette rather than the box.
    const OFF = RIM_BOX;
    const stamp = (dx, dy) => {
        r.shadowOffsetX = dx;
        r.shadowOffsetY = OFF + dy;
        return drawItemSprite(r, item, img, RIM_PAD, RIM_PAD - OFF, RIM_CAN);
    };

    r.shadowBlur = RIM_CAN * 0.17;
    r.globalAlpha = 0.5;
    if (!stamp(0, 0)) return null;          // sprite not loaded yet; don't cache a blank
    r.shadowBlur = RIM_CAN * 0.055;
    r.globalAlpha = 0.55;
    stamp(0, 0);

    r.shadowBlur = 0;
    r.globalAlpha = 0.3;
    const d = 0.7071;
    const rr = RIM_CAN * 0.042;
    const ring = [[1, 0], [-1, 0], [0, 1], [0, -1], [d, d], [-d, d], [d, -d], [-d, -d]];
    for (let i = 0; i < ring.length; i++) stamp(ring[i][0] * rr, ring[i][1] * rr);

    r.shadowOffsetX = 0;
    r.shadowOffsetY = 0;
    r.shadowBlur = 0;
    r.globalAlpha = 1;
    r.globalCompositeOperation = 'destination-out';
    drawItemSprite(r, item, img, RIM_PAD, RIM_PAD, RIM_CAN);

    if (rimCache.size >= RIM_CACHE_MAX) rimCache.delete(rimCache.keys().next().value);
    rimCache.set(key, rc);
    return rc;
}

function drawItem(ctx, item, x, y, size, isWinning, showRecursionEffects, images, time, isLuckySpin = false, isKotwLucky = false, bandHeight = 0, bandTop = 0, calm = false, floorInset = 0, seamAxis = 'x', candidacy = 0, lampRgb = null, arena = false) {
    if (!item) return;

    const isInsane = isInsaneItem(item);
    const isSpecial = isSpecialItem(item);
    const isMythic = isMythicItem(item);
    const isExotic = isExoticItem(item);
    const isRelic = isRelicItem(item);
    const isRare = isRareItem(item);
    const isEvent = isEventItem(item);
    const isRecursionType = isRecursionItem(item);

    // Every tier must appear in BOTH of these: `isSpecialType` gates the column, beams and bar, so a missing tier renders as a common.
    const isLuckyCommon = isLuckySpin && !isInsane && !isMythic && !isSpecial && !isExotic && !isRelic && !isRare && !isEvent && !isRecursionType;
    const isSpecialType = isInsane || isMythic || isSpecial || isExotic || isRelic || isRare || isEvent || isRecursionType || isLuckyCommon;

    const KOTW_CRIMSON = '#F43F5E';
    const KOTW_GOLD = '#F59E0B';

    // T/B are the band's top and bottom; F is the floor the column stands on (above the desktop lip; equals B on mobile).
    const H = bandHeight || size;
    const T = bandTop;
    const B = T + H;
    const F = B - floorInset;
    // Frozen under reduced motion: the animated tiers keep their gradient and stop travelling through it.
    const phase = calm ? 0 : (time % 3.2) / 3.2;

    let stops;
    if (isRecursionType) {
        const c = hexToRgb(COLORS.recursion);
        stops = [c, c, c];
    } else if (isInsane) {
        stops = [sampleRamp(COLORS.insaneHolo, phase),
                 sampleRamp(COLORS.insaneHolo, phase + 0.16),
                 sampleRamp(COLORS.insaneHolo, phase + 0.32)];
    } else if (isMythic) {
        stops = [sampleRamp(COLORS.mythicCycle, phase),
                 sampleRamp(COLORS.mythicCycle, phase + 0.16),
                 sampleRamp(COLORS.mythicCycle, phase + 0.32)];
    } else {
        let flat;
        if (isEvent) flat = COLORS.gold;
        else if (isSpecial) flat = COLORS.insane;
        else if (isRelic) flat = COLORS.relic;
        else if (isExotic) flat = COLORS.purple;
        else if (isRare) flat = COLORS.red;
        else if (arena) flat = ARENA.gold;
        else if (isLuckyCommon) flat = isKotwLucky ? KOTW_CRIMSON : COLORS.green;
        else if (isKotwLucky) flat = KOTW_GOLD;
        else if (showRecursionEffects) flat = COLORS.recursion;
        else flat = '#6E7391';
        const c = hexToRgb(flat);
        stops = [c, c, c];
    }
    const rgb = (c, a) => `rgba(${c.r}, ${c.g}, ${c.b}, ${a})`;

    ctx.save();

    // The winner's geometry holds still on purpose (a breathing column or sprite reads mechanical); `winnerLightPulse` breathes the light instead.

    // A hairline inset: the seam does the separating, and a wider gap reads as corduroy.
    const gap = Math.max(1, size * 0.012);
    const colX = x + gap;
    const colW = size - gap * 2;

    const rowMode = seamAxis === 'y';

    // The seam fades upward from the floor (or toward the edges for a shaft row); full-height seams turn every common back into a box.
    if (seamAxis === 'y') {
        const edge = size * 0.16;
        const rowSeam = (color, alpha) => {
            const g = ctx.createLinearGradient(x, 0, x + size, 0);
            g.addColorStop(0, `rgba(${color},0)`);
            g.addColorStop(edge / size, `rgba(${color},${alpha})`);
            g.addColorStop(1 - edge / size, `rgba(${color},${alpha})`);
            g.addColorStop(1, `rgba(${color},0)`);
            return g;
        };
        ctx.fillStyle = rowSeam('0,0,0', 0.34);
        ctx.fillRect(x, F - 0.5, size, 1);
        ctx.fillStyle = rowSeam('190,198,220', 0.10);
        ctx.fillRect(x, F + 0.5, size, 1);
    } else if (seamAxis === 'x') {
        const seamDark = ctx.createLinearGradient(0, T, 0, F);
        seamDark.addColorStop(0, 'rgba(0,0,0,0)');
        seamDark.addColorStop(0.55, 'rgba(0,0,0,0)');
        seamDark.addColorStop(1, 'rgba(0,0,0,0.34)');
        ctx.fillStyle = seamDark;
        ctx.fillRect(x - 0.5, T, 1, F - T);

        const seamLight = ctx.createLinearGradient(0, T, 0, F);
        seamLight.addColorStop(0, 'rgba(190,198,220,0)');
        seamLight.addColorStop(0.55, 'rgba(190,198,220,0)');
        seamLight.addColorStop(1, 'rgba(190,198,220,0.10)');
        ctx.fillStyle = seamLight;
        ctx.fillRect(x + 0.5, T, 1, F - T);
    }

    const weight = isInsane ? 1.1 : isMythic ? 1.02 : isSpecialType ? 0.96 : 0.34;
    const lift = isWinning ? 1.35 : 1;

    // How much of the treatment below a tier earns; commons stay at 0 and completely inert.
    const energy = isInsane ? 1
        : isMythic ? 0.92
            : isSpecial ? 0.82
                : isEvent || isRecursionType ? 0.78
                    : isRelic ? 0.75
                        : isExotic ? 0.71
                            : isRare ? 0.60
                                : isLuckyCommon ? 0.5
                                    : 0;

    // Offset per item so neighbouring rare slots do not pulse in lockstep.
    const seed = hashUnit(item.texture || item.item_name || item.name || String(item.id ?? 0));
    const breathe = calm ? 1 : 1 + Math.sin(time * 2.1 + seed * Math.PI * 2) * 0.16 * energy;

    // The spill throws a rare column's light onto its neighbours. Additive, so it lights rather than tints them.
    if (energy > 0.3) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        // Sized off the band's shorter axis: in the shaft `size` is the whole screen, and the rect would clip a still-bright gradient.
        const spillR = Math.min(size, H) * (0.8 + 0.55 * energy);
        const spillX = x + size / 2;
        const spillY = rowMode ? (T + F) / 2 : F - H * 0.12;
        const spillG = ctx.createRadialGradient(spillX, spillY, 0, spillX, spillY, spillR);
        spillG.addColorStop(0, rgb(mixWhite(stops[2], 0.22), 0.13 * energy * breathe));
        spillG.addColorStop(0.4, rgb(stops[1], 0.055 * energy * breathe));
        spillG.addColorStop(1, rgb(stops[1], 0));
        ctx.fillStyle = spillG;
        // Unclipped in the shaft: clipping to the row cut both edges.
        if (rowMode) {
            ctx.fillRect(spillX - spillR, spillY - spillR, spillR * 2, spillR * 2);
        } else {
            ctx.fillRect(spillX - spillR, T, spillR * 2, H);
        }
        ctx.restore();
    }

    // The wash is four nested widths (one gradient runs along one axis only), so the column fades sideways too.
    const glow = weight * lift * breathe;
    // Sampled from a smooth curve; do not go back to a handful of stops, which Mach-band into visible lines. Retune WASH_PEAK / WASH_GAMMA.
    // Shaft rows are centre-lit, or stacked floor-lit rows meet bright-against-dark. Rows need ~18 passes to stop striping,
    // and `spread` follows from the pass count (1-(1-a)^N); change them together.
    const WASH_PEAK = 0.58;
    const WASH_GAMMA = rowMode ? 1.7 : 2.33;
    const passes = rowMode ? 18 : 4;
    const spread = rowMode ? 12.3 : 3;
    const wash = ctx.createLinearGradient(0, T, 0, F);
    for (let i = 0; i <= 16; i++) {
        const t = i / 16;
        const shape = rowMode
            ? Math.pow(1 - Math.abs(2 * t - 1), WASH_GAMMA)
            : Math.pow(t, WASH_GAMMA);
        const c = t < 0.5 ? stops[t < 0.25 ? 0 : 1] : stops[t < 0.85 ? 1 : 2];
        wash.addColorStop(t, rgb(c, WASH_PEAK * shape * glow / spread));
    }
    ctx.fillStyle = wash;
    // The widest pass stops at 88% so the seam, not the end of the light, divides slots; the fill stops at F, not B.
    const spine = x + size / 2;
    for (let p = 0; p < passes; p++) {
        const frac = passes === 4
            ? [0.88, 0.7, 0.52, 0.34][p]
            : 0.94 - (0.94 - 0.26) * (p / (passes - 1));
        const w = colW * frac;
        ctx.fillRect(spine - w / 2, T, w, F - T);
    }

    // A weaker ceiling wash, scaled by energy: lighting commons at both ends makes them read as boxes.
    if (energy > 0) {
        const crown = ctx.createLinearGradient(0, T, 0, T + H * 0.34);
        crown.addColorStop(0, rgb(stops[0], 0.10 * glow * energy));
        crown.addColorStop(1, rgb(stops[0], 0));
        ctx.fillStyle = crown;
        ctx.fillRect(colX, T, colW, H * 0.34);
    }

    // The base bar: tiers with energy get defined ends, commons get faded ones. Shaft rows get none (it would be a hard line at every pitch).
    if (rowMode && !isWinning) {
        // Skip the bar, the filament and the floor treatments below it.
    } else {
    const barH = isSpecialType ? 4 : 3;
    ctx.shadowColor = rgb(stops[2], 0.9);
    ctx.shadowBlur = (isInsane ? 22 : isSpecialType ? 16 : 7) * breathe;
    // A winner always gets the bar with ends, so a near-seam landing still shows which slot the line points at.
    if (energy > 0 || isWinning) {
        ctx.fillStyle = rgb(stops[2], isWinning ? 1 : 0.92);
    } else {
        const spill = ctx.createLinearGradient(colX, 0, colX + colW, 0);
        spill.addColorStop(0, rgb(stops[2], 0));
        spill.addColorStop(0.5, rgb(stops[2], isWinning ? 1 : 0.86));
        spill.addColorStop(1, rgb(stops[2], 0));
        ctx.fillStyle = spill;
    }
    ctx.fillRect(colX, F - barH, colW, barH);
    ctx.shadowBlur = 0;

    // The filament: additive white on the bar's top pixel, so top tiers have a hot core.
    if (energy >= 0.45) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(255, 255, 255, ${0.42 * energy * breathe})`;
        ctx.fillRect(colX, F - barH, colW, 1);
        ctx.restore();
    }
    }

    // Shaft walls; how far up they reach is itself a rung on the ladder.
    if (energy > 0.35) {
        const wallTop = T + H * (0.52 - 0.30 * energy);
        const wall = ctx.createLinearGradient(0, F, 0, wallTop);
        wall.addColorStop(0, rgb(stops[2], (0.2 + 0.5 * energy) * breathe));
        wall.addColorStop(1, rgb(stops[1], 0));
        ctx.fillStyle = wall;
        const wallW = 1.5 + energy * 0.8;
        ctx.fillRect(colX, wallTop, wallW, F - wallTop);
        ctx.fillRect(colX + colW - wallW, wallTop, wallW, F - wallTop);
    }

    // Floor flare. Radius from the band's shorter axis and the rect covering the whole row, or the shaft draws a hard line across every tile.
    if (energy > 0.3) {
        const flareR = Math.min(size, H) * 0.75;
        const flareY = rowMode ? (T + F) / 2 : F;
        const flare = ctx.createRadialGradient(
            x + size / 2, flareY, 0,
            x + size / 2, flareY, flareR,
        );
        flare.addColorStop(0, rgb(stops[2], (0.22 + 0.42 * energy) * breathe));
        flare.addColorStop(1, rgb(stops[2], 0));
        ctx.fillStyle = flare;
        const flareTop = rowMode ? T : T + H * 0.4;
        ctx.fillRect(colX, flareTop, colW, F - flareTop);
    }

    // Embers are seeded off the item, not `x`, so they stay with their slot.
    if (energy >= 0.6) {
        const count = isInsane ? 5 : isMythic ? 4 : 3;
        for (let i = 0; i < count; i++) {
            const s = (seed + i * 0.37) % 1;
            // Under reduced motion each mote holds at its own height.
            const climb = calm ? (0.2 + s * 0.55) : (time * (0.16 + s * 0.12) + s) % 1;
            const my = F - climb * H * 0.85;
            const mx = x + size * (0.18 + s * 0.64);
            const fade = Math.sin(climb * Math.PI);
            const r = (isInsane ? 1.9 : 1.5) * (0.6 + s * 0.7);
            ctx.beginPath();
            ctx.arc(mx, my, r, 0, Math.PI * 2);
            ctx.fillStyle = rgb(stops[1], 0.75 * fade * energy);
            ctx.fill();
        }
    }

    // The winner's lit shaft is scaled by tier, so a common winner is marked without out-shouting a passing rare.
    if (isWinning) {
        const claim = 0.42 + 0.58 * energy;
        const rim = ctx.createLinearGradient(0, F, 0, T);
        rim.addColorStop(0, rgb(stops[2], 0.95 * claim));
        rim.addColorStop(0.55, rgb(stops[1], 0.5 * claim));
        rim.addColorStop(1, rgb(stops[0], 0.12 * claim));
        ctx.fillStyle = rim;
        ctx.fillRect(colX, T, 2, F - T);
        ctx.fillRect(colX + colW - 2, T, 2, F - T);

        const crownFlare = ctx.createLinearGradient(0, T, 0, T + H * 0.3);
        crownFlare.addColorStop(0, rgb(stops[0], 0.4 * claim * breathe));
        crownFlare.addColorStop(1, rgb(stops[0], 0));
        ctx.fillStyle = crownFlare;
        ctx.fillRect(colX, T, colW, H * 0.3);
    }

    const imgSrc = getItemImageUrl(item);
    const img = images.get(imgSrc);
    // `img` is only needed for sprites the atlas does not pack.
    const atlasSprite = getAtlasSprite(item);

    if (img || atlasSprite) {
        let imgScale = 0.62;
        if (item.username) imgScale = 0.52;
        else if (isEvent) imgScale = 0.7;
        else if (isRecursionType) imgScale = 0.66;
        else if (isSpecialType) imgScale = 0.66;

        // The winner's sprite grows 6% and lifts, then holds still: geometry holds still, light breathes.
        const winnerZoom = isWinning ? 1.06 : 1;
        const winnerLift = isWinning ? H * 0.02 : 0;

        // Sized from the band's shorter axis: in the shaft `size` is the whole screen.
        const spriteBase = Math.min(size, H);
        const imgSize = spriteBase * imgScale * winnerZoom;
        const imgX = x + (size - imgSize) / 2;
        // Seated slightly above centre: the base bar pulls the eye down.
        const imgY = T + (F - T - imgSize) / 2 - H * 0.04 - winnerLift;

        // Frozen dead centre under reduced motion.
        const winnerLightPulse = isWinning && !calm ? 1 + Math.sin(time * 1.6) * 0.18 : 1;
        const pool = ctx.createRadialGradient(
            x + size / 2, imgY + imgSize * 0.9, 0,
            x + size / 2, imgY + imgSize * 0.9, imgSize * 0.85,
        );
        pool.addColorStop(0, rgb(stops[1], 0.32 * glow * winnerLightPulse));
        pool.addColorStop(1, rgb(stops[1], 0));
        ctx.fillStyle = pool;
        ctx.fillRect(colX, imgY - imgSize * 0.2, colW, imgSize * 1.9);

        // Smoothing is unconditional: every sprite is a downscale from the 96px atlas tile, and nearest-neighbour shimmers in motion.
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Candidacy rim (see getRimSprite). Tierless items take the lamp's colour, tiered ones their own; never mix the two.
        // Driven by reel position, not the clock, so it survives reduced motion: it says which item is under the line.
        if (candidacy > 0.002) {
            const rim = getRimSprite(item, img);
            if (rim) {
                if (!rimScratch) {
                    rimScratch = document.createElement('canvas');
                    rimScratch.width = RIM_BOX;
                    rimScratch.height = RIM_BOX;
                }
                const rimHue = energy > 0 ? stops[1] : (lampRgb || hexToRgb(COLORS.gold));
                const sc = rimScratch.getContext('2d');
                sc.globalCompositeOperation = 'source-over';
                sc.clearRect(0, 0, RIM_BOX, RIM_BOX);
                sc.drawImage(rim, 0, 0);
                sc.globalCompositeOperation = 'source-in';
                sc.fillStyle = `rgb(${rimHue.r}, ${rimHue.g}, ${rimHue.b})`;
                sc.fillRect(0, 0, RIM_BOX, RIM_BOX);

                const scale = imgSize / RIM_CAN;
                const pad = RIM_PAD * scale;
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = candidacy * (0.8 + 0.2 * energy);
                ctx.drawImage(rimScratch, imgX - pad, imgY - pad, RIM_BOX * scale, RIM_BOX * scale);
                ctx.restore();
            }
        }

        if (isSpecialType) {
            // shadowColor cannot take a gradient, so animated tiers bloom in their current hue.
            ctx.shadowColor = rgb(stops[1], 1);
            ctx.shadowBlur = (isInsane ? 16 : isMythic ? 13 : 9) * (isWinning ? winnerLightPulse : 1);
        }

        drawItemSprite(ctx, item, img, imgX, imgY, imgSize);

        ctx.shadowBlur = 0;

        if (item.isBounty) {
            drawBountyMark(ctx, imgX, imgY, imgSize, time, calm, rowMode, isWinning);
        }

        ctx.imageSmoothingEnabled = true;
    }

    ctx.restore();
}

/*
 * THE GILDED REEL, the mystery box's band. The gilt lives only where no tier does (ground, rails, glint), and is always
 * the COLORS.mysteryGilt ramp, never a flat gold, so it cannot read as legendary or the chrome.
 */
const GILT_DEEP = '#150E03';

function gildedGround(ctx, width, height, isMobile) {
    const g = ctx.createLinearGradient(0, 0, isMobile ? 0 : width, isMobile ? height : 0);
    g.addColorStop(0, GILT_DEEP);
    g.addColorStop(0.5, '#3A2708');
    g.addColorStop(1, GILT_DEEP);
    return g;
}

function drawGildedCoat(ctx, width, height, isMobile) {
    const [pale, mid, deep] = COLORS.mysteryGilt;
    ctx.save();

    const lustre = ctx.createLinearGradient(0, 0, isMobile ? width : 0, isMobile ? 0 : height);
    lustre.addColorStop(0, `${pale}1F`);
    lustre.addColorStop(0.45, `${mid}0D`);
    lustre.addColorStop(1, `${deep}33`);
    ctx.fillStyle = lustre;
    ctx.fillRect(0, 0, width, height);

    const rail = ctx.createLinearGradient(0, 0, isMobile ? 0 : width, isMobile ? height : 0);
    rail.addColorStop(0, deep);
    rail.addColorStop(0.3, mid);
    rail.addColorStop(0.5, pale);
    rail.addColorStop(0.7, mid);
    rail.addColorStop(1, deep);
    ctx.fillStyle = rail;
    ctx.globalAlpha = 0.85;
    if (isMobile) {
        ctx.fillRect(0, 0, 3, height);
        ctx.fillRect(width - 3, 0, 3, height);
    } else {
        ctx.fillRect(0, 0, width, 3);
        ctx.fillRect(0, height - 3, width, 3);
    }
    ctx.restore();
}

function drawGildedSheen(ctx, width, height, isMobile, time) {
    // The glint is off under reduced motion (the caller checks); the gilding stays.
    const PERIOD = 4.2;
    const t = (time % PERIOD) / PERIOD;
    const span = isMobile ? height : width;
    const band = Math.max(140, span * 0.16);
    const pos = -band + t * (span + band * 2);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = isMobile
        ? ctx.createLinearGradient(0, pos - band, width * 0.3, pos + band)
        : ctx.createLinearGradient(pos - band, 0, pos + band, height * 0.6);
    g.addColorStop(0, 'rgba(255,240,184,0)');
    g.addColorStop(0.5, 'rgba(255,240,184,0.13)');
    g.addColorStop(1, 'rgba(255,240,184,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
}

/**
 * The daily bounty's mark: four corners around the sprite and the word. Hugs the object, not the slot, so the reel stays boxless.
 * Not light (no glow or `lighter`), so it never reads as the tier brightening; holds full strength under reduced motion.
 */
function drawBountyMark(ctx, imgX, imgY, imgSize, time, calm, rowMode, isWinning) {
    const c = hexToRgb(COLORS.bounty);
    const alpha = calm ? 1 : 0.78 + 0.22 * Math.sin(time * 2.4);
    const pad = imgSize * 0.12;
    const x0 = imgX - pad;
    const y0 = imgY - pad;
    const x1 = imgX + imgSize + pad;
    const y1 = imgY + imgSize + pad;
    const arm = imgSize * 0.24;
    const lw = isWinning ? 2.5 : 2;

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`;
    ctx.lineWidth = lw;
    ctx.lineCap = 'square';
    ctx.beginPath();
    ctx.moveTo(x0, y0 + arm); ctx.lineTo(x0, y0); ctx.lineTo(x0 + arm, y0);
    ctx.moveTo(x1 - arm, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y0 + arm);
    ctx.moveTo(x1, y1 - arm); ctx.lineTo(x1, y1); ctx.lineTo(x1 - arm, y1);
    ctx.moveTo(x0 + arm, y1); ctx.lineTo(x0, y1); ctx.lineTo(x0, y1 - arm);
    ctx.stroke();

    ctx.fillStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${Math.min(1, alpha + 0.1)})`;
    ctx.font = "700 10px 'Segoe UI', system-ui, sans-serif";
    if ('letterSpacing' in ctx) ctx.letterSpacing = '1.5px';
    if (rowMode) {
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('BOUNTY', x1 + 8, imgY + imgSize / 2);
    } else {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('BOUNTY', imgX + imgSize / 2, y0 - 5);
    }
    ctx.restore();
}

/**
 * One machined mark on the band's edge, pointing inward; `dir` is 1 for the top hairline, -1 for the floor lip.
 * `axis` 'y' rotates the same path into the shaft's rails.
 */
function drawDetentTick(ctx, cx, edgeY, dir, c, alpha, axis = 'x') {
    const A = (a) => `rgba(${c.r}, ${c.g}, ${c.b}, ${Math.min(1, a)})`;
    const BLADE = 11;
    const a = Math.min(1, alpha);

    ctx.save();

    if (axis === 'y') {
        ctx.transform(0, 1, 1, 0, 0, 0);
    }

    ctx.beginPath();
    ctx.moveTo(cx - 3.5, edgeY);
    ctx.lineTo(cx + 3.5, edgeY);
    ctx.lineTo(cx + 0.5, edgeY + dir * BLADE);
    ctx.lineTo(cx - 0.5, edgeY + dir * BLADE);
    ctx.closePath();
    const wedge = ctx.createLinearGradient(0, edgeY, 0, edgeY + dir * BLADE);
    wedge.addColorStop(0, A(0.92 * a));
    wedge.addColorStop(0.6, A(0.5 * a));
    wedge.addColorStop(1, A(0.16 * a));
    ctx.fillStyle = wedge;
    ctx.fill();

    ctx.shadowColor = A(0.9 * a);
    ctx.shadowBlur = 6 * a;
    ctx.fillStyle = A(a);
    ctx.fillRect(cx - 4, dir > 0 ? edgeY : edgeY - 1.5, 8, 1.5);

    ctx.restore();
}

function drawMotionBlur(ctx, width, height, isVertical, color, intensity) {
    if (intensity < 0.1) return;

    const rgb = hexToRgb(color);
    const blurAlpha = Math.floor(intensity * 40);

    ctx.save();

    if (isVertical) {
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${blurAlpha / 255})`);
        gradient.addColorStop(0.3, 'transparent');
        gradient.addColorStop(0.7, 'transparent');
        gradient.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${blurAlpha / 255})`);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
    } else {
        const gradient = ctx.createLinearGradient(0, 0, width, 0);
        gradient.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${blurAlpha / 255})`);
        gradient.addColorStop(0.3, 'transparent');
        gradient.addColorStop(0.7, 'transparent');
        gradient.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${blurAlpha / 255})`);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
    }

    ctx.restore();
}

function drawScanlines(ctx, width, height, time) {
    ctx.save();

    const flickerAlpha = 0.03 + Math.sin(time * 50) * 0.02;
    ctx.fillStyle = `rgba(0, 255, 0, ${flickerAlpha})`;

    for (let y = 0; y < height; y += 4) {
        ctx.fillRect(0, y + 2, width, 2);
    }

    ctx.restore();
}

export function CanvasSpinningStrip({
                                        items = [],
                                        offsetRef = null, // Ref object for offset (avoids re-renders during animation)
                                        offset: offsetProp = 0,
                                        isMobile = false,
                                        isSpinning = false,
                                        isResult = false,
                                        spinProgress = 0,
                                        isRecursion = false,
                                        stripWidth,
                                        stripHeight,
                                        finalIndex = 72,
                                        onClick,
                                        accentColor = null, // Optional override for accent color (e.g., gold for KOTW Lucky Spin)
                                        themeType = null, // 'recursion' or 'kotw' - determines background colors
                                        itemWidthOverride = null, // Optional override for item width (e.g., 90 for Triple Lucky desktop)
                                        isLuckySpin = false, // For Lucky Spin / Triple Lucky - common items use green
                                        // Draws the strip as a cylinder; only for the dormant idle reel.
                                        loop = false,
                                        // One of several tracks in one band (3x/5x takeovers): SpinLanes draws the outer vignette once,
                                        // and the band's edges run at constant alpha so they cross every track as one line.
                                        laneMode = false,
                                    }) {
    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const animationRef = useRef(null);
    const imagesRef = useRef(new Map());
    const timeRef = useRef(0);
    // Refs, not state: a re-render here would stutter the landing flash.
    const resultAtRef = useRef(-1);       // when isResult last went true
    const lastCentreIndexRef = useRef(null);
    const tickAtRef = useRef(-1);         // when the centre slot last changed
    // `parkedRef` tells "stopped" from "unmounted"; `renderRef` lets the wake effect restart the loop the main effect built.
    const parkedRef = useRef(false);
    const renderRef = useRef(null);
    const saverMode = useSaverMode();
    const [imagesLoaded, setImagesLoaded] = useState(false);
    const [containerWidth, setContainerWidth] = useState(stripWidth || (isMobile ? 390 : 1600));
    // Measured: the shaft is whatever the stage row can spare; the desktop band keeps a fixed STRIP_HEIGHT.
    const [containerHeight, setContainerHeight] = useState(stripHeight || 620);

    const propsRef = useRef({ isSpinning, isResult, spinProgress, isRecursion, finalIndex, accentColor, themeType, isLuckySpin, loop });
    propsRef.current = { isSpinning, isResult, spinProgress, isRecursion, finalIndex, accentColor, themeType, isLuckySpin, loop };

    const getOffset = () => offsetRef ? offsetRef.current : offsetProp;

    const itemWidth = itemWidthOverride || (isMobile ? MOBILE_ROW_PITCH : ITEM_WIDTH);
    const width = stripWidth || containerWidth;
    const height = stripHeight || (isMobile ? containerHeight : STRIP_HEIGHT);

    useEffect(() => {
        // Always measured; a caller wanting a fixed size passes `stripWidth` / `stripHeight`.
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

        let resizeObserver = null;
        if (typeof ResizeObserver !== 'undefined') {
            resizeObserver = new ResizeObserver(updateWidth);
            resizeObserver.observe(containerRef.current);
        } else {
            window.addEventListener('resize', updateWidth);
        }

        updateWidth();

        return () => {
            if (resizeObserver) {
                resizeObserver.disconnect();
            } else {
                window.removeEventListener('resize', updateWidth);
            }
        };
    }, [isMobile, laneMode]);

    useEffect(() => {
        if (items.length === 0) return;

        let cancelled = false;

        items.forEach(item => {
            const src = getItemImageUrl(item);
            const cached = imageCache.get(src);
            if (cached) {
                imagesRef.current.set(src, cached);
            }
        });

        const loadAllImages = async () => {
            const imagePromises = items.map(item => {
                const src = getItemImageUrl(item);
                if (imagesRef.current.has(src)) {
                    return Promise.resolve();
                }
                return loadImage(src).then(img => {
                    if (!cancelled && img) {
                        imagesRef.current.set(src, img);
                    }
                });
            });

            await Promise.all(imagePromises);

            if (!cancelled) {
                setImagesLoaded(true);
            }
        };

        loadAllImages();

        return () => {
            cancelled = true;
        };
    }, [items]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            console.warn('CanvasSpinningStrip: Could not get 2d context');
            return;
        }

        const dpr = window.devicePixelRatio || 1;
        let lastTimestamp = performance.now();
        let frameCount = 0;

        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        ctx.scale(dpr, dpr);

        const render = (timestamp) => {
            const { isSpinning: isCurrentlySpinning } = propsRef.current;
            frameCount++;
            if (isMobile && !isCurrentlySpinning && frameCount % 2 !== 0) {
                animationRef.current = requestAnimationFrame(render);
                return;
            }

            // Saver mode: draw one more frame, then park (`parkedRef` is set after it so the frame lands).
            // A landed result parks too, after PARK_AFTER_RESULT lets the landing bloom finish.
            if (parkedRef.current) {
                animationRef.current = null;
                return;
            }
            const { isResult: isCurrentlyResult } = propsRef.current;
            const bloomSettled = resultAtRef.current >= 0
                && timeRef.current - resultAtRef.current > PARK_AFTER_RESULT;
            const shouldPark = isSaverOn()
                && !isCurrentlySpinning
                && (!isCurrentlyResult || bloomSettled);

            const dt = (timestamp - lastTimestamp) / 1000;
            lastTimestamp = timestamp;
            timeRef.current += dt;
            const time = timeRef.current;

            const { isSpinning, isResult, spinProgress, isRecursion, finalIndex, accentColor: accentOverride, themeType, isLuckySpin, loop } = propsRef.current;

            const offset = getOffset();
            const motionIntensity = isSpinning ? Math.max(0, 1 - spinProgress * 1.5) : 0;

            // Ambient motion off, reel travel on. See prefersReducedMotion above.
            const calm = prefersReducedMotion();

            // `bloom` decays from 1 over ~450ms when isResult goes true, so the winner lands with a hit.
            if (isResult) {
                if (resultAtRef.current < 0) resultAtRef.current = time;
            } else {
                resultAtRef.current = -1;
            }
            const bloom = (calm || resultAtRef.current < 0)
                ? 0
                : Math.exp(-(time - resultAtRef.current) / 0.45);

            // The indicator flashes each time the slot under it changes, so a slowdown is a run of stretching ticks.
            const centreIndex = Math.round(offset / itemWidth);
            if (lastCentreIndexRef.current !== centreIndex) {
                if (lastCentreIndexRef.current !== null) tickAtRef.current = time;
                lastCentreIndexRef.current = centreIndex;
            }
            const tick = (calm || tickAtRef.current < 0)
                ? 0
                : Math.exp(-(time - tickAtRef.current) / 0.085);

            // Candidacy: a smoothstepped tent over one full pitch, so two slots straddling the line always sum to 1.
            // Half a pitch leaves both at zero exactly on the seam.
            const candidacyOf = (centre, line) => {
                const u = 1 - Math.abs(centre - line) / itemWidth;
                if (u <= 0) return 0;
                if (u >= 1) return 1;
                return u * u * (3 - 2 * u);
            };

            // `commit` runs 0 -> 1 on the bloom's decay, moving candidacy from the losing neighbour onto the winner as one event.
            // Under reduced motion it is 1 from the first result frame. Settles short of full so it eases off the winner's own apparatus.
            const RESTING_CANDIDACY = 0.7;
            const commit = isResult ? 1 - bloom : 0;
            const candidacyAt = (idx, centre, line) => {
                const prox = candidacyOf(centre, line);
                if (commit <= 0) return prox;
                const settled = idx === finalIndex ? RESTING_CANDIDACY : 0;
                return prox + (settled - prox) * commit;
            };

            const isArenaTheme = themeType === 'kotw-arena';
            const isFirstBloodTheme = themeType === 'first-blood';
            const isMysteryTheme = themeType === 'mystery';
            const isKotwTheme = themeType === 'kotw' || isArenaTheme;
            const isRecursionTheme = isRecursion || themeType === 'recursion';

            const KOTW_SLATE = isArenaTheme ? ARENA.steel : '#1E293B';
            const KOTW_SLATE_DARK = isArenaTheme ? ARENA.navy : '#0F172A';

            const accentColor = accentOverride || (isRecursionTheme ? COLORS.recursion : COLORS.gold);
            const bgColor = isMysteryTheme ? GILT_DEEP : isFirstBloodTheme ? '#160B09' : isKotwTheme ? KOTW_SLATE_DARK : (isRecursionTheme ? COLORS.recursionDark : COLORS.bg);

            const accentRgb = hexToRgb(accentColor);

            ctx.clearRect(0, 0, width, height);

            if (isMysteryTheme) {
                ctx.fillStyle = gildedGround(ctx, width, height, isMobile);
            } else if (isRecursionTheme || isKotwTheme || isFirstBloodTheme) {
                const bgGradient = ctx.createLinearGradient(
                    isMobile ? 0 : 0,
                    isMobile ? 0 : 0,
                    isMobile ? 0 : width,
                    isMobile ? height : 0
                );
                if (isFirstBloodTheme) {
                    bgGradient.addColorStop(0, '#100907');
                    bgGradient.addColorStop(.5, '#381713');
                    bgGradient.addColorStop(1, '#100907');
                } else if (isKotwTheme) {
                    bgGradient.addColorStop(0, KOTW_SLATE_DARK);
                    bgGradient.addColorStop(0.5, KOTW_SLATE);
                    bgGradient.addColorStop(1, KOTW_SLATE_DARK);
                } else {
                    bgGradient.addColorStop(0, bgColor);
                    bgGradient.addColorStop(0.5, '#0a1a0a');
                    bgGradient.addColorStop(1, bgColor);
                }
                ctx.fillStyle = bgGradient;
            } else {
                const bgGradient = ctx.createLinearGradient(
                    isMobile ? 0 : 0,
                    isMobile ? 0 : 0,
                    isMobile ? 0 : width,
                    isMobile ? height : 0
                );
                bgGradient.addColorStop(0, COLORS.bg);
                bgGradient.addColorStop(0.5, `${COLORS.bgLight}33`);
                bgGradient.addColorStop(1, COLORS.bg);
                ctx.fillStyle = bgGradient;
            }
            ctx.fillRect(0, 0, width, height);

            if (isMysteryTheme) {
                drawGildedCoat(ctx, width, height, isMobile);
            }

            if (isFirstBloodTheme) {
                ctx.save();
                ctx.fillStyle='#BD875047';
                if (isMobile) {
                    ctx.fillRect(0,0,2,height);
                    ctx.fillRect(width-2,0,2,height);
                } else {
                    ctx.fillRect(0,0,width,2);
                    ctx.fillRect(0,height-2,width,2);
                }
                ctx.restore();
            }

            if (isRecursionTheme && !isKotwTheme) {
                drawScanlines(ctx, width, height, time);
            }

            ctx.save();

            if (isMobile) {
                // THE SHAFT: on a phone slots are full-width rows stacked downward, sprite sized off the row pitch.
                // drawItem draws the same column into a wide, short band, so there is no second implementation to keep in step.
                const rowPitch = itemWidth;
                const stripCenterY = height / 2 - rowPitch / 2;
                const shaftLine = height / 2;
                const drawRow = (item, idx, itemY, isWinning) => {
                    drawItem(
                        ctx, item,
                        0, itemY, width,
                        isWinning,
                        isRecursionTheme && !isKotwTheme,
                        imagesRef.current, time, isLuckySpin, isKotwTheme,
                        rowPitch, itemY, calm,
                        SILL_H,
                        'y',
                        candidacyAt(idx, itemY + rowPitch / 2, shaftLine),
                        accentRgb,
                        isArenaTheme,
                    );
                };

                if (loop) {
                    // The dormant shaft is a cylinder: walk the on-screen rows and wrap the index.
                    const firstIdx = Math.floor((offset - stripCenterY - rowPitch) / rowPitch);
                    const lastIdx = Math.ceil((offset - stripCenterY + height + rowPitch) / rowPitch);
                    for (let idx = firstIdx; idx <= lastIdx; idx++) {
                        const item = items[((idx % items.length) + items.length) % items.length];
                        drawRow(item, idx, stripCenterY + idx * rowPitch - offset, false);
                    }
                } else {
                    items.forEach((item, idx) => {
                        const itemY = stripCenterY + idx * rowPitch - offset;
                        if (itemY > -rowPitch && itemY < height + rowPitch) {
                            drawRow(item, idx, itemY, idx === finalIndex && isResult);
                        }
                    });
                }
            } else if (loop) {
                // The dormant reel is a cylinder: walk the on-screen slots and wrap the index, so the drift never runs out of array.
                // Never during a spin: the server's strip is authoritative and repeating it would show the winner twice.
                const stripCenterX = width / 2 - itemWidth / 2;
                const itemCenterY = (height - itemWidth) / 2;
                const firstIdx = Math.floor((offset - stripCenterX - itemWidth) / itemWidth);
                const lastIdx = Math.ceil((offset - stripCenterX + width + itemWidth) / itemWidth);

                for (let idx = firstIdx; idx <= lastIdx; idx++) {
                    // JS `%` keeps the dividend's sign, and the offset can go negative here.
                    const item = items[((idx % items.length) + items.length) % items.length];
                    const itemX = stripCenterX + idx * itemWidth - offset;
                    drawItem(ctx, item, itemX, itemCenterY, itemWidth, false, isRecursionTheme && !isKotwTheme, imagesRef.current, time, isLuckySpin, isKotwTheme, height, 0, calm, LIP_H, 'x', candidacyOf(itemX + itemWidth / 2, width / 2), accentRgb, isArenaTheme);
                }
            } else {
                const stripCenterX = width / 2 - itemWidth / 2;
                const itemCenterY = (height - itemWidth) / 2;

                items.forEach((item, idx) => {
                    const itemX = stripCenterX + idx * itemWidth - offset;

                    if (itemX > -itemWidth && itemX < width + itemWidth) {
                        const isWinning = idx === finalIndex && isResult;
                        drawItem(ctx, item, itemX, itemCenterY, itemWidth, isWinning, isRecursionTheme && !isKotwTheme, imagesRef.current, time, isLuckySpin, isKotwTheme, height, 0, calm, LIP_H, 'x', candidacyAt(idx, itemX + itemWidth / 2, width / 2), accentRgb, isArenaTheme);

                    }
                });
            }

            ctx.restore();

            if (isMysteryTheme && !calm) {
                drawGildedSheen(ctx, width, height, isMobile, time);
            }

            if (motionIntensity > 0.1) {
                drawMotionBlur(ctx, width, height, isMobile, bgColor, motionIntensity);
            }

            if (isMobile) {
                const topVignette = ctx.createLinearGradient(0, 0, 0, height * 0.18);
                topVignette.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
                topVignette.addColorStop(1, 'rgba(0, 0, 0, 0)');
                ctx.fillStyle = topVignette;
                ctx.fillRect(0, 0, width, height * 0.18);

                const bottomVignette = ctx.createLinearGradient(0, height * 0.82, 0, height);
                bottomVignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
                bottomVignette.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
                ctx.fillStyle = bottomVignette;
                ctx.fillRect(0, height * 0.82, width, height * 0.18);

                const railFade = (alpha) => {
                    const g = ctx.createLinearGradient(0, 0, 0, height);
                    g.addColorStop(0, 'rgba(206,214,236,0)');
                    g.addColorStop(0.14, `rgba(206,214,236,${alpha})`);
                    g.addColorStop(0.86, `rgba(206,214,236,${alpha})`);
                    g.addColorStop(1, 'rgba(206,214,236,0)');
                    return g;
                };
                ctx.fillStyle = railFade(0.14);
                ctx.fillRect(0, 0, 1, height);
                ctx.fillRect(width - 1, 0, 1, height);

                const railGlowL = ctx.createLinearGradient(1, 0, 9, 0);
                railGlowL.addColorStop(0, 'rgba(206,214,236,0.05)');
                railGlowL.addColorStop(1, 'rgba(206,214,236,0)');
                ctx.fillStyle = railGlowL;
                ctx.fillRect(1, 0, 8, height);

                const railGlowR = ctx.createLinearGradient(width - 9, 0, width - 1, 0);
                railGlowR.addColorStop(0, 'rgba(206,214,236,0)');
                railGlowR.addColorStop(1, 'rgba(206,214,236,0.05)');
                ctx.fillStyle = railGlowR;
                ctx.fillRect(width - 9, 0, 8, height);
            } else {
                // Skipped in lane mode: SpinLanes draws this once across the whole row.
                if (!laneMode) {
                    const leftVignette = ctx.createLinearGradient(0, 0, width * 0.12, 0);
                    leftVignette.addColorStop(0, 'rgba(0, 0, 0, 0.5)');
                    leftVignette.addColorStop(1, 'rgba(0, 0, 0, 0)');
                    ctx.fillStyle = leftVignette;
                    ctx.fillRect(0, 0, width * 0.12, height);

                    const rightVignette = ctx.createLinearGradient(width * 0.88, 0, width, 0);
                    rightVignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
                    rightVignette.addColorStop(1, 'rgba(0, 0, 0, 0.5)');
                    ctx.fillStyle = rightVignette;
                    ctx.fillRect(width * 0.88, 0, width * 0.12, height);
                }

                // The band's hairline and lip, tuned together with the per-slot seam as one material. They fade into the vignettes,
                // except in lane mode, where they run at constant alpha so five tracks do not break into five boxes.
                const edgeGradient = (alpha) => {
                    if (laneMode) return `rgba(206,214,236,${alpha})`;
                    const g = ctx.createLinearGradient(0, 0, width, 0);
                    g.addColorStop(0, 'rgba(206,214,236,0)');
                    g.addColorStop(0.10, `rgba(206,214,236,${alpha})`);
                    g.addColorStop(0.90, `rgba(206,214,236,${alpha})`);
                    g.addColorStop(1, 'rgba(206,214,236,0)');
                    return g;
                };

                const lipLight = edgeGradient(0.20);
                ctx.fillStyle = lipLight;
                ctx.fillRect(0, height - LIP_H, width, 1);

                ctx.fillStyle = 'rgba(0,0,0,0.55)';
                ctx.fillRect(0, height - LIP_H + 1, width, LIP_H - 1);

                ctx.fillStyle = edgeGradient(0.13);
                ctx.fillRect(0, 0, width, 1);

                const hairlineFall = ctx.createLinearGradient(0, 1, 0, 9);
                hairlineFall.addColorStop(0, 'rgba(206,214,236,0.05)');
                hairlineFall.addColorStop(1, 'rgba(206,214,236,0)');
                ctx.fillStyle = hairlineFall;
                ctx.fillRect(0, 1, width, 8);
            }

            // Under reduced motion the spin holds at the middle of its range rather than beating.

            if (isMobile) {
                const cy = Math.round(height / 2);
                const A = (a) => `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, ${a})`;

                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                const glowH = itemWidth * 0.42;
                const aperture = ctx.createLinearGradient(0, cy - glowH, 0, cy + glowH);
                aperture.addColorStop(0, A(0));
                aperture.addColorStop(0.5, A((isSpinning ? 0.16 : 0.11) + tick * 0.1));
                aperture.addColorStop(1, A(0));
                ctx.fillStyle = aperture;
                ctx.fillRect(0, cy - glowH, width, glowH * 2);
                ctx.restore();

                const hairAlpha = (isSpinning ? 0.85 : 0.6) + tick * 0.4;
                const hair = ctx.createLinearGradient(0, 0, width, 0);
                hair.addColorStop(0, A(hairAlpha));
                hair.addColorStop(0.28, A(hairAlpha * 0.34));
                hair.addColorStop(0.72, A(hairAlpha * 0.34));
                hair.addColorStop(1, A(hairAlpha));
                ctx.fillStyle = hair;
                ctx.fillRect(0, cy - 0.5, width, 1);

                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                const bleed = ctx.createLinearGradient(0, cy - 4, 0, cy + 4);
                bleed.addColorStop(0, A(0));
                bleed.addColorStop(0.5, A(hairAlpha * 0.3));
                bleed.addColorStop(1, A(0));
                ctx.fillStyle = bleed;
                ctx.fillRect(0, cy - 4, width, 8);
                ctx.restore();

                const markAlpha = Math.min(1, (isSpinning ? 0.95 : 0.8) + tick * 0.45);
                drawDetentTick(ctx, cy, 0, 1, accentRgb, markAlpha, 'y');
                drawDetentTick(ctx, cy, width, -1, accentRgb, markAlpha, 'y');
            } else {
                // The desktop indicator is a detent drawn from the band's edges, so nothing crosses the sprite.
                // It replaces the DOM centre line and triangles, which WheelSpinner.jsx renders on mobile only.
                const cx = Math.round(width / 2);
                const A = (a) => `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, ${a})`;

                // A glow around the line, not a lit slot: drawing the landing zone would reveal where the reel stops before it does.
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                const glowW = itemWidth * 0.42;
                const apertureAlpha = (isSpinning ? 0.16 : 0.11) + tick * 0.1;
                const aperture = ctx.createLinearGradient(cx - glowW, 0, cx + glowW, 0);
                aperture.addColorStop(0, A(0));
                aperture.addColorStop(0.5, A(apertureAlpha));
                aperture.addColorStop(1, A(0));
                ctx.fillStyle = aperture;
                ctx.fillRect(cx - glowW, 0, glowW * 2, height);
                ctx.restore();

                // Full strength at the band's edges, about a third across the middle: brighter covers the item, transparent stops reading as a line.
                const hairAlpha = (isSpinning ? 0.85 : 0.6) + tick * 0.4;
                const hair = ctx.createLinearGradient(0, 0, 0, height);
                hair.addColorStop(0, A(hairAlpha));
                hair.addColorStop(0.28, A(hairAlpha * 0.34));
                hair.addColorStop(0.72, A(hairAlpha * 0.34));
                hair.addColorStop(1, A(hairAlpha));
                ctx.fillStyle = hair;
                ctx.fillRect(cx - 0.5, 0, 1, height);

                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                const bleed = ctx.createLinearGradient(cx - 4, 0, cx + 4, 0);
                bleed.addColorStop(0, A(0));
                bleed.addColorStop(0.5, A(hairAlpha * 0.3));
                bleed.addColorStop(1, A(0));
                ctx.fillStyle = bleed;
                ctx.fillRect(cx - 4, 0, 8, height);
                ctx.restore();

                const markAlpha = Math.min(1, (isSpinning ? 0.95 : 0.8) + tick * 0.45);
                drawDetentTick(ctx, cx, 0, 1, accentRgb, markAlpha);
                drawDetentTick(ctx, cx, height - LIP_H, -1, accentRgb, markAlpha);

                // On the winning slot, not the band's centre: a spin rests up to 45% of a pitch off centre (`landingVariance` in WheelSpinner.jsx).
                if (bloom > 0.004) {
                    const winnerX = width / 2 - itemWidth / 2
                        + finalIndex * itemWidth - offset + itemWidth / 2;
                    ctx.save();
                    ctx.globalCompositeOperation = 'lighter';
                    const hitW = itemWidth * 0.62;
                    const hit = ctx.createLinearGradient(winnerX - hitW, 0, winnerX + hitW, 0);
                    hit.addColorStop(0, 'rgba(255,255,255,0)');
                    hit.addColorStop(0.5, `rgba(255, 252, 244, ${0.30 * bloom})`);
                    hit.addColorStop(1, 'rgba(255,255,255,0)');
                    ctx.fillStyle = hit;
                    ctx.fillRect(winnerX - hitW, 0, hitW * 2, height);

                    const spill = ctx.createLinearGradient(winnerX - itemWidth * 1.6, 0, winnerX + itemWidth * 1.6, 0);
                    spill.addColorStop(0, 'rgba(255,255,255,0)');
                    spill.addColorStop(0.5, `rgba(255, 250, 238, ${0.55 * Math.sqrt(bloom)})`);
                    spill.addColorStop(1, 'rgba(255,255,255,0)');
                    ctx.fillStyle = spill;
                    ctx.fillRect(winnerX - itemWidth * 1.6, height - LIP_H, itemWidth * 3.2, 1);
                    ctx.restore();
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
        // Restart only when size or items change; the loop reads everything else from propsRef.
        // `isMobile` is here because it selects which layout branch the loop runs.
    }, [items, width, height, imagesLoaded, isMobile, laneMode]);

    /** Wakes a parked loop. `isResult` is in the trigger set because the landing bloom decays after the spin ends. */
    useEffect(() => {
        if (!parkedRef.current || !renderRef.current) return;
        if (isSpinning || isResult || !saverMode) {
            parkedRef.current = false;
            animationRef.current = requestAnimationFrame(renderRef.current);
        }
    }, [isSpinning, isResult, saverMode]);

    const handleKeyDown = useCallback((e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            onClick(e);
        }
    }, [onClick]);

    return (
        <div
            ref={containerRef}
            onClick={onClick}
            onKeyDown={onClick ? handleKeyDown : undefined}
            role={onClick ? 'button' : undefined}
            tabIndex={onClick ? 0 : undefined}
            // Only the mobile layout passes onClick (tapping the reel spins), so this names that control.
            aria-label={onClick ? 'Spin the wheel' : undefined}
            style={{
                // Fills its parent and the canvas measures the result: sizing from the measured value would be a feedback loop.
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                // Square: a radius at the viewport edge is a notch.
                borderRadius: 0,
                overflow: 'hidden',
                zIndex: 2,
                cursor: onClick ? 'pointer' : 'default',
            }}
        >
            <canvas
                ref={canvasRef}
                aria-hidden="true"
                style={{
                    display: 'block',
                    width: '100%',
                    height: '100%',
                }}
            />
        </div>
    );
}

export async function preloadItemImages(items, onProgress) {
    const batchSize = 20;
    let loaded = 0;

    // Pool sprites come from the atlas; only heads, event and recursion art and custom items load here.
    items = items.filter(needsOwnImage);

    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        await Promise.all(batch.map(item => {
            const src = getItemImageUrl(item);
            return loadImage(src).then(() => {
                loaded++;
                if (onProgress) onProgress(loaded, items.length);
            });
        }));
    }
}

/**
 * Fills the cache in the background; nothing waits on it, and it never rejects.
 * Lower concurrency than preloadItemImages so it does not queue ahead of the images an active spin needs.
 */
export function warmImageCache(items, { concurrency = 6 } = {}) {
    const queue = items
        .filter(needsOwnImage)
        .map(getItemImageUrl)
        .filter(src => !imageCache.has(src));

    let cursor = 0;
    const worker = async () => {
        while (cursor < queue.length) {
            await loadImage(queue[cursor++]);
        }
    };

    return Promise.all(
        Array.from({ length: Math.min(concurrency, queue.length) }, worker),
    );
}

export default CanvasSpinningStrip;
