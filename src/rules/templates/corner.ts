// src/rules/templates/corner.ts — قوالب عائلة الزاوية (بيانات فقط).
import { defineTemplates, doors, drawers } from './helpers';

export const CORNER_TEMPLATES = defineTemplates('CORNER', {
  Magic_Corner: { label: 'خزانة الزاوية السحرية', zones: [doors(2, 1)], kinematic: 'CORNER_TRAYS', note: 'السلال المتحركة غير مجسَّدة.' },
  Lazy_Susan: { label: 'خزانة ليزي سوزان 360 درجة', zones: [doors(2)], kinematic: 'ROTARY', note: 'الصينية الدوّارة 360° غير مجسَّدة.' },
  Corner_Drawers: { label: 'أدراج الزاوية المتداخلة 90', zones: [drawers(2)], note: 'تداخل الأدراج بزاوية 90° يُرسم كأدراج مستقيمة.' },
  LeMans_Curve: { label: 'خزانة السحب المنحني LeMans', zones: [doors(2)], kinematic: 'CURVED_PULL', note: 'السحب المنحني غير مجسَّد.' },
  Blind_Corner: { label: 'خزانة الزاوية العادية الممتدة', zones: [doors(1, 1)], note: 'الجزء الأعمى الممتد يُرسم كصندوق مستطيل.' },
  Diagonal_Corner: { label: 'خزانة الزاوية المائلة 45 درجة', zones: [doors(1, 1)], note: 'الواجهة المائلة 45° تُرسم مستقيمة.' },
});
