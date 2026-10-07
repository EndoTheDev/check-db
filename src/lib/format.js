// LCD digit formatting — pure, testable. Extracted from the page after the
// "168 was actually 16.8" misread: ghost segments + invisible decimal point
// made the display ambiguous. New rules: no ghost positions, visible decimal
// point, explicit minus, silence floor clamped.

export const SILENCE_FLOOR = -120; // display floor (raw -200 dBFS territory)

/**
 * Format a dB value into LCD segments.
 * Returns { neg: bool, intDigits: string, decDigits: string }
 * intDigits is 2-3 chars (no padding ghosts), decDigits is always 1 char.
 */
export function formatDb(value) {
  let v = Number(value);
  if (!Number.isFinite(v)) v = SILENCE_FLOOR;
  if (v < SILENCE_FLOOR) v = SILENCE_FLOOR;
  const neg = v < 0;
  const s = Math.abs(v).toFixed(1); // e.g. "16.8", "105.3"
  const [intPart, decPart] = s.split('.');
  return {
    neg,
    intDigits: intPart.replace(/^0+(?=\d)/, ''), // "06" -> "6" (abs < 10)
    decDigits: decPart
  };
}

/**
 * One-point calibration: given the current raw smoothed reading and the
 * room's true level (from a reference meter), compute the offset.
 */
export function calibrateOffset(rawSmoothed, trueDb) {
  return Math.round((trueDb - rawSmoothed) * 10) / 10;
}