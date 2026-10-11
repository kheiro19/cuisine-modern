// src/components/AuditProbe.tsx
// Lives inside the <Canvas>. Each time `runId` changes it measures the DRAWN scene (one world box per mesh tagged with userData.partKey,
// straight from three.js) and compares it with the boxes the model expects (math/audit.ts). It reads the drawing, not the model.
import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { AuditReport, PartBox, auditParts } from '../math/audit';

interface AuditProbeProps {
  /** Bumped by the "audit" button. 0 = never run. */
  runId: number;
  expected: PartBox[];
  onReport: (report: AuditReport) => void;
}

export default function AuditProbe({ runId, expected, onReport }: AuditProbeProps) {
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    if (runId === 0) return;
    scene.updateMatrixWorld(true);
    const measured: PartBox[] = [];
    const box = new THREE.Box3();
    scene.traverse((o) => {
      const key = o.userData?.partKey;
      if (typeof key !== 'string') return;
      box.setFromObject(o); // the mesh is a closed box and, audited at 0 % open / 0 % explode, not rotated: its world box is its real size
      if (box.isEmpty()) return;
      measured.push({ key, min: [box.min.x * 1000, box.min.y * 1000, box.min.z * 1000], max: [box.max.x * 1000, box.max.y * 1000, box.max.z * 1000] });
    });
    onReport(auditParts(expected, measured));
  }, [runId]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
