// src/rules/templates/base.ts — قوالب العائلة السفلية (بيانات فقط).
import { apron, appliance, defineTemplates, doors, drawers } from './helpers';

export const BASE_TEMPLATES = defineTemplates('BASE', {
  Deep_Drawers: { label: 'وحدات الأدراج العميق (Deep Drawers)', zones: [drawers(2)], kinematic: 'SLIDE' },
  Pull_Out_Sink: { label: 'خزانة الحوض بسحب أمامي', zones: [doors(2), apron(150)], dims: { width: 800, height: 870, depth: 600 }, note: 'الدرج U حول السيفون وصفيحة حماية القاع غير مجسَّدين.' },
  Cargo_Pull_Out: { label: 'صيدلية التوابل العمودية', zones: [drawers(1)], dims: { width: 300, height: 870, depth: 600 }, kinematic: 'PULL_OUT_FRAME', note: 'إطار السلة بثلاثة مستويات على سكك سحب كلي: يُسعَّر طقمًا من فئة سكك الأدراج لكل واجهة.' },
  Panel_Ready: { label: 'خزانة جاهزة لتركيب الواجهة (Panel Ready)', zones: [appliance('DISHWASHER', undefined, true)], dims: { width: 636, height: 870, depth: 600 }, note: 'غسالة الصحون يوفرها الزبون: الفتحة بلا قاع ولا ظهر، والواجهة لوح مطابق للمطبخ.' },
  Push_To_Open_Base: { label: 'خزانة سفلية بفتح بالضغط', zones: [drawers(3)], openingMode: 'PUSH', note: 'تُسعَّر آلية الضغط لكل واجهة إن وُجد في المخزن صنف من فئة Push-Open Systems.' },
  Hinged_Pull_Out_Trays: { label: 'الخزائن ذات الأرفف السحابة', zones: [doors(2, 2)], note: 'باب يدور ثم أرفف تنزلق داخله: آليتان في قسم واحد غير مجسَّدتين، فتُرسم الأرفف ثابتة. لسلة بواجهة تنزلق استعمل Cargo_Pull_Out.' },
});
