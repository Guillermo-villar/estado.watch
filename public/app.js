'use strict';

const byId = (id) => document.getElementById(id);
const timeZone = 'Europe/Madrid';
const dateKey = new Intl.DateTimeFormat('sv-SE', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
const dayShort = new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', day: 'numeric', month: 'short' });
const dayFull = new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' });
const dayCompact = new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });
const dateTime = new Intl.DateTimeFormat('es-ES', { timeZone, dateStyle: 'short', timeStyle: 'short' });
const timeOnly = new Intl.DateTimeFormat('es-ES', { timeZone, timeStyle: 'short' });
const percent = new Intl.NumberFormat('es-ES', { style: 'percent', maximumFractionDigits: 2 });
const number = new Intl.NumberFormat('es-ES');
const labels = { up: 'Operativo', down: 'Incidencia', unknown: 'Sin confirmar' };

const list = byId('service-list');
const filters = byId('filters');
const stateFilter = byId('state');
const query = byId('query');
const refresh = byId('refresh');
const notice = byId('feed-notice');
const dialog = byId('detail');

let dataset;
let reports = [];
let sites = [];
let days = [];
let selectedId;
let pending = false;
let timer;
const openSites = new Set();

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/* Porcentaje sin redondear un 99,996 % a «100 %»: solo es 100 % si no hubo fallos. */
function rate(up, down) {
  const total = up + down;
  if (!total) return null;
  const value = up / total;
  return percent.format(down ? Math.min(value, 0.9999) : value);
}

function plural(n, one, many) {
  return `${number.format(n)} ${n === 1 ? one : many}`;
}

function sinceLabel(since, compact = false) {
  const day = new Date(`${since}T12:00:00Z`);
  return `desde ${(compact ? dayCompact : dayFull).format(day)}`;
}

function validLifetime(value) {
  if (!value || typeof value !== 'object' || !/^\d{4}-\d{2}-\d{2}$/.test(value.since)) return null;
  const ok = ['up', 'down', 'unknown'].every((key) => Number.isFinite(value[key]) && value[key] >= 0);
  return ok ? { since: value.since, up: value.up, down: value.down, unknown: value.unknown } : null;
}

/* Suma ponderada por mediciones de varios históricos; «since» es el más antiguo. */
function mergeLifetimes(items) {
  let total = null;
  for (const item of items) {
    if (!item) continue;
    if (!total) total = { since: item.since, up: 0, down: 0, unknown: 0 };
    if (item.since < total.since) total.since = item.since;
    total.up += item.up;
    total.down += item.down;
    total.unknown += item.unknown;
  }
  return total;
}

function webAddress(value) {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    if (['https:', 'http:'].includes(url.protocol)) return url;
  } catch {
    return undefined;
  }
}

function dateWindow(now) {
  const last = new Date(`${dateKey.format(now)}T12:00:00Z`);
  return Array.from({ length: 30 }, (_, index) => {
    const day = new Date(last);
    day.setUTCDate(last.getUTCDate() - (29 - index));
    return { key: day.toISOString().slice(0, 10), short: dayShort.format(day), full: dayFull.format(day) };
  });
}

function emptyCounts() {
  return new Map(days.map((day) => [day.key, { up: 0, down: 0, unknown: 0 }]));
}

function summarize(service, now) {
  const counts = emptyCounts();
  let latest;
  let latestTime = 0;
  for (const sample of service.samples) {
    const time = Date.parse(sample.at);
    if (!Number.isFinite(time) || time > now) continue;
    if (time >= latestTime) {
      latest = sample;
      latestTime = time;
    }
    if (service.daily) continue;
    const day = counts.get(dateKey.format(time));
    if (!day) continue;
    if (sample.state === 'up') day.up++;
    else if (sample.state === 'down') day.down++;
    else day.unknown++;
  }
  for (const day of Array.isArray(service.daily) ? service.daily : []) {
    if (counts.has(day.day)) counts.set(day.day, { up: +day.up || 0, down: +day.down || 0, unknown: +day.unknown || 0 });
  }
  for (const key of service.longOutageDays || []) {
    if (counts.has(key)) counts.get(key).longOutage = true;
  }
  const recent = totals(counts);
  const stale = Boolean(latest) && now - latestTime > dataset.intervalSeconds * 2000;
  const current = !latest || stale || !Object.hasOwn(labels, latest.state) ? 'unknown' : latest.state;
  return { service, counts, recent, latest, latestTime, stale, current, lifetime: validLifetime(service.lifetime) };
}

function totals(counts) {
  const sum = { up: 0, down: 0, unknown: 0 };
  for (const value of counts.values()) {
    sum.up += value.up;
    sum.down += value.down;
    sum.unknown += value.unknown;
  }
  return sum;
}

function groupSites() {
  const groups = new Map();
  for (const report of reports) {
    const { service } = report;
    const id = service.siteId || service.id;
    if (!groups.has(id)) {
      groups.set(id, {
        id,
        name: service.siteName || service.name,
        logo: service.siteLogo,
        domain: webAddress(service.siteUrl || service.url)?.hostname.replace(/^www\./, ''),
        reports: [],
      });
    }
    groups.get(id).reports.push(report);
  }
  for (const site of groups.values()) {
    site.counts = emptyCounts();
    for (const report of site.reports) {
      for (const [key, value] of report.counts) {
        const day = site.counts.get(key);
        day.up += value.up;
        day.down += value.down;
        if (value.longOutage) day.longOutage = true;
        day.unknown += value.unknown;
      }
    }
    site.recent = totals(site.counts);
    site.lifetime = mergeLifetimes(site.reports.map((report) => report.lifetime));
    const states = new Set(site.reports.map((report) => report.current));
    site.current = states.has('down') ? 'down' : states.has('unknown') ? 'unknown' : 'up';
    site.label = states.has('down')
      ? site.reports.length > 1 ? 'Incidencia parcial' : labels.down
      : states.has('unknown') && states.has('up') ? 'Parcial' : labels[site.current];
  }
  return [...groups.values()];
}

function describeDay({ up, down, unknown, longOutage }) {
  if (!up && !down) return unknown ? `${plural(unknown, 'no concluyente', 'no concluyentes')}` : 'Sin mediciones';
  const parts = [`${plural(up, 'correcta', 'correctas')}`, `${plural(down, 'fallo', 'fallos')}`];
  if (unknown) parts.push(plural(unknown, 'no concluyente', 'no concluyentes'));
  if (longOutage) parts.push('caída de más de 3 h');
  return parts.join(' · ');
}

function dayState(counts) {
  if (counts.longOutage) return 'down';
  return counts.down ? 'partial' : counts.up ? 'up' : 'unknown';
}

function pill(state, text) {
  const node = el('span', 'pill', text);
  node.dataset.state = state;
  return node;
}

function chevron() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'chev');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = '<path d="m8 5 5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>';
  return svg;
}

function lifetimeCell(lifetime) {
  const cell = el('span', 'lifetime');
  const label = el('span', 'label', 'Histórico');
  label.setAttribute('aria-hidden', 'true');
  cell.append(label);
  const value = lifetime ? rate(lifetime.up, lifetime.down) : null;
  const strong = el('strong', '', value || '—');
  strong.prepend(el('span', 'sr-only', 'Disponibilidad histórica: '));
  cell.append(strong);
  cell.append(el('small', '', lifetime ? sinceLabel(lifetime.since, true) : 'sin histórico'));
  return cell;
}

function chart(counts, recent) {
  const wrap = el('span', 'recent');
  const bars = el('span', 'bars');
  bars.setAttribute('aria-hidden', 'true');
  for (const day of days) {
    const value = counts.get(day.key);
    const bar = el('span', 'bar');
    bar.dataset.state = dayState(value);
    bar.title = `${day.full}: ${describeDay(value)}`;
    bars.append(bar);
  }
  const axis = el('span', 'axis');
  const start = el('span', '', days[0].short);
  const end = el('span', '', 'hoy');
  start.setAttribute('aria-hidden', 'true');
  end.setAttribute('aria-hidden', 'true');
  axis.append(start);
  if (recent) {
    const value = el('strong', '', rate(recent.up, recent.down) || 'sin datos');
    value.prepend(el('span', 'sr-only', 'Disponibilidad en los últimos 30 días: '));
    axis.append(value);
  }
  axis.append(end);
  wrap.append(bars, axis);
  return wrap;
}

function siteLogo(site) {
  const logo = el('span', 'site-logo');
  logo.setAttribute('aria-hidden', 'true');
  logo.append(site.name.trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase());
  if (typeof site.logo === 'string' && /^\/(?!\/)/.test(site.logo) && !site.logo.includes('\\')) {
    const img = el('img');
    img.alt = '';
    img.width = 36;
    img.height = 36;
    img.decoding = 'async';
    img.addEventListener('error', () => img.remove());
    img.src = site.logo;
    logo.append(img);
  }
  return logo;
}

function serviceRow(report) {
  const item = el('li');
  const button = el('button', 'row service');
  button.type = 'button';
  button.dataset.service = report.service.id;
  button.setAttribute('aria-haspopup', 'dialog');
  const who = el('span', 'who');
  const text = el('span', 'who-text');
  const name = report.service.name.includes(' · ') ? report.service.name.split(' · ').slice(1).join(' · ') : report.service.name;
  text.append(el('strong', '', name), el('span', '', webAddress(report.service.url)?.pathname.replace(/\/$/, '') || '/'));
  who.append(text);
  const status = report.current === 'unknown' && report.latest && !report.stale ? 'No concluyente' : labels[report.current];
  button.append(who, lifetimeCell(report.lifetime), chart(report.counts, report.recent), pill(report.current, status), chevron());
  item.append(button);
  return item;
}

function siteRow(site) {
  const item = el('li');
  const details = el('details', 'site');
  details.open = openSites.has(site.id);
  details.addEventListener('toggle', () => {
    if (details.open) openSites.add(site.id);
    else openSites.delete(site.id);
  });
  const summary = el('summary', 'row');
  summary.dataset.site = site.id;
  const who = el('span', 'who');
  const text = el('span', 'who-text');
  text.append(el('strong', '', site.name), el('span', '', [site.domain, plural(site.reports.length, 'servicio', 'servicios')].filter(Boolean).join(' · ')));
  who.append(siteLogo(site), text);
  summary.append(who, lifetimeCell(site.lifetime), chart(site.counts, site.recent), pill(site.current, site.label), chevron());
  const services = el('ul', 'services');
  services.setAttribute('aria-label', `Servicios de ${site.name}`);
  services.append(...site.reports.map(serviceRow));
  details.append(summary, services);
  item.append(details);
  return item;
}

function normalize(value) {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

function renderList(announce = false) {
  if (!dataset) return;
  const term = normalize(query.value.trim());
  const visible = sites.filter((site) => site.reports.some(({ service, current }) =>
    (!stateFilter.value || stateFilter.value === current)
    && (!term || normalize(`${site.name} ${site.domain || ''} ${service.name} ${service.category || ''}`).includes(term))));
  const focused = list.contains(document.activeElement) ? document.activeElement : undefined;
  if (visible.length) {
    const ul = el('ul', 'sites');
    ul.append(...visible.map(siteRow));
    list.replaceChildren(ul);
    if (focused) {
      const key = focused.dataset.site ? 'site' : 'service';
      const match = [...ul.querySelectorAll(`[data-${key}]`)].find((node) => node.dataset[key] === focused.dataset[key]);
      (match || query).focus({ preventScroll: true });
    }
  } else {
    list.replaceChildren(el('p', 'empty', reports.length ? 'Ninguna web coincide con el filtro.' : 'Todavía no hay servicios monitorizados.'));
    if (focused) query.focus({ preventScroll: true });
  }
  const count = visible.length === sites.length
    ? plural(sites.length, 'web', 'webs') + ' · ' + plural(reports.length, 'servicio', 'servicios')
    : `${number.format(visible.length)} de ${plural(sites.length, 'web', 'webs')}`;
  byId('visible-count').textContent = count;
  if (announce) byId('announcement').textContent = count;
}

function renderSummary() {
  const counts = { up: 0, down: 0, unknown: 0 };
  let latestTime = 0;
  for (const report of reports) {
    counts[report.current]++;
    latestTime = Math.max(latestTime, report.latestTime);
  }
  let title = 'Estado sin confirmar';
  let state = 'unknown';
  if (counts.down) {
    title = counts.down === 1 ? 'Un servicio con incidencia' : `${number.format(counts.down)} servicios con incidencia`;
    state = 'down';
  } else if (counts.up && !counts.unknown) {
    title = 'Todos los servicios operativos';
    state = 'up';
  } else if (counts.up) {
    title = 'Servicios operativos, alguno sin confirmar';
  }
  byId('overview').dataset.state = state;
  byId('overall').textContent = title;
  byId('overview-count').hidden = Boolean(latestTime);
  byId('overview-count').textContent = latestTime ? '' : 'Sin mediciones registradas';
  byId('updated').title = latestTime ? dateTime.format(latestTime) : '';
  byId('updated').textContent = latestTime ? `Actualizado ${timeOnly.format(latestTime)}` : '';

  const lifetime = mergeLifetimes(reports.map((report) => report.lifetime));
  byId('kpi-lifetime').textContent = (lifetime && rate(lifetime.up, lifetime.down)) || '—';
  byId('kpi-lifetime-note').textContent = lifetime
    ? `${sinceLabel(lifetime.since, true)} · ${plural(lifetime.up + lifetime.down, 'medición', 'mediciones')}`
    : 'Sin histórico todavía';

  const recent = totals(new Map(reports.map((report, i) => [i, report.recent])));
  byId('kpi-recent').textContent = rate(recent.up, recent.down) || '—';
  byId('kpi-recent-note').textContent = plural(recent.up + recent.down, 'medición', 'mediciones');

  byId('kpi-now').textContent = `${number.format(counts.up)}/${number.format(reports.length)}`;
  const nowNote = [];
  if (counts.down) nowNote.push(plural(counts.down, 'incidencia', 'incidencias'));
  if (counts.unknown) nowNote.push(`${number.format(counts.unknown)} sin confirmar`);
  byId('kpi-now-note').textContent = nowNote.join(' · ');
}

function renderDetail(report) {
  const { service, latest, latestTime, stale, counts, recent, lifetime } = report;
  byId('detail-name').textContent = service.name;
  const status = report.current === 'unknown' && latest && !stale ? 'No concluyente' : labels[report.current];
  byId('detail-status').replaceChildren(pill(report.current, status));

  byId('detail-lifetime').textContent = (lifetime && rate(lifetime.up, lifetime.down)) || '—';
  byId('detail-lifetime-note').textContent = lifetime
    ? `${sinceLabel(lifetime.since, true)} · ${plural(lifetime.up + lifetime.down, 'medición', 'mediciones')}`
    : 'Sin histórico';
  byId('detail-recent').textContent = rate(recent.up, recent.down) || '—';
  byId('detail-recent-note').textContent = plural(recent.up + recent.down, 'medición', 'mediciones');
  byId('detail-last').textContent = latest ? timeOnly.format(latestTime) : '—';
  const ms = latest && Number.isFinite(latest.ms) ? ` · ${number.format(latest.ms)} ms` : '';
  byId('detail-last-note').textContent = latest ? `${dayCompact.format(new Date(`${dateKey.format(latestTime)}T12:00:00Z`))}${ms}` : 'Sin mediciones';
  byId('detail-chart').replaceChildren(chart(counts));

  const note = byId('detail-note');
  note.textContent = [service.coverageNote, stale ? 'La última comprobación está desactualizada.' : '', typeof latest?.detail === 'string' ? `Última respuesta: ${latest.detail}.` : '']
    .filter(Boolean).join(' ');
  note.hidden = !note.textContent;

  const link = byId('detail-url');
  const url = webAddress(service.url);
  link.hidden = !url;
  if (url) link.href = url.href;
  else link.removeAttribute('href');
  byId('detail-target').hidden = !service.url && !service.marker;
  byId('target-url').textContent = service.url || '—';
  byId('marker-label').textContent = service.markerType === 'hex-prefix' ? 'Cabecera esperada (hexadecimal)' : 'Texto esperado';
  byId('marker-label').hidden = !service.marker;
  byId('target-marker').hidden = !service.marker;
  byId('target-marker').textContent = service.marker || '';

  const history = el('ul');
  for (const day of [...days].reverse()) {
    const item = el('li');
    const time = el('time', '', day.full);
    time.dateTime = day.key;
    item.append(time, el('span', '', describeDay(counts.get(day.key))));
    history.append(item);
  }
  byId('detail-history').replaceChildren(history);
}

function render() {
  const now = Date.now();
  days = dateWindow(now);
  reports = dataset.services.map((service) => summarize(service, now));
  sites = groupSites();
  renderSummary();
  filters.hidden = sites.length < 2;
  renderList();
  byId('interval-description').textContent = `El estado actual pasa a «sin confirmar» si la última comprobación no fue concluyente o tiene más de dos intervalos (${number.format(dataset.intervalSeconds / 60)} min cada uno).`;
  if (dialog.open) {
    const report = reports.find(({ service }) => service.id === selectedId);
    if (report) renderDetail(report);
    else dialog.close();
  }
}

async function load(announce = false) {
  if (pending) return;
  clearTimeout(timer);
  pending = true;
  refresh.setAttribute('aria-disabled', 'true');
  try {
    const response = await fetch('/api/status', { cache: 'no-store', signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const next = await response.json();
    if (!Number.isFinite(next?.intervalSeconds) || next.intervalSeconds <= 0 || !Array.isArray(next.services)) throw new Error('Respuesta inválida');
    if (!next.services.every((service) => typeof service?.id === 'string' && typeof service.name === 'string'
      && Array.isArray(service.samples) && service.samples.every((sample) => typeof sample?.at === 'string'))) {
      throw new Error('Mediciones inválidas');
    }
    dataset = next;
    render();
    notice.hidden = true;
    if (announce) byId('announcement').textContent = 'Estado actualizado.';
  } catch {
    if (dataset) {
      render();
      notice.textContent = 'No se pudo actualizar. Se muestran las últimas mediciones recibidas.';
    } else {
      byId('overall').textContent = 'Monitor no disponible';
      byId('overview-count').hidden = false;
      byId('overview-count').textContent = 'No se pudo conectar. Se reintentará automáticamente.';
      byId('updated').textContent = '';
      list.replaceChildren(el('p', 'empty', 'No se pudieron cargar las mediciones.'));
    }
    notice.hidden = !dataset;
  } finally {
    pending = false;
    refresh.removeAttribute('aria-disabled');
    list.setAttribute('aria-busy', 'false');
    const delay = dataset ? Math.max(1, Math.min(dataset.intervalSeconds, 60)) * 1000 : 30000;
    timer = setTimeout(() => load(), delay);
  }
}

filters.addEventListener('submit', (event) => event.preventDefault());
query.addEventListener('input', () => renderList(true));
stateFilter.addEventListener('change', () => renderList(true));
applyTheme();
byId('theme-toggle').addEventListener('click', () => {
  chosenTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem('estado-theme', chosenTheme); } catch {}
  applyTheme();
});
refresh.addEventListener('click', () => load(true));
list.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-service]');
  if (!button) return;
  const report = reports.find(({ service }) => service.id === button.dataset.service);
  if (!report) return;
  selectedId = report.service.id;
  dialog.querySelector('.daily').open = false;
  renderDetail(report);
  dialog.showModal();
});
dialog.addEventListener('close', () => {
  const button = [...list.querySelectorAll('button[data-service]')].find((node) => node.dataset.service === selectedId);
  (button || refresh).focus({ preventScroll: true });
  selectedId = undefined;
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') load();
});
load();
