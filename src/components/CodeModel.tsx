// src/components/CodeModel.tsx
// Draws a detailed model built in code (src/components/codeModels) inside the box of its catalog piece. Like GlbModel, a failure
// (no canvas, no WebGL feature...) falls back to the built-in shapes instead of breaking the scene.
import React, { ReactNode, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { CodeModelId } from '../data/accessoryCatalog';
import { fitToBox } from '../math/modelFit';
import { CODE_MODELS } from './codeModels';
import { GlbBoundary } from './GlbModel';

interface CodeModelProps {
  codeId: CodeModelId;
  size: { w: number; h: number; d: number };
  xray: boolean;
}

type Disposable = { dispose?: () => void };

/** Frees what the model created: geometries, materials and their textures. */
function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach((m) => {
      const mat = m as THREE.Material & Record<string, unknown>;
      for (const k of ['map', 'bumpMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap']) (mat[k] as Disposable | null | undefined)?.dispose?.();
      mat.dispose();
    });
  });
}

/** X-ray: every material half transparent; turned off, each one gets its own settings back. */
function applyXray(root: THREE.Object3D, on: boolean): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach((m) => {
      const mat = m as THREE.Material;
      if (on) {
        if (!mat.userData.xrayBackup) mat.userData.xrayBackup = { transparent: mat.transparent, opacity: mat.opacity };
        mat.transparent = true;
        mat.opacity = Math.min(mat.opacity, 0.45);
      } else if (mat.userData.xrayBackup) {
        mat.transparent = mat.userData.xrayBackup.transparent;
        mat.opacity = mat.userData.xrayBackup.opacity;
        delete mat.userData.xrayBackup;
      }
      mat.needsUpdate = true;
    });
  });
}

function CodeScene({ codeId, size, xray }: CodeModelProps) {
  const def = CODE_MODELS[codeId];
  const { root, fit } = useMemo(() => {
    const built = def.build();
    built.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(built);
    return {
      root: built,
      fit: fitToBox({ min: [box.min.x, box.min.y, box.min.z], max: [box.max.x, box.max.y, box.max.z] }, size, 'contain'),
    };
  }, [def, size.w, size.h, size.d]);

  useEffect(() => () => disposeTree(root), [root]);
  useEffect(() => applyXray(root, xray), [root, xray]);
  useFrame((_state, dt) => def.animate?.(root, dt));

  return (
    <group position={fit.offset} scale={fit.scale}>
      <primitive object={root} />
    </group>
  );
}

export default function CodeModel(props: CodeModelProps & { fallback: ReactNode }) {
  const { fallback, ...rest } = props;
  return (
    <GlbBoundary fallback={fallback}>
      <CodeScene {...rest} />
    </GlbBoundary>
  );
}
