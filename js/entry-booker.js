/* Bundle entry for the BOOKER page (booker.html). sync.js must run before
   fulfillment.js (it sets window.POSFirebase, which fulfillment.js reads).
   booker.html loads ONLY this bundle — no app.js / window.POS. */
import './sync.js';
import './fulfillment.js';
