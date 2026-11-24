/* A result that lands after `deps` change or after unmount is discarded. `loader` is deliberately not a
   dependency (usually an inline arrow); `deps` must list what it closes over. */

import { useEffect, useState } from 'react';

export function useAsync(loader, deps = []) {
    const [state, setState] = useState({ data: null, error: null, loading: true, stale: false });

    useEffect(() => {
        let cancelled = false;
        setState((s) => ({ ...s, loading: true, error: null }));

        loader()
            .then((result) => {
                if (cancelled) return;
                // Loaders return { data, stale }; a bare value is accepted too.
                const data = result && typeof result === 'object' && 'data' in result ? result.data : result;
                const stale = !!(result && result.stale);
                setState({ data, error: null, loading: false, stale });
            })
            .catch((error) => {
                if (cancelled) return;
                setState({ data: null, error, loading: false, stale: false });
            });

        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);

    return state;
}
