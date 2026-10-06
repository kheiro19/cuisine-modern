// src/components/RoomEnvironment3D.tsx
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { WallSegment } from '../types/flatma';

interface RoomEnvironment3DProps {
  walls: WallSegment[];
  visible: boolean;
  wallHeightMm?: number;
  wallThicknessMm?: number;
  floorMarginMm?: number;
}

const DEFAULT_WALL_HEIGHT_MM = 2700;
const DEFAULT_WALL_THICKNESS_MM = 100;
const DEFAULT_FLOOR_MARGIN_MM = 300;

export default function RoomEnvironment3D({
  walls,
  visible,
  wallHeightMm = DEFAULT_WALL_HEIGHT_MM,
  wallThicknessMm = DEFAULT_WALL_THICKNESS_MM,
  floorMarginMm = DEFAULT_FLOOR_MARGIN_MM
}: RoomEnvironment3DProps) {

  const wallMeshData = useMemo(() => {
    return walls.map((wall) => ({
      id: wall.id,
      length: wall.length,
      angleDeg: wall.angleDeg,
      midX: (wall.startPoint.x + wall.endPoint.x) / 2,
      midZ: (wall.startPoint.z + wall.endPoint.z) / 2
    }));
  }, [walls]);

  const floorBounds = useMemo(() => {
    if (walls.length === 0) return null;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    walls.forEach((wall) => {
      [wall.startPoint, wall.endPoint].forEach((p) => {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z;
        if (p.z > maxZ) maxZ = p.z;
      });
    });
    return { minX, maxX, minZ, maxZ };
  }, [walls]);

  const wallMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#CBD5E1',
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide
  }), []);

  const floorMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#E5E7EB',
    side: THREE.DoubleSide
  }), []);

  if (!visible || walls.length === 0 || !floorBounds) {
    return null;
  }

  const floorWidth = (floorBounds.maxX - floorBounds.minX + floorMarginMm * 2) / 1000;
  const floorDepth = (floorBounds.maxZ - floorBounds.minZ + floorMarginMm * 2) / 1000;
  const floorCenterX = (floorBounds.minX + floorBounds.maxX) / 2 / 1000;
  const floorCenterZ = (floorBounds.minZ + floorBounds.maxZ) / 2 / 1000;

  return (
    <group>
      {/* Floor */}
      <mesh
        position={[floorCenterX, -0.001, floorCenterZ]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        material={floorMaterial}
      >
        <planeGeometry args={[floorWidth, floorDepth]} />
      </mesh>

      {/* Walls */}
      {wallMeshData.map((w) => (
        <mesh
          key={w.id}
          position={[w.midX / 1000, wallHeightMm / 1000 / 2, w.midZ / 1000]}
          rotation={[0, THREE.MathUtils.degToRad(w.angleDeg), 0]}
          material={wallMaterial}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[w.length / 1000, wallHeightMm / 1000, wallThicknessMm / 1000]} />
        </mesh>
      ))}
    </group>
  );
}