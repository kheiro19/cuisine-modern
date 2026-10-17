// src/rules/families.ts
// الأنواع الأربعة للخزائن العصرية. ما يختلف بينها: الفئة والأبعاد الافتراضية والحركات المتاحة.
// الباقي (الأقسام، طريقة الفتح، الإكسسوار) خيارات داخل الخزانة نفسها، لا أنواع جديدة.
import type { CabinetCategory } from '../types/flatma';
import type { KinematicId } from './kinematics';

export type FamilyId = 'BASE' | 'WALL' | 'BUILT_IN' | 'CORNER';

export interface FamilySpec {
  id: FamilyId;
  label: string;
  /** فئة الخزانة التي تُنشأ بها افتراضيًا. */
  category: CabinetCategory;
  dims: { width: number; height: number; depth: number };
  /** الحركات التي تعرضها هذه العائلة (المُعلَنة منها تظهر عند تجسيدها). */
  kinematics: KinematicId[];
}

export const FAMILIES: Record<FamilyId, FamilySpec> = {
  BASE: {
    id: 'BASE', label: 'سفلية', category: 'BASE_UNIT',
    dims: { width: 600, height: 870, depth: 600 },
    kinematics: ['SWING', 'SLIDE', 'PULL_OUT_FRAME'],
  },
  WALL: {
    id: 'WALL', label: 'علوية', category: 'WALL_UNIT',
    dims: { width: 600, height: 720, depth: 350 },
    kinematics: ['SWING', 'LIFT', 'POCKET_FOLD'],
  },
  BUILT_IN: {
    id: 'BUILT_IN', label: 'مدمجة وطولية', category: 'BASE_UNIT',
    dims: { width: 600, height: 2200, depth: 600 },
    kinematics: ['SWING', 'SLIDE', 'PULL_OUT_FRAME', 'POCKET_FOLD'],
  },
  CORNER: {
    id: 'CORNER', label: 'زاوية', category: 'BASE_UNIT',
    dims: { width: 1050, height: 870, depth: 600 },
    kinematics: ['SWING', 'SLIDE', 'CORNER_TRAYS', 'ROTARY', 'CURVED_PULL'],
  },
};

/** ترتيب الظهور في القائمة. */
export const FAMILY_ORDER: FamilyId[] = ['BASE', 'WALL', 'BUILT_IN', 'CORNER'];
