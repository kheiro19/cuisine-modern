// src/components/GlbModel.tsx
// Draws a real 3D model (.glb of the external library) inside the box of its catalog piece. If the file cannot be loaded the
// boundary falls back to the built-in shapes, so a broken or missing file never breaks the scene.
import { Component, ReactNode, Suspense, useEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { FinishStyle } from '../data/accessoryCatalog';
import { GlbResolution } from '../data/libraryManifest';
import { fitToBox, rotateBBoxY } from '../math/modelFit';

interface GlbModelProps {
  url: string;
  res: GlbResolution;
  size: { w: number; h: number; d: number };
  finish?: FinishStyle;
  xray: boolean;
  /** The user gave this piece their own size: the model must fill exactly that box, axis by axis. Without it the
   * manifest's 'contain' keeps the file's own proportions at the catalog size it was authored for. */
  resized?: boolean;
}

// Draco / Meshopt files download their decoder from the internet the first time (drei's default). To work offline, host the
// decoder in public/draco/ and call useGLTF.setDecoderPath('/draco/') once.
function GlbScene({ url, res, size, finish, xray, resized }: GlbModelProps) {
  const gltf = useGLTF(url) as unknown as { scene: THREE.Object3D };

  const { root, owned, fit } = useMemo(() => {
    const clone = gltf.scene.clone(true);
    const created: THREE.Material[] = [];
    clone.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const next = list.map((m) => {
        const c = (m as THREE.Material).clone() as THREE.MeshStandardMaterial;
        created.push(c);
        if (finish && res.tintMaterials.includes(c.name) && c.color) {
          c.color.set(finish.c);
          if (typeof c.metalness === 'number') c.metalness = finish.metal;
          if (typeof c.roughness === 'number') c.roughness = finish.rough;
        }
        if (xray) {
          c.transparent = true;
          c.opacity = 0.45;
        }
        return c;
      });
      mesh.material = Array.isArray(mesh.material) ? next : next[0];
    });
    return { root: clone, owned: created, fit: fitToBox(rotateBBoxY(res.entry.bbox, res.rotateY), size, resized ? 'stretch' : res.fit) };
  }, [gltf, res, size.w, size.h, size.d, finish, xray, resized]);

  // The clones of the materials belong to this instance: free them when it goes away.
  useEffect(() => () => owned.forEach((m) => m.dispose()), [owned]);

  return (
    <group position={fit.offset} scale={fit.scale}>
      <group rotation-y={THREE.MathUtils.degToRad(res.rotateY)}>
        <primitive object={root} />
      </group>
    </group>
  );
}

export interface BoundaryProps { fallback: ReactNode; children: ReactNode }

export class GlbBoundary extends Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn('[models] a 3D file could not be loaded, the built-in shape is used instead:', error);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** The 3D file while it loads and when it works; the built-in shape while it loads and when it fails. */
export default function GlbModel(props: GlbModelProps & { fallback: ReactNode }) {
  const { fallback, ...rest } = props;
  return (
    <GlbBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <GlbScene {...rest} />
      </Suspense>
    </GlbBoundary>
  );
}
