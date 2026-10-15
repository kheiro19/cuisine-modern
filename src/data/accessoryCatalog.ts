// src/data/accessoryCatalog.ts
// The accessories library of the 3D showroom: everything a modern kitchen is made of besides the cabinets. Data only (no
// three.js, no React): where a piece may go is decided in math/accessoryPlacement.ts and what it looks like in
// math/accessoryModels.ts.
//
// Sizes are typical market sizes in millimetres: w = along the wall, h = height, d = depth (towards the user).
// Ovens, microwaves built into a column, coffee machines built in, dishwashers and fridges BUILT IN are not here: they are
// appliance zones of the cabinet form. The "freestanding" and "small appliances" categories are the ones that stand alone.

export type AccessoryCategory =
  | 'ELECTRICAL' | 'SINK_TAP' | 'APPLIANCE' | 'FREESTANDING' | 'SMALL_APPLIANCE' | 'WORKTOP'
  | 'WALL' | 'LIGHTING' | 'DRAWER_ORG' | 'INTERIOR' | 'SMART' | 'DECOR';

/**
 *  COUNTERTOP      on / in the worktop (free position along it)
 *  BACKSPLASH      on the wall between the worktop and the wall units
 *  ABOVE_HOB       on the wall above the worktop, at hood height
 *  HANGING         hung above the worktop (pendant lamps, island hood)
 *  FLOOR           stands on the floor: next to the run of base units, or in front of it (stools, rugs)
 *  CABINET_UNDER   under the bottom board of a chosen WALL unit
 *  CABINET_INSIDE  inside a chosen cabinet
 */
export type AccessoryMount = 'COUNTERTOP' | 'BACKSPLASH' | 'ABOVE_HOB' | 'HANGING' | 'FLOOR' | 'CABINET_UNDER' | 'CABINET_INSIDE';

export type FinishKey = 'steel' | 'chrome' | 'black' | 'white' | 'graphite' | 'gold' | 'copper' | 'wood';

export interface FinishStyle {
  labelAr: string;
  c: string;
  metal: number;
  rough: number;
}

export const FINISHES: Record<FinishKey, FinishStyle> = {
  steel: { labelAr: 'ستانلس', c: '#c7ced6', metal: 0.85, rough: 0.25 },
  chrome: { labelAr: 'كروم', c: '#e5e7eb', metal: 0.95, rough: 0.12 },
  black: { labelAr: 'أسود مطفي', c: '#1a1d23', metal: 0.5, rough: 0.35 },
  white: { labelAr: 'أبيض', c: '#f1f5f9', metal: 0.1, rough: 0.5 },
  graphite: { labelAr: 'جرافيت', c: '#4b5563', metal: 0.6, rough: 0.35 },
  gold: { labelAr: 'ذهبي', c: '#c9a227', metal: 0.9, rough: 0.22 },
  copper: { labelAr: 'نحاسي', c: '#b87333', metal: 0.9, rough: 0.25 },
  wood: { labelAr: 'خشب', c: '#c9a46a', metal: 0.0, rough: 0.7 },
};

export type ModelOpts = Record<string, number | string | boolean>;

export type AccessoryModelKey =
  | 'popupSocket' | 'flushSocket' | 'railSocket' | 'wirelessCharger' | 'wallPlate'
  | 'sink' | 'sinkWorkstation' | 'tap' | 'soapDispenser' | 'sinkRack' | 'colander' | 'sinkBoard'
  | 'hobInduction' | 'hobGas' | 'hobDowndraft' | 'hoodChimney' | 'hoodAngled' | 'hoodBox' | 'hoodIsland' | 'hoodSlim' | 'hoodGlass'
  | 'fridge' | 'wineCooler' | 'range' | 'washer' | 'dishwasherFree'
  | 'espresso' | 'coffeeDrip' | 'kettle' | 'toaster' | 'microwave' | 'airFryer' | 'blender' | 'standMixer' | 'riceCooker' | 'foodProcessor'
  | 'cuttingBoard' | 'knifeBlock' | 'utensilHolder' | 'dishDrainer' | 'breadBin' | 'spiceCounter' | 'paperTowel' | 'fruitBowl' | 'canisters'
  | 'panel' | 'wallRail' | 'knifeStrip' | 'floatShelf' | 'wallClock' | 'potFiller'
  | 'ledStrip' | 'spotLights' | 'puckLights' | 'pendantDome' | 'pendantGlobe' | 'pendantTrio' | 'pendantLinear' | 'wallSconce'
  | 'insertTray' | 'knifeInsert' | 'platePegs' | 'trayDivider'
  | 'pulloutBasket' | 'bottleRack' | 'cornerCarousel' | 'wasteSorter' | 'plateRack' | 'larder' | 'magicCorner' | 'rolloutShelf' | 'underSinkU'
  | 'disposer' | 'waterFilter' | 'boilerTank' | 'towelRail' | 'wireShelf'
  | 'smartDisplay' | 'gasDetector' | 'extinguisher' | 'smartSpeaker' | 'usbDock'
  | 'plantPot' | 'herbTrio' | 'vase' | 'barStool' | 'trolley' | 'rug' | 'cookbook';

export interface AccessoryItem {
  id: string;
  category: AccessoryCategory;
  nameAr: string;
  nameEn: string;
  icon: string;
  mount: AccessoryMount;
  model: AccessoryModelKey;
  /** w x h x d in mm. The model is drawn exactly inside this box. */
  sizeMm: { w: number; h: number; d: number };
  /** Where the piece sits in depth: CENTER of the worktop, REAR (against the wall) or FRONT (towards the user). */
  zPlace: 'CENTER' | 'REAR' | 'FRONT';
  /** Shape variant read by the model (number of burners, door layout...). */
  opts?: ModelOpts;
  /** Finishes offered (the first one is the default). */
  finishes?: FinishKey[];
  /** Taps, dispensers, racks: fixed on a sink, they follow it. `restGroup` = one of each group per sink. */
  rest?: 'SINK';
  restGroup?: string;
  restZ?: 'BACK' | 'CENTER';
  /** The width follows the host cabinet (LED strip). */
  autoWidth?: boolean;
  /** Backsplash panels cover the whole wall strip between the worktop and the wall units. */
  autoSpan?: boolean;
  /** Flat things (rugs, panels) never block another piece. */
  noCollide?: boolean;
  /** Placed above the hob when there is one (pot filler, hoods). */
  preferHob?: boolean;
  /** Extra words for the search box. */
  tags?: string;
  note?: string;
}

export const CATEGORY_LABELS: Record<AccessoryCategory, string> = {
  ELECTRICAL: 'كهرباء ومقابس',
  SINK_TAP: 'أحواض ومحابس',
  APPLIANCE: 'مواقد وشفاطات',
  FREESTANDING: 'أجهزة كبيرة',
  SMALL_APPLIANCE: 'أجهزة صغيرة',
  WORKTOP: 'إكسسوارات الرخامة',
  WALL: 'جدار الرخامة',
  LIGHTING: 'إضاءة',
  DRAWER_ORG: 'منظمات الأدراج',
  INTERIOR: 'منظمات الخزائن',
  SMART: 'ذكي وأمان',
  DECOR: 'ديكور وأثاث',
};

export const CATEGORY_ICONS: Record<AccessoryCategory, string> = {
  ELECTRICAL: '🔌',
  SINK_TAP: '🚰',
  APPLIANCE: '🔥',
  FREESTANDING: '🧊',
  SMALL_APPLIANCE: '☕',
  WORKTOP: '🔪',
  WALL: '🧱',
  LIGHTING: '💡',
  DRAWER_ORG: '🍴',
  INTERIOR: '🧺',
  SMART: '📡',
  DECOR: '🪴',
};

export const MOUNT_LABELS: Record<AccessoryMount, string> = {
  COUNTERTOP: 'على الرخامة',
  BACKSPLASH: 'على جدار الرخامة',
  ABOVE_HOB: 'على الجدار (ارتفاع الشفاط)',
  HANGING: 'معلّق فوق الرخامة',
  FLOOR: 'على الأرض',
  CABINET_UNDER: 'تحت خزانة علوية',
  CABINET_INSIDE: 'داخل خزانة',
};

export const ACCESSORY_CATEGORIES: readonly AccessoryCategory[] = [
  'ELECTRICAL', 'SINK_TAP', 'APPLIANCE', 'FREESTANDING', 'SMALL_APPLIANCE', 'WORKTOP',
  'WALL', 'LIGHTING', 'DRAWER_ORG', 'INTERIOR', 'SMART', 'DECOR',
];

type Extra = Partial<Omit<AccessoryItem, 'id' | 'category' | 'nameAr' | 'nameEn' | 'icon' | 'mount' | 'model' | 'sizeMm'>>;

const A = (
  category: AccessoryCategory, id: string, nameAr: string, nameEn: string, icon: string,
  mount: AccessoryMount, model: AccessoryModelKey, w: number, h: number, d: number, x: Extra = {},
): AccessoryItem => ({ id, category, nameAr, nameEn, icon, mount, model, sizeMm: { w, h, d }, zPlace: 'REAR', ...x });

const C: Extra = { zPlace: 'CENTER' };
const TAPS: FinishKey[] = ['chrome', 'black', 'gold', 'copper', 'steel'];
const APP: FinishKey[] = ['steel', 'black', 'white'];
const PLATE: FinishKey[] = ['white', 'black', 'steel'];
const ON_SINK = 'يُركَّب على حوض موجود في التصميم.';
const IN_SINK = 'يوضع داخل الحوض.';
const SPAN_NOTE = 'يغطي الجدار بين الرخامة والخزائن العلوية كله.';
const HOOD_NOTE = 'اترك فراغًا بين خزانتين علويتين بعرض الشفاط.';

export const ACCESSORY_CATALOG: readonly AccessoryItem[] = [
  // ======================================================== electricity ================================================
  A('ELECTRICAL', 'popup-2', 'سوكيت بوب أب 2 مأخذ', 'Pop-up socket tower, 2 outlets', '🔌', 'COUNTERTOP', 'popupSocket', 80, 200, 80, { opts: { n: 2 } }),
  A('ELECTRICAL', 'popup-3', 'سوكيت بوب أب 3 مآخذ', 'Pop-up socket tower, 3 outlets', '🔌', 'COUNTERTOP', 'popupSocket', 80, 220, 80, { opts: { n: 3 } }),
  A('ELECTRICAL', 'popup-4', 'سوكيت بوب أب 4 مآخذ', 'Pop-up socket tower, 4 outlets', '🔌', 'COUNTERTOP', 'popupSocket', 80, 260, 80, { opts: { n: 4 } }),
  A('ELECTRICAL', 'popup-usb', 'سوكيت بوب أب مع USB', 'Pop-up socket tower with USB', '🔌', 'COUNTERTOP', 'popupSocket', 80, 220, 80, { opts: { n: 2, usb: true } }),
  A('ELECTRICAL', 'flush-2', 'سوكيت مسطح مدمج (2 مأخذ)', 'Flush worktop socket, 2 outlets', '🔌', 'COUNTERTOP', 'flushSocket', 200, 25, 120, { opts: { n: 2 } }),
  A('ELECTRICAL', 'flush-4', 'سوكيت مسطح مدمج (4 مآخذ)', 'Flush worktop socket, 4 outlets', '🔌', 'COUNTERTOP', 'flushSocket', 300, 25, 130, { opts: { n: 4 } }),
  A('ELECTRICAL', 'flush-usb', 'سوكيت مسطح مع USB', 'Flush worktop socket with USB', '🔌', 'COUNTERTOP', 'flushSocket', 280, 25, 130, { opts: { n: 2, usb: true } }),
  A('ELECTRICAL', 'wireless-charger', 'شاحن لاسلكي مدمج بالرخامة', 'Built-in wireless charger', '📱', 'COUNTERTOP', 'wirelessCharger', 90, 4, 90),
  A('ELECTRICAL', 'socket-rail-4', 'شريط مآخذ جداري (4)', 'Wall socket rail, 4 outlets', '🔌', 'BACKSPLASH', 'railSocket', 600, 45, 40, { opts: { n: 4 }, finishes: ['steel', 'black'] }),
  A('ELECTRICAL', 'socket-rail-6', 'شريط مآخذ جداري (6)', 'Wall socket rail, 6 outlets', '🔌', 'BACKSPLASH', 'railSocket', 900, 45, 40, { opts: { n: 6 }, finishes: ['steel', 'black'] }),
  A('ELECTRICAL', 'wall-socket', 'مأخذ جداري مزدوج', 'Double wall socket', '🔌', 'BACKSPLASH', 'wallPlate', 86, 86, 12, { opts: { kind: 'socket' }, finishes: PLATE }),
  A('ELECTRICAL', 'wall-usbc', 'مأخذ جداري USB-C', 'Wall socket with USB-C', '🔌', 'BACKSPLASH', 'wallPlate', 86, 86, 12, { opts: { kind: 'usbc' }, finishes: PLATE }),
  A('ELECTRICAL', 'wall-switch2', 'مفتاح إضاءة مزدوج', 'Light switch, 2 gang', '💡', 'BACKSPLASH', 'wallPlate', 86, 86, 12, { opts: { kind: 'switch2' }, finishes: PLATE }),
  A('ELECTRICAL', 'wall-switch3', 'مفتاح إضاءة ثلاثي', 'Light switch, 3 gang', '💡', 'BACKSPLASH', 'wallPlate', 146, 86, 12, { opts: { kind: 'switch3' }, finishes: PLATE }),
  A('ELECTRICAL', 'under-strip', 'شريط مآخذ تحت الخزانة العلوية', 'Under-cabinet socket strip', '🔌', 'CABINET_UNDER', 'railSocket', 400, 40, 40, { opts: { n: 3 }, zPlace: 'FRONT', finishes: ['steel', 'black'] }),

  // ======================================================== sinks and taps =============================================
  A('SINK_TAP', 'sink-single', 'حوض ستانلس مفرد', 'Single-bowl steel sink', '🚰', 'COUNTERTOP', 'sink', 540, 20, 440, { ...C, opts: { bowls: '1' }, finishes: ['steel', 'black', 'graphite'] }),
  A('SINK_TAP', 'sink-double', 'حوض مزدوج', 'Double-bowl sink', '🚰', 'COUNTERTOP', 'sink', 860, 20, 500, { ...C, opts: { bowls: '2' }, finishes: ['steel', 'black', 'graphite'] }),
  A('SINK_TAP', 'sink-1half', 'حوض ونصف', '1.5-bowl sink', '🚰', 'COUNTERTOP', 'sink', 780, 20, 480, { ...C, opts: { bowls: '1.5' }, finishes: ['steel', 'black', 'graphite'] }),
  A('SINK_TAP', 'sink-drainer', 'حوض مع مجفف', 'Sink with drainboard', '🚰', 'COUNTERTOP', 'sink', 1000, 20, 500, { ...C, opts: { bowls: 'drain' }, finishes: ['steel', 'black', 'graphite'] }),
  A('SINK_TAP', 'sink-round', 'حوض دائري صغير', 'Round bar sink', '🚰', 'COUNTERTOP', 'sink', 450, 20, 450, { ...C, opts: { bowls: 'round' }, finishes: ['steel', 'black', 'graphite'] }),
  A('SINK_TAP', 'sink-undermount', 'حوض سفلي مدمج (حواف رفيعة)', 'Undermount sink', '🚰', 'COUNTERTOP', 'sink', 600, 18, 450, { ...C, opts: { bowls: '1', thin: true }, finishes: ['steel', 'black', 'graphite'] }),
  A('SINK_TAP', 'sink-granite-black', 'حوض جرانيت أسود', 'Black composite sink', '🚰', 'COUNTERTOP', 'sink', 780, 20, 480, { ...C, opts: { bowls: '1.5' }, finishes: ['black'] }),
  A('SINK_TAP', 'sink-granite-white', 'حوض كوارتز أبيض', 'White composite sink', '🚰', 'COUNTERTOP', 'sink', 860, 20, 500, { ...C, opts: { bowls: '2' }, finishes: ['white'] }),
  A('SINK_TAP', 'sink-workstation', 'حوض ذكي (محطة عمل) مع لوح تقطيع', 'Workstation sink with cutting board', '🚰', 'COUNTERTOP', 'sinkWorkstation', 750, 25, 450, { ...C, finishes: ['steel', 'black', 'graphite'] }),
  A('SINK_TAP', 'tap-pulldown', 'محبس رأس سحّاب', 'Pull-down tap', '🚿', 'COUNTERTOP', 'tap', 60, 420, 220, { rest: 'SINK', restGroup: 'TAP', opts: { reach: 150, drop: 90 }, finishes: TAPS, note: ON_SINK }),
  A('SINK_TAP', 'tap-gooseneck', 'محبس عالي منحني', 'Gooseneck tap', '🚿', 'COUNTERTOP', 'tap', 60, 380, 200, { rest: 'SINK', restGroup: 'TAP', opts: { reach: 130, drop: 60 }, finishes: TAPS, note: ON_SINK }),
  A('SINK_TAP', 'tap-lowarc', 'محبس منخفض عصري', 'Low-arc tap', '🚿', 'COUNTERTOP', 'tap', 60, 260, 180, { rest: 'SINK', restGroup: 'TAP', opts: { reach: 110, drop: 40 }, finishes: TAPS, note: ON_SINK }),
  A('SINK_TAP', 'tap-sensor', 'محبس بحسّاس بدون لمس', 'Touchless sensor tap', '🚿', 'COUNTERTOP', 'tap', 60, 340, 190, { rest: 'SINK', restGroup: 'TAP', opts: { reach: 120, drop: 60, style: 'sensor' }, finishes: ['black', 'chrome', 'steel'], note: ON_SINK }),
  A('SINK_TAP', 'tap-boiling', 'محبس مياه مغلية 3 في 1', 'Boiling-water 3-in-1 tap', '🚿', 'COUNTERTOP', 'tap', 70, 360, 200, { rest: 'SINK', restGroup: 'TAP', opts: { reach: 120, drop: 50, style: 'boiling' }, finishes: ['chrome', 'black', 'gold', 'steel'], note: ON_SINK }),
  A('SINK_TAP', 'tap-waterfall', 'محبس شلال', 'Waterfall tap', '🚿', 'COUNTERTOP', 'tap', 70, 220, 190, { rest: 'SINK', restGroup: 'TAP', opts: { reach: 120, style: 'waterfall' }, finishes: ['chrome', 'black', 'gold'], note: ON_SINK }),
  A('SINK_TAP', 'soap-dispenser', 'موزّع صابون مدمج', 'Built-in soap dispenser', '🧴', 'COUNTERTOP', 'soapDispenser', 45, 120, 70, { rest: 'SINK', restGroup: 'SOAP', finishes: TAPS, note: ON_SINK }),
  A('SINK_TAP', 'sink-rack', 'شبك حماية للحوض', 'Sink bottom grid', '🧽', 'COUNTERTOP', 'sinkRack', 380, 30, 330, { rest: 'SINK', restGroup: 'RACK', restZ: 'CENTER', note: IN_SINK }),
  A('SINK_TAP', 'colander', 'مصفاة قابلة للتعليق', 'Over-sink colander', '🥣', 'COUNTERTOP', 'colander', 290, 90, 240, { rest: 'SINK', restGroup: 'COLANDER', restZ: 'CENTER', note: IN_SINK }),
  A('SINK_TAP', 'sink-board', 'لوح تقطيع فوق الحوض', 'Over-sink cutting board', '🪵', 'COUNTERTOP', 'sinkBoard', 420, 22, 260, { rest: 'SINK', restGroup: 'BOARD', restZ: 'CENTER', note: 'يوضع فوق الحوض.' }),

  // ======================================================== hobs and hoods =============================================
  A('APPLIANCE', 'hob-induction-30', 'موقد حثّي 30 سم (دومينو)', 'Induction hob 30 cm', '🔥', 'COUNTERTOP', 'hobInduction', 290, 6, 520, { ...C, opts: { zones: 2 } }),
  A('APPLIANCE', 'hob-induction-60', 'موقد حثّي 60 سم', 'Induction hob 60 cm', '🔥', 'COUNTERTOP', 'hobInduction', 590, 6, 520, { ...C, opts: { zones: 4 } }),
  A('APPLIANCE', 'hob-induction-80', 'موقد حثّي 80 سم', 'Induction hob 80 cm', '🔥', 'COUNTERTOP', 'hobInduction', 780, 6, 520, { ...C, opts: { zones: 4 } }),
  A('APPLIANCE', 'hob-induction-90', 'موقد حثّي 90 سم (5 مناطق)', 'Induction hob 90 cm, 5 zones', '🔥', 'COUNTERTOP', 'hobInduction', 900, 6, 520, { ...C, opts: { zones: 5 } }),
  A('APPLIANCE', 'hob-flex-80', 'موقد حثّي مرن (Flex)', 'Flex induction hob', '🔥', 'COUNTERTOP', 'hobInduction', 800, 6, 520, { ...C, opts: { zones: 'flex' } }),
  A('APPLIANCE', 'hob-downdraft', 'موقد حثّي مع شفاط مدمج', 'Induction hob with downdraft extractor', '🔥', 'COUNTERTOP', 'hobDowndraft', 800, 150, 520, C),
  A('APPLIANCE', 'hob-gas-30', 'موقد غاز شعلتان (30 سم)', 'Gas hob, 2 burners', '🔥', 'COUNTERTOP', 'hobGas', 300, 45, 510, { ...C, opts: { burners: 2 } }),
  A('APPLIANCE', 'hob-gas-60', 'موقد غاز 4 شعلات (60 سم)', 'Gas hob, 4 burners', '🔥', 'COUNTERTOP', 'hobGas', 580, 45, 510, { ...C, opts: { burners: 4 } }),
  A('APPLIANCE', 'hob-gas-glass', 'موقد غاز بسطح زجاجي', 'Glass-top gas hob', '🔥', 'COUNTERTOP', 'hobGas', 600, 45, 510, { ...C, opts: { burners: 4, glass: true } }),
  A('APPLIANCE', 'hob-gas-75', 'موقد غاز 5 شعلات (75 سم)', 'Gas hob, 5 burners', '🔥', 'COUNTERTOP', 'hobGas', 750, 45, 510, { ...C, opts: { burners: 5 } }),
  A('APPLIANCE', 'hood-chimney-60', 'شفاط مدخنة 60 سم', 'Chimney hood 60 cm', '🌀', 'ABOVE_HOB', 'hoodChimney', 600, 900, 450, { preferHob: true, finishes: APP, note: HOOD_NOTE }),
  A('APPLIANCE', 'hood-chimney-90', 'شفاط مدخنة 90 سم', 'Chimney hood 90 cm', '🌀', 'ABOVE_HOB', 'hoodChimney', 900, 900, 500, { preferHob: true, finishes: APP, note: HOOD_NOTE }),
  A('APPLIANCE', 'hood-angled-90', 'شفاط مائل 90 سم', 'Angled hood 90 cm', '🌀', 'ABOVE_HOB', 'hoodAngled', 900, 700, 500, { preferHob: true, finishes: APP, note: HOOD_NOTE }),
  A('APPLIANCE', 'hood-box-60', 'شفاط صندوقي 60 سم', 'Box hood 60 cm', '🌀', 'ABOVE_HOB', 'hoodBox', 600, 650, 450, { preferHob: true, finishes: APP, note: HOOD_NOTE }),
  A('APPLIANCE', 'hood-glass', 'شفاط زجاجي مائل', 'Slanted glass hood', '🌀', 'ABOVE_HOB', 'hoodGlass', 900, 450, 320, { preferHob: true, finishes: ['black', 'steel'], note: HOOD_NOTE }),
  A('APPLIANCE', 'hood-island', 'شفاط جزيرة معلّق', 'Island hood', '🌀', 'HANGING', 'hoodIsland', 900, 950, 600, { zPlace: 'CENTER', finishes: ['steel', 'black'] }),
  A('APPLIANCE', 'hood-slim-60', 'شفاط مسطح تحت الخزانة (60 سم)', 'Slim under-cabinet hood 60', '🌀', 'CABINET_UNDER', 'hoodSlim', 600, 150, 480, { finishes: APP }),
  A('APPLIANCE', 'hood-slim-90', 'شفاط مسطح تحت الخزانة (90 سم)', 'Slim under-cabinet hood 90', '🌀', 'CABINET_UNDER', 'hoodSlim', 900, 150, 480, { finishes: APP }),

  // ======================================================== freestanding appliances ====================================
  A('FREESTANDING', 'fridge-single', 'ثلاجة بباب واحد', 'Single-door fridge', '🧊', 'FLOOR', 'fridge', 600, 1850, 650, { opts: { type: 'single' }, finishes: APP }),
  A('FREESTANDING', 'fridge-top', 'ثلاجة بفريزر علوي', 'Top-freezer fridge', '🧊', 'FLOOR', 'fridge', 600, 1700, 650, { opts: { type: 'top' }, finishes: APP }),
  A('FREESTANDING', 'fridge-bottom', 'ثلاجة بفريزر سفلي', 'Bottom-freezer fridge', '🧊', 'FLOOR', 'fridge', 600, 2000, 650, { opts: { type: 'bottom' }, finishes: APP }),
  A('FREESTANDING', 'fridge-sbs', 'ثلاجة جنبًا إلى جنب', 'Side-by-side fridge', '🧊', 'FLOOR', 'fridge', 910, 1780, 700, { opts: { type: 'sbs' }, finishes: APP }),
  A('FREESTANDING', 'fridge-french', 'ثلاجة بأبواب فرنسية', 'French-door fridge', '🧊', 'FLOOR', 'fridge', 830, 1780, 700, { opts: { type: 'french' }, finishes: APP }),
  A('FREESTANDING', 'wine-cooler', 'خزانة نبيذ عمودية', 'Tall wine cooler', '🍷', 'FLOOR', 'wineCooler', 600, 1800, 600, { finishes: ['black', 'steel'] }),
  A('FREESTANDING', 'range-60', 'فرن بموقد قائم 60 سم', 'Freestanding cooker 60 cm', '🍳', 'FLOOR', 'range', 600, 900, 600, { opts: { burners: 4 }, finishes: APP }),
  A('FREESTANDING', 'range-90', 'فرن بموقد قائم 90 سم', 'Freestanding range 90 cm', '🍳', 'FLOOR', 'range', 900, 900, 650, { opts: { burners: 5 }, finishes: APP }),
  A('FREESTANDING', 'dishwasher-free', 'غسالة أطباق قائمة', 'Freestanding dishwasher', '🍽️', 'FLOOR', 'dishwasherFree', 600, 850, 600, { finishes: APP }),
  A('FREESTANDING', 'washer', 'غسالة ملابس أمامية', 'Front-loading washer', '🧺', 'FLOOR', 'washer', 600, 850, 600, { finishes: ['white', 'steel', 'black'] }),
  A('FREESTANDING', 'dryer', 'مجفف ملابس', 'Tumble dryer', '🧺', 'FLOOR', 'washer', 600, 850, 600, { opts: { dryer: true }, finishes: ['white', 'steel', 'black'] }),

  // ======================================================== small appliances ===========================================
  A('SMALL_APPLIANCE', 'espresso', 'ماكينة إسبريسو', 'Espresso machine', '☕', 'COUNTERTOP', 'espresso', 300, 380, 400, { finishes: ['steel', 'black', 'copper'] }),
  A('SMALL_APPLIANCE', 'capsule', 'ماكينة كبسولات', 'Capsule coffee machine', '☕', 'COUNTERTOP', 'espresso', 190, 300, 330, { opts: { compact: true }, finishes: ['black', 'white', 'steel'] }),
  A('SMALL_APPLIANCE', 'coffee-drip', 'ماكينة قهوة فلتر', 'Drip coffee maker', '☕', 'COUNTERTOP', 'coffeeDrip', 260, 360, 300, { finishes: ['black', 'steel'] }),
  A('SMALL_APPLIANCE', 'kettle', 'غلاية كهربائية', 'Electric kettle', '🫖', 'COUNTERTOP', 'kettle', 210, 250, 170, { finishes: ['steel', 'black', 'white', 'copper'] }),
  A('SMALL_APPLIANCE', 'toaster', 'محمصة خبز', 'Toaster', '🍞', 'COUNTERTOP', 'toaster', 300, 190, 180, { finishes: ['steel', 'black', 'white', 'copper'] }),
  A('SMALL_APPLIANCE', 'microwave-counter', 'ميكروويف على الرخامة', 'Countertop microwave', '📟', 'COUNTERTOP', 'microwave', 450, 260, 350, { finishes: APP }),
  A('SMALL_APPLIANCE', 'air-fryer', 'قلاية هوائية', 'Air fryer', '🍟', 'COUNTERTOP', 'airFryer', 300, 340, 380, { finishes: ['black', 'white', 'steel'] }),
  A('SMALL_APPLIANCE', 'blender', 'خلاط', 'Blender', '🥤', 'COUNTERTOP', 'blender', 200, 450, 200, { finishes: APP }),
  A('SMALL_APPLIANCE', 'stand-mixer', 'عجّانة', 'Stand mixer', '🎂', 'COUNTERTOP', 'standMixer', 360, 360, 240, { finishes: ['steel', 'black', 'white', 'copper'] }),
  A('SMALL_APPLIANCE', 'rice-cooker', 'طنجرة أرز كهربائية', 'Rice cooker', '🍚', 'COUNTERTOP', 'riceCooker', 300, 250, 300, { finishes: ['white', 'black', 'steel'] }),
  A('SMALL_APPLIANCE', 'food-processor', 'محضّرة طعام', 'Food processor', '🥕', 'COUNTERTOP', 'foodProcessor', 250, 400, 200, { finishes: APP }),

  // ======================================================== worktop accessories ========================================
  A('WORKTOP', 'cutting-board', 'لوح تقطيع خشبي', 'Wooden cutting board', '🪵', 'COUNTERTOP', 'cuttingBoard', 450, 22, 300, { zPlace: 'FRONT' }),
  A('WORKTOP', 'knife-block', 'حامل سكاكين', 'Knife block', '🔪', 'COUNTERTOP', 'knifeBlock', 130, 280, 250),
  A('WORKTOP', 'utensil-holder', 'حامل أدوات الطبخ', 'Utensil holder', '🥄', 'COUNTERTOP', 'utensilHolder', 150, 300, 150, { finishes: ['steel', 'black', 'copper', 'white'] }),
  A('WORKTOP', 'dish-drainer', 'مجفف أطباق', 'Dish drainer', '🍽️', 'COUNTERTOP', 'dishDrainer', 420, 250, 300, { finishes: ['steel', 'black'] }),
  A('WORKTOP', 'bread-bin', 'صندوق خبز', 'Bread bin', '🥖', 'COUNTERTOP', 'breadBin', 380, 210, 270, { finishes: ['steel', 'black', 'white', 'wood'] }),
  A('WORKTOP', 'spice-counter', 'حامل توابل على الرخامة', 'Countertop spice rack', '🧂', 'COUNTERTOP', 'spiceCounter', 300, 250, 140),
  A('WORKTOP', 'paper-towel', 'حامل مناديل', 'Paper towel holder', '🧻', 'COUNTERTOP', 'paperTowel', 160, 330, 160, { finishes: ['steel', 'black', 'copper', 'wood'] }),
  A('WORKTOP', 'fruit-bowl', 'وعاء فواكه', 'Fruit bowl', '🍎', 'COUNTERTOP', 'fruitBowl', 300, 130, 300, { finishes: ['steel', 'wood', 'black', 'copper'] }),
  A('WORKTOP', 'canisters', 'علب تخزين (3)', 'Storage canisters (3)', '🫙', 'COUNTERTOP', 'canisters', 420, 230, 150, { finishes: ['steel', 'black', 'white', 'copper'] }),

  // ======================================================== splashback and wall ========================================
  A('WALL', 'panel-tile', 'غطاء جداري سيراميك أبيض', 'White subway-tile splashback', '🧱', 'BACKSPLASH', 'panel', 2400, 600, 12, { autoSpan: true, noCollide: true, opts: { style: 'tile' }, finishes: ['white', 'graphite'], note: SPAN_NOTE }),
  A('WALL', 'panel-marble', 'غطاء جداري رخام', 'Marble slab splashback', '🧱', 'BACKSPLASH', 'panel', 2400, 600, 12, { autoSpan: true, noCollide: true, opts: { style: 'marble' }, finishes: ['white', 'graphite'], note: SPAN_NOTE }),
  A('WALL', 'panel-glass', 'غطاء جداري زجاج مدهون', 'Back-painted glass splashback', '🧱', 'BACKSPLASH', 'panel', 2400, 600, 12, { autoSpan: true, noCollide: true, opts: { style: 'glass' }, finishes: ['black', 'white', 'graphite'], note: SPAN_NOTE }),
  A('WALL', 'panel-steel', 'غطاء جداري ستانلس', 'Stainless splashback', '🧱', 'BACKSPLASH', 'panel', 2400, 600, 12, { autoSpan: true, noCollide: true, opts: { style: 'steel' }, note: SPAN_NOTE }),
  A('WALL', 'wall-rail', 'سكة تعليق مع أدوات', 'Hanging rail with utensils', '🥄', 'BACKSPLASH', 'wallRail', 600, 280, 40, { finishes: ['steel', 'black', 'copper', 'gold'] }),
  A('WALL', 'knife-strip', 'شريط سكاكين مغناطيسي', 'Magnetic knife strip', '🔪', 'BACKSPLASH', 'knifeStrip', 450, 230, 25),
  A('WALL', 'float-shelf', 'رف خشبي عائم مع برطمانات', 'Floating shelf with jars', '📚', 'BACKSPLASH', 'floatShelf', 600, 130, 200),
  A('WALL', 'wall-clock', 'ساعة حائط', 'Wall clock', '🕒', 'BACKSPLASH', 'wallClock', 300, 300, 40, { finishes: ['black', 'white', 'steel'] }),
  A('WALL', 'pot-filler', 'محبس ملء القدور فوق الموقد', 'Pot filler tap', '🚿', 'BACKSPLASH', 'potFiller', 300, 260, 400, { preferHob: true, finishes: TAPS, note: 'يوضع فوق الموقد.' }),

  // ======================================================== lighting ===================================================
  A('LIGHTING', 'led-strip', 'شريط LED تحت الخزانة العلوية', 'Under-cabinet LED strip', '💡', 'CABINET_UNDER', 'ledStrip', 600, 12, 20, { zPlace: 'FRONT', autoWidth: true }),
  A('LIGHTING', 'led-profile', 'بروفيل LED عريض', 'Wide LED profile', '💡', 'CABINET_UNDER', 'ledStrip', 600, 20, 30, { zPlace: 'FRONT', autoWidth: true, opts: { thick: true } }),
  A('LIGHTING', 'spot-3', 'سبوتات LED مدمجة (3 قطع)', 'Recessed LED spots (3)', '💡', 'CABINET_UNDER', 'spotLights', 300, 8, 60, { zPlace: 'FRONT' }),
  A('LIGHTING', 'puck-3', 'إضاءة دائرية لاصقة (3 قطع)', 'LED puck lights (3)', '💡', 'CABINET_UNDER', 'puckLights', 360, 15, 90, { zPlace: 'FRONT' }),
  A('LIGHTING', 'pendant-dome', 'ثريا معلّقة قبّة', 'Dome pendant light', '💡', 'HANGING', 'pendantDome', 350, 550, 350, { ...C, finishes: ['black', 'white', 'gold', 'copper'] }),
  A('LIGHTING', 'pendant-globe', 'ثريا معلّقة كروية', 'Globe pendant light', '💡', 'HANGING', 'pendantGlobe', 280, 600, 280, { ...C, finishes: ['white', 'gold', 'black'] }),
  A('LIGHTING', 'pendant-trio', 'ثلاث ثريات معلّقة', 'Trio of pendant lights', '💡', 'HANGING', 'pendantTrio', 900, 600, 300, { ...C, finishes: ['black', 'white', 'gold', 'copper'] }),
  A('LIGHTING', 'pendant-linear', 'ثريا خطية فوق الجزيرة', 'Linear pendant light', '💡', 'HANGING', 'pendantLinear', 1200, 450, 100, { ...C, finishes: ['black', 'steel', 'gold'] }),
  A('LIGHTING', 'wall-sconce', 'تطبيقة جدارية', 'Wall sconce', '💡', 'BACKSPLASH', 'wallSconce', 160, 240, 190, { finishes: ['black', 'gold', 'copper'] }),
  A('LIGHTING', 'inner-led', 'إضاءة LED داخل الخزانة', 'Interior cabinet LED', '💡', 'CABINET_INSIDE', 'ledStrip', 500, 12, 20, { zPlace: 'FRONT' }),

  // ======================================================== drawer organisers ==========================================
  A('DRAWER_ORG', 'cutlery-tray', 'منظّم أدوات المائدة', 'Cutlery tray', '🍴', 'CABINET_INSIDE', 'insertTray', 400, 55, 450, { ...C, opts: { cols: 4, rows: 2 }, finishes: ['wood', 'white', 'black', 'graphite'] }),
  A('DRAWER_ORG', 'utensil-tray', 'منظّم أدوات الطبخ', 'Utensil tray', '🥄', 'CABINET_INSIDE', 'insertTray', 450, 60, 450, { ...C, opts: { cols: 3, rows: 1 }, finishes: ['wood', 'white', 'black', 'graphite'] }),
  A('DRAWER_ORG', 'wood-tray', 'صينية خشبية للدرج', 'Wooden drawer insert', '🪵', 'CABINET_INSIDE', 'insertTray', 450, 50, 450, { ...C, opts: { cols: 1, rows: 1 }, finishes: ['wood', 'white'] }),
  A('DRAWER_ORG', 'knife-insert', 'منظّم سكاكين للدرج', 'Drawer knife insert', '🔪', 'CABINET_INSIDE', 'knifeInsert', 400, 50, 450, C),
  A('DRAWER_ORG', 'spice-insert', 'منظّم توابل للدرج', 'Drawer spice insert', '🧂', 'CABINET_INSIDE', 'insertTray', 400, 90, 450, { ...C, opts: { cols: 5, rows: 3, jars: true }, finishes: ['wood', 'white', 'black'] }),
  A('DRAWER_ORG', 'plate-pegs', 'منظّم أطباق بالأوتاد', 'Plate drawer with pegs', '🍽️', 'CABINET_INSIDE', 'platePegs', 500, 70, 450, C),
  A('DRAWER_ORG', 'lid-rack', 'حامل أغطية القدور', 'Pot lid rack', '🥘', 'CABINET_INSIDE', 'plateRack', 400, 120, 450, C),
  A('DRAWER_ORG', 'tray-divider', 'فاصل صواني الخبز', 'Baking tray divider', '🍪', 'CABINET_INSIDE', 'trayDivider', 400, 300, 450, C),

  // ======================================================== cabinet organisers =========================================
  A('INTERIOR', 'wire-basket', 'سلّة سحب سلكية', 'Pull-out wire basket', '🧺', 'CABINET_INSIDE', 'pulloutBasket', 450, 150, 450, C),
  A('INTERIOR', 'bottle-rack', 'حامل زجاجات سحّاب', 'Pull-out bottle rack', '🍾', 'CABINET_INSIDE', 'bottleRack', 150, 500, 450, C),
  A('INTERIOR', 'spice-pullout', 'رف توابل سحّاب', 'Pull-out spice rack', '🧂', 'CABINET_INSIDE', 'bottleRack', 150, 400, 450, C),
  A('INTERIOR', 'corner-carousel', 'دوّار الزاوية', 'Corner carousel', '🔄', 'CABINET_INSIDE', 'cornerCarousel', 520, 560, 520, { ...C, note: 'يحتاج خزانة بعرض 600 مم أو أكثر.' }),
  A('INTERIOR', 'magic-corner', 'سلال الزاوية العمياء', 'Blind-corner pull-out baskets', '🧺', 'CABINET_INSIDE', 'magicCorner', 450, 200, 480, C),
  A('INTERIOR', 'waste-sorter', 'سلّة نفايات مفرزة (3 فرز)', 'Sorting waste bins (3)', '🗑️', 'CABINET_INSIDE', 'wasteSorter', 450, 400, 450, C),
  A('INTERIOR', 'larder', 'خزانة مؤونة سحّابة عالية', 'Tall pull-out larder', '🗄️', 'CABINET_INSIDE', 'larder', 300, 1500, 500, C),
  A('INTERIOR', 'rollout-shelf', 'رف منزلق', 'Roll-out shelf', '📦', 'CABINET_INSIDE', 'rolloutShelf', 450, 60, 480, C),
  A('INTERIOR', 'under-sink-u', 'درج على شكل U تحت الحوض', 'U-shaped under-sink drawer', '🧽', 'CABINET_INSIDE', 'underSinkU', 520, 150, 480, C),
  A('INTERIOR', 'disposer', 'مطحنة نفايات الحوض', 'Waste disposer', '⚙️', 'CABINET_INSIDE', 'disposer', 170, 330, 170, C),
  A('INTERIOR', 'water-filter', 'فلتر مياه ثلاثي المراحل', 'Under-sink water filter', '💧', 'CABINET_INSIDE', 'waterFilter', 300, 380, 150, C),
  A('INTERIOR', 'boiler-tank', 'خزّان مياه مغلية', 'Boiling-water tank', '♨️', 'CABINET_INSIDE', 'boilerTank', 260, 300, 260, C),
  A('INTERIOR', 'towel-rail', 'حامل مناشف سحّاب', 'Pull-out towel rail', '🧣', 'CABINET_INSIDE', 'towelRail', 400, 100, 450, C),
  A('INTERIOR', 'wire-shelf', 'رف سلكي إضافي', 'Extra wire shelf', '🗃️', 'CABINET_INSIDE', 'wireShelf', 560, 40, 480, C),
  A('INTERIOR', 'plate-rack', 'حامل صحون عمودي', 'Vertical plate rack', '🍽️', 'CABINET_INSIDE', 'plateRack', 400, 120, 450, C),

  // ======================================================== smart home and safety ======================================
  A('SMART', 'smart-display', 'شاشة ذكية للمطبخ', 'Smart kitchen display', '📱', 'BACKSPLASH', 'smartDisplay', 320, 210, 20),
  A('SMART', 'gas-detector', 'كاشف تسرّب الغاز', 'Gas leak detector', '🚨', 'BACKSPLASH', 'gasDetector', 90, 90, 40),
  A('SMART', 'extinguisher', 'طفاية حريق', 'Fire extinguisher', '🧯', 'BACKSPLASH', 'extinguisher', 110, 380, 110),
  A('SMART', 'smart-speaker', 'مكبّر صوت ذكي', 'Smart speaker', '🔊', 'COUNTERTOP', 'smartSpeaker', 100, 120, 100, { finishes: ['black', 'white', 'graphite'] }),
  A('SMART', 'usb-dock', 'محطة شحن متعددة', 'Multi-device charging dock', '🔋', 'COUNTERTOP', 'usbDock', 220, 120, 120, { finishes: ['black', 'white', 'steel'] }),

  // ======================================================== decor and furniture ========================================
  A('DECOR', 'plant-pot', 'نبتة في أصيص', 'Potted plant', '🪴', 'COUNTERTOP', 'plantPot', 180, 320, 180, { finishes: ['white', 'black', 'copper'] }),
  A('DECOR', 'herb-trio', 'أعشاب المطبخ (3 أصص)', 'Kitchen herbs (3 pots)', '🌿', 'COUNTERTOP', 'herbTrio', 360, 220, 120),
  A('DECOR', 'vase', 'مزهرية بورود', 'Vase with flowers', '💐', 'COUNTERTOP', 'vase', 140, 380, 140, { finishes: ['white', 'black', 'copper', 'gold'] }),
  A('DECOR', 'cookbook', 'كتب وصفات على حامل', 'Cookbook stand', '📖', 'COUNTERTOP', 'cookbook', 260, 280, 120),
  A('DECOR', 'bar-stool', 'كرسي بار', 'Bar stool', '🪑', 'FLOOR', 'barStool', 380, 700, 380, { zPlace: 'FRONT', finishes: ['black', 'wood', 'white', 'steel'] }),
  A('DECOR', 'trolley', 'عربة مطبخ متحركة', 'Kitchen trolley', '🛒', 'FLOOR', 'trolley', 500, 850, 400, { finishes: ['black', 'wood', 'white', 'steel'] }),
  A('DECOR', 'runner-rug', 'سجادة ممر للمطبخ', 'Kitchen runner rug', '🟫', 'FLOOR', 'rug', 1800, 8, 600, { zPlace: 'FRONT', noCollide: true, finishes: ['graphite', 'wood', 'white', 'black'] }),
];

export function getAccessory(id: string): AccessoryItem | undefined {
  return ACCESSORY_CATALOG.find((a) => a.id === id);
}

export function accessoriesOf(category: AccessoryCategory): AccessoryItem[] {
  return ACCESSORY_CATALOG.filter((a) => a.category === category);
}

/** Sinks are the only pieces a tap or a soap dispenser can sit on. */
export function isSink(item: AccessoryItem): boolean {
  return item.mount === 'COUNTERTOP' && item.category === 'SINK_TAP' && !item.rest;
}

export function isHob(item: AccessoryItem): boolean {
  return item.model === 'hobInduction' || item.model === 'hobGas' || item.model === 'hobDowndraft';
}

/** The finish a piece is drawn with: the chosen one when the piece offers it, else its first, else stainless. */
export function resolveFinish(item: AccessoryItem, key?: FinishKey): FinishStyle {
  const k: FinishKey = key && item.finishes?.includes(key) ? key : item.finishes?.[0] ?? 'steel';
  return FINISHES[k];
}

/** Search over Arabic and English names, the category and the extra tags (case-insensitive, every word must match). */
export function searchAccessories(query: string): AccessoryItem[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return ACCESSORY_CATALOG.filter((a) => {
    const hay = `${a.nameAr} ${a.nameEn} ${CATEGORY_LABELS[a.category]} ${a.tags ?? ''}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
