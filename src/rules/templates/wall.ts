// src/rules/templates/wall.ts — قوالب العائلة العلوية (بيانات فقط).
import { defineTemplates, doors, openShelves } from './helpers';

export const WALL_TEMPLATES = defineTemplates('WALL', {
  Standard_Wall: { label: 'خزانة علوية قياسية', zones: [doors(2, 1)] },
  Ceiling_Height: { label: 'الخزائن الممتدة للسقف (طابقان)', zones: [doors(2, 1, 700), doors(2)], dims: { width: 600, height: 1100, depth: 350 }, note: 'الارتفاع 1100 مم افتراضي: عدّله حسب سقف الغرفة (الطابق العلوي يأخذ الباقي تلقائياً).' },
  Lift_Up: { label: 'الخزائن الهيدروليكية (Lift-up)', zones: [doors(1)], preferLift: true, kinematic: 'LIFT' },
  Glass_Front: { label: 'الخزائن الزجاجية الفاخرة', zones: [doors(2, 1)], frontStyle: 'GLASS', note: 'إطار ألمنيوم ولوح زجاجي: تُسعَّر الواجهة بسعر خامة الواجهة المختارة (اختر خامة الزجاج). إضاءة LED غير مجسَّدة.' },
  Over_Fridge: { label: 'الخزانة فوق الثلاجة عمق 60سم', zones: [doors(2)], dims: { width: 900, height: 450, depth: 600 } },
  Open_Shelving: { label: 'رفوف مفتوحة بدون أبواب', zones: [openShelves(3)] },
  Double_Depth: { label: 'خزانة علوية بعمق مزدوج', zones: [doors(2, 1)], note: 'تدرّج العمق المزدوج غير مجسَّد: تُرسم كصندوق بعمق واحد.' },
});
