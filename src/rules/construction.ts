// src/rules/construction.ts
// قواعد الهيكل الفيزيائي حسب فئة الخزانة: ما يغلق الأعلى، وما يثبّتها (أرجل أم حوامل تعليق).
// الأرقام نفسها (عدد الأرجل والحوامل) في math/constants.ts؛ هنا من يطبّقها ومتى.
import type { CabinetCategory } from '../types/flatma';
import { HARDWARE_RULES } from '../math/constants';

export interface ConstructionSpec {
  /** RAILS = عارضتان علويتان (سفلية، يعلوها الرخام). ROOF = لوح علوي كامل (معلّقة). */
  top: 'RAILS' | 'ROOF';
  fixing: {
    keyword: string;                          // يُطابَق مع اسم موديل في المخزن
    perUnit: number;
    group: 'Base Fixing System' | 'Wall Fixing System';
    missingCode: 'NO_LEGS_IN_STOCK' | 'NO_HANGERS_IN_STOCK';
    noun: string;                             // للرسالة: «... are not priced»
  };
}

export const CONSTRUCTION: Record<CabinetCategory, ConstructionSpec> = {
  BASE_UNIT: {
    top: 'RAILS',
    fixing: { keyword: HARDWARE_RULES.LEGS_KEYWORD, perUnit: HARDWARE_RULES.LEGS_PER_BASE_UNIT, group: 'Base Fixing System', missingCode: 'NO_LEGS_IN_STOCK', noun: 'legs' },
  },
  WALL_UNIT: {
    top: 'ROOF',
    fixing: { keyword: HARDWARE_RULES.HANGERS_KEYWORD, perUnit: HARDWARE_RULES.HANGERS_PER_WALL_UNIT, group: 'Wall Fixing System', missingCode: 'NO_HANGERS_IN_STOCK', noun: 'hangers' },
  },
};

/**
 * Boards between two zones: 1 = one board shared (the top of the lower zone and the bottom of the upper one),
 * 2 = two boards glued face to face. The fronts of the two zones meet in the middle of the divider either way.
 */
export const dividerBoardsOf = (cab: { dividerBoards?: number }): 1 | 2 => (cab.dividerBoards === 2 ? 2 : 1);

/** أي فئة غير السفلية تُعامل كمعلّقة (سلوك المحرّك السابق). */
export const constructionOf = (category: CabinetCategory): ConstructionSpec =>
  category === 'BASE_UNIT' ? CONSTRUCTION.BASE_UNIT : CONSTRUCTION.WALL_UNIT;
