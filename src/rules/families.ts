// src/rules/families.ts
// عائلات الخزائن الثلاث: سفلية، علوية، زاوية. ما يختلف بينها: الفئة والأبعاد الافتراضية والحركات المتاحة.
// الباقي (الأقسام، طريقة الفتح، الإكسسوار) خيارات داخل الخزانة نفسها، لا أنواع جديدة.
// الأنواع المعروضة أربعة: سفلية عادية، علوية عادية، وزاويتان (سفلية وعلوية). أما زاوية L الحقيقية فتُضاف من لوحة شكل المطبخ (math/lCorner.ts).
import type { CabinetCategory } from '../types/flatma';
import type { KinematicId } from './kinematics';

export type FamilyId = 'BASE' | 'WALL' | 'CORNER';

export interface FamilySpec {
  id: FamilyId;
  label: string;
  /** فئة الخزانة التي تُنشأ بها افتراضيًا. */
  category: CabinetCategory;
  dims: { width: number; height: number; depth: number };
  /** الحركات التي تعرضها هذه العائلة. */
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
    kinematics: ['SWING', 'LIFT'],
  },
  CORNER: {
    id: 'CORNER', label: 'زاوية', category: 'BASE_UNIT',
    dims: { width: 1050, height: 870, depth: 600 },
    kinematics: ['SWING'],
  },
};

/** ترتيب الظهور في القائمة. */
export const FAMILY_ORDER: FamilyId[] = ['BASE', 'WALL', 'CORNER'];
