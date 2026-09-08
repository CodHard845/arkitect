#!/usr/bin/env node
// Assemble a native, editable .excalidraw scene from a compact JSON spec.
//
//   node build-diagram.mjs spec.json --out architecture.excalidraw
//
// The spec is a column/row grid: nodes name a column and a row, boundaries wrap
// whatever sits inside them, and arrows are bound to real elements so dragging a
// box in the app keeps the wiring. Everything the generator emits uses
// Excalidraw's own vocabulary - default palette, its four font sizes, its three
// stroke widths, real frames, real bound labels - so the result is a scene
// somebody could plausibly have drawn by hand, not an import.
//
// An existing target is never overwritten silently; a timestamped sibling
// backup is written first.

import { readFileSync, writeFileSync } from 'node:fs';
import {
  emptyScene, writeScene, backupExisting, reindex,
  rectangle, ellipse, diamond, line, arrow, text, frame, image as imageEl,
  bindLabel, bindArrow, cloneElements, bbox, elementBox, translate, scaleElements,
  addFile, newId, newSeed, measureText, wrapText,
  PALETTE, CANVAS_BG, FONT, FONT_FAMILY, STROKE_WIDTH, ROUGHNESS, ROUND, EDGE_POINT,
  positionals, normalizeName,
} from './lib/excalidraw-core.mjs';
import { resolveIcon } from './find-icon.mjs';

// ---------------------------------------------------------------- style

// Every number here is read off the reference corpus - see
// references/source-analysis.json for the counts behind each one.
export const STYLE = {
  roughness: ROUGHNESS.artist,          // 1, in 71% of all elements
  fontFamily: FONT_FAMILY.hand,         // family 1, in 57% of authored text
  bodyFontFamily: FONT_FAMILY.nunito,   // family 6, for multi-line body copy
  strokeWidth: STROKE_WIDTH.bold,
  edgeStrokeWidth: STROKE_WIDTH.extraBold, // 4, on 71% of connectors
  rounded: true,
  canvasBackground: CANVAS_BG.white,    // #ffffff, in 9 of 9 scenes
  nodeWidth: 180,
  nodeHeight: 90,
  iconSize: 100,                        // 100x100 is the commonest footprint
  captionSize: FONT.M,                  // 20; 28 for a lane or section title
  captionGap: 10,
  colPitch: 320,                        // median horizontal pitch ~300-385
  rowPitch: 200,                        // median vertical pitch ~120-150
  cell: 100,
  originX: 0,
  originY: 0,
  // Elbow arrows, on 70% of the corpus's connectors. The app re-routes them
  // itself, so they stay square when a box is dragged.
  edgeRouting: 'elbow',
  // Edge captions sit beside the line as free text: not one arrow in the
  // corpus carries a bound label.
  edgeLabelBound: false,
  // Boundaries are dashed rectangles. The corpus contains 21 of them and no
  // frame elements at all.
  boundaryStroke: 'dashed',
  boundaryStrokeWidth: STROKE_WIDTH.bold,
};

// Accents the corpus actually reaches for, beyond Excalidraw's five swatches.
export const HOUSE_ACCENTS = {
  cyan:  { stroke: '#29b5e8', bg: 'transparent' },
  sky:   { stroke: '#01b0f0', bg: 'transparent' },
  slate: { stroke: '#343a40', bg: '#e9ecef' },
  amber: { stroke: '#fc5d0d', bg: '#ffec99' },
  teal:  { stroke: '#0b7285', bg: 'transparent' },
};

// Connector semantics. Excalidraw has no notion of a line "meaning" anything,
// so the meaning has to live in colour and dash and be spelled out in a legend.
export const EDGE_KINDS = {
  flow:    { color: PALETTE.black.stroke,  strokeStyle: 'solid',  width: STROKE_WIDTH.extraBold, meaning: 'primary flow' },
  async:   { color: PALETTE.black.stroke,  strokeStyle: 'dashed', width: STROKE_WIDTH.extraBold, meaning: 'async or scheduled' },
  branch:  { color: PALETTE.blue.stroke,   strokeStyle: 'solid',  width: STROKE_WIDTH.extraBold, meaning: 'conditional branch' },
  error:   { color: PALETTE.red.stroke,    strokeStyle: 'solid',  width: STROKE_WIDTH.extraBold, meaning: 'failure path' },
  success: { color: PALETTE.green.stroke,  strokeStyle: 'dashed', width: STROKE_WIDTH.extraBold, meaning: 'success path' },
  data:    { color: HOUSE_ACCENTS.cyan.stroke, strokeStyle: 'solid', width: STROKE_WIDTH.extraBold, meaning: 'data movement' },
  light:   { color: PALETTE.grey.stroke,   strokeStyle: 'dotted', width: STROKE_WIDTH.thin, meaning: 'weak association' },
};

function accentOf(name) {
  if (!name) return { stroke: PALETTE.black.stroke, bg: 'transparent' };
  if (typeof name === 'object') return { stroke: name.stroke ?? PALETTE.black.stroke, bg: name.bg ?? 'transparent' };
  if (PALETTE[name]) return PALETTE[name];
  if (HOUSE_ACCENTS[name]) return HOUSE_ACCENTS[name];
  if (/^#[0-9a-fA-F]{6}$/.test(name)) return { stroke: name, bg: 'transparent' };
  return { stroke: PALETTE.black.stroke, bg: 'transparent' };
}

// ---------------------------------------------------------------- geometry

function anchorOn(box, towards, gap) {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const dx = towards.x - cx;
  const dy = towards.y - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const halfW = box.width / 2 + gap;
  const halfH = box.height / 2 + gap;
  const scale = Math.min(
    Math.abs(dx) > 1e-6 ? halfW / Math.abs(dx) : Infinity,
    Math.abs(dy) > 1e-6 ? halfH / Math.abs(dy) : Infinity,
  );
  return { x: cx + dx * scale, y: cy + dy * scale };
}

// The point half way along a polyline by length, and the direction of the
// segment it lands on. Taking the middle vertex instead puts an edge caption at
// the end of the first leg, which on an L-shaped route is up against the source.
function polylineMidpoint(pts) {
  const seg = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const len = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    seg.push(len);
    total += len;
  }
  if (!total) return { x: pts[0].x, y: pts[0].y, horizontal: true };
  let walked = 0;
  for (let i = 0; i < seg.length; i++) {
    if (walked + seg[i] >= total / 2) {
      const t = seg[i] ? (total / 2 - walked) / seg[i] : 0;
      const a = pts[i];
      const b = pts[i + 1];
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        horizontal: Math.abs(b.x - a.x) >= Math.abs(b.y - a.y),
      };
    }
    walked += seg[i];
  }
  const last = pts[pts.length - 1];
  return { x: last.x, y: last.y, horizontal: true };
}

// Which edge of each shape an elbow arrow should leave from and arrive at,
// as the normalised [u, v] pair Excalidraw stores on the binding.
function edgePointsBetween(a, b) {
  const dx = (b.x + b.width / 2) - (a.x + a.width / 2);
  const dy = (b.y + b.height / 2) - (a.y + a.height / 2);
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? [EDGE_POINT.right, EDGE_POINT.left]
      : [EDGE_POINT.left, EDGE_POINT.right];
  }
  return dy >= 0
    ? [EDGE_POINT.bottom, EDGE_POINT.top]
    : [EDGE_POINT.top, EDGE_POINT.bottom];
}

// Straight when the two shapes share a centre line, elbowed otherwise. An
// architecture reads better with square corners; a diagonal across three
// columns reads as noise.
function routePoints(a, b, mode, gap) {
  const ca = { x: a.x + a.width / 2, y: a.y + a.height / 2 };
  const cb = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  const alignedY = Math.abs(ca.y - cb.y) < 12;
  const alignedX = Math.abs(ca.x - cb.x) < 12;
  const effective = mode === 'auto' || !mode
    ? (alignedX || alignedY ? 'straight' : 'elbow')
    : mode;

  if (effective === 'straight') {
    return [anchorOn(a, cb, gap), anchorOn(b, ca, gap)];
  }

  const horizontalFirst = Math.abs(cb.x - ca.x) >= Math.abs(cb.y - ca.y);
  if (horizontalFirst) {
    const midX = (ca.x + cb.x) / 2;
    const start = anchorOn(a, { x: cb.x, y: ca.y }, gap);
    const end = anchorOn(b, { x: ca.x, y: cb.y }, gap);
    return [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end];
  }
  const midY = (ca.y + cb.y) / 2;
  const start = anchorOn(a, { x: ca.x, y: cb.y }, gap);
  const end = anchorOn(b, { x: cb.x, y: ca.y }, gap);
  return [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end];
}

// ---------------------------------------------------------------- node shapes

// An empty slot where a product's mark should go, for a component no bundled
// library covers. Deliberately loud: a dotted violet square with a "?" in it,
// grouped so it can be selected and deleted in one click once the real icon has
// been dropped on top. Borrowing a different product's mark instead, or quietly
// drawing a grey box, is how a wrong diagram gets shipped.
export const PLACEHOLDER = { stroke: '#6741d9', bg: '#f3f0ff' };

export function iconPlaceholder(x, y, size = 100) {
  const group = newId();
  const r = rectangle({
    x, y, width: size, height: size,
    strokeColor: PLACEHOLDER.stroke,
    backgroundColor: PLACEHOLDER.bg,
    fillStyle: 'solid',
    strokeWidth: STROKE_WIDTH.bold,
    strokeStyle: 'dotted',
    roughness: ROUGHNESS.artist,
    roundness: ROUND,
    groupIds: [group],
  });
  const mark = '?';
  const fontSize = Math.round(size * 0.42);
  const m = measureText(mark, fontSize, FONT_FAMILY.hand);
  const q = text({
    text: mark, fontSize, fontFamily: FONT_FAMILY.hand, textAlign: 'center',
    strokeColor: PLACEHOLDER.stroke,
    width: m.width, height: m.height,
    x: Math.round(x + (size - m.width) / 2),
    y: Math.round(y + (size - m.height) / 2),
    groupIds: [group],
  });
  return { elements: [r, q], anchor: r, group };
}

// ---------------------------------------------------------------- shapes

// Excalidraw has no cylinder primitive and cannot clip, so a stack of rectangle
// and ellipses leaves the back half of the bottom ellipse drawn across the body.
// The silhouette is traced as one closed polygon instead, with the lid on top.
function cylinder(x, y, w, h, look) {
  const capH = Math.min(h * 0.28, 34);
  const group = newId();
  const common = {
    strokeColor: look.stroke, backgroundColor: look.bg, fillStyle: 'solid',
    strokeWidth: look.strokeWidth, roughness: look.roughness, groupIds: [group],
  };

  const arc = (cx, cy, rx, ry, from, to, steps = 14) => {
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const t = from + ((to - from) * i) / steps;
      pts.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]);
    }
    return pts;
  };

  const rx = w / 2;
  const ry = capH / 2;
  // Left side down, bottom arc bulging down, right side up, top arc bulging up
  // back to the start. Each arc already begins on the previous point, so its
  // first sample is dropped.
  const silhouette = [
    [0, ry],
    [0, h - ry],
    ...arc(rx, h - ry, rx, ry, Math.PI, 0).slice(1),
    [w, ry],
    ...arc(rx, ry, rx, ry, 0, -Math.PI).slice(1),
  ];
  const body = line({ ...common, x, y, points: silhouette });
  const lid = ellipse({ ...common, x, y, width: w, height: capH });
  return { elements: [body, lid], labelHost: lid, group };
}

function actor(x, y, w, h, look) {
  const group = newId();
  const headR = Math.min(w, h) * 0.3;
  const common = {
    strokeColor: look.stroke, backgroundColor: look.bg, fillStyle: 'solid',
    strokeWidth: look.strokeWidth, roughness: look.roughness, groupIds: [group],
  };
  const cx = x + w / 2;
  const head = ellipse({ ...common, x: cx - headR / 2, y, width: headR, height: headR });
  const spine = line({ ...common, backgroundColor: 'transparent', x: cx, y: y + headR, points: [[0, 0], [0, h * 0.4]] });
  const arms = line({ ...common, backgroundColor: 'transparent', x: cx - w * 0.28, y: y + headR + h * 0.12, points: [[0, 0], [w * 0.56, 0]] });
  const legs = line({
    ...common, backgroundColor: 'transparent',
    x: cx - w * 0.24, y: y + headR + h * 0.4,
    points: [[w * 0.24, -h * 0.02], [0, h * 0.3], [w * 0.24, -h * 0.02], [w * 0.48, h * 0.3]],
  });
  return { elements: [head, spine, arms, legs], labelHost: null, group };
}

// ---------------------------------------------------------------- build

export function buildDiagram(spec) {
  const S = { ...STYLE, ...(spec.style ?? {}) };
  const L = {
    originX: S.originX, originY: S.originY, colPitch: S.colPitch, rowPitch: S.rowPitch, cell: S.cell,
    ...(spec.layout ?? {}),
  };
  const scene = emptyScene();
  scene.appState.viewBackgroundColor = CANVAS_BG[spec.canvasBackground] ?? spec.canvasBackground ?? S.canvasBackground;

  const report = { icons: [], missingIcons: [], opaqueIcons: [], selfCaptioned: [], notes: [] };
  const colX = (c) => L.originX + c * L.colPitch;
  const rowY = (r) => L.originY + r * L.rowPitch;

  const frames = [];      // real Excalidraw frames, drawn first
  const scopes = [];      // dashed group rectangles
  const nodeLayer = [];
  const edgeLayer = [];
  const chrome = [];      // title, legend

  const geom = new Map();          // node id -> box used for routing
  const anchorFor = new Map();     // node id -> element an arrow binds to
  const childrenOf = new Map();    // boundary id -> [boxes]

  const noteChild = (parentId, box) => {
    if (!parentId) return;
    if (!childrenOf.has(parentId)) childrenOf.set(parentId, []);
    childrenOf.get(parentId).push(box);
  };

  const boundaries = spec.boundaries ?? [];
  const byBoundary = new Map(boundaries.map((b) => [b.id, b]));

  // ------------------------------------------------------------ nodes

  for (const n of spec.nodes ?? []) {
    const look = {
      ...accentOf(n.accent),
      strokeWidth: n.strokeWidth ?? S.strokeWidth,
      roughness: n.roughness ?? S.roughness,
    };
    if (n.fill === false) look.bg = 'transparent';
    if (n.fill && typeof n.fill === 'string') look.bg = n.fill;

    const w = n.width ?? (n.kind === 'icon' ? (n.size ?? S.iconSize) : S.nodeWidth);
    const h = n.height ?? (n.kind === 'icon' ? (n.size ?? S.iconSize) : S.nodeHeight);
    const x = Math.round(colX(n.col ?? 0) + (L.cell - w) / 2);
    const y = Math.round(rowY(n.row ?? 0) + (L.cell - h) / 2);

    // A label bound inside a box has to fit the box, so it stays at 16. A free
    // caption under an icon has the whole gutter to itself and reads at 20 -
    // the size the reference corpus writes captions at.
    const labelOpts = {
      fontSize: n.fontSize ?? FONT.S,
      fontFamily: n.fontFamily ?? S.fontFamily,
      color: n.labelColor ?? look.stroke,
    };
    const captionOpts = { ...labelOpts, fontSize: n.fontSize ?? S.captionSize };
    const produced = [];
    let anchor = null;
    // `box` stays the shape itself, so arrows anchor on its centre line.
    // `extent` grows to cover captions, so a boundary drawn around this node
    // leaves room for them.
    let box = { x, y, width: w, height: h };
    let extent = null;
    const grow = (extraHeight) => {
      const cur = extent ?? box;
      extent = { ...cur, height: cur.height + extraHeight };
    };
    const bottom = () => { const cur = extent ?? box; return cur.y + cur.height; };

    if (n.kind === 'icon' || n.kind === 'placeholder') {
      const resolved = n.kind === 'placeholder' ? null : resolveIcon(n.icon ?? n.label);
      if (!resolved) {
        report.missingIcons.push(n.icon ?? n.label);
        // A slot to be filled in by hand, not a stand-in for the real mark. It
        // has to be impossible to mistake for a finished node, so a plain box
        // in the node's own colour is the wrong answer. Nothing else in the
        // vocabulary is a dotted violet square with a question mark in it.
        const slot = iconPlaceholder(x, y, n.size ?? S.iconSize);
        produced.push(...slot.elements);
        anchor = slot.anchor;
        box = bbox(slot.elements);
      } else if (resolved.kind === 'embedded') {
        const e = resolved.entry;
        const fileId = addFile(scene, e.mime, e.bytes);
        const longest = n.size ?? S.iconSize;
        const scaleF = longest / Math.max(e.width || longest, e.height || longest);
        const iw = Math.round((e.width || longest) * scaleF);
        const ih = Math.round((e.height || longest) * scaleF);
        const img = imageEl({ fileId, x: Math.round(colX(n.col ?? 0) + (L.cell - iw) / 2), y, width: iw, height: ih });
        produced.push(img);
        anchor = img;
        box = elementBox(img);
        report.icons.push({ node: n.id, ref: resolved.source, kind: 'embedded' });
        if (e.transparent === false) report.opaqueIcons.push(`${resolved.source} (${e.transparencyNote})`);
      } else {
        const group = newId();
        const clone = cloneElements(resolved.elements, { groupId: group });
        const src = bbox(clone);
        const longest = n.size ?? S.iconSize;
        if (src.width > 0 && src.height > 0) {
          scaleElements(clone, longest / Math.max(src.width, src.height), src.x, src.y);
        }
        const after = bbox(clone);
        translate(clone, colX(n.col ?? 0) + (L.cell - after.width) / 2 - after.x, y - after.y);
        produced.push(...clone);
        box = bbox(clone);
        // An arrow binds to one element; the largest piece of the mark is the
        // most stable target when the group is dragged.
        anchor = clone.reduce((best, el) => {
          const b = elementBox(el);
          const bb = elementBox(best);
          return b.width * b.height > bb.width * bb.height ? el : best;
        }, clone[0]);
        report.icons.push({ node: n.id, ref: resolved.source, kind: resolved.kind, elements: clone.length });
      }

      // Every icon and every placeholder gets its caption underneath. A
      // placeholder needs it most of all: the caption is what says which
      // product's mark belongs in the empty slot.
      //
      // Except when the library item already carries its own name as text -
      // most of the bundled AWS, Azure and data-platform marks do - in which
      // case adding ours prints the product name twice, one under the other.
      const ownCaption = n.label && produced.some((el) => el.type === 'text' && el.text
        && normalizeName(el.text) === normalizeName(n.label));
      if (ownCaption) report.selfCaptioned.push(n.id ?? n.label);
      if (n.label && !ownCaption) {
        const m = measureText(n.label, captionOpts.fontSize, captionOpts.fontFamily);
        produced.push(text({
          text: n.label,
          fontSize: captionOpts.fontSize,
          fontFamily: captionOpts.fontFamily,
          textAlign: 'center',
          strokeColor: resolved ? captionOpts.color : PLACEHOLDER.stroke,
          width: m.width,
          height: m.height,
          x: Math.round(box.x + (box.width - m.width) / 2),
          y: Math.round(bottom() + S.captionGap),
        }));
        grow(S.captionGap + m.height);
      }
    } else if (n.kind === 'text') {
      const t = text({
        text: n.label ?? '',
        fontSize: n.fontSize ?? FONT.M,
        fontFamily: n.fontFamily ?? S.fontFamily,
        textAlign: n.align ?? 'left',
        strokeColor: n.labelColor ?? look.stroke,
        x, y,
      });
      produced.push(t);
      anchor = t;
      box = elementBox(t);
    } else if (n.kind === 'note') {
      const look2 = { ...accentOf(n.accent ?? 'orange') };
      const wrapped = wrapText(n.label ?? '', w - 24, FONT.S, S.fontFamily);
      const m = measureText(wrapped, FONT.S, S.fontFamily);
      const height = n.height ?? Math.max(h, m.height + 28);
      const r = rectangle({
        x, y, width: w, height,
        strokeColor: look2.stroke, backgroundColor: n.fill ?? look2.bg, fillStyle: 'solid',
        strokeWidth: STROKE_WIDTH.thin, roughness: n.roughness ?? S.roughness,
        roundness: S.rounded ? ROUND : null,
      });
      produced.push(r, bindLabel(r, wrapped, { ...labelOpts, color: PALETTE.black.stroke, verticalAlign: 'top', textAlign: 'left', padding: 12 }));
      anchor = r;
      box = elementBox(r);
    } else if (n.kind === 'cylinder') {
      const c = cylinder(x, y, w, h, look);
      produced.push(...c.elements);
      anchor = c.elements[0];
      box = bbox(c.elements);
      if (n.label) {
        const m = measureText(n.label, captionOpts.fontSize, captionOpts.fontFamily);
        produced.push(text({
          text: n.label, fontSize: captionOpts.fontSize, fontFamily: captionOpts.fontFamily,
          textAlign: 'center', strokeColor: captionOpts.color,
          width: m.width, height: m.height,
          x: Math.round(box.x + (box.width - m.width) / 2),
          y: Math.round(bottom() + S.captionGap),
          groupIds: [c.group],
        }));
        grow(S.captionGap + m.height);
      }
    } else if (n.kind === 'actor') {
      const a = actor(x, y, w, h, look);
      produced.push(...a.elements);
      anchor = a.elements[0];
      box = bbox(a.elements);
      if (n.label) {
        const m = measureText(n.label, captionOpts.fontSize, captionOpts.fontFamily);
        produced.push(text({
          text: n.label, fontSize: captionOpts.fontSize, fontFamily: captionOpts.fontFamily,
          textAlign: 'center', strokeColor: captionOpts.color,
          width: m.width, height: m.height,
          x: Math.round(box.x + (box.width - m.width) / 2),
          y: Math.round(bottom() + S.captionGap),
          groupIds: [a.group],
        }));
        grow(S.captionGap + m.height);
      }
    } else {
      const make = n.kind === 'ellipse' ? ellipse : n.kind === 'diamond' ? diamond : rectangle;
      const shape = make({
        x, y, width: w, height: h,
        strokeColor: look.stroke, backgroundColor: look.bg, fillStyle: n.fillStyle ?? 'solid',
        strokeWidth: look.strokeWidth, roughness: look.roughness,
        strokeStyle: n.strokeStyle ?? 'solid',
        roundness: n.kind === 'box' ? null : (n.kind === 'round' || S.rounded) && n.kind !== 'diamond' && n.kind !== 'ellipse' ? ROUND : null,
      });
      produced.push(shape);
      if (n.label) produced.push(bindLabel(shape, n.label, labelOpts));
      anchor = shape;
      box = elementBox(shape);
    }

    if (n.sublabel) {
      const m = measureText(n.sublabel, FONT.S, S.fontFamily);
      produced.push(text({
        text: n.sublabel, fontSize: FONT.S, fontFamily: S.fontFamily,
        textAlign: 'center', strokeColor: PALETTE.grey.stroke,
        width: m.width, height: m.height,
        x: Math.round(box.x + (box.width - m.width) / 2),
        y: Math.round(bottom() + 4),
      }));
      grow(4 + m.height);
    }

    geom.set(n.id, box);
    if (anchor) anchorFor.set(n.id, anchor);
    noteChild(n.parent, extent ?? box);
    nodeLayer.push(...produced);
  }

  // ------------------------------------------------------------ boundaries
  //
  // A boundary is sized from what it actually contains, not from the grid, so a
  // wide box or a tall caption cannot poke out of its own scope.

  const boundaryBox = new Map();
  const resolveBoundary = (b, seen = new Set()) => {
    if (boundaryBox.has(b.id)) return boundaryBox.get(b.id);
    if (seen.has(b.id)) throw new Error(`boundary "${b.id}" is nested inside itself`);
    seen.add(b.id);
    const kids = [...(childrenOf.get(b.id) ?? [])];
    for (const other of boundaries) {
      if (other.parent === b.id) kids.push(resolveBoundary(other, seen));
    }
    const pad = {
      left: b.padLeft ?? 34, right: b.padRight ?? 34,
      top: b.padTop ?? 46, bottom: b.padBottom ?? 30,
    };
    let box;
    if (kids.length) {
      const u = bbox(kids.map((k) => ({ ...k, isDeleted: false, type: 'rectangle' })));
      box = {
        x: Math.round(u.x - pad.left), y: Math.round(u.y - pad.top),
        width: Math.round(u.width + pad.left + pad.right), height: Math.round(u.height + pad.top + pad.bottom),
      };
    } else {
      const left = colX(b.col ?? 0) - pad.left;
      const top = rowY(b.row ?? 0) - pad.top;
      box = {
        x: Math.round(left), y: Math.round(top),
        width: Math.round(colX((b.col ?? 0) + (b.cols ?? 1) - 1) + L.cell + pad.right - left),
        height: Math.round(rowY((b.row ?? 0) + (b.rows ?? 1) - 1) + L.cell + pad.bottom - top),
      };
    }
    boundaryBox.set(b.id, box);
    return box;
  };

  const frameIdFor = new Map();
  for (const b of boundaries) {
    const box = resolveBoundary(b);
    const look = accentOf(b.color ?? b.accent ?? 'grey');
    if (b.kind === 'frame') {
      const fr = frame({ name: b.label ?? null, x: box.x, y: box.y, width: box.width, height: box.height });
      frames.push(fr);
      frameIdFor.set(b.id, fr.id);
      continue;
    }
    const group = newId();
    const r = rectangle({
      x: box.x, y: box.y, width: box.width, height: box.height,
      strokeColor: look.stroke,
      backgroundColor: b.fill ?? 'transparent',
      fillStyle: 'solid',
      strokeWidth: b.strokeWidth ?? S.boundaryStrokeWidth,
      strokeStyle: b.dashed === false ? 'solid' : (b.strokeStyle ?? S.boundaryStroke),
      roughness: b.roughness ?? S.roughness,
      roundness: S.rounded ? ROUND : null,
      groupIds: [group],
    });
    scopes.push(r);
    if (b.label) {
      // Two placements, both from the corpus. `inside` tucks a small caption
      // into the top-left corner; `outside` sets a large coloured word clear of
      // the box, the way a CI or CD region gets named. Either way it is free
      // text - a bound label would centre itself over the contents.
      //
      // An outside label goes *above* the top-left corner rather than beside
      // the box. Beside is what the corpus does, but only because the space
      // there happened to be empty; above the top edge is the one strip that
      // is empty by construction, since boundaries are sized from contents.
      const outside = (b.labelPlacement ?? 'inside') === 'outside';
      const size = b.fontSize ?? (outside ? 48 : FONT.M);
      const m = measureText(b.label, size, S.fontFamily);
      scopes.push(text({
        text: b.label, fontSize: size, fontFamily: S.fontFamily,
        textAlign: 'left', strokeColor: look.stroke,
        width: m.width, height: m.height,
        x: Math.round(box.x + (outside ? 0 : 14)),
        y: Math.round(outside ? box.y - m.height - 10 : box.y + 12),
        groupIds: [group],
      }));
    }
  }

  // Assign frame membership after frames exist.
  if (frameIdFor.size) {
    for (const n of spec.nodes ?? []) {
      const fid = frameIdFor.get(n.parent);
      if (!fid) continue;
      const box = geom.get(n.id);
      for (const el of nodeLayer) {
        const b = elementBox(el);
        if (b.x >= box.x - 1 && b.y >= box.y - 1
          && b.x + b.width <= box.x + box.width + 1 && b.y + b.height <= box.y + box.height + 1) {
          el.frameId = fid;
        }
      }
    }
  }

  // ------------------------------------------------------------ edges

  const usedKinds = new Set();
  for (const e of spec.edges ?? []) {
    const from = geom.get(e.from);
    const to = geom.get(e.to);
    if (!from || !to) {
      report.notes.push(`edge ${e.from} -> ${e.to} skipped: unknown node id`);
      continue;
    }
    const kind = EDGE_KINDS[e.kind ?? 'flow'] ? (e.kind ?? 'flow') : 'flow';
    usedKinds.add(kind);
    const k = EDGE_KINDS[kind];
    const gap = e.gap ?? 8;
    const pts = routePoints(from, to, e.route ?? 'auto', gap);
    const ox = pts[0].x;
    const oy = pts[0].y;

    // An elbow arrow hands routing to the app, which keeps the corners square
    // when a box moves. It only works on a bound arrow: without a shape at each
    // end there is nothing to route between, so fall back to fixed points.
    const startAnchor = anchorFor.get(e.from);
    const endAnchor = anchorFor.get(e.to);
    const routing = e.routing ?? S.edgeRouting;
    const elbowed = routing === 'elbow' && !!startAnchor && !!endAnchor
      && (e.route ?? 'auto') !== 'straight';

    const a = arrow({
      x: Math.round(ox),
      y: Math.round(oy),
      points: pts.map((p) => [Math.round(p.x - ox), Math.round(p.y - oy)]),
      strokeColor: e.color ?? k.color,
      strokeWidth: e.strokeWidth ?? k.width,
      strokeStyle: e.strokeStyle ?? k.strokeStyle,
      roughness: e.roughness ?? STYLE.roughness,
      endArrowhead: e.endArrowhead === null ? null : (e.endArrowhead ?? 'arrow'),
      startArrowhead: e.startArrowhead ?? null,
      elbowed,
    });
    bindArrow(a, startAnchor, endAnchor, {
      gap,
      fixedPoints: elbowed ? edgePointsBetween(from, to) : null,
    });
    edgeLayer.push(a);

    if (e.label) {
      // Free text alongside the line, not a bound label: that is what the
      // corpus does, and an elbow arrow will not carry a bound label at all.
      const bound = e.labelBound ?? (S.edgeLabelBound && !elbowed);
      const size = e.labelSize ?? FONT.S;
      const m = measureText(e.label, size, S.fontFamily);
      const mid = polylineMidpoint(pts);
      // Sit above a horizontal run, beside a vertical one, so the line stays
      // unbroken instead of being knocked out by the text.
      const t = text({
        text: e.label, fontSize: size, fontFamily: S.fontFamily,
        textAlign: 'center', verticalAlign: 'middle',
        strokeColor: e.labelColor ?? k.color,
        containerId: bound ? a.id : null,
        width: m.width, height: m.height,
        x: Math.round(mid.x - m.width / 2 + (bound || mid.horizontal ? 0 : m.width / 2 + 14)),
        y: Math.round(mid.y - m.height / 2 - (bound || !mid.horizontal ? 0 : m.height / 2 + 10)),
      });
      if (bound) a.boundElements = [...(a.boundElements ?? []), { id: t.id, type: 'text' }];
      edgeLayer.push(t);
    }
  }

  // ------------------------------------------------------------ chrome

  const contentBox = bbox([...frames, ...scopes, ...nodeLayer, ...edgeLayer]);

  if (spec.title) {
    const m = measureText(spec.title, FONT.L, S.fontFamily);
    chrome.push(text({
      text: spec.title, fontSize: FONT.L, fontFamily: S.fontFamily,
      textAlign: 'left', strokeColor: PALETTE.black.stroke,
      width: m.width, height: m.height,
      x: Math.round(contentBox.x), y: Math.round(contentBox.y - m.height - 34),
    }));
  }

  if (spec.legend !== false && usedKinds.size > 1) {
    const lx = Math.round(spec.legendX ?? contentBox.x + contentBox.width + 90);
    const ly = Math.round(spec.legendY ?? contentBox.y);
    const group = newId();
    const title = measureText('Legend', FONT.M, S.fontFamily);
    chrome.push(text({
      text: 'Legend', fontSize: FONT.M, fontFamily: S.fontFamily, textAlign: 'left',
      strokeColor: PALETTE.black.stroke, width: title.width, height: title.height,
      x: lx, y: ly, groupIds: [group],
    }));
    [...usedKinds].forEach((kind, i) => {
      const k = EDGE_KINDS[kind];
      const y = ly + 44 + i * 40;
      chrome.push(arrow({
        x: lx, y,
        points: [[0, 0], [70, 0]],
        strokeColor: k.color, strokeWidth: k.width, strokeStyle: k.strokeStyle,
        roughness: S.roughness, groupIds: [group],
      }));
      const m = measureText(k.meaning, FONT.S, S.fontFamily);
      chrome.push(text({
        text: k.meaning, fontSize: FONT.S, fontFamily: S.fontFamily, textAlign: 'left',
        strokeColor: PALETTE.black.stroke, width: m.width, height: m.height,
        x: lx + 86, y: Math.round(y - m.height / 2), groupIds: [group],
      }));
    });
  }

  // Frames behind scopes behind nodes behind arrows: an arrow drawn under a
  // filled box disappears, and a scope drawn last hides its own contents.
  scene.elements = [...frames, ...scopes, ...nodeLayer, ...edgeLayer, ...chrome];
  reindex(scene.elements);
  return { scene, report };
}

function main(argv) {
  const [specPath] = positionals(argv, ['--out']);
  const outIdx = argv.indexOf('--out');
  const out = outIdx === -1 ? null : argv[outIdx + 1];
  if (!specPath || !out) {
    console.error('usage: build-diagram.mjs <spec.json> --out <file.excalidraw>');
    process.exit(2);
  }

  const spec = JSON.parse(readFileSync(specPath, 'utf8'));
  const { scene, report } = buildDiagram(spec);
  const backup = backupExisting(out);
  writeScene(out, scene);

  const view = bbox(scene.elements);
  console.log(JSON.stringify({
    wrote: out,
    backup,
    elements: scene.elements.length,
    embeddedFiles: Object.keys(scene.files).length,
    canvas: `${Math.round(view.width)}x${Math.round(view.height)}`,
    icons: {
      resolved: report.icons.length,
      opaqueBackground: report.opaqueIcons,
      // Items that already draw their own name, so no caption was added.
      selfCaptioned: report.selfCaptioned,
    },
    // Never quietly swallowed: an unfilled slot is visible in the scene and
    // named here, so it gets mentioned to the user rather than shipped.
    placeholders: report.missingIcons.length ? {
      count: report.missingIcons.length,
      forComponents: report.missingIcons,
      drawnAs: 'a dotted violet square with a "?", captioned, grouped',
      resolve: [
        'node find-icon.mjs "<component>"                    search the bundled libraries again',
        'node index-libraries.mjs --unnamed                  libraries whose items need looking at',
        'Then set "icon": "<library>:<n>" on the node and rebuild,',
        'or open the scene and drop the mark on top of the slot by hand.',
      ],
    } : null,
    notes: report.notes,
  }, null, 2));
}

if (process.argv[1] && process.argv[1].endsWith('build-diagram.mjs')) main(process.argv.slice(2));
