/*
* THE ARRIVAL's scene, and the one place that names its chunk. `ArrivalTrain3D` (551KB, three.js) loads on
* demand; `ArrivalTheatre` renders it through `React.lazy` and `EventSelectionWheel` prefetches it. The module
* registry dedupes by resolved specifier, so both must go through this file to warm the same chunk.
* It is its own module so ArrivalTheatre stays component-only for Fast Refresh.
*/

import React from 'react';

export const ArrivalTrain3D = React.lazy(() =>
    import('./ArrivalTrain3D.jsx').then(m => ({ default: m.ArrivalTrain3D }))
);

/**
* Start fetching the scene before the event exists: the selection wheel's four seconds are the only time that
* can be spent, and a late chunk skips the approach. Failures are swallowed; `TrainBoundary` handles a scene that never arrives.
*/
export function prefetchArrivalScene() {
    import('./ArrivalTrain3D.jsx').catch(() => {});
}
