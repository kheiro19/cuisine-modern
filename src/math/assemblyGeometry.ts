// src/math/assemblyGeometry.ts
// The static boards, facades, Gola channels and appliance bodies of a cabinet as plain boxes in millimetres, derived
// from the same zone layout the BOM uses. The 3D component only turns these boxes into meshes, and a test compares
// them to the BOM parts, so the picture and the cutting list are the same cabinet.
// Cabinet-local coordinates: x 0..width (left to right), y 0..height (bottom to top), z centred on the depth
// (back face at -depth/2, front at +depth/2).
import { ApplianceKind, CabinetObject } from '../types/flatma';
import { PANEL, PULL_OUT } from './constants';
import { FacadeMotion, constructionOf, motionOf } from '../rules';
import { APPLIANCES, Facade, GolaChannel, isOpenCarcase, layoutZones, planFronts, zonesOf } from './zones';

export interface BoxGeo {
  key: string;
  kind: 'side' | 'bottom' | 'divider' | 'rail' | 'roof' | 'back' | 'shelf';
  sizeMm: [number, number, number];
  centerMm: [number, number, number];
}

export type { FacadeMotion };

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
}

export interface ApplianceGeo {
  zoneIndex: number;
  appliance: ApplianceKind;
  sizeMm: [number, number, number];
  centerMm: [number, number, number];
}

export interface AssemblyGeometry {
  boxes: BoxGeo[];
  facades: FacadeGeo[];
  channels: GolaChannel[];
  appliances: ApplianceGeo[];
}

/** Length of the runners: 50 mm steps, kept between 250 and 550 mm and 50 mm short of the cabinet depth. */
export const runnerLengthMm = (depthMm: number): number => Math.max(250, Math.min(550, Math.floor((depthMm - 50) / 50) * 50));

export const facadeKey = (f: Pick<Facade, 'zoneIndex' | 'kind' | 'index'>): string => `facade-${f.zoneIndex}-${f.kind}-${f.index}`;
export const applianceKey = (zoneIndex: number): string => `appliance-${zoneIndex}`;

export interface AssemblyOptions {
  carcaseTh: number;
  frontTh: number;
  /** The doors lift up (overhead lift hardware) instead of swinging. */
  lift: boolean;
  /** Inset hinges: the facade sits inside the carcase instead of in front of it. */
  inset: boolean;
}

export function assemblyGeometry(cab: CabinetObject, o: AssemblyOptions): AssemblyGeometry {
  const { carcaseTh: th, frontTh } = o;
  const W = cab.width, H = cab.height, D = cab.depth;
  const inner = Math.max(0, W - 2 * th);
  const zones = zonesOf(cab);
  const open = isOpenCarcase(zones);
  const layout = layoutZones(cab, th);
  const plan = planFronts(cab, layout);
  const boxes: BoxGeo[] = [];

  boxes.push({ key: 'side-left', kind: 'side', sizeMm: [th, H, D], centerMm: [th / 2, H / 2, 0] });
  boxes.push({ key: 'side-right', kind: 'side', sizeMm: [th, H, D], centerMm: [W - th / 2, H / 2, 0] });
  if (!open) boxes.push({ key: 'bottom', kind: 'bottom', sizeMm: [inner, th, D], centerMm: [W / 2, th / 2, 0] });
  if (!open) {
    layout.dividerBottomsMm.forEach((y, i) => boxes.push({ key: `divider-${i}`, kind: 'divider', sizeMm: [inner, th, D], centerMm: [W / 2, y + th / 2, 0] }));
  }

  if (constructionOf(cab.category).top === 'RAILS') {
    // Two stretcher rails flush with the front and the back (the front one used to float in the middle of the depth).
    const railZ = D / 2 - PANEL.TRAVERSE_DEPTH_MM / 2;
    boxes.push({ key: 'rail-front', kind: 'rail', sizeMm: [inner, th, PANEL.TRAVERSE_DEPTH_MM], centerMm: [W / 2, H - th / 2, railZ] });
    boxes.push({ key: 'rail-rear', kind: 'rail', sizeMm: [inner, th, PANEL.TRAVERSE_DEPTH_MM], centerMm: [W / 2, H - th / 2, -railZ] });
  } else {
    boxes.push({ key: 'roof', kind: 'roof', sizeMm: [inner, th, D], centerMm: [W / 2, H - th / 2, 0] });
  }

  // The back is an overlay glued on the rear face (the BOM cuts it width x height), not inside the carcase.
  if (!open) boxes.push({ key: 'back', kind: 'back', sizeMm: [W, H, PANEL.BACK_THICKNESS_MM], centerMm: [W / 2, H / 2, -D / 2 - PANEL.BACK_THICKNESS_MM / 2] });

  // Zones with pull-out frames carry baskets, not fixed shelves (the BOM skips them too).
  const pullOutZones = new Set(plan.facades.filter((f) => f.kinematic === 'PULL_OUT_FRAME').map((f) => f.zoneIndex));
  layout.bands.forEach((band) => {
    const z = band.zone;
    if (z.kind !== 'DOORS' && z.kind !== 'OPEN') return;
    if (pullOutZones.has(band.index)) return;
    const count = Math.max(0, Math.round(z.shelves ?? 0));
    for (let k = 0; k < count; k++) {
      const y = band.openingBottomMm + (band.openingHeightMm * (k + 1)) / (count + 1);
      boxes.push({ key: `shelf-${band.index}-${k}`, kind: 'shelf', sizeMm: [inner - PANEL.SHELF_WIDTH_CLEARANCE_MM, th, D - PANEL.SHELF_DEPTH_INSET_MM], centerMm: [W / 2, y, -PANEL.SHELF_DEPTH_INSET_MM / 2] });
    }
  });

  const frontZ = o.inset ? D / 2 - frontTh / 2 : D / 2 + frontTh / 2;
  const facades: FacadeGeo[] = plan.facades.map((f) => {
    const motion: FacadeMotion = motionOf(f.kind, { lift: o.lift, kinematic: f.kinematic });
    const geo: FacadeGeo = { ...f, motion, hinge: motion === 'SWING' ? (f.index % 2 === 0 ? 'LEFT' : 'RIGHT') : null, zMm: frontZ };
    if (motion === 'PULL_OUT') {
      // One frame per front, between the runners: a door zone shares the inner width among its fronts, drawers use all of it.
      const columns = f.kind === 'DOOR' ? Math.max(1, f.count) : 1;
      const column = inner / columns;
      const w = Math.max(50, column - 2 * PULL_OUT.RUNNER_SPACE_MM);
      const h = Math.max(100, f.heightMm - 2 * PULL_OUT.VERTICAL_MARGIN_MM);
      const d = runnerLengthMm(D);
      const cx = f.kind === 'DOOR' ? th + (f.index + 0.5) * column : W / 2;
      const zRear = frontZ - frontTh / 2; // back face of the front
      geo.frame = { sizeMm: [w, h, d], centerMm: [cx, f.yMm + f.heightMm / 2, zRear - PULL_OUT.FRONT_GAP_MM - d / 2], levels: f.levels ?? PULL_OUT.DEFAULT_LEVELS };
    }
    return geo;
  });

  const appliances: ApplianceGeo[] = [];
  layout.bands.forEach((band) => {
    if (band.zone.kind !== 'APPLIANCE' || !band.zone.appliance) return;
    const spec = APPLIANCES[band.zone.appliance];
    const w = Math.min(inner - 4, spec.nicheWidthMm);
    const h = Math.min(band.openingHeightMm - 4, spec.nicheHeightMm);
    const d = Math.min(D - 30, spec.nicheDepthMm);
    appliances.push({ zoneIndex: band.index, appliance: band.zone.appliance, sizeMm: [w, h, d], centerMm: [W / 2, band.openingBottomMm + 2 + h / 2, D / 2 - 2 - d / 2] });
  });

  return { boxes, facades, channels: plan.channels, appliances };
}
