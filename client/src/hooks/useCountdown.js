import { useState, useEffect, useCallback } from 'react';

// const [secondsLeft, start] = useCountdown();  start(30) -> counts 30..0
export default function useCountdown() {
    const [left, setLeft] = useState(0);

    useEffect(() => {
        if (left <= 0) return;
        const t = setTimeout(() => setLeft((l) => l - 1), 1000);
        return () => clearTimeout(t);
    }, [left]);

    const start = useCallback((seconds = 30) => setLeft(seconds), []);
    return [left, start];
}
