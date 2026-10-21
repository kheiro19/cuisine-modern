// @ts-nocheck
// The 24 templates the app used to offer, kept as TEST FIXTURES. The app now offers only four (src/rules/templates), but the engines
// (appliance bays, split columns, pull-out frames, Gola, lift...) are still there and are still tested on every one of these shapes.
import { CabinetDraft } from '../../../src/math/cabinetPresets';
import { FAMILIES, FAMILY_ORDER } from './families';
import { SUBTYPES, TEMPLATES, templatesOf } from './templates';

export { FAMILIES, FAMILY_ORDER, SUBTYPES, TEMPLATES, templatesOf };

/** Same as the app's draftFromPreset, but from the old 24 templates. */
export function draftFromPreset(subtype, keep = {}): CabinetDraft {
  const p = TEMPLATES[subtype];
  return {
    subtype,
    category: p.category,
    width: p.dims.width,
    height: p.dims.height,
    depth: p.dims.depth,
    zones: p.zones.map((z) => ({ ...z })),
    openingMode: p.openingMode ?? 'HANDLE',
    dividerBoards: 1,
    frontStyle: p.frontStyle ?? 'SOLID',
    golaSlots: [],
    carcaseMaterialId: keep.carcaseMaterialId ?? '',
    frontMaterialId: keep.frontMaterialId ?? '',
    carcaseEdgeRollId: keep.carcaseEdgeRollId ?? '',
    frontEdgeRollId: keep.frontEdgeRollId ?? '',
    hardwareItemId: '',
    drawerHardwareItemId: '',
    ...(p.preferLift ? { preferLift: true } : {}),
  };
}
