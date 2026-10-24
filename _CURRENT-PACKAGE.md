# الحزمة الحالية — 2026-10-23 (مساءً)

الملف: **`cuisine-modern-main-2026-10-23-final6.zip`** (بلا `node_modules` ولا `dist` — يُبنى محلياً).

> هذا الملف يلخّص **كل** ما أُنجز اليوم، وانطلاقاً من الحزمة الصباحية أُضيف: سطح العمل · اللوحة اللونية ·
> زاوية L (ضلفة الزاوية · الضلفة على الجهتين) · خلفية الخزانة بثلاث طرق · قاعدة الزاوية L قطعة واحدة ·
> مكتبة الخامات (307) · **تعديل مقاسات الزاوية بعد بنائها** · **عرض سطح العمل وخامته وشريط الواجهة الافتراضي**.

> **اقرأ هذا قبل النشر:** الـZIP **طبقة كود** لا مشروعاً مستقلاً. لا يحتوي `public/textures/`
> (307 صور · 6.54 MB) — وهي أصول تبقى عندك كما هي. المجلد **لا يُحذف** بفكّ الحزمة.
>
> **الخامات عادت:** الحزمة **لا تحمل `src/data/textureManifest.json`**، فلا يمكن أن تمسح قائمتك. وتُبنى القائمة تلقائياً
> من `public/textures` عبر `npm install` (خطّاف `prepare`) أو `npm run textures`. والتطبيق نفسه يعالج نفسه: إن وجد
> المانيفست فارغاً قرأ `public/textures/index.json` وأعاد الـ307 بلا إعادة بناء. التفصيل: `docs/21_مكتبة_الخامات_المحلية.md`.

## ما فيها

| الأولوية | الحال | أثرها على الملفات |
|---|---|---|
| 7 — فصل اختبارات التوافق | ✅ | `tests/product/` · `tests/compat/` · `tests/README.md` |
| 9 — دورة حياة المخزون | ✅ | `src/math/stockDelta.ts` · `ui-tests/stockLifecycle.test.tsx` |
| 11 — تصحيح المخزون وحذفه | ✅ | `src/context/FurnitureContext.tsx` · `src/components/InventoryManager.tsx` |
| 10 — حذف الكتالوج وتقوية اللوحة | ✅ | `src/App.tsx` (منتقي الآلية) · `src/math/partsEngine.ts` (إصلاح) · `tests/fixtures/matrix.ts` |

## ما أُضيف اليوم (فوق الحزمة الصباحية)

| المرحلة | الملفات | الوثيقة |
|---|---|---|
| سطح العمل: إظهار/إخفاء + سُمك 20–40 وعمق 580–650 | `src/math/countertop.ts` · `ui-tests/countertop.test.tsx` | `15` |
| اللوحة اللونية: جوز مطفي / كشمير / فحم بارد | `src/math/palette.ts` · `docs/palette-preview.svg` | `16` |
| زاوية L: ضلفة الزاوية الثابتة 18…50 مم، الذراع 450 دائماً | `src/math/cornerFiller.ts` | `17` |
| زاوية L: **الضلفة على كلتا الجهتين** (أدراج أو للجمال فقط) | `cornerFiller.ts` · `zones.ts` · `lCorner.ts` · `docs/corner-drawers.svg` | `17` |
| خلفية الخزانة: **HDF / عارضتان / لوح الهيكل** لكل خزانة + تعميم | `src/math/backPanel.ts` · `docs/back-options.svg` | `19` |
| قاعدة الزاوية L: **قطعة واحدة مقصوصة على شكل L** | `src/math/cornerDeck.ts` · `docs/corner-deck.svg` | `20` |
| **تصحيح:** صندوق الدرج تحت واجهته + **رجوع الضلفة 100 مم** | `src/math/drawerBox.ts` · `assemblyGeometry.ts` · `docs/corner-filler-return.svg` | `17` |
| **تصحيح:** مكتبة الخامات المحلية (307) عادت ولا يمكن مسحها | `scripts/build-texture-manifest.mjs` · `src/data/textureCatalog.ts` | `21` |
| **تصحيح:** مقاسات الزاوية L بعد بنائها — ذراعان ومربع بأي مقاس، والثلاثة بخزنة واحدة | `src/math/lCorner.ts` · `FurnitureContext.patchCabinets` · `docs/corner-resize.svg` | `22` |
| **تصحيح:** عرض سطح العمل رقمك (لا مدّ قسري) + خامته من `public/textures` | `src/math/countertop.ts` · `textureEngine.slabMaterial` · `docs/countertop-width.svg` | `23` |
| **تصحيح:** حذف حقل «شريط اللوح» من جذوره (الشريط من لفّة المخزن وحدها) | `src/components/InventoryManager.tsx` · حذف `src/math/edgeDefaults.ts` | `23` |
| **تصحيح:** تجويف الغسالة/الجلاية بلا واجهة ⇒ لا يُطلب له شريط | `src/math/zones.ts` (`cabinetHasFronts` · `frontPanelCount`) · `CabinetPreview3D` | `23` |

## الأرقام المقيسة

```
npm test                 329 / 329      (tests/product 285 على 25 ملفاً · tests/compat 37 على 6 ملفات · حرّاس 7)
npm run test:ui           64 / 64       (9 ملفات Vitest)
typecheck (src + tests + ui)  ✓ 0 أخطاء
npm run build             ✓ 8.24s
```

## ⚠️ ثلاث حزم يجب حذفها من نسختك القديمة

الحزمة تُفكّ **فوق** النسخة القديمة، لكن هذه الملفات لم تعد موجودة في المشروع، فإن بقيت سيعود الكتالوج القديم
إلى الاختبارات:

```
tests/fixtures/legacy/          ← مجلد كامل (28 قالباً)
tests/fixtures/corpus.ts
tests/compat/catalogue.test.ts
```

بعد حذفها: `npm install && npm test` يجب أن يعطي **329/329** و`npm run test:ui` يعطي **64/64**.

## الأصول (خارج الـZIP، عندك)

| المسار | المحتوى | الحال |
|---|---|---|
| `public/textures/` | 307 ملف `.webp` · 6.54 MB | موجود في Drive وعندك — **مطابق تماماً** لأسماء المانيفست (0 فرق) |
| `public/models/library/manifest.json` | 114 بايت · مكتبة فارغة بلا `.glb` | داخل الـZIP ومطابق |

تفصيل التحليل الكامل: `docs/13_تحليل_public_textures_models.md`.

## ملاحظة على الشجرة في Drive

المجلدات `src/` و`tests/` و`docs/` في Drive هي نسخة سابقة (2026-10-23 صباحاً) ولا تعرف الحذف. **الـZIP هو مصدر الكود**،
لأن الشجرة لا تستطيع أن تعبّر عن «ملف محذوف». أما `public/` فمصدره Drive.
