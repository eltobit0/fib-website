import React from 'react';
import { COLORS } from '../config/constants';
import { FINAL_INDEX, ITEM_WIDTH, STRIP_HEIGHT } from '../../../config/constants.js';
import { CanvasSpinningStrip } from '../canvas/CanvasSpinningStrip.jsx';

// The 5x and triple takeovers: parallel tracks, one reel per spin, abreast (horizontal on desktop, vertical lanes on mobile, as the reel itself). Nothing is a box: a seam in the deck divides two tracks.
// The tracks FILL the band (`flex: 1`, not a centred island), and there is one desktop pitch, the reel's `ITEM_WIDTH`; lane count changes how much track you see, never item size. `laneMode` on the canvas suppresses its band vignette (five of them is corduroy) and runs the hairline and lip at constant alpha; the outer falloff is drawn once, at the row.

// The one geometry for the lane takeovers, owned here so WheelSpinner's animation and this component's drawing cannot disagree on the pitch (they did, and the winner landed strips off the platform line). Desktop is `ITEM_WIDTH` for both modes. Mobile is lane-width limited: 64 for the 5x (about 65px per lane on 360px), 78 for the triple.
export const LANE_PITCH = (isMobile, isTripleLucky) =>
    isMobile
        ? (isTripleLucky ? 78 : 64)
        : ITEM_WIDTH;

// The track seam's width, exported because the stage's readout row lays out on the same grid: plaque N must sit under track N (see LaneResultsRow).
export const LANE_SEAM = (isMobile) => (isMobile ? 4 : 7);

// Desktop lanes are the band's own height (a design constant); the phone's fill the surface row (`100%`), since the shaft takes the whole column.
export const LANE_HEIGHT = (isMobile) => (isMobile ? '100%' : `${STRIP_HEIGHT}px`);

// The seam between two tracks: a wider dark channel with its own lit edge (7px desktop, 4px mobile), deeper than the per-slot seam so five reels do not read as one. It reads as an unlit band, not a drawn line (a bright rule per track is the frame the surface refuses), and the corduroy warning concerns slot pitch, not four seams.
// On desktop it fades from the floor (starting at 20%, or it reads as a chip); on mobile the light travels with each tile, so it fades symmetrically.
function TrackSeam({ isMobile }) {
    const w = LANE_SEAM(isMobile);
    // The lit edge is the last pixel; everything before it is the channel.
    const lit = w - 1;
    return (
        <div
            aria-hidden="true"
            style={{
                alignSelf: 'stretch',
                flex: `0 0 ${w}px`,
                width: `${w}px`,
                background: `linear-gradient(90deg, rgba(0,0,0,0.62) 0 1px, rgba(0,0,0,0.82) 1px ${lit}px, rgba(190,198,220,0.20) ${lit}px ${w}px)`,
                WebkitMaskImage: isMobile
                    ? 'linear-gradient(180deg, transparent 0%, #000 14%, #000 86%, transparent 100%)'
                    : 'linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.35) 20%, #000 72%, #000 100%)',
                maskImage: isMobile
                    ? 'linear-gradient(180deg, transparent 0%, #000 14%, #000 86%, transparent 100%)'
                    : 'linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.35) 20%, #000 72%, #000 100%)',
            }}
        />
    );
}

export function SpinLanes({
    laneCount = 5,
    isTripleLucky = false,
    strips = [],
    offsetRefs = null,
    isSpinning = false,
    isResult = false,
    isMobile = false,
    accentColor = COLORS.gold,
}) {
    const laneIndices = [...Array(laneCount).keys()];
    const height = LANE_HEIGHT(isMobile);
    const pitch = LANE_PITCH(isMobile, isTripleLucky);

    return (
        <div style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'stretch',
            width: '100%',
            height,
        }}>
            {laneIndices.map((laneIdx) => (
                <React.Fragment key={laneIdx}>
                    <div style={{
                        position: 'relative',
                        // The tracks divide the band between them. `minWidth: 0` because a flex item's default `min-width: auto` would let the canvas's measured width hold the row open.
                        flex: '1 1 0',
                        minWidth: 0,
                        height: '100%',
                        overflow: 'hidden',
                        borderRadius: 0,
                    }}>
                        <CanvasSpinningStrip
                            items={strips[laneIdx] || []}
                            offsetRef={offsetRefs
                                ? { get current() { return offsetRefs.current[laneIdx] || 0; } }
                                : undefined}
                            isMobile={isMobile}
                            isSpinning={isSpinning}
                            isResult={isResult}
                            spinProgress={0}
                            isRecursion={false}
                            laneMode
                            // No `stripWidth` and no pixel height on a phone: the track's box is whatever the flex row gives it and the canvas measures its own. Desktop keeps the band's own constant.
                            stripHeight={isMobile ? undefined : STRIP_HEIGHT}
                            finalIndex={FINAL_INDEX}
                            accentColor={accentColor}
                            itemWidthOverride={pitch}
                            isLuckySpin={isTripleLucky}
                        />
                    </div>
                    {laneIdx < laneCount - 1 && <TrackSeam isMobile={isMobile} />}
                </React.Fragment>
            ))}

            {/* The platform line, mobile only and one for the whole row (not one per lane). Desktop needs none: each track's detent is its canvas's own. */}
            {isMobile && (
                <>
                    <div aria-hidden="true" style={{
                        position: 'absolute',
                        left: 0, right: 0, top: '50%', transform: 'translateY(-50%)',
                        height: '3px',
                        backgroundImage: `linear-gradient(90deg, transparent, ${accentColor}, transparent)`,
                        zIndex: 10,
                        boxShadow: `0 0 12px ${accentColor}, 0 0 24px ${accentColor}88`,
                        pointerEvents: 'none',
                    }} />
                    <div aria-hidden="true" style={{
                        position: 'absolute',
                        left: '-1px', top: '50%', transform: 'translateY(-50%)',
                        width: 0, height: 0,
                        borderTop: '6px solid transparent', borderBottom: '6px solid transparent',
                        borderLeft: `8px solid ${accentColor}`,
                        zIndex: 11,
                        filter: `drop-shadow(0 0 6px ${accentColor})`,
                    }} />
                    <div aria-hidden="true" style={{
                        position: 'absolute',
                        right: '-1px', top: '50%', transform: 'translateY(-50%)',
                        width: 0, height: 0,
                        borderTop: '6px solid transparent', borderBottom: '6px solid transparent',
                        borderRight: `8px solid ${accentColor}`,
                        zIndex: 11,
                        filter: `drop-shadow(0 0 6px ${accentColor})`,
                    }} />
                </>
            )}

            {/* The band's falloff into the page, drawn once for the row (12% / rgba(0,0,0,0.5), as the reel's canvas does). Below the street glow (z-index 3 on the strip container), above the canvases. */}
            {!isMobile && (
                <>
                    <div aria-hidden="true" style={{
                        position: 'absolute', top: 0, bottom: 0, left: 0, width: '12%',
                        background: 'linear-gradient(90deg, rgba(0,0,0,0.5), rgba(0,0,0,0))',
                        zIndex: 2,
                        pointerEvents: 'none',
                    }} />
                    <div aria-hidden="true" style={{
                        position: 'absolute', top: 0, bottom: 0, right: 0, width: '12%',
                        background: 'linear-gradient(90deg, rgba(0,0,0,0), rgba(0,0,0,0.5))',
                        zIndex: 2,
                        pointerEvents: 'none',
                    }} />
                </>
            )}
        </div>
    );
}

export default SpinLanes;
