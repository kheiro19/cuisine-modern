// src/rules/templates/helpers.ts
// أدوات كتابة القوالب: بناة الأقسام + defineTemplates التي تختم كل قالب بعائلته وتملأ الفئة والأبعاد الافتراضية.
import type { ApplianceKind, CabinetCategory, CabinetZone, OpeningMode } from '../../types/flatma';
import { FAMILIES, FamilyId } from '../families';
import { KINEMATICS, KinematicId } from '../kinematics';

export const doors = (count: number, shelves = 0, heightMm?: number): CabinetZone => ({ kind: 'DOORS', count, shelves, heightMm });
export const drawers = (count: number, heightMm?: number): CabinetZone => ({ kind: 'DRAWERS', count, heightMm });
export const openShelves = (shelves: number): CabinetZone => ({ kind: 'OPEN', shelves });
export const appliance = (kind: ApplianceKind, heightMm?: number, panelFront = false): CabinetZone => ({ kind: 'APPLIANCE', appliance: kind, heightMm, panelFront });
export const apron = (heightMm: number): CabinetZone => ({ kind: 'APRON', heightMm });

/** ما يكتبه المؤلف لكل قالب. الفئة والأبعاد تؤخذ من العائلة ما لم يُذكرا. */
export interface TemplateInput {
  label: string;
  /** الأقسام من الأسفل للأعلى. */
  zones: CabinetZone[];
  dims?: { width: number; height: number; depth: number };
  category?: CabinetCategory;
  openingMode?: OpeningMode;
  frontStyle?: 'SOLID' | 'GLASS';
  /** يختار نظام رفع من المخزن بدل المفصلات افتراضيًا. */
  preferLift?: boolean;
  /** الآلية التي يعتمد عليها القالب. إن كانت PLANNED وجبت ملاحظة (يفرضها اختبار tests/rules.test.ts). */
  kinematic?: KinematicId;
  /** ما لا يجسّده المحرّك (3D / BOM / تكلفة) لهذا القالب. يُعرض للمستخدم ولا يُخفى. */
  note?: string;
}

export interface TemplateDef extends TemplateInput {
  family: FamilyId;
  category: CabinetCategory;
  dims: { width: number; height: number; depth: number };
}

export function defineTemplates<K extends string>(family: FamilyId, defs: Record<K, TemplateInput>): Record<K, TemplateDef> {
  const f = FAMILIES[family];
  const out = {} as Record<K, TemplateDef>;
  (Object.keys(defs) as K[]).forEach((key) => {
    const d = defs[key];
    // A mechanism that the zone itself declares (pull-out frame...) is written on every zone it can move (zone.kinematic).
    const zoneMechanism = d.kinematic && KINEMATICS[d.kinematic].selectedBy === 'ZONE' ? d.kinematic : undefined; // hinge / lift / runner are chosen by the hardware item, not stamped
    const zones = zoneMechanism ? d.zones.map((z) => (KINEMATICS[zoneMechanism].zoneKinds.includes(z.kind) ? { ...z, kinematic: zoneMechanism } : z)) : d.zones;
    out[key] = { ...d, zones, family, category: d.category ?? f.category, dims: d.dims ?? f.dims };
  });
  return out;
}
