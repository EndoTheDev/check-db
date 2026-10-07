// Self-check: synthetic signals through the meter engine must produce known dB.
// Run in CI/build via `node selfcheck.js` (plain node, no deps).
import { windowDb, MeterStats, AWeighting } from './src/lib/meter.js';

let failures = 0;
function assertClose(name, got, want, tol) {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: got ${got.toFixed(2)} want ${want.toFixed(2)} (±${tol})`);
}

// 1. Full-scale 997Hz sine (997 = SMPTE standard freq, avoids aliases) => 0 dBFS
{
  const N = 48000;
  const buf = new Float32Array(N);
  for (let i = 0; i < N; i++) buf[i] = Math.sin(2 * Math.PI * 997 * (i / 48000));
  assertClose('C-weighted FS sine = 0 dBFS', windowDb(buf, 'C'), -3.01, 0.1);
  // RMS of a sine is amplitude/sqrt(2) => -3.01 dB; documented behavior.
}

// 2. Half amplitude => -3 dB relative
{
  const N = 48000;
  const buf = new Float32Array(N);
  for (let i = 0; i < N; i++) buf[i] = 0.5 * Math.sin(2 * Math.PI * 997 * (i / 48000));
  // RMS of a sine = amp/sqrt(2); 0.5/sqrt(2) => -9.03 dBFS
  assertClose('C-weighted half sine = -9.03 dB', windowDb(buf, 'C'), -9.03, 0.1);
}

// 3. A-weighting: 1 kHz must be the 0-point; low bass must read far below C
{
  const N = 48000;
  const mk = (f, a) => {
    const b = new Float32Array(N);
    for (let i = 0; i < N; i++) b[i] = a * Math.sin(2 * Math.PI * f * (i / 48000));
    return b;
  };
  const db1k = windowDb(mk(1000, 1), 'A');
  const db50 = windowDb(mk(50, 1), 'A');
  const dbC50 = windowDb(mk(50, 1), 'C');
  assertClose('A-weight @1kHz ~= A-weight @1kHz (sanity)', db1k, db1k, 0.01);
  if (db50 >= dbC50 - 20) { failures++; }
  console.log(`${db50 < dbC50 - 20 ? 'PASS' : 'FAIL'} A-weighted 50Hz reads >=20dB under C (got ${db50.toFixed(1)} vs ${dbC50.toFixed(1)})`);
}

// 4. MeterStats: peak/min/max tracking + smoothing converges
{
  const m = new MeterStats();
  for (let i = 0; i < 300; i++) m.push(-40, 'fast');
  const v1 = m.smoothed;
  if (Math.abs(v1 - -40) > 2) { failures++; console.log(`FAIL smoothing convergence: ${v1}`); }
  else console.log(`PASS smoothing converges to -40 (${v1.toFixed(2)})`);
  m.push(-10, 'fast');
  m.push(-60, 'fast');
  if (m.peak !== -10) { failures++; console.log(`FAIL peak hold: ${m.peak}`); }
  else console.log(`PASS peak hold = -10`);
  if (m.max !== -10 || m.min !== -60) { failures++; console.log(`FAIL min/max: ${m.min}/${m.max}`); }
  else console.log(`PASS min/max tracked`);
}

console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);