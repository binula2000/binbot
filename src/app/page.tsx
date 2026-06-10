"use client";

import { useState, useEffect } from 'react';
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner';
import { scanItem, disposeItem, incrementStock, getLocations, getFullInventory, setInventoryStock, removeInventoryItem, addLocation, receiveManualItem, addStorageBox, getBoxesByLocation } from '@/actions/inventory';
import { Lab3DMap } from '@/components/Lab3DMap';
import { Plus, Minus, Trash2, Map, ArrowLeft, Refrigerator, Archive, SquareLibrary, Search, X } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';

export default function Home() {
  const [mode, setMode] = useState<'RECEIVING' | 'DISPOSAL' | 'INVENTORY' | 'PLANNER'>('RECEIVING');
  const [recentScans, setRecentScans] = useState<{name: string, location: string, time: string}[]>([]);
  
  const [locations, setLocations] = useState<any[]>([]);
  const [fullInventory, setFullInventory] = useState<any[]>([]);
  
  const [activeUpc, setActiveUpc] = useState<string | null>(null);
  const [showPendingModal, setShowPendingModal] = useState(false);
  const [showLocationWizard, setShowLocationWizard] = useState(false);
  const [wizardData, setWizardData] = useState<any>({ type: 'Fridge (Full Height)', internalMode: 'SHELF', cols: 3, rows: 4, shelves: 5 });
  
  const [archiveLocId, setArchiveLocId] = useState<string | null>(null);
  const [archiveConfig, setArchiveConfig] = useState<any>(null);
  const [storageBoxes, setStorageBoxes] = useState<any[]>([]);
  const [newBoxName, setNewBoxName] = useState('');
  const [targetCell, setTargetCell] = useState<string | null>(null);
  
  const [upcPrefill, setUpcPrefill] = useState<{name: string, vendor: string} | null>(null);
  const [targetLocation, setTargetLocation] = useState<string | null>(null);
  
  const [selectedInventoryLocation, setSelectedInventoryLocation] = useState<string | null>(null);
  const [inventorySearch, setInventorySearch] = useState<string>('');

  const refreshData = async () => {
    getLocations().then(setLocations);
    getFullInventory().then(setFullInventory);
  };

  useEffect(() => {
    refreshData();
  }, []);

  const handleScan = async (barcode: string) => {
    if (mode === 'PLANNER' || mode === 'INVENTORY') return;

    if (mode === 'RECEIVING') {
      const product = await scanItem(barcode);
      if (product) {
        const loc = product.inventories[0]?.locationId;
        if (!loc) {
            toast.warning(`Orphaned Product: ${product.name}`, { description: 'Item lacks topological anchor. Redirected to Manual Routing.' });
            setActiveUpc(barcode);
            setUpcPrefill({ name: product.name, vendor: '' });
            setActiveModalTab('MANUAL');
            setShowPendingModal(true);
            refreshData();
            return;
        }

        await incrementStock(product.id, loc, 1);
        
        toast.success(`Received known item: ${product.name}`);
        setTargetLocation(loc);
        setRecentScans(prev => [{name: product.name, location: 'Known', time: new Date().toLocaleTimeString()}, ...prev]);
        
        setTimeout(() => setTargetLocation(null), 5000);
      } else {
        toast.info(`Unrecognized barcode: ${barcode}`);
        setActiveUpc(barcode);
        setUpcPrefill({ name: '', vendor: '' });
        setShowPendingModal(true);
        refreshData();
      }
    } else {
      try {
        const product = await disposeItem(barcode);
        toast.success(`Removed unit of ${product.name}`);
        setRecentScans(prev => [{name: product.name, location: 'Disposed', time: new Date().toLocaleTimeString()}, ...prev]);
      } catch (e: any) {
        toast.error(e.message || "Failed to dispose (item might not exist).");
      }
    }
  };

  const { liveSequence } = useBarcodeScanner({ onScan: handleScan });

  const handleAssignNewItem = async (pendingOrderId: string, locationId: string) => {
    if (!activeUpc) return;
    try {
      const res = await receiveNewItem(activeUpc, pendingOrderId, locationId);
      toast.success(`Successfully assigned scanning to ${res.name}`);
      setShowPendingModal(false);
      setTargetLocation(locationId);
      setRecentScans(prev => [{name: res.name, location: 'Assigned', time: new Date().toLocaleTimeString()}, ...prev]);
      
      setTimeout(() => setTargetLocation(null), 5000);
      refreshData();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  // ----------------------------------------------------
  // FULLSCREEN PLANNER OVERLAY
  // ----------------------------------------------------
  if (mode === 'PLANNER') {
     return (
       <div className="fixed inset-0 z-50 bg-slate-100 flex flex-col font-sans select-none overflow-hidden animate-in fade-in duration-300">
         {/* Top Ribbon */}
         <div className="h-16 shrink-0 bg-white border-b shadow-sm flex items-center justify-between px-6 z-10">
            <div className="flex items-center gap-3 text-indigo-600 font-extrabold text-xl tracking-tight">
               <Map className="text-indigo-500" /> BinBot Workspace Architect
            </div>
            <button onClick={() => { setMode('RECEIVING'); refreshData(); }} className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-5 py-2.5 rounded-xl font-bold transition-all text-sm active:scale-95">
               <ArrowLeft size={16} /> Exit Planner
            </button>
         </div>
         {/* Render Body */}
         <div className="flex-1 relative flex">
            {/* Left Spawner Sidebar */}
            <div className="w-80 bg-white/70 backdrop-blur-xl border-r shadow-2xl p-6 absolute h-full z-10 flex flex-col gap-6 overflow-y-auto">
               <div>
                  <h3 className="uppercase tracking-widest text-xs font-bold text-slate-400 mb-4 border-b pb-2">Equipment Catalog</h3>
               </div>
               
               <div className="space-y-3">
                  <button onClick={async () => { await addLocation(`Bench ${locations.length+1}`, 'Bench'); refreshData(); toast.success('Dequeued Bench'); }} className="w-full bg-white hover:bg-indigo-50 border hover:border-indigo-200 text-left p-4 rounded-2xl shadow-sm hover:shadow-md transition-all group">
                     <div className="flex items-center gap-3 font-bold text-slate-700 group-hover:text-indigo-700"><SquareLibrary size={18}/> Work Bench</div>
                     <p className="text-xs text-slate-500 mt-2 font-medium">Standard 3x1 surface for general tasks.</p>
                  </button>

                  <button onClick={async () => { await addLocation(`Shelf ${locations.length+1}`, 'Thin Horizontal Shelf'); refreshData(); toast.success('Dequeued Shelf'); }} className="w-full bg-white hover:bg-amber-50 border hover:border-amber-200 text-left p-4 rounded-2xl shadow-sm hover:shadow-md transition-all group">
                     <div className="flex items-center gap-3 font-bold text-slate-700 group-hover:text-amber-700"><Archive size={18}/> Thin Wall Shelf</div>
                     <p className="text-xs text-slate-500 mt-2 font-medium">Elevated 3m span for chemicals.</p>
                  </button>
                  
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <button onClick={async () => { await addLocation(`Cabinet ${locations.length+1}`, 'Cabinet (Half Length)'); refreshData(); toast.success('Dequeued Half Cabinet'); }} className="bg-white hover:bg-slate-100 border text-center p-4 rounded-2xl shadow-sm transition-all flex flex-col items-center justify-center gap-2 text-slate-600 font-bold text-sm">
                       <Archive size={16}/> Cabinet (Half)
                    </button>
                    <button onClick={async () => { await addLocation(`Cabinet ${locations.length+1}`, 'Cabinet (Full Height)'); refreshData(); toast.success('Dequeued Full Cabinet'); }} className="bg-white hover:bg-slate-100 border text-center p-4 rounded-2xl shadow-sm transition-all flex flex-col items-center justify-center gap-2 text-slate-600 font-bold text-sm">
                       <Archive size={16}/> Cabinet (Full)
                    </button>
                  </div>

                  <div className="pt-2">
                    <button onClick={() => setShowLocationWizard(true)} className="w-full bg-white hover:bg-blue-50 hover:border-blue-200 border border-slate-200 text-center p-4 rounded-2xl shadow-sm transition-all flex flex-col items-center justify-center gap-2 text-slate-700 font-bold text-sm">
                       <Refrigerator size={18} className="text-blue-500 mb-1"/> Deploy Advanced Storage Matrix
                    </button>
                  </div>
               </div>
            </div>

            {/* Main Canvas Context */}
            <div className="flex-1 pl-80">
               <Lab3DMap 
                  locations={locations} 
                  onDataRefreshNeeded={refreshData}
                  onManageLocation={async (id, config) => {
                      setArchiveLocId(id);
                      setArchiveConfig(config);
                      const boxes = await getBoxesByLocation(id);
                      setStorageBoxes(boxes);
                  }}
               />
            </div>
         </div>

        {/* Location Setup Wizard Modal */}
        <Dialog open={showLocationWizard} onOpenChange={setShowLocationWizard}>
          <DialogContent className="sm:max-w-2xl bg-white border-0 rounded-[2rem] shadow-2xl p-8">
            <DialogHeader className="mb-6">
              <DialogTitle className="text-3xl font-black text-slate-800">Initialize Storage Architecture</DialogTitle>
              <DialogDescription className="text-lg font-medium text-slate-500">Configure the internal topology vector for your new cooling unit.</DialogDescription>
            </DialogHeader>
            <div className="space-y-8">
               
               <div className="grid grid-cols-2 gap-6">
                 <div className="space-y-4">
                    <label className="font-black text-slate-800 text-sm uppercase tracking-widest block">Structural Class</label>
                    <select className="w-full text-lg bg-slate-50 border-2 rounded-2xl p-4 font-bold outline-indigo-500 cursor-pointer appearance-none" value={wizardData.type} onChange={e => setWizardData({...wizardData, type: e.target.value})}>
                       <option value="Fridge (Full Height)">Fridge (Full Height)</option>
                       <option value="Fridge (Half Height)">Fridge (Half Height)</option>
                       <option value="Freezer (-20C)">Freezer (-20C)</option>
                       <option value="Freezer (-80C)">Deep Freezer (-80C)</option>
                    </select>
                 </div>
                 <div className="space-y-4">
                    <label className="font-black text-slate-800 text-sm uppercase tracking-widest block">Internal Topology</label>
                    <select className="w-full text-lg bg-indigo-50 border-2 border-indigo-100 rounded-2xl p-4 font-bold text-indigo-800 outline-indigo-500 cursor-pointer appearance-none" value={wizardData.internalMode} onChange={e => setWizardData({...wizardData, internalMode: e.target.value})}>
                       <option value="SHELF">Horizontal Shelving (Levels)</option>
                       <option value="CABINET">Rack Constraints (Grid)</option>
                    </select>
                 </div>
               </div>

               <div className="bg-slate-50 p-6 rounded-3xl border-2 border-slate-100 ring-1 ring-white inset-ring shadow-inner">
                 {wizardData.internalMode === 'SHELF' ? (
                   <div className="space-y-4">
                     <label className="font-black text-slate-800 text-sm uppercase tracking-widest block">Volume (Shelf Count)</label>
                     <input type="number" min="1" max="20" className="w-full text-xl bg-white border-2 rounded-2xl p-4 font-bold outline-indigo-500" value={wizardData.shelves} onChange={e => setWizardData({...wizardData, shelves: parseInt(e.target.value)})}/>
                   </div>
                 ) : (
                   <div className="grid grid-cols-2 gap-6">
                     <div className="space-y-4">
                       <label className="font-black text-slate-800 text-sm uppercase tracking-widest block text-indigo-700">Grid Width (Rows)</label>
                       <input type="number" min="1" max="10" className="w-full text-xl bg-white border-2 rounded-2xl p-4 font-bold outline-indigo-500" value={wizardData.cols} onChange={e => setWizardData({...wizardData, cols: parseInt(e.target.value)})}/>
                     </div>
                     <div className="space-y-4">
                       <label className="font-black text-slate-800 text-sm uppercase tracking-widest block text-indigo-700">Grid Height (Cols)</label>
                       <input type="number" min="1" max="10" className="w-full text-xl bg-white border-2 rounded-2xl p-4 font-bold outline-indigo-500" value={wizardData.rows} onChange={e => setWizardData({...wizardData, rows: parseInt(e.target.value)})}/>
                     </div>
                   </div>
                 )}
               </div>

               <button 
                 onClick={async () => {
                     await addLocation(`${wizardData.type.split(' ')[0]} ${locations.length+1}`, wizardData.type, JSON.stringify(wizardData));
                     setShowLocationWizard(false);
                     refreshData();
                     toast.success('Successfully provisioned complex storage structure.');
                 }}
                 className="w-full bg-blue-500 hover:bg-blue-600 text-white p-6 rounded-2xl text-xl font-black shadow-xl shadow-blue-500/30 transition-all active:scale-95"
               >
                   SPAWN LOGISTICS NODE
               </button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Archive Overlay Modal */}
        <Dialog open={!!archiveLocId} onOpenChange={(o) => { if(!o) { setArchiveLocId(null); setTargetCell(null); }}}>
          <DialogContent className="sm:max-w-4xl bg-white border-0 rounded-[2rem] shadow-2xl p-0 overflow-hidden ring-1 ring-slate-200">
             <div className="bg-slate-900 text-white p-8 pb-10 flex justify-between items-center">
                <div>
                   <DialogTitle className="text-3xl font-black mb-2 tracking-tight">Internal Storage Matrix</DialogTitle>
                   <DialogDescription className="text-slate-400 font-medium">Select a structural cell to catalog a new standard 10x10 vial archive.</DialogDescription>
                </div>
                <div className="bg-slate-800 p-3 rounded-2xl border border-slate-700/50 flex gap-2">
                   <div className="w-4 h-4 rounded-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.8)]"></div>
                   <div className="w-4 h-4 rounded-full bg-slate-700"></div>
                   <div className="w-4 h-4 rounded-full bg-slate-700"></div>
                </div>
             </div>
             <div className="p-8 max-h-[60vh] overflow-y-auto bg-slate-50">
                {archiveConfig?.internalMode === 'SHELF' && (
                   <div className="flex flex-col gap-6">
                      {Array.from({ length: archiveConfig.shelves || 0 }).map((_, i) => (
                         <div key={i} className="space-y-3">
                            <h4 className="font-extrabold text-slate-500 uppercase tracking-widest text-xs flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-amber-400"></div> Level {i+1}
                            </h4>
                            <div className="bg-white rounded-3xl p-6 min-h-[140px] flex items-center justify-start gap-4 overflow-x-auto ring-1 ring-slate-200 shadow-sm">
                               {storageBoxes.filter(b => b.cellIndex === `shelf-${i}`).map(b => (
                                  <div key={b.id} className="w-28 h-28 shrink-0 bg-indigo-50/50 border-2 border-indigo-200 rounded-2xl flex flex-col items-center justify-center shadow-sm p-3 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-all">
                                     <Archive className="text-indigo-600 mb-2 drop-shadow-sm" size={32} />
                                     <span className="text-xs font-black text-slate-800 leading-tight truncate w-full">{b.name}</span>
                                     <span className="text-[10px] font-bold text-slate-500 mt-1">10x10 Unit</span>
                                  </div>
                               ))}
                               <button 
                                 onClick={() => setTargetCell(`shelf-${i}`)}
                                 className="w-28 h-28 shrink-0 border-2 border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50 rounded-2xl flex flex-col items-center justify-center text-slate-400 hover:text-indigo-600 transition-all active:scale-95 group"
                               >
                                 <Plus className="group-hover:scale-110 transition-transform" size={28} />
                                 <span className="text-[10px] font-bold mt-2 uppercase tracking-wide opacity-0 group-hover:opacity-100 transition-opacity">Add Box</span>
                               </button>
                            </div>
                         </div>
                      ))}
                   </div>
                )}
                {archiveConfig?.internalMode === 'CABINET' && (
                   <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${archiveConfig.cols || 1}, minmax(0, 1fr))` }}>
                      {Array.from({ length: (archiveConfig.rows || 1) * (archiveConfig.cols || 1) }).map((_, i) => {
                         const r = Math.floor(i / (archiveConfig.cols || 1));
                         const c = i % (archiveConfig.cols || 1);
                         const cellId = `grid-${r}-${c}`;
                         const box = storageBoxes.find(b => b.cellIndex === cellId);
                         return (
                            <div key={i} className="aspect-square bg-white rounded-3xl border-2 border-slate-200 flex flex-col items-center justify-center relative overflow-hidden shadow-sm group hover:border-indigo-300 transition-colors">
                                <div className="absolute top-3 left-3 text-[10px] font-black text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md uppercase tracking-wider backdrop-blur-sm">R{r+1} C{c+1}</div>
                                {box ? (
                                   <div className="flex flex-col items-center justify-center p-4 w-full h-full cursor-pointer hover:bg-indigo-50 transition-colors">
                                      <Archive className="text-indigo-600 mb-2 drop-shadow-sm" size={36} />
                                      <span className="text-sm font-black text-slate-800 leading-tight text-center">{box.name}</span>
                                      <span className="text-[10px] font-bold text-slate-500 mt-1">10x10 Unit</span>
                                   </div>
                                ) : (
                                   <button onClick={() => setTargetCell(cellId)} className="w-full h-full flex flex-col items-center justify-center text-slate-300 hover:bg-indigo-50 hover:text-indigo-600 transition-all opacity-0 group-hover:opacity-100">
                                      <Plus className="group-hover:scale-110 transition-transform mb-1" size={32} />
                                      <span className="text-[10px] font-bold uppercase tracking-widest">Mount Box</span>
                                   </button>
                                )}
                            </div>
                         );
                      })}
                   </div>
                )}
             </div>
          </DialogContent>
        </Dialog>

        {/* Box Spawner Modal */}
        <Dialog open={!!targetCell} onOpenChange={(o) => { if(!o) setTargetCell(null); }}>
          <DialogContent className="sm:max-w-md bg-white border-0 rounded-[2rem] shadow-2xl p-8 ring-1 ring-slate-200">
             <DialogHeader>
                <DialogTitle className="text-2xl font-black text-slate-800">Deploy Archive</DialogTitle>
                <DialogDescription className="font-medium text-slate-500">Assign a label to the new 10x10 storage vector.</DialogDescription>
             </DialogHeader>
             <div className="space-y-6 pt-4">
               <div>
                  <label className="font-black text-slate-800 text-xs uppercase tracking-widest block mb-2">Archive Tag</label>
                  <input type="text" className="w-full text-lg bg-slate-50 border-2 rounded-2xl p-4 font-bold outline-indigo-500 text-slate-800 shadow-inner" placeholder="e.g. Primers A-100" value={newBoxName} onChange={e => setNewBoxName(e.target.value)} autoFocus />
               </div>
               <button 
                 onClick={async () => {
                     if(!newBoxName.trim() || !archiveLocId || !targetCell) return;
                     await addStorageBox(newBoxName.trim(), archiveLocId, targetCell);
                     setNewBoxName('');
                     setTargetCell(null);
                     const boxes = await getBoxesByLocation(archiveLocId);
                     setStorageBoxes(boxes);
                     toast.success('Deployed new 10x10 archive box.');
                 }}
                 disabled={!newBoxName.trim()}
                 className="w-full bg-emerald-500 disabled:bg-slate-200 disabled:text-slate-400 hover:bg-emerald-600 text-white p-5 rounded-2xl text-lg font-black shadow-xl shadow-emerald-500/30 transition-all active:scale-95"
               >
                   MOUNT DATA SILO
               </button>
             </div>
          </DialogContent>
        </Dialog>

       </div>
     );
  }

  // ----------------------------------------------------
  // STANDARD DASHBOARD (RECEIVING / DISPOSAL / INVENTORY)
  // ----------------------------------------------------
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6 md:p-12 font-sans selection:bg-indigo-200 border-t-8 border-indigo-600">
      <div className="max-w-7xl mx-auto space-y-10">
        
        {/* Modern Nav Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end border-b pb-8 gap-4 border-slate-200">
          <div>
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900 pb-1">
              BinBot Lab
            </h1>
            <p className="text-slate-500 font-bold tracking-widest text-sm uppercase mt-2">Logistics Control Engine</p>
          </div>
          <div className="flex bg-slate-200/50 p-1.5 rounded-[1.25rem] shadow-inner backdrop-blur-md">
            <button 
              onClick={() => setMode('RECEIVING')}
              className={`px-4 md:px-6 py-2.5 rounded-xl font-bold transition-all duration-300 text-sm ${mode === 'RECEIVING' ? 'bg-white shadow-md text-indigo-700' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Receiving Form
            </button>
            <button 
              onClick={() => setMode('DISPOSAL')}
              className={`px-4 md:px-6 py-2.5 rounded-xl font-bold transition-all duration-300 text-sm ${mode === 'DISPOSAL' ? 'bg-white shadow-md text-red-600' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Disposal Line
            </button>
            <div className="w-[1px] bg-slate-300 mx-1 my-1 opacity-50" />
            <button 
              onClick={() => { setMode('INVENTORY'); refreshData(); }}
              className={`hidden md:block px-4 md:px-6 py-2.5 rounded-xl font-bold transition-all duration-300 text-sm ${mode === 'INVENTORY' ? 'bg-white shadow-md text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Global Stock
            </button>
            <button 
              onClick={() => { setMode('PLANNER'); refreshData(); }}
              className={`px-4 md:px-6 py-2.5 rounded-xl font-bold transition-all duration-300 text-sm ${mode === 'PLANNER' ? 'bg-white shadow-md text-emerald-600' : 'text-slate-500 hover:text-emerald-700'}`}
            >
              <div className="flex items-center gap-2">
                <Map size={16} /> <span className="hidden md:inline">Architect</span>
              </div>
            </button>
          </div>
        </header>

        {mode === 'RECEIVING' || mode === 'DISPOSAL' ? (
        <main className="grid grid-cols-1 lg:grid-cols-[1fr_2.5fr] gap-10">
          <div className="space-y-10">
            {/* Scanner Card Glassmorphism */}
            <Card className="border-0 shadow-2xl bg-white/60 backdrop-blur-3xl rounded-[2rem] overflow-hidden ring-1 ring-slate-200">
              <CardHeader className="border-b bg-white/40 pb-5">
                <CardTitle className="flex items-center justify-between text-lg font-extrabold text-slate-800">
                  Hardware Link
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-8 pb-10">
                <div className={`p-8 rounded-[1.5rem] text-center transition-all duration-500 shadow-inner ${mode === 'RECEIVING' ? 'bg-indigo-50 shadow-indigo-100 ring-1 ring-indigo-200/50' : 'bg-red-50 shadow-red-100 ring-1 ring-red-200/50'}`}>
                   {liveSequence ? (
                     <p className="text-amber-600 font-extrabold text-2xl tracking-[0.2em] animate-pulse">{liveSequence}█</p>
                   ) : (
                     <p className={`font-black tracking-tight text-xl ${mode === 'RECEIVING' ? 'text-indigo-800' : 'text-red-700'}`}>
                        {mode === 'RECEIVING' ? 'Awaiting Scan In' : 'Awaiting Purge Scan'}
                     </p>
                   )}
                   <p className="text-xs text-slate-400 mt-3 font-bold uppercase tracking-wider">Zebra DS2208 Active</p>
                </div>
              </CardContent>
            </Card>

            {/* Session Logs Card */}
            <Card className="border-0 shadow-xl rounded-[2rem] h-[340px] flex flex-col bg-white ring-1 ring-slate-200 print:shadow-none print:ring-0 print:h-auto">
               <CardHeader className="pb-4 pt-6 border-b flex flex-row items-center justify-between bg-slate-50/50 rounded-t-[2rem]">
                 <CardTitle className="text-sm font-extrabold text-slate-600 uppercase tracking-wider">Runtime Logs</CardTitle>
                 <div className="flex gap-2 print:hidden">

                   <button 
                     onClick={() => window.print()}
                     className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg font-bold shadow-md shadow-indigo-200 transition"
                   >
                     PRINT
                   </button>
                 </div>
               </CardHeader>
               <CardContent className="flex-1 overflow-y-auto p-0 custom-scrollbar print:overflow-visible">
                 <ul className="divide-y divide-slate-100">
                   {recentScans.length === 0 && <div className="p-10 text-center text-sm font-bold text-slate-300 uppercase tracking-widest">No activity</div>}
                   {recentScans.map((scan, i) => (
                     <li key={i} className="flex justify-between items-center text-sm p-4 px-6 hover:bg-slate-50 transition-colors">
                       <span className="font-bold text-slate-700 truncate pr-4">{scan.name}</span>
                       <span className={`text-xs font-mono font-black px-2 py-1 rounded-md whitespace-nowrap ${scan.location === 'Known' || scan.location === 'Assigned' ? 'bg-indigo-100 text-indigo-700' : 'bg-red-100 text-red-700'}`}>
                           {scan.time}
                       </span>
                     </li>
                   ))}
                 </ul>
               </CardContent>
            </Card>
          </div>

          {/* 3D Map Embedded Context */}
          <div className="relative rounded-[2rem] overflow-hidden shadow-2xl ring-1 ring-slate-200/80 bg-white">
            <Lab3DMap locations={locations} highlightedLocationId={targetLocation || undefined} readonly />
          </div>
        </main>
        
        ) : mode === 'INVENTORY' ? (
        <main className="grid grid-cols-1 xl:grid-cols-[1.5fr_2fr] gap-10 animate-in fade-in zoom-in-[0.98] duration-500">
          
          {/* Map Column */}
          <div className="flex flex-col gap-6">
             <div className="relative rounded-[2rem] overflow-hidden shadow-2xl ring-1 ring-slate-200/80 bg-white h-[400px] xl:h-[700px] min-h-[400px]">
                <Lab3DMap 
                   locations={locations} 
                   highlightedLocationId={selectedInventoryLocation || undefined} 
                   readonly 
                   onLocationClick={(id) => setSelectedInventoryLocation(id)}
                   onBackgroundClick={() => setSelectedInventoryLocation(null)}
                />
                {selectedInventoryLocation && (
                   <div className="absolute top-4 left-4 z-10 bg-white/90 backdrop-blur-md px-4 py-2 rounded-xl shadow-lg border text-sm font-bold text-slate-800 flex items-center gap-3">
                      Viewing: {locations.find(l => l.id === selectedInventoryLocation)?.name}
                      <button onClick={() => setSelectedInventoryLocation(null)} className="text-slate-400 hover:text-red-500 transition-colors">
                         <X size={16} />
                      </button>
                   </div>
                )}
             </div>
          </div>

          <div className="space-y-10">
          <Card className="border-0 shadow-2xl rounded-[2rem] overflow-hidden bg-white ring-1 ring-slate-200">
            <CardHeader className="bg-slate-50 border-b p-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <CardTitle className="text-2xl font-extrabold text-slate-800 tracking-tight">
                 {selectedInventoryLocation ? `${locations.find(l => l.id === selectedInventoryLocation)?.name} Stock` : 'Global Stock Ledger'}
              </CardTitle>
              <div className="relative">
                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                 <input 
                   type="text" 
                   placeholder="Search inventory..." 
                   className="pl-10 pr-4 py-2 border-2 border-slate-200 rounded-xl font-medium text-slate-700 w-full md:w-64 focus:outline-none focus:border-indigo-400 transition-colors"
                   value={inventorySearch}
                   onChange={(e) => setInventorySearch(e.target.value)}
                 />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left text-sm text-slate-600">
                  <thead className="bg-slate-100/50 text-slate-400 font-extrabold uppercase tracking-widest text-[10px]">
                    <tr>
                      <th className="px-8 py-5">Product Target</th>
                      <th className="px-8 py-5">UPC Hash</th>
                      <th className="px-8 py-5">Location Vector</th>
                      <th className="px-8 py-5 text-center">Net Vol</th>
                      <th className="px-8 py-5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {fullInventory.filter(inv => {
                        if (selectedInventoryLocation && inv.locationId !== selectedInventoryLocation) return false;
                        if (inventorySearch && !inv.product.name.toLowerCase().includes(inventorySearch.toLowerCase()) && !(inv.product.upc || '').toLowerCase().includes(inventorySearch.toLowerCase())) return false;
                        return true;
                    }).length === 0 && (
                      <tr><td colSpan={5} className="py-16 text-center text-slate-400 font-bold uppercase tracking-wider">No inventory materialized</td></tr>
                    )}
                    {fullInventory.filter(inv => {
                        if (selectedInventoryLocation && inv.locationId !== selectedInventoryLocation) return false;
                        if (inventorySearch && !inv.product.name.toLowerCase().includes(inventorySearch.toLowerCase()) && !(inv.product.upc || '').toLowerCase().includes(inventorySearch.toLowerCase())) return false;
                        return true;
                    }).map((inv) => (
                      <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-8 py-5 font-bold text-slate-800 text-base">{inv.product.name}</td>
                        <td className="px-8 py-5 font-mono text-xs font-medium text-slate-400 bg-slate-50/50 rounded-lg">{inv.product.upc || 'NO_UPC'}</td>
                        <td className="px-8 py-5 font-bold">
                           <span className="bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-lg opacity-90 border border-indigo-100/50">{inv.location.name}</span>
                        </td>
                        <td className="px-8 py-5">
                          <div className="flex items-center justify-center gap-4">
                            <button onClick={async () => { await setInventoryStock(inv.id, inv.quantity - 1); refreshData(); }} className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold transition-all disabled:opacity-30 active:scale-95" disabled={inv.quantity <= 0}>
                              <Minus size={18} />
                            </button>
                            <span className="w-10 text-center font-black text-xl text-slate-800">{inv.quantity}</span>
                            <button onClick={async () => { await setInventoryStock(inv.id, inv.quantity + 1); refreshData(); }} className="w-10 h-10 flex items-center justify-center rounded-xl bg-indigo-100 hover:bg-indigo-200 text-indigo-700 font-bold transition-all active:scale-95">
                              <Plus size={18} />
                            </button>
                          </div>
                        </td>
                        <td className="px-8 py-5 text-right">
                          <button onClick={async () => { if(confirm('Scrub this product mapping from the ledger completely?')) { await removeInventoryItem(inv.id); refreshData(); } }} className="text-slate-300 hover:text-red-500 hover:bg-red-50 p-3 rounded-2xl transition-all inline-flex items-center justify-center active:scale-95">
                            <Trash2 size={20} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
          </div>
        </main>
        ) : null}

        {/* Floating Scanner Modal */}
        <Dialog open={showPendingModal} onOpenChange={setShowPendingModal}>
          <DialogContent className="sm:max-w-5xl max-w-5xl w-[95vw] bg-white border-0 rounded-[2.5rem] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] p-0 overflow-hidden ring-1 ring-slate-200">
            <div className="p-10 pb-0 border-b bg-indigo-50/50 backdrop-blur-xl">
              <DialogTitle className="text-4xl font-black mb-3 text-slate-900 tracking-tight">Unrecognized Barcode</DialogTitle>
              <DialogDescription className="text-xl font-medium leading-relaxed text-slate-600 mb-8">
                Hardware detected hash <span className="font-mono font-black bg-indigo-100 text-indigo-800 px-3 py-1 rounded-xl mx-2 shadow-sm border border-indigo-200/50">{activeUpc}</span> missing from the database matrix.
              </DialogDescription>
            </div>
            <div className="p-10 bg-white max-h-[65vh] overflow-y-auto custom-scrollbar">
                 <form 
                    key={activeUpc || 'manual'}
                    className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-2"
                    onSubmit={async (e: any) => {
                       e.preventDefault();
                       if (!activeUpc) return;
                       const name = e.target.pname.value;
                       const qty = parseInt(e.target.pqty.value);
                       const vendor = e.target.pvendor.value;
                       const loc = e.target.ploc.value;
                       
                       if (!loc) { toast.error('Anchor vector not selected'); return; }
                       
                       try {
                           const res = await receiveManualItem(activeUpc, name, qty, loc, vendor);
                           toast.success(`Successfully mapped ${name}`);
                           setShowPendingModal(false);
                           setTargetLocation(loc);
                           setRecentScans(prev => [{name: res.name, location: 'Manual Entry', time: new Date().toLocaleTimeString()}, ...prev]);
                           setTimeout(() => setTargetLocation(null), 5000);
                           refreshData();
                       } catch (err: any) {
                           toast.error('Failed to save manual root.');
                       }
                    }}
                 >
                    <div className="space-y-4 md:col-span-2">
                       <label className="font-black text-slate-800 text-sm uppercase tracking-widest">Product Extropy Name</label>
                       <input name="pname" type="text" defaultValue={upcPrefill?.name} className="w-full text-xl bg-slate-50 border-2 rounded-2xl p-5 font-bold outline-indigo-500" placeholder="e.g. Sodium Chloride 500g" required />
                    </div>
                    
                    <div className="space-y-4">
                       <label className="font-black text-slate-800 text-sm uppercase tracking-widest">Volume Constraint</label>
                       <input name="pqty" type="number" min="1" defaultValue="1" className="w-full text-xl bg-slate-50 border-2 rounded-2xl p-5 font-bold outline-indigo-500" required />
                    </div>
                    
                    <div className="space-y-4">
                       <label className="font-black text-slate-800 text-sm uppercase tracking-widest">Vendor</label>
                       <input name="pvendor" type="text" defaultValue={upcPrefill?.vendor} className="w-full text-xl bg-slate-50 border-2 rounded-2xl p-5 font-bold outline-indigo-500" placeholder="e.g. Sigma Aldrich" required />
                    </div>

                    <div className="space-y-4 md:col-span-2">
                       <label className="font-black text-slate-800 text-sm uppercase tracking-widest">Master Anchor Location</label>
                       <select name="ploc" className="w-full text-xl bg-white border-2 rounded-2xl p-5 font-bold outline-indigo-500 cursor-pointer appearance-none" required defaultValue="">
                           <option value="" disabled>Select Topological Anchor</option>
                           {locations.map(loc => (
                               <option key={loc.id} value={loc.id}>{loc.name} ({loc.type})</option>
                           ))}
                       </select>
                    </div>

                    <div className="md:col-span-2 pt-4">
                       <button type="submit" className="w-full bg-emerald-500 hover:bg-emerald-600 text-white p-6 rounded-2xl text-xl font-black shadow-xl shadow-emerald-500/30 transition-all active:scale-95">
                           Inject Raw Model
                       </button>
                    </div>
                 </form>
            </div>
          </DialogContent>
        </Dialog>



      </div>
    </div>
  );
}
