// src/rules/templates/corner.ts — قوالب عائلة الزاوية (بيانات فقط).
import { defineTemplates, doors, drawers } from './helpers';

export const CORNER_TEMPLATES = defineTemplates('CORNER', {
  Magic_Corner: { label: 'خزانة الزاوية السحرية', zones: [doors(2, 1)], kinematic: 'CORNER_TRAYS', note: 'السلال المتحركة غير مجسَّدة.' },
  Lazy_Susan: { label: 'خزانة ليزي سوزان 360 درجة', zones: [doors(2)], kinematic: 'ROTARY', note: 'الصينية الدوّارة 360° غير مجسَّدة.' },
  Corner_Drawers: { label: 'أدراج الزاوية المتداخلة 90', zones: [drawers(2)], note: 'تداخل الأدراج بزاوية 90° يُرسم كأدراج مستقيمة.' },
  LeMans_Curve: { label: 'خزانة السحب المنحني LeMans', zones: [doors(2)], kinematic: 'CURVED_PULL', note: 'السحب المنحني غير مجسَّد.' },
  // A blind corner works in a straight run: one door on the visible part, a fixed panel on the blind part that hides behind the first
  // cabinet of the perpendicular run. The vertical board between them is the one of math/columns.ts. Turn mainSide to mirror it.
  Blind_Corner: {
    label: 'خزانة الزاوية العمياء السفلية',
    zones: [{ ...doors(1, 1), split: { mainSide: 'LEFT', mainWidthMm: 500, fill: 'PANEL' } }],
    note: 'باب واحد على الجزء الظاهر (نحو 53 سم) ولوح سدّ ثابت على الجزء الأعمى، الذي يختفي خلف أول خزانة من الصف المتعامد. لعكس الاتجاه بدّل جهة العمود الرئيسي. الزاوية على شكل L لم تُجسَّد بعد.',
  },
  Wall_Blind_Corner: {
    label: 'خزانة الزاوية العمياء العلوية',
    zones: [{ ...doors(1, 1), split: { mainSide: 'LEFT', mainWidthMm: 420, fill: 'PANEL' } }],
    category: 'WALL_UNIT',
    dims: { width: 900, height: 720, depth: 350 },
    note: 'باب واحد على الجزء الظاهر (نحو 46 سم) ولوح سدّ ثابت على الجزء الأعمى خلف أول خزانة علوية من الصف المتعامد. لعكس الاتجاه بدّل جهة العمود الرئيسي. الزاوية على شكل L لم تُجسَّد بعد.',
  },
  Diagonal_Corner: { label: 'خزانة الزاوية المائلة 45 درجة', zones: [doors(1, 1)], note: 'الواجهة المائلة 45° تُرسم مستقيمة.' },
});
