/*
* THE ARRIVAL - the train, in three dimensions. The locomotive is MODELLED IN CODE, not loaded: imported models carry
* licences (mostly CC-BY or non-redistributable), a 2-10MB GLTF plus loaders lands on a route PRODUCT.md calls "a phone
* beside a running game", and a photoreal train would be the only realistic object in THE NOCTURNE's flat blue-hour world.
*
* Real geometry, lights and shadow in the site's dark blue-hour palette with station amber as the only warm source.
* Hazards already hit: `renderer.shadowMap.enabled` must be on or castShadow requests go nowhere; light shafts need a
* fresnel shell or a headlight is a bright dot; `START_X`/`END_X` must put the train nose first (smokebox, buffers and
* headlight point at +x, so it enters from the left). Chuffs fire by wheel phase, not a timer; the vignette and grain
* live in `index.css` because they are DOM.
*
* Every symbol is imported by name from `three` so the bundler can drop the rest; `import * as THREE` would pull in
* loaders, controls and every material.
*/

import React, { useEffect, useRef } from 'react';
import {
    Scene, PerspectiveCamera, WebGLRenderer, Group, Fog, Color,
    BoxGeometry, CylinderGeometry, PlaneGeometry, SphereGeometry, TorusGeometry,
    MeshStandardMaterial, MeshBasicMaterial, Mesh, ShaderMaterial,
    AmbientLight, DirectionalLight, PointLight, SpotLight,
    Object3D, Sprite, SpriteMaterial, CanvasTexture, Vector3,
    AdditiveBlending, DoubleSide, LinearFilter,
    ACESFilmicToneMapping, SRGBColorSpace,
} from 'three';
import {
    T_SHUTTER, T_APPROACH, T_SETTLE, T_UNLOAD, T_DEPART, T_GONE, T_LIFT, T_LIFT_END,
    SCENE_FADE_S, SHOT_TWO, SHOT_THREE, LID_DELAY_S, LID_OPEN_S, CRATE_FALL_S,
    MAX_CRATES, crateFallsAt,
} from './arrivalTimeline.js';
import { createArrivalCrateFactory } from './arrivalCrates.js';
import { buildArrivalScenery, detailArrivalLocomotive } from './arrivalScenery.js';
import { prefersReducedMotion } from '../../../utils/motion.js';

// An authored locomotive, when there is one. Null means the procedural loco below; set a path under public/ to swap it in.
// The loader is fetched inside the branch, not imported at the top, so no arrival downloads GLTFLoader to not use it.
const LOCO_MODEL_URL = null;

const AMBER = 0xffaa00;
const LAMP = 0xffc76b;
const DECK_DEEP = 0x05060a;
// Railway signal green: the tiers own red, orange, purple, aqua, gold and the insane slick, so this is the one hue that belongs to nobody.
const SIGNAL_GREEN = 0x5bff8a;
const SIGNAL_RED = 0xff3b30;

// Cars behind the locomotive, however many crates there are. The cap lives in arrivalTimeline.js (the board needs it too).

/* Track units. A car is 2.2 long; the loco is 3.4, the tender 2.0. */
const CAR_LEN = 2.2;
const CAR_GAP = 0.28;
const LOCO_LEN = 3.4;
const TENDER_LEN = 2.0;
const VAN_LEN = 1.9;

/** Wheel geometry the rods are driven off. Changing either moves the rods. */
const DRIVER_R = 0.34;
const CRANK_R = 0.19;
/** How far apart crates stand on the paving. Measure against 0.686 (the cleats, `crateCleatGeo`), not the 0.62 body: the body clears while the trim intersects. */
const CRATE_PITCH = 1.02;
/**
* The closest two crates may stand, a floor under the compression. Measured on a TURNED crate: it rests at
* `crate.rotation.y = 0.6` (34.4 degrees), so its footprint projected onto x is 0.9243 across, not the unrotated
* 0.686 (an earlier 0.76 was 0.164 short). `CRATE_PITCH` clears this by only 0.0957, so changing the yaw or the crate
* spends that margin fast; both numbers have to move together.
*/
const CRATE_TOUCH = 0.98;
/** Main rod length, chosen so the crosshead never enters the cylinder block. */
const MAIN_ROD = 0.83;
const CYL_X = 1.62;

/** How far the camera sits from the aim point. Framing is derived from this. */
const FRAME_DIST = 13.5;

// `easeOutExpo` put 96% of the travel in the first quarter (stationary by 2.3s). The exponent is 5.2 so the engine
// crosses the left edge of a desktop band ~0.4s after the shutter finishes and still sheds speed 1.5s later.
// Normalised: 2^(-5.2) is 0.027, which unnormalised would stop the train 1.1 units short and then jump at T_APPROACH.
const EXPO_K = 5.2;
const EXPO_NORM = 1 / (1 - Math.pow(2, -EXPO_K));
const easeOutExpo = t => (t >= 1 ? 1 : (1 - Math.pow(2, -EXPO_K * t)) * EXPO_NORM);
// Departure is CUBIC, not exponential: `easeInExpo` left 75% of the travel in the last 20% of the time, a teleport with a wind-up.
const easeInCubic = t => t * t * t;
const clamp01 = t => Math.max(0, Math.min(1, t));
const lerp = (a, b, t) => a + (b - a) * t;
/** Stable per-index randomness, so a resize never reshuffles the world. */
const hash = i => { const s = Math.sin(i * 127.1) * 43758.5453; return s - Math.floor(s); };

// Textures are 2D canvases drawn at mount and thrown away at unmount (no image files); small on purpose (largest 512px).
// Every one declares its colour space via `finish()`: CanvasTexture defaults to NoColorSpace (treated as linear) but
// canvas 2D writes sRGB, so undeclared textures came back two stops hot. No texture may leave without it.

function finish(t) {
    t.colorSpace = SRGBColorSpace;
    t.minFilter = LinearFilter;
    t.needsUpdate = true;
    return t;
}

function radialTexture(stops, size = 128) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const rg = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [o, col] of stops) rg.addColorStop(o, col);
    g.fillStyle = rg;
    g.fillRect(0, 0, size, size);
    return finish(new CanvasTexture(c));
}

/** A tight core with a long tail — this is what stands in for bloom. */
const GLOW_STOPS = [
    [0, 'rgba(255,255,255,1)'],
    [0.14, 'rgba(255,255,255,0.72)'],
    [0.34, 'rgba(255,255,255,0.24)'],
    [0.62, 'rgba(255,255,255,0.06)'],
    [1, 'rgba(255,255,255,0)'],
];
/** Soft and shapeless. Steam has no edge. */
const SMOKE_STOPS = [
    [0, 'rgba(255,255,255,0.80)'],
    [0.35, 'rgba(255,255,255,0.34)'],
    [0.7, 'rgba(255,255,255,0.09)'],
    [1, 'rgba(255,255,255,0)'],
];

/** The anamorphic streak on the headlight: a horizontal smear reads as a lamp shot through a lens. One 256x64 gradient. */
function streakTexture() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 64;
    const g = c.getContext('2d');
    const lg = g.createLinearGradient(0, 0, 256, 0);
    lg.addColorStop(0, 'rgba(255,255,255,0)');
    lg.addColorStop(0.5, 'rgba(255,255,255,1)');
    lg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = lg;
    // A vertical falloff too, or the streak is a bar.
    for (let y = 0; y < 64; y++) {
        const d = Math.abs(y - 32) / 32;
        g.globalAlpha = Math.pow(1 - d, 3);
        g.fillRect(0, y, 256, 1);
    }
    g.globalAlpha = 1;
    return finish(new CanvasTexture(c));
}

/** Station signage: a dark enamel panel with amber lettering, drawn letter by letter with an explicit advance (`ctx.letterSpacing` is not everywhere). */
function signTexture(text, { w = 512, h = 128, size = 64, track = 0.16, ink = '#FFAA00', bg = '#0a0f1c', edge = '#33405f' } = {}) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = edge;
    g.lineWidth = 4;
    g.strokeRect(2, 2, w - 4, h - 4);

    const face = (px) => `600 ${px}px "Barlow Condensed","Oswald","Arial Narrow",system-ui,sans-serif`;
    g.textBaseline = 'middle';

    // `size` is a REQUEST: measure and step down until the text fits with a margin, or longer names run off the panel.
    const runFor = (px) => {
        g.font = face(px);
        const gp = px * track;
        let t = 0;
        for (const ch of text) t += g.measureText(ch).width + gp;
        return t - gp;
    };
    // The margin has to pay for the GLOW too: lettering is drawn with a 0.45em shadow, so a string that measured as fitting
    // still clipped its last letter ("FIB CENTRAI").
    let px = size;
    let total = runFor(px);
    while (total + px * 0.95 > w && px > 12) {
        px -= 2;
        total = runFor(px);
    }

    const gap = px * track;
    let x = (w - total) / 2;
    g.shadowColor = ink;
    g.shadowBlur = px * 0.45;
    g.fillStyle = ink;
    for (const ch of text) {
        g.fillText(ch, x, h / 2 + px * 0.04);
        x += g.measureText(ch).width + gap;
    }
    return finish(new CanvasTexture(c));
}

/**
* The city the line runs through, as a silhouette (DESIGN.md §8). It fills the sky above the canopy on a tall phone
* frame. Fog is OFF on this plane and the haze is painted in: real fog at this distance would erase it.
*/
function cityTexture() {
    const w = 1024, h = 256;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    let x = -20;
    let i = 0;
    while (x < w) {
        const bw = 26 + hash(i * 3.1) * 78;
        // Tall minimums on purpose: the canopy hides the lower third, so a portrait frame got one visible tower.
        const bh = 96 + hash(i * 7.7) * 152;
        // Nearer-looking blocks are darker; the pale ones sit back in the haze.
        const haze = 0.35 + hash(i * 2.3) * 0.5;
        g.fillStyle = `rgba(16,24,44,${0.5 + (1 - haze) * 0.45})`;
        g.fillRect(x, h - bh, bw, bh);

        // A handful of lit windows, and one in four is warm.
        const cols = Math.max(1, Math.floor(bw / 13));
        const rows = Math.max(1, Math.floor(bh / 17));
        for (let cx = 0; cx < cols; cx++) {
            for (let cy = 0; cy < rows; cy++) {
                if (hash(i * 13.7 + cx * 3.3 + cy * 9.1) > 0.9) {
                    const warm = hash(i * 5.9 + cx + cy * 2.1) > 0.75;
                    g.fillStyle = warm ? 'rgba(255,180,90,0.5)' : 'rgba(150,185,255,0.32)';
                    g.fillRect(x + 5 + cx * 13, h - bh + 7 + cy * 17, 4, 6);
                }
            }
        }
        // A red aircraft light on the tallest few.
        if (bh > 180) {
            g.fillStyle = 'rgba(255,80,70,0.75)';
            g.fillRect(x + bw / 2 - 1.5, h - bh - 3, 3, 3);
        }
        x += bw + 3 + hash(i * 11.3) * 12;
        i++;
    }
    return finish(new CanvasTexture(c));
}

/**
* A lit window as glass rather than a flat colour: warm centre falling to a dimmer edge, a dark mullion and a painted
* frame, three gradients drawn once and shared by both sides. A flat amber plane stops being a thing at close-shot size.
*/
function windowTexture() {
    const w = 128, h = 96;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');

    // The glow inside, hottest a little below centre where a firebox would be.
    const rg = g.createRadialGradient(w * 0.5, h * 0.62, 2, w * 0.5, h * 0.62, w * 0.62);
    rg.addColorStop(0, '#ffe6b4');
    rg.addColorStop(0.42, '#e59c33');
    rg.addColorStop(1, '#5e3308');
    g.fillStyle = rg;
    g.fillRect(0, 0, w, h);

    g.strokeStyle = 'rgba(10,13,24,0.92)';
    g.lineWidth = 9;
    g.strokeRect(0, 0, w, h);
    g.fillStyle = 'rgba(10,13,24,0.85)';
    g.fillRect(w * 0.5 - 2.5, 0, 5, h);

    return finish(new CanvasTexture(c));
}

/** The sky behind everything: a night gradient with a faint sodium horizon. */
function skyTexture() {
    const c = document.createElement('canvas');
    c.width = 4; c.height = 256;
    const g = c.getContext('2d');
    const lg = g.createLinearGradient(0, 0, 0, 256);
    lg.addColorStop(0, '#04060d');
    lg.addColorStop(0.55, '#080d1c');
    lg.addColorStop(0.86, '#111c33');
    lg.addColorStop(1, '#1c2540');
    g.fillStyle = lg;
    g.fillRect(0, 0, 4, 256);
    return finish(new CanvasTexture(c));
}

// The volumetric shell: a hollow additive cone with a falloff along its length and a fresnel term (brightest edge-on),
// which is what makes it read as air with light in it. Raymarched fog would cost a render target and a second shader.
const BEAM_VS = `
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
}`;
const BEAM_FS = `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uEdge;
uniform float uFall;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
void main() {
    float edge = 1.0 - abs(dot(normalize(vN), normalize(vV)));
    edge = pow(clamp(edge, 0.0, 1.0), uEdge);
    // uv.y is 1 at the narrow cap, which is where the source is.
    float len = pow(clamp(vUv.y, 0.0, 1.0), uFall);
    gl_FragColor = vec4(uColor, uOpacity * (0.30 + 0.70 * edge) * len);
}`;

function beamMaterial(color, opacity, edge = 1.7, fall = 2.4) {
    return new ShaderMaterial({
        uniforms: {
            uColor: { value: new Color(color) },
            uOpacity: { value: opacity },
            uEdge: { value: edge },
            uFall: { value: fall },
        },
        vertexShader: BEAM_VS,
        fragmentShader: BEAM_FS,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
    });
}

// One material per role, shared by every mesh (a fresh MeshStandardMaterial per box is a fresh shader program).
// Base values are lifted about two stops above the deck's own colours: a 3D material's colour is BEFORE light falloff,
// so deck values rendered a black shape on a black ground.
function makeMaterials() {
    return {
        hull: new MeshStandardMaterial({ color: 0x3a4a6d, roughness: 0.55, metalness: 0.42 }),
        hullDark: new MeshStandardMaterial({ color: 0x25314c, roughness: 0.66, metalness: 0.36 }),
        iron: new MeshStandardMaterial({ color: 0x171d2c, roughness: 0.38, metalness: 0.85 }),
        trim: new MeshStandardMaterial({ color: 0x53658f, roughness: 0.32, metalness: 0.72 }),
        brass: new MeshStandardMaterial({ color: 0xa8843f, roughness: 0.3, metalness: 0.9 }),
        glow: new MeshBasicMaterial({ color: AMBER }),
        lampGlass: new MeshBasicMaterial({ color: 0xffd79a }),
        coal: new MeshStandardMaterial({ color: 0x0e1220, roughness: 0.95, metalness: 0.2 }),
        // TIMBER, not painted steel or brass: a horizontal band crossed by a vertical one in bright metal is a ribbon, and crates read as presents.
        crate: new MeshStandardMaterial({ color: 0x5c4c38, roughness: 0.94, metalness: 0.02 }),
        crateFrame: new MeshStandardMaterial({ color: 0x7d6749, roughness: 0.88, metalness: 0.03 }),
        // The lid is two stops below the body: thrown back at 140 degrees it faces the key light and came back brightest in the close shot.
        crateLid: new MeshStandardMaterial({ color: 0x3f3427, roughness: 0.96, metalness: 0.02 }),
        ground: new MeshStandardMaterial({ color: 0x141b2c, roughness: 0.95, metalness: 0.05 }),
        // Lower roughness (damp, so lamps lie down as streaks) and much darker: a night platform is lit in POOLS, and an
        // evenly bright one (#2a3348 was) beat the locomotive for attention.
        platform: new MeshStandardMaterial({ color: 0x1a2234, roughness: 0.62, metalness: 0.12 }),
        platformEdge: new MeshStandardMaterial({ color: 0x8a6a2a, roughness: 0.6, metalness: 0.3 }),
        rail: new MeshStandardMaterial({ color: 0x6d7fa8, roughness: 0.22, metalness: 0.95 }),
        canopy: new MeshStandardMaterial({ color: 0x1b2338, roughness: 0.8, metalness: 0.3 }),
    };
}

/**
* `emitRef` is how the payout leaves the scene: a 2D overlay draws the lucky spins in screen space (their destination
* is a DOM row), so each frame this projects every crate's lip through its camera into a ref. A ref, not a callback:
* sixty state updates a second through React for a value nothing renders.
*/
export function ArrivalTrain3D({ crateCount = 0, epoch = null, emitRef = null, style }) {
    const wrapRef = useRef(null);
    const canvasRef = useRef(null);

    useEffect(() => {
        const wrap = wrapRef.current;
        const canvas = canvasRef.current;
        if (!wrap || !canvas) return undefined;

        const motionOff = prefersReducedMotion();
        const cars = Math.max(0, Math.min(crateCount, MAX_CRATES));

        const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
        renderer.setClearColor(0x000000, 0);
        renderer.toneMapping = ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.15;
        renderer.outputColorSpace = SRGBColorSpace;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        // SHADOWS: one directional light casts (the key), with its frustum parked over the PLATFORM so crates keep their shadows after the train leaves.
        renderer.shadowMap.enabled = true;
        // The shadow type stays the default PCF: `PCFSoftShadowMap` is deprecated as of three 0.185 and only logs a warning. Softness comes from `shadow.radius`.

        const scene = new Scene();
        // The train arrives OUT OF the dark and leaves back into it. Fog is what
        // makes the band feel like a length of track rather than a lit stage.
        scene.fog = new Fog(DECK_DEEP, 13, 42);

        // THE ANGLE: nearly square to the track at platform eye level (1.35, horizon just under the boiler centreline), looking
        // slightly UP (we read machines as big by looking up); a long lens from far along the track stacks the wagons into a
        // mass. The side offset shows the smokebox front and near flank. These numbers belong to a SHOT (see `frameShot`).
        const camera = new PerspectiveCamera(17, 1, 0.1, 140);

        const M = makeMaterials();
        const disposables = [];
        /** Anything with a `dispose()` goes through here and nowhere else. */
        const track = (x) => { disposables.push(x); return x; };

        buildArrivalScenery(scene, M, track);

        const glowTex = track(radialTexture(GLOW_STOPS));
        const smokeTex = track(radialTexture(SMOKE_STOPS));
        const streakTex = track(streakTexture());

        /** An additive billboard standing in for bloom: one draw call per emitter, fogged, and depth-tested so a passing locomotive correctly hides a lamp (EffectComposer would not). */
        const glows = [];
        const addGlow = (parent, x, y, z, size, color, opacity, tex = glowTex) => {
            const mat = track(new SpriteMaterial({
                map: tex, color, transparent: true, opacity,
                blending: AdditiveBlending, depthWrite: false,
            }));
            const s = new Sprite(mat);
            s.position.set(x, y, z);
            s.scale.set(size, size, 1);
            parent.add(s);
            glows.push({ sprite: s, base: opacity, baseScale: size });
            return s;
        };

        // ── the backdrop ────────────────────────────────────────────────────
        // Sky and skyline exist for the PHONE: on a desktop letterbox none is in shot; on a portrait shaft it is twelve units of empty air above the canopy.
        // Opaque and depth-writing on purpose: with `depthWrite: false` three still sorts it with the opaque queue, so the sky drew last over the station.
        const skyMat = track(new MeshBasicMaterial({ map: track(skyTexture()), fog: false }));
        const sky = new Mesh(track(new PlaneGeometry(260, 90)), skyMat);
        sky.position.set(0, 22, -46);
        scene.add(sky);

        const cityMat = track(new MeshBasicMaterial({
            map: track(cityTexture()), transparent: true, fog: false, depthWrite: false, opacity: 0.9,
        }));
        const city = new Mesh(track(new PlaneGeometry(150, 31)), cityMat);
        // The base sits just under the line the canopy roof hides, so the
        // buildings have no visible footing — they rise out of the station.
        city.position.set(0, 18, -34);
        scene.add(city);

        // ── the world ───────────────────────────────────────────────────────
        const ground = new Mesh(track(new PlaneGeometry(160, 30)), M.ground);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        scene.add(ground);

        // Two rails; the lit crown on each is a real specular highlight rather than a painted seam line.
        for (const z of [-0.62, 0.62]) {
            const r = new Mesh(track(new BoxGeometry(160, 0.07, 0.09)), M.rail);
            r.position.set(0, 0.035, z);
            r.receiveShadow = true;
            scene.add(r);
        }
        // Sleepers, sparse — enough to read as track when the headlight sweeps
        // across them, not so many that they cost anything.
        const sleeperGeo = track(new BoxGeometry(0.22, 0.05, 1.9));
        for (let i = -34; i <= 34; i++) {
            const s = new Mesh(sleeperGeo, M.hullDark);
            s.position.set(i * 1.1, 0.012, 0);
            s.receiveShadow = true;
            scene.add(s);
        }
        // A second track in the fog, beyond the telegraph poles (nearer it ran through the far platform's slab). It carries nothing.
        for (const z of [-11.84, -10.6]) {
            const r = new Mesh(track(new BoxGeometry(160, 0.07, 0.09)), M.rail);
            r.position.set(0, 0.035, z);
            scene.add(r);
        }

        // THE PLATFORM: paving, a warned-away edge, lamps and a roof, so the crates land on somewhere.
        // Deep enough that its front edge is never in shot (at 3.8 the letterbox showed the far side and a hard seam).
        const plat = new Mesh(track(new BoxGeometry(160, 0.34, 8)), M.platform);
        plat.position.set(0, 0.17, 5.2);
        plat.receiveShadow = true;
        scene.add(plat);

        // Paving: grooves across the slab. Nothing reads as a floor until
        // something on it has a repeating scale the eye can measure against.
        const grooveGeo = track(new BoxGeometry(0.035, 0.012, 8));
        for (let i = -30; i <= 30; i++) {
            const g = new Mesh(grooveGeo, M.ground);
            g.position.set(i * 1.4, 0.345, 5.2);
            scene.add(g);
        }
        // One groove running the other way, at the back of the safety line —
        // paving that only has one axis reads as decking, not as slabs.
        const seamGeo = track(new BoxGeometry(160, 0.012, 0.035));
        for (const z of [2.6, 4.2, 5.8]) {
            const s = new Mesh(seamGeo, M.ground);
            s.position.set(0, 0.345, z);
            scene.add(s);
        }

        // The safety line: the one piece of paint on a real platform, and amber
        // is already this world's warning colour.
        const safety = new Mesh(track(new BoxGeometry(160, 0.014, 0.14)), M.platformEdge);
        safety.position.set(0, 0.348, 1.72);
        scene.add(safety);

        // The coping stone at the edge, catching the light along its lip.
        const coping = new Mesh(track(new BoxGeometry(160, 0.36, 0.16)), M.trim);
        // Also offset the coping front from the platform slab at z=1.2.
        coping.position.set(0, 0.18, 1.25);
        coping.receiveShadow = true;
        scene.add(coping);

        // Everything vertical goes BEHIND the train: uprights on the near platform crossed the 9:1 letterbox as a picket of
        // bars. The near platform stays flat and the height moves to the far side, silhouetted against the fog. The canopy is
        // at 2.85 because the desktop frame tops out near 2.9 and a higher roof was above the picture.
        const postGeo = track(new CylinderGeometry(0.045, 0.06, 2.2, 10));
        const armGeo = track(new CylinderGeometry(0.035, 0.035, 0.5, 8));
        const headGeo = track(new SphereGeometry(0.11, 12, 10));
        const shadeGeo = track(new CylinderGeometry(0.19, 0.07, 0.14, 12, 1, true));
        const LAMP_XS = [-11.5, -5.6, 0.3, 6.2, 12.1];
        for (const x of LAMP_XS) {
            const post = new Mesh(postGeo, M.iron);
            post.position.set(x, 1.35, -3.4);
            scene.add(post);

            const arm = new Mesh(armGeo, M.iron);
            arm.rotation.z = Math.PI / 2;
            arm.position.set(x + 0.25, 2.42, -3.4);
            scene.add(arm);

            // A shade over the bulb. Without it the lamp is a floating bead;
            // with it there is a fitting the light is falling out of.
            const shade = new Mesh(shadeGeo, M.iron);
            shade.position.set(x + 0.5, 2.44, -3.4);
            scene.add(shade);

            const head = new Mesh(headGeo, M.lampGlass);
            head.position.set(x + 0.5, 2.34, -3.4);
            scene.add(head);

            // NAMED RULE: a bloom sprite may not share a plane with its own fixture. A depth-tested glow at the bulb's depth is
            // sliced by the shade, arm, post and canopy slab, and every sub-pixel of camera movement moves those cut lines across
            // it, so the lamp flickers. The glow sits clear of the fitting and shrinks to fit under the canopy lip; the locomotive still occludes it.
            addGlow(scene, x + 0.5, 2.22, -3.12, 0.9, LAMP, 0.55);
        }

        // The far canopy: a roof edge and its stanchions behind the train, which
        // is what says "station" without standing in front of the subject.
        const canopy = new Mesh(track(new BoxGeometry(160, 0.12, 4.6)), M.canopy);
        canopy.position.set(0, 2.85, -5.2);
        scene.add(canopy);
        const canopyLip = new Mesh(track(new BoxGeometry(160, 0.2, 0.1)), M.trim);
        // The roof front is z=-2.9. Keep the fascia proud of it, rather than
        // coplanar: overlapping faces shimmer as the camera moves.
        canopyLip.position.set(0, 2.76, -2.86);
        scene.add(canopyLip);
        // Ribs across the underside, receding — the cheapest possible way to
        // give a flat roof plane a direction and a scale.
        const ribGeo = track(new BoxGeometry(0.08, 0.07, 4.6));
        for (let i = -22; i <= 22; i++) {
            const rib = new Mesh(ribGeo, M.hullDark);
            rib.position.set(i * 1.6, 2.76, -5.2);
            scene.add(rib);
        }
        const stanchionGeo = track(new CylinderGeometry(0.07, 0.07, 2.85, 8));
        const braceGeo = track(new BoxGeometry(0.9, 0.05, 0.05));
        for (const x of [-15, -8.5, -2, 4.5, 11, 17.5]) {
            const s = new Mesh(stanchionGeo, M.iron);
            s.position.set(x, 1.42, -6.0);
            scene.add(s);
            // A diagonal brace at the head of each, which is the detail that
            // stops a column being a pipe.
            for (const dir of [-1, 1]) {
                const br = new Mesh(braceGeo, M.iron);
                br.position.set(x + dir * 0.42, 2.44, -6.0);
                br.rotation.z = dir * 0.5;
                scene.add(br);
            }
        }
        // A far platform for them to stand on, seen past the train.
        const farPlat = new Mesh(track(new BoxGeometry(160, 0.34, 3.6)), M.platform);
        farPlat.position.set(0, 0.17, -3.6);
        farPlat.receiveShadow = true;
        scene.add(farPlat);

        // Telegraph poles and wires beyond the roof: real geometry at real depth, the only thing above the canopy that moves
        // with the camera, which sells the sky and city as distance rather than wallpaper.
        const poleGeo = track(new CylinderGeometry(0.055, 0.075, 4.4, 7));
        const crossGeo = track(new BoxGeometry(0.06, 0.06, 1.5));
        const wireGeo = track(new BoxGeometry(9.2, 0.018, 0.018));
        const POLE_XS = [-18.4, -9.2, 0, 9.2, 18.4];
        for (let i = 0; i < POLE_XS.length; i++) {
            const x = POLE_XS[i];
            const p = new Mesh(poleGeo, M.hullDark);
            p.position.set(x, 2.2, -8.6);
            scene.add(p);
            for (const y of [3.9, 3.55]) {
                const cb = new Mesh(crossGeo, M.hullDark);
                cb.position.set(x, y, -8.6);
                scene.add(cb);
            }
            if (i < POLE_XS.length - 1) {
                for (const [y, z] of [[3.88, -8.0], [3.88, -9.2], [3.53, -8.0], [3.53, -9.2]]) {
                    const w = new Mesh(wireGeo, M.hullDark);
                    w.position.set(x + 4.6, y - 0.06, z);
                    scene.add(w);
                }
            }
        }

        // SIGNAGE: the nameboard says where you ARE, the hanging sign which platform the train is at. The name is FIB's
        // own (it read CONCOURSE, an internal codename, until the theatre put a camera close to it).
        const nameboardTex = track(signTexture('FIB CENTRAL', { size: 74, track: 0.22 }));
        // NAMEBOARD_X puts it in the gap between the far lamps at +0.3 and +6.2, where the posts miss both (at -7.4 it was
        // off the left edge or behind the board). It is behind the locomotive while the train stands, which is fine: a name is read arriving and leaving.
        const NAMEBOARD_X = 3.2;
        const nameboard = new Mesh(track(new PlaneGeometry(3.4, 0.85)), track(new MeshBasicMaterial({ map: nameboardTex, transparent: true })));
        nameboard.position.set(NAMEBOARD_X, 1.5, -3.35);
        scene.add(nameboard);
        const nameboardPosts = track(new BoxGeometry(0.07, 1.2, 0.07));
        for (const dx of [-1.5, 1.5]) {
            const p = new Mesh(nameboardPosts, M.iron);
            p.position.set(NAMEBOARD_X + dx, 0.94, -3.35);
            scene.add(p);
        }

        const hangTex = track(signTexture('PLATFORM 1', { size: 60, track: 0.2 }));
        const hanging = new Mesh(track(new PlaneGeometry(1.9, 0.48)), track(new MeshBasicMaterial({ map: hangTex, transparent: true })));
        hanging.position.set(5.2, 2.36, -2.9);
        scene.add(hanging);
        const hangRod = track(new BoxGeometry(0.03, 0.32, 0.03));
        for (const dx of [-0.75, 0.75]) {
            const r = new Mesh(hangRod, M.iron);
            r.position.set(5.2 + dx, 2.72, -2.9);
            scene.add(r);
        }
        addGlow(scene, 5.2, 2.36, -2.85, 1.1, AMBER, 0.3);

        // THE SIGNAL: green on the approach, red once standing, green again at T_DEPART (half a second before the wheels move),
        // the one thing that tells the player what is about to happen. It sits ahead of the train, at +x.
        const signalPost = new Mesh(track(new CylinderGeometry(0.06, 0.08, 2.6, 8)), M.iron);
        signalPost.position.set(10.4, 1.3, -2.3);
        scene.add(signalPost);
        const signalHead = new Mesh(track(new BoxGeometry(0.16, 0.62, 0.3)), M.hullDark);
        signalHead.position.set(10.4, 2.5, -2.3);
        scene.add(signalHead);
        const signalLensGeo = track(new CylinderGeometry(0.075, 0.075, 0.05, 12));
        const redMat = track(new MeshBasicMaterial({ color: SIGNAL_RED }));
        const greenMat = track(new MeshBasicMaterial({ color: SIGNAL_GREEN }));
        const redLens = new Mesh(signalLensGeo, redMat);
        redLens.rotation.x = Math.PI / 2;
        redLens.position.set(10.4, 2.66, -2.14);
        scene.add(redLens);
        const greenLens = new Mesh(signalLensGeo, greenMat);
        greenLens.rotation.x = Math.PI / 2;
        greenLens.position.set(10.4, 2.34, -2.14);
        scene.add(greenLens);
        const redGlow = addGlow(scene, 10.4, 2.66, -2.1, 0.75, SIGNAL_RED, 0);
        const greenGlow = addGlow(scene, 10.4, 2.34, -2.1, 0.75, SIGNAL_GREEN, 0);
        // A ladder up the post, because a signal nobody can reach is a prop.
        const rungGeo = track(new BoxGeometry(0.02, 0.02, 0.2));
        for (let i = 0; i < 9; i++) {
            const r = new Mesh(rungGeo, M.iron);
            r.position.set(10.28, 0.5 + i * 0.22, -2.3);
            scene.add(r);
        }

        // ── lights ──────────────────────────────────────────────────────────
        // Five sources, cold-dominant and nothing white: ambient 0.7 on a near-black hull left half of every shape missing.
        scene.add(new AmbientLight(0x40527d, 1.5));

        const key = new DirectionalLight(0xa9c0ec, 1.5);
        key.position.set(5, 9, 8);
        key.castShadow = true;
        key.shadow.mapSize.set(2048, 2048);
        // The frustum is parked over the PLATFORM, not tracked to the train: tracking would take the crates' shadows away as
        // the train leaves. A fixed 36-unit box at 2048 is 57 texels per unit.
        key.shadow.camera.left = -18;
        key.shadow.camera.right = 18;
        key.shadow.camera.top = 14;
        key.shadow.camera.bottom = -14;
        key.shadow.camera.near = 1;
        key.shadow.camera.far = 44;
        key.shadow.bias = -0.0014;
        key.shadow.normalBias = 0.025;
        key.shadow.radius = 3;
        scene.add(key);
        scene.add(key.target);

        // Bounce off the platform, from below and in front. Cheap, and it is
        // what stops the underframe and the wheels from being a black band.
        const bounce = new DirectionalLight(0x6d84b8, 0.7);
        bounce.position.set(1, -3, 6);
        scene.add(bounce);

        // A rim light from behind and above does the most work: the boiler, the one curved surface, needs something to catch.
        const rim = new DirectionalLight(0xbcd0f5, 1.5);
        rim.position.set(-6, 5, -7);
        scene.add(rim);

        // Station lamps pooling amber. The far ones hang at the visible lamp heads; the near ones have no fixture on purpose
        // (above the top of frame, so no post crosses the shot).
        const lamps = [];
        for (const x of LAMP_XS) {
            const p = new PointLight(LAMP, 0, 11, 2);
            p.position.set(x + 0.5, 2.34, -3.4);
            scene.add(p);
            lamps.push({ light: p, peak: 14 });
        }
        // The near lamps hang over the TRACK EDGE (z 2.4), not mid-platform (z 4.2 lit empty paving and the floor out-shone the subject).
        const NEAR_LAMP_XS = [-6.5, -1, 4.5];
        for (const x of NEAR_LAMP_XS) {
            const p = new PointLight(LAMP, 0, 11, 2);
            p.position.set(x, 3.2, 2.4);
            scene.add(p);
            lamps.push({ light: p, peak: 8.5 });
        }

        // The far lamps get a visible shaft; a cone onto the near platform would cross the subject (§9's furniture rule), so the near light is a wet-floor streak.
        const beams = [];
        // The shaft stops ABOVE the paving: at 2.5 long it reached y -0.13 against the far platform's top at 0.34, cutting a hard line through the additive shell.
        const lampConeGeo = track(new CylinderGeometry(0.1, 1.18, 1.95, 18, 1, true));
        for (const x of LAMP_XS) {
            const mat = track(beamMaterial(LAMP, 0.0, 1.6, 1.9));
            const cone = new Mesh(lampConeGeo, mat);
            cone.position.set(x + 0.5, 1.40, -3.4);
            scene.add(cone);
            beams.push({ mat, peak: 0.16 });
        }

        const wetGeo = track(new PlaneGeometry(1.9, 5.4));
        const wetPools = [];
        for (const x of NEAR_LAMP_XS) {
            const mat = track(new MeshBasicMaterial({
                map: glowTex, color: LAMP, transparent: true, opacity: 0,
                blending: AdditiveBlending, depthWrite: false,
            }));
            const pool = new Mesh(wetGeo, mat);
            pool.rotation.x = -Math.PI / 2;
            pool.position.set(x, 0.353, 2.6);
            scene.add(pool);
            wetPools.push(mat);
        }
        // The headlight's own reflection, which travels with the train and is
        // the only moving light on the floor.
        const headWetMat = track(new MeshBasicMaterial({
            map: glowTex, color: 0xffd9a0, transparent: true, opacity: 0,
            blending: AdditiveBlending, depthWrite: false,
        }));
        const headWet = new Mesh(track(new PlaneGeometry(7.5, 2.6)), headWetMat);
        headWet.rotation.x = -Math.PI / 2;
        headWet.position.set(0, 0.354, 2.3);
        scene.add(headWet);

        // Ground mist: two flat planes drifting oppositely give parallax; a particle fog would cost forty sprites for something behind the train.
        const mistLayers = [];
        for (let i = 0; i < 2; i++) {
            const mat = track(new MeshBasicMaterial({
                map: smokeTex, color: 0x6d84b8, transparent: true, opacity: 0,
                blending: AdditiveBlending, depthWrite: false,
            }));
            const m = new Mesh(track(new PlaneGeometry(46, 13)), mat);
            m.rotation.x = -Math.PI / 2;
            m.position.set(0, 0.09 + i * 0.05, -2.5 + i * 1.5);
            scene.add(m);
            mistLayers.push({ mesh: m, mat, dir: i === 0 ? 1 : -1, speed: 0.24 + i * 0.19 });
        }

        // ── the locomotive ──────────────────────────────────────────────────
        const train = new Group();
        scene.add(train);

        const wheelsets = [];
        const wheelGeoCache = new Map();
        const wheelGeoFor = (radius) => {
            if (!wheelGeoCache.has(radius)) {
                wheelGeoCache.set(radius, track(new CylinderGeometry(radius, radius, 0.11, 22)));
            }
            return wheelGeoCache.get(radius);
        };
        const addWheels = (parent, xs, radius) => {
            const out = [];
            for (const x of xs) {
                for (const z of [-0.62, 0.62]) {
                    const w = new Mesh(wheelGeoFor(radius), M.iron);
                    w.rotation.x = Math.PI / 2;
                    w.position.set(x, radius, z);
                    w.castShadow = true;
                    parent.add(w);
                    wheelsets.push({ mesh: w, radius });
                    out.push(w);
                }
            }
            return out;
        };

        const loco = new Group();
        train.add(loco);

        // Boiler: a cylinder laid along the track. This one shape is most of
        // what separates a locomotive from a box, and it is one line.
        const boiler = new Mesh(track(new CylinderGeometry(0.52, 0.55, 2.25, 24)), M.hull);
        boiler.rotation.z = Math.PI / 2;
        boiler.position.set(0.62, 1.0, 0);
        boiler.castShadow = true;
        loco.add(boiler);

        // Smokebox door — a slightly proud disc at the front, the face of the engine.
        const smokebox = new Mesh(track(new CylinderGeometry(0.57, 0.57, 0.16, 24)), M.trim);
        smokebox.rotation.z = Math.PI / 2;
        smokebox.position.set(1.78, 1.0, 0);
        smokebox.castShadow = true;
        loco.add(smokebox);

        const chimney = new Mesh(track(new CylinderGeometry(0.17, 0.22, 0.52, 16)), M.iron);
        chimney.position.set(1.42, 1.66, 0);
        chimney.castShadow = true;
        loco.add(chimney);

        const dome = new Mesh(track(new SphereGeometry(0.26, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2)), M.trim);
        dome.position.set(0.42, 1.48, 0);
        loco.add(dome);

        const cab = new Mesh(track(new BoxGeometry(1.15, 1.2, 1.3)), M.hull);
        cab.position.set(-1.05, 1.2, 0);
        cab.castShadow = true;
        loco.add(cab);
        const cabRoof = new Mesh(track(new BoxGeometry(1.35, 0.08, 1.45)), M.trim);
        cabRoof.position.set(-1.05, 1.84, 0);
        cabRoof.castShadow = true;
        loco.add(cabRoof);

        // Cab windows — the only warm thing on the train besides the lamp, and
        // the only thing on it made of glass. See `windowTexture`.
        const cabGlass = track(new MeshBasicMaterial({ map: track(windowTexture()) }));
        for (const z of [-0.66, 0.66]) {
            const win = new Mesh(track(new PlaneGeometry(0.58, 0.42)), cabGlass);
            win.position.set(-1.05, 1.38, z);
            win.rotation.y = z > 0 ? 0 : Math.PI;
            loco.add(win);
            addGlow(loco, -1.05, 1.38, z * 1.06, 1.0, AMBER, 0.34);
        }

        const footplate = new Mesh(track(new BoxGeometry(LOCO_LEN, 0.1, 1.5)), M.trim);
        footplate.position.set(0.25, 0.52, 0);
        footplate.castShadow = true;
        loco.add(footplate);

        const buffer = new Mesh(track(new BoxGeometry(0.14, 0.5, 1.5)), M.iron);
        buffer.position.set(1.92, 0.72, 0);
        loco.add(buffer);

        // THE DETAIL PASS: at this size a surface is read by highlights along it, so each band, rail and rivet line (one primitive) exists to catch the rim light.

        // Boiler bands — the rings that hold the barrel together.
        const bandGeo = track(new CylinderGeometry(0.545, 0.545, 0.05, 20));
        for (const x of [0.05, 0.62, 1.2]) {
            const band = new Mesh(bandGeo, M.trim);
            band.rotation.z = Math.PI / 2;
            band.position.set(x, 1.0, 0);
            loco.add(band);
        }

        // Handrails down both flanks of the boiler — a bright thin line at the
        // widest point, which is the single most legible detail on a loco.
        const railGeo = track(new CylinderGeometry(0.022, 0.022, 2.2, 6));
        for (const z of [-0.5, 0.5]) {
            const hr = new Mesh(railGeo, M.brass);
            hr.rotation.z = Math.PI / 2;
            hr.position.set(0.62, 1.28, z);
            loco.add(hr);
        }

        // Smokebox door: hinge strap and centre dart. The face of the engine,
        // and the thing that makes the front read as a front.
        const strap = new Mesh(track(new BoxGeometry(0.04, 1.02, 0.07)), M.trim);
        strap.position.set(1.87, 1.0, 0);
        loco.add(strap);
        const dart = new Mesh(track(new CylinderGeometry(0.075, 0.075, 0.08, 10)), M.brass);
        dart.rotation.z = Math.PI / 2;
        dart.position.set(1.9, 1.0, 0);
        loco.add(dart);

        // Buffers — two, and they are the silhouette's punctuation at the end.
        const bufGeo = track(new CylinderGeometry(0.075, 0.09, 0.22, 10));
        for (const z of [-0.45, 0.45]) {
            const b = new Mesh(bufGeo, M.trim);
            b.rotation.z = Math.PI / 2;
            b.position.set(2.05, 0.78, z);
            loco.add(b);
        }

        // Safety valve and whistle on the firebox top.
        const valve = new Mesh(track(new CylinderGeometry(0.05, 0.06, 0.2, 8)), M.brass);
        valve.position.set(-0.35, 1.55, 0);
        loco.add(valve);
        const whistle = new Mesh(track(new CylinderGeometry(0.032, 0.032, 0.26, 8)), M.brass);
        whistle.position.set(-0.62, 1.62, 0.18);
        loco.add(whistle);

        // A chimney cap, so the stack ends in an edge rather than a cut.
        const cap = new Mesh(track(new CylinderGeometry(0.21, 0.19, 0.08, 16)), M.trim);
        cap.position.set(1.42, 1.9, 0);
        loco.add(cap);

        // Cab steps, hanging below the footplate on the platform side.
        const stepGeo = track(new BoxGeometry(0.34, 0.03, 0.16));
        for (let i = 0; i < 2; i++) {
            const st = new Mesh(stepGeo, M.trim);
            st.position.set(-1.35, 0.38 - i * 0.16, 0.72);
            loco.add(st);
        }

        // Cylinder blocks at the front, low and outboard (z = +-0.72, forward to CYL_X) so the motion below has room to slide.
        const cylGeo = track(new CylinderGeometry(0.17, 0.17, 0.5, 12));
        const cylCapGeo = track(new CylinderGeometry(0.185, 0.185, 0.05, 12));
        for (const z of [-0.72, 0.72]) {
            const cyl = new Mesh(cylGeo, M.hullDark);
            cyl.rotation.z = Math.PI / 2;
            cyl.position.set(CYL_X, 0.5, z);
            cyl.castShadow = true;
            loco.add(cyl);
            for (const dx of [-0.25, 0.25]) {
                const cc = new Mesh(cylCapGeo, M.trim);
                cc.rotation.z = Math.PI / 2;
                cc.position.set(CYL_X + dx, 0.5, z);
                loco.add(cc);
            }
        }

        detailArrivalLocomotive(loco, M, track);

        const DRIVER_XS = [1.35, 0.35, -0.95];
        const driverMeshes = addWheels(loco, DRIVER_XS, DRIVER_R);

        // THE MOTION: all three drivers are in phase, so the coupling rod stays horizontal and orbits (one sine and cosine, no
        // rotation). The main rod runs from the middle driver's crank pin to a crosshead on a straight line at cylinder height;
        // the crosshead is the fixed rod length solved against the pin, which keeps the piston stroke in phase.
        const pinGeo = track(new CylinderGeometry(0.036, 0.036, 0.1, 8));
        const tyreGeo = track(new TorusGeometry(DRIVER_R - 0.02, 0.035, 6, 20));
        const hubGeo = track(new CylinderGeometry(0.055, 0.055, 0.13, 8));
        for (const w of driverMeshes) {
            // Local +Y on a wheel points along the axle, so the outboard side is
            // whichever sign of y matches the wheel's own z.
            const outboard = w.position.z > 0 ? 0.06 : -0.06;
            const pin = new Mesh(pinGeo, M.brass);
            pin.position.set(CRANK_R, outboard, 0);
            w.add(pin);

            const tyre = new Mesh(tyreGeo, M.trim);
            tyre.rotation.x = Math.PI / 2;
            tyre.position.set(0, 0.005, 0);
            w.add(tyre);

            const hub = new Mesh(hubGeo, M.brass);
            w.add(hub);
        }

        const COUPLE_SPAN = DRIVER_XS[0] - DRIVER_XS[2];
        const COUPLE_MID = (DRIVER_XS[0] + DRIVER_XS[2]) / 2;
        const coupleGeo = track(new BoxGeometry(COUPLE_SPAN + 0.16, 0.06, 0.045));
        const mainGeo = track(new BoxGeometry(MAIN_ROD, 0.05, 0.04));
        const crossGeoBlk = track(new BoxGeometry(0.16, 0.14, 0.09));
        const pistonGeo = track(new BoxGeometry(0.5, 0.035, 0.035));
        const slideGeo = track(new BoxGeometry(0.62, 0.025, 0.03));
        const rods = [];
        for (const z of [-0.735, 0.735]) {
            const couple = new Mesh(coupleGeo, M.trim);
            couple.position.z = z;
            loco.add(couple);

            const main = new Mesh(mainGeo, M.trim);
            main.position.z = z;
            loco.add(main);

            const crosshead = new Mesh(crossGeoBlk, M.iron);
            crosshead.position.set(1.1, 0.5, z);
            loco.add(crosshead);

            const piston = new Mesh(pistonGeo, M.trim);
            piston.position.set(1.3, 0.5, z);
            loco.add(piston);

            // The bar the crosshead runs on, which is static and is what makes
            // the sliding block look guided rather than floating.
            const slide = new Mesh(slideGeo, M.iron);
            slide.position.set(1.12, 0.6, z);
            loco.add(slide);

            rods.push({ couple, main, crosshead, piston, z });
        }

        // An authored model replaces only the procedural body: headlight, cab glow, wheels and rods stay until a model has separate wheels.
        if (LOCO_MODEL_URL) {
            Promise.all([
                import('three/examples/jsm/loaders/GLTFLoader.js'),
                import('three'),
            ]).then(([{ GLTFLoader }, { Box3, Vector3 }]) => {
                new GLTFLoader().load(LOCO_MODEL_URL, (gltf) => {
                    const model = gltf.scene;

                    // Normalise: sit it on the rail, point it down the track, scale its length to the procedural loco.
                    const box = new Box3().setFromObject(model);
                    const span = new Vector3();
                    box.getSize(span);
                    const longest = Math.max(span.x, span.z);
                    model.scale.setScalar((LOCO_LEN * 1.15) / (longest || 1));
                    if (span.z > span.x) model.rotation.y = Math.PI / 2;

                    const box2 = new Box3().setFromObject(model);
                    model.position.y -= box2.min.y;
                    model.position.x -= (box2.min.x + box2.max.x) / 2;

                    model.traverse((o) => {
                        if (!o.isMesh) return;
                        o.castShadow = true;
                        // The site's own surface, not the model's livery.
                        o.material = M.hull;
                    });

                    for (const part of [boiler, smokebox, chimney, dome, cab, cabRoof, footplate, buffer]) {
                        part.visible = false;
                    }
                    loco.add(model);
                }, undefined, (err) => {
                    console.warn('[Arrival] Locomotive model failed to load; keeping the procedural one.', err);
                });
            });
        }

        // The headlight: a real spotlight, throwing down the track ahead.
        const lampBulb = new Mesh(track(new SphereGeometry(0.1, 12, 10)), track(new MeshBasicMaterial({ color: 0xffe6b8 })));
        lampBulb.position.set(1.95, 1.28, 0);
        loco.add(lampBulb);
        // The glow is SMALL and the streak THIN: a 1.5-unit bloom and 5.2-unit streak erased the smokebox, buffers and the whole front.
        const headGlow = addGlow(loco, 2.0, 1.28, 0, 0.62, 0xffd9a0, 0);
        const headStreakMat = track(new SpriteMaterial({
            map: streakTex, color: 0xffd9a0, transparent: true, opacity: 0,
            blending: AdditiveBlending, depthWrite: false,
        }));
        const headStreak = new Sprite(headStreakMat);
        headStreak.position.set(2.02, 1.28, 0);
        headStreak.scale.set(1.9, 0.24, 1);
        loco.add(headStreak);

        const head = new SpotLight(0xffd9a0, 0, 30, 0.34, 0.65, 1.4);
        head.position.set(1.95, 1.28, 0);
        const headTarget = new Object3D();
        headTarget.position.set(16, 0.35, 0);
        loco.add(head);
        loco.add(headTarget);
        head.target = headTarget;

        // The visible shaft: narrow cap at the lamp, wide end down the track; `rotation.z = +90 deg` maps the cylinder's +Y to -X.
        const headBeamMat = track(beamMaterial(0xffd2a0, 0, 1.5, 2.6));
        const headBeam = new Mesh(track(new CylinderGeometry(0.09, 1.5, 11, 20, 1, true)), headBeamMat);
        headBeam.rotation.z = Math.PI / 2;
        headBeam.position.set(1.95 + 5.5, 1.15, 0);
        loco.add(headBeam);

        // The firebox under the cab: the only unsteady light, flickering. Just outside the footplate on the near flank, not at z 0.2:
        // the footplate (+-0.75) cut a sprite reaching y 1.05 in half and layered a second flicker (same rule as the station lamps).
        const fireGlow = addGlow(loco, -1.05, 0.5, 0.82, 1.1, 0xff8a2a, 0);
        const fireLight = new PointLight(0xff7a20, 0, 3.4, 2);
        fireLight.position.set(-1.05, 0.45, 0.3);
        loco.add(fireLight);

        // VEHICLES: laid out by a running cursor (a tender, one wagon per crate in two alternating styles, a brake van), so a vehicle is one `place()` call.
        let cursor = -LOCO_LEN / 2;
        const place = (len) => {
            const g = new Group();
            g.position.x = cursor - CAR_GAP - len / 2;
            cursor = g.position.x - len / 2;
            train.add(g);
            return g;
        };
        const bufferPair = (parent, x) => {
            for (const z of [-0.42, 0.42]) {
                const b = new Mesh(bufGeo, M.trim);
                b.rotation.z = Math.PI / 2;
                b.position.set(x, 0.62, z);
                parent.add(b);
            }
        };

        // The tender. Coal is the one thing on this train that is not a box or
        // a cylinder, and the irregular heap is what the eye notices first.
        const tender = place(TENDER_LEN);
        const tenderBody = new Mesh(track(new BoxGeometry(TENDER_LEN, 0.86, 1.44)), M.hull);
        tenderBody.position.y = 0.95;
        tenderBody.castShadow = true;
        tender.add(tenderBody);
        const tenderFrame = new Mesh(track(new BoxGeometry(TENDER_LEN + 0.1, 0.14, 1.5)), M.hullDark);
        tenderFrame.position.y = 0.55;
        tender.add(tenderFrame);
        const coalGeo = track(new BoxGeometry(0.3, 0.24, 0.3));
        for (let i = 0; i < 9; i++) {
            const lump = new Mesh(coalGeo, M.coal);
            lump.position.set(
                (hash(i * 3.7) - 0.5) * (TENDER_LEN - 0.5),
                1.34 + hash(i * 9.1) * 0.12,
                (hash(i * 5.3) - 0.5) * 0.9,
            );
            lump.rotation.set(hash(i) * 1.2, hash(i * 2.2) * 1.6, hash(i * 4.4) * 0.9);
            lump.castShadow = true;
            tender.add(lump);
        }
        for (const z of [-0.74, 0.74]) {
            const lip = new Mesh(track(new BoxGeometry(TENDER_LEN, 0.07, 0.06)), M.trim);
            lip.position.set(0, 1.38, z);
            tender.add(lip);
        }
        addWheels(tender, [TENDER_LEN / 2 - 0.5, -TENDER_LEN / 2 + 0.5], 0.28);
        bufferPair(tender, TENDER_LEN / 2 + 0.06);
        bufferPair(tender, -TENDER_LEN / 2 - 0.06);

        // ── the freight cars ────────────────────────────────────────────────
        const crateMeshes = [];

        const makeCrate = createArrivalCrateFactory(M, track, addGlow);

        for (let i = 0; i < cars; i++) {
            const car = place(CAR_LEN);

            const deck = new Mesh(track(new BoxGeometry(CAR_LEN, 0.16, 1.5)), M.hullDark);
            deck.position.y = 0.62;
            deck.castShadow = true;
            car.add(deck);
            const solebar = new Mesh(track(new BoxGeometry(CAR_LEN + 0.08, 0.1, 1.56)), M.trim);
            solebar.position.y = 0.53;
            car.add(solebar);

            // Two wagon styles alternate; identical wagons read as an extruded strip.
            if (i % 2 === 0) {
                // Gondola: ribbed sides, open top.
                for (const z of [-0.72, 0.72]) {
                    const side = new Mesh(track(new BoxGeometry(CAR_LEN, 0.34, 0.07)), M.hull);
                    side.position.set(0, 0.84, z);
                    side.castShadow = true;
                    car.add(side);
                    for (let r = -1; r <= 1; r++) {
                        const rib = new Mesh(track(new BoxGeometry(0.07, 0.38, 0.1)), M.trim);
                        rib.position.set(r * (CAR_LEN / 3), 0.84, z);
                        car.add(rib);
                    }
                }
                for (const x of [-CAR_LEN / 2 + 0.04, CAR_LEN / 2 - 0.04]) {
                    const endw = new Mesh(track(new BoxGeometry(0.07, 0.34, 1.44)), M.hull);
                    endw.position.set(x, 0.84, 0);
                    car.add(endw);
                }
            } else {
                // Flat wagon: corner stakes and a chain rail, nothing else.
                for (const z of [-0.7, 0.7]) {
                    for (const x of [-CAR_LEN / 2 + 0.18, 0, CAR_LEN / 2 - 0.18]) {
                        const stake = new Mesh(track(new BoxGeometry(0.07, 0.42, 0.07)), M.trim);
                        stake.position.set(x, 0.9, z);
                        stake.castShadow = true;
                        car.add(stake);
                    }
                    const chain = new Mesh(track(new BoxGeometry(CAR_LEN - 0.2, 0.02, 0.02)), M.iron);
                    chain.position.set(0, 1.0, z);
                    car.add(chain);
                }
            }

            addWheels(car, [CAR_LEN / 2 - 0.45, -CAR_LEN / 2 + 0.45], 0.3);
            bufferPair(car, CAR_LEN / 2 + 0.06);
            bufferPair(car, -CAR_LEN / 2 - 0.06);

            const { crate, lidPivot, seamGlow, core } = makeCrate(i);

            scene.add(crate);
            crateMeshes.push({
                crate, car, carIndex: i, seamGlow, lidPivot, core,
                landed: false, spilled: false,
            });
        }

        // The brake van gives the consist an END and is the only vehicle with a light of its own.
        const van = place(VAN_LEN);
        const vanBody = new Mesh(track(new BoxGeometry(VAN_LEN, 1.05, 1.4)), M.hull);
        vanBody.position.y = 1.06;
        vanBody.castShadow = true;
        van.add(vanBody);
        const vanRoof = new Mesh(track(new BoxGeometry(VAN_LEN + 0.14, 0.07, 1.54)), M.trim);
        vanRoof.position.y = 1.62;
        van.add(vanRoof);
        const vanFrame = new Mesh(track(new BoxGeometry(VAN_LEN + 0.1, 0.13, 1.46)), M.hullDark);
        vanFrame.position.y = 0.55;
        van.add(vanFrame);
        for (const z of [-0.71, 0.71]) {
            const win = new Mesh(track(new PlaneGeometry(0.4, 0.3)), track(new MeshBasicMaterial({ color: 0xffb347 })));
            win.position.set(0.3, 1.2, z);
            win.rotation.y = z > 0 ? 0 : Math.PI;
            van.add(win);
            addGlow(van, 0.3, 1.2, z * 1.05, 0.9, 0xffb347, 0.26);
        }
        // The tail lamp gets its OWN material: `redMat` is the signal's lens and the frame loop mutates its colour, which would switch the van's lamp off.
        const tailMat = track(new MeshBasicMaterial({ color: SIGNAL_RED }));
        const tailLamp = new Mesh(track(new SphereGeometry(0.06, 8, 6)), tailMat);
        tailLamp.position.set(-VAN_LEN / 2 - 0.05, 0.95, 0.4);
        van.add(tailLamp);
        addGlow(van, -VAN_LEN / 2 - 0.08, 0.95, 0.4, 0.6, SIGNAL_RED, 0.5);
        addWheels(van, [VAN_LEN / 2 - 0.45, -VAN_LEN / 2 + 0.45], 0.28);
        bufferPair(van, VAN_LEN / 2 + 0.06);
        bufferPair(van, -VAN_LEN / 2 - 0.06);

        // PARTICLES: three pre-allocated, recycled pools (chimney exhaust, rail-level steam, embers); spawn-and-discard garbage
        // stutters mid-arrival. They are soft gradient sprites rather than spheres (a lit sphere is a ball of smoke), rotated per puff.
        const makePool = (n, color, opacity) => {
            const out = [];
            for (let i = 0; i < n; i++) {
                const mat = track(new SpriteMaterial({
                    map: smokeTex, color, transparent: true, opacity: 0,
                    depthWrite: false,
                }));
                const s = new Sprite(mat);
                s.visible = false;
                scene.add(s);
                out.push({ sprite: s, mat, born: -1, seed: Math.random(), vx: 0, vy: 0, vz: 0, life: 1, peak: opacity });
            }
            return out;
        };
        // Smoke reads as a MASS: single-puff opacity (0.19, scaled by a half-up lamp level) measured ~10% alpha and vanished; tune for what thirty overlapping sprites add up to.
        const exhaust = makePool(34, 0xa9bcd8, 0.42);
        const steam = makePool(26, 0xd6e3f7, 0.44);

        const embers = [];
        for (let i = 0; i < 22; i++) {
            const mat = track(new SpriteMaterial({
                map: glowTex, color: 0xffb15a, transparent: true, opacity: 0,
                blending: AdditiveBlending, depthWrite: false,
            }));
            const s = new Sprite(mat);
            s.visible = false;
            s.scale.set(0.09, 0.09, 1);
            scene.add(s);
            embers.push({ sprite: s, mat, born: -1, seed: Math.random(), vx: 0, vy: 0, vz: 0 });
        }

        const emit = (pool, idxRef, x, y, z, opts) => {
            const p = pool[idxRef.i];
            idxRef.i = (idxRef.i + 1) % pool.length;
            p.born = opts.t;
            p.seed = Math.random();
            p.sprite.visible = true;
            p.sprite.position.set(x, y, z);
            p.sprite.material.rotation = p.seed * Math.PI * 2;
            p.vx = opts.vx || 0;
            p.vy = opts.vy || 0;
            p.vz = opts.vz || 0;
            p.life = opts.life || 2.4;
            p.grow = opts.grow || 2.0;
            p.size0 = opts.size0 || 0.4;
            p.peakOverride = opts.peak;
            return p;
        };
        const exRef = { i: 0 }, stRef = { i: 0 }, emRef = { i: 0 };

        /** Reused for every projection. One allocation, not one per crate per frame. */
        const projV = new Vector3();

        // ── sizing and framing ──────────────────────────────────────────────
        // EVERY FRAME: the FOV is DERIVED from how much track must fit across, so a tall frame has air above the canopy (hence the
        // sky, skyline and poles) and the aim point rises to put the train in the lower third. The aspect sweeps continuously
        // from ~9:1 to ~2.5:1 during the iris, so a threshold anywhere in that range would be a visible lens change.
        const trainLen = LOCO_LEN / 2 - cursor;
        // Where the train comes to rest. The group's origin is the LOCOMOTIVE and everything hangs off it in -x, so centring
        // the consist would put the engine at the right-hand edge. Capped so the subject stays near the middle.
        const REST_X = Math.min(4.6, trainLen / 2 - LOCO_LEN / 2);
        const START_X = -36;
        // Far enough that the WHOLE consist clears the frame, or the brake van stayed in shot while the timeline said the platform was empty.
        const END_X = 28 + trainLen;

        let W = 0, H = 0, aspect = 1, aimX = -0.4, aimY = 1.28, crateSpread = 1.05, crateCentre = 0;
        /** The landed crate row's middle and width, solved in `layoutCrates`. */
        let rowMid = 0, rowSpan = 0;

        /** The vertical FOV that fits `fitW` world units across at `dist`. */
        const fovFor = (fitW, dist) => {
            const need = 2 * Math.atan((fitW / 2) / (dist * aspect)) * 180 / Math.PI;
            return Math.max(14, Math.min(64, need));
        };

        /**
        * The widest thing shot two has to hold: the crate row, end to end, from crate ZERO to crate n-1. It must not be the
        * last car's absolute position (measured from the locomotive, so it carried 5.36 units of loco and tender and pitched
        * the row too tight at three or four players). See the pitch rule in `layoutCrates`.
        */
        const crateRun = crateMeshes.length > 1
            ? Math.abs(
                crateMeshes[crateMeshes.length - 1].car.position.x
                - crateMeshes[0].car.position.x
            )
            : 0;

        /**
        * Shot ONE's lens, which the crate row is laid out against. The vertical field is capped (a 2.5:1 frame fitted like a
        * 9:1 band came back a strip of train between sky and empty paving) and the horizontal follows it down; a floor under
        * both keeps a phone from being a picture of the boiler.
        */
        const wideFit = () => Math.max(8.5, Math.min(
            trainLen * 1.15,
            9 + aspect * 3.0,
            4.8 * aspect,
        ));

        // WHERE THE CRATES COME TO REST, solved once per resize and never per shot: re-spacing on a cut would slide every crate under a still camera.
        const layoutCrates = () => {
            const fitW = wideFit();
            const visW = 2 * FRAME_DIST * Math.tan(fovFor(fitW, FRAME_DIST) * Math.PI / 360) * aspect;
            const wideAim = REST_X - Math.min(5.0, fitW * 0.22);
            // The row is compressed toward the middle only as far as it must, and NOT past the point where the crates touch. The
            // pitch is asked for first (`CRATE_PITCH` is what the row wants), the frame caps it, and `CRATE_TOUCH` is the floor
            // under both; boxes inside each other are a bug. Spans divide by the row's own `crateRun`, not loco-to-last-wagon
            // (a constant 5.36 of locomotive sat in the denominator and overlapped crates at every normal player count).
            const step = CAR_LEN + CAR_GAP;
            crateSpread = Math.max(
                CRATE_TOUCH / step,
                Math.min(
                    1,
                    (visW * 0.60) / Math.max(0.001, crateRun),
                    CRATE_PITCH / step,
                ),
            );

            // WHERE THE ROW GOES, solved from the row's middle, not its first crate (`crateCentre` is derived): placing by crate
            // zero put part of the row off left and shot two aimed at the right end. The middle sits slightly RIGHT of the wide
            // shot's aim because the DOM board hangs in the left third and a crate opening behind it is never seen.
            const relOf = (e) => (REST_X + e.car.position.x) * crateSpread;
            if (crateMeshes.length) {
                const relFirst = relOf(crateMeshes[0]);
                const relLast = relOf(crateMeshes[crateMeshes.length - 1]);
                const relMid = (relFirst + relLast) / 2;
                rowSpan = Math.abs(relFirst - relLast);
                rowMid = wideAim + fitW * 0.05;
                crateCentre = rowMid - relMid;
            } else {
                rowSpan = 0;
                rowMid = wideAim;
                crateCentre = rowMid;
            }
        };

        const size = () => {
            const r = wrap.getBoundingClientRect();
            W = Math.max(1, r.width); H = Math.max(1, r.height);
            renderer.setSize(W, H, false);
            aspect = W / H;
            camera.aspect = aspect;
            camera.updateProjectionMatrix();
            layoutCrates();
        };
        size();
        const ro = new ResizeObserver(size);
        ro.observe(wrap);

        // THE THREE SHOTS: cuts, not moves (see arrivalTimeline.js). ONE the arrival (wide, low, the train is the subject); TWO
        // the payout (down beside the crates, the locomotive standing over them in fog); THREE the departure (wider and higher,
        // far enough back that the whole train clears). Each returns its own lens and slow push; `p` is that shot's own
        // progress, so a cut resets it and no shot inherits another's drift.
        const solveShot = (t) => {
            // One frame of shot two, already settled: a still image should be of
            // the payout, because the payout is the information.
            if (motionOff) return { i: 1, p: 0.5 };
            if (t >= SHOT_THREE) return { i: 2, p: clamp01((t - SHOT_THREE) / (T_GONE - SHOT_THREE)) };
            if (t >= SHOT_TWO) return { i: 1, p: clamp01((t - SHOT_TWO) / (SHOT_THREE - SHOT_TWO)) };
            return { i: 0, p: clamp01(t / SHOT_TWO) };
        };

        /** Everything the camera needs for one frame, solved from the shot. */
        const frameShot = (shot) => {
            const { i, p } = shot;
            let dist, fitW, aimZ = 0, side, eye;

            if (i === 1) {
                // Close on the crates. The distance is what makes this a different shot: fog thins, perspective opens, the train goes
                // soft. It frames the LANDED row (`rowSpan`, from `layoutCrates`), not the uncompressed consist it came off.
                dist = 6.2 - p * 0.5;
                fitW = Math.max(4.6, Math.min(10, rowSpan + 2.8));
                aimZ = 2.6;
                side = 1.9;
                // The camera sits below the crate lids and looks very slightly up, so the floor stays in the bottom quarter and the locomotive stands over the row.
                eye = 0.88;
            } else if (i === 2) {
                dist = FRAME_DIST * (1.06 + p * 0.16);
                fitW = Math.max(9.5, Math.min(trainLen * 1.5, 11 + aspect * 3.6, 5.6 * aspect));
                side = 3.4;
                eye = 1.5 + p * 0.2;
            } else {
                dist = FRAME_DIST * (1.04 - p * 0.05);
                fitW = wideFit();
                side = 3.0;
                // Lower, because platform-sign height shows the near paving as a slab: a lower eye foreshortens it and puts the horizon under the boiler centreline.
                eye = 1.08;
            }

            camera.fov = fovFor(fitW, dist);
            camera.updateProjectionMatrix();

            const visH = 2 * dist * Math.tan(camera.fov * Math.PI / 360);

            if (i === 1) {
                // Centred on the row, walking it slowly end to end.
                aimX = rowMid + lerp(-0.09, 0.09, p) * fitW;
                aimY = 0.96 + Math.max(0, visH - 2.6) * 0.14;
            } else {
                // The subject sits at 38% up the frame, not the centre, which leaves dead air above and nothing below.
                // Capped: the theatre's ~2.5:1 sees under five units of height and wants the correction, a phone shaft sees fifteen
                // and 0.22 of that unclamped lifts the locomotive out of its own frame.
                aimY = 1.42 + Math.min(1.6, Math.max(0, visH - 4.1) * 0.22);
                // On a narrow frame the camera looks at the ENGINE, not the middle of the track: the shaft is ~11 units across and the
                // locomotive parks at +4.6, so aiming at the middle put the smokebox past the right edge.
                aimX = REST_X - Math.min(5.0, fitW * 0.22);
            }

            return { dist, side, eye, aimZ, i, p };
        };

        let raf = 0;
        // The EVENT's epoch, not this effect's: this 551KB lazy chunk runs when it ARRIVED, so a clock started here would put
        // the scene behind a shutter and cue sheet that were on time. With the theatre's epoch a chunk landing at t=1.5 renders
        // t=1.5; every one-shot below is `if (!fired && t >= X)` so it can catch up. The fallback serves the timing bench in src/dev.
        const start = Number.isFinite(epoch) ? epoch : performance.now();
        let prev = 0;
        let wheelPhase = 0;
        let lastChuff = 0;
        let lastChuffAt = -1;
        let lastIdle = 0;
        let settleFired = false;
        let departFired = false;

        const frame = (now) => {
            const t = motionOff ? T_SETTLE + 0.5 : Math.max(0, (now - start) / 1000);
            const dt = Math.min(0.05, Math.max(0, t - prev));
            prev = t;
            const ta = t - T_SHUTTER;           // the 3D scene's own clock
            const APPROACH = T_APPROACH - T_SHUTTER;

            // ── the train's position and speed ──────────────────────────────
            let x, vel;
            if (t < T_APPROACH) {
                const p = easeOutExpo(clamp01(ta / APPROACH));
                x = START_X + (REST_X - START_X) * p;
                const p2 = easeOutExpo(clamp01((ta + 0.016) / APPROACH));
                vel = ((START_X + (REST_X - START_X) * p2) - x) / 0.016;
            } else if (t < T_DEPART) {
                x = REST_X; vel = 0;
            } else {
                const p = easeInCubic(clamp01((t - T_DEPART) / (T_GONE - T_DEPART)));
                x = REST_X + (END_X - REST_X) * p;
                const p2 = easeInCubic(clamp01((t + 0.016 - T_DEPART) / (T_GONE - T_DEPART)));
                vel = ((REST_X + (END_X - REST_X) * p2) - x) / 0.016;
            }
            train.position.x = x;

            // Wheels turn at the speed actually travelled (rolling without slipping, phase -v*dt/r, not a per-frame constant): the
            // rods are driven off this angle, and a frame-rate-dependent phase would change the piston stroke on a slow machine.
            wheelPhase -= (vel * dt) / DRIVER_R;
            for (const w of wheelsets) w.mesh.rotation.y -= (vel * dt) / w.radius;

            // The rods, solved from the same angle the drivers are at.
            const pinX = CRANK_R * Math.cos(wheelPhase);
            const pinY = CRANK_R * Math.sin(wheelPhase);
            for (const rod of rods) {
                rod.couple.position.set(COUPLE_MID + pinX, DRIVER_R + pinY, rod.z);

                const px = DRIVER_XS[1] + pinX;
                const py = DRIVER_R + pinY;
                const dy = 0.5 - py;
                const run = Math.sqrt(Math.max(0.0001, MAIN_ROD * MAIN_ROD - dy * dy));
                const cx = px + run;
                rod.main.position.set((px + cx) / 2, (py + 0.5) / 2, rod.z);
                rod.main.rotation.z = Math.atan2(0.5 - py, run);
                rod.crosshead.position.x = cx;
                rod.piston.position.x = cx + 0.3;
            }

            // The lamps stay lit until the shutters start closing, not while the train is still leaving (the platform used to go
            // dark under a departing locomotive). The station clears BEFORE the shutters roll up: this canvas is above the
            // shutter, so a lifting blade over a still-painted platform would show the station through the gap.
            const exit = clamp01((t - T_LIFT) / SCENE_FADE_S);
            const lampLevel = clamp01(ta / (APPROACH * 0.55)) * (1 - exit);
            for (const p of lamps) p.light.intensity = lampLevel * p.peak;
            head.intensity = lampLevel * 46;
            canvas.style.opacity = String(1 - exit);

            // Everything additive rides the same level, so the whole station
            // dims as one object rather than leaving glows floating in a fade.
            for (const g of glows) g.sprite.material.opacity = g.base * lampLevel;
            for (const b of beams) b.mat.uniforms.uOpacity.value = b.peak * lampLevel;
            for (const m of wetPools) m.opacity = 0.19 * lampLevel;

            // The headlight is brightest head-on and the streak grows with it.
            const headOn = clamp01(lampLevel * 1.1);
            headGlow.material.opacity = 0.9 * headOn;
            headGlow.scale.set(lerp(0.4, 0.62, headOn), lerp(0.4, 0.62, headOn), 1);
            headStreakMat.opacity = 0.5 * headOn;
            headBeamMat.uniforms.uOpacity.value = 0.3 * headOn;
            headWetMat.opacity = 0.22 * headOn;
            headWet.position.x = x + 5.0;

            // The firebox flickers on its own clock — the one unsteady light.
            const flick = 0.72 + 0.28 * Math.sin(t * 17.3) * Math.sin(t * 6.1);
            fireGlow.material.opacity = 0.5 * flick * lampLevel;
            fireLight.intensity = 2.6 * flick * lampLevel;

            // The signal: green on the approach, red while standing, green
            // again half a second before the wheels move.
            const clear = t < T_SETTLE || t > T_DEPART - 0.5;
            redGlow.material.opacity = (clear ? 0 : 0.85) * lampLevel;
            greenGlow.material.opacity = (clear ? 0.85 : 0) * lampLevel;
            redMat.color.setHex(clear ? 0x4a1512 : SIGNAL_RED);
            greenMat.color.setHex(clear ? SIGNAL_GREEN : 0x123a1f);

            // Mist drifts, and only once the platform is lit.
            for (const layer of mistLayers) {
                layer.mat.opacity = 0.07 * lampLevel;
                layer.mesh.position.x = ((t * layer.speed * layer.dir) % 24) - 12;
            }

            // ── the camera ──────────────────────────────────────────────────
            // Three shots, a slow push inside each (under a pixel a frame, so backdrop planes and poles separate in parallax; it
            // belongs to the SHOT so a cut resets it) and a shake scaled by speed AND closeness to the camera, peaking as the
            // engine sweeps past. A constant rumble would read as a loose camera mount.
            const shot = frameShot(solveShot(t));
            // The side offset is measured from the AIM point, or moving the aim to the engine on a phone swings the camera to the other side of the track.
            let camX = aimX + shot.side;
            let camY = shot.eye;
            let camZ = shot.aimZ + shot.dist;
            if (!motionOff) {
                const near = clamp01(1 - Math.abs(x - 1.5) / 16);
                // Shot two is close enough to the track that the same engine
                // shakes it harder — a camera on the platform, not up the line.
                const rumble = clamp01((Math.abs(vel) - 3) / 22) * near * (shot.i === 1 ? 1.9 : 1);
                if (rumble > 0.001) {
                    camX += Math.sin(t * 51.3) * 0.014 * rumble;
                    camY += Math.sin(t * 43.7 + 1.1) * 0.018 * rumble;
                }
                // A single jolt as the brakes take hold.
                const jolt = clamp01(1 - Math.abs(t - T_SETTLE) / 0.5);
                camY += Math.sin((t - T_SETTLE) * 38) * 0.012 * jolt * jolt;
                // Each cut lands with a whip and a settle: a hard cut to a locked-off camera reads as a slide change.
                for (const cut of [SHOT_TWO, SHOT_THREE]) {
                    const age = t - cut;
                    if (age >= 0 && age < 0.42) {
                        const k = (1 - age / 0.42) ** 2;
                        camX += Math.sin(age * 26) * 0.10 * k;
                        camY += Math.cos(age * 21) * 0.06 * k;
                    }
                }
            }
            camera.position.set(camX, camY, camZ);
            camera.lookAt(aimX, aimY, shot.aimZ);

            // The key light's shadow frustum stays over the platform.
            key.position.set(5, 9, 8);
            key.target.position.set(0, 0.6, 1.0);

            // ── the crates ──────────────────────────────────────────────────
            // The cadence is per PLAYER, not per wagon: past `MAX_CRATES` the consist stops growing but the manifest does not,
            // and pacing eight crates while the board paces eleven rows would be two clocks again.
            const n = Math.max(1, crateCount);
            for (let ci = 0; ci < crateMeshes.length; ci++) {
                const entry = crateMeshes[ci];
                const { crate, car, carIndex, seamGlow, lidPivot, core } = entry;
                const at = crateFallsAt(carIndex, n);
                const p = motionOff ? 1 : clamp01((t - at) / CRATE_FALL_S);

                // On the car until its moment, then a parabola onto the
                // platform. A crate that slides in a straight line has no mass.
                const carX = x + car.position.x;
                const restSlot = crateCentre + (REST_X + car.position.x) * crateSpread;
                const fromY = 1.02, toY = 0.65;

                crate.position.x = lerp(carX, restSlot, p);
                crate.position.z = lerp(0, 2.6, p);
                crate.position.y = lerp(fromY, toY, p) + Math.sin(p * Math.PI) * 0.85;
                crate.rotation.y = p * 0.6;
                // Once down it stays down, even as the train pulls away.
                if (p >= 1) { crate.position.x = restSlot; crate.position.z = 2.6; }

                // The seam flares on the landing and settles: the one moment a crate is louder than the train.
                const sinceLand = t - (at + CRATE_FALL_S);
                const flare = clamp01(1 - sinceLand / 0.5);
                seamGlow.material.opacity = (0.2 + flare * 0.75) * lampLevel;
                seamGlow.scale.setScalar(lerp(1.1, 2.2, flare));

                // THE LID throws back on an ease-out and carries well past vertical to 140 degrees, a composition decision: at 102 and 118
                // the open lids stood square to the camera and six of them read as a fence. At 140 they go edge-on and the light is the
                // brightest part. The light is masked by the lid's angle for the first fifth of the throw, so a crate leaks before it floods.
                const lidP = motionOff ? 1 : clamp01((sinceLand - LID_DELAY_S) / LID_OPEN_S);
                lidPivot.rotation.x = -2.45 * easeOutExpo(lidP);
                const spill = clamp01((lidP - 0.18) / 0.55);
                core.material.opacity = spill * (0.55 + 0.45 * Math.sin(t * 5.1 + carIndex)) * lampLevel;
                core.scale.setScalar(lerp(0.5, 1.25, spill));
                entry.openAt = at + CRATE_FALL_S + LID_DELAY_S;

                // WHERE THE SPINS LEAVE, in pixels, projected from the crate's LIP (the edge the light comes over); the overlay has no camera or scene.
                if (emitRef) {
                    const st = emitRef.current || (emitRef.current = { w: 0, h: 0, t: 0, crates: [] });
                    st.w = W; st.h = H; st.t = t;
                    projV.set(crate.position.x, crate.position.y + 0.36, crate.position.z);
                    projV.project(camera);
                    const c = st.crates[ci] || (st.crates[ci] = {});
                    c.x = (projV.x * 0.5 + 0.5) * W;
                    c.y = (-projV.y * 0.5 + 0.5) * H;
                    c.onScreen = projV.z < 1 && p >= 1;
                    c.openAt = entry.openAt;
                }

                if (!motionOff && !entry.landed && p >= 1) {
                    entry.landed = true;
                    // Dust off the paving, thrown outward from where it hit.
                    for (let k = 0; k < 3; k++) {
                        emit(steam, stRef, restSlot + (hash(k * 3.3) - 0.5) * 0.5, 0.42, 2.6 + (hash(k * 7.1) - 0.5) * 0.5, {
                            t, vx: (hash(k) - 0.5) * 0.5, vy: 0.16, vz: (hash(k * 2.1) - 0.5) * 0.4,
                            life: 0.9, grow: 2.4, size0: 0.28, peak: 0.15,
                        });
                    }
                }

                // The lid kicks a handful of embers out once, which stitches the physical scene to the overlay's screen-space spins.
                if (!motionOff && !entry.spilled && lidP > 0.22) {
                    entry.spilled = true;
                    for (let k = 0; k < 4; k++) {
                        emit(embers, emRef, crate.position.x + (hash(k * 5.7 + carIndex) - 0.5) * 0.3, 0.9, crate.position.z, {
                            t, vx: (hash(k * 2.9 + carIndex) - 0.5) * 0.9,
                            vy: 1.5 + hash(k * 4.1 + carIndex) * 1.3,
                            vz: (hash(k * 8.3 + carIndex) - 0.5) * 0.6,
                        });
                    }
                }
            }

            // ── smoke, steam and embers ─────────────────────────────────────
            if (!motionOff) {
                const chimneyX = x + 1.42;
                const working = Math.abs(vel);

                // Chuffs are fired by WHEEL PHASE (four exhausts per revolution), so the beat slows as it brakes, in step with the rods; a fixed interval was a machine gun.
                const beat = Math.floor(wheelPhase / (Math.PI / 2));
                const chuffing = working > 0.6 && t > T_SHUTTER && t < T_GONE - 0.6;
                // Rate-capped at fourteen a second: at departure speed the drivers make seventy-five exhausts a second, which burned
                // the 34-puff pool in under half a second and left no smoke hanging over the platform.
                if (chuffing && beat !== lastChuff && t - lastChuffAt > 0.07) {
                    lastChuff = beat;
                    lastChuffAt = t;
                    const force = clamp01(working / 12);
                    // Born carrying most of the engine's forward speed, then
                    // dragged to a stop by the air it is left in.
                    emit(exhaust, exRef, chimneyX, 2.02, 0, {
                        t, vx: vel * 0.55 - 0.35, vy: 1.6 + force * 1.9, vz: 0,
                        life: 2.6, grow: 3.4, size0: 0.5 + force * 0.35,
                    });
                    // Under power, a chuff throws embers.
                    if (t > T_DEPART && Math.random() < 0.7) {
                        emit(embers, emRef, chimneyX + (Math.random() - 0.5) * 0.15, 2.0, 0, {
                            t, vx: vel * 0.5 - 0.6 - Math.random() * 1.2, vy: 2.2 + Math.random() * 2.4,
                            vz: (Math.random() - 0.5) * 0.5, life: 1.5,
                        });
                    }
                } else if (!chuffing && t > T_SHUTTER && t < T_GONE - 0.6 && t - lastIdle > 0.62) {
                    // Standing, the engine still breathes. Slow, small, straight
                    // up — a locomotive at rest is not a locomotive switched off.
                    lastIdle = t;
                    emit(exhaust, exRef, chimneyX, 2.02, 0, {
                        t, vx: -0.12, vy: 0.62, vz: 0, life: 3.0, grow: 2.6, size0: 0.42, peak: 0.22,
                    });
                }

                // Cylinder cocks: two low white curtains at rail level when stopping and starting, the beats that most need punctuating.
                if (!settleFired && t >= T_SETTLE - 0.12) {
                    settleFired = true;
                    for (let k = 0; k < 10; k++) {
                        const side = k % 2 === 0 ? 1 : -1;
                        emit(steam, stRef, x + CYL_X + (hash(k) - 0.5) * 0.3, 0.36, side * 0.75, {
                            t: t + k * 0.02, vx: 0.5 + hash(k * 2.7) * 0.7, vy: 0.28 + hash(k * 5.5) * 0.2,
                            vz: side * (0.5 + hash(k * 3.1) * 0.5), life: 1.9, grow: 3.4, size0: 0.3, peak: 0.3,
                        });
                    }
                    // And the brakes, from under the cab.
                    for (let k = 0; k < 5; k++) {
                        emit(steam, stRef, x - 1.05, 0.3, (hash(k * 9.3) - 0.5) * 1.2, {
                            t, vx: -0.2, vy: 0.2, vz: (hash(k) - 0.5) * 0.7,
                            life: 1.6, grow: 3.0, size0: 0.26, peak: 0.22,
                        });
                    }
                }
                if (!departFired && t >= T_DEPART - 0.45) {
                    departFired = true;
                    // The whistle: thin, fast, straight up; the cue that the train is going, landing before the wheels turn.
                    for (let k = 0; k < 6; k++) {
                        emit(steam, stRef, x - 0.62, 1.78, 0.18, {
                            t: t + k * 0.03, vx: 0.1, vy: 3.0 + hash(k) * 1.2, vz: 0.05,
                            life: 1.3, grow: 2.2, size0: 0.15, peak: 0.34,
                        });
                    }
                    for (let k = 0; k < 8; k++) {
                        const side = k % 2 === 0 ? 1 : -1;
                        emit(steam, stRef, x + CYL_X, 0.36, side * 0.75, {
                            t: t + k * 0.03, vx: 0.9 + hash(k * 4.4) * 0.8, vy: 0.3,
                            vz: side * (0.6 + hash(k) * 0.5), life: 1.7, grow: 3.6, size0: 0.3, peak: 0.32,
                        });
                    }
                }

                for (const pool of [exhaust, steam]) {
                    for (const p of pool) {
                        if (!p.sprite.visible) continue;
                        const age = t - p.born;
                        if (age < 0) continue;
                        if (age > p.life) { p.sprite.visible = false; continue; }
                        const a = age / p.life;
                        p.sprite.position.x += p.vx * dt;
                        p.sprite.position.y += p.vy * dt;
                        p.sprite.position.z += p.vz * dt;
                        // Drag acts on the momentum the puff was BORN with, not the train's live speed, or the trail chases the departing locomotive instead of hanging under the roof.
                        p.vx *= Math.max(0, 1 - 2.1 * dt);
                        p.vy *= 0.985;
                        const s = p.size0 + a * p.grow;
                        p.sprite.scale.set(s, s, 1);
                        p.sprite.material.rotation += dt * (p.seed - 0.5) * 0.9;
                        p.sprite.material.opacity = (1 - a) * (1 - a) * (p.peakOverride ?? p.peak) * lampLevel;
                    }
                }
                for (const p of embers) {
                    if (!p.sprite.visible) continue;
                    const age = t - p.born;
                    if (age > 1.5) { p.sprite.visible = false; continue; }
                    const a = age / 1.5;
                    p.sprite.position.x += p.vx * dt;
                    p.vx *= Math.max(0, 1 - 2.4 * dt);
                    p.sprite.position.y += p.vy * dt;
                    p.sprite.position.z += p.vz * dt;
                    p.vy -= 2.6 * dt;
                    // Embers twinkle as they tumble, and go out rather than fade.
                    const twinkle = 0.5 + 0.5 * Math.sin(t * 30 + p.seed * 12);
                    p.sprite.material.opacity = (1 - a) * twinkle * 0.9 * lampLevel;
                    const s = 0.09 * (1 - a * 0.5);
                    p.sprite.scale.set(s, s, 1);
                }
            }

            renderer.render(scene, camera);

            if (motionOff) return;
            if (t < T_LIFT_END) raf = requestAnimationFrame(frame);
        };
        raf = requestAnimationFrame(frame);

        return () => {
            cancelAnimationFrame(raf);
            ro.disconnect();
            for (const d of disposables) d.dispose();
            for (const m of Object.values(M)) m.dispose();
            renderer.dispose();
        };
    }, [crateCount, emitRef, epoch]);

    return (
        <div ref={wrapRef} aria-hidden="true" style={{ position: 'absolute', inset: 0, ...style }}>
            <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
            {/* The grade: vignette and grain are DOM, not a post pass (a full-screen shader needs a render target and a second draw). Both live in index.css (§9's named rule). */}
            <div className="fib-arrival-grade" />
            <div className="fib-arrival-grain" />
        </div>
    );
}
