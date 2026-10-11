# cuisine-modern

مصمّم مطابخ لورشة نجارة: خزائن سفلية وعلوية وطولية، معاينة ثلاثية الأبعاد، جدول قص (BOM)، تكلفة وفاتورة بالدينار الجزائري (DA)، ومخزن للألواح والعتاد وشريط الحافة.

React + Vite + TypeScript + Tailwind + Three.js (`@react-three/fiber` و`drei`).

## التشغيل

```bash
npm install
npm run dev      # يولّد قائمة الخامات تلقائياً ثم يشغّل Vite
npm test         # اختبارات المحركات (node:test عبر tsx)
npm run build    # tsc ثم vite build
```

## الفكرة الأساسية

الخزانة = كومة **أقسام** (zones) من الأسفل للأعلى: أبواب، أدراج، مفتوح، جهاز مدمج، لوح ثابت.
كل شيء (التكلفة، جدول القص، المخزون، الرسم، الوصلات) يُشتق من نفس الأقسام، فلا يمكن أن يختلف الرسم عن الـ BOM.

## الخريطة

| المسار | الدور |
|---|---|
| `src/types/flatma.ts` | الأنواع: الخزانة، الأقسام، المخزن |
| `src/math/zones.ts` | توزيع ارتفاعات الأقسام ومواضع الواجهات وقنوات Gola وكتالوج الأجهزة |
| `src/math/partsEngine.ts` | **مصدر الحقيقة**: الأجزاء، العتاد، شريط الحافة، التسعير |
| `src/math/assemblyGeometry.ts` | صناديق الرسم بالملم (يقارنها اختبار بأجزاء الـ BOM) |
| `src/math/fasteners.ts` | الوصلات (كامات، أوتاد، براغي، مفصلات، سكك) ومنظر التفكيك |
| `src/math/bomEngine.ts` / `costEngine.ts` / `invoiceEngine.ts` | تقرير المصنع، التكلفة، فاتورة الزبون |
| `src/math/cabinetPresets.ts` | قوالب الأنواع الـ24 ونموذج المسودة (draft) |
| `src/math/constants.ts` | **كل الأرقام القابلة للتعديل**: الفراغات والسماكات وقواعد العتاد ومقاسات الوصلات |
| `src/context/FurnitureContext.tsx` | الحالة المركزية والمخزن والتراجع (Undo) |
| `src/components/` | `CabinetAssembly3D` (الرسم)، `CabinetPreview3D`، `Kitchen3DCanvas`، `InventoryManager` |
| `public/textures/` | مكتبة الخامات |
| `scripts/build-texture-manifest.mjs` | يولّد `src/data/textureManifest.json` من الصور الموجودة فعلاً |
| `tests/` | اختبارات التكافؤ (السعر = صفوف الـ BOM، الرسم = أجزاء الـ BOM) |

## ملاحظات

- لإضافة نوع خزانة جديد: أضف صفاً في `SUBTYPE_PRESETS` (قائمة أقسام وأبعاد) دون لمس الرسم أو الحساب.
- الوصلات تُسعَّر وتُخصم من المخزن إن وُجد صنف مطابق في فئة `Assembly & Fixing` (أسماء: `Cam Lock` و`Wooden Dowel` و`Back Panel Screw` و`Shelf Support Pin`).
- روابط الخامات الأونلاين الدائمة في `src/data/onlineTextures.ts`.

## قواعد المطبخ (src/rules)

أنواع الخزائن الأربعة والأنظمة الحركية وطرق الفتح وقواعد الهيكل والقوالب كلها في `src/rules`، ملفًا لكل موضوع. خريطة "أين أغيّر؟" في `src/rules/README.md`.
