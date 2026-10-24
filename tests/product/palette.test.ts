// The colours the showcase paints with, in ONE place (math/palette.ts): walnut fronts, cashmere carcase, slate room.
// Two things are proved here: the paint survives when no texture resolves (it used to go white), and the room stays far
// enough from both finishes to be seen from any camera angle.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PALETTE,
  contrastRatio,
  gridColoursOf,
  isHexColour,
  luminanceOf,
  mixHex,
} from '../../src/math/palette';
import { TextureEngine } from '../../src/math/textureEngine';

/** A board from the stock: its brand has no wood_<brand>.webp file, which is true of all 307 textures in /public. */
const BOARD = {
  id: 'mdf18', brand: 'EGGER (Austria)', type: 'MDF Melamine Matt', thickness: 18,
  widthSheet: 2800, heightSheet: 2070, edgeThickness: 0, edgeWidth: 0, currentQty: 50, averagePriceDA: 15000,
};

const hexOf = (material: { color: { getHexString(): string } }) => `#${material.color.getHexString()}`.toUpperCase();

test('the three finishes are the ones asked for, and they are real colours', () => {
  assert.equal(DEFAULT_PALETTE.front.english, 'Matte Walnut');
  assert.equal(DEFAULT_PALETTE.front.name, 'بني الجوز المطفي');
  assert.equal(DEFAULT_PALETTE.carcase.english, 'Super Matte Cashmere');
  assert.equal(DEFAULT_PALETTE.carcase.name, 'بيج كشمير مطفي فائق');
  assert.equal(DEFAULT_PALETTE.background.english, 'Slate Cool Gray');
  assert.equal(DEFAULT_PALETTE.background.name, 'رمادي فحم بارد');
  for (const key of ['front', 'carcase', 'background']) {
    assert.ok(isHexColour(DEFAULT_PALETTE[key].color), `${key}: #RRGGBB`);
  }
  // three different colours: a front painted like its carcase is not a front
  assert.notEqual(DEFAULT_PALETTE.front.color, DEFAULT_PALETTE.carcase.color);
  assert.notEqual(DEFAULT_PALETTE.carcase.color, DEFAULT_PALETTE.background.color);
});

test('the carcase is the light one and the front the dark one — the doors read against the boards', () => {
  assert.ok(luminanceOf(DEFAULT_PALETTE.carcase.color) > luminanceOf(DEFAULT_PALETTE.front.color));
  assert.ok(contrastRatio(DEFAULT_PALETTE.front.color, DEFAULT_PALETTE.carcase.color) >= 4.5,
    'walnut on cashmere must be an obvious edge, not a shade');
});

test('the room never swallows a finish: both are at least 2:1 against the slate', () => {
  const bg = DEFAULT_PALETTE.background.color;
  assert.ok(contrastRatio(DEFAULT_PALETTE.front.color, bg) >= 2,
    `walnut front vs room: ${contrastRatio(DEFAULT_PALETTE.front.color, bg).toFixed(2)}`);
  assert.ok(contrastRatio(DEFAULT_PALETTE.carcase.color, bg) >= 2,
    `cashmere carcase vs room: ${contrastRatio(DEFAULT_PALETTE.carcase.color, bg).toFixed(2)}`);
});

test('the floor grid is derived from the room, so it can never disappear into it', () => {
  const bg = DEFAULT_PALETTE.background.color;
  const grid = gridColoursOf(bg);
  assert.ok(luminanceOf(grid.cell) > luminanceOf(bg), 'the fine lines are lighter than the room');
  assert.ok(luminanceOf(grid.section) > luminanceOf(grid.cell), 'the 0.5 m lines are lighter than the 0.1 m ones');
  // ...and by a measured amount, not by a rounding step
  assert.ok(contrastRatio(grid.cell, bg) > 1.1);
});

test('mixHex is a real interpolation and refuses a malformed colour', () => {
  assert.equal(mixHex('#000000', '#FFFFFF', 0), '#000000');
  assert.equal(mixHex('#000000', '#FFFFFF', 1), '#FFFFFF');
  assert.equal(mixHex('#000000', '#FFFFFF', 0.5), '#808080');
  assert.equal(mixHex('#000000', '#FFFFFF', 5), '#FFFFFF', 'out of range is clamped, never NaN');
  assert.throws(() => mixHex('red', '#FFFFFF', 0.5));
});

test('a board with no texture file is painted with the palette, NOT white (the old behaviour)', () => {
  const carcase = TextureEngine.compileProceduralMaterial(BOARD, 560, 720, false, DEFAULT_PALETTE.carcase.color, 'vertical', undefined, DEFAULT_PALETTE.carcase);
  assert.equal(hexOf(carcase), DEFAULT_PALETTE.carcase.color);

  const front = TextureEngine.compileProceduralMaterial(BOARD, 596, 716, false, DEFAULT_PALETTE.front.color, 'vertical', undefined, DEFAULT_PALETTE.front);
  assert.equal(hexOf(front), DEFAULT_PALETTE.front.color);
  assert.notEqual(hexOf(front), '#FFFFFF', 'a missing image must not leave a white door');
});

test('the finish follows the sheet when there is one, the palette when there is none', () => {
  // a melamine matt board: its own sheen wins (0.5), the colour is still the palette's
  const board = TextureEngine.compileProceduralMaterial(BOARD, 560, 720, false, DEFAULT_PALETTE.carcase.color, 'vertical', undefined, DEFAULT_PALETTE.carcase);
  assert.equal(board.roughness, 0.5);
  // no sheet at all: the palette's own finish ("super matte" cashmere is the matte one)
  const none = TextureEngine.compileProceduralMaterial(undefined, 560, 720, false, DEFAULT_PALETTE.carcase.color, 'vertical', undefined, DEFAULT_PALETTE.carcase);
  assert.equal(none.roughness, DEFAULT_PALETTE.carcase.roughness);
  assert.equal(none.metalness, DEFAULT_PALETTE.carcase.metalness);
  assert.ok(DEFAULT_PALETTE.carcase.roughness > DEFAULT_PALETTE.front.roughness, 'cashmere is the more matte of the two');
});

test('X-ray keeps the colours and only changes the opacity', () => {
  const ghost = TextureEngine.compileProceduralMaterial(BOARD, 596, 716, true, DEFAULT_PALETTE.front.color, 'vertical', undefined, DEFAULT_PALETTE.front);
  assert.equal(hexOf(ghost), DEFAULT_PALETTE.front.color, 'the ghost is walnut too, just see-through');
  assert.equal(ghost.transparent, true);
  assert.ok(ghost.opacity < 1);
});

test('an override texture keeps the palette until its image is really loaded', () => {
  // The loader is stubbed on purpose: this test is about the colour of the material BEFORE any image arrives, and a real
  // load in node has no document to decode into (it would fail asynchronously, after the test ended).
  const real = TextureEngine.applyTextureAsync;
  TextureEngine.applyTextureAsync = () => {};
  try {
    const withOverride = TextureEngine.compileProceduralMaterial(BOARD, 596, 716, false, DEFAULT_PALETTE.front.color, 'vertical',
      { path: '/textures/FL-W101_sZUy.webp', finishType: 'MDF Wood Grain / Textured' }, DEFAULT_PALETTE.front);
    assert.equal(hexOf(withOverride), DEFAULT_PALETTE.front.color, 'a picked texture must not blank the door to white before it loads');
  } finally {
    TextureEngine.applyTextureAsync = real;
  }
});
