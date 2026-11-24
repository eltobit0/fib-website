import React, { useState, useEffect, lazy, Suspense } from 'react';

import Navigation from './components/common/Navigation';
import WikiRoot from './wiki/shell/WikiRoot.jsx';

import { COLORS } from './config/constants';
// A leaf module: importing via atlas.js would pull the wheel's canvas layer into the entry chunk.
import { ATLAS_JSON } from './components/wheel/canvas/atlasUrls.js';

// Every route is code-split, so /wheel's cold start doesn't pay for the wiki first.
const HomePage = lazy(() => import('./pages/HomePage'));
const ForceItemPools = lazy(() => import('./pages/ItemPools/ForceItemPools.jsx'));
const HowToPlay = lazy(() => import('./pages/HowToPlay'));
const Gameplay = lazy(() => import('./pages/Gameplay'));
const Changelog = lazy(() => import('./pages/Changelog'));
const Imprint = lazy(() => import('./pages/Imprint'));
const Rules = lazy(() => import('./pages/Rules'));
const CustomStructures = lazy(() => import('./pages/CustomStructures'));
const Commands = lazy(() => import('./pages/Commands'));
const GameSettings = lazy(() => import('./pages/GameSettings'));
const WheelOfFortune = lazy(() => import('./components/wheel/WheelOfFortune'));
const StatsShell = lazy(() => import('./pages/Stats/StatsShell.jsx'));

function RouteFallback() {
    return <div style={{ minHeight: '100vh', background: COLORS.bg }} />;
}

// Minus the nav bar's height, which is already painted above it.
function PageFallback() {
    return <div style={{ minHeight: '70vh', background: 'var(--wk-ground)' }} />;
}

const ROUTE_MAP = {
    'pools': 'pools',
    'how-to-play': 'how-to-play',
    'gameplay': 'gameplay',
    'changelog': 'changelog',
    'imprint': 'imprint',
    'rules': 'rules',
    'structures': 'structures',
    'commands': 'commands',
    'settings': 'settings',
    'wheel': 'wheel',
    'stats': 'stats',
};

// Suspense can keep a hidden page mounted, and two pages share ids.
function visibleById(id) {
    return [...document.querySelectorAll(`[id="${CSS.escape(id)}"]`)].find((x) => x.getClientRects().length > 0);
}

export default function App() {
    const getPageFromPath = () => {
        const normalized = window.location.pathname
            .replace(/^\/+|\/+$/g, '')
            .split('?')[0]
            .toLowerCase();

        return ROUTE_MAP[normalized] || 'home';
    };

    const [currentPage, setCurrentPage] = useState(getPageFromPath());

    useEffect(() => {
        const handlePopState = () => {
            setCurrentPage(getPageFromPath());
        };
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);

    // A target may name a section ('structures#traders'). Same-page sections scroll here: the page state doesn't change.
    const navigate = (target) => {
        const [page, section] = target.split('#');
        const path = (page === 'home' ? '/' : `/${page}`) + (section ? `#${section}` : '');
        window.history.pushState({}, '', path);
        setCurrentPage(page);
        if (!section) window.scrollTo(0, 0);
        else if (page === currentPage) visibleById(section)?.scrollIntoView();
    };

    // Pages are lazy, so watch the DOM for the #section (up to 10s). Only a rendered match counts: Suspense keeps the
    // old page mounted but hidden, and pages share ids. Anything after '?' in the hash is a query, not a section.
    useEffect(() => {
        const id = decodeURIComponent(window.location.hash.slice(1).split('?')[0]);
        if (!id) return undefined;
        const found = () => {
            const el = visibleById(id);
            if (el) el.scrollIntoView();
            return Boolean(el);
        };
        if (found()) return undefined;
        const observer = new MutationObserver(() => { if (found()) stop(); });
        const timer = setTimeout(() => stop(), 10000);
        function stop() {
            observer.disconnect();
            clearTimeout(timer);
        }
        observer.observe(document.body, { childList: true, subtree: true });
        return stop;
    }, [currentPage]);

    if (currentPage === 'wheel') {
        /*
         * Preload the atlas index while the chunk downloads. crossOrigin is needed for it to match fetch().
         * Not the image: atlas.js requests a versioned URL (`?v=`), so a bare preload would be a wasted 6.4 MB fetch.
         */
        return (
            <>
                <link rel="preload" as="fetch" href={ATLAS_JSON} type="application/json" crossOrigin="anonymous" />
                <Suspense fallback={<RouteFallback />}>
                    <WheelOfFortune onBack={() => navigate('home')} />
                </Suspense>
            </>
        );
    }

    if (currentPage === 'stats') {
        return (
            <Suspense fallback={<RouteFallback />}>
                <StatsShell wikiHref="/" onExitWiki={() => navigate('home')} />
            </Suspense>
        );
    }

    return (
        <WikiRoot>
            <Navigation currentPage={currentPage} onNavigate={navigate} />

            {/* Outside the boundary so the nav doesn't blink while a chunk loads. */}
            <Suspense fallback={<PageFallback />}>
            {currentPage === 'home' && (
                <HomePage onNavigate={navigate} />
            )}

            {currentPage === 'how-to-play' && (
                <HowToPlay onNavigate={navigate} />
            )}

            {currentPage === 'gameplay' && (
                <Gameplay onNavigate={navigate} />
            )}

            {currentPage === 'changelog' && (
                <Changelog onNavigate={navigate} />
            )}

            {currentPage === 'imprint' && (
                <Imprint onNavigate={navigate} />
            )}

            {currentPage === 'rules' && (
                <Rules onNavigate={navigate} />
            )}

            {currentPage === 'pools' && (
                <ForceItemPools />
            )}

            {currentPage === 'structures' && (
                <CustomStructures onNavigate={navigate} />
            )}

            {currentPage === 'commands' && (
                <Commands onNavigate={navigate} />
            )}

            {currentPage === 'settings' && (
                <GameSettings onNavigate={navigate} />
            )}
            </Suspense>
        </WikiRoot>
    );
}