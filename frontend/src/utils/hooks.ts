/**
 * Custom Hooks for Vocalis
 */

import { useEffect, useRef } from 'react';

/**
 * A hook that executes a callback at a specified interval
 * 
 * @param callback Function to call at each interval
 * @param delay Delay in milliseconds, or null to pause the interval
 */
export function useInterval(callback: () => void, delay: number | null) {
  const savedCallback = useRef<() => void | null>();

  // Remember the latest callback
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  // Set up the interval
  useEffect(() => {
    function tick() {
      if (savedCallback.current) {
        savedCallback.current();
      }
    }

    if (delay !== null) {
      const id = setInterval(tick, delay);
      return () => clearInterval(id);
    }
    
    return undefined;
  }, [delay]);
}
