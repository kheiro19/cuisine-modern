// src/rules/templates/built-in.ts — قوالب العائلة المدمجة والطولية (بيانات فقط).
import { appliance, defineTemplates, doors, drawers } from './helpers';

export const BUILT_IN_TEMPLATES = defineTemplates('BUILT_IN', {
  Built_In_Appliance: { label: 'دولاب الأجهزة المدمجة', zones: [drawers(1, 380), appliance('OVEN', 595), appliance('MICROWAVE', 380), doors(2, 1)] },
  Tall_Pantry_Cargo: { label: 'خزانة المؤونة بسحب كلي', zones: [doors(1, 4)], kinematic: 'PULL_OUT_FRAME', note: 'إطار سلة واحد بأربعة مستويات على سكك سحب كلي: يُسعَّر طقمًا من فئة سكك الأدراج (اختر طقم السلة في عتاد الأدراج). واجهة واحدة لأن الإطارين المتجاورين يحتاجان لوحًا رأسيًا غير موجود بعد.' },
  Tandem_Pantry: { label: 'خزانة المؤونة الترادفتية', zones: [doors(1, 4)], kinematic: 'PULL_OUT_FRAME', note: 'إطار سلة واحد بأربعة مستويات على سكك Tandem: يُسعَّر طقمًا من فئة سكك الأدراج. واجهة واحدة لأن الإطارين المتجاورين يحتاجان لوحًا رأسيًا غير موجود بعد.' },
  Pocket_Door_Pantry: { label: 'خزانة الأبواب المخفية المطوية', zones: [doors(2, 4)], kinematic: 'POCKET_FOLD', note: 'نظام الأبواب المخفية المطوية غير مجسَّد.' },
  Push_To_Open_Tall: { label: 'الدولاب الطولي بفتح بالضغط', zones: [doors(2, 4)], openingMode: 'PUSH', note: 'تُسعَّر آلية الضغط لكل باب إن وُجد في المخزن صنف من فئة Push-Open Systems.' },
});
