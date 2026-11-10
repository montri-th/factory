/**
 * Estate names on the map: one short chip per drawn estate at the label point of its outline (a point inside the
 * largest ring, scripts/build-data.py#label_point) — the short name (the type word dropped: the colour and the panel
 * carry it) and the IEAT directory listings. Chips never overlap: they are placed greedily, the open estate first, then
 * the estates of the province being read, then the rest by listings; a chip that would touch a placed one, leave the
 * map or sit on the bottom tray is hidden. Each chip is a button (keyboard and screen reader reachable).
 */
const TYPE_PREFIX = /^(?:เขตประกอบการอุตสาหกรรม|นิคมอุตสาหกรรม|สวนอุตสาหกรรม|เขตอุตสาหกรรม)\s*/;
const TYPE_SUFFIX = /\s*(?:Industrial (?:Promotion )?(?:Estate|Park|Zone|Land|City|Area)s?)\b\s*/i;

/** Short map name: “นิคมอุตสาหกรรมลาดกระบัง” → “ลาดกระบัง”; “Lat Krabang Industrial Estate” → “Lat Krabang”. */
export function shortName(text) {
  const s = String(text || '').trim();
  // No space left before a comma where a type word was cut (“Nava Nakorn Industrial Estate, Nakhon Ratchasima”, R8 names).
  const cut = s.replace(TYPE_PREFIX, '').replace(TYPE_SUFFIX, ' ').replace(/\s+/g, ' ').replace(/\s+,/g, ',').trim();
  return cut || s;
}

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

/** Greedy placement of boxes {id, x, y, w, h, priority} in a viewport; returns the ids that show. Pure. */
export function placeChips(boxes, {width, height, bottom = 0, gap = 4} = {}) {
  const placed = [], shown = new Set();
  for (const b of [...boxes].sort((a, c) => c.priority - a.priority)) {
    const r = {left: b.x - b.w / 2, right: b.x + b.w / 2, top: b.y - b.h - 6, bottom: b.y - 6};
    if (r.left < 4 || r.right > width - 4 || r.top < 4 || r.bottom > height - bottom) continue;
    if (placed.some(p => r.left < p.right + gap && r.right > p.left - gap && r.top < p.bottom + gap && r.bottom > p.top - gap)) continue;
    placed.push(r);
    shown.add(b.id);
  }
  return shown;
}

export function installEstateLabels(map, container, {onSelect, name = e => e.name, num = String, reservedBottom = () => 0, minZoom = 7} = {}) {
  const host = document.createElement('div');
  host.className = 'estate-labels';
  container.append(host);
  const buttons = new Map();
  let items = [], selected = '', province = '', frame = 0;

  function button(e) {
    let b = buttons.get(e.id);
    if (!b) {
      b = document.createElement('button');
      b.type = 'button';
      b.className = 'estate-chip';
      b.dataset.id = e.id;
      b.addEventListener('click', ev => { ev.stopPropagation(); onSelect?.(e.id); });
      host.append(b);
      buttons.set(e.id, b);
    }
    const label = shortName(name(e));
    const count = e.listed ? `<span class="estate-chip-count data-number">${esc(num(e.dir.n))}</span>` : '';
    const html = `<span class="estate-chip-name">${esc(label)}</span>${count}`;
    if (b.innerHTML !== html) b.innerHTML = html;
    b.title = `${name(e)}${e.listed ? ` · ${num(e.dir.n)}` : ''}`;
    b.setAttribute('aria-label', b.title);
    b.classList.toggle('is-selected', e.id === selected);
    return b;
  }

  function layout() {
    frame = 0;
    const zoom = map.getZoom();
    const width = container.clientWidth, height = container.clientHeight;
    const keep = new Set(items.map(e => e.id));
    for (const [id, b] of buttons) if (!keep.has(id)) { b.remove(); buttons.delete(id); }
    const boxes = [];
    for (const e of items) {
      const b = button(e);
      if (!e.label || (zoom < minZoom && e.id !== selected)) { b.hidden = true; continue; }
      const p = map.project(e.label);
      b.hidden = false;
      b.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, calc(-100% - 6px))`;
      const w = b.offsetWidth || 80, h = b.offsetHeight || 26;
      const priority = (e.id === selected ? 1e6 : 0) + (province && e.province === province ? 1e5 : 0) + (e.listed ? e.dir.n : 0);
      boxes.push({id: e.id, x: p.x, y: p.y, w, h, priority});
    }
    const shown = placeChips(boxes, {width, height, bottom: reservedBottom()});
    for (const box of boxes) buttons.get(box.id).hidden = !shown.has(box.id);
  }
  const schedule = () => { if (!frame) frame = requestAnimationFrame(layout); };
  map.on('move', schedule);
  map.on('resize', schedule);

  return {
    update(list, opts = {}) { items = list; selected = opts.selected || ''; province = opts.province || ''; schedule(); },
    layout: schedule,
    dispose() { map.off('move', schedule); map.off('resize', schedule); host.remove(); buttons.clear(); },
  };
}
