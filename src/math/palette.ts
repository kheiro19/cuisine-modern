// src/math/palette.ts
// ONE place for the colours the 3D showcase paints with. Nothing else in the app should carry a hex of its own.
//
// The workshop finishes are named, not coded by the user: the front is WALNUT, the carcase is CASHMERE, the room is
// SLATE. A real texture (frontTextureOverride, or a file that follows the wood_ / stone_ convention) still wins: it is
// painted over a neutral white so the image shows its own colour. As long as no texture resolves — which is the case
// for every board in the current stock — the panel is painted with these colours.

export interface PaletteColour {
  /** The workshop name, Arabic. */
  name: string;
  /** The same finish in English, as it is written on an order. */
  english: string;
  /** `#RRGGBB` */
  color: string;
  /** Only used when NO sheet is picked at all: a picked sheet brings its own finish (see TextureEngine). */
  roughness: number;
  metalness: number;
}

export const DEFAULT_PALETTE = {
  /** Doors and drawer fronts. */
  front: { name: 'بني الجوز المطفي', english: 'Matte Walnut', color: '#5C4033', roughness: 0.62, metalness: 0 },
  /** Carcase: sides, tops, bottoms, shelves and dividers. */
  carcase: { name: 'بيج كشمير مطفي فائق', english: 'Super Matte Cashmere', color: '#D9CFC2', roughness: 0.85, metalness: 0 },
  /**
   * The empty room behind the kitchen. Mid slate, not charcoal black: the walnut front and this room must not share a
   * luminance, or the doors melt into the background (measured: a #414852 room is 1.02:1 against the walnut — invisible;
   * this one is 2.34:1). The test palette.test.ts holds the ratio.
   */
  background: { name: 'رمادي فحم بارد', english: 'Slate Cool Gray', color: '#75808E', roughness: 1, metalness: 0 },
} as const satisfies Record<string, PaletteColour>;

export type PaletteRole = keyof typeof DEFAULT_PALETTE;

const HEX = /^#[0-9a-fA-F]{6}$/;

export function isHexColour(value: string): boolean {
  return HEX.test(value);
}

function channels(hex: string): [number, number, number] {
  if (!HEX.test(hex)) throw new Error(`not a #RRGGBB colour: ${hex}`);
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');

/** Linear mix of two `#RRGGBB`: t = 0 gives `a`, t = 1 gives `b`. */
export function mixHex(a: string, b: string, t: number): string {
  const [r1, g1, b1] = channels(a);
  const [r2, g2, b2] = channels(b);
  const k = Math.max(0, Math.min(1, t));
  return `#${hex2(r1 + (r2 - r1) * k)}${hex2(g1 + (g2 - g1) * k)}${hex2(b1 + (b2 - b1) * k)}`.toUpperCase();
}

/**
 * The two colours of the floor grid, derived from the room: a grid drawn in fixed light grey disappears on a light
 * room and blinds on a dark one. These lift the background just enough to be read from any camera angle.
 */
export function gridColoursOf(background: string): { cell: string; section: string } {
  return { cell: mixHex(background, '#FFFFFF', 0.12), section: mixHex(background, '#FFFFFF', 0.24) };
}

/** Relative luminance (WCAG): the tests use it to prove the room and the panels are far enough apart to be seen. */
export function luminanceOf(hex: string): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = channels(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Contrast ratio of two colours (1 = identical, 21 = black on white). */
export function contrastRatio(a: string, b: string): number {
  const [l1, l2] = [luminanceOf(a), luminanceOf(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}
