// Self-check: synthetic signals through the meter engine must produce known dB,
// and LCD formatting must be unambiguous. Run in CI via `node selfcheck.js`.
import { windowDb, MeterStats } from './src/lib/meter.js';
import { formatDb, calibrateOffset } from './src/lib/format.js';

let failures = 0;
function check(name, ok, detail = '') {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ': ' + detail : ''}`);
}
function assertClose(name, got, want, tol) {
  check(name, Math.abs(got - want) <= tol, `got ${got.toFixed(2)} want ${want.toFixed(2)} (±${tol})`);
}

// --- DSP checks ---
// 1. Full-scale 997Hz sine (SMPEG std freq): RMS of a sine = amp/sqrt(2) => -3.01 dBFS
{
  const N = 48000;
  const buf = new Float32Array(N);
  for (let i = 0; i < N; i++) buf[i] = Math.sin(2 * Math.PI * 997 * (i / 48000));
  assertClose('C-weighted FS sine = -3.01 dBFS', windowDb(buf, 'C'), -3.01, 0.1);
}
// 2. Half amplitude: 0.5/sqrt(2) => -9.03 dBFS
{
  const N = 48000;
  const buf = new Float32Array(N);
  for (let i = 0; i < N; i++) buf[i] = 0.5 * Math.sin(2 * Math.PI * 997 * (i / 48000));
  assertClose('C-weighted half sine = -9.03 dB', windowDb(buf, 'C'), -9.03, 0.1);
}
// 3. A-weighting shape: low bass reads far below C
{
  const N = 48000;
  const mk = (f) => {
    const b = new Float32Array(N);
    for (let i = 0; i < N; i++) b[i] = Math.sin(2 * Math.PI * f * (i / 48000));
    return b;
  };
  const db50a = windowDb(mk(50), 'A');
  const db50c = windowDb(mk(50), 'C');
  check('A-weighted 50Hz reads >=20dB under C', db50a < db50c - 20, `${db50a.toFixed(1)} vs ${db50c.toFixed(1)}`);
}
// 4. MeterStats: smoothing + peak/min/max
{
  const m = new MeterStats();
  for (let i = 0; i < 300; i++) m.push(-40, 'fast');
  check('smoothing converges to -40', Math.abs(m.smoothed - -40) <= 2, m.smoothed.toFixed(2));
  m.push(-10, 'fast');
  m.push(-60, 'fast');
  check('peak hold = -10', m.peak === -10);
  check('min/max tracked', m.max === -10 && m.min === -60, `${m.min}/${m.max}`);
}

// --- LCD format checks (the 168-vs-16.8 fix) ---
check('16.8 -> int "16" dec "8" (not "168")',
  (() => { const f = formatDb(16.8); return f.intDigits === '16' && f.decDigits === '8' && !f.neg; })(),
  JSON.stringify(formatDb(16.8)));
check('-6.8 -> neg, int "6" dec "8"',
  (() => { const f = formatDb(-6.8); return f.neg && f.intDigits === '6' && f.decDigits === '8'; })(),
  JSON.stringify(formatDb(-6.8)));
check('105.3 -> int "105" dec "3"',
  (() => { const f = formatDb(105.3); return f.intDigits === '105' && f.decDigits === '3' && !f.neg; })(),
  JSON.stringify(formatDb(105.3)));
check('silence floor clamps at -120',
  (() => { const f = formatDb(-160.0); return f.neg && f.intDigits === '120' && f.decDigits === '0'; })(),
  JSON.stringify(formatDb(-160.0)));
check('NaN -> floor, not crash',
  (() => { const f = formatDb(NaN); return f.neg && f.intDigits === '120'; })(),
  JSON.stringify(formatDb(NaN)));

// --- calibration math ---
assertClose('calibrateOffset(-63.2, 55) = 118.2', calibrateOffset(-63.2, 55), 118.2, 0.01);

console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);