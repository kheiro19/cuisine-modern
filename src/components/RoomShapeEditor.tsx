// src/components/RoomShapeEditor.tsx
import React, { useMemo, useState } from 'react';
import { RoomSegmentInput, RoomShape, ResolvedRoom } from '../types/flatma';
import { resolveWalls } from '../engine/wallGeometry';

interface RoomShapeEditorProps {
  onApply: (room: ResolvedRoom) => void;
  initialSegments?: RoomSegmentInput[];
}

const DEFAULT_SEGMENTS: RoomSegmentInput[] = [{ length: 3000, turnDeg: 0 }];
const SVG_SIZE = 240;
const SVG_PADDING = 20;

export default function RoomShapeEditor({ onApply, initialSegments }: RoomShapeEditorProps) {
  const [segments, setSegments] = useState<RoomSegmentInput[]>(
    initialSegments && initialSegments.length > 0 ? initialSegments : DEFAULT_SEGMENTS
  );

  const updateSegmentLength = (index: number, value: number) => {
    setSegments((prev) => prev.map((s, i) => (i === index ? { ...s, length: value } : s)));
  };

  const updateSegmentTurn = (index: number, turnDeg: number) => {
    setSegments((prev) => prev.map((s, i) => (i === index ? { ...s, turnDeg } : s)));
  };

  const addSegment = () => setSegments((prev) => [...prev, { length: 2000, turnDeg: 0 }]);

  const removeSegment = (index: number) =>
    setSegments((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));

  const roomShape: RoomShape = useMemo(
    () => ({ origin: { x: 0, z: 0 }, initialAngleDeg: 0, segments }),
    [segments]
  );

  const { resolvedRoom, error } = useMemo(() => {
    try {
      const allPositive = segments.every((s) => s.length > 0);
      if (!allPositive) {
        return { resolvedRoom: null as ResolvedRoom | null, error: 'كل الأطوال يجب أن تكون أكبر من صفر' };
      }
      const resolved = resolveWalls(roomShape);
      return { resolvedRoom: resolved, error: null as string | null };
    } catch (e) {
      return { resolvedRoom: null as ResolvedRoom | null, error: e instanceof Error ? e.message : 'خطأ غير معروف' };
    }
  }, [roomShape, segments]);

  const svgPath = useMemo(() => {
    if (!resolvedRoom || resolvedRoom.walls.length === 0) return null;
    const points = [resolvedRoom.walls[0].startPoint, ...resolvedRoom.walls.map((w) => w.endPoint)];

    const minX = Math.min(...points.map((p) => p.x));
    const maxX = Math.max(...points.map((p) => p.x));
    const minZ = Math.min(...points.map((p) => p.z));
    const maxZ = Math.max(...points.map((p) => p.z));

    const spanX = Math.max(maxX - minX, 1);
    const spanZ = Math.max(maxZ - minZ, 1);
    const scale = Math.min(
      (SVG_SIZE - SVG_PADDING * 2) / spanX,
      (SVG_SIZE - SVG_PADDING * 2) / spanZ
    );

    const toSvg = (p: { x: number; z: number }) => ({
      x: SVG_PADDING + (p.x - minX) * scale,
      y: SVG_PADDING + (p.z - minZ) * scale
    });

    return points.map(toSvg).map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  }, [resolvedRoom]);

  const handleApply = () => {
    if (resolvedRoom) onApply(resolvedRoom);
  };

  return (
    <div className="w-full flex flex-col space-y-3 text-xs font-sans text-slate-700 bg-white border border-[#E5E5E5] rounded-xl p-3.5">
      <div className="font-bold text-slate-800">🧱 تصميم شكل الغرفة (الجدران)</div>

      <div className="space-y-3">
        {segments.map((seg, index) => (
          <div key={index} className="border border-slate-100 rounded-lg p-2.5 bg-slate-50/40 space-y-2">
            <div className="flex justify-between items-center">
              <span className="font-bold text-slate-600">جدار #{index + 1}</span>
              {segments.length > 1 && (
                <button type="button" onClick={() => removeSegment(index)} className="text-red-500 hover:text-red-700 font-bold text-[11px]">
                  🗑 حذف
                </button>
              )}
            </div>

            <div className="flex items-center space-x-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase shrink-0">الطول (مم)</label>
              <input
                type="number"
                value={seg.length}
                onChange={(e) => updateSegmentLength(index, Number(e.target.value))}
                className="w-24 border rounded-md p-1 text-center font-bold focus:outline-none"
              />
            </div>

            <div className="flex items-center space-x-3">
              <label className="flex items-center space-x-1 cursor-pointer">
                <input type="radio" name={`turn-${index}`} checked={seg.turnDeg === 0} onChange={() => updateSegmentTurn(index, 0)} />
                <span>مستقيم</span>
              </label>
              <label className="flex items-center space-x-1 cursor-pointer">
                <input type="radio" name={`turn-${index}`} checked={seg.turnDeg === 90} onChange={() => updateSegmentTurn(index, 90)} />
                <span>زاوية يسار 90°</span>
              </label>
              <label className="flex items-center space-x-1 cursor-pointer">
                <input type="radio" name={`turn-${index}`} checked={seg.turnDeg === -90} onChange={() => updateSegmentTurn(index, -90)} />
                <span>زاوية يمين 90°</span>
              </label>
            </div>
          </div>
        ))}
      </div>

      <button type="button" onClick={addSegment} className="w-full border border-dashed border-indigo-300 text-indigo-600 font-bold py-1.5 rounded-lg hover:bg-indigo-50">
        ➕ إضافة جدار جديد
      </button>

      <div className="border-t border-slate-100 pt-3">
        <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">📐 معاينة مصغّرة</div>
        {error && <div className="text-red-500 font-bold text-[11px] py-2">⚠️ {error}</div>}
        {!error && svgPath && (
          <svg width={SVG_SIZE} height={SVG_SIZE} className="border border-slate-200 rounded-lg bg-slate-50/50 mx-auto">
            <polyline points={svgPath} fill="none" stroke="#4F46E5" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>

      <button
        type="button"
        onClick={handleApply}
        disabled={!resolvedRoom}
        className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold py-2 rounded-xl transition-all"
      >
        ✅ تطبيق الشكل على المطبخ 3D
      </button>
    </div>
  );
}