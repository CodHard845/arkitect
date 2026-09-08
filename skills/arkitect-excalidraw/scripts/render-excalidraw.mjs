#!/usr/bin/env node
// Render a .excalidraw scene to a standalone SVG so the diagram can actually be
// looked at without opening the app.
//
//   node render-excalidraw.mjs scene.excalidraw --out preview.svg
//   node render-excalidraw.mjs scene.excalidraw --out preview.svg --style clean
//   node render-excalidraw.mjs scene.excalidraw --out preview.svg --scale 2
//
// --style rough (default) reproduces the hand-drawn stroke; --style clean draws
// exact geometry, which is the better choice when the question is whether the
// layout collides. Neither is pixel-identical to Excalidraw's own export: the
// hand-drawn fonts are not installed here and fills are flat. Open the scene in
// the local container when exact appearance matters.

import { writeFileSync } from 'node:fs';
import { readScene, elementBox, bbox, LINE_HEIGHT, positionals } from './lib/excalidraw-core.mjs';
import { roughPath, roughRect, roughDiamond, roughEllipse, roundedRectPath, adaptiveRadius } from './lib/rough.mjs';

const FONT_STACK = {
  1: "Excalifont, Virgil, 'Segoe Print', 'Comic Sans MS', cursive",
  2: "Nunito, Helvetica, Arial, sans-serif",
  3: "'Cascadia Code', 'Comic Shanns', Consolas, 'Courier New', monospace",
  5: "Excalifont, Virgil, 'Segoe Print', 'Comic Sans MS', cursive",
  6: "Nunito, Helvetica, Arial, sans-serif",
  7: "'Lilita One', Impact, sans-serif",
  8: "'Comic Shanns', 'Comic Sans MS', cursive",
};

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const f = (n) => Math.round(n * 100) / 100;

function dashArray(el) {
  const w = el.strokeWidth || 1;
  if (el.strokeStyle === 'dashed') return `${f(8 * w)} ${f(8 * w)}`;
  if (el.strokeStyle === 'dotted') return `${f(1.5 * w)} ${f(6 * w)}`;
  return null;
}

// Hachure and cross-hatch become SVG patterns, one per colour/style pair.
function fillRef(el, patterns) {
  const bg = el.backgroundColor;
  if (!bg || bg === 'transparent') return 'none';
  if (el.fillStyle === 'solid' || !el.fillStyle) return bg;
  const key = `${el.fillStyle}-${bg.replace('#', '')}`;
  if (!patterns.has(key)) {
    const lines = el.fillStyle === 'cross-hatch'
      ? '<path d="M0 0 L8 8 M8 0 L0 8" />'
      : '<path d="M-2 8 L8 -2 M0 10 L10 0" />';
    patterns.set(key, `<pattern id="${key}" width="8" height="8" patternUnits="userSpaceOnUse">`
      + `<g stroke="${bg}" stroke-width="1.6" fill="none">${lines}</g></pattern>`);
  }
  return `url(#${key})`;
}

function strokeAttrs(el) {
  const dash = dashArray(el);
  return `stroke="${el.strokeColor}" stroke-width="${el.strokeWidth || 1}" `
    + 'stroke-linecap="round" stroke-linejoin="round" fill="none"'
    + (dash ? ` stroke-dasharray="${dash}"` : '');
}

function arrowhead(kind, x, y, angle, el) {
  if (!kind) return '';
  const size = 12 + (el.strokeWidth || 1) * 2;
  const a1 = angle + Math.PI - 0.45;
  const a2 = angle + Math.PI + 0.45;
  const p1 = [x + size * Math.cos(a1), y + size * Math.sin(a1)];
  const p2 = [x + size * Math.cos(a2), y + size * Math.sin(a2)];
  const common = `stroke="${el.strokeColor}" stroke-width="${el.strokeWidth || 1}" stroke-linecap="round" stroke-linejoin="round"`;
  if (kind === 'triangle' || kind === 'triangle_outline') {
    return `<path d="M ${f(x)} ${f(y)} L ${f(p1[0])} ${f(p1[1])} L ${f(p2[0])} ${f(p2[1])} Z" `
      + `${common} fill="${kind === 'triangle' ? el.strokeColor : 'none'}" />`;
  }
  if (kind === 'dot' || kind === 'circle' || kind === 'circle_outline') {
    return `<circle cx="${f(x)}" cy="${f(y)}" r="${f(size / 2.6)}" ${common} `
      + `fill="${kind === 'circle_outline' ? 'none' : el.strokeColor}" />`;
  }
  if (kind === 'bar') {
    const b1 = [x + size * 0.6 * Math.cos(angle + Math.PI / 2), y + size * 0.6 * Math.sin(angle + Math.PI / 2)];
    const b2 = [x + size * 0.6 * Math.cos(angle - Math.PI / 2), y + size * 0.6 * Math.sin(angle - Math.PI / 2)];
    return `<path d="M ${f(b1[0])} ${f(b1[1])} L ${f(b2[0])} ${f(b2[1])}" ${common} fill="none" />`;
  }
  if (kind === 'diamond' || kind === 'diamond_outline') {
    const back = [x + size * Math.cos(angle + Math.PI), y + size * Math.sin(angle + Math.PI)];
    const mid = [(x + back[0]) / 2, (y + back[1]) / 2];
    const s1 = [mid[0] + (size / 2.2) * Math.cos(angle + Math.PI / 2), mid[1] + (size / 2.2) * Math.sin(angle + Math.PI / 2)];
    const s2 = [mid[0] + (size / 2.2) * Math.cos(angle - Math.PI / 2), mid[1] + (size / 2.2) * Math.sin(angle - Math.PI / 2)];
    return `<path d="M ${f(x)} ${f(y)} L ${f(s1[0])} ${f(s1[1])} L ${f(back[0])} ${f(back[1])} L ${f(s2[0])} ${f(s2[1])} Z" `
      + `${common} fill="${kind === 'diamond' ? el.strokeColor : 'none'}" />`;
  }
  // default "arrow": two barbs
  return `<path d="M ${f(p1[0])} ${f(p1[1])} L ${f(x)} ${f(y)} L ${f(p2[0])} ${f(p2[1])}" ${common} fill="none" />`;
}

function renderText(el, knockout = null) {
  const family = FONT_STACK[el.fontFamily] ?? FONT_STACK[1];
  const lineHeight = el.fontSize * (el.lineHeight ?? LINE_HEIGHT[el.fontFamily] ?? 1.25);
  const lines = String(el.text ?? '').split('\n');
  const anchor = el.textAlign === 'center' ? 'middle' : el.textAlign === 'right' ? 'end' : 'start';
  const ax = el.textAlign === 'center' ? el.x + el.width / 2 : el.textAlign === 'right' ? el.x + el.width : el.x;
  // Excalidraw positions the first baseline about 0.79 of a line-height down.
  const baseline = el.y + lineHeight * 0.79;
  const tspans = lines.map((l, i) =>
    `<tspan x="${f(ax)}" y="${f(baseline + i * lineHeight)}">${esc(l) || ' '}</tspan>`).join('');
  // Excalidraw clears the canvas behind a label bound to an arrow, so the text
  // is readable where it crosses the line. Without it the preview looks worse
  // than the real thing and invites a pointless layout fix.
  const bg = knockout
    ? `<rect x="${f(el.x - 4)}" y="${f(el.y - 2)}" width="${f(el.width + 8)}" height="${f(el.height + 4)}" `
      + `fill="${knockout}" stroke="none" />`
    : '';
  return `${bg}<text font-family="${family}" font-size="${el.fontSize}" fill="${el.strokeColor}" `
    + `text-anchor="${anchor}" style="white-space:pre">${tspans}</text>`;
}

function renderElement(el, scene, patterns) {
  if (el.isDeleted) return '';
  const opacity = (el.opacity ?? 100) / 100;
  const seed = el.seed ?? 1;
  const roughness = el.roughness ?? 1;
  const rough = { seed, roughness, passes: el.strokeStyle === 'solid' ? 2 : 1 };
  const fill = fillRef(el, patterns);
  let body = '';

  switch (el.type) {
    case 'rectangle':
    case 'frame':
    case 'magicframe': {
      const r = el.roundness ? adaptiveRadius(el.width, el.height) : 0;
      const outline = r > 0
        ? roundedRectPath(el.x, el.y, el.width, el.height, r)
        : roughRect(el.x, el.y, el.width, el.height, rough);
      const fillPath = r > 0 ? outline : roughRect(el.x, el.y, el.width, el.height, { ...rough, roughness: 0, passes: 1 });
      body = (fill !== 'none' ? `<path d="${fillPath}" fill="${fill}" stroke="none" />` : '')
        + `<path d="${outline}" ${strokeAttrs(el)} />`;
      if (el.type === 'frame' && el.name) {
        body += `<text x="${f(el.x)}" y="${f(el.y - 8)}" font-family="${FONT_STACK[2]}" font-size="14" `
          + `fill="#868e96">${esc(el.name)}</text>`;
      }
      break;
    }
    case 'ellipse': {
      const d = roughness === 0
        ? `M ${f(el.x)} ${f(el.y + el.height / 2)} a ${f(el.width / 2)} ${f(el.height / 2)} 0 1 0 ${f(el.width)} 0 a ${f(el.width / 2)} ${f(el.height / 2)} 0 1 0 ${f(-el.width)} 0`
        : roughEllipse(el.x + el.width / 2, el.y + el.height / 2, el.width, el.height, { seed, roughness });
      body = (fill !== 'none' ? `<path d="${d}" fill="${fill}" stroke="none" />` : '')
        + `<path d="${d}" ${strokeAttrs(el)} />`;
      break;
    }
    case 'diamond': {
      const d = roughDiamond(el.x, el.y, el.width, el.height, rough);
      const flat = roughDiamond(el.x, el.y, el.width, el.height, { ...rough, roughness: 0, passes: 1 });
      body = (fill !== 'none' ? `<path d="${flat}" fill="${fill}" stroke="none" />` : '')
        + `<path d="${d}" ${strokeAttrs(el)} />`;
      break;
    }
    case 'line':
    case 'arrow': {
      const pts = (el.points ?? []).map(([px, py]) => [el.x + px, el.y + py]);
      if (pts.length < 2) break;
      const closed = el.type === 'line'
        && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 1;
      const d = roughPath(pts, { ...rough, closed });
      body = (closed && fill !== 'none'
        ? `<path d="${roughPath(pts, { ...rough, roughness: 0, passes: 1, closed: true })}" fill="${fill}" stroke="none" />`
        : '')
        + `<path d="${d}" ${strokeAttrs(el)} />`;
      if (el.type === 'arrow') {
        const [ex, ey] = pts[pts.length - 1];
        const [bx, by] = pts[pts.length - 2];
        body += arrowhead(el.endArrowhead, ex, ey, Math.atan2(ey - by, ex - bx), el);
        const [sx, sy] = pts[0];
        const [nx, ny] = pts[1];
        body += arrowhead(el.startArrowhead, sx, sy, Math.atan2(sy - ny, sx - nx), el);
      }
      break;
    }
    case 'freedraw': {
      const pts = (el.points ?? []).map(([px, py]) => [el.x + px, el.y + py]);
      if (pts.length < 2) break;
      body = `<path d="${roughPath(pts, { ...rough, roughness: 0, passes: 1 })}" ${strokeAttrs(el)} />`;
      break;
    }
    case 'text': {
      const container = el.containerId ? scene.elements.find((o) => o.id === el.containerId) : null;
      body = renderText(el, container?.type === 'arrow'
        ? (scene.appState?.viewBackgroundColor ?? '#ffffff')
        : null);
      break;
    }
    case 'image': {
      const file = scene.files?.[el.fileId];
      if (file?.dataURL) {
        body = `<image href="${esc(file.dataURL)}" x="${f(el.x)}" y="${f(el.y)}" `
          + `width="${f(el.width)}" height="${f(el.height)}" preserveAspectRatio="xMidYMid meet" />`;
      } else {
        body = `<rect x="${f(el.x)}" y="${f(el.y)}" width="${f(el.width)}" height="${f(el.height)}" `
          + 'fill="none" stroke="#e03131" stroke-dasharray="4 4" />'
          + `<text x="${f(el.x + el.width / 2)}" y="${f(el.y + el.height / 2)}" text-anchor="middle" `
          + `font-size="11" fill="#e03131">missing file</text>`;
      }
      break;
    }
    case 'embeddable':
    case 'iframe':
      body = `<rect x="${f(el.x)}" y="${f(el.y)}" width="${f(el.width)}" height="${f(el.height)}" `
        + `fill="#f1f3f5" stroke="${el.strokeColor}" />`;
      break;
    default:
      return '';
  }

  const rot = el.angle
    ? ` transform="rotate(${f((el.angle * 180) / Math.PI)} ${f(el.x + (el.width ?? 0) / 2)} ${f(el.y + (el.height ?? 0) / 2)})"`
    : '';
  return `<g opacity="${opacity}"${rot}>${body}</g>`;
}

export function sceneToSvg(scene, { padding = 40, scale = 1, style = 'rough', background = null } = {}) {
  const elements = (scene.elements ?? []).filter((el) => !el.isDeleted);
  // Excalidraw's own fonts are not installed here, so the substitute face runs
  // wider than the stored width. Inflate text boxes when sizing the viewport so
  // a caption at the edge is not sliced off; the elements themselves are
  // untouched.
  const view = bbox(elements.map((el) => (el.type === 'text'
    ? { ...el, width: (el.width ?? 0) * 1.2, height: (el.height ?? 0) * 1.1 }
    : el)));
  const width = Math.max(1, view.width + padding * 2);
  const height = Math.max(1, view.height + padding * 2);
  const patterns = new Map();

  // Frames first, then everything else in scene order, so a frame border never
  // sits on top of its own children.
  const ordered = [
    ...elements.filter((el) => el.type === 'frame' || el.type === 'magicframe'),
    ...elements.filter((el) => el.type !== 'frame' && el.type !== 'magicframe'),
  ].map((el) => (style === 'clean' ? { ...el, roughness: 0 } : el));

  const body = ordered.map((el) => renderElement(el, scene, patterns)).join('\n  ');
  const bg = background ?? scene.appState?.viewBackgroundColor ?? '#ffffff';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${f(width * scale)}" height="${f(height * scale)}"
     viewBox="${f(view.x - padding)} ${f(view.y - padding)} ${f(width)} ${f(height)}">
  <defs>${[...patterns.values()].join('')}</defs>
  <rect x="${f(view.x - padding)}" y="${f(view.y - padding)}" width="${f(width)}" height="${f(height)}" fill="${bg}" />
  ${body}
</svg>
`;
}

function main(argv) {
  const positional = positionals(argv, ['--out', '--padding', '--scale', '--style', '--background']);
  const flag = (n) => { const i = argv.indexOf(n); return i === -1 ? null : argv[i + 1]; };
  const src = positional[0];
  const out = flag('--out') ?? (src ? src.replace(/\.excalidraw$/, '') + '.svg' : null);
  if (!src) {
    console.error('usage: render-excalidraw.mjs <scene.excalidraw> [--out preview.svg] [--style rough|clean] [--scale N] [--padding N]');
    process.exit(2);
  }

  const scene = readScene(src);
  const svg = sceneToSvg(scene, {
    padding: flag('--padding') ? Number(flag('--padding')) : 40,
    scale: flag('--scale') ? Number(flag('--scale')) : 1,
    style: flag('--style') ?? 'rough',
    background: flag('--background'),
  });
  writeFileSync(out, svg);

  const view = bbox(scene.elements.filter((e) => !e.isDeleted));
  console.log(JSON.stringify({
    wrote: out,
    bytes: Buffer.byteLength(svg),
    elements: scene.elements.filter((e) => !e.isDeleted).length,
    files: Object.keys(scene.files ?? {}).length,
    canvas: `${Math.round(view.width)}x${Math.round(view.height)}`,
    note: 'geometry-faithful preview; hand-drawn fonts are substituted and fills are flat',
  }, null, 2));
}

if (process.argv[1] && process.argv[1].endsWith('render-excalidraw.mjs')) main(process.argv.slice(2));
