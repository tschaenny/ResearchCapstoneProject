/* ------------------------------------------------------------------
   Botswana National Museum — application entry point.

   Boot order matters: the global listeners must be installed and the
   shell must exist before the first route() renders into #app.
------------------------------------------------------------------- */
import { dkey } from './core/format.js';
import { nextDays } from './core/time.js';
import { hoursFor } from './data/opening.js';
import { store } from './state/store.js';
import { route } from './router/router.js';
import { shell } from './ui/shell.js';

// Imported for its side effects only: this module installs the delegated
// click / submit / input / change / keydown listeners and the hashchange
// hook. Without it the app renders once and then never navigates.
import './events/bind.js';

/* State that cannot be initialised in state/store.js, because that module
   deliberately imports nothing. */
function initState() {
  store.SB = { date: nextDays(14).find((k) => hoursFor(k)) || dkey(new Date()) };
}

initState();
shell();
route();
