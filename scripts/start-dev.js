// `yarn start` — the Vite dev server, fronted by portless (https://bitbones.localhost) when it is
// available and falling back to plain Vite on a port when it is not.
//
// PORTLESS=0 forces the plain-Vite path, PORT picks the port it uses, BROWSER=none suppresses the
// auto-open (that is what `yarn electron:dev` does).

import { resolveLocalServer, startLocalServer } from './local-server-utils.mjs';

console.log('Note: yarn start runs Vite in development mode. Use yarn start:preview for production-like local performance checks.');

startLocalServer(await resolveLocalServer([], 5173));
