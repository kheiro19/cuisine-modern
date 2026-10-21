// src/rules/templates/corner.ts — قوالب عائلة الزاوية (بيانات فقط).
// الزاويتان هنا زاوية L حقيقية: عند الإضافة تُبنى وحدة من ثلاثة صناديق (مربع الزاوية وذراعان) داخلها متصل، على الجدارين اللذين يلتقيان
// في الزاوية (math/lCorner.ts). تحتاج مطبخ L أو U. الأقسام والأبعاد تُحدَّد من عرض الذراعين، لا من الاستمارة.
import { defineTemplates, doors } from './helpers';

export const CORNER_TEMPLATES = defineTemplates('CORNER', {
  L_Corner_Base: {
    label: 'خزانة سفلية زاوية L',
    zones: [doors(1, 0)],
    lCorner: true,
    note: 'زاوية L حقيقية: مربع 60×60 سم وذراعان لكل منهما باب، والداخل متصل بلا حاجز. تُضاف في مطبخ L أو U على الجدار الذي يشكّل الزاوية.',
  },
  L_Corner_Wall: {
    label: 'خزانة علوية زاوية L',
    zones: [doors(1, 0)],
    category: 'WALL_UNIT',
    dims: { width: 800, height: 720, depth: 350 },
    lCorner: true,
    note: 'زاوية L علوية: مربع 35×35 سم وذراعان لكل منهما باب، والداخل متصل. تُضاف فوق الزاوية السفلية في مطبخ L أو U.',
  },
});
