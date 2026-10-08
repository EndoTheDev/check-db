<script>
  import Lcd from '$lib/Lcd.svelte';
  import { windowDb, MeterStats } from '$lib/meter.js';
  import { formatDb, calibrateOffset, SILENCE_FLOOR } from '$lib/format.js';

  // meter state
  let running = $state(false);
  let status = $state('idle'); // idle | running | denied | error
  let rawSmoothed = $state(NaN); // raw dBFS (smoothed), before offset
  let mode = $state('fast'); // fast | slow
  let weighting = $state('A'); // A | C
  let calOffset = $state(parseFloat(localStorage.getItem('check-db-cal') || '120'));
  let calTarget = $state(''); // one-point calibration: user-entered true dB
  let peak = $state(null);
  let minS = $state(null);
  let maxS = $state(null);

  let audioCtx, analyser, stream, raf;
  const stats = new MeterStats();
  const buf = new Float32Array(2048);

  async function start() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      });
      audioCtx = new AudioContext();
      const src = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      src.connect(analyser);
      stats.reset();
      peak = minS = maxS = null;
      running = true;
      status = 'running';
      loop();
    } catch (e) {
      status = e.name === 'NotAllowedError' ? 'denied' : 'error';
    }
  }

  function loop() {
    if (!running) return;
    analyser.getFloatTimeDomainData(buf);
    const raw = windowDb(buf, weighting);
    rawSmoothed = stats.push(raw, mode);
    peak = stats.peak + calOffset;
    minS = stats.min === Infinity ? null : stats.min + calOffset;
    maxS = stats.max === -Infinity ? null : stats.max + calOffset;
    raf = requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
    stream?.getTracks().forEach((t) => t.stop());
    audioCtx?.close();
  }

  function toggle() { running ? stop() : start(); }

  // one-point calibration: "the room is actually X dB right now" -> offset
  function applyCalibration() {
    const target = parseFloat(calTarget);
    if (Number.isFinite(target) && Number.isFinite(rawSmoothed)) {
      calOffset = calibrateOffset(rawSmoothed, target);
    }
  }

  $effect(() => { localStorage.setItem('check-db-cal', String(calOffset)); });

  const displayDb = $derived(
    Number.isFinite(rawSmoothed) ? rawSmoothed + calOffset : SILENCE_FLOOR
  );
  const fmt = $derived(formatDb(displayDb));
  const zone = $derived.by(() => {
    if (displayDb >= 110) return 'red';
    if (displayDb >= 100) return 'loud';
    if (displayDb >= 85) return 'warn';
    return 'quiet';
  });
  const fmtStat = (v) => (v === null || !Number.isFinite(v)) ? '--' : v.toFixed(1);
</script>

<svelte:head>
  <title>check-db — Room Loudness Meter</title>
  <meta name="description" content="Real-time room decibel meter in your browser. LCD display, A-weighting, FAST/SLOW averaging, peak hold. Nothing uploaded — audio never leaves your device." />
</svelte:head>

<main class="panel">
  <h1>check-db</h1>
  <p class="sub">real-time room loudness</p>

  <div class="lcd-frame" class:running>
    {#if fmt.neg}<Lcd value="-" />{/if}
    {#each [...fmt.intDigits] as ch, i (i)}<Lcd value={ch} />{/each}
    <span class="dot" aria-hidden="true"></span>
    <Lcd value={fmt.decDigits} />
    <span class="unit">dB</span>
  </div>

  <div class="scale" aria-hidden="true">
    <span class="z quiet">60 quiet</span>
    <span class="z warn">85 damage risk</span>
    <span class="z loud">100 club</span>
    <span class="z red">110+ pain</span>
  </div>

  <div class="stats">
    <span>peak <b>{fmtStat(peak)}</b></span>
    <span>min <b>{fmtStat(minS)}</b></span>
    <span>max <b>{fmtStat(maxS)}</b></span>
  </div>

  <div class="controls">
    <button class="main" class:on={running} onclick={toggle}>
      {running ? 'STOP' : 'START'}
    </button>
    <div class="toggles">
      <button class:off={mode === 'slow'} onclick={() => (mode = 'fast')}>FAST</button>
      <button class:off={mode === 'fast'} onclick={() => (mode = 'slow')}>SLOW</button>
      <button class:off={weighting === 'C'} onclick={() => (weighting = 'A')}>A</button>
      <button class:off={weighting === 'A'} onclick={() => (weighting = 'C')}>C</button>
    </div>
  </div>

  <div class="cal">
    <div class="cal-point">
      <label for="caltarget">calibrate: room is actually</label>
      <input id="caltarget" type="number" min="20" max="140" step="0.5" bind:value={calTarget} placeholder="e.g. 55" />
      <span>dB</span>
      <button onclick={applyCalibration} disabled={!running || !calTarget}>SET</button>
    </div>
    <label class="cal-fine">
      offset <b>+{calOffset.toFixed(0)}</b>
      <input type="range" min="60" max="180" step="1" bind:value={calOffset} />
    </label>
  </div>

  {#if status === 'denied'}
    <p class="msg">Microphone access denied — allow it in your browser settings, then press START again.</p>
  {:else if status === 'error'}
    <p class="msg">Could not access the microphone on this device/browser.</p>
  {/if}

  <p class="disc">
    Browser mics vary — enter the room's real level once (from a reference app or meter) and the
    offset is computed for you; the slider fine-tunes. Relative changes are always exact.
    Audio never leaves your device.
  </p>
</main>

<style>
  /* dark values are the default; light overrides kick in via OS preference.
  the LCD stays amber-on-dark in both - it's a physical gadget, real SPL
  meters don't invert with the room lights. */
  :global(:root) {
    --bg: #14120e;
    --panel: #1d1a14;
    --lcd: #ffb000;
    --lcd-glow: rgba(255, 176, 0, 0.6);
    --ink: #d8d2c4;
    --dim: #6b6455;
    --line: #3a352a;
    --lcd-bg: #0c0a07;
  }
  @media (prefers-color-scheme: light) {
    :global(:root) {
      --bg: #f2efe8;
      --panel: #ffffff;
      --ink: #2a261e;
      --dim: #8a8272;
      --line: #c9c4b4;
    }
  }
  main {
    min-height: 100svh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    background: var(--bg);
    color: var(--ink);
    font-family: ui-monospace, 'SF Mono', Menlo, monospace;
    padding: 1.5rem 1rem;
    box-sizing: border-box;
  }
  h1 { font-size: 1.4rem; letter-spacing: 0.3em; margin: 0; font-weight: 600; }
  .sub { color: var(--dim); margin: -0.6rem 0 0; font-size: 0.8rem; letter-spacing: 0.15em; }

  .lcd-frame {
    display: flex;
    align-items: center;
    gap: 0.12em;
    font-size: clamp(2.6rem, 16vw, 6.5rem);
    background: #0c0a07;
    border: 2px solid #2e2a20;
    border-radius: 6px;
    padding: 0.35em 0.5em 0.35em 0.6em;
    box-shadow: inset 0 0 1.5em rgba(0, 0, 0, 0.9);
  }
  .lcd-frame.running { border-color: #4a3f28; }
  .dot {
    align-self: flex-end;
    margin: 0 0.14em 0.1em;
  }
  .unit {
    font-size: 0.22em;
    align-self: flex-end;
    margin: 0 0 0.9em 0.4em;
    color: var(--lcd);
    text-shadow: 0 0 0.4em var(--lcd-glow);
    letter-spacing: 0.1em;
  }

  .scale { display: flex; gap: 1.2rem; font-size: 0.7rem; color: var(--dim); flex-wrap: wrap; justify-content: center; }
  .z.warn { color: #d9a441; }
  .z.loud { color: #e0762f; }
  .z.red { color: #e04b3a; }

  .stats { display: flex; gap: 1.4rem; font-size: 0.8rem; color: var(--dim); }
  .stats b { color: var(--ink); font-weight: 600; }

  .controls { display: flex; flex-direction: column; align-items: center; gap: 0.7rem; }
  button {
    font-family: inherit;
    background: transparent;
    color: var(--ink);
    border: 1px solid var(--line);
    border-radius: 4px;
    padding: 0.45rem 1.1rem;
    cursor: pointer;
    letter-spacing: 0.12em;
    font-size: 0.85rem;
  }
  button:hover { border-color: var(--lcd); }
  button:disabled { opacity: 0.4; cursor: default; }
  .main {
    background: var(--lcd);
    color: #14120e;
    font-weight: 700;
    border: none;
    padding: 0.7rem 2.6rem;
    font-size: 1rem;
  }
  .main.on { background: #7a2e22; color: #ffb9a8; }
  .toggles { display: flex; gap: 0.4rem; }
  .toggles button.off { color: var(--dim); border-color: var(--line); }

  .cal { display: flex; flex-direction: column; align-items: center; gap: 0.6rem; font-size: 0.75rem; color: var(--dim); }
  .cal b { color: var(--ink); }
  .cal-point { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; justify-content: center; }
  .cal-point input {
    width: 5em;
    background: var(--lcd-bg);
    border: 1px solid var(--line);
    color: var(--lcd);
    font-family: inherit;
    padding: 0.3rem 0.4rem;
    border-radius: 4px;
    font-size: 0.85rem;
    text-align: center;
  }
  .cal-fine { display: flex; flex-direction: column; align-items: center; gap: 0.3rem; }
  input[type='range'] { width: 220px; accent-color: var(--lcd); }

  .msg { color: #e0762f; font-size: 0.8rem; margin: 0; }
  .disc { color: var(--dim); font-size: 0.7rem; max-width: 42rem; text-align: center; line-height: 1.5; margin: 0.5rem 0 0; }
</style>