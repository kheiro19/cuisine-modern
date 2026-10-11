// src/components/MeasureOverlay.tsx
// The dimension lines of the 3D atomic workspace, in the style of the reference screenshots: a chain of openings and the total on the
// left, the inner and the overall width at the bottom, the depth along the top edge, a bracket across every front gap, and the axes.
// Everything comes from math/dimensions.ts (millimetres); this file only draws it (metres). Place it in the SAME group as the assembly.
import React from 'react';
import { Html, Line } from '@react-three/drei';
import { DimensionLine, dimensionGraphics } from '../math/dimensions';

const m = (mm: number) => mm / 1000;
const toM = (p: [number, number, number]): [number, number, number] => [m(p[0]), m(p[1]), m(p[2])];

interface MeasureOverlayProps {
  dims: DimensionLine[];
  /** Label the thin boards and the gaps too. */
  showDetails: boolean;
  depthMm: number;
}

const COLORS = { main: '#1f2937', minor: '#9ca3af', gap: '#d97706' };

export default function MeasureOverlay({ dims, showDetails, depthMm }: MeasureOverlayProps) {
  return (
    <group>
      {/* X red, Y green, Z blue, at the cabinet's lower left corner at the back, like the reference */}
      <axesHelper args={[m(250)]} position={[0, 0, -m(depthMm) / 2]} />
      {dims.map((d) => {
        const g = dimensionGraphics(d);
        const color = d.kind === 'GAP' ? COLORS.gap : d.minor ? COLORS.minor : COLORS.main;
        const labelled = !d.minor || showDetails;
        return (
          <group key={d.id}>
            {g.segments.map((s, i) => (
              <Line key={i} points={[toM(s[0]), toM(s[1])]} color={color} lineWidth={d.kind === 'GAP' ? 2 : 1} />
            ))}
            {labelled && (
              <Html position={toM(g.labelAt)} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
                <div style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 700, color, background: 'rgba(255,255,255,0.85)', padding: '0 3px', borderRadius: 3, whiteSpace: 'nowrap', direction: 'ltr' }}>
                  {d.label}
                </div>
              </Html>
            )}
          </group>
        );
      })}
    </group>
  );
}
