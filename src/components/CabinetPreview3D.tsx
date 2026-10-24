// src/components/CabinetPreview3D.tsx
// The "3D ATOMIC WORKSPACE": renders the draft with the SAME assembly components the showcase uses, so what is
// previewed here is exactly what will be injected (it used to be flat CSS rectangles from a separate generator).
import React, { useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import CabinetAssembly3D, { DrawnGeometry } from './CabinetAssembly3D';
import MeasureOverlay from './MeasureOverlay';
import AuditProbe from './AuditProbe';
import { dimensionsOf, formatMm } from '../math/dimensions';
import { baseOf, bodyView } from '../math/base';
import { AuditReport, expectedParts } from '../math/audit';
import WallCabinetAssembly3D from './WallCabinetAssembly3D';
import { CabinetObject, InjectedWoodMaterial, InjectedHardwareItem } from '../types/flatma';
import { DEFAULT_PALETTE } from '../math/palette';

/** The edge band glued on a group of parts, as the pricing resolved it (roll, else the sheet's own band). */
export interface EdgeBandInfo {
  /** Thickness in mm (0 = none known). */
  mm: number;
  /** Brand of the roll, empty when none is chosen. */
  label: string;
  chosen: boolean;
  /** True when no roll was picked and the stock's own default band applies (math/edgeDefaults.ts). */
  defaulted?: boolean;
  /** How many front panels the cabinet really cuts. 0 = an open bay (washer / dishwasher): no band, no front cut. */
  panels?: number;
}

interface CabinetPreview3DProps {
  cabinet: CabinetObject;
  showFronts: boolean;
  isXRayMode: boolean;
  woodPanels: InjectedWoodMaterial[];
  hardwareItems: InjectedHardwareItem[];
  /** Edge band of the fronts and of the carcase, for the cut sizes and the legend of the dimension lines. */
  edges?: { front: EdgeBandInfo; carcase: EdgeBandInfo };
}

export default function CabinetPreview3D({ cabinet, showFronts, isXRayMode, woodPanels, hardwareItems, edges }: CabinetPreview3DProps) {
  const [openProgress, setOpenProgress] = useState<number>(0);
  const [explode, setExplode] = useState<number>(0);
  const [showFasteners, setShowFasteners] = useState<boolean>(false);
  // Measuring tools: the dimension lines, and the audit that compares the DRAWING with the model.
  const [measure, setMeasure] = useState<boolean>(false);
  const [details, setDetails] = useState<boolean>(false);
  const [frontDims, setFrontDims] = useState<boolean>(true);
  const [drawn, setDrawn] = useState<DrawnGeometry | null>(null);
  const [auditRun, setAuditRun] = useState<number>(0);
  const [report, setReport] = useState<AuditReport | null>(null);
  const moved = explode > 0 || openProgress > 0;
  const frontsDrawn = showFronts && !!drawn && !drawn.glass; // the front sizes are measured only when the fronts are really drawn
  const dims = useMemo(
    () => (drawn ? dimensionsOf(drawn.geo, bodyView(cabinet), drawn.thicknessMm, drawn.frontThicknessMm, edges?.front.mm ?? 0, baseOf(cabinet).heightMm).filter((d) => (d.kind !== 'FRONT_W' && d.kind !== 'FRONT_H') || (frontsDrawn && frontDims)) : []),
    [drawn, cabinet, frontsDrawn, frontDims, edges?.front.mm],
  );
  const expected = useMemo(
    () => (drawn ? expectedParts(drawn.geo, { facades: showFronts && !drawn.glass, frontThicknessMm: drawn.frontThicknessMm }) : []),
    [drawn, showFronts],
  );
  useEffect(() => { setReport(null); }, [drawn, showFronts, isXRayMode, showFasteners]); // an old verdict no longer describes the drawing
  const Assembly = cabinet.category === 'WALL_UNIT' ? WallCabinetAssembly3D : CabinetAssembly3D;

  return (
    <div className="w-full h-full relative">
      <Canvas camera={{ position: [0.9, 1.1, 3.4], fov: 38 }} shadows gl={{ antialias: true }} className="absolute inset-0">
        <color attach="background" args={[DEFAULT_PALETTE.background.color]} />
        <ambientLight intensity={0.75} />
        <directionalLight position={[2, 4, 3]} intensity={0.9} castShadow />
        {/* Fixed centring on the ASSEMBLED size (<Center> re-centred on every change, so the view jumped while exploding). */}
        <group position={[-cabinet.width / 2000, -cabinet.height / 2000, 0]}>
          <Assembly
            cabinet={cabinet}
            showFronts={showFronts}
            isXRayMode={isXRayMode}
            woodPanels={woodPanels}
            hardwareItems={hardwareItems}
            openProgress={openProgress}
            explode={explode}
            showFasteners={showFasteners}
            onGeometry={setDrawn}
          />
          {/* The lines and the audit are in the body's own coordinates: the body stands on its base, so they are lifted with it. */}
          <group position={[0, baseOf(cabinet).heightMm / 1000, 0]}>
            {measure && drawn && <MeasureOverlay dims={dims} showDetails={details} depthMm={cabinet.depth} />}
            <AuditProbe runId={auditRun} expected={expected} onReport={setReport} />
          </group>
        </group>
        <OrbitControls makeDefault enableDamping dampingFactor={0.05} minDistance={0.6} maxDistance={10} />
      </Canvas>

      <div className="absolute bottom-0 left-0 right-0 bg-slate-950/70 backdrop-blur-sm rounded-lg px-3 py-1.5 space-y-1">
        <div className="flex items-center gap-3">
          <span className="text-[9px] font-mono font-bold text-slate-200 whitespace-nowrap">
            {cabinet.width}×{cabinet.height}×{cabinet.depth} mm
          </span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={openProgress}
            onChange={(e) => setOpenProgress(parseFloat(e.target.value))}
            className="flex-1 h-1 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            title="فتح الأبواب / الأدراج"
          />
          <span className="text-[9px] font-mono font-bold text-indigo-300 w-8 text-right">{Math.round(openProgress * 100)}%</span>
        </div>
        <div className="flex items-center gap-3" style={{ direction: 'rtl' }}>
          <span className="text-[9px] font-bold text-slate-200 whitespace-nowrap">تفكيك القطع</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={explode}
            onChange={(e) => setExplode(parseFloat(e.target.value))}
            className="flex-1 h-1 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-amber-500"
            title="تفكيك القطع (منظر مفكوك)"
            style={{ direction: 'ltr' }}
          />
          <span className="text-[9px] font-mono font-bold text-amber-300 w-8">{Math.round(explode * 100)}%</span>
          <label className="flex items-center gap-1 text-[9px] font-bold text-slate-200 whitespace-nowrap cursor-pointer">
            <input type="checkbox" checked={showFasteners} onChange={(e) => setShowFasteners(e.target.checked)} />
            براغي ومفصلات
          </label>
        </div>
        <div className="flex items-center gap-3" style={{ direction: 'rtl' }}>
          <label className="flex items-center gap-1 text-[9px] font-bold text-slate-200 whitespace-nowrap cursor-pointer">
            <input type="checkbox" checked={measure} onChange={(e) => setMeasure(e.target.checked)} />
            أبعاد
          </label>
          {measure && (
            <label className="flex items-center gap-1 text-[9px] font-bold text-slate-200 whitespace-nowrap cursor-pointer">
              <input type="checkbox" checked={details} onChange={(e) => setDetails(e.target.checked)} />
              الألواح والفراغات
            </label>
          )}
          {measure && frontsDrawn && (
            <label className="flex items-center gap-1 text-[9px] font-bold text-blue-300 whitespace-nowrap cursor-pointer">
              <input type="checkbox" checked={frontDims} onChange={(e) => setFrontDims(e.target.checked)} />
              أبعاد الواجهات
            </label>
          )}
          <button
            type="button"
            disabled={moved || !drawn}
            onClick={() => setAuditRun((n) => n + 1)}
            className={`px-2 py-0.5 rounded text-[9px] font-bold ${moved || !drawn ? 'bg-slate-600 text-slate-400 cursor-not-allowed' : 'bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer'}`}
            title="يقيس المجسّمات المرسومة فعلًا ويقارنها بالنموذج"
          >
            تدقيق الرسم
          </button>
          {moved && <span className="text-[9px] text-amber-300">أعد التفكيك والفتح إلى 0% للتدقيق</span>}
        </div>
      </div>

      {measure && edges && (
        <div className="absolute top-1 right-1 rounded-lg bg-slate-950/80 backdrop-blur-sm px-2 py-1 text-[9px] leading-snug max-w-[60%]" style={{ direction: 'rtl' }}>
          {(edges.front.panels ?? 1) === 0 && (
            // A bay that holds a washing machine or a dishwasher under the worktop is an OPEN niche: no door, no band, and
            // nothing to say about one. Saying «لا شريط محدد للواجهات» here was asking for a band on a cabinet without a front.
            <p className="font-bold text-slate-300">بلا واجهة (فتحة مفتوحة أو تجويف غسالة/جلاية تحت الرخامة): لا شريط للواجهة ولا قصّ لها</p>
          )}
          {frontsDrawn && (edges.front.panels ?? 1) > 0 && (
            edges.front.mm > 0 ? (
              <p className="font-bold text-blue-300">
                شريط الواجهات: {formatMm(edges.front.mm)} مم{edges.front.label ? ` (${edges.front.label})` : ''}{edges.front.defaulted ? ' — افتراضي من المخزن' : ''} · الرقم ✂ هو مقاس القص = النهائي − {formatMm(2 * edges.front.mm)} مم
              </p>
            ) : (
              // Not an error any more: the front is banded by default (math/edgeDefaults.ts). A 0 here means the user really
              // chose «بدون شريط حافة» (a painted front) — so the line states the fact and leaves the cut size alone.
              <p className="font-bold text-amber-300">الواجهة بلا شريط (اختيارك): مقاس القص = المقاس النهائي. اختر لفّة من المخزن إن أردت الشريط</p>
            )
          )}
          <p className="font-bold text-slate-300">
            {edges.carcase.mm > 0 ? `شريط الهيكل: ${formatMm(edges.carcase.mm)} مم${edges.carcase.label ? ` (${edges.carcase.label})` : ''} على الحافة الأمامية` : 'لا شريط محدد للهيكل'}
          </p>
        </div>
      )}

      {report && (
        <div className="absolute top-1 left-1 right-1 max-h-40 overflow-y-auto rounded-lg bg-slate-950/80 backdrop-blur-sm px-2 py-1 text-[9px] leading-snug" style={{ direction: 'rtl' }}>
          {report.ok ? (
            <p className="font-bold text-emerald-300">
              ✓ {report.checked} قطعة مرسومة مطابقة للنموذج
              {report.gaps.length > 0 && ` · فراغات الواجهات المقيسة: ${[...new Set(report.gaps.map((g) => Math.round(g.gapMm * 1000) / 1000))].join(' / ')} مم`}
            </p>
          ) : (
            <>
              <p className="font-bold text-red-300">✗ {report.findings.length} ملاحظة من {report.checked} قطعة</p>
              {report.findings.slice(0, 8).map((f, i) => (
                <p key={i} className="text-red-200" style={{ direction: 'ltr', textAlign: 'left' }}>{f.message}</p>
              ))}
              {report.findings.length > 8 && <p className="text-red-300">… و{report.findings.length - 8} أخرى</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
