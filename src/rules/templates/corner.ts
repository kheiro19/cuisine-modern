// src/rules/templates/corner.ts — قوالب عائلة الزاوية (بيانات فقط).
import { defineTemplates, doors } from './helpers';

export const CORNER_TEMPLATES = defineTemplates('CORNER', {
  // The blind corner works in a straight run: one door on the visible part, a fixed panel on the blind part that hides behind the first
  // cabinet of the perpendicular run. The vertical board between them is the one of math/columns.ts. Turn mainSide to mirror it.
  Blind_Corner: {
    label: 'خزانة سفلية زاوية (عمياء)',
    zones: [{ ...doors(1, 1), split: { mainSide: 'LEFT', mainWidthMm: 500, fill: 'PANEL' } }],
    note: 'باب واحد على الجزء الظاهر (نحو 53 سم) ولوح سدّ ثابت على الجزء الأعمى، الذي يختفي خلف أول خزانة من الصف المتعامد. لعكس الاتجاه بدّل جهة العمود الرئيسي. للزاوية L الحقيقية (داخل متصل وبابان) اختر مطبخ L أو U وأضفها من لوحة «شكل المطبخ».',
  },
  Wall_Blind_Corner: {
    label: 'خزانة علوية زاوية (عمياء)',
    zones: [{ ...doors(1, 1), split: { mainSide: 'LEFT', mainWidthMm: 420, fill: 'PANEL' } }],
    category: 'WALL_UNIT',
    dims: { width: 900, height: 720, depth: 350 },
    note: 'باب واحد على الجزء الظاهر (نحو 46 سم) ولوح سدّ ثابت على الجزء الأعمى خلف أول خزانة علوية من الصف المتعامد. لعكس الاتجاه بدّل جهة العمود الرئيسي. للزاوية L الحقيقية اختر مطبخ L أو U وأضفها من لوحة «شكل المطبخ».',
  },
});
