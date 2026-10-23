// src/components/codeModels/index.ts
// The detailed models built in code. The key type is the list of ids of the catalog, so a catalog piece can never point at a model
// that does not exist (TypeScript refuses to compile).
import type * as THREE from 'three';
import type { CodeModelId } from '../../data/accessoryCatalog';
import { animateLgThinqWasher, buildLgThinqWasher } from './lgThinqWasher';

export interface CodeModelDef {
  build: () => THREE.Object3D;
  /** Called every frame with the seconds since the previous one (a drum that turns, for example). */
  animate?: (root: THREE.Object3D, dt: number) => void;
}

export const CODE_MODELS: Record<CodeModelId, CodeModelDef> = {
  'lg-thinq-washer': { build: buildLgThinqWasher, animate: animateLgThinqWasher },
};
