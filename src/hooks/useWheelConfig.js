import { useState, useEffect } from 'react';
import { API_BASE_URL, IMAGE_BASE_URL, CUSTOM_IMAGE_BASE_URL } from '../config/constants';

const FALLBACK_CONFIG = {
    wheel: {
        itemWidth: 80,
        spinDuration: 4000,
        stripLength: 80,
        finalIndex: 72
    },
    // Mirrored for shape only; nothing reads it. Images come from config/constants.js, never these remote URLs.
    urls: {
        imageBase: IMAGE_BASE_URL,
        wheelTexture: `${CUSTOM_IMAGE_BASE_URL}/wheel.png`
    },
    bonusEvents: [
        { id: 'triple_spin', name: '5x Spin', description: '5 bonus spins!' },
        { id: 'lucky_spin', name: 'Lucky Spin', description: 'Equal chance for all items!' }
    ]
};

let cachedConfig = null;
let fetchPromise = null;

async function fetchConfig() {
    if (cachedConfig) return cachedConfig;

    if (fetchPromise) return fetchPromise;

    fetchPromise = fetch(`${API_BASE_URL}/api/config`)
        .then(res => {
            if (!res.ok) throw new Error('Failed to fetch config');
            return res.json();
        })
        .then(data => {
            cachedConfig = data;
            return data;
        })
        .catch(err => {
            console.error('Config fetch failed, using fallback:', err);
            cachedConfig = FALLBACK_CONFIG;
            return FALLBACK_CONFIG;
        })
        .finally(() => {
            fetchPromise = null;
        });

    return fetchPromise;
}

export function useWheelConfig() {
    const [config, setConfig] = useState(cachedConfig || FALLBACK_CONFIG);
    const [loading, setLoading] = useState(!cachedConfig);

    useEffect(() => {
        if (!cachedConfig) {
            fetchConfig().then(data => {
                setConfig(data);
                setLoading(false);
            });
        }
    }, []);

    return {
        config,
        loading,
        spinDuration: config.wheel.spinDuration,
        itemWidth: config.wheel.itemWidth,
        stripLength: config.wheel.stripLength,
        finalIndex: config.wheel.finalIndex,
        imageBaseUrl: config.urls.imageBase,
        wheelTextureUrl: config.urls.wheelTexture,
        bonusEvents: config.bonusEvents
    };
}

export default useWheelConfig;