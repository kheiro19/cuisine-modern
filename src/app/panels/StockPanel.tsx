// The stock wing: sheets, edge-band rolls and hardware that the workshop loads before building anything.
// It renders the stock manager, which reads the workshop context itself; this wing adds no state of its own.
import InventoryManager from '../../components/InventoryManager';

export default function StockPanel() {
  return (
    <div className="xl:col-span-1 bg-white border border-slate-200 rounded-xl p-3 shadow-3xs max-h-[750px] overflow-y-auto animate-fade-in">
      <InventoryManager />
    </div>
  );
}
