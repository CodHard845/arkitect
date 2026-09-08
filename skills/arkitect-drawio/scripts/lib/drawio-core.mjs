// Shared parsing helpers for .drawio files and .drawio mxlibrary palettes.
// Everything here runs locally. Nothing in this module prints diagram labels;
// callers decide what is safe to emit.

import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';

export function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

export function fileMeta(path) {
  const buf = readFileSync(path);
  const st = statSync(path);
  return { path, bytes: st.size, mtime: st.mtime.toISOString(), sha256: sha256(buf) };
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function unescapeXml(s) {
  if (s.indexOf('&') === -1) return s;
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, ent) => {
    if (ENTITIES[ent] !== undefined) return ENTITIES[ent];
    if (ent[0] === '#') {
      const code = ent[1] === 'x' || ent[1] === 'X'
        ? parseInt(ent.slice(2), 16)
        : parseInt(ent.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return m;
  });
}

// Linear tag scanner. Attribute values routinely hold megabytes of base64,
// so this walks indexes instead of running a regex over the whole document.
function* scanTags(xml) {
  let i = 0;
  const n = xml.length;
  while (i < n) {
    const lt = xml.indexOf('<', i);
    if (lt === -1) return;
    if (xml.startsWith('<!--', lt)) {
      const end = xml.indexOf('-->', lt);
      i = end === -1 ? n : end + 3;
      continue;
    }
    if (xml.startsWith('<?', lt) || xml.startsWith('<!', lt)) {
      const end = xml.indexOf('>', lt);
      i = end === -1 ? n : end + 1;
      continue;
    }
    let j = lt + 1;
    let quote = null;
    while (j < n) {
      const c = xml[j];
      if (quote) {
        if (c === quote) quote = null;
      } else if (c === '"' || c === "'") {
        quote = c;
      } else if (c === '>') {
        break;
      }
      j++;
    }
    if (j >= n) return;
    const raw = xml.slice(lt, j + 1);
    const closing = raw[1] === '/';
    const selfClosing = raw.endsWith('/>');
    const nameMatch = /^<\/?\s*([\w:.-]+)/.exec(raw);
    if (nameMatch) {
      yield { name: nameMatch[1], raw, closing, selfClosing };
    }
    i = j + 1;
  }
}

export function parseAttrs(rawTag) {
  const out = {};
  const re = /([\w:.-]+)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(rawTag)) !== null) out[m[1]] = unescapeXml(m[2]);
  return out;
}

// Builds a shallow element tree: { name, attrs, children }.
export function parseXml(xml) {
  const root = { name: '#root', attrs: {}, children: [] };
  const stack = [root];
  for (const tag of scanTags(xml)) {
    const top = stack[stack.length - 1];
    if (tag.closing) {
      if (stack.length > 1 && stack[stack.length - 1].name === tag.name) stack.pop();
      continue;
    }
    const el = { name: tag.name, attrs: parseAttrs(tag.raw), children: [] };
    top.children.push(el);
    if (!tag.selfClosing) stack.push(el);
  }
  return root;
}

export function findAll(el, name, out = []) {
  for (const c of el.children) {
    if (c.name === name) out.push(c);
    findAll(c, name, out);
  }
  return out;
}

// ---------------------------------------------------------------- mxfile

export function isCompressedPage(inner) {
  // An uncompressed page carries a literal <mxGraphModel>; a compressed one
  // is a single base64 text node.
  return inner.indexOf('<mxGraphModel') === -1 && /[A-Za-z0-9+/=]{40,}/.test(inner);
}

export function decompressPage(b64) {
  const raw = inflateRawSync(Buffer.from(b64.trim(), 'base64')).toString('binary');
  return decodeURIComponent(raw);
}

export function readMxfile(path) {
  const text = readFileSync(path, 'utf8');
  const header = /<mxfile\b([^>]*)>/.exec(text);
  const attrs = header ? parseAttrs('<mxfile' + header[1] + '>') : {};
  const pages = [];
  const re = /<diagram\b([^>]*?)>([\s\S]*?)<\/diagram>/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const a = parseAttrs('<diagram' + m[1] + '>');
    const inner = m[2];
    const compressed = isCompressedPage(inner);
    pages.push({
      name: a.name ?? '',
      id: a.id ?? '',
      compressed,
      get xml() {
        return compressed ? decompressPage(inner) : inner;
      },
    });
  }
  return { path, attrs, pages, bytes: Buffer.byteLength(text) };
}

// ---------------------------------------------------------------- cells

export function parseStyle(style) {
  const out = {};
  if (!style) return out;
  for (const part of style.split(';')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    if (eq === -1) out[part] = true;
    else out[part.slice(0, eq)] = part.slice(eq + 1);
  }
  return out;
}

const BARE_SHAPES = new Set([
  'ellipse', 'rhombus', 'triangle', 'hexagon', 'cylinder', 'cloud',
  'note', 'card', 'step', 'process', 'swimlane', 'shape',
]);

export function styleShape(style) {
  const s = parseStyle(style);
  if (s.shape) return String(s.shape);
  for (const k of Object.keys(s)) {
    if (s[k] === true && (k.startsWith('mxgraph.') || BARE_SHAPES.has(k))) return k;
  }
  return null;
}

// A style signature drops the volatile bits (embedded images, connection
// points) so recurring visual conventions can be counted.
export function styleSignature(style) {
  const s = parseStyle(style);
  const keys = Object.keys(s).filter((k) => k !== 'image' && k !== 'points').sort();
  return keys.map((k) => (s[k] === true ? k : `${k}=${s[k]}`)).join(';');
}

export function extractCells(pageXml) {
  const model = parseXml(pageXml);
  const cells = [];
  const wrappers = new Map();
  for (const name of ['object', 'UserObject']) {
    for (const el of findAll(model, name)) {
      for (const c of el.children) if (c.name === 'mxCell') wrappers.set(c, el);
    }
  }
  for (const el of findAll(model, 'mxCell')) {
    const w = wrappers.get(el);
    const a = el.attrs;
    const geomEl = el.children.find((c) => c.name === 'mxGeometry');
    const g = geomEl ? geomEl.attrs : null;
    const points = geomEl
      ? findAll(geomEl, 'mxPoint').filter((p) => !p.attrs.as).length
      : 0;
    cells.push({
      id: w ? (w.attrs.id ?? a.id) : a.id,
      value: w ? (w.attrs.label ?? '') : (a.value ?? ''),
      style: a.style ?? '',
      parent: a.parent ?? '',
      source: a.source ?? null,
      target: a.target ?? null,
      vertex: a.vertex === '1',
      edge: a.edge === '1',
      geometry: g
        ? {
            x: g.x !== undefined ? Number(g.x) : null,
            y: g.y !== undefined ? Number(g.y) : null,
            width: g.width !== undefined ? Number(g.width) : null,
            height: g.height !== undefined ? Number(g.height) : null,
            relative: g.relative === '1',
          }
        : null,
      waypoints: points,
      wrapped: Boolean(w),
    });
  }
  return cells;
}

export function graphModelAttrs(pageXml) {
  const m = /<mxGraphModel\b([^>]*)>/.exec(pageXml);
  return m ? parseAttrs('<mxGraphModel' + m[1] + '>') : {};
}

// ---------------------------------------------------------------- images

// draw.io writes `data:image/svg+xml,<base64>` (no `;base64` marker) as well as
// the standard `data:<mime>;base64,<payload>` form. Normalize both.
export function parseDataUri(uri) {
  if (!uri || !uri.startsWith('data:')) return null;
  const comma = uri.indexOf(',');
  if (comma === -1) return null;
  let meta = uri.slice(5, comma);
  const payload = uri.slice(comma + 1);
  let base64 = true;
  if (meta.endsWith(';base64')) meta = meta.slice(0, -7);
  else if (meta.indexOf(';') !== -1) meta = meta.split(';')[0];
  const mime = meta || 'text/plain';
  let bytes;
  try {
    if (/^[A-Za-z0-9+/=\s]+$/.test(payload.slice(0, 256))) {
      bytes = Buffer.from(payload, 'base64');
    } else {
      bytes = Buffer.from(decodeURIComponent(payload), 'utf8');
      base64 = false;
    }
  } catch {
    return null;
  }
  return { mime, base64, bytes, hash: sha256(bytes), payloadLength: payload.length };
}

export function svgDimensions(bytes) {
  const head = bytes.subarray(0, 4096).toString('utf8');
  const w = /\bwidth\s*=\s*"([\d.]+)/.exec(head);
  const h = /\bheight\s*=\s*"([\d.]+)/.exec(head);
  if (w && h) return { width: Number(w[1]), height: Number(h[1]) };
  const vb = /viewBox\s*=\s*"\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(head);
  if (vb) return { width: Number(vb[1]), height: Number(vb[2]) };
  return { width: null, height: null };
}

export function pngDimensions(bytes) {
  if (bytes.length < 24 || bytes.readUInt32BE(0) !== 0x89504e47) return { width: null, height: null };
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

export function imageDimensions(mime, bytes) {
  if (mime.includes('svg')) return svgDimensions(bytes);
  if (mime.includes('png')) return pngDimensions(bytes);
  return { width: null, height: null };
}

// ---------------------------------------------------------------- mxlibrary

// An .mxlibrary payload is a JSON array of entries:
//   { xml | data, w, h, title, aspect }
export function readLibrary(path) {
  const text = readFileSync(path, 'utf8');
  const m = /<mxlibrary[^>]*>([\s\S]*?)<\/mxlibrary>/.exec(text);
  if (!m) throw new Error(`not an mxlibrary: ${path}`);
  const entries = JSON.parse(unescapeXml(m[1].trim()));
  return entries.map((e, index) => {
    const img = e.data ? parseDataUri(e.data) : null;
    let mime = null;
    let bytes = null;
    if (img) {
      mime = img.mime;
      bytes = img.bytes;
    } else if (e.xml) {
      // Shape-XML entries carry no bitmap; hash the shape source instead.
      mime = 'application/mxgraph-shape';
      bytes = Buffer.from(e.xml, 'utf8');
    }
    const dims = mime && bytes ? imageDimensions(mime, bytes) : { width: null, height: null };
    return {
      index,
      title: e.title ?? '',
      w: e.w ?? null,
      h: e.h ?? null,
      aspect: e.aspect ?? null,
      mime,
      dataUri: e.data ?? null,
      hash: bytes ? sha256(bytes) : null,
      byteLength: bytes ? bytes.length : 0,
      intrinsic: dims,
    };
  });
}

export function normalizeTitle(title) {
  return String(title)
    .replace(/^Arch[_ -]*/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b(16|32|48|64)\b/g, ' ')
    .replace(/\bAmazon\b|\bAWS\b/gi, ' ')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function titleAliases(title) {
  const set = new Set();
  const norm = normalizeTitle(title);
  if (norm) set.add(norm);
  const noSpaces = norm.replace(/\s+/g, '');
  if (noSpaces) set.add(noSpaces);
  // CamelCase split, for palette titles like "AgentCoreGateway".
  const camel = String(title)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
  const camelNorm = normalizeTitle(camel);
  if (camelNorm) set.add(camelNorm);
  return [...set];
}
