<script>
  // 7-segment LCD digit rendered in CSS (crisp at any size, no font download).
  // segment map: a (top), b (tr), c (br), d (bottom), e (bl), f (tl), g (middle)
  let { value } = $props();
  const SEGMENTS = {
    '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg',
    '5': 'acdfg', '6': 'acdefg', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg',
    '-': 'g', ' ': ''
  };
  const on = $derived(SEGMENTS[value] ?? '');
</script>

<span class="digit" class:off={!on}>
  {#each ['a','b','c','d','e','f','g'] as s}
    <i class="seg {s}" class:lit={on.includes(s)}></i>
  {/each}
</span>

<style>
  .digit {
    position: relative;
    width: 0.62em;
    height: 1em;
    display: inline-block;
  }
  /* unlit segments stay faintly visible - real LCD look */
  .seg {
    position: absolute;
    background: color-mix(in srgb, var(--lcd) 12%, transparent);
    border-radius: 0.03em;
  }
  .seg.lit { background: var(--lcd); box-shadow: 0 0 0.12em var(--lcd-glow); }
  .a { top: 0; left: 0.08em; width: 0.46em; height: 0.09em; }
  .g { top: 0.455em; left: 0.08em; width: 0.46em; height: 0.09em; }
  .d { bottom: 0; left: 0.08em; width: 0.46em; height: 0.09em; }
  .f { top: 0.05em; left: 0; width: 0.09em; height: 0.41em; }
  .b { top: 0.05em; right: 0; width: 0.09em; height: 0.41em; }
  .e { bottom: 0.05em; left: 0; width: 0.09em; height: 0.41em; }
  .c { bottom: 0.05em; right: 0; width: 0.09em; height: 0.41em; }
</style>