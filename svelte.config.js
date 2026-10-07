import adapter from '@sveltejs/adapter-node';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter(),
    // assets must resolve under the tool's own path, not the domain root
    // (XOR rule from camelot/check-bpm deploys: paths.base set = NO traefik strip-prefix)
    paths: {
      base: '/tools/check-db'
    }
  }
};

export default config;