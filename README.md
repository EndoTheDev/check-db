# check-db

Real-time room loudness meter — open it, allow the mic, and an LCD display
shows how loud the room is. Built for holding your phone up in a venue.

**Live:** https://endothe.dev/tools/check-db

Stack: SvelteKit (adapter-node), zero runtime dependencies — the Web Audio
API does all the measuring. A-weighting (IEC 61672 approximation) + calibration
offset because every mic has different sensitivity.

## Features

- 7-segment CSS LCD readout, amber-on-dark
- FAST (125 ms) / SLOW (1 s) averaging, like hardware SPL meters
- A / C weighting toggle
- Peak hold, min/max since start
- Reference zones: 60 quiet · 85 damage risk · 100 club · 110+ pain
- One-time calibration slider, persisted in localStorage

Honesty note: browsers measure dBFS exactly, but absolute SPL depends on your
mic. Calibrate the offset once against a reference meter — relative changes are
always exact. Audio never leaves your device.

## Dev

```
npm install
npm run dev
node selfcheck.js   # DSP self-check: synthetic sines must hit known dB
```

## Deploy

GitHub Actions builds arm64 → GHCR → the Pi pulls and runs via
docker-compose (root compose `extends` pattern).