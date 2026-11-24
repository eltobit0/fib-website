import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { SYNTH_SOUNDS, playSynth } from '../utils/sfxSynth.js';
import { unlockAudioBus } from '../utils/audioBus.js';
import { primeSample, playSample, stopScheduledSamples } from '../utils/sfxSamples.js';

const SoundContext = createContext(null);

// mp3 only: Cloudflare does not cache .wav by default. Encode with `ffmpeg -i x.wav -codec:a libmp3lame -q:a 2 x.mp3`,
// and keep the source wav out of public/, which Vite copies verbatim into the deploy.
const SOUND_FILES = {
    spin: '/sounds/spin.mp3',
    soundtrack: '/sounds/soundtrack.mp3',
    recursionSoundtrack: '/sounds/recursion_soundtrack.mp3',
    kotwSoundtrack: '/sounds/KOTW.mp3',
    firstBloodSoundtrack: '/sounds/blood.mp3',
    communityGoalSoundtrack: '/sounds/community.mp3',
    /* Does not loop: one 23s take cut to the event's beats. `startArrivalSoundtrack` sets `loop = false` too. */
    arrivalSoundtrack: '/sounds/train/trainsfx_full.mp3',
    /* Four takes at four pitches, one per wagon (hence MAX_CRATES is four); each covers both impact and lid. */
    arrivalCrate1: '/sounds/train/trainsfx_crate1.mp3',
    arrivalCrate2: '/sounds/train/trainsfx_crate2.mp3',
    arrivalCrate3: '/sounds/train/trainsfx_crate3.mp3',
    arrivalCrate4: '/sounds/train/trainsfx_crate4.mp3',
    /* Does not loop (a 30.9s take against T_END = 29.6s), and is sought to the elapsed offset since a parlour can be joined halfway. */
    parlourSoundtrack: '/sounds/roulette.mp3',
    /* Does not loop: 56s covers the longest table (54.5s). Sought like the Parlour's, from the same `openedAt`. */
    highRollerSoundtrack: '/sounds/highroller.mp3',
    recursion: '/sounds/recursion.mp3',
    insane: '/sounds/sfxinsane.mp3',
    mythic: '/sounds/sfxmythic.mp3',
    legendary: '/sounds/sfxlegendary.mp3',
    // Deliberately not loudness-normalised against its neighbours: each tier's loudness is part of its cue.
    relic: '/sounds/sfxrelic.mp3',
    exotic: '/sounds/sfxexotic.mp3',
    rare: '/sounds/sfxrare.mp3',
};

const DEFAULT_SETTINGS = {
    masterVolume: 0.5,
    musicVolume: 0.5,
    sfxVolume: 0.7,
    enabled: true,
    soundtrackEnabled: true,
    recursionSoundtrackEnabled: true,
    kotwSoundtrackEnabled: true,
    firstBloodSoundtrackEnabled: true,
    communityGoalSoundtrackEnabled: true,
    arrivalSoundtrackEnabled: true,
    /* One switch for all four crate takes: `playArrivalCrate` reads this key rather than playSfx's per-name convention. */
    arrivalCrateEnabled: true,
    parlourSoundtrackEnabled: true,
    highRollerSoundtrackEnabled: true,
    recursionEnabled: true,
    insaneEnabled: true,
    mythicEnabled: true,
    legendaryEnabled: true,
    relicEnabled: true,
    exoticEnabled: true,
    rareEnabled: true,
};

/* Here because the selection wheel knows the event type seconds before it exists; `primeEventSound` is the only public surface.
   `gold_rush` is deliberately absent: the event no longer exists. */
const EVENT_SOUNDTRACK = {
    arrival: 'arrivalSoundtrack',
    roulette: 'parlourSoundtrack',
    high_roller: 'highRollerSoundtrack',
    king_of_wheel: 'kotwSoundtrack',
    first_blood: 'firstBloodSoundtrack',
    community_goal: 'communityGoalSoundtrack',
};

/* Cut against a picture, so a late start is a bug rather than a beat. Also the two smallest files, which makes the idle warm-up affordable. */
const SCORED_TAKES = ['arrivalSoundtrack', 'parlourSoundtrack'];

/* Decoded and played on the audio clock: only the crate takes have a deadline (see sfxSamples.js).
   Move a sound here only if it has a beat to hit. */
const SAMPLED_SFX = ['arrivalCrate1', 'arrivalCrate2', 'arrivalCrate3', 'arrivalCrate4'];

/* Below ~120ms a listener cannot pair a sound with a picture, so a seek there costs more than it fixes. */
const DRIFT_TOLERANCE_S = 0.12;

/* `elapsedAt` is a clock, not a number, so the offset is read after the fetch. Seeks on `loadedmetadata`, then on `playing` if
   still past the tolerance; never before `play()`, which some browsers (Safari) drop. Both listeners are `once`. */
function joinTake(audio, elapsedAt) {
    // No clock: start at the top. The looping beds never pass one.
    if (typeof elapsedAt !== 'function') return;

    let corrected = false;

    const seek = () => {
        const want = Math.max(0, Number(elapsedAt()) || 0);
        // A take shorter than the offset asked for should sit silent at its end
        // rather than throw, and must never wrap back round to the opening.
        const target = Number.isFinite(audio.duration)
            ? Math.min(want, Math.max(0, audio.duration - 0.05))
            : want;
        if (Math.abs(audio.currentTime - target) < DRIFT_TOLERANCE_S) return;
        try {
            audio.currentTime = target;
        } catch (e) {
            // The element refused the seek. Playing from wherever it is beats
            // not playing, and the `playing` pass gets another go.
        }
    };

    const onMetadata = () => seek();
    const onPlaying = () => {
        if (corrected) return;
        corrected = true;
        seek();
    };

    if (audio.readyState >= 1) seek();
    else audio.addEventListener('loadedmetadata', onMetadata, { once: true });
    audio.addEventListener('playing', onPlaying, { once: true });
}

function loadSettings() {
    try {
        const saved = localStorage.getItem('fib-sound-settings');
        if (saved) {
            return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
        }
    } catch (e) {
        console.warn('Failed to load sound settings:', e);
    }
    return DEFAULT_SETTINGS;
}

function saveSettings(settings) {
    try {
        localStorage.setItem('fib-sound-settings', JSON.stringify(settings));
    } catch (e) {
        console.warn('Failed to save sound settings:', e);
    }
}

export function SoundProvider({ children }) {
    const [settings, setSettings] = useState(loadSettings);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isRecursionPlaying, setIsRecursionPlaying] = useState(false);
    const [isKotwPlaying, setIsKotwPlaying] = useState(false);
    const [isCommunityGoalPlaying, setIsCommunityGoalPlaying] = useState(false);
    const [isFirstBloodPlaying, setIsFirstBloodPlaying] = useState(false);
    const [isArrivalPlaying, setIsArrivalPlaying] = useState(false);
    const [isParlourPlaying, setIsParlourPlaying] = useState(false);
    const [isHighRollerPlaying, setIsHighRollerPlaying] = useState(false);
    const [hasInteracted, setHasInteracted] = useState(false);
    const [previewingSound, setPreviewingSound] = useState(null); // Track which sound is previewing

    const spinRef = useRef(null);
    const soundtrackRef = useRef(null);
    const recursionSoundtrackRef = useRef(null);
    const kotwSoundtrackRef = useRef(null);
    const firstBloodSoundtrackRef = useRef(null);
    const communityGoalSoundtrackRef = useRef(null);
    const arrivalSoundtrackRef = useRef(null);
    const parlourSoundtrackRef = useRef(null);
    const highRollerSoundtrackRef = useRef(null);
    const sfxRefs = useRef({
        arrivalCrate1: null,
        arrivalCrate2: null,
        arrivalCrate3: null,
        arrivalCrate4: null,
        recursion: null,
        insane: null,
        mythic: null,
        legendary: null,
        relic: null,
        exotic: null,
        rare: null,
    });

    const previewingRef = useRef(null);
    const previewTimeoutRef = useRef(null);

    const [audioLoaded, setAudioLoaded] = useState(false);

    // Soundtracks use preload='none': eager-fetching ~66 MB saturates the connection budget and starves wheel.png and the API.
    // The SFX keep 'auto': ~5 MB, and they must fire the instant a result lands.
    useEffect(() => {
        const spin = new Audio(SOUND_FILES.spin);
        spin.loop = false;
        spin.preload = 'none';
        spin.onerror = () => console.warn('[Sound] Spin file not found - add spin.mp3 to /public/sounds/');
        spinRef.current = spin;

        const soundtrack = new Audio(SOUND_FILES.soundtrack);
        soundtrack.loop = true;
        soundtrack.preload = 'none';
        soundtrack.onerror = () => console.warn('[Sound] Soundtrack file not found - add soundtrack.mp3 to /public/sounds/');
        soundtrackRef.current = soundtrack;

        const recursionSoundtrack = new Audio(SOUND_FILES.recursionSoundtrack);
        recursionSoundtrack.loop = true;
        recursionSoundtrack.preload = 'none';
        recursionSoundtrack.onerror = () => console.warn('[Sound] Recursion soundtrack file not found - add recursion_soundtrack.mp3 to /public/sounds/');
        recursionSoundtrackRef.current = recursionSoundtrack;

        const kotwSoundtrack = new Audio(SOUND_FILES.kotwSoundtrack);
        kotwSoundtrack.loop = true;
        kotwSoundtrack.preload = 'none';
        kotwSoundtrack.onerror = () => console.warn('[Sound] KOTW soundtrack file not found - add KOTW.mp3 to /public/sounds/');
        kotwSoundtrackRef.current = kotwSoundtrack;

        const firstBloodSoundtrack = new Audio(SOUND_FILES.firstBloodSoundtrack);
        firstBloodSoundtrack.loop = true;
        firstBloodSoundtrack.preload = 'none';
        firstBloodSoundtrack.onerror = () => console.warn('[Sound] First Blood soundtrack file not found - add blood.mp3 to /public/sounds/');
        firstBloodSoundtrackRef.current = firstBloodSoundtrack;

        const communityGoalSoundtrack = new Audio(SOUND_FILES.communityGoalSoundtrack);
        communityGoalSoundtrack.loop = true;
        communityGoalSoundtrack.preload = 'none';
        communityGoalSoundtrack.onerror = () => console.warn('[Sound] Community Goal soundtrack file not found - add community.mp3 to /public/sounds/');
        communityGoalSoundtrackRef.current = communityGoalSoundtrack;

        // `loop = false`, set again in startArrivalSoundtrack because previewSound turns looping on and only off again for SFX.
        const arrivalSoundtrack = new Audio(SOUND_FILES.arrivalSoundtrack);
        arrivalSoundtrack.loop = false;
        arrivalSoundtrack.preload = 'none';
        arrivalSoundtrack.onerror = () => console.warn('[Sound] Arrival soundtrack file not found - add train/trainsfx_full.mp3 to /public/sounds/');
        arrivalSoundtrackRef.current = arrivalSoundtrack;

        // `loop = false`, set again in startParlourSoundtrack, for the arrival's reason.
        const parlourSoundtrack = new Audio(SOUND_FILES.parlourSoundtrack);
        parlourSoundtrack.loop = false;
        parlourSoundtrack.preload = 'none';
        parlourSoundtrack.onerror = () => console.warn('[Sound] Parlour soundtrack file not found - add roulette.mp3 to /public/sounds/');
        parlourSoundtrackRef.current = parlourSoundtrack;

        // `loop = false`, set again in startHighRollerSoundtrack, for the same reason.
        const highRollerSoundtrack = new Audio(SOUND_FILES.highRollerSoundtrack);
        highRollerSoundtrack.loop = false;
        highRollerSoundtrack.preload = 'none';
        highRollerSoundtrack.onerror = () => console.warn('[Sound] High Roller soundtrack file not found - add highroller.mp3 to /public/sounds/');
        highRollerSoundtrackRef.current = highRollerSoundtrack;

        // 'auto' except the crate takes, which sfxSamples.js fetches and decodes; 'auto' would download them twice.
        Object.keys(sfxRefs.current).forEach(key => {
            const audio = new Audio(SOUND_FILES[key]);
            audio.preload = SAMPLED_SFX.includes(key) ? 'none' : 'auto';
            audio.onerror = () => console.warn(`[Sound] ${key} file not found - add ${SOUND_FILES[key].split('/').pop()} to /public/sounds/`);
            sfxRefs.current[key] = audio;
        });

        setAudioLoaded(true);

        return () => {
            if (spinRef.current) {
                spinRef.current.pause();
                spinRef.current = null;
            }
            if (soundtrackRef.current) {
                soundtrackRef.current.pause();
                soundtrackRef.current = null;
            }
            if (recursionSoundtrackRef.current) {
                recursionSoundtrackRef.current.pause();
                recursionSoundtrackRef.current = null;
            }
            if (kotwSoundtrackRef.current) {
                kotwSoundtrackRef.current.pause();
                kotwSoundtrackRef.current = null;
            }
            if (communityGoalSoundtrackRef.current) {
                communityGoalSoundtrackRef.current.pause();
                communityGoalSoundtrackRef.current = null;
            }
            if (firstBloodSoundtrackRef.current) {
                firstBloodSoundtrackRef.current.pause();
                firstBloodSoundtrackRef.current = null;
            }
            if (arrivalSoundtrackRef.current) {
                arrivalSoundtrackRef.current.pause();
                arrivalSoundtrackRef.current = null;
            }
            if (parlourSoundtrackRef.current) {
                parlourSoundtrackRef.current.pause();
                parlourSoundtrackRef.current = null;
            }
            if (highRollerSoundtrackRef.current) {
                highRollerSoundtrackRef.current.pause();
                highRollerSoundtrackRef.current = null;
            }
            Object.keys(sfxRefs.current).forEach(key => {
                if (sfxRefs.current[key]) {
                    sfxRefs.current[key].pause();
                    sfxRefs.current[key] = null;
                }
            });
        };
    }, []);

    useEffect(() => {
        const effectiveVolume = settings.enabled && settings.soundtrackEnabled
            ? settings.masterVolume * settings.musicVolume
            : 0;

        if (spinRef.current) {
            spinRef.current.volume = effectiveVolume;
        }
        if (soundtrackRef.current) {
            soundtrackRef.current.volume = effectiveVolume;
        }
    }, [settings.masterVolume, settings.musicVolume, settings.enabled, settings.soundtrackEnabled]);

    useEffect(() => {
        if (recursionSoundtrackRef.current) {
            const effectiveVolume = settings.enabled && settings.recursionSoundtrackEnabled
                ? settings.masterVolume * settings.musicVolume
                : 0;
            recursionSoundtrackRef.current.volume = effectiveVolume;
        }
    }, [settings.masterVolume, settings.musicVolume, settings.enabled, settings.recursionSoundtrackEnabled]);

    useEffect(() => {
        if (kotwSoundtrackRef.current) {
            const effectiveVolume = settings.enabled && settings.kotwSoundtrackEnabled
                ? settings.masterVolume * settings.musicVolume
                : 0;
            kotwSoundtrackRef.current.volume = effectiveVolume;
        }
    }, [settings.masterVolume, settings.musicVolume, settings.enabled, settings.kotwSoundtrackEnabled]);

    useEffect(() => {
        if (firstBloodSoundtrackRef.current) {
            const effectiveVolume = settings.enabled && settings.firstBloodSoundtrackEnabled
                ? settings.masterVolume * settings.musicVolume
                : 0;
            firstBloodSoundtrackRef.current.volume = effectiveVolume;
        }
    }, [settings.masterVolume, settings.musicVolume, settings.enabled, settings.firstBloodSoundtrackEnabled]);

    useEffect(() => {
        if (communityGoalSoundtrackRef.current) {
            const effectiveVolume = settings.enabled && settings.communityGoalSoundtrackEnabled
                ? settings.masterVolume * settings.musicVolume
                : 0;
            communityGoalSoundtrackRef.current.volume = effectiveVolume;
        }
    }, [settings.masterVolume, settings.musicVolume, settings.enabled, settings.communityGoalSoundtrackEnabled]);

    useEffect(() => {
        if (arrivalSoundtrackRef.current) {
            const effectiveVolume = settings.enabled && settings.arrivalSoundtrackEnabled
                ? settings.masterVolume * settings.musicVolume
                : 0;
            arrivalSoundtrackRef.current.volume = effectiveVolume;
        }
    }, [settings.masterVolume, settings.musicVolume, settings.enabled, settings.arrivalSoundtrackEnabled]);

    useEffect(() => {
        if (parlourSoundtrackRef.current) {
            const effectiveVolume = settings.enabled && settings.parlourSoundtrackEnabled
                ? settings.masterVolume * settings.musicVolume
                : 0;
            parlourSoundtrackRef.current.volume = effectiveVolume;
        }
    }, [settings.masterVolume, settings.musicVolume, settings.enabled, settings.parlourSoundtrackEnabled]);

    useEffect(() => {
        if (highRollerSoundtrackRef.current) {
            const effectiveVolume = settings.enabled && settings.highRollerSoundtrackEnabled
                ? settings.masterVolume * settings.musicVolume
                : 0;
            highRollerSoundtrackRef.current.volume = effectiveVolume;
        }
    }, [settings.masterVolume, settings.musicVolume, settings.enabled, settings.highRollerSoundtrackEnabled]);

    useEffect(() => {
        const effectiveVolume = settings.enabled
            ? settings.masterVolume * settings.sfxVolume
            : 0;

        Object.values(sfxRefs.current).forEach(audio => {
            if (audio && !audio.paused) {
                audio.volume = effectiveVolume;
            }
        });

        if (previewingRef.current && !previewingRef.current.paused) {
            previewingRef.current.volume = Math.max(0.1, effectiveVolume);
        }
    }, [settings.masterVolume, settings.sfxVolume, settings.enabled]);

    useEffect(() => {
        saveSettings(settings);
    }, [settings]);

    /* One name-to-element map shared by preview, prime and the warm-up; a track missing here falls through to SFX as "file not loaded". */
    const audioFor = useCallback((name) => {
        switch (name) {
            case 'spin': return { audio: spinRef.current, isSoundtrack: true };
            case 'soundtrack': return { audio: soundtrackRef.current, isSoundtrack: true };
            case 'recursionSoundtrack': return { audio: recursionSoundtrackRef.current, isSoundtrack: true };
            case 'kotwSoundtrack': return { audio: kotwSoundtrackRef.current, isSoundtrack: true };
            case 'firstBloodSoundtrack': return { audio: firstBloodSoundtrackRef.current, isSoundtrack: true };
            case 'communityGoalSoundtrack': return { audio: communityGoalSoundtrackRef.current, isSoundtrack: true };
            case 'arrivalSoundtrack': return { audio: arrivalSoundtrackRef.current, isSoundtrack: true };
            case 'parlourSoundtrack': return { audio: parlourSoundtrackRef.current, isSoundtrack: true };
            case 'highRollerSoundtrack': return { audio: highRollerSoundtrackRef.current, isSoundtrack: true };
            default: return { audio: sfxRefs.current[name] || null, isSoundtrack: false };
        }
    }, []);

    const primedRef = useRef(new Set());

    /* Fetch before anything plays: the selection wheel gives four seconds of warning. Idempotent by name; respects the per-track toggle. */
    const primeSound = useCallback((name) => {
        if (!name || !settings.enabled) return;
        if (settings[`${name}Enabled`] === false) return;
        if (primedRef.current.has(name)) return;

        const { audio } = audioFor(name);
        if (!audio || audio.error) return;

        primedRef.current.add(name);
        audio.preload = 'auto';
        try {
            audio.load();
        } catch (e) {
            // A refused load leaves the element exactly as it was — play() will
            // still fetch, just late, which is the behaviour this replaces.
        }
    }, [settings, audioFor]);

    /* AudioBuffers rather than elements. Honours the crate toggle, and `primeSample` is idempotent. */
    const primeSampledSfx = useCallback(() => {
        if (!settings.enabled) return;
        if (settings.arrivalCrateEnabled === false) return;
        SAMPLED_SFX.forEach(name => primeSample(name, SOUND_FILES[name]));
    }, [settings.enabled, settings.arrivalCrateEnabled]);

    const primeEventSound = useCallback((eventType) => {
        primeSound(EVENT_SOUNDTRACK[eventType]);
        // The arrival is the one event whose SFX have a deadline as well as its
        // bed, so the four seconds of warning are spent on both.
        if (eventType === 'arrival') primeSampledSfx();
    }, [primeSound, primeSampledSfx]);

    /* Warms only the two small scored takes (1.3MB) on idle, unlike the removed preload='auto', for admin-forced events that skip
       the selection wheel. Skipped on metered or slow connections. */
    /* Through a ref so the warm-up depends on `audioLoaded` alone: dragging a volume slider would otherwise reschedule it every frame. */
    const primeSoundRef = useRef(primeSound);
    const primeSampledSfxRef = useRef(null);
    useEffect(() => { primeSoundRef.current = primeSound; });
    useEffect(() => { primeSampledSfxRef.current = primeSampledSfx; });

    useEffect(() => {
        if (!audioLoaded) return undefined;
        if (typeof window === 'undefined') return undefined;

        const link = navigator.connection;
        if (link?.saveData) return undefined;
        if (link?.effectiveType && /(^|-)2g$/.test(link.effectiveType)) return undefined;

        const warm = () => {
            SCORED_TAKES.forEach(name => primeSoundRef.current?.(name));
            // Also in the idle pass: an admin-forced arrival skips the selection wheel.
            primeSampledSfxRef.current?.();
        };

        // A timeout too: a tab that never goes idle never fires the idle callback.
        const idle = window.requestIdleCallback?.(warm, { timeout: 8000 });
        const timer = window.requestIdleCallback ? null : window.setTimeout(warm, 4000);

        return () => {
            if (idle != null) window.cancelIdleCallback?.(idle);
            if (timer != null) window.clearTimeout(timer);
        };
    }, [audioLoaded]);

    const handleUserInteraction = useCallback(() => {
        // Open the synth's AudioContext on a real gesture; created from a timer it starts suspended and the first sound is lost.
        unlockAudioBus();
        if (!hasInteracted) {
            setHasInteracted(true);
        }
    }, [hasInteracted]);

    useEffect(() => {
        const events = ['click', 'keydown', 'touchstart'];
        const handler = () => handleUserInteraction();

        events.forEach(event => window.addEventListener(event, handler, { once: true }));

        return () => {
            events.forEach(event => window.removeEventListener(event, handler));
        };
    }, [handleUserInteraction]);

    const startSoundtrack = useCallback(async () => {
        if (!settings.enabled || !settings.soundtrackEnabled) return;

        if (isPlaying) return;
        if (isRecursionPlaying) return;
        if (isKotwPlaying) return;
        if (isFirstBloodPlaying) return;
        if (isCommunityGoalPlaying) return;
        // Belt and braces: WheelSpinner already refuses to spin while an arrival
        // is on screen, so in practice nothing reaches here during one.
        if (isArrivalPlaying) return;
        // Likewise for the parlour: only a spin already in flight when the table opened reaches here.
        if (isParlourPlaying) return;
        // And HIGH ROLLER, which also takes the band for its table.
        if (isHighRollerPlaying) return;

        const effectiveVolume = settings.masterVolume * settings.musicVolume;

        if (spinRef.current && !spinRef.current.error) {
            try {
                spinRef.current.volume = effectiveVolume;
                spinRef.current.currentTime = 0;

                spinRef.current.onended = () => {
                    if (recursionSoundtrackRef.current && !recursionSoundtrackRef.current.paused) {
                        return;
                    }
                    if (kotwSoundtrackRef.current && !kotwSoundtrackRef.current.paused) {
                        return;
                    }
                    if (firstBloodSoundtrackRef.current && !firstBloodSoundtrackRef.current.paused) {
                        return;
                    }
                    if (communityGoalSoundtrackRef.current && !communityGoalSoundtrackRef.current.paused) {
                        return;
                    }
                    if (arrivalSoundtrackRef.current && !arrivalSoundtrackRef.current.paused) {
                        return;
                    }
                    if (parlourSoundtrackRef.current && !parlourSoundtrackRef.current.paused) {
                        return;
                    }
                    if (highRollerSoundtrackRef.current && !highRollerSoundtrackRef.current.paused) {
                        return;
                    }
                    if (soundtrackRef.current && !soundtrackRef.current.error) {
                        soundtrackRef.current.volume = effectiveVolume;
                        soundtrackRef.current.currentTime = 0;
                        soundtrackRef.current.play().catch(() => {});
                    }
                };

                await spinRef.current.play();
                setIsPlaying(true);
                setHasInteracted(true);
            } catch (e) {
                if (soundtrackRef.current && !soundtrackRef.current.error) {
                    try {
                        soundtrackRef.current.volume = effectiveVolume;
                        soundtrackRef.current.currentTime = 0;
                        await soundtrackRef.current.play();
                        setIsPlaying(true);
                        setHasInteracted(true);
                    } catch (e2) {
                        // Silently fail
                    }
                }
            }
        } else if (soundtrackRef.current && !soundtrackRef.current.error) {
            try {
                soundtrackRef.current.volume = effectiveVolume;
                soundtrackRef.current.currentTime = 0;
                await soundtrackRef.current.play();
                setIsPlaying(true);
                setHasInteracted(true);
            } catch (e) {
                // Silently fail
            }
        }
    }, [settings.enabled, settings.soundtrackEnabled, settings.masterVolume, settings.musicVolume, isPlaying, isRecursionPlaying, isKotwPlaying, isFirstBloodPlaying, isCommunityGoalPlaying, isArrivalPlaying, isParlourPlaying, isHighRollerPlaying]);

    const stopSoundtrack = useCallback(() => {
        if (spinRef.current) {
            spinRef.current.pause();
            spinRef.current.currentTime = 0;
            spinRef.current.onended = null; // Remove the callback
        }
        if (soundtrackRef.current) {
            soundtrackRef.current.pause();
            soundtrackRef.current.currentTime = 0;
        }
        setIsPlaying(false);
    }, []);

    const toggleSoundtrack = useCallback(async () => {
        if (isPlaying) {
            stopSoundtrack();
        } else {
            await startSoundtrack();
        }
    }, [isPlaying, startSoundtrack, stopSoundtrack]);

    const startRecursionSoundtrack = useCallback(async () => {
        if (!recursionSoundtrackRef.current) return;
        if (!settings.enabled || !settings.recursionSoundtrackEnabled) return;
        if (recursionSoundtrackRef.current.error) return;

        if (isRecursionPlaying) return;

        try {
            const effectiveVolume = settings.masterVolume * settings.musicVolume;
            recursionSoundtrackRef.current.volume = effectiveVolume;
            recursionSoundtrackRef.current.currentTime = 0;

            if (spinRef.current) {
                spinRef.current.pause();
                spinRef.current.onended = null;
            }

            if (soundtrackRef.current && !soundtrackRef.current.paused) {
                soundtrackRef.current.pause();
            }

            if (kotwSoundtrackRef.current && !kotwSoundtrackRef.current.paused) {
                kotwSoundtrackRef.current.pause();
                kotwSoundtrackRef.current.currentTime = 0;
                setIsKotwPlaying(false);
            }

            if (firstBloodSoundtrackRef.current && !firstBloodSoundtrackRef.current.paused) {
                firstBloodSoundtrackRef.current.pause();
                firstBloodSoundtrackRef.current.currentTime = 0;
                setIsFirstBloodPlaying(false);
            }

            if (communityGoalSoundtrackRef.current && !communityGoalSoundtrackRef.current.paused) {
                communityGoalSoundtrackRef.current.pause();
                communityGoalSoundtrackRef.current.currentTime = 0;
                setIsCommunityGoalPlaying(false);
            }

            if (arrivalSoundtrackRef.current && !arrivalSoundtrackRef.current.paused) {
                arrivalSoundtrackRef.current.pause();
                arrivalSoundtrackRef.current.currentTime = 0;
                setIsArrivalPlaying(false);
            }

            if (parlourSoundtrackRef.current && !parlourSoundtrackRef.current.paused) {
                parlourSoundtrackRef.current.pause();
                parlourSoundtrackRef.current.currentTime = 0;
                setIsParlourPlaying(false);
            }

            if (highRollerSoundtrackRef.current && !highRollerSoundtrackRef.current.paused) {
                highRollerSoundtrackRef.current.pause();
                highRollerSoundtrackRef.current.currentTime = 0;
                setIsHighRollerPlaying(false);
            }
            await recursionSoundtrackRef.current.play();
            setIsRecursionPlaying(true);
            setHasInteracted(true);
        } catch (e) {
            // Silently fail
        }
    }, [settings.enabled, settings.recursionSoundtrackEnabled, settings.masterVolume, settings.musicVolume, isRecursionPlaying]);

    const stopRecursionSoundtrack = useCallback(() => {
        if (recursionSoundtrackRef.current) {
            recursionSoundtrackRef.current.pause();
            recursionSoundtrackRef.current.currentTime = 0;
            setIsRecursionPlaying(false);

            if (isPlaying && !isKotwPlaying && !isFirstBloodPlaying && !isCommunityGoalPlaying && !isArrivalPlaying && !isParlourPlaying && !isHighRollerPlaying && soundtrackRef.current && settings.enabled && settings.soundtrackEnabled) {
                const effectiveVolume = settings.masterVolume * settings.musicVolume;
                soundtrackRef.current.volume = effectiveVolume;
                soundtrackRef.current.play().catch(() => {});
            }
        }
    }, [isPlaying, isKotwPlaying, isFirstBloodPlaying, isCommunityGoalPlaying, isArrivalPlaying, isParlourPlaying, isHighRollerPlaying, settings.masterVolume, settings.musicVolume, settings.enabled, settings.soundtrackEnabled]);

    const startKotwSoundtrack = useCallback(async () => {
        if (!kotwSoundtrackRef.current) return;
        if (!settings.enabled || !settings.kotwSoundtrackEnabled) return;
        if (kotwSoundtrackRef.current.error) return;

        if (isKotwPlaying) return;

        try {
            const effectiveVolume = settings.masterVolume * settings.musicVolume;
            kotwSoundtrackRef.current.volume = effectiveVolume;
            kotwSoundtrackRef.current.currentTime = 0;

            if (spinRef.current) {
                spinRef.current.pause();
                spinRef.current.onended = null;
            }

            if (soundtrackRef.current && !soundtrackRef.current.paused) {
                soundtrackRef.current.pause();
            }

            if (recursionSoundtrackRef.current && !recursionSoundtrackRef.current.paused) {
                recursionSoundtrackRef.current.pause();
                recursionSoundtrackRef.current.currentTime = 0;
                setIsRecursionPlaying(false);
            }

            if (firstBloodSoundtrackRef.current && !firstBloodSoundtrackRef.current.paused) {
                firstBloodSoundtrackRef.current.pause();
                firstBloodSoundtrackRef.current.currentTime = 0;
                setIsFirstBloodPlaying(false);
            }

            if (communityGoalSoundtrackRef.current && !communityGoalSoundtrackRef.current.paused) {
                communityGoalSoundtrackRef.current.pause();
                communityGoalSoundtrackRef.current.currentTime = 0;
                setIsCommunityGoalPlaying(false);
            }

            if (arrivalSoundtrackRef.current && !arrivalSoundtrackRef.current.paused) {
                arrivalSoundtrackRef.current.pause();
                arrivalSoundtrackRef.current.currentTime = 0;
                setIsArrivalPlaying(false);
            }

            if (parlourSoundtrackRef.current && !parlourSoundtrackRef.current.paused) {
                parlourSoundtrackRef.current.pause();
                parlourSoundtrackRef.current.currentTime = 0;
                setIsParlourPlaying(false);
            }

            if (highRollerSoundtrackRef.current && !highRollerSoundtrackRef.current.paused) {
                highRollerSoundtrackRef.current.pause();
                highRollerSoundtrackRef.current.currentTime = 0;
                setIsHighRollerPlaying(false);
            }
            await kotwSoundtrackRef.current.play();
            setIsKotwPlaying(true);
            setHasInteracted(true);
        } catch (e) {
            // Silently fail
        }
    }, [settings.enabled, settings.kotwSoundtrackEnabled, settings.masterVolume, settings.musicVolume, isKotwPlaying]);

    const stopKotwSoundtrack = useCallback(() => {
        if (kotwSoundtrackRef.current) {
            kotwSoundtrackRef.current.pause();
            kotwSoundtrackRef.current.currentTime = 0;
            setIsKotwPlaying(false);

            if (isPlaying && !isRecursionPlaying && !isFirstBloodPlaying && !isCommunityGoalPlaying && !isArrivalPlaying && !isParlourPlaying && !isHighRollerPlaying && soundtrackRef.current && settings.enabled && settings.soundtrackEnabled) {
                const effectiveVolume = settings.masterVolume * settings.musicVolume;
                soundtrackRef.current.volume = effectiveVolume;
                soundtrackRef.current.play().catch(() => {});
            }
        }
    }, [isPlaying, isRecursionPlaying, isFirstBloodPlaying, isCommunityGoalPlaying, isArrivalPlaying, isParlourPlaying, isHighRollerPlaying, settings.masterVolume, settings.musicVolume, settings.enabled, settings.soundtrackEnabled]);

    const startFirstBloodSoundtrack = useCallback(async () => {
        if (!firstBloodSoundtrackRef.current) return;
        if (!settings.enabled || !settings.firstBloodSoundtrackEnabled) return;
        if (firstBloodSoundtrackRef.current.error) return;

        if (isFirstBloodPlaying) return;

        try {
            const effectiveVolume = settings.masterVolume * settings.musicVolume;
            firstBloodSoundtrackRef.current.volume = effectiveVolume;
            firstBloodSoundtrackRef.current.currentTime = 0;

            if (spinRef.current) {
                spinRef.current.pause();
                spinRef.current.onended = null;
            }

            if (soundtrackRef.current && !soundtrackRef.current.paused) {
                soundtrackRef.current.pause();
            }

            if (recursionSoundtrackRef.current && !recursionSoundtrackRef.current.paused) {
                recursionSoundtrackRef.current.pause();
                recursionSoundtrackRef.current.currentTime = 0;
                setIsRecursionPlaying(false);
            }

            if (kotwSoundtrackRef.current && !kotwSoundtrackRef.current.paused) {
                kotwSoundtrackRef.current.pause();
                kotwSoundtrackRef.current.currentTime = 0;
                setIsKotwPlaying(false);
            }

            if (communityGoalSoundtrackRef.current && !communityGoalSoundtrackRef.current.paused) {
                communityGoalSoundtrackRef.current.pause();
                communityGoalSoundtrackRef.current.currentTime = 0;
                setIsCommunityGoalPlaying(false);
            }

            if (arrivalSoundtrackRef.current && !arrivalSoundtrackRef.current.paused) {
                arrivalSoundtrackRef.current.pause();
                arrivalSoundtrackRef.current.currentTime = 0;
                setIsArrivalPlaying(false);
            }

            if (parlourSoundtrackRef.current && !parlourSoundtrackRef.current.paused) {
                parlourSoundtrackRef.current.pause();
                parlourSoundtrackRef.current.currentTime = 0;
                setIsParlourPlaying(false);
            }

            if (highRollerSoundtrackRef.current && !highRollerSoundtrackRef.current.paused) {
                highRollerSoundtrackRef.current.pause();
                highRollerSoundtrackRef.current.currentTime = 0;
                setIsHighRollerPlaying(false);
            }
            await firstBloodSoundtrackRef.current.play();
            setIsFirstBloodPlaying(true);
            setHasInteracted(true);
        } catch (e) {
            // Silently fail
        }
    }, [settings.enabled, settings.firstBloodSoundtrackEnabled, settings.masterVolume, settings.musicVolume, isFirstBloodPlaying]);

    const stopFirstBloodSoundtrack = useCallback(() => {
        if (firstBloodSoundtrackRef.current) {
            firstBloodSoundtrackRef.current.pause();
            firstBloodSoundtrackRef.current.currentTime = 0;
            setIsFirstBloodPlaying(false);

            if (isPlaying && !isRecursionPlaying && !isKotwPlaying && !isCommunityGoalPlaying && !isArrivalPlaying && !isParlourPlaying && !isHighRollerPlaying && soundtrackRef.current && settings.enabled && settings.soundtrackEnabled) {
                const effectiveVolume = settings.masterVolume * settings.musicVolume;
                soundtrackRef.current.volume = effectiveVolume;
                soundtrackRef.current.play().catch(() => {});
            }
        }
    }, [isPlaying, isRecursionPlaying, isKotwPlaying, isCommunityGoalPlaying, isArrivalPlaying, isParlourPlaying, isHighRollerPlaying, settings.masterVolume, settings.musicVolume, settings.enabled, settings.soundtrackEnabled]);

    const startCommunityGoalSoundtrack = useCallback(async () => {
        if (!communityGoalSoundtrackRef.current) return;
        if (!settings.enabled || !settings.communityGoalSoundtrackEnabled) return;
        if (communityGoalSoundtrackRef.current.error) return;

        if (isCommunityGoalPlaying) return;

        try {
            const effectiveVolume = settings.masterVolume * settings.musicVolume;
            communityGoalSoundtrackRef.current.volume = effectiveVolume;
            communityGoalSoundtrackRef.current.currentTime = 0;

            if (spinRef.current) {
                spinRef.current.pause();
                spinRef.current.onended = null;
            }

            if (soundtrackRef.current && !soundtrackRef.current.paused) {
                soundtrackRef.current.pause();
            }

            if (recursionSoundtrackRef.current && !recursionSoundtrackRef.current.paused) {
                recursionSoundtrackRef.current.pause();
                recursionSoundtrackRef.current.currentTime = 0;
                setIsRecursionPlaying(false);
            }

            if (kotwSoundtrackRef.current && !kotwSoundtrackRef.current.paused) {
                kotwSoundtrackRef.current.pause();
                kotwSoundtrackRef.current.currentTime = 0;
                setIsKotwPlaying(false);
            }

            if (firstBloodSoundtrackRef.current && !firstBloodSoundtrackRef.current.paused) {
                firstBloodSoundtrackRef.current.pause();
                firstBloodSoundtrackRef.current.currentTime = 0;
                setIsFirstBloodPlaying(false);
            }

            if (arrivalSoundtrackRef.current && !arrivalSoundtrackRef.current.paused) {
                arrivalSoundtrackRef.current.pause();
                arrivalSoundtrackRef.current.currentTime = 0;
                setIsArrivalPlaying(false);
            }

            if (parlourSoundtrackRef.current && !parlourSoundtrackRef.current.paused) {
                parlourSoundtrackRef.current.pause();
                parlourSoundtrackRef.current.currentTime = 0;
                setIsParlourPlaying(false);
            }

            if (highRollerSoundtrackRef.current && !highRollerSoundtrackRef.current.paused) {
                highRollerSoundtrackRef.current.pause();
                highRollerSoundtrackRef.current.currentTime = 0;
                setIsHighRollerPlaying(false);
            }
            await communityGoalSoundtrackRef.current.play();
            setIsCommunityGoalPlaying(true);
            setHasInteracted(true);
        } catch (e) {
            // Silently fail
        }
    }, [settings.enabled, settings.communityGoalSoundtrackEnabled, settings.masterVolume, settings.musicVolume, isCommunityGoalPlaying]);

    const stopCommunityGoalSoundtrack = useCallback(() => {
        if (communityGoalSoundtrackRef.current) {
            communityGoalSoundtrackRef.current.pause();
            communityGoalSoundtrackRef.current.currentTime = 0;
            setIsCommunityGoalPlaying(false);

            if (isPlaying && !isRecursionPlaying && !isKotwPlaying && !isFirstBloodPlaying && !isArrivalPlaying && !isParlourPlaying && !isHighRollerPlaying && soundtrackRef.current && settings.enabled && settings.soundtrackEnabled) {
                const effectiveVolume = settings.masterVolume * settings.musicVolume;
                soundtrackRef.current.volume = effectiveVolume;
                soundtrackRef.current.play().catch(() => {});
            }
        }
    }, [isPlaying, isRecursionPlaying, isKotwPlaying, isFirstBloodPlaying, isArrivalPlaying, isParlourPlaying, isHighRollerPlaying, settings.masterVolume, settings.musicVolume, settings.enabled, settings.soundtrackEnabled]);

    /* Does not loop, and `isArrivalPlaying` deliberately does NOT guard a restart: a second arrival is a fresh mount and a fresh take.
       `elapsedAt` is a clock; see `joinTake`. */
    const startArrivalSoundtrack = useCallback(async (elapsedAt) => {
        if (!arrivalSoundtrackRef.current) return;
        if (!settings.enabled || !settings.arrivalSoundtrackEnabled) return;
        if (arrivalSoundtrackRef.current.error) return;

        try {
            const effectiveVolume = settings.masterVolume * settings.musicVolume;
            arrivalSoundtrackRef.current.loop = false;
            arrivalSoundtrackRef.current.volume = effectiveVolume;
            arrivalSoundtrackRef.current.currentTime = 0;
            joinTake(arrivalSoundtrackRef.current, elapsedAt);

            if (spinRef.current) {
                spinRef.current.pause();
                spinRef.current.onended = null;
            }

            if (soundtrackRef.current && !soundtrackRef.current.paused) {
                soundtrackRef.current.pause();
            }

            if (recursionSoundtrackRef.current && !recursionSoundtrackRef.current.paused) {
                recursionSoundtrackRef.current.pause();
                recursionSoundtrackRef.current.currentTime = 0;
                setIsRecursionPlaying(false);
            }

            if (kotwSoundtrackRef.current && !kotwSoundtrackRef.current.paused) {
                kotwSoundtrackRef.current.pause();
                kotwSoundtrackRef.current.currentTime = 0;
                setIsKotwPlaying(false);
            }

            if (firstBloodSoundtrackRef.current && !firstBloodSoundtrackRef.current.paused) {
                firstBloodSoundtrackRef.current.pause();
                firstBloodSoundtrackRef.current.currentTime = 0;
                setIsFirstBloodPlaying(false);
            }

            if (communityGoalSoundtrackRef.current && !communityGoalSoundtrackRef.current.paused) {
                communityGoalSoundtrackRef.current.pause();
                communityGoalSoundtrackRef.current.currentTime = 0;
                setIsCommunityGoalPlaying(false);
            }

            if (parlourSoundtrackRef.current && !parlourSoundtrackRef.current.paused) {
                parlourSoundtrackRef.current.pause();
                parlourSoundtrackRef.current.currentTime = 0;
                setIsParlourPlaying(false);
            }

            if (highRollerSoundtrackRef.current && !highRollerSoundtrackRef.current.paused) {
                highRollerSoundtrackRef.current.pause();
                highRollerSoundtrackRef.current.currentTime = 0;
                setIsHighRollerPlaying(false);
            }

            await arrivalSoundtrackRef.current.play();
            setIsArrivalPlaying(true);
            setHasInteracted(true);
        } catch (e) {
            // Silently fail
        }
    }, [settings.enabled, settings.arrivalSoundtrackEnabled, settings.masterVolume, settings.musicVolume]);

    const stopArrivalSoundtrack = useCallback(() => {
        if (arrivalSoundtrackRef.current) {
            arrivalSoundtrackRef.current.pause();
            arrivalSoundtrackRef.current.currentTime = 0;
            setIsArrivalPlaying(false);

            if (isPlaying && !isRecursionPlaying && !isKotwPlaying && !isFirstBloodPlaying && !isCommunityGoalPlaying && !isParlourPlaying && !isHighRollerPlaying && soundtrackRef.current && settings.enabled && settings.soundtrackEnabled) {
                const effectiveVolume = settings.masterVolume * settings.musicVolume;
                soundtrackRef.current.volume = effectiveVolume;
                soundtrackRef.current.play().catch(() => {});
            }
        }
    }, [isPlaying, isRecursionPlaying, isKotwPlaying, isFirstBloodPlaying, isCommunityGoalPlaying, isParlourPlaying, isHighRollerPlaying, settings.masterVolume, settings.musicVolume, settings.enabled, settings.soundtrackEnabled]);

    /* Does not loop, and is SOUGHT: a parlour can be joined halfway, so `elapsedAt` (a clock, see `joinTake`) places the bed
       where the room is. Like the arrival, no restart guard. */
    const startParlourSoundtrack = useCallback(async (elapsedAt) => {
        if (!parlourSoundtrackRef.current) return;
        if (!settings.enabled || !settings.parlourSoundtrackEnabled) return;
        if (parlourSoundtrackRef.current.error) return;

        try {
            const audio = parlourSoundtrackRef.current;
            const effectiveVolume = settings.masterVolume * settings.musicVolume;
            audio.loop = false;
            audio.volume = effectiveVolume;

            joinTake(audio, elapsedAt);

            if (spinRef.current) {
                spinRef.current.pause();
                spinRef.current.onended = null;
            }

            if (soundtrackRef.current && !soundtrackRef.current.paused) {
                soundtrackRef.current.pause();
            }

            if (recursionSoundtrackRef.current && !recursionSoundtrackRef.current.paused) {
                recursionSoundtrackRef.current.pause();
                recursionSoundtrackRef.current.currentTime = 0;
                setIsRecursionPlaying(false);
            }

            if (kotwSoundtrackRef.current && !kotwSoundtrackRef.current.paused) {
                kotwSoundtrackRef.current.pause();
                kotwSoundtrackRef.current.currentTime = 0;
                setIsKotwPlaying(false);
            }

            if (firstBloodSoundtrackRef.current && !firstBloodSoundtrackRef.current.paused) {
                firstBloodSoundtrackRef.current.pause();
                firstBloodSoundtrackRef.current.currentTime = 0;
                setIsFirstBloodPlaying(false);
            }

            if (communityGoalSoundtrackRef.current && !communityGoalSoundtrackRef.current.paused) {
                communityGoalSoundtrackRef.current.pause();
                communityGoalSoundtrackRef.current.currentTime = 0;
                setIsCommunityGoalPlaying(false);
            }

            if (arrivalSoundtrackRef.current && !arrivalSoundtrackRef.current.paused) {
                arrivalSoundtrackRef.current.pause();
                arrivalSoundtrackRef.current.currentTime = 0;
                setIsArrivalPlaying(false);
            }

            if (highRollerSoundtrackRef.current && !highRollerSoundtrackRef.current.paused) {
                highRollerSoundtrackRef.current.pause();
                highRollerSoundtrackRef.current.currentTime = 0;
                setIsHighRollerPlaying(false);
            }

            await audio.play();
            setIsParlourPlaying(true);
            setHasInteracted(true);
        } catch (e) {
            // Silently fail
        }
    }, [settings.enabled, settings.parlourSoundtrackEnabled, settings.masterVolume, settings.musicVolume]);

    const stopParlourSoundtrack = useCallback(() => {
        if (parlourSoundtrackRef.current) {
            parlourSoundtrackRef.current.pause();
            parlourSoundtrackRef.current.currentTime = 0;
            setIsParlourPlaying(false);

            if (isPlaying && !isRecursionPlaying && !isKotwPlaying && !isFirstBloodPlaying && !isCommunityGoalPlaying && !isArrivalPlaying && !isHighRollerPlaying && soundtrackRef.current && settings.enabled && settings.soundtrackEnabled) {
                const effectiveVolume = settings.masterVolume * settings.musicVolume;
                soundtrackRef.current.volume = effectiveVolume;
                soundtrackRef.current.play().catch(() => {});
            }
        }
    }, [isPlaying, isRecursionPlaying, isKotwPlaying, isFirstBloodPlaying, isCommunityGoalPlaying, isArrivalPlaying, isHighRollerPlaying, settings.masterVolume, settings.musicVolume, settings.enabled, settings.soundtrackEnabled]);

    /* The Parlour's shape exactly: no loop, sought, no restart guard. */
    const startHighRollerSoundtrack = useCallback(async (elapsedAt) => {
        if (!highRollerSoundtrackRef.current) return;
        if (!settings.enabled || !settings.highRollerSoundtrackEnabled) return;
        if (highRollerSoundtrackRef.current.error) return;

        try {
            const audio = highRollerSoundtrackRef.current;
            const effectiveVolume = settings.masterVolume * settings.musicVolume;
            audio.loop = false;
            audio.volume = effectiveVolume;

            joinTake(audio, elapsedAt);

            if (spinRef.current) {
                spinRef.current.pause();
                spinRef.current.onended = null;
            }

            if (soundtrackRef.current && !soundtrackRef.current.paused) {
                soundtrackRef.current.pause();
            }

            if (recursionSoundtrackRef.current && !recursionSoundtrackRef.current.paused) {
                recursionSoundtrackRef.current.pause();
                recursionSoundtrackRef.current.currentTime = 0;
                setIsRecursionPlaying(false);
            }

            if (kotwSoundtrackRef.current && !kotwSoundtrackRef.current.paused) {
                kotwSoundtrackRef.current.pause();
                kotwSoundtrackRef.current.currentTime = 0;
                setIsKotwPlaying(false);
            }

            if (firstBloodSoundtrackRef.current && !firstBloodSoundtrackRef.current.paused) {
                firstBloodSoundtrackRef.current.pause();
                firstBloodSoundtrackRef.current.currentTime = 0;
                setIsFirstBloodPlaying(false);
            }

            if (communityGoalSoundtrackRef.current && !communityGoalSoundtrackRef.current.paused) {
                communityGoalSoundtrackRef.current.pause();
                communityGoalSoundtrackRef.current.currentTime = 0;
                setIsCommunityGoalPlaying(false);
            }

            if (arrivalSoundtrackRef.current && !arrivalSoundtrackRef.current.paused) {
                arrivalSoundtrackRef.current.pause();
                arrivalSoundtrackRef.current.currentTime = 0;
                setIsArrivalPlaying(false);
            }

            if (parlourSoundtrackRef.current && !parlourSoundtrackRef.current.paused) {
                parlourSoundtrackRef.current.pause();
                parlourSoundtrackRef.current.currentTime = 0;
                setIsParlourPlaying(false);
            }

            await audio.play();
            setIsHighRollerPlaying(true);
            setHasInteracted(true);
        } catch {
            // Silently fail
        }
    }, [settings.enabled, settings.highRollerSoundtrackEnabled, settings.masterVolume, settings.musicVolume]);

    const stopHighRollerSoundtrack = useCallback(() => {
        if (highRollerSoundtrackRef.current) {
            highRollerSoundtrackRef.current.pause();
            highRollerSoundtrackRef.current.currentTime = 0;
            setIsHighRollerPlaying(false);

            if (isPlaying && !isRecursionPlaying && !isKotwPlaying && !isFirstBloodPlaying && !isCommunityGoalPlaying && !isArrivalPlaying && !isParlourPlaying && soundtrackRef.current && settings.enabled && settings.soundtrackEnabled) {
                const effectiveVolume = settings.masterVolume * settings.musicVolume;
                soundtrackRef.current.volume = effectiveVolume;
                soundtrackRef.current.play().catch(() => {});
            }
        }
    }, [isPlaying, isRecursionPlaying, isKotwPlaying, isFirstBloodPlaying, isCommunityGoalPlaying, isArrivalPlaying, isParlourPlaying, settings.masterVolume, settings.musicVolume, settings.enabled, settings.soundtrackEnabled]);

    const stopPreview = useCallback(() => {
        if (previewTimeoutRef.current) {
            clearTimeout(previewTimeoutRef.current);
            previewTimeoutRef.current = null;
        }

        if (previewingRef.current) {
            previewingRef.current.pause();
            previewingRef.current.currentTime = 0;

            // Only disable loop for SFX - soundtracks should keep looping
            const isSoundtrack = previewingRef.current === soundtrackRef.current ||
                previewingRef.current === recursionSoundtrackRef.current ||
                previewingRef.current === kotwSoundtrackRef.current ||
                previewingRef.current === firstBloodSoundtrackRef.current;
            if (!isSoundtrack) {
                previewingRef.current.loop = false;
            }

            previewingRef.current = null;
        }
        setPreviewingSound(null);
    }, []);

    // Click to play (loops until stopped), click again to stop.
    const previewSound = useCallback(async (soundName) => {
        if (previewingSound === soundName) {
            stopPreview();
            return;
        }

        stopPreview();

        const { audio, isSoundtrack } = audioFor(soundName);

        if (!audio || audio.error) {
            console.warn(`[Sound] Cannot preview ${soundName} - file not loaded`);
            return;
        }

        try {
            const effectiveVolume = isSoundtrack
                ? settings.masterVolume * settings.musicVolume
                : settings.masterVolume * settings.sfxVolume;

            audio.volume = Math.max(0.1, effectiveVolume); // Minimum 10% for preview
            audio.currentTime = 0;

            // Enable looping for preview so user can adjust volume, click again to stop
            audio.loop = true;
            previewingRef.current = audio;

            await audio.play();
            setHasInteracted(true);
            setPreviewingSound(soundName);

            // Auto-stop after 30 seconds as a safety measure
            previewTimeoutRef.current = setTimeout(() => {
                if (previewingRef.current === audio) {
                    stopPreview();
                }
            }, 30000);

        } catch (e) {
            // Silently fail
            setPreviewingSound(null);
        }
    }, [settings.masterVolume, settings.musicVolume, settings.sfxVolume, stopPreview, previewingSound, audioFor]);

    /* A name with no file falls through to `sfxSynth`. `opts` is read only by the synthesised voices. */
    const playSfx = useCallback((soundName, opts) => {
        if (!settings.enabled) return;

        const toggleKey = `${soundName}Enabled`;
        if (settings[toggleKey] === false) return;

        const effectiveVolume = settings.masterVolume * settings.sfxVolume;

        const audio = sfxRefs.current[soundName];
        if (!audio || audio.error) {
            if (SYNTH_SOUNDS.includes(soundName)) playSynth(soundName, effectiveVolume, opts);
            return;
        }

        audio.volume = effectiveVolume;

        audio.currentTime = 0;
        audio.play().catch(() => {
            // Silently fail
        });
    }, [settings]);

    const playRaritySound = useCallback((rarity) => {
        if (!settings.enabled) return;

        switch (rarity) {
            case 'insane':
                playSfx('insane');
                break;
            case 'mythic':
                playSfx('mythic');
                break;
            case 'legendary':
                playSfx('legendary');
                break;
            case 'relic':
                playSfx('relic');
                break;
            case 'exotic':
                playSfx('exotic');
                break;
            case 'rare':
                playSfx('rare');
                break;
            default:
                break;
        }
    }, [playSfx, settings.enabled]);

    const playRecursionSound = useCallback(() => {
        playSfx('recursion');
    }, [playSfx]);

    /* Wagon `i` always gets take `i`: a random pick would repeat takes and sound like a stutter. Returns true when scheduled on the
       audio clock (`atSeconds` from now); false means nothing was scheduled and the caller must use its own timer. */
    const playArrivalCrate = useCallback((index, atSeconds = 0) => {
        if (!settings.enabled) return false;
        if (settings.arrivalCrateEnabled === false) return false;

        // Modulo so raising MAX_CRATES past four degrades instead of breaking.
        const take = (Math.max(0, index | 0) % 4) + 1;
        const name = `arrivalCrate${take}`;
        const effectiveVolume = settings.masterVolume * settings.sfxVolume;

        if (playSample(name, { delay: Math.max(0, atSeconds), volume: effectiveVolume })) {
            return true;
        }

        // An element cannot be scheduled: a delayed impact is refused and left to the caller's timer rather than fired early.
        if (atSeconds > 0) return false;
        playSfx(name);
        return true;
    }, [playSfx, settings]);

    /* Scheduled cues outlive the arrival on the audio thread, so a cut-short arrival must cancel them. */
    const stopArrivalCrates = useCallback(() => {
        stopScheduledSamples();
    }, []);

    const updateSetting = useCallback((key, value) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    }, []);

    const toggleEnabled = useCallback(() => {
        setSettings(prev => {
            const newEnabled = !prev.enabled;
            if (!newEnabled) {
                stopScheduledSamples();
                if (spinRef.current) {
                    spinRef.current.pause();
                    spinRef.current.onended = null;
                }
                if (soundtrackRef.current) {
                    soundtrackRef.current.pause();
                    setIsPlaying(false);
                }
                if (recursionSoundtrackRef.current) {
                    recursionSoundtrackRef.current.pause();
                    setIsRecursionPlaying(false);
                }
                if (kotwSoundtrackRef.current) {
                    kotwSoundtrackRef.current.pause();
                    setIsKotwPlaying(false);
                }
                if (firstBloodSoundtrackRef.current) {
                    firstBloodSoundtrackRef.current.pause();
                    setIsFirstBloodPlaying(false);
                }
                if (arrivalSoundtrackRef.current) {
                    arrivalSoundtrackRef.current.pause();
                    setIsArrivalPlaying(false);
                }
                if (parlourSoundtrackRef.current) {
                    parlourSoundtrackRef.current.pause();
                    setIsParlourPlaying(false);
                }
                if (highRollerSoundtrackRef.current) {
                    highRollerSoundtrackRef.current.pause();
                    setIsHighRollerPlaying(false);
                }
                stopPreview();
            }
            return { ...prev, enabled: newEnabled };
        });
    }, [stopPreview]);

    const resetToDefaults = useCallback(() => {
        setSettings(DEFAULT_SETTINGS);
    }, []);

    const value = {
        settings,
        updateSetting,
        toggleEnabled,
        resetToDefaults,
        isPlaying,
        isRecursionPlaying,
        isKotwPlaying,
        isFirstBloodPlaying,
        isCommunityGoalPlaying,
        isArrivalPlaying,
        isParlourPlaying,
        isHighRollerPlaying,
        hasInteracted,
        audioLoaded,
        startSoundtrack,
        stopSoundtrack,
        toggleSoundtrack,
        startRecursionSoundtrack,
        stopRecursionSoundtrack,
        startKotwSoundtrack,
        stopKotwSoundtrack,
        startFirstBloodSoundtrack,
        stopFirstBloodSoundtrack,
        startCommunityGoalSoundtrack,
        stopCommunityGoalSoundtrack,
        startArrivalSoundtrack,
        stopArrivalSoundtrack,
        startParlourSoundtrack,
        stopParlourSoundtrack,
        startHighRollerSoundtrack,
        stopHighRollerSoundtrack,
        primeSound,
        primeEventSound,
        playSfx,
        playRaritySound,
        playRecursionSound,
        playArrivalCrate,
        stopArrivalCrates,
        previewSound,
        stopPreview,
        previewingSound,
    };

    return (
        <SoundContext.Provider value={value}>
            {children}
        </SoundContext.Provider>
    );
}

export function useSound() {
    const context = useContext(SoundContext);
    if (!context) {
        throw new Error('useSound must be used within a SoundProvider');
    }
    return context;
}

export default SoundContext;