#!/usr/bin/env node
// Assemble a native, editable .drawio file from a compact JSON spec, applying
// the style tokens derived in references/style-guide.md and embedding custom
// icons from the bundled libraries so the result is portable.
//
//   node build-diagram.mjs spec.json --out diagram.drawio
//   node build-diagram.mjs spec.json --out diagram.drawio --force
//
// An existing target is never overwritten silently: a timestamped sibling
// backup is written first (see backupExisting).
//
// Placement is on a column/row grid using the observed pitch, which keeps
// generated output collision-free and readable. See the style guide's note on
// grid snapping - the reference diagrams are placed free-hand, so this is a
// deliberate normalisation, not an observed convention.

import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { dirname, join, basename, extname } from 'node:path';
import { resolve, recommendedSize, styleSafeDataUri, loadCatalog } from './find-icon.mjs';
import { getLogo, logoStyle, logoBox, DEFAULT_LOGO_SIZE } from './fetch-logo.mjs';

// ---------------------------------------------------------------- tokens

export const T = {
  text: '#232F3E',
  onDark: '#ffffff',
  flow: '#000000',
  error: '#CC0000',
  success: '#009900',
  proposed: '#E7157B',
  info: '#0050ef',
  infoStroke: '#001DBC',
  neutralStroke: '#666666',
  labelBg: '#E6E6E6',
  fontBody: 12,
  fontHeading: 16,
  iconSize: 78,
  colPitch: 320,
  rowPitch: 190,
};

// Icon captions render below the cell; boundaries must leave room for them.
const CAPTION_ROOM = 34;

const EDGE_KINDS = {
  flow: { stroke: T.flow, dashed: 0, width: 2, meaning: 'primary data or control flow' },
  async: { stroke: T.flow, dashed: 1, width: 2, meaning: 'scheduled, asynchronous or reference link' },
  error: { stroke: T.error, dashed: 0, width: 2, meaning: 'failure or exception path' },
  success: { stroke: T.success, dashed: 1, width: 2, meaning: 'successful completion path' },
  light: { stroke: T.neutralStroke, dashed: 1, width: 1, meaning: 'weak association' },
};

export const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const STYLE = {
  icon: (uri) => `shape=image;html=1;verticalLabelPosition=bottom;verticalAlign=top;`
    + `labelBackgroundColor=none;imageAspect=0;aspect=fixed;fontSize=${T.fontBody};fontColor=${T.text};image=${uri};`,
  aws4: (resIcon, fill) => `sketch=0;points=[[0,0,0],[0.25,0,0],[0.5,0,0],[0.75,0,0],[1,0,0],[0,1,0],[0.25,1,0],[0.5,1,0],`
    + `[0.75,1,0],[1,1,0],[0,0.25,0],[0,0.5,0],[0,0.75,0],[1,0.25,0],[1,0.5,0],[1,0.75,0]];outlineConnect=0;`
    + `fontColor=${T.text};gradientColor=none;fillColor=${fill};strokeColor=#ffffff;dashed=0;`
    + `verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=${T.fontBody};fontStyle=0;`
    + `aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=${resIcon};`,
  box: `rounded=0;whiteSpace=wrap;html=1;fillColor=none;strokeColor=${T.text};fontColor=${T.text};fontSize=${T.fontBody};`,
  note: `rounded=0;whiteSpace=wrap;html=1;fillColor=#F7F7F7;strokeColor=#DFDFDF;fontColor=#333333;fontSize=${T.fontBody};align=left;verticalAlign=top;spacing=6;`,
  text: (size, color, bold, align = 'center') =>
    `text;html=1;whiteSpace=wrap;align=${align};verticalAlign=middle;rounded=0;fillColor=none;strokeColor=none;`
    + `fontSize=${size};fontColor=${color};${bold ? 'fontStyle=1;' : ''}`,
  // Copied from the reference corpus verbatim apart from grIcon/colour.
  awsGroup: (grIcon, color) => 'points=[[0,0],[0.25,0],[0.5,0],[0.75,0],[1,0],[1,0.25],[1,0.5],[1,0.75],[1,1],'
    + '[0.75,1],[0.5,1],[0.25,1],[0,1],[0,0.75],[0,0.5],[0,0.25]];outlineConnect=0;gradientColor=none;html=1;'
    + `whiteSpace=wrap;fontSize=${T.fontBody};fontStyle=0;container=1;pointerEvents=0;collapsible=0;recursiveResize=0;`
    + `shape=mxgraph.aws4.group;grIcon=${grIcon};strokeColor=${color};fillColor=none;verticalAlign=top;align=left;`
    + `spacingLeft=30;fontColor=${color};dashed=0;`,
  scope: (color, dashed) => `rounded=0;whiteSpace=wrap;html=1;fillColor=none;strokeColor=${color};strokeWidth=3;`
    + `${dashed ? 'dashed=1;dashPattern=8 8;' : 'dashed=0;'}fontColor=${color};fontSize=${T.fontBody};`
    + 'verticalAlign=top;align=left;spacingLeft=8;spacingTop=2;container=1;collapsible=0;pointerEvents=0;',
  lane: `swimlane;html=1;whiteSpace=wrap;rounded=0;fillColor=none;strokeColor=${T.text};fontColor=${T.text};`
    + `fontSize=${T.fontHeading};fontStyle=1;startSize=34;horizontal=1;collapsible=0;container=1;`,
  edge: (k) => {
    const e = EDGE_KINDS[k] ?? EDGE_KINDS.flow;
    return `edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;jettySize=auto;orthogonalLoop=1;`
      + `strokeColor=${e.stroke};strokeWidth=${e.width};dashed=${e.dashed};endArrow=classic;endFill=1;`;
  },
  edgeLabel: (color) => `edgeLabel;html=1;align=center;verticalAlign=middle;resizable=0;`
    + `labelBackgroundColor=${T.labelBg};fontSize=11;fontColor=${color ?? T.text};`,
};

// ---------------------------------------------------------------- helpers

export function backupExisting(path) {
  if (!existsSync(path)) return null;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-');
  const backup = join(dirname(path), `${basename(path, extname(path))}.backup-${stamp}${extname(path)}`);
  copyFileSync(path, backup);
  return backup;
}

// Resolution never guesses. `spec.context.packs` biases the search toward the
// stack being drawn, a node's own `pack` pins it outright, and anything the
// resolver is not confident about is reported rather than silently drawn - a
// GCP diagram must not quietly receive an Azure icon.
function resolveIcon(node, catalog, report, contextPacks) {
  const query = typeof node === 'string' ? node : node.icon;
  if (!query) return null;
  const pinned = typeof node === 'object' ? node.pack ?? null : null;

  const r = resolve(query, { catalog, limit: 3, packs: contextPacks, pack: pinned });
  if (!r.groups.length) {
    report.missing.push({ query, ...(pinned ? { pack: pinned } : {}) });
    return null;
  }

  const g = r.groups[0];
  const chosen = g.variants[0];

  if (!r.confident) {
    report.ambiguous.push({
      query,
      reason: r.reason,
      chose: chosen.id,
      alternatives: r.groups.slice(0, 4).flatMap((x) => x.variants.slice(0, 2)).map((v) => v.id)
        .filter((id) => id !== chosen.id),
      fix: 'pin it with "pack": "<id>" on the node, or name the product more precisely',
    });
  }

  if (chosen.bytes === 'on-demand') {
    report.needsFetch.push({
      query, id: chosen.id, licence: chosen.licence, reason: chosen.reason, fetch: chosen.fetch,
    });
    return null;
  }

  report.used.push({ query, title: chosen.title, id: chosen.id, pack: chosen.pack });
  return chosen;
}

// ---------------------------------------------------------------- build

export function buildDiagram(spec) {
  const catalog = loadCatalog();
  const report = { used: [], missing: [], ambiguous: [], needsFetch: [], logos: [], missingLogos: [], opaqueLogos: [] };
  // Packs named by the spec win ties, so a diagram declared as GCP resolves
  // "cloud run" inside GCP rather than wherever the string happens to match.
  const contextPacks = spec.context?.packs ?? null;
  const L = { originX: 80, originY: 100, colPitch: T.colPitch, rowPitch: T.rowPitch, ...(spec.layout ?? {}) };
  const cells = [];
  const push = (xml) => cells.push(xml);

  const colX = (c) => L.originX + c * L.colPitch;
  const rowY = (r) => L.originY + r * L.rowPitch;

  let pageW = 0; let pageH = 0;
  const track = (x, y, w, h) => { pageW = Math.max(pageW, x + w); pageH = Math.max(pageH, y + h); };

  if (spec.title) {
    push(`<mxCell id="title" value="${esc(spec.title)}" style="${STYLE.text(T.fontHeading, spec.titleColor ?? T.text, true, 'left')}" vertex="1" parent="1">`
      + `<mxGeometry x="${L.originX}" y="${L.originY - 70}" width="900" height="30" as="geometry" /></mxCell>`);
  }

  // A boundary spans whole grid cells. Its box runs from the left edge of its
  // first column to the right edge of its last, with room under the bottom row
  // for the icon captions that hang below their cells.
  const boundaries = spec.boundaries ?? [];
  const byBoundaryId = new Map(boundaries.map((b) => [b.id, b]));
  const boxOf = (b) => {
    const left = colX(b.col) - (b.padLeft ?? 40);
    const top = rowY(b.row) - (b.padTop ?? 55);
    const right = colX(b.col + (b.cols ?? 1) - 1) + T.iconSize + (b.padRight ?? 40);
    const bottom = rowY(b.row + (b.rows ?? 1) - 1) + T.iconSize + CAPTION_ROOM + (b.padBottom ?? 25);
    return { x: left, y: top, width: right - left, height: bottom - top };
  };
  // Origin a child's coordinates are relative to. boxOf already returns
  // absolute page coordinates, so this is the parent's own box - not a sum up
  // the chain, which would count every ancestor twice.
  const originOf = (parentId) => {
    const b = byBoundaryId.get(parentId);
    return b ? boxOf(b) : { x: 0, y: 0 };
  };

  for (const b of boundaries) {
    const abs = boxOf(b);
    const origin = originOf(b.parent);
    let style;
    if (b.kind === 'aws-cloud') style = STYLE.awsGroup('mxgraph.aws4.group_aws_cloud_alt', b.color ?? T.text);
    else if (b.kind === 'aws-group') style = STYLE.awsGroup(b.grIcon, b.color ?? T.text);
    else if (b.kind === 'lane') style = STYLE.lane;
    else style = STYLE.scope(b.color ?? T.neutralStroke, b.dashed !== false);
    push(`<mxCell id="${esc(b.id)}" value="${esc(b.label ?? '')}" style="${style}" vertex="1" parent="${esc(b.parent ?? '1')}">`
      + `<mxGeometry x="${Math.round(abs.x - origin.x)}" y="${Math.round(abs.y - origin.y)}" `
      + `width="${Math.round(abs.width)}" height="${Math.round(abs.height)}" as="geometry" /></mxCell>`);
    track(abs.x, abs.y, abs.width, abs.height);
  }

  const nodeBox = new Map();
  for (const n of spec.nodes ?? []) {
    const parent = n.parent ?? '1';
    const w = n.width ?? (n.kind === 'icon' ? T.iconSize : 190);
    const h = n.height ?? (n.kind === 'icon' ? T.iconSize : 60);
    // Shapes bigger than an icon are centred on their grid cell in both axes,
    // so a box and an icon on the same row share a centre line and connectors
    // between them run straight instead of stepping.
    const origin = originOf(parent);
    const x = colX(n.col) + (T.iconSize - w) / 2 - origin.x;
    const y = rowY(n.row) + (T.iconSize - h) / 2 - origin.y;

    let style;
    if (n.kind === 'note') style = STYLE.note;
    else if (n.kind === 'text') style = STYLE.text(n.fontSize ?? T.fontBody, n.color ?? T.text, n.bold ?? false, n.align ?? 'center');
    else if (n.kind === 'aws4') style = STYLE.aws4(n.resIcon, n.color ?? '#ED7100');
    else if (n.kind === 'icon') {
      const icon = resolveIcon(n.icon ? n : { ...n, icon: n.label }, catalog, report, contextPacks);
      if (icon) {
        const dim = recommendedSize(icon, n.width ?? T.iconSize);
        style = STYLE.icon(styleSafeDataUri(icon));
        nodeBox.set(n.id, { w: dim.width, h: dim.height });
      } else {
        style = STYLE.box;
      }
    } else if (n.kind === 'logo') {
      // Third-party product logo from the local cache (see fetch-logo.mjs).
      const entry = getLogo(n.logo ?? n.label);
      if (entry) {
        const box = logoBox(entry, n.size ?? DEFAULT_LOGO_SIZE);
        style = logoStyle(entry);
        nodeBox.set(n.id, { w: n.width ?? box.width, h: n.height ?? box.height });
        report.logos.push({ name: entry.name, transparent: entry.transparent });
        if (!entry.transparent) {
          report.opaqueLogos.push(`${entry.name} (${entry.transparencyNote}) — renders as a solid box`);
        }
      } else {
        report.missingLogos.push(n.logo ?? n.label);
        style = STYLE.box;
      }
    } else style = STYLE.box;

    const box = nodeBox.get(n.id) ?? { w, h };
    push(`<mxCell id="${esc(n.id)}" value="${esc(n.label ?? '')}" style="${style}" vertex="1" parent="${esc(parent)}">`
      + `<mxGeometry x="${Math.round(x)}" y="${Math.round(y)}" width="${box.w}" height="${box.h}" as="geometry" /></mxCell>`);
    if (parent === '1') track(x, y, box.w, box.h);
  }

  let edgeSeq = 0;
  for (const e of spec.edges ?? []) {
    const id = e.id ?? `e${++edgeSeq}`;
    push(`<mxCell id="${esc(id)}" style="${STYLE.edge(e.kind ?? 'flow')}" edge="1" parent="1" `
      + `source="${esc(e.from)}" target="${esc(e.to)}"><mxGeometry relative="1" as="geometry" /></mxCell>`);
    if (e.label) {
      const color = EDGE_KINDS[e.kind ?? 'flow']?.stroke === T.flow ? T.text : EDGE_KINDS[e.kind].stroke;
      push(`<mxCell id="${esc(id)}-lbl" value="${esc(e.label)}" style="${STYLE.edgeLabel(color)}" vertex="1" connectable="0" parent="${esc(id)}">`
        + `<mxGeometry x="${e.labelPos ?? -0.1}" relative="1" as="geometry"><mxPoint as="offset" /></mxGeometry></mxCell>`);
    }
  }

  // Legend: the reference corpus documents line semantics explicitly, so any
  // diagram using more than one connector kind gets one.
  const kinds = [...new Set((spec.edges ?? []).map((e) => e.kind ?? 'flow'))];
  if (spec.legend !== false && kinds.length > 1) {
    const lx = spec.legendX ?? pageW + 120;
    const ly = spec.legendY ?? L.originY;
    push(`<mxCell id="legend" value="Legend" style="${STYLE.text(T.fontHeading, T.text, true, 'left')}" vertex="1" parent="1">`
      + `<mxGeometry x="${Math.round(lx)}" y="${Math.round(ly - 40)}" width="200" height="26" as="geometry" /></mxCell>`);
    kinds.forEach((k, i) => {
      const e = EDGE_KINDS[k] ?? EDGE_KINDS.flow;
      const y = ly + i * 40;
      push(`<mxCell id="legend-a${i}" value="" style="${STYLE.text(1, T.text, false)}" vertex="1" parent="1">`
        + `<mxGeometry x="${Math.round(lx)}" y="${Math.round(y)}" width="1" height="1" as="geometry" /></mxCell>`);
      push(`<mxCell id="legend-b${i}" value="" style="${STYLE.text(1, T.text, false)}" vertex="1" parent="1">`
        + `<mxGeometry x="${Math.round(lx + 70)}" y="${Math.round(y)}" width="1" height="1" as="geometry" /></mxCell>`);
      push(`<mxCell id="legend-e${i}" style="${STYLE.edge(k)}" edge="1" parent="1" source="legend-a${i}" target="legend-b${i}">`
        + '<mxGeometry relative="1" as="geometry" /></mxCell>');
      push(`<mxCell id="legend-t${i}" value="${esc(e.meaning)}" style="${STYLE.text(T.fontBody, T.text, false, 'left')}" vertex="1" parent="1">`
        + `<mxGeometry x="${Math.round(lx + 86)}" y="${Math.round(y - 15)}" width="230" height="30" as="geometry" /></mxCell>`);
      track(lx + 86, y - 15, 230, 30);
    });
  }

  const model = `<mxGraphModel dx="1400" dy="800" grid="0" gridSize="10" guides="1" tooltips="1" `
    + `connect="1" arrows="1" fold="1" page="0" pageScale="1" pageWidth="${Math.max(850, Math.round(pageW + 120))}" `
    + `pageHeight="${Math.max(1100, Math.round(pageH + 120))}" math="0" shadow="0">\n`
    + `    <root>\n      <mxCell id="0" />\n      <mxCell id="1" parent="0" />\n      `
    + cells.join('\n      ') + '\n    </root>\n  </mxGraphModel>';

  const xml = `<mxfile host="Electron" agent="arkitect-drawio" version="29.0.3">\n`
    + `  <diagram name="${esc(spec.page ?? 'Architecture')}" id="${esc(spec.pageId ?? 'generated-page-1')}">\n    `
    + model + '\n  </diagram>\n</mxfile>\n';

  return { xml, report };
}

function main(argv) {
  const specPath = argv.find((a) => !a.startsWith('--'));
  const outIdx = argv.indexOf('--out');
  const out = outIdx === -1 ? null : argv[outIdx + 1];
  if (!specPath || !out) { console.error('usage: build-diagram.mjs <spec.json> --out <file.drawio>'); process.exit(2); }

  const spec = JSON.parse(readFileSync(specPath, 'utf8'));
  const { xml, report } = buildDiagram(spec);
  const backup = backupExisting(out);
  writeFileSync(out, xml);

  console.log(JSON.stringify({
    wrote: out, bytes: Buffer.byteLength(xml), backup,
    icons: {
      resolved: report.used.length,
      missing: report.missing,
      ambiguous: report.ambiguous,
      needsFetch: report.needsFetch,
      ...(spec.context?.packs ? { contextPacks: spec.context.packs } : {}),
    },
    logos: { embedded: report.logos.length, missing: report.missingLogos, opaqueBackground: report.opaqueLogos },
  }, null, 2));
}

if (process.argv[1] && process.argv[1].endsWith('build-diagram.mjs')) main(process.argv.slice(2));
