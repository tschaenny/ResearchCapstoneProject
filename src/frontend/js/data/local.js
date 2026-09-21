/* localStorage persistence: the whole prototype state under one key. */
import { SEED_OBJECTS } from './seed.js';
import { store } from '../state/store.js';

/* ---------------- state ---------------- */
export const LS = 'bnm-prototype-v1';
export const fresh = () => ({ objects: SEED_OBJECTS.map((o) => ({ ...o })), bookings: [], scans: {} });
export function load() { try { const raw = localStorage.getItem(LS); if (raw) { const s = JSON.parse(raw); if (s && Array.isArray(s.objects) && Array.isArray(s.bookings)) {
        s.scans = s.scans || {};
        s.objects.forEach((o) => { if (!o.images) o.images = o.image ? [o.image] : []; });
        return s;
      } } } catch (e) { /* storage unavailable */ } return null; }
store.S = load() || fresh();
export function save() { try { localStorage.setItem(LS, JSON.stringify(store.S)); return true; } catch (e) { return false; } }
