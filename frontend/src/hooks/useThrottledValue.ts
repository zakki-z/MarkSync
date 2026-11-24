import { useEffect, useRef, useState } from 'react';

/**
 * `value`, but when `delayMs` is above zero it changes at most once per `delayMs`, always ending
 * on the latest value. With zero it is `value` itself, so callers can switch it off for small
 * inputs and keep their exact timing.
 */
export function useThrottledValue<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);
  const latest = useRef(value);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    latest.current = value;
    if (delayMs === 0 || timer.current !== undefined || value === settled) return;
    timer.current = setTimeout(() => {
      timer.current = undefined;
      setSettled(latest.current);
    }, delayMs);
  }, [value, settled, delayMs]);
  useEffect(() => () => clearTimeout(timer.current), []);

  // Throttling is off: follow the value in this render rather than a render later.
  if (delayMs === 0 && settled !== value) setSettled(value);
  return delayMs === 0 ? value : settled;
}
