/* Bundle entry for the OWNER page (index.html). Module load order matters:
   sync.js sets window.POSFirebase / window.POSCloud, which admin.js and
   fulfillment.js read. app.js (classic, window.POS) ships as its own iife
   bundle loaded before this one. Keep this in sync with the script order in
   index.html — see build.mjs / the perf plan. */
import './sync.js';
import './admin.js';
import './fulfillment.js';
