<script>
  import Lcd from '$lib/Lcd.svelte';
  import { windowDb, MeterStats } from '$lib/meter.js';

  // meter state
  let running = $state(false);
  let status = $state('idle'); // idle | running | denied | error
  let db = $state('-100.0');
  let mode = $state('fast'); // fast | slow
  let weighting = $state('A'); // A | C
  let calOffset = $state(parseFloat(localStorage.getItem('check-db-cal') || '93'));
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
    const sm = stats.push(raw, mode);
    db = (sm + calOffset).toFixed(1);
    peak = (stats.peak + calOffset).toFixed(1);
    minS = (stats.min + calOffset).toFixed(1);
    maxS = (stats.max + calOffset).toFixed(1);
    raf = requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
    stream?.getTracks().forEach((t) => t.stop());
    audioCtx?.close();
  }

  function toggle() { running ? stop() : start(); }

  $effect(() => { localStorage.setItem('check-db-cal', String(calOffset)); });

  // zone for the readout color
  const zone = $derived.by(() => {
    const v = parseFloat(db);
    if (isNaN(v)) return 'quiet';
    if (v >= 110) return 'red';
    if (v >= 100) return 'loud';
    if (v >= 85) return 'warn';
    return 'quiet';
  });

  const digits = $derived.by(() => {
    // format: always one decimal; pad; -100.0 during idle
    const s = db ?? '-100.0';
    return s.replace('-', '').replace('.', '').padStart(4, ' ').split('').map((ch, i) => ({
      ch: ch === ' ' ? ' ' : ch, key: i
    }));
  });
  const neg = $derived((db ?? '').startsWith('-'));
</script>

<svelte:head>
  <title>check-db — Room Loudness Meter</title>
  <meta name="description" content="Real-time room decibel meter in your browser. LCD display, A-weighting, FAST/SLOW averaging, peak hold. Nothing uploaded — audio never leaves your device." />
</svelte:head>

<main class="panel">
  <h1>check-db</h1>
  <p class="sub">real-time room loudness</p>

  <div class="lcd-frame" class:running>
    {#if neg}<Lcd value="-" />{/if}
    {#each digits as d (d.key)}<Lcd value={d.ch} />{/each}
    <span class="unit">dB</span>
  </div>

  <div class="scale" aria-hidden="true">
    <span class="z quiet">60 quiet</span>
    <span class="z warn">85 damage risk</span>
    <span class="z loud">100 club</span>
    <span class="z red">110+ pain</span>
  </div>

  <div class="stats">
    <span>peak <b>{peak ?? '--'}</b></span>
    <span>min <b>{minS ?? '--'}</b></span>
    <span>max <b>{maxS ?? '--'}</b></span>
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

  <label class="cal">
    calibration offset <b>+{calOffset.toFixed(0)}</b>
    <input type="range" min="80" max="110" step="1" bind:value={calOffset} />
  </label>

  {#if status === 'denied'}
    <p class="msg">Microphone access denied — allow it in your browser settings, then press START again.</p>
  {:else if status === 'error'}
    <p class="msg">Could not access the microphone on this device/browser.</p>
  {/if}

  <p class="disc">
    Browser mics vary — calibrate once against a reference meter for accurate absolute values
    (slider above). Relative changes are always exact. Audio never leaves your device.
  </p>
</main>

<style>
  :global(:root) {
    --bg: #14120e;
    --panel: #1d1a14;
    --lcd: #ffb000;
    --lcd-glow: rgba(255, 176, 0, 0.6);
    --ink: #d8d2c4;
    --dim: #6b6455;
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
    filter: saturate(1.05);
  }
  .lcd-frame.running { border-color: #4a3f28; }
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
    border: 1px solid #3a352a;
    border-radius: 4px;
    padding: 0.45rem 1.1rem;
    cursor: pointer;
    letter-spacing: 0.12em;
    font-size: 0.85rem;
  }
  button:hover { border-color: var(--lcd); }
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
  .toggles button.off { color: var(--dim); border-color: #2a261e; }

  .cal { display: flex; flex-direction: column; align-items: center; gap: 0.3rem; font-size: 0.75rem; color: var(--dim); }
  .cal b { color: var(--ink); }
  input[type='range'] { width: 220px; accent-color: var(--lcd); }

  .msg { color: #e0762f; font-size: 0.8rem; margin: 0; }
  .disc { color: var(--dim); font-size: 0.7rem; max-width: 42rem; text-align: center; line-height: 1.5; margin: 0.5rem 0 0; }
</style>