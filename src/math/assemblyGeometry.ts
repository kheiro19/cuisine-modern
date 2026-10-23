// src/math/assemblyGeometry.ts
// The static boards, facades, Gola channels and appliance bodies of a cabinet as plain boxes in millimetres, derived
// from the same zone layout the BOM uses. The 3D component only turns these boxes into meshes, and a test compares
// them to the BOM parts, so the picture and the cutting list are the same cabinet.
// Cabinet-local coordinates: x 0..width (left to right), y 0..height (bottom to top), z centred on the depth
// (back face at -depth/2, front at +depth/2).
import { ApplianceKind, CabinetObject } from '../types/flatma';
import { PANEL, PULL_OUT } from './constants';
import { FacadeMotion, dividerBoardsOf, motionOf, topOf } from '../rules';
import { DrawerBoardGeo, drawerBoxBoards, runnerLengthMm } from './drawerBox';
import { CORNER } from './constants';
import { backBoxesOf, backInsideMm } from './backPanel';
import { APPLIANCES, Facade, GolaChannel, backPanelBottomMm, isOpenCarcase, layoutZones, nicheOf, planFronts, zonesOf } from './zones';
import { frontStripOf, shelfSpansOf } from './columns';
import { carcaseSidesOf } from './carcaseSides';
import { BaseBox, baseBoxes, bodyView } from './base';

export interface BoxGeo {
  key: string;
  kind: 'side' | 'bottom' | 'divider' | 'vdivider' | 'rail' | 'roof' | 'back' | 'backpanel' | 'backrail' | 'fillerreturn' | 'shelf';
  sizeMm: [number, number, number];
  centerMm: [number, number, number];
}

export type { FacadeMotion };
export { runnerLengthMm };

/** The basket frame behind a pull-out front, in the same millimetres as the boxes (closed position). */
export interface FrameGeo {
  sizeMm: [number, number, number];
  centerMm: [number, number, number];
  levels: number;
}

export interface FacadeGeo extends Facade {
  motion: FacadeMotion;
  /** Hinge side of a swinging door (null otherwise). */
  hinge: 'LEFT' | 'RIGHT' | null;
  /** Depth position of the facade centre. */
  zMm: number;
  /** Pull-out frames only. */
  frame?: FrameGeo;
  /** Sliding drawers only: the five boards of the drawer box, closed position (they travel with the front). */
  box?: DrawerBoardGeo[];
}

export interface ApplianceGeo {
  zoneIndex: number;
  appliance: ApplianceKind;
  /** The piece of the accessories library drawn in the niche, when the zone names one. */
  libraryId?: string;
  /** True when nothing hides the appliance (no decor panel in front of it): its own front is what the client sees. */
  frontVisible: boolean;
  sizeMm: [number, number, number];
  centerMm: [number, number, number];
  /**
   * The appliance's front frame: wider / taller than the niche so it overlaps the cabinet edges, standing out in front of the
   * carcase face (its back face is on the front plane). Absent when the appliance has no trim or sits behind a decor panel.
   */
  trim?: { sizeMm: [number, number, number]; centerMm: [number, number, number] };
}

export interface AssemblyGeometry {
  boxes: BoxGeo[];
  facades: FacadeGeo[];
  channels: GolaChannel[];
  appliances: ApplianceGeo[];
  /** The legs, plinth board or wooden frame under the body, in floor coordinates (math/base.ts). Empty when the cabinet has no base. */
  base: BaseBox[];
}

export const facadeKey = (f: Pick<Facade, 'zoneIndex' | 'kind' | 'index' | 'column'>): string =>
  f.column === 'FILL' ? `facade-${f.zoneIndex}-${f.kind}-f${f.index}` : `facade-${f.zoneIndex}-${f.kind}-${f.index}`;
export const applianceKey = (zoneIndex: number): string => `appliance-${zoneIndex}`;

export interface AssemblyOptions {
  carcaseTh: number;
  frontTh: number;
  /** The doors lift up (overhead lift hardware) instead of swinging. */
  lift: boolean;
  /** Inset hinges: the facade sits inside the carcase instead of in front of it. */
  inset: boolean;
}

export function assemblyGeometry(cabIn: CabinetObject, o: AssemblyOptions): AssemblyGeometry {
  const { carcaseTh: th, frontTh } = o;
  // Everything below is the BODY of the cabinet (y from 0 = its bottom board); the base is returned apart, in floor coordinates (math/base.ts).
  const cab = bodyView(cabIn);
  const W = cab.width, H = cab.height, D = cab.depth;
  const sides = carcaseSidesOf(cab, th);
  const inner = sides.innerMm;
  const cx = sides.centerMm; // middle of the boards between the sides
  const zones = zonesOf(cab);
  const open = isOpenCarcase(zones);
  const layout = layoutZones(cab, th, { inset: o.inset });
  const plan = planFronts(cab, layout, { inset: o.inset, frontThMm: frontTh });
  const boxes: BoxGeo[] = [];
  // A full back panel is fitted inside the rear (math/backPanel.ts): what runs from the back to the front stops at it.
  const backIn = backInsideMm(cab, th);
  const zBackBoard = backIn / 2; // middle of the shortened boards, measured from the middle of the depth

  if (sides.left) boxes.push({ key: 'side-left', kind: 'side', sizeMm: [th, H, D], centerMm: [th / 2, H / 2, 0] });
  if (sides.right) boxes.push({ key: 'side-right', kind: 'side', sizeMm: [th, H, D], centerMm: [W - th / 2, H / 2, 0] });
  if (!open) boxes.push({ key: 'bottom', kind: 'bottom', sizeMm: [inner, th, D], centerMm: [cx, th / 2, 0] });
  // One shared board per divider, or two glued face to face (rules/construction.ts). Always drawn, also above an open bay.
  {
    const boards = dividerBoardsOf(cab);
    layout.dividerBottomsMm.forEach((y, i) => {
      for (let b = 0; b < boards; b++) boxes.push({ key: b === 0 ? `divider-${i}` : `divider-${i}-${b + 1}`, kind: 'divider', sizeMm: [inner, th, D - backIn], centerMm: [cx, y + b * th + th / 2, zBackBoard] });
    });
  }

  // A vertical board inside a zone (math/columns.ts): as tall as the zone's opening, as deep as the cabinet.
  // (Drawn for every zone: an open bay cannot be split, but the zones above it can.)
  {
    layout.bands.forEach((band) => {
      if (!band.split) return;
      boxes.push({ key: `vdiv-${band.index}`, kind: 'vdivider', sizeMm: [band.split.boardWidthMm, band.openingHeightMm, D - backIn], centerMm: [band.split.boardXLoMm + band.split.boardWidthMm / 2, band.openingBottomMm + band.openingHeightMm / 2, zBackBoard] });
    });
    // The hinge boards of a row of several doors (zones.ts partitions): same height and depth as a vertical board.
    layout.bands.forEach((band) => {
      (band.partitions ?? []).forEach((p) => {
        // One box per board: two doors hung on the same edge have a board each, back to back (a stack of `boards` boards).
        const each = p.widthMm / p.boards;
        for (let i = 0; i < p.boards; i++) {
          boxes.push({ key: `vpart-${band.index}-${p.edge}${p.boards > 1 ? `-${i + 1}` : ''}`, kind: 'vdivider', sizeMm: [each, band.openingHeightMm, D - backIn], centerMm: [p.xLoMm + (i + 0.5) * each, band.openingBottomMm + band.openingHeightMm / 2, zBackBoard] });
        }
      });
    });
  }

  if (topOf(cab) === 'RAILS') {
    // Two stretcher rails flush with the front and the back (the front one used to float in the middle of the depth).
    const railZ = D / 2 - PANEL.TRAVERSE_DEPTH_MM / 2;
    boxes.push({ key: 'rail-front', kind: 'rail', sizeMm: [inner, th, PANEL.TRAVERSE_DEPTH_MM], centerMm: [cx, H - th / 2, railZ] });
    boxes.push({ key: 'rail-rear', kind: 'rail', sizeMm: [inner, th, PANEL.TRAVERSE_DEPTH_MM], centerMm: [cx, H - th / 2, -railZ] });
  } else {
    boxes.push({ key: 'roof', kind: 'roof', sizeMm: [inner, th, D], centerMm: [cx, H - th / 2, 0] });
  }

  // A corner filler is an L in plan, not a flat flap: behind the front leg stands a RETURN, from the cabinet's own board,
  // flush with the filler's inner face and CORNER.FILLER_RETURN_MM deep. It is what the drawer runners are fixed to, and it
  // closes the gap a client would otherwise see between the filler and the box of a drawer.
  plan.facades.filter((f) => f.kind === 'FILLER').forEach((f) => {
    const innerFace = f.xMm < 1 ? f.widthMm : f.xMm;          // left filler: face at +width; right filler: face at xMm
    const t = th;
    const d = Math.min(CORNER.FILLER_RETURN_MM, D);
    // It stands between the bottom board (none over an appliance bay) and the top board, like the other vertical boards.
    const y0 = open ? 0 : th, y1 = H - th;
    boxes.push({
      key: `filler-return-${f.xMm < 1 ? 'left' : 'right'}`, kind: 'fillerreturn',
      sizeMm: [t, Math.max(0, y1 - y0), d],
      centerMm: [(f.xMm < 1 ? innerFace - t / 2 : innerFace + t / 2), (y0 + y1) / 2, D / 2 - d / 2],
    });
  });

  // The back of the closed part — HDF sheet, two carcase rails or a full carcase board, whoever the user picked
  // (math/backPanel.ts, the same numbers the cutting list uses). Behind an open bay it is not drawn at all.
  {
    const backBottom = backPanelBottomMm(layout);
    backBoxesOf(cab, {
      bottomMm: backBottom,
      closedHeightMm: H - backBottom,
      widthMm: W,
      innerWidthMm: inner,
      centerXMm: cx,
      carcaseThMm: th,
      bottomBoardMm: backBottom > 0 || !open ? th : 0,
      topBoardMm: th, // the roof, or the two stretchers of a base unit: the back stops under them
    }, D).forEach((b) => boxes.push({ key: b.key, kind: b.kind, sizeMm: b.sizeMm, centerMm: b.centerMm }));
  }

  // Columns with pull-out frames carry baskets, not fixed shelves (the BOM skips them too: math/columns.ts shelfSpansOf).
  layout.bands.forEach((band) => {
    const count = Math.max(0, Math.round(band.zone.shelves ?? 0));
    if (count === 0) return;
    const mainHasBaskets = plan.facades.some((f) => f.zoneIndex === band.index && f.column !== 'FILL' && f.kinematic === 'PULL_OUT_FRAME');
    shelfSpansOf(band.zone, band.split, th, W, mainHasBaskets, band.partitions).forEach((span) => {
      for (let k = 0; k < count; k++) {
        const y = band.openingBottomMm + (band.openingHeightMm * (k + 1)) / (count + 1);
        const tag = `${span.column === 'ALL' ? '' : span.column === 'FILL' ? 'f-' : 'm-'}${span.part !== undefined ? `p${span.part}-` : ''}`;
        const key = `shelf-${band.index}-${tag}${k}`;
        boxes.push({ key, kind: 'shelf', sizeMm: [span.hiMm - span.loMm - PANEL.SHELF_WIDTH_CLEARANCE_MM, th, D - PANEL.SHELF_DEPTH_INSET_MM - backIn], centerMm: [(span.loMm + span.hiMm) / 2, y, (backIn - PANEL.SHELF_DEPTH_INSET_MM) / 2] });
      }
    });
  });

  const frontZ = o.inset ? D / 2 - frontTh / 2 : D / 2 + frontTh / 2;
  // The room a front really has behind it: the carcase between its sides AND the width the front itself covers. In an L corner
  // arm one side is open and a fixed filler takes the first 19.5 mm, so the box must start where the front starts — otherwise
  // it pokes out beside the filler and is seen from the open side of the corner (the front would not cover it).
  const roomOf = (f: { xMm: number; widthMm: number; innerLoMm?: number; innerHiMm?: number }) => ({
    loMm: Math.max(sides.loMm, f.innerLoMm ?? sides.loMm, f.xMm),
    hiMm: Math.min(sides.hiMm, f.innerHiMm ?? sides.hiMm, f.xMm + f.widthMm),
  });
  const facades: FacadeGeo[] = plan.facades.map((f) => {
    const motion: FacadeMotion = motionOf(f.kind, { lift: o.lift, kinematic: f.kinematic });
    const geo: FacadeGeo = { ...f, motion, hinge: motion === 'SWING' ? (f.hingeSide ?? (f.index % 2 === 0 ? 'LEFT' : 'RIGHT')) : null, zMm: frontZ };
    if (motion === 'SLIDE') geo.box = drawerBoxBoards(f, cab, { carcaseTh: th, frontBackZMm: frontZ - frontTh / 2, spanMm: roomOf(f) });
    if (motion === 'PULL_OUT') {
      // One frame per front, between the runners: a door zone shares the inner width among its fronts, drawers use all of it.
      // In a split zone the frame sits in its own column (between the side board and the vertical board).
      const columns = f.kind === 'DOOR' ? Math.max(1, f.count) : 1;
      const room = roomOf(f);
      const lo = room.loMm, hi = room.hiMm;
      const column = (hi - lo) / columns;
      const w = Math.max(50, column - 2 * PULL_OUT.RUNNER_SPACE_MM);
      const h = Math.max(100, f.heightMm - 2 * PULL_OUT.VERTICAL_MARGIN_MM);
      const d = runnerLengthMm(D);
      const cx = f.kind === 'DOOR' ? lo + (f.index + 0.5) * column : (lo + hi) / 2;
      const zRear = frontZ - frontTh / 2; // back face of the front
      geo.frame = { sizeMm: [w, h, d], centerMm: [cx, f.yMm + f.heightMm / 2, zRear - PULL_OUT.FRONT_GAP_MM - d / 2], levels: f.levels ?? PULL_OUT.DEFAULT_LEVELS };
    }
    return geo;
  });

  const appliances: ApplianceGeo[] = [];
  layout.bands.forEach((band) => {
    if (band.zone.kind !== 'APPLIANCE' || !band.zone.appliance) return;
    const spec = APPLIANCES[band.zone.appliance];
    const niche = nicheOf(band.zone)!; // the standard of its kind, or the real size the user stated
    // With a vertical board the appliance sits in its own column; otherwise it is centred across the whole interior.
    const col = band.split?.main;
    const cx = col ? (col.innerLoMm + col.innerHiMm) / 2 : W / 2;
    const w = Math.min((col ? col.innerHiMm - col.innerLoMm : inner) - 4, niche.w);
    const h = Math.min(band.openingHeightMm - 4, niche.h);
    const d = Math.min(D - 30, niche.d);
    const cy = band.openingBottomMm + 2 + h / 2;
    const geo: ApplianceGeo = { zoneIndex: band.index, appliance: band.zone.appliance, ...(band.zone.libraryApplianceId ? { libraryId: band.zone.libraryApplianceId } : {}), frontVisible: !band.zone.panelFront, sizeMm: [w, h, d], centerMm: [cx, cy, D / 2 - 2 - d / 2] };
    const t = spec.frontTrim;
    if (t && !band.zone.panelFront) {
      // The frame stays inside the zone's own front space, so it never touches the fronts of the zones above and below.
      const lastZone = band.index === layout.bands.length - 1;
      const frontLo = band.bandBottomMm + (band.index === 0 ? PANEL.FRONT_HEIGHT_CLEARANCE_MM / 2 : PANEL.FRONT_REVEAL_MM / 2);
      const frontHi = band.bandTopMm - (lastZone ? PANEL.FRONT_HEIGHT_CLEARANCE_MM / 2 : PANEL.FRONT_REVEAL_MM / 2);
      const lo = Math.max(cy - h / 2 - t.rimYMm, frontLo);
      const hi = Math.min(cy + h / 2 + t.rimYMm, frontHi);
      // Across the zone the frame is at most as wide as the cabinet; in a column, at most as wide as the column's front strip.
      const strip = col ? frontStripOf(col, W) : { loMm: 0, hiMm: W };
      const xLo = Math.max(cx - w / 2 - t.rimXMm, strip.loMm);
      const xHi = Math.min(cx + w / 2 + t.rimXMm, strip.hiMm);
      const tw = xHi - xLo;
      if (hi > lo && tw > w) geo.trim = { sizeMm: [tw, hi - lo, t.depthMm], centerMm: [(xLo + xHi) / 2, (lo + hi) / 2, D / 2 + t.depthMm / 2] };
    }
    appliances.push(geo);
  });

  return { boxes, facades, channels: plan.channels, appliances, base: baseBoxes(cabIn, th) };
}
