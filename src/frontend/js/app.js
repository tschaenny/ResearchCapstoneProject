import { ICON } from './art/icons.js';
import { basketArt, emblem } from './art/objects.js';
import { exArtwork, pic, viewsOf } from './art/registry.js';
import { $, esc } from './core/dom.js';
import { dkey, fmtDate, fromKey, hh, money, pad } from './core/format.js';
import { qrSVG } from './core/qr.js';
import { DAYNAME, isPast, nextDays } from './core/time.js';
import { holiday, hoursFor, openStatus, slotHours } from './data/opening.js';
import { CAPACITY, DEPTS, EVENTS, EXHIBITIONS, HOURS, LOCATIONS, NAV, PAGES, ROOMS, TICKETS, TOURS, TOUR_TIMES } from './data/constants.js';
import { fresh, save } from './data/local.js';
import { demoScans, scanTotal, scansOnDay } from './state/analytics.js';
import { leftIn, newT, onlineOcc, sampleOcc, taken, totalOf, visitorsOf } from './state/booking.js';
import { filtered } from './state/query.js';
import { byId, deptCode, objectURL, objectsInRoom, published, roomById, roomOf, tourById, tourStops, toursOf } from './state/selectors.js';
import { store } from './state/store.js';

/* ------------------------------------------------------------------
   Added features: image gallery per object, museum floor plan,
   themed tours, scan statistics for staff.
------------------------------------------------------------------- */
/* ---------------- museum floor plan ------------------------------- */

function floorPlan({ highlight = null, stops = [], interactive = false, counts = false } = {}) {
  const rooms = ROOMS.map((r) => {
    const on = r.id === highlight;
    const cls = `room ${r.kind || 'gallery'}${on ? ' on' : ''}`;
    const n = counts ? objectsInRoom(r.id).length : null;
    const label = r.name.replace(' · ', ' · ');
    const lines = label.split(' · ');
    const tag = interactive ? 'a' : 'g';
    const attrs = interactive ? ` href="#/collection" data-act="room" data-id="${r.id}" role="link" tabindex="0" aria-label="${esc(r.name)}${n !== null ? `, ${n} objects` : ''}"` : '';
    return `<${tag} class="${cls}"${attrs}>
      <rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="3"/>
      <text class="rname" x="${r.x + r.w / 2}" y="${r.y + 26}" text-anchor="middle">${esc(lines[0])}</text>
      ${lines[1] ? `<text class="rsub" x="${r.x + r.w / 2}" y="${r.y + 44}" text-anchor="middle">${esc(lines[1])}</text>` : ''}
      ${r.sub ? `<text class="rsub" x="${r.x + r.w / 2}" y="${r.y + (lines[1] ? 62 : 44)}" text-anchor="middle">${esc(r.sub)}</text>` : ''}
      ${n !== null && n > 0 ? `<text class="rcount" x="${r.x + r.w / 2}" y="${r.y + r.h - 14}" text-anchor="middle">${n} object${n === 1 ? '' : 's'}</text>` : ''}
    </${tag}>`;
  }).join('');
  const pins = stops.map((s, i) => {
    const r = roomById(s.room); if (!r) return '';
    const off = (s.offset || 0);
    return `<g class="stop"><circle cx="${r.x + r.w / 2 + off}" cy="${r.y + r.h - 34}" r="14"/><text x="${r.x + r.w / 2 + off}" y="${r.y + r.h - 29}" text-anchor="middle">${i + 1}</text></g>`;
  }).join('');
  return `<svg class="plan" viewBox="0 0 700 440" role="img" aria-label="Floor plan of the museum${highlight ? `, ${esc((roomById(highlight) || {}).name || '')} highlighted` : ''}">
    <rect class="shell" x="24" y="24" width="552" height="392" rx="4"/>
    ${rooms}
    <g class="entrance"><rect x="286" y="412" width="48" height="8"/><polygon points="310,398 298,414 322,414"/><text x="310" y="436" text-anchor="middle" class="rsub">Entrance</text></g>
    ${pins}
  </svg>`;
}

/* ---------------- museum map page --------------------------------- */
function pageMap() {
  return `${pagehead([['#/', 'Home'], ['', 'Museum map']], 'Museum map', 'Six galleries, the art gallery and the courtyard. Select a room to see the objects on display there.')}
  <div class="wrap" style="padding-block:32px 72px">
    <div class="planbox big">${floorPlan({ interactive: true, counts: true })}</div>
    <div class="planlist">
      ${ROOMS.map((r) => { const n = objectsInRoom(r.id).length; return `<a class="planrow" href="#/collection" data-act="room" data-id="${r.id}"><b>${esc(r.name)}</b><span class="muted small">${n ? `${n} object${n === 1 ? '' : 's'} online` : 'No objects online yet'}</span></a>`; }).join('')}
    </div>
    <p class="small muted" style="margin-top:24px">The plan is a simplified sketch for the prototype. The real layout will be drawn with the museum.</p>
  </div>`;
}

/* ---------------- themed tours ------------------------------------ */
function tourPlan(t) {
  const stops = tourStops(t).map((o, i) => ({ room: roomOf(o.location) }));
  const seen = {};
  const spread = stops.map((s) => { const k = s.room || 'x'; seen[k] = (seen[k] || 0) + 1; return { room: s.room, offset: (seen[k] - 1) * 30 - 0 }; });
  return floorPlan({ stops: spread });
}
function tourCard(t) {
  return `<a class="tourcard" href="#/tour/${t.id}">
    <div class="planbox">${tourPlan(t)}</div>
    <div class="eyebrow">${t.mins} minutes · ${tourStops(t).length} stops</div>
    <h3 class="h3">${esc(t.title)}</h3>
    <p>${esc(t.sub)}</p>
  </a>`;
}
function pageTours() {
  return `${pagehead([['#/', 'Home'], ['', 'Tours']], 'Themed tours', 'Short routes through the galleries. Follow them on your phone – each stop is one object, and you can scan the QR code next to it at any time.')}
  <div class="wrap" style="padding-block:32px 72px"><div class="tourgrid">${TOURS.map(tourCard).join('')}</div></div>`;
}
function pageTour(id) {
  const t = tourById(id);
  if (!t) return pageNotFound();
  const stops = tourStops(t);
  return `${pagehead([['#/', 'Home'], ['#/tours', 'Tours'], ['', t.title]], esc(t.title), esc(t.intro))}
  <div class="wrap tourhead">
    <div>
      <dl class="tourfacts"><dt>Duration</dt><dd>${t.mins} minutes</dd><dt>Stops</dt><dd>${stops.length} objects</dd><dt>Start</dt><dd>${esc(t.start)}</dd><dt>Good for</dt><dd>${esc(t.who)}</dd></dl>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:24px"><button class="btn" type="button" data-act="tour-start" data-id="${t.id}">Start the tour on a phone</button><a class="btn ghost" href="#/map">Museum map</a></div>
    </div>
    <div class="planbox">${tourPlan(t)}<p class="small muted" style="margin:10px 0 0">The numbers show the order of the stops.</p></div>
  </div>
  <div class="wrap" style="padding-bottom:72px">
    <div class="stops">
      ${stops.map((o, i) => `<a class="stop" href="#/object/${o.id}">
        <span class="num">${i + 1}</span>
        <span class="pic">${pic(o)}</span>
        <span class="txt"><span class="eyebrow">${esc(o.onDisplay ? o.location : 'In the store')}</span><b>${esc(o.title)}</b><span class="muted small">${esc(o.date || '')}${o.date ? ' · ' : ''}${esc(o.id)}</span></span>
      </a>`).join('')}
    </div>
  </div>`;
}

function pageStaffStats() {
  const days = []; const d = new Date(); d.setHours(0, 0, 0, 0);
  for (let i = 13; i >= 0; i--) { const x = new Date(d); x.setDate(x.getDate() - i); days.push(dkey(x)); }
  const today = dkey(new Date());
  const demo = demoScans();
  const series = days.map((k) => ({ k, n: scansOnDay(k) + (k === today ? demo : 0), demo: k === today ? demo : 0 }));
  const max = Math.max(1, ...series.map((s) => s.n));
  const total = series.reduce((a, s) => a + s.n, 0);
  const top = published().map((o) => ({ o, n: scanTotal(o), demo: store.S.scans[o.id] || 0 })).sort((a, b) => b.n - a.n).slice(0, 8);
  const topMax = Math.max(1, ...top.map((t) => t.n));
  const byRoom = {};
  published().forEach((o) => { const r = roomOf(o.location); const name = r ? (roomById(r) || {}).name : 'Not on display'; byRoom[name] = (byRoom[name] || 0) + scanTotal(o); });
  const rooms = Object.entries(byRoom).sort((a, b) => b[1] - a[1]);
  const roomMax = Math.max(1, ...rooms.map((r) => r[1]));
  const inner = `
    <div class="kpis">
      <div><b>${total.toLocaleString('en-GB')}</b><span>QR scans in the last 14 days</span></div>
      <div><b>${published().length}</b><span>objects with a QR label</span></div>
      <div><b>${Math.round(total / 14)}</b><span>scans per day on average</span></div>
      <div><b>${esc(top[0] ? top[0].o.title.slice(0, 28) : '–')}${top[0] && top[0].o.title.length > 28 ? '…' : ''}</b><span>most scanned object</span></div>
    </div>
    <div class="twocol">
      <div>
        <h2 class="h3" style="margin-bottom:6px">Scans per day</h2>
        <p class="small muted" style="margin:0 0 14px">Last 14 days · Mondays are closing days</p>
        <div class="cols" id="daychart">${series.map((s) => `<div class="col" tabindex="0" data-tip="${esc(`${fmtDate(s.k, { weekday: 'long', day: 'numeric', month: 'long' })}: ${s.n} scans${s.demo ? ` (incl. ${s.demo} from this demo)` : ''}`)}" aria-label="${esc(`${fmtDate(s.k, { weekday: 'short', day: 'numeric', month: 'short' })}: ${s.n} scans`)}"><i class="bar ${s.demo ? 'today' : ''}" style="height:${Math.round((s.n / max) * 100)}%"></i><small>${fromKey(s.k).getDate()}</small></div>`).join('')}</div>
        <h2 class="h3" style="margin:32px 0 12px">Scans by gallery</h2>
        <div class="chart">${rooms.map(([name, n]) => `<div class="hbar small"><span class="lbl">${esc(name)}</span><span class="track"><i style="width:${Math.round((n / roomMax) * 100)}%"></i></span><span class="n">${n}</span></div>`).join('')}</div>
      </div>
      <div>
        <h2 class="h3" style="margin-bottom:6px">Most scanned objects</h2>
        <p class="small muted" style="margin:0 0 14px">Which labels visitors actually use – helpful when planning new texts and audio.</p>
        <div class="chart">${top.map((t) => `<div class="hbar"><a class="lbl" href="#/object/${t.o.id}">${esc(t.o.title)}</a><span class="track"><i style="width:${Math.round(((t.n - t.demo) / topMax) * 100)}%"></i><i class="demo" style="width:${Math.round((t.demo / topMax) * 100)}%"></i></span><span class="n">${t.n}</span></div>`).join('')}</div>
        <div class="legend" style="margin-top:14px"><span><i style="background:var(--deep)"></i>Sample data</span><span><i style="background:var(--sky)"></i>Scans from this demo (${demo})</span></div>
        <p class="small muted" style="margin-top:18px">Every “Simulate visitor scan” in this prototype is counted here, so you can see the numbers move during the presentation.</p>
      </div>
    </div>
    <details style="margin-top:28px"><summary style="cursor:pointer;font-weight:600;color:var(--deep)">Show the numbers as a table</summary>
      <div class="tablewrap" style="margin-top:12px"><table class="data" style="min-width:520px"><thead><tr><th>Object</th><th>Inventory no.</th><th>Gallery</th><th style="text-align:right">Scans</th></tr></thead><tbody>
        ${published().map((o) => ({ o, n: scanTotal(o) })).sort((a, b) => b.n - a.n).map((t) => `<tr><td>${esc(t.o.title)}</td><td class="inv">${esc(t.o.id)}</td><td class="small">${esc(t.o.onDisplay ? t.o.location : 'Store')}</td><td style="text-align:right" class="tnum">${t.n}</td></tr>`).join('')}
      </tbody></table></div>
    </details>`;
  return staffShell('staff/stats', inner);
}

/* ---------------- lightbox & tour player --------------------------- */
function openLight(objId, i) {
  const o = byId(objId); if (!o) return;
  store.LB = { id: objId, i };
  const views = viewsOf(o);
  const v = views[i] || views[0];
  openModal(`<div class="lightbox">
    <div class="lbtop"><span class="eyebrow" style="color:#C9D2DA">${esc(o.title)} · ${esc(v.cap)}</span><button class="iconbtn" type="button" data-act="close" aria-label="Close" style="border-color:#4A5157;color:#fff">${ICON.close}</button></div>
    <div class="lbmain">${v.html}</div>
    <div class="lbbar">
      <button class="btn ghost small" type="button" data-act="lb" data-d="-1" style="color:#fff;border-color:#fff" ${views.length < 2 ? 'disabled' : ''}>← Previous</button>
      <span class="small" style="color:#C9D2DA">${i + 1} / ${views.length}</span>
      <button class="btn ghost small" type="button" data-act="lb" data-d="1" style="color:#fff;border-color:#fff" ${views.length < 2 ? 'disabled' : ''}>Next →</button>
    </div>
  </div>`, 'Enlarged image');
}
function openTour(tourId, i = 0) {
  const t = tourById(tourId); if (!t) return;
  const stops = tourStops(t); if (!stops.length) return;
  i = Math.max(0, Math.min(stops.length - 1, i));
  store.TOURSTATE = { id: tourId, i };
  const o = stops[i];
  const last = i === stops.length - 1;
  openModal(`<div class="phonewrap">
    <div class="explain">
      <div class="eyebrow" style="color:#9FC7E4">Tour on the visitor’s phone</div>
      <h2>${esc(t.title)}</h2>
      <ol><li>The visitor opens the tour from the website or from any QR label.</li><li>Each stop shows one object with a short text.</li><li>At the object, the QR code opens the same record with all the details.</li></ol>
      <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn sky" type="button" data-act="close">Close</button><a class="btn ghost" href="#/tour/${t.id}" style="color:#fff;border-color:#fff">Tour page</a></div>
    </div>
    <div class="phone">
      <div class="screen">
        <div class="urlbar"><span>${esc(objectURL(o.id).replace(/^https?:\/\//, '').replace(/#.*$/, '') + 'tour/' + t.id)}</span></div>
        <div class="scroll">
          <div class="mhead"><span class="brand">${emblem()}<b>${esc(t.title)}</b></span><span class="small muted">${i + 1}/${stops.length}</span></div>
          <div class="tourbar"><i style="width:${Math.round(((i + 1) / stops.length) * 100)}%"></i></div>
          <div class="mpic">${pic(o)}</div>
          <div class="mbody">
            <div class="eyebrow">Stop ${i + 1} · ${esc(o.onDisplay ? o.location : 'In the store')}</div>
            <h3>${esc(o.title)}</h3>
            <p>${esc((o.text || '').split('. ').slice(0, 2).join('. ') + (o.text ? '.' : ''))}</p>
            <a class="btn ghost small" href="#/object/${o.id}" data-act="close-nav">Full object page</a>
            <div class="tournav">
              <button class="btn ghost small" type="button" data-act="tour-go" data-d="-1" ${i === 0 ? 'disabled' : ''}>Back</button>
              ${last ? '<button class="btn small" type="button" data-act="close">Finish tour</button>' : '<button class="btn small" type="button" data-act="tour-go" data-d="1">Next stop</button>'}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>`, 'Tour preview');
}


/* ---------------- tooltips for the statistics charts -------------- */
function bindTips() {
  const host = $('#daychart'); if (!host) return;
  let tip = $('#chart-tip');
  if (!tip) { document.body.insertAdjacentHTML('beforeend', '<div class="charttip" id="chart-tip" hidden></div>'); tip = $('#chart-tip'); }
  const show = (el, x, y) => {
    tip.textContent = el.dataset.tip; tip.hidden = false;
    const r = tip.getBoundingClientRect();
    tip.style.left = Math.min(window.innerWidth - r.width - 12, Math.max(12, x - r.width / 2)) + 'px';
    tip.style.top = Math.max(12, y - r.height - 14) + 'px';
  };
  host.addEventListener('mousemove', (e) => { const el = e.target.closest('[data-tip]'); if (el) { const r = el.getBoundingClientRect(); show(el, r.left + r.width / 2, r.top); } else tip.hidden = true; });
  host.addEventListener('mouseleave', () => { tip.hidden = true; });
  host.addEventListener('focusin', (e) => { const el = e.target.closest('[data-tip]'); if (el) { const r = el.getBoundingClientRect(); show(el, r.left + r.width / 2, r.top); } });
  host.addEventListener('focusout', () => { tip.hidden = true; });
}
/* ---------------- shell ---------------- */
function shell() {
  const st = openStatus();
  document.body.insertAdjacentHTML('afterbegin', `
  <div class="protobar" role="region" aria-label="Prototype navigation">
    <div class="wrap">
      <span class="tag">PROTOTYPE</span>
      <span class="note">Capstone project with the Botswana National Museum · sample content, not the official website</span>
      <nav aria-label="Prototype screens">
        <a href="#/" data-pb="">Home</a><a href="#/tickets" data-pb="tickets">Tickets</a><a href="#/collection" data-pb="collection">Collection</a><a href="#/object/BNM-ETH-0142" data-pb="object">Object &amp; QR</a><a href="#/tours" data-pb="tours">Tours</a><a href="#/map" data-pb="map">Map</a><a href="#/staff" data-pb="staff">Staff area</a><button type="button" data-act="reset">Reset demo</button>
      </nav>
    </div>
  </div>
  <div class="utility">
    <div class="wrap">
      <div class="status ${st.open ? '' : 'closed'}"><i></i><span>${st.text}</span><span class="hide-s muted">· Gaborone time</span></div>
      <div class="tools">
        <a href="#/page/accessibility" class="hide-s">Accessibility</a>
        <a href="#/staff" class="hide-s">Staff login</a>
        <span class="lang" role="group" aria-label="Language"><button type="button" aria-pressed="true">EN</button><button type="button" aria-pressed="false" data-act="lang-tn" title="Setswana">TN</button></span>
      </div>
    </div>
  </div>
  <header class="masthead">
    <div class="wrap">
      <a class="brand" href="#/" aria-label="Botswana National Museum – home">${emblem()}<div><b>Botswana National Museum</b><span>&amp; Art Gallery · Gaborone</span></div></a>
      <nav class="mainnav" id="mainnav" aria-label="Main">${NAV.map(([h, l]) => `<a href="#/${h}" data-nav="${h}">${l}</a>`).join('')}<a href="#/collection" class="mobile-only">Search the collection</a><a href="#/staff" class="mobile-only">Staff area</a></nav>
      <div class="headactions">
        <button class="iconbtn searchbtn" type="button" data-act="search-toggle" aria-label="Search the collection">${ICON.search}</button>
        <a class="btn" href="#/tickets">Tickets</a>
        <button class="iconbtn menubtn" type="button" data-act="menu" aria-label="Menu" aria-controls="mainnav">${ICON.menu}</button>
      </div>
    </div>
    <div class="searchbar" id="searchbar" hidden>
      <form class="wrap" id="topsearch" role="search"><label class="sr-only" for="topq">Search the collection</label><input type="search" id="topq" placeholder="Search objects, places, materials …"><button class="btn" type="submit">Search</button></form>
    </div>
  </header>
  <div class="flagrule" aria-hidden="true"></div>
  <main id="app" tabindex="-1"></main>
  <footer class="site">
    <div class="wrap">
      <div class="cols">
        <div>
          <a class="brand" href="#/" style="color:#fff">${emblem()}<div><b style="color:#fff">Botswana National Museum</b><span style="color:#9AA3AB">&amp; Art Gallery</span></div></a>
          <p style="margin:18px 0 4px">331 Independence Avenue<br>Gaborone, Botswana</p>
          <p class="small" style="margin:0;color:#9AA3AB">Tue–Fri 09:00–18:00 · Sat–Sun 09:00–17:00 · Mon closed</p>
          <form class="newsletter" data-act-submit="newsletter"><label class="sr-only" for="nl">E-mail for newsletter</label><input id="nl" type="email" placeholder="Newsletter: your e-mail"><button class="btn sky" type="submit">Subscribe</button></form>
        </div>
        <div><h4>Visit</h4><ul><li><a href="#/tickets">Tickets &amp; time slots</a></li><li><a href="#/visit">Opening hours</a></li><li><a href="#/page/groups">Groups &amp; schools</a></li><li><a href="#/map">Museum map</a></li><li><a href="#/page/accessibility">Accessibility</a></li></ul></div>
        <div><h4>Discover</h4><ul><li><a href="#/exhibitions">Exhibitions</a></li><li><a href="#/collection">Collection Online</a></li><li><a href="#/tours">Themed tours</a></li><li><a href="#/events">Events</a></li><li><a href="#/page/virtual-tour">Virtual tour</a></li></ul></div>
        <div><h4>Museum</h4><ul><li><a href="#/page/about">About us</a></li><li><a href="#/page/learn">Learn &amp; schools</a></li><li><a href="#/page/tsodilo">Tsodilo World Heritage Site</a></li><li><a href="#/page/press">Press</a></li><li><a href="#/staff">Staff area</a></li></ul></div>
      </div>
      <div class="legal"><span>Prototype · Research capstone project in cooperation with the Botswana National Museum, 2026</span><span>All objects, prices and events are sample content</span><a href="#/page/about">Imprint</a><a href="#/page/about">Privacy</a></div>
    </div>
  </footer>`);
}

/* ---------------- shared pieces ---------------- */
function objCard(o) {
  return `<a class="objcard" href="#/object/${o.id}">
    <div class="pic">${pic(o)}${o.status === 'draft' ? '<span class="chip draft">Draft</span>' : ''}</div>
    <div class="eyebrow">${esc(o.dept)}</div>
    <h3>${esc(o.title)}</h3>
    <div class="inv">${esc(o.date || '')}${o.date ? ' · ' : ''}${esc(o.id)}</div>
  </a>`;
}
function exCard(e, big = false) {
  return `<a class="excard ${big ? 'big' : 'row'}" href="#/exhibitions">
    <div class="pic">${exArtwork(e)}</div>
    <div class="txt">
      <div class="eyebrow">${esc(e.kind)} · ${esc(e.dates)}</div>
      <h3 class="${big ? 'h2' : 'h4'}">${esc(e.title)}</h3>
      <p>${esc(e.text)}</p>
    </div>
  </a>`;
}
function eventRow(ev) {
  const d = fromKey(ev.d);
  return `<div class="event">
    <div class="date"><b>${d.getDate()}</b><span>${d.toLocaleDateString('en-GB', { month: 'short' })}<br>${d.toLocaleDateString('en-GB', { weekday: 'short' })}</span></div>
    <div><div class="eyebrow">${esc(ev.kind)}</div><h3>${esc(ev.title)}</h3><div class="meta">${esc(ev.time)} · ${esc(ev.place)}</div></div>
    <a class="btn ghost small" href="#/tickets">Book</a>
  </div>`;
}
function objLabel(o, url) {
  return `<div class="objlabel">
    <div class="t">
      <div class="eyebrow">${esc(o.dept)}</div>
      <b>${esc(o.title)}</b>
      <span>${esc([o.origin, o.date].filter(Boolean).join(' · '))}</span>
      <span>${esc(o.material || '')}</span>
      <div class="inv">${esc(o.id)}</div>
    </div>
    <div class="q">${qrSVG(url, `QR code linking to ${o.title}`)}<small>Scan for more<br>English · Setswana</small></div>
    <div class="stripe" aria-hidden="true"></div>
  </div>`;
}
function pagehead(crumbs, title, lede = '') {
  return `<div class="pagehead"><div class="wrap">
    <nav class="crumbs" aria-label="Breadcrumb">${crumbs.map(([h, l], i) => (i < crumbs.length - 1 ? `<a href="${h}">${esc(l)}</a><span aria-hidden="true">/</span>` : `<span>${esc(l)}</span>`)).join('')}</nav>
    <h1 class="h1">${title}</h1>${lede ? `<p class="lede">${lede}</p>` : ''}
  </div></div>`;
}

/* ---------------- pages ---------------- */
function pageHome() {
  const st = openStatus();
  const latest = [...published()].sort((a, b) => b.added - a.added).slice(0, 4);
  return `
  <section class="hero" aria-label="Featured exhibition">
    <div class="band" aria-hidden="true"></div>
    <div class="wrap">
      <div class="copy">
        <div class="top">
          <div class="eyebrow">Special exhibition · 30 Sep 2026 – 28 Mar 2027</div>
          <p>Diamond Jubilee: sixty years of independence, told through sixty objects.</p>
        </div>
        <h1>Botswana at 60</h1>
        <div class="bottom">
          <p>From the first Independence Day flag to baskets woven in Etsha – how a young nation tells its story.</p>
          <div class="ctas"><a class="btn" href="#/tickets">Book a time slot</a><a class="btn ghost" href="#/collection">Explore the objects</a></div>
        </div>
      </div>
      <div class="art">${basketArt({ bg: null })}</div>
    </div>
    <div class="credit">Illustration: coiled basket, “Tears of the Giraffe” pattern</div>
  </section>

  <section class="visitstrip" aria-label="Visit information">
    <div class="wrap">
      <div class="cell"><div class="eyebrow">Today</div><b>${st.text}</b><span>Tue–Fri 09–18 · Sat–Sun 09–17 · Mon closed</span></div>
      <div class="cell"><div class="eyebrow">Admission</div><b>Free for citizens &amp; residents</b><span>International visitors P 50 · sample prices</span></div>
      <div class="cell"><div class="eyebrow">Address</div><b>331 Independence Avenue</b><span>Gaborone, Botswana</span></div>
      <div class="cta"><a class="btn sky arrow" href="#/visit">Plan your visit </a></div>
    </div>
  </section>

  <section>
    <div class="wrap welcome">
      <div><div class="eyebrow" style="margin-bottom:10px">Dumelang – welcome</div><h2 class="h2">Botswana’s story, from the Stone Age to today</h2></div>
      <div>
        <p class="lede" style="margin:0">Founded in 1967, a year after independence, the National Museum and Art Gallery in Gaborone collects, researches and shares the natural and cultural heritage of Botswana. Its divisions cover archaeology, natural history, ethnography, education and art – and it cares for heritage sites across the country, including the Tsodilo Hills.</p>
        <div class="facts">
          <div><b>1967</b><span>founded by Act of Parliament</span></div>
          <div><b>5</b><span>divisions, one museum</span></div>
          <div><b>4,500+</b><span>rock paintings at Tsodilo</span></div>
        </div>
      </div>
    </div>
  </section>

  <section class="rule-top" id="exhibitions" style="border-top-width:1px;border-color:var(--line)">
    <div class="wrap">
      <div class="sec-head"><div><div class="eyebrow">Exhibitions</div><h2 class="h2">On view now</h2></div><a class="btn ghost small arrow" href="#/exhibitions">All exhibitions </a></div>
      <div class="exgrid">${exCard(EXHIBITIONS[0], true)}${EXHIBITIONS.slice(1).map((e) => exCard(e)).join('')}</div>
    </div>
  </section>

  <section class="bg-mist">
    <div class="wrap">
      <div class="sec-head">
        <div><div class="eyebrow">Collection Online</div><h2 class="h2">New in the collection</h2></div>
        <form class="teasersearch" id="teasersearch" role="search" style="display:flex;gap:8px;flex:1;max-width:460px;min-width:260px"><label class="sr-only" for="tq">Search the collection</label><input type="search" id="tq" placeholder="Search ${published().length} objects …"><button class="btn" type="submit">Search</button></form>
      </div>
      <div class="objgrid">${latest.map(objCard).join('')}</div>
      <p class="small muted" style="margin:28px 0 0;display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span class="chip dev">How it works</span> Objects that staff add in the staff area appear here automatically – no web developer needed. <a href="#/collection">Explore the collection →</a></p>
    </div>
  </section>

  <section>
    <div class="wrap">
      <div class="sec-head"><div><div class="eyebrow">Tours &amp; routes</div><h2 class="h2">Find your way through the galleries</h2></div><a class="btn ghost small arrow" href="#/map">Museum map </a></div>
      <div class="tourgrid">${TOURS.map(tourCard).join('')}</div>
    </div>
  </section>

  <section>
    <div class="wrap">
      <div class="sec-head"><div><div class="eyebrow">What’s on</div><h2 class="h2">Events in October</h2></div><a class="btn ghost small arrow" href="#/events">Full calendar </a></div>
      <div class="events">${EVENTS.map(eventRow).join('')}</div>
    </div>
  </section>

  <section class="bg-mist">
    <div class="wrap">
      <div class="sec-head"><div><div class="eyebrow">Museum digital</div><h2 class="h2">Visit online, discover more in the galleries</h2></div></div>
      <div class="digital">
        <a href="#/collection">${ICON.grid}<span class="chip live dot">Live in prototype</span><h3>Collection Online</h3><p>Search and browse every published object record.</p></a>
        <a href="#/object/BNM-ETH-0142">${ICON.qr}<span class="chip live dot">Live in prototype</span><h3>QR codes on objects</h3><p>Scan a label in the gallery to open the object page.</p></a>
        <a href="#/tours">${ICON.route}<span class="chip live dot">Live in prototype</span><h3>Themed tours</h3><p>Short routes through the museum, made for a phone.</p></a>
        <a href="#/page/virtual-tour">${ICON.tour}<span class="chip plan dot">Planned</span><h3>Virtual tour</h3><p>Walk through the galleries in 360° from anywhere.</p></a>
        <a href="#/page/ar">${ICON.ar}<span class="chip plan dot">Planned</span><h3>AR in the exhibition</h3><p>See objects in 3D and in their original setting.</p></a>
        <a href="#/page/displays">${ICON.screen}<span class="chip plan dot">Planned</span><h3>Interactive displays</h3><p>Touch screens in the galleries fed by the same database.</p></a>
      </div>
    </div>
  </section>`;
}

function pageVisit() {
  const today = new Date().getDay();
  const order = [2, 3, 4, 5, 6, 0, 1];
  return `${pagehead([['#/', 'Home'], ['', 'Visit']], 'Plan your visit', 'Everything you need for your visit to the National Museum and Art Gallery in Gaborone. Opening hours and prices on this page are placeholders to be confirmed with the museum.')}
  <div class="wrap placeholder" style="padding-block:48px 80px">
    <div>
      <h2 class="h3" style="margin-bottom:14px">Opening hours</h2>
      <table class="hours">${order.map((d) => `<tr class="${d === today ? 'today' : ''}"><td>${DAYNAME[d]}${d === today ? ' (today)' : ''}</td><td>${HOURS[d] ? `${hh(HOURS[d][0])} – ${hh(HOURS[d][1])}` : 'Closed'}</td></tr>`).join('')}</table>
      <p class="small muted">Last entry one hour before closing. Closed on selected public holidays.</p>
      <h2 class="h3" style="margin:36px 0 14px">Admission</h2>
      <table class="hours">${TICKETS.map((t) => `<tr><td>${esc(t.name)}</td><td>${money(t.price)}</td></tr>`).join('')}<tr><td>School groups (booked via the education office)</td><td>Free</td></tr></table>
      <div style="margin-top:28px"><a class="btn" href="#/tickets">Book a time slot</a></div>
    </div>
    <div>
      <h2 class="h3" style="margin-bottom:14px">Getting here</h2>
      <p class="prose">331 Independence Avenue, Gaborone. The museum is in the city centre and can be reached by taxi or combi. Parking information will follow.</p>
      <h2 class="h3" style="margin:28px 0 14px">Accessibility</h2>
      <p class="prose">Information on step-free access, seating and assistance will be added together with the museum team.</p>
      <h2 class="h3" style="margin:28px 0 14px">Groups &amp; schools</h2>
      <p class="prose">School classes visit free of charge. The education office plans guided visits and workshops for all school levels.</p>
    </div>
  </div>`;
}

function pageExhibitions() {
  return `${pagehead([['#/', 'Home'], ['', 'Exhibitions']], 'Exhibitions', 'Special exhibitions and permanent galleries at the National Museum and Art Gallery.')}
  <div class="wrap" style="padding-block:48px 80px"><div class="objgrid" style="grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:40px 28px">
    ${EXHIBITIONS.map((e) => `<a class="excard" href="#/exhibitions"><div class="pic">${exArtwork(e)}</div><div class="eyebrow">${esc(e.kind)} · ${esc(e.dates)}</div><h3 class="h3">${esc(e.title)}</h3><p>${esc(e.text)}</p></a>`).join('')}
  </div></div>`;
}

function pageEvents() {
  return `${pagehead([['#/', 'Home'], ['', 'Events']], 'Events', 'Tours, talks and workshops for all ages.')}
  <div class="wrap" style="padding-block:40px 80px"><div class="events">${EVENTS.map(eventRow).join('')}</div></div>`;
}

function pagePlaceholder(key) {
  const p = PAGES[key];
  if (!p) return pageNotFound();
  return `${pagehead([['#/', 'Home'], ['', p.t]], esc(p.t), esc(p.l))}
  <div class="wrap placeholder">
    <div><span class="chip ${p.chip.startsWith('Planned') ? 'plan' : 'dev'}">${esc(p.chip)}</span><h2 class="h3" style="margin:16px 0 14px">What this page will contain</h2><ul>${p.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul></div>
    <div><p class="prose">This page is part of the full website concept but not built in the prototype. The prototype focuses on the homepage, ticketing with time slots, the collection database and QR codes.</p><div style="display:flex;gap:10px;flex-wrap:wrap"><a class="btn" href="#/">Back to home</a><a class="btn ghost" href="#/collection">Collection Online</a></div></div>
  </div>`;
}
function pageNotFound() {
  return `${pagehead([['#/', 'Home'], ['', 'Not found']], 'Page not found', 'This object or page does not exist (anymore). Try the collection search.')}
  <div class="wrap" style="padding-block:32px 80px"><a class="btn" href="#/collection">Go to Collection Online</a></div>`;
}

/* ---------------- tickets ---------------- */

function pageTickets() {
  if (store.T.step === 4 && !store.T.done) store.T = newT();
  const steps = ['Date & time', 'Tickets', 'Your details', 'Confirmation'];
  return `${pagehead([['#/', 'Home'], ['', 'Tickets']], 'Tickets &amp; time slots', 'Book your visit online and skip the queue. Every hour, up to 40 visitors can enter – so the galleries never get too crowded.')}
  <div class="wrap">
    <ol class="steps" aria-label="Booking steps">${steps.map((s, i) => `<li class="${i + 1 === store.T.step ? 'on' : i + 1 < store.T.step ? 'done' : ''}" ${i + 1 === store.T.step ? 'aria-current="step"' : ''}>${s}</li>`).join('')}</ol>
    <div class="tk" id="tk">${tkBody()}${tkSummary()}</div>
  </div>`;
}
function tkRerender(scroll = false) {
  const a = document.activeElement; let sel = null;
  if (a && a.dataset && a.dataset.act) sel = `[data-act="${a.dataset.act}"]` + ['k', 'h', 'd'].map((x) => (a.dataset[x] !== undefined ? `[data-${x}="${a.dataset[x]}"]` : '')).join('');
  $('#app').innerHTML = pageTickets();
  if (scroll) { $('.steps').scrollIntoView({ behavior: 'smooth', block: 'start' }); const h = $('#tk h2'); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); } return; }
  if (sel) { const el = $(sel); if (el && !el.disabled) el.focus({ preventScroll: true }); }
}
function tkBody() {
  if (store.T.step === 1) {
    const days = nextDays(14);
    const dayBtns = days.map((k) => {
      const d = fromKey(k); const closed = !hoursFor(k); const hol = holiday(k);
      const isToday = k === dkey(new Date());
      const allPast = !closed && slotHours(k).every((h) => isPast(k, h));
      const dis = closed || allPast;
      const em = closed ? 'Closed' : allPast ? 'Closed for today' : hol ? `<span class="hol">${esc(hol)}</span>` : isToday ? 'Today' : d.toLocaleDateString('en-GB', { month: 'short' });
      return `<button type="button" class="day" data-act="day" data-k="${k}" aria-pressed="${store.T.date === k}" ${dis ? 'disabled' : ''}><small>${d.toLocaleDateString('en-GB', { weekday: 'short' })}</small><b>${d.getDate()}</b><em>${em}</em></button>`;
    }).join('');
    let slots = '<p class="muted">Choose a day to see available time slots.</p>';
    if (store.T.date) {
      slots = `<div class="slots">${slotHours(store.T.date).map((h) => {
        const past = isPast(store.T.date, h); const left = leftIn(store.T.date, h); const full = left <= 0;
        const pct = Math.round((taken(store.T.date, h) / CAPACITY) * 100);
        const few = !full && left <= 8;
        const tour = TOUR_TIMES.includes(h);
        return `<button type="button" class="slot ${few ? 'few' : ''}" data-act="slot" data-h="${h}" aria-pressed="${store.T.hour === h}" ${past || full ? 'disabled' : ''}>
          <b>${hh(h)}</b>
          <span class="cap" aria-hidden="true"><i style="width:${past ? 0 : pct}%"></i></span>
          <span class="left">${past ? 'Past' : full ? 'Fully booked' : few ? `Only ${left} left` : `${left} places left`}</span>
          ${tour ? '<span class="tour">+ Guided tour</span>' : ''}
        </button>`;
      }).join('')}</div>`;
    }
    return `<div>
      <h2>Choose a day</h2><div class="days" role="group" aria-label="Day">${dayBtns}</div>
      <h2>Choose an entry time</h2>${slots}
      <div class="navrow"><span></span><button class="btn arrow" type="button" data-act="tk-next" ${store.T.date && store.T.hour !== null ? '' : 'disabled'}>Continue </button></div>
    </div>`;
  }
  if (store.T.step === 2) {
    const vis = visitorsOf(store.T.q); const left = leftIn(store.T.date, store.T.hour); const max = Math.min(10, left);
    const tourSlot = TOUR_TIMES.includes(store.T.hour);
    const rows = TICKETS.map((t) => {
      const v = store.T.q[t.key];
      const plusDis = t.addon ? (!tourSlot || v >= vis) : vis >= max;
      return `<div class="type">
        <div><b>${esc(t.name)}</b><p>${esc(t.addon && !tourSlot ? 'Guided tours run at 10:00 and 14:00 – choose one of these slots to add a tour' : t.desc)}</p></div>
        <div class="price">${money(t.price)}</div>
        <div class="stepper" role="group" aria-label="${esc(t.name)}"><button type="button" data-act="qty" data-k="${t.key}" data-d="-1" aria-label="Fewer" ${v <= 0 ? 'disabled' : ''}>−</button><output aria-live="polite">${v}</output><button type="button" data-act="qty" data-k="${t.key}" data-d="1" aria-label="More" ${plusDis ? 'disabled' : ''}>+</button></div>
      </div>`;
    }).join('');
    return `<div>
      <h2>How many visitors?</h2>
      <div class="types">${rows}</div>
      <p class="small muted" style="margin-top:14px">Up to ${max} visitors per booking in this slot. Coming with a school class? <a href="#/page/groups">Book through the education office</a> – free of charge.</p>
      <div class="navrow"><button class="btn ghost" type="button" data-act="tk-back">Back</button><button class="btn arrow" type="button" data-act="tk-next" ${vis > 0 ? '' : 'disabled'}>Continue </button></div>
    </div>`;
  }
  if (store.T.step === 3) {
    const total = totalOf(store.T.q); const e = store.T.err;
    const pay = total === 0
      ? `<label><input type="radio" name="pay" checked disabled><span><b>No payment needed</b><small>Your visit is free of charge.</small></span></label>`
      : `<label><input type="radio" name="pay" value="desk" ${store.T.pay === 'desk' ? 'checked' : ''}><span><b>Pay at the museum on arrival</b><small>Cash or card at the front desk</small></span></label>
         <label class="off"><input type="radio" name="pay" disabled><span><b>Mobile money</b><small>Orange Money, MyZaka, Smega – planned integration</small></span></label>
         <label class="off"><input type="radio" name="pay" disabled><span><b>Card online</b><small>Payment provider to be selected with the museum</small></span></label>`;
    return `<div>
      <h2>Your details</h2>
      <div class="formgrid">
        <div class="field full"><label for="f-name">Full name</label><input id="f-name" type="text" autocomplete="name" value="${esc(store.T.name)}" ${e.name ? 'aria-invalid="true" aria-describedby="e-name"' : ''}>${e.name ? `<span class="hint" id="e-name" style="color:var(--full)">${e.name}</span>` : ''}</div>
        <div class="field"><label for="f-email">E-mail</label><input id="f-email" type="email" autocomplete="email" value="${esc(store.T.email)}" ${e.email ? 'aria-invalid="true" aria-describedby="e-email"' : ''}><span class="hint" id="e-email" ${e.email ? 'style="color:var(--full)"' : ''}>${e.email || 'Your e-ticket is sent here'}</span></div>
        <div class="field"><label for="f-phone">Mobile number <span class="muted" style="font-weight:400">(optional)</span></label><input id="f-phone" type="tel" autocomplete="tel" placeholder="+267 7x xxx xxx" value="${esc(store.T.phone)}"></div>
        <div class="field"><label for="f-country">Country of residence</label><select id="f-country">${['Botswana', 'South Africa', 'Namibia', 'Zimbabwe', 'Zambia', 'Germany', 'Other'].map((c) => `<option ${store.T.country === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
      </div>
      <h2 style="margin-top:36px">Payment</h2>
      <div class="pay">${pay}</div>
      <label class="check" style="margin-top:24px"><input type="checkbox" id="f-agree" ${store.T.agree ? 'checked' : ''}><span>I accept the house rules and the privacy notice.${e.agree ? ` <b style="color:var(--full)">${e.agree}</b>` : ''}</span></label>
      <div class="navrow"><button class="btn ghost" type="button" data-act="tk-back">Back</button><button class="btn" type="button" data-act="tk-confirm">Confirm booking</button></div>
    </div>`;
  }
  const b = store.T.done;
  const lines = TICKETS.filter((t) => b.q[t.key]).map((t) => `${b.q[t.key]} × ${t.name}`).join('<br>');
  return `<div>
    <div class="eyebrow" style="margin-bottom:8px">Booking confirmed</div>
    <h2 class="h2" style="font-size:34px;margin-bottom:10px">Re a leboga – see you soon!</h2>
    <p class="lede" style="margin:0 0 28px">Your e-ticket has been sent to ${esc(b.email)}. Show the QR code at the entrance.</p>
    <div class="eticket">
      <div class="l">
        <div class="flagrule" aria-hidden="true"></div>
        <div><div class="eyebrow">Botswana National Museum · E-ticket</div><div class="h3" style="margin-top:6px">${esc(fmtDate(b.date))}</div></div>
        <dl><dt>Entry</dt><dd>${hh(b.hour)} – ${hh(b.hour + 1)}</dd><dt>Visitors</dt><dd>${lines}</dd><dt>Name</dt><dd>${esc(b.name)}</dd><dt>Total</dt><dd>${money(b.total)}${b.total ? ' · pay on arrival' : ''}</dd></dl>
      </div>
      <div class="r">${qrSVG(`BNM-TICKET|${b.code}|${b.date}|${hh(b.hour)}|${b.visitors}`, 'Ticket QR code')}<span class="code">${b.code}</span></div>
    </div>
    <div class="navrow" style="justify-content:flex-start"><button class="btn" type="button" data-act="tk-new">Book another visit</button><a class="btn ghost" href="#/staff/bookings">See this booking in the staff area</a></div>
  </div>`;
}
function tkSummary() {
  if (store.T.step === 4) {
    return `<aside class="summary" aria-label="Before your visit"><h3>Before your visit</h3>
      <ul class="small" style="margin:0;padding-left:18px;display:grid;gap:8px"><li>Arrive within your entry hour – you can stay until closing.</li><li>Bring your Omang or residence permit for free admission.</li><li>Guided tours meet at the front desk.</li></ul>
      <p class="fine">Prototype: no e-mail is sent and no payment is taken. Bookings are stored only in this browser.</p></aside>`;
  }
  const vis = visitorsOf(store.T.q); const total = totalOf(store.T.q);
  const lines = TICKETS.filter((t) => store.T.q[t.key]).map((t) => `<dt>${store.T.q[t.key]} × ${esc(t.name)}</dt><dd>${money(t.price * store.T.q[t.key])}</dd>`).join('');
  return `<aside class="summary" aria-label="Your booking">
    <h3>Your booking</h3>
    <dl>
      <dt>Day</dt><dd>${store.T.date ? esc(fmtDate(store.T.date, { weekday: 'short', day: 'numeric', month: 'short' })) : '–'}</dd>
      <dt>Entry</dt><dd>${store.T.hour !== null ? `${hh(store.T.hour)} – ${hh(store.T.hour + 1)}` : '–'}</dd>
      <dt>Visitors</dt><dd>${vis || '–'}</dd>
      ${lines}
    </dl>
    <div class="total"><span>Total</span><span>${vis ? money(total) : '–'}</span></div>
    <p class="fine">Prototype: no payment is taken and no data leaves this browser.</p>
  </aside>`;
}
function tkConfirm() {
  store.T.name = $('#f-name').value.trim(); store.T.email = $('#f-email').value.trim(); store.T.phone = $('#f-phone').value.trim(); store.T.country = $('#f-country').value; store.T.agree = $('#f-agree').checked;
  const err = {};
  if (store.T.name.length < 2) err.name = 'Please enter your name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(store.T.email)) err.email = 'Please enter a valid e-mail address, e.g. name@example.com.';
  if (!store.T.agree) err.agree = 'Please accept to continue.';
  store.T.err = err;
  if (Object.keys(err).length) { tkRerender(); const first = err.name ? '#f-name' : err.email ? '#f-email' : '#f-agree'; $(first).focus(); return; }
  const code = 'BNM-' + Array.from({ length: 5 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
  const b = { code, date: store.T.date, hour: store.T.hour, q: { ...store.T.q }, visitors: visitorsOf(store.T.q), total: totalOf(store.T.q), name: store.T.name, email: store.T.email, country: store.T.country, created: Date.now(), checkedIn: false };
  store.S.bookings.push(b); save();
  store.T.done = b; store.T.step = 4; tkRerender(true);
}

function pageCollection() {
  return `${pagehead([['#/', 'Home'], ['', 'Collection Online']], 'Collection Online', 'Explore objects from the museum’s archaeology, ethnography, natural history, history and art collections – including many that are not on display.')}
  <div class="wrap">
    <div class="filters">
      <form class="search" id="colsearch" role="search"><label class="sr-only" for="cq">Search the collection</label><input type="search" id="cq" value="${esc(store.CQ.q)}" placeholder="Search by title, place, material or inventory number"><button class="btn" type="submit">Search</button></form>
      <div class="row" id="deptchips"></div>
      <div class="row"><label class="small muted" for="locf">Where in the museum</label><select id="locf" style="width:auto;min-height:40px">${['All', ...ROOMS.map((r) => r.id), 'store'].map((v) => `<option value="${v}" ${store.CQ.room === v ? 'selected' : ''}>${v === 'All' ? 'Anywhere' : v === 'store' ? 'In the store' : esc((roomById(v) || {}).name || v)}</option>`).join('')}</select><a class="small" href="#/map">Show me on the map →</a></div>
    </div>
    <div class="resulthead"><div id="rcount" class="muted" aria-live="polite"></div>
      <div style="display:flex;gap:10px;align-items:center"><label for="sort" class="small muted">Sort by</label><select id="sort"><option value="inv" ${store.CQ.sort === 'inv' ? 'selected' : ''}>Inventory number</option><option value="title" ${store.CQ.sort === 'title' ? 'selected' : ''}>Title A–Z</option><option value="new" ${store.CQ.sort === 'new' ? 'selected' : ''}>Recently added</option></select></div>
    </div>
    <div id="results" style="padding-bottom:72px"></div>
  </div>`;
}
function renderResults() {
  const base = filtered(true);
  const counts = { All: base.length }; DEPTS.forEach((d) => { counts[d.key] = base.filter((o) => o.dept === d.key).length; });
  $('#deptchips').innerHTML = ['All', ...DEPTS.map((d) => d.key)].map((k) => `<button type="button" class="fchip" data-act="dept" data-v="${k}" aria-pressed="${store.CQ.dept === k}">${k === 'All' ? 'All departments' : k}<span>${counts[k]}</span></button>`).join('')
    + `<button type="button" class="fchip" data-act="display" aria-pressed="${store.CQ.display}">On display now</button>`;
  const list = filtered();
  $('#rcount').textContent = `${list.length} ${list.length === 1 ? 'object' : 'objects'}${store.CQ.q ? ` for “${store.CQ.q}”` : ''} · all records are sample data`;
  $('#results').innerHTML = list.length ? `<div class="objgrid">${list.map(objCard).join('')}</div>` : `<div class="empty"><p>No objects match your search.</p><button class="btn ghost" type="button" data-act="clear-search">Clear search &amp; filters</button></div>`;
}

/* ---------------- object ---------------- */
function pageObject(id) {
  const o = byId(id);
  if (!o) return pageNotFound();
  const url = objectURL(o.id);
  const related = published().filter((x) => x.dept === o.dept && x.id !== o.id).slice(0, 4);
  const store = !o.onDisplay;
  const views = viewsOf(o);
  const room = roomOf(o.location);
  const inTours = toursOf(o.id);
  return `
  <div class="wrap">
    <nav class="crumbs" aria-label="Breadcrumb" style="padding-top:28px"><a href="#/">Home</a><span aria-hidden="true">/</span><a href="#/collection">Collection</a><span aria-hidden="true">/</span><span>${esc(o.dept)}</span></nav>
    ${o.status === 'draft' ? '<p class="chip draft" style="margin-top:8px">Draft · only visible to staff</p>' : ''}
    <div class="objpage">
      <div class="viewer">
        <div class="gallery">
          <div class="pic" id="mainpic">${views[0].html}<button class="zoombtn" type="button" data-act="light" data-id="${o.id}" data-i="0">Enlarge</button></div>
          <div class="thumbs" role="group" aria-label="Images of this object">${views.map((v, i) => `<button type="button" class="thumb" data-act="view" data-id="${o.id}" data-i="${i}" aria-pressed="${i === 0}"><span class="sr-only">${esc(v.cap)}</span>${v.html}</button>`).join('')}</div>
          <p class="small muted" id="viewcap">${esc(views[0].cap)}${views.length > 1 ? ` · ${views.length} images` : ''}</p>
        </div>
        <div class="tools"><button class="btn small" type="button" data-act="scan" data-id="${o.id}">Simulate visitor scan</button><button class="btn ghost small" type="button" data-act="label" data-id="${o.id}">QR label</button><button class="btn ghost small" type="button" data-act="toast" data-msg="Share: copies the object link – planned">Share</button></div>
      </div>
      <div>
        <div class="eyebrow">${esc(o.dept)}</div>
        <h1>${esc(o.title)}</h1>
        <div class="sub">${esc([o.origin, o.date].filter(Boolean).join(' · '))}</div>
        ${inTours.length ? `<div class="tourchips">${inTours.map((t) => `<a class="chip dev" href="#/tour/${t.id}">On the tour: ${esc(t.title)}</a>`).join('')}</div>` : ''}
        <div class="where ${store ? 'store' : ''}">${store ? ICON.box : ICON.pin}<span>${store ? '<b>In the store</b> – can be viewed on request' : `<b>On display:</b> ${esc(o.location)}`}</span></div>
        ${room ? `<div class="planmini"><div class="planbox">${floorPlan({ highlight: room })}</div><a class="small" href="#/map">Open the full museum map →</a></div>` : ''}
        <div class="prose"><p>${esc(o.text || 'Description will follow.')}</p></div>
        <dl class="facts">
          <dt>Inventory number</dt><dd>${esc(o.id)}</dd>
          <dt>Department</dt><dd>${esc(o.dept)}</dd>
          <dt>Origin / maker</dt><dd>${esc(o.origin || '–')}</dd>
          <dt>Date</dt><dd>${esc(o.date || '–')}</dd>
          <dt>Material</dt><dd>${esc(o.material || '–')}</dd>
          <dt>Dimensions</dt><dd>${esc(o.dims || '–')}</dd>
          <dt>Location</dt><dd>${esc(o.location || '–')}</dd>
        </dl>
        <div class="eyebrow" style="margin-bottom:10px">Planned for this record</div>
        <div class="future">
          <div><span class="chip plan">Phase 2</span><b>Audio guide</b><span class="muted">English &amp; Setswana narration</span></div>
          <div><span class="chip plan">Phase 2</span><b>3D model &amp; AR</b><span class="muted">From the digitisation programme</span></div>
          <div><span class="chip plan">Phase 2</span><b>Gallery display</b><span class="muted">Same record on touch screens</span></div>
        </div>
      </div>
    </div>
  </div>
  <section class="bg-mist">
    <div class="wrap labelwrap">
      <div>
        <div class="eyebrow" style="margin-bottom:10px">In the gallery</div>
        <h2 class="h2" style="margin-bottom:14px">One label, one QR code, one record</h2>
        <p class="lede" style="margin:0 0 22px">Every object gets a printed label with a QR code. Visitors scan it with their phone camera and land on this page – no app, no login. Because the page is loaded from the collection database, corrections by staff are visible immediately.</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn" type="button" data-act="scan" data-id="${o.id}">Simulate visitor scan</button><button class="btn ghost" type="button" data-act="label" data-id="${o.id}">Print label</button></div>
        <p class="small muted" style="margin-top:16px;word-break:break-all">QR links to: ${esc(url)}</p>
      </div>
      ${objLabel(o, url)}
    </div>
  </section>
  ${related.length ? `<section><div class="wrap"><div class="sec-head"><div><div class="eyebrow">More from the collection</div><h2 class="h2">${esc(o.dept)}</h2></div><a class="btn ghost small arrow" href="#/collection" data-act="dept-link" data-v="${esc(o.dept)}">All ${esc(o.dept)} objects </a></div><div class="objgrid">${related.map(objCard).join('')}</div></div></section>` : ''}`;
}

/* ---------------- modals ---------------- */
function openModal(html, label) {
  closeModal();
  store.lastFocus = document.activeElement;
  document.body.insertAdjacentHTML('beforeend', `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(label)}" id="modal">${html}</div>`);
  document.body.style.overflow = 'hidden';
  const f = $('#modal [data-act="close"]'); if (f) f.focus();
}
function closeModal() {
  store.LB = { id: null, i: 0 }; store.TOURSTATE = { id: null, i: 0 };
  const m = $('#modal'); if (!m) return;
  m.remove(); document.body.style.overflow = '';
  if (store.lastFocus && document.contains(store.lastFocus)) store.lastFocus.focus();
}
function openLabel(id) {
  const o = byId(id); if (!o) return; const url = objectURL(o.id);
  openModal(`<div class="box">
    <button class="iconbtn close noprint" type="button" data-act="close" aria-label="Close">${ICON.close}</button>
    <div class="eyebrow noprint">QR label · print and place next to the object</div>
    <h2 class="h3 noprint" style="margin:6px 0 20px">${esc(o.title)}</h2>
    ${objLabel(o, url)}
    <p class="small muted noprint" style="margin:16px 0;word-break:break-all">QR links to: ${esc(url)}</p>
    <div class="noprint" style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn" type="button" data-act="print">Print label</button><button class="btn ghost" type="button" data-act="scan" data-id="${o.id}">Simulate visitor scan</button><a class="btn ghost" href="#/object/${o.id}">Open object page</a></div>
  </div>`, 'QR label');
}
function openScan(id) {
  const o = byId(id); if (!o) return; const url = objectURL(o.id);
  store.S.scans[id] = (store.S.scans[id] || 0) + 1; save();
  openModal(`<div class="phonewrap">
    <div class="explain">
      <div class="eyebrow" style="color:#9FC7E4">In the gallery</div>
      <h2>What a visitor sees after scanning</h2>
      <ol><li>The visitor points the phone camera at the QR code on the label.</li><li>The object page opens in the browser – no app, no login.</li><li>Content comes live from the collection database, so staff edits appear immediately.</li></ol>
      <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn sky" type="button" data-act="close">Close</button><button class="btn ghost" type="button" data-act="scan" data-id="${o.id}" style="color:#fff;border-color:#fff">Scan again</button></div>
    </div>
    <div class="phone">
      <div class="scanning" id="scanning"><div><div class="frame">${qrSVG(url)}</div><p>Scanning label …</p></div></div>
      <div class="screen">
        <div class="urlbar"><span>${esc(url.replace(/^https?:\/\//, ''))}</span></div>
        <div class="scroll">
          <div class="mhead"><span class="brand">${emblem()}<b>National Museum</b></span><span class="langs small"><b>EN</b><span class="muted">TN</span></span></div>
          <div class="mstrip" id="mstrip">${viewsOf(o).map((v) => `<div class="mslide">${v.html}</div>`).join('')}</div>
          <div class="mdots" id="mdots">${viewsOf(o).map((_, i) => `<i class="${i === 0 ? 'on' : ''}"></i>`).join('')}</div>
          <div class="mbody">
            <div class="eyebrow">${esc(o.dept)} · ${esc(o.id)}</div>
            <h3>${esc(o.title)}</h3>
            <div class="audio"><i>▶</i><span>Listen in Setswana or English<br><span style="opacity:.7">Audio guide · planned</span></span></div>
            <dl><dt>Date</dt><dd>${esc(o.date || '–')}</dd><dt>Material</dt><dd>${esc(o.material || '–')}</dd><dt>Origin</dt><dd>${esc(o.origin || '–')}</dd></dl>
            <p>${esc(o.text || '')}</p>
            <a class="btn small" href="#/tickets" style="margin-top:6px">Book a guided tour</a>
          </div>
        </div>
      </div>
    </div>
  </div>`, 'Visitor scan simulation');
  const sc = $('#scanning');
  setTimeout(() => { if (sc) { sc.style.opacity = '0'; setTimeout(() => sc.remove(), 400); } }, 1400);
  const strip = $('#mstrip');
  if (strip) strip.addEventListener('scroll', () => {
    const i = Math.round(strip.scrollLeft / strip.clientWidth);
    document.querySelectorAll('#mdots i').forEach((d, j) => d.classList.toggle('on', j === i));
  });
}

/* ---------------- staff area ---------------- */
store.SB = { date: nextDays(14).find((k) => hoursFor(k)) || dkey(new Date()) };
function staffShell(tab, inner) {
  const tabs = [['staff', 'Objects', `(${store.S.objects.length})`], ['staff/add', 'Add object', ''], ['staff/bookings', 'Bookings & time slots', `(${store.S.bookings.length})`], ['staff/stats', 'Scan statistics', '']];
  return `<div class="staffbar"><div class="wrap"><div><b>Staff area</b> · Collection &amp; visitor management</div><div class="who">Signed in as: Curator (demo account) · <a href="#/" style="color:#fff">Back to website</a></div></div></div>
  <div class="wrap" style="padding-block:24px 80px">
    <nav class="tabs" aria-label="Staff sections">${tabs.map(([h, l, c]) => `<a href="#/${h}" class="${tab === h ? 'on' : ''}">${l} <span class="muted">${c}</span></a>`).join('')}</nav>
    ${inner}
  </div>`;
}
function pageStaffObjects() {
  const list = [...store.S.objects].sort((a, b) => b.added - a.added);
  const today = dkey(new Date());
  const todayVis = slotHours(today).reduce((a, h) => a + taken(today, h), 0);
  const inner = `
    <div class="kpis">
      <div><b>${store.S.objects.length}</b><span>objects in the database</span></div>
      <div><b>${published().length}</b><span>published online</span></div>
      <div><b>${store.S.objects.filter((o) => o.status === 'draft').length}</b><span>drafts</span></div>
      <div><b>${todayVis}</b><span>visitors booked today</span></div>
    </div>
    <div class="sec-head" style="margin-bottom:16px"><h2 class="h3">Object records</h2><a class="btn" href="#/staff/add">+ Add object</a></div>
    <div class="tablewrap"><table class="data">
      <thead><tr><th></th><th>Inventory no.</th><th>Title</th><th>Department</th><th>Location</th><th>Status</th><th style="text-align:right">Actions</th></tr></thead>
      <tbody>${list.map((o) => `<tr class="${o.seed ? '' : 'new'}">
        <td><div class="thumb">${pic(o)}</div></td>
        <td class="inv">${esc(o.id)}</td>
        <td><b>${esc(o.title)}</b>${o.seed ? '' : ' <span class="chip dev">New</span>'}</td>
        <td>${esc(o.dept)}</td>
        <td class="small">${esc(o.location || '–')}</td>
        <td>${o.status === 'published' ? '<span class="chip live dot">Published</span>' : '<span class="chip draft dot">Draft</span>'}</td>
        <td><div class="actions"><a href="#/object/${o.id}">View</a><button class="btn link" type="button" data-act="label" data-id="${o.id}">QR label</button><a href="#/staff/edit/${o.id}">Edit</a><button class="btn link" type="button" data-act="del" data-id="${o.id}" style="color:var(--full)">Delete</button></div></td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  return staffShell('staff', inner);
}
function nextInv(dept) {
  const code = deptCode(dept);
  const nums = store.S.objects.filter((o) => o.id.startsWith(`BNM-${code}-`)).map((o) => parseInt(o.id.split('-')[2], 10) || 0);
  return `BNM-${code}-${pad(Math.max(0, ...nums) + 1).padStart(4, '0')}`;
}
function pageStaffForm(editId) {
  const o = editId ? byId(editId) : null;
  if (editId && !o) return pageNotFound();
  store.formImages = o ? (o.images || (o.image ? [o.image] : [])).slice() : [];
  store.formImage = store.formImages[0] || null;
  const v = o || { title: '', dept: 'Ethnography', origin: '', date: '', material: '', dims: '', location: LOCATIONS[2], text: '', status: 'published' };
  const inner = `
    <div class="addform">
      <form id="objform" novalidate>
        <h2 class="h3" style="margin-bottom:6px">${o ? 'Edit object record' : 'Add a new object'}</h2>
        <p class="muted" style="margin:0 0 24px">${o ? 'Changes go live on the website and behind the QR code as soon as you save.' : 'Fill in what you know – you can add more details later. A QR label is created automatically.'}</p>
        <div class="formgrid">
          <div class="field full"><label for="o-title">Title *</label><input id="o-title" type="text" value="${esc(v.title)}" placeholder="e.g. Beaded apron" required></div>
          <div class="field"><label for="o-dept">Department *</label><select id="o-dept" ${o ? 'disabled' : ''}>${DEPTS.map((d) => `<option ${v.dept === d.key ? 'selected' : ''}>${d.key}</option>`).join('')}</select></div>
          <div class="field"><label for="o-inv">Inventory number</label><input id="o-inv" type="text" value="${esc(o ? o.id : nextInv(v.dept))}" readonly><span class="hint">Assigned automatically</span></div>
          <div class="field"><label for="o-origin">Origin / maker</label><input id="o-origin" type="text" value="${esc(v.origin)}" placeholder="Community, place or artist"></div>
          <div class="field"><label for="o-date">Date / period</label><input id="o-date" type="text" value="${esc(v.date)}" placeholder="e.g. c. 1960"></div>
          <div class="field"><label for="o-material">Material</label><input id="o-material" type="text" value="${esc(v.material)}"></div>
          <div class="field"><label for="o-dims">Dimensions</label><input id="o-dims" type="text" value="${esc(v.dims)}" placeholder="e.g. H 30 cm"></div>
          <div class="field full"><label for="o-loc">Location in the museum</label><select id="o-loc">${LOCATIONS.map((l) => `<option ${v.location === l ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
          <div class="field full"><label for="o-text">Description for visitors</label><textarea id="o-text" placeholder="2–4 sentences in plain English. A Setswana version can be added later.">${esc(v.text)}</textarea></div>
          <div class="field full"><span class="label">Photos</span>
            <label class="upload" for="o-img"><b>Upload photos</b><span class="small muted">JPG or PNG · several at once · resized automatically · the first one is the main image</span><span class="btn ghost small">Choose files</span></label>
            <input id="o-img" type="file" accept="image/*" multiple class="sr-only">
            <div class="uplist" id="uplist"></div>
          </div>
          <fieldset class="field full" style="border:0;padding:0;margin:0"><legend class="label" style="margin-bottom:8px">Visibility</legend>
            <label class="check"><input type="radio" name="o-status" value="published" ${v.status === 'published' ? 'checked' : ''}><span><b>Publish now</b> – visible in Collection Online and behind the QR code</span></label>
            <label class="check" style="margin-top:8px"><input type="radio" name="o-status" value="draft" ${v.status === 'draft' ? 'checked' : ''}><span><b>Save as draft</b> – only visible to staff</span></label>
          </fieldset>
        </div>
        <div class="navrow"><a class="btn ghost" href="#/staff">Cancel</a><button class="btn" type="submit">${o ? 'Save changes' : 'Save &amp; create QR label'}</button></div>
      </form>
      <aside class="preview" aria-label="Live preview"><div class="eyebrow">Live preview</div><div id="pv"></div></aside>
    </div>`;
  return staffShell(o ? 'staff' : 'staff/add', inner);
}
function readForm() {
  const g = (id) => ($(id) ? $(id).value.trim() : '');
  const dept = $('#o-dept').value;
  return { title: g('#o-title'), dept, id: g('#o-inv'), origin: g('#o-origin'), date: g('#o-date'), material: g('#o-material'), dims: g('#o-dims'), location: $('#o-loc').value, text: g('#o-text'), status: (document.querySelector('input[name="o-status"]:checked') || {}).value || 'published', images: store.formImages.slice() };
}
function updatePreview() {
  const f = readForm(); const tmp = { ...f, title: f.title || 'Untitled object', art: 'generic', images: store.formImages };
  $('#pv').innerHTML = `<div class="card">${objCard(tmp).replace('<a class="objcard"', '<div class="objcard"').replace(/<\/a>\s*$/, '</div>')}</div>${objLabel(tmp, objectURL(f.id))}`;
  const list = $('#uplist');
  if (list) list.innerHTML = store.formImages.length
    ? store.formImages.map((src, i) => `<div class="upitem"><img src="${src}" alt=""><button type="button" class="btn link" data-act="rm-img" data-i="${i}">Remove</button>${i === 0 ? '<span class="chip">Main</span>' : ''}</div>`).join('')
    : '<p class="small muted" style="margin:0">No photos yet – the prototype shows a placeholder illustration until the museum uploads one.</p>';
}
function submitForm(editId) {
  const f = readForm();
  if (!f.title) { $('#o-title').setAttribute('aria-invalid', 'true'); $('#o-title').focus(); toast('Please enter a title.'); return; }
  let o = editId ? byId(editId) : null;
  if (o) { Object.assign(o, { title: f.title, origin: f.origin, date: f.date, material: f.material, dims: f.dims, location: f.location, text: f.text, status: f.status, images: store.formImages.slice(), image: null, onDisplay: !f.location.startsWith('Store') }); }
  else {
    o = { id: nextInv(f.dept), art: 'generic', dept: f.dept, title: f.title, origin: f.origin, date: f.date, material: f.material, dims: f.dims, location: f.location, text: f.text, status: f.status, images: store.formImages.slice(), onDisplay: !f.location.startsWith('Store'), added: Date.now(), seed: false };
    store.S.objects.push(o);
  }
  const ok = save();
  store.PENDING = () => {
    toast(ok ? `“${o.title}” ${o.status === 'published' ? 'is live' : 'saved as draft'} · QR label ready` : 'Saved for this session (browser storage is full or blocked).');
    openLabel(o.id);
  };
  location.hash = '#/staff';
}
function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => { const img = new Image(); img.onload = () => { const max = 900; const s = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); resolve(c.toDataURL('image/jpeg', 0.82)); }; img.onerror = reject; img.src = r.result; };
    r.onerror = reject; r.readAsDataURL(file);
  });
}
function pageStaffBookings() {
  const days = nextDays(14);
  const k = store.SB.date;
  const hours = slotHours(k);
  const sum = (fn) => hours.reduce((a, h) => a + fn(h), 0);
  const cap = hours.length * CAPACITY; const tot = sum((h) => taken(k, h)); const onl = sum((h) => onlineOcc(k, h));
  const tours = store.S.bookings.filter((b) => b.date === k).reduce((a, b) => a + b.q.tour, 0);
  const bars = hours.length ? hours.map((h) => {
    const s = sampleOcc(k, h); const o = onlineOcc(k, h); const sw = Math.min(100, (s / CAPACITY) * 100); const ow = Math.min(100 - sw, (o / CAPACITY) * 100);
    return `<div class="capbar"><b class="tnum">${hh(h)}</b><div class="bar" role="img" aria-label="${s + o} of ${CAPACITY} places booked"><i style="width:${sw}%"></i><i class="online" style="width:${ow}%"></i></div><span class="n">${Math.min(CAPACITY, s + o)} / ${CAPACITY}</span></div>`;
  }).join('') : '<p class="muted">The museum is closed on this day.</p>';
  const rows = [...store.S.bookings].sort((a, b) => b.created - a.created);
  const inner = `
    <div class="days" role="group" aria-label="Day" style="margin-bottom:24px">${days.map((d) => { const dt = fromKey(d); const closed = !hoursFor(d); return `<button type="button" class="day" data-act="sday" data-k="${d}" aria-pressed="${d === k}" ${closed ? 'disabled' : ''}><small>${dt.toLocaleDateString('en-GB', { weekday: 'short' })}</small><b>${dt.getDate()}</b><em>${closed ? 'Closed' : d === dkey(new Date()) ? 'Today' : holiday(d) ? `<span class="hol">${esc(holiday(d))}</span>` : dt.toLocaleDateString('en-GB', { month: 'short' })}</em></button>`; }).join('')}</div>
    <div class="kpis">
      <div><b>${tot}</b><span>visitors booked on ${esc(fmtDate(k, { weekday: 'short', day: 'numeric', month: 'short' }))}</span></div>
      <div><b>${cap ? Math.round((tot / cap) * 100) : 0}%</b><span>of ${cap} places filled</span></div>
      <div><b>${onl}</b><span>from your demo bookings</span></div>
      <div><b>${tours}</b><span>guided-tour participants</span></div>
    </div>
    <div class="twocol">
      <div>
        <h2 class="h3">Time slots</h2>
        <div class="legend"><span><i style="background:var(--sky)"></i>Sample bookings</span><span><i style="background:var(--deep)"></i>Booked in this demo</span></div>
        ${bars}
      </div>
      <div>
        <h2 class="h3" style="margin-bottom:14px">Online bookings</h2>
        ${rows.length ? `<div class="tablewrap"><table class="data" style="min-width:520px"><thead><tr><th>Code</th><th>Visit</th><th>Name</th><th>Visitors</th><th style="text-align:right">Entry</th></tr></thead><tbody>${rows.map((b) => `<tr><td class="inv"><b>${b.code}</b></td><td class="small">${esc(fmtDate(b.date, { weekday: 'short', day: 'numeric', month: 'short' }))}, ${hh(b.hour)}</td><td>${esc(b.name)}</td><td class="tnum">${b.visitors}${b.q.tour ? ` <span class="chip">${b.q.tour} tour</span>` : ''}</td><td style="text-align:right">${b.checkedIn ? '<span class="chip live dot">Checked in</span>' : `<button class="btn small ghost" type="button" data-act="checkin" data-code="${b.code}">Check in</button>`}</td></tr>`).join('')}</tbody></table></div>`
          : `<div class="empty" style="text-align:left;padding:24px;border:1px dashed #AEB7BF"><p style="margin:0 0 14px">No online bookings yet. Book a time slot on the website and it appears here instantly.</p><a class="btn small" href="#/tickets">Open ticket shop</a></div>`}
      </div>
    </div>`;
  return staffShell('staff/bookings', inner);
}

/* ---------------- toast ---------------- */
function toast(msg) {
  const old = $('.toast'); if (old) old.remove();
  document.body.insertAdjacentHTML('beforeend', `<div class="toast" role="status">${esc(msg)}</div>`);
  clearTimeout(store.toastTimer); store.toastTimer = setTimeout(() => { const t = $('.toast'); if (t) t.remove(); }, 3600);
}

/* ---------------- router ---------------- */
function route() {
  const h = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  const [a = '', b = '', c = ''] = h.split('/');
  closeModal();
  const nav = $('#mainnav'); nav.classList.remove('open');
  $('#searchbar').hidden = true;
  let html; let title = 'Home'; let after = null;
  switch (a) {
    case '': html = pageHome(); break;
    case 'visit': html = pageVisit(); title = 'Visit'; break;
    case 'exhibitions': html = pageExhibitions(); title = 'Exhibitions'; break;
    case 'events': html = pageEvents(); title = 'Events'; break;
    case 'tickets': if (store.T.step === 4) store.T = newT(); html = pageTickets(); title = 'Tickets'; break;
    case 'collection': html = pageCollection(); title = 'Collection Online'; after = renderResults; break;
    case 'map': html = pageMap(); title = 'Museum map'; break;
    case 'tours': html = pageTours(); title = 'Tours'; break;
    case 'tour': html = pageTour(b); title = (tourById(b) || {}).title || 'Tour'; break;
    case 'object': html = pageObject(b); title = (byId(b) || {}).title || 'Object'; break;
    case 'staff':
      if (b === 'add') { html = pageStaffForm(null); after = () => bindForm(null); title = 'Add object'; }
      else if (b === 'edit') { html = pageStaffForm(c); after = () => bindForm(c); title = 'Edit object'; }
      else if (b === 'bookings') { html = pageStaffBookings(); title = 'Bookings'; }
      else if (b === 'stats') { html = pageStaffStats(); title = 'Scan statistics'; after = bindTips; }
      else { html = pageStaffObjects(); title = 'Staff area'; }
      break;
    case 'page': html = pagePlaceholder(b); title = (PAGES[b] || {}).t || 'Page'; break;
    default: html = pageNotFound(); title = 'Not found';
  }
  $('#app').innerHTML = html;
  if (after) after();
  document.title = `${title} · Botswana National Museum (Prototype)`;
  document.querySelectorAll('[data-nav]').forEach((el) => el.classList.toggle('on', el.dataset.nav === a || (a === 'object' && el.dataset.nav === 'collection') || (a === 'page' && el.dataset.nav === `page/${b}`)));
  document.querySelectorAll('[data-pb]').forEach((el) => el.classList.toggle('on', el.dataset.pb === a));
  window.scrollTo(0, 0);
  if (store.PENDING) { const p = store.PENDING; store.PENDING = null; p(); }
}
function bindForm(editId) {
  const form = $('#objform'); if (!form) return;
  form.addEventListener('input', (e) => { if (e.target.id === 'o-title') e.target.removeAttribute('aria-invalid'); updatePreview(); });
  form.addEventListener('change', async (e) => {
    if (e.target.id === 'o-dept') $('#o-inv').value = nextInv(e.target.value);
    if (e.target.id === 'o-img' && e.target.files.length) {
      for (const file of Array.from(e.target.files).slice(0, 4)) {
        try { store.formImages.push(await resizeImage(file)); } catch (err) { toast('One file could not be read. Please choose JPG or PNG.'); }
      }
      e.target.value = '';
    }
    updatePreview();
  });
  form.addEventListener('submit', (e) => { e.preventDefault(); submitForm(editId); });
  updatePreview();
}

/* ---------------- events ---------------- */
document.addEventListener('click', (e) => {
  /* Handle in-page links ourselves: some preview frames turn a plain
     fragment link into a navigation of the surrounding page. */
  if (!e.defaultPrevented && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0) {
    const a = e.target.closest('a[href^="#"]');
    if (a && !a.hasAttribute('target')) {
      e.preventDefault();
      const to = a.getAttribute('href');
      if (to !== location.hash) { location.hash = to; if (location.hash !== to) { history.replaceState(null, '', to); route(); } }
      else route();
    }
  }
  const t = e.target.closest('[data-act]');
  if (!t) { if (e.target.id === 'modal') closeModal(); return; }
  const act = t.dataset.act;
  switch (act) {
    case 'reset':
      if (confirm('Reset the prototype? Added objects, demo bookings and demo scans will be removed.')) { store.S = fresh(); save(); store.T = newT(); store.CQ = { q: '', dept: 'All', display: false, sort: 'inv', room: 'All' }; route(); toast('Demo data reset.'); }
      break;
    case 'lang-tn': toast('Setswana version is planned for phase 2 – Re a leboga!'); break;
    case 'toast': toast(t.dataset.msg); break;
    case 'search-toggle': { const sb = $('#searchbar'); sb.hidden = !sb.hidden; if (!sb.hidden) $('#topq').focus(); break; }
    case 'menu': $('#mainnav').classList.toggle('open'); break;
    case 'close': closeModal(); break;
    case 'scan': openScan(t.dataset.id); break;
    case 'view': {
      const o = byId(t.dataset.id); if (!o) break;
      const i = Number(t.dataset.i); const v = viewsOf(o)[i]; if (!v) break;
      $('#mainpic').innerHTML = `${v.html}<button class="zoombtn" type="button" data-act="light" data-id="${o.id}" data-i="${i}">Enlarge</button>`;
      $('#viewcap').textContent = `${v.cap} · ${viewsOf(o).length} images`;
      document.querySelectorAll('.thumb').forEach((el) => el.setAttribute('aria-pressed', el === t));
      break;
    }
    case 'light': openLight(t.dataset.id, Number(t.dataset.i)); break;
    case 'lb': { const o = byId(store.LB.id); if (!o) break; const n = viewsOf(o).length; openLight(store.LB.id, (store.LB.i + Number(t.dataset.d) + n) % n); break; }
    case 'tour-start': openTour(t.dataset.id, 0); break;
    case 'tour-go': openTour(store.TOURSTATE.id, store.TOURSTATE.i + Number(t.dataset.d)); break;
    case 'close-nav': closeModal(); break;
    case 'label': openLabel(t.dataset.id); break;
    case 'print': document.body.classList.add('printing'); window.print(); setTimeout(() => document.body.classList.remove('printing'), 500); break;
    case 'day': store.T.date = t.dataset.k; store.T.hour = null; store.T.q.tour = 0; tkRerender(); break;
    case 'slot': store.T.hour = Number(t.dataset.h); if (!TOUR_TIMES.includes(store.T.hour)) store.T.q.tour = 0; tkRerender(); break;
    case 'qty': {
      const k = t.dataset.k; store.T.q[k] = Math.max(0, store.T.q[k] + Number(t.dataset.d));
      if (store.T.q.tour > visitorsOf(store.T.q)) store.T.q.tour = visitorsOf(store.T.q);
      tkRerender(); break;
    }
    case 'tk-next': store.T.step += 1; tkRerender(true); break;
    case 'tk-back':
      if (store.T.step === 3) { store.T.name = $('#f-name').value; store.T.email = $('#f-email').value; store.T.phone = $('#f-phone').value; store.T.country = $('#f-country').value; store.T.agree = $('#f-agree').checked; }
      store.T.step -= 1; store.T.err = {}; tkRerender(true); break;
    case 'tk-confirm': tkConfirm(); break;
    case 'tk-new': store.T = newT(); tkRerender(true); break;
    case 'dept': store.CQ.dept = t.dataset.v; renderResults(); break;
    case 'dept-link': store.CQ = { q: '', dept: t.dataset.v, display: false, sort: 'inv', room: 'All' }; break;
    case 'room': store.CQ = { q: '', dept: 'All', display: false, sort: 'inv', room: t.dataset.id }; if (location.hash === '#/collection') route(); else location.hash = '#/collection'; break;
    case 'display': store.CQ.display = !store.CQ.display; renderResults(); break;
    case 'clear-search': store.CQ = { q: '', dept: 'All', display: false, sort: 'inv', room: 'All' }; $('#cq').value = ''; if ($('#locf')) $('#locf').value = 'All'; renderResults(); break;
    case 'del': {
      const o = byId(t.dataset.id);
      if (o && confirm(`Delete “${o.title}” (${o.id})? Its QR code will stop working.`)) { store.S.objects = store.S.objects.filter((x) => x.id !== o.id); save(); route(); toast(`Deleted ${o.id}.`); }
      break;
    }
    case 'rm-img': store.formImages.splice(Number(t.dataset.i), 1); updatePreview(); break;
    case 'checkin': { const b = store.S.bookings.find((x) => x.code === t.dataset.code); if (b) { b.checkedIn = true; save(); $('#app').innerHTML = pageStaffBookings(); toast(`${b.code} checked in · ${b.visitors} visitor${b.visitors > 1 ? 's' : ''}`); } break; }
    case 'sday': store.SB.date = t.dataset.k; $('#app').innerHTML = pageStaffBookings(); break;
    default: break;
  }
});
document.addEventListener('submit', (e) => {
  const f = e.target;
  if (f.id === 'topsearch' || f.id === 'teasersearch') {
    e.preventDefault(); const q = (f.querySelector('input').value || '').trim();
    store.CQ = { q, dept: 'All', display: false, sort: 'inv' };
    if (location.hash === '#/collection') route(); else location.hash = '#/collection';
  } else if (f.id === 'colsearch') {
    e.preventDefault(); store.CQ.q = $('#cq').value.trim(); renderResults();
  } else if (f.dataset.actSubmit === 'newsletter') {
    e.preventDefault(); toast('Newsletter sign-up is part of the full website – not active in the prototype.');
  }
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'cq') { store.CQ.q = e.target.value.trim(); renderResults(); }
  if (store.T.step === 3 && e.target.id && e.target.id.startsWith('f-')) {
    const m = { 'f-name': 'name', 'f-email': 'email', 'f-phone': 'phone' }; if (m[e.target.id]) store.T[m[e.target.id]] = e.target.value;
  }
});
document.addEventListener('change', (e) => {
  if (e.target.id === 'sort') { store.CQ.sort = e.target.value; renderResults(); }
  if (e.target.id === 'locf') { store.CQ.room = e.target.value; renderResults(); }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
  if (!$('#modal')) return;
  if (store.LB.id && $('.lightbox')) {
    const n = viewsOf(byId(store.LB.id)).length;
    if (e.key === 'ArrowRight') openLight(store.LB.id, (store.LB.i + 1) % n);
    if (e.key === 'ArrowLeft') openLight(store.LB.id, (store.LB.i - 1 + n) % n);
  } else if (store.TOURSTATE.id && $('.tournav')) {
    if (e.key === 'ArrowRight') openTour(store.TOURSTATE.id, store.TOURSTATE.i + 1);
    if (e.key === 'ArrowLeft') openTour(store.TOURSTATE.id, store.TOURSTATE.i - 1);
  }
});
window.addEventListener('hashchange', route);
window.addEventListener('afterprint', () => document.body.classList.remove('printing'));

shell();
route();
