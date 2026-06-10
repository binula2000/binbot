"use client";

import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Text, Grid, Edges, Billboard } from '@react-three/drei';
import { updateLocationTransform, removeLocation, getLabSettings, saveLabSettings, resetLabBlueprint, getArchitectureRooms, addArchitectureRoom } from '@/actions/inventory';
import { toast } from 'sonner';
import * as THREE from 'three';
import { Trash2, RotateCw, Save, RefreshCcw, PlusSquare } from 'lucide-react';

interface Lab3DMapProps {
  locations: { id: string; name: string; type: string; transformData: string | null; config: string | null }[];
  highlightedLocationId?: string;
  readonly?: boolean;
  onDataRefreshNeeded?: () => void;
  onManageLocation?: (id: string, config: any) => void;
  onLocationClick?: (id: string) => void;
  onBackgroundClick?: () => void;
}

function getScaleForType(type: string): [number, number, number] {
  switch (type) {
    case 'Bench': return [3, 1, 1];
    case 'Thin Horizontal Shelf': return [3, 0.2, 1];
    case 'Cabinet (Half Length)': return [1.5, 3, 1.5];
    case 'Cabinet (Full Height)': return [3, 3, 1.5];
    case 'Fridge (Half Height)': return [2, 2, 2];
    case 'Fridge (Full Height)': return [2, 4, 2];
    default: return [2, 2, 2]; 
  }
}

function getColorForType(type: string): string {
    if (type === 'Bench') return '#d97706'; 
    if (type === 'Thin Horizontal Shelf') return '#94a3b8'; 
    if (type === 'Cabinet (Half Length)') return '#a3e635'; 
    if (type === 'Cabinet (Full Height)') return '#4d7c0f'; 
    if (type === 'Fridge (Half Height)') return '#7dd3fc';
    if (type === 'Fridge (Full Height)') return '#0284c7';
    return '#cbd5e1';
}

function LocationMesh({ loc, highlighted, isEditMode, isSelected, onSelect, localTransform, onLocationClick }: { loc: any, highlighted: boolean, isEditMode: boolean, isSelected: boolean, onSelect: () => void, localTransform: number[], onLocationClick?: (id: string) => void }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const scale = getScaleForType(loc.type);
  const color = highlighted ? '#6366f1' : getColorForType(loc.type);
  const isSelectedVisual = isEditMode && isSelected;

  return (
    <mesh 
      ref={meshRef}
      position={[localTransform[0], scale[1]/2 + (loc.type === 'Thin Horizontal Shelf' ? 1.5 : 0), localTransform[2]]}
      rotation={[0, localTransform[3], 0]}
      castShadow
      receiveShadow
      onClick={(e) => {
          e.stopPropagation();
          if (isEditMode) onSelect();
          else if (onLocationClick) onLocationClick(loc.id);
      }}
    >
      <boxGeometry args={scale} />
      <meshStandardMaterial 
        color={color} 
        emissive={highlighted ? '#818cf8' : (isSelectedVisual ? '#34d399' : '#000000')}
        emissiveIntensity={highlighted ? 0.8 : (isSelectedVisual ? 0.5 : 0)}
        transparent
        opacity={isEditMode ? (isSelectedVisual ? 1 : 0.7) : 0.95}
        roughness={0.15}
        metalness={0.05}
      />
      {isSelectedVisual && <Edges scale={1.05} threshold={15} color="#10b981" />}
      <Billboard position={[0, scale[1]/2 + 0.35, 0]}>
        <Text fontSize={0.3} color="#1e293b" anchorX="center" anchorY="middle" outlineWidth={0.02} outlineColor="#ffffff" fontWeight="800">
          {loc.name}
        </Text>
      </Billboard>
      {highlighted && !isEditMode && (
        <Billboard position={[0, scale[1]/2 + 0.8, 0]}>
          <Text fontSize={0.25} color="#ef4444" anchorX="center" fontWeight="bold">▼ SCAN TARGET</Text>
        </Billboard>
      )}
    </mesh>
  );
}

function CameraAnimator({ phase, settings, mainDoor, hologramCenter }: { phase: string, settings: any, mainDoor: any, hologramCenter?: THREE.Vector3 }) {
  const { camera } = useThree();
  useEffect(() => {
    if (!settings) return;
    
    if (phase === 'PICK_NEW_DOOR' && mainDoor && hologramCenter) {
       // Look precisely at the gap between the building doorway and the Hologram
       const midPoint = new THREE.Vector3().addVectors(mainDoor.point, hologramCenter).multiplyScalar(0.5);
       
       // Position the camera dramatically outward along the Normal Vector
       camera.position.set(
          midPoint.x + mainDoor.normal.x * 25 + 10, 
          40, 
          midPoint.z + mainDoor.normal.z * 25 + 10
       );
    } else if (phase === 'NONE') {
       // Default orbital position
       camera.position.set(0, 25, 30);
    }
  }, [phase, settings, camera, mainDoor, hologramCenter]);
  return null;
}

export function Lab3DMap({ locations, highlightedLocationId, readonly = false, onDataRefreshNeeded, onManageLocation, onLocationClick, onBackgroundClick }: Lab3DMapProps) {
  const [settings, setSettings] = useState<any>(null);
  const [rooms, setRooms] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  
  const [localTerminal, setLocalTerminal] = useState<{x: number, z: number} | null>(null);

  type BuilderPhase = 'NONE' | 'NEW_ROOM_SIZE' | 'PICK_MAIN_DOOR' | 'PICK_NEW_DOOR';
  const [builderPhase, setBuilderPhase] = useState<BuilderPhase>('NONE');
  const [room2Dim, setRoom2Dim] = useState<{w: number, l: number} | null>(null);
  
  const [hoverMainPoint, setHoverMainPoint] = useState<{point: THREE.Vector3, normal: THREE.Vector3} | null>(null);
  const [mainDoorDock, setMainDoorDock] = useState<{point: THREE.Vector3, normal: THREE.Vector3} | null>(null);
  
  const [hoverNewPoint, setHoverNewPoint] = useState<{localPoint: THREE.Vector3, localNormal: THREE.Vector3} | null>(null);

  const [localTransforms, setLocalTransforms] = useState<Record<string, number[]>>({});

  const reloadWorkspace = async () => {
    const s = await getLabSettings();
    const r = await getArchitectureRooms();
    setSettings(s);
    setRooms(r);
    setLocalTerminal({x: s.stationX, z: s.stationZ});
  };

  useEffect(() => { reloadWorkspace(); }, []);

  useEffect(() => {
      const newMap = { ...localTransforms };
      locations.forEach(loc => {
          if (!newMap[loc.id]) {
              try { newMap[loc.id] = JSON.parse(loc.transformData || "[0,0,0,0]"); }
              catch { newMap[loc.id] = [0, 0, 0, 0]; }
          }
      });
      setLocalTransforms(newMap);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locations]);

  useEffect(() => {
    if (readonly || !selectedId || !settings?.isSetupComplete || builderPhase !== 'NONE') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['w', 'a', 's', 'd'].includes(e.key.toLowerCase())) {
         const step = 0.5;
         
         if (selectedId === 'TERMINAL' && localTerminal) {
             setLocalTerminal(prev => {
                let nt = { ...prev! };
                if (e.key === 'w') nt.z -= step; 
                if (e.key === 's') nt.z += step; 
                if (e.key === 'a') nt.x -= step; 
                if (e.key === 'd') nt.x += step; 
                setHasUnsavedChanges(true);
                return nt; 
             });
             return;
         }

         setLocalTransforms(prev => {
             const t = prev[selectedId] || [0,0,0,0];
             let nt = [...t];
             if (e.key === 'w') nt[2] -= step; 
             if (e.key === 's') nt[2] += step; 
             if (e.key === 'a') nt[0] -= step; 
             if (e.key === 'd') nt[0] += step; 
             setHasUnsavedChanges(true);
             return { ...prev, [selectedId]: nt };
         });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, readonly, settings, builderPhase, localTerminal]);

  const handleRotateSelected = () => {
      if(!selectedId || selectedId === 'TERMINAL') return;
      setLocalTransforms(prev => {
          const t = prev[selectedId] || [0,0,0,0];
          let nt = [...t];
          nt[3] += Math.PI / 2;
          setHasUnsavedChanges(true);
          return { ...prev, [selectedId]: nt };
      });
  };

  const handleSaveLayout = async () => {
     const promises = Object.entries(localTransforms).map(([id, t]) => updateLocationTransform(id, JSON.stringify(t)));
     await Promise.all(promises);
     
     if (localTerminal) {
         await saveLabSettings(localTerminal.x, localTerminal.z, true);
     }

     setHasUnsavedChanges(false);
     toast.success("Geometric matrices synchronized to DB!");
     if(onDataRefreshNeeded) onDataRefreshNeeded();
  };

  const handleDeleteSelected = async () => {
      if(!selectedId || selectedId === 'TERMINAL') return;
      const target = locations.find(l => l.id === selectedId);
      if(confirm(`Remove ${target?.name} from grid?`)) {
          await removeLocation(selectedId);
          setSelectedId(null);
          toast.success("Object Removed");
          setHasUnsavedChanges(true);
          if(onDataRefreshNeeded) onDataRefreshNeeded();
      }
  };

  const handleResetBlueprint = async () => {
     if(confirm("DANGER: Wiping layout architecture. Equipment will float in the void until you draw a new room! Confirm?")) {
        await resetLabBlueprint();
        await reloadWorkspace();
     }
  };

  // Cross Product Docking Matrix
  const finalizeDocking = async (localP: THREE.Vector3, localN: THREE.Vector3) => {
      if (!mainDoorDock || !room2Dim) return;
      
      const targetN = mainDoorDock.normal.clone().negate();
      let angle = localN.angleTo(targetN);
      const cross = localN.clone().cross(targetN);
      if (cross.y < 0) angle = -angle;

      const rotatedPoint = localP.clone().applyAxisAngle(new THREE.Vector3(0,1,0), angle);
      const offsetVec = mainDoorDock.point.clone().sub(rotatedPoint);

      await addArchitectureRoom(room2Dim.w, room2Dim.l, false, offsetVec.x, offsetVec.z, angle);
      
      setBuilderPhase('NONE');
      await reloadWorkspace();
      toast.success("Architecture fused perfectly!");
  };

  // Derive Hologram target center for rendering based on main door orientation
  const hologramCenter = useMemo(() => {
     if (builderPhase !== 'PICK_NEW_DOOR' || !mainDoorDock || !room2Dim) return new THREE.Vector3();
     const offsetDistance = Math.max(room2Dim.w, room2Dim.l) / 2 + 15;
     return new THREE.Vector3(
        mainDoorDock.point.x + mainDoorDock.normal.x * offsetDistance,
        0,
        mainDoorDock.point.z + mainDoorDock.normal.z * offsetDistance
     );
  }, [builderPhase, mainDoorDock, room2Dim]);

  if (!settings) return <div className="h-full w-full flex items-center justify-center animate-pulse bg-slate-50 text-slate-400 font-bold">Loading Environment Matrix...</div>;

  if (!settings.isSetupComplete && !readonly) {
       return (
           <div className="h-full w-full bg-slate-100 flex flex-col items-center justify-center p-10 relative z-50 overflow-y-auto">
               <div className="bg-white/80 backdrop-blur-xl p-8 md:p-12 rounded-3xl shadow-2xl border max-w-2xl w-full my-auto">
                 <h2 className="text-4xl font-extrabold text-slate-800 mb-4 bg-clip-text text-transparent bg-gradient-to-br from-indigo-600 to-sky-400">Initialize Master Frame</h2>
                 <p className="text-slate-500 mb-10 text-lg font-medium leading-relaxed">Establish your core foundation vectors.</p>
                 
                 <form 
                    onSubmit={async (e: any) => {
                        e.preventDefault();
                        const w = parseFloat(e.target.width.value);
                        const l = parseFloat(e.target.length.value);
                        await addArchitectureRoom(w, l, true, 0, 0, 0);
                        await saveLabSettings(0, 0, true);
                        await reloadWorkspace();
                        toast.success("Master Architecture mapped!");
                    }}
                    className="space-y-6"
                 >
                   <div className="grid grid-cols-2 gap-6">
                      <div className="text-left bg-slate-50 p-4 rounded-2xl border">
                         <label className="font-extrabold text-slate-700 text-xs mb-2 block tracking-wider uppercase">Extents (X)</label>
                         <input name="width" type="number" defaultValue={20} className="w-full bg-white border rounded-xl p-3 shadow-inner text-xl font-bold text-slate-800" required />
                      </div>
                      <div className="text-left bg-slate-50 p-4 rounded-2xl border">
                         <label className="font-extrabold text-slate-700 text-xs mb-2 block tracking-wider uppercase">Extents (Z)</label>
                         <input name="length" type="number" defaultValue={20} className="w-full bg-white border rounded-xl p-3 shadow-inner text-xl font-bold text-slate-800" required />
                      </div>
                   </div>
                   <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-extrabold text-xl tracking-wide py-5 rounded-2xl shadow-xl shadow-indigo-600/30 transition-all mt-8">
                       Construct Foundation
                   </button>
                 </form>
               </div>
           </div>
       );
  }

  const activeLocName = selectedId === 'TERMINAL' ? "Master Terminal" : locations.find(l => l.id === selectedId)?.name;

  return (
    <div className={`relative w-full h-full overflow-hidden ${!readonly && 'bg-slate-50'}`}>
      
      {readonly && (
         <div className="absolute top-6 left-6 z-10 pointer-events-none">
            <span className="bg-white/80 backdrop-blur-md px-4 py-2 rounded-xl border font-bold text-slate-500 shadow-sm text-sm tracking-widest uppercase">Live Frame</span>
         </div>
      )}

      {/* DOCKING BUILDER UI OVERLAY */}
      {builderPhase === 'NEW_ROOM_SIZE' && (
         <div className="absolute inset-0 z-40 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center">
            <form className="bg-white p-10 rounded-[2rem] shadow-2xl max-w-lg w-full flex flex-col gap-6" onSubmit={(e: any) => { e.preventDefault(); setRoom2Dim({w: parseFloat(e.target.w.value), l: parseFloat(e.target.l.value)}); setBuilderPhase('PICK_MAIN_DOOR'); toast("Phase 1: Raycast Master Door", { description: "Hover over the green tiles natively mapped to your existing walls."}); }}>
                <h3 className="font-black text-2xl text-slate-800">New Quadrant Volume</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="font-bold text-slate-500 text-xs uppercase mb-1 block">Inner Width</label>
                    <input name="w" type="number" defaultValue={10} className="w-full border-2 p-3 font-bold text-lg rounded-xl" />
                  </div>
                  <div>
                    <label className="font-bold text-slate-500 text-xs uppercase mb-1 block">Inner Length</label>
                    <input name="l" type="number" defaultValue={10} className="w-full border-2 p-3 font-bold text-lg rounded-xl" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setBuilderPhase('NONE')} className="flex-1 bg-slate-100 text-slate-600 font-bold p-4 rounded-xl">Abort</button>
                  <button type="submit" className="flex-1 bg-indigo-600 text-white font-bold p-4 rounded-xl">Summon Hologram</button>
                </div>
            </form>
         </div>
      )}

      {builderPhase === 'PICK_MAIN_DOOR' && (
         <div className="absolute top-10 left-1/2 -translate-x-1/2 z-30 bg-emerald-500 text-white px-8 py-4 rounded-full font-black tracking-widest shadow-[0_10px_40px_rgba(16,185,129,0.5)] animate-pulse">
            RAYCAST MAIN DOOR TARGET (GREEN) &rarr;
         </div>
      )}
      
      {builderPhase === 'PICK_NEW_DOOR' && (
         <div className="absolute top-10 left-1/2 -translate-x-1/2 z-30 bg-red-500 text-white px-8 py-4 rounded-full font-black tracking-widest shadow-[0_10px_40px_rgba(239,68,68,0.5)] animate-pulse">
            RAYCAST HOLOGRAM DOOR TO SNAP (RED) &rarr;
         </div>
      )}

      {!readonly && builderPhase === 'NONE' && (
        <>
          <div className="absolute top-6 right-6 z-20 pointer-events-auto flex gap-4">
            <button 
              onClick={() => setBuilderPhase('NEW_ROOM_SIZE')}
              className="flex items-center gap-2 px-6 py-3 rounded-2xl font-extrabold shadow-lg transition-all border-2 bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300"
            >
               <PlusSquare size={18} /> APPEND QUADRANT
            </button>
            <button 
              onClick={handleResetBlueprint}
              className="flex items-center gap-2 px-6 py-3 rounded-2xl font-extrabold shadow-lg transition-all border-2 bg-red-50 text-red-600 border-red-200 hover:bg-red-100 hover:border-red-300"
            >
               <RefreshCcw size={18} /> RESET MATRIX
            </button>
            <button 
              onClick={handleSaveLayout}
              className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-extrabold shadow-lg transition-all border-2 ${hasUnsavedChanges ? 'bg-indigo-600 text-white border-indigo-500 animate-pulse hover:bg-indigo-700' : 'bg-white text-slate-400 border-slate-200'}`}
              disabled={!hasUnsavedChanges}
            >
               <Save size={18} /> {hasUnsavedChanges ? 'SAVE LAYOUT' : 'SYNCED'}
            </button>
          </div>
          
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-20 pointer-events-none w-full max-w-lg flex justify-center perspective-[1000px]">
             {selectedId ? (
                <div className="bg-white/95 backdrop-blur-xl p-4 md:p-6 rounded-3xl shadow-2xl border flex flex-col items-center pointer-events-auto gap-4 min-w-[320px] animate-in slide-in-from-bottom flex-shrink-0 mx-4">
                    <span className="text-slate-800 font-extrabold text-lg truncate w-full text-center border-b pb-3">{activeLocName}</span>
                    <div className="flex gap-4 w-full">
                      {selectedId !== 'TERMINAL' && (
                          <button onClick={handleRotateSelected} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 px-4 rounded-xl flex justify-center items-center gap-2 transition-colors">
                            <RotateCw size={18} /> Rotate <span className="hidden sm:inline">90°</span>
                          </button>
                      )}
                      {selectedId !== 'TERMINAL' && locations.find(l => l.id === selectedId)?.config && onManageLocation && (
                          <button onClick={() => {
                             const loc = locations.find(l => l.id === selectedId);
                             if (loc && loc.config) onManageLocation(loc.id, JSON.parse(loc.config));
                          }} className="flex-1 bg-blue-50 hover:bg-blue-500 hover:text-white text-blue-600 border border-blue-100 hover:border-blue-500 font-bold py-3 px-4 rounded-xl flex justify-center items-center gap-2 transition-all">
                            <PlusSquare size={18} /> Manage <span className="hidden sm:inline">Archive</span>
                          </button>
                      )}
                      {selectedId !== 'TERMINAL' && (
                          <button onClick={handleDeleteSelected} className="flex-1 bg-red-50 hover:bg-red-500 hover:text-white text-red-600 border border-red-100 hover:border-red-500 font-bold py-3 px-4 rounded-xl flex justify-center items-center gap-2 transition-all">
                            <Trash2 size={18} /> Delete <span className="hidden sm:inline">Object</span>
                          </button>
                      )}
                    </div>
                </div>
             ) : (
                <div className="bg-slate-800/80 backdrop-blur text-white px-8 py-4 rounded-2xl font-semibold shadow-lg text-sm border border-slate-700/50 animate-in fade-in tracking-wider uppercase flex-shrink-0 mx-4 text-center">
                   Select an anchor or terminal on the grid to map explicitly utilizing WASD.
                </div>
             )}
          </div>
        </>
      )}

      {/* CANVAS LAYER */}
      <Canvas shadows camera={{ position: [0, 20, 25], fov: 40, near: 0.1, far: 2000 }} onPointerMissed={() => { setSelectedId(null); if (onBackgroundClick) onBackgroundClick(); }}>
          <color attach="background" args={['#fafaf9']} />
          <ambientLight intensity={0.6} />
          <directionalLight position={[10, 20, 5]} castShadow intensity={1.5} shadow-mapSize={2048} shadow-bias={-0.0001} />
          <directionalLight position={[-10, 10, -5]} intensity={0.5} color="#818cf8" />
          
          <CameraAnimator phase={builderPhase} settings={settings} mainDoor={mainDoorDock} hologramCenter={hologramCenter} />
          <OrbitControls 
             makeDefault 
             maxPolarAngle={readonly ? Math.PI / 2.5 : Math.PI / 3} 
             minPolarAngle={0} 
             target={(builderPhase === 'PICK_NEW_DOOR' && mainDoorDock) ? new THREE.Vector3().addVectors(mainDoorDock.point, hologramCenter).multiplyScalar(0.5) : [0, 0, 0]} 
          />
          
          <Grid infiniteGrid fadeDistance={150} sectionColor="#94a3b8" cellColor="#e2e8f0" position={[0, -0.01, 0]} sectionSize={2} cellSize={0.5} />

          {/* INFINITE ROOM BRANCHING RENDER */}
          {rooms.map(room => (
             <group key={room.id} position={[room.offsetX, 0, room.offsetZ]} rotation={[0, room.rotation, 0]}>
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
                   <planeGeometry args={[room.width, room.length]} />
                   <meshStandardMaterial color={room.isMain ? "#f8fafc" : "#f0f9ff"} />
                </mesh>
                {[[0, 2, -room.length / 2, room.width, 4, 0.5], 
                  [0, 2, room.length / 2, room.width, 4, 0.5], 
                  [-room.width / 2, 2, 0, 0.5, 4, room.length], 
                  [room.width / 2, 2, 0, 0.5, 4, room.length]].map((w, i) => {

                   const getDockingVectors = (e: any) => {
                        const matrix = new THREE.Matrix4().makeRotationY(room.rotation);
                        matrix.setPosition(new THREE.Vector3(room.offsetX, 0, room.offsetZ));
                        const inverse = matrix.clone().invert();
                        const localE = e.point.clone().applyMatrix4(inverse);
                        
                        let localDockP = new THREE.Vector3();
                        let localN = new THREE.Vector3();
                        if (i === 0) { // North
                            localDockP.set(Math.round(localE.x * 2) / 2, 2, -room.length / 2 - 0.25);
                            localN.set(0, 0, -1);
                        } else if (i === 1) { // South
                            localDockP.set(Math.round(localE.x * 2) / 2, 2, room.length / 2 + 0.25);
                            localN.set(0, 0, 1);
                        } else if (i === 2) { // West
                            localDockP.set(-room.width / 2 - 0.25, 2, Math.round(localE.z * 2) / 2);
                            localN.set(-1, 0, 0);
                        } else if (i === 3) { // East
                            localDockP.set(room.width / 2 + 0.25, 2, Math.round(localE.z * 2) / 2);
                            localN.set(1, 0, 0);
                        }
                        
                        const globalDockP = localDockP.clone().applyMatrix4(matrix);
                        const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
                        const globalN = localN.clone().applyMatrix3(normalMatrix).normalize();
                        
                        // Rounding display normals strictly to prevent rendering floats
                        return { globalP: globalDockP, globalN: new THREE.Vector3(Math.round(globalN.x), 0, Math.round(globalN.z)) };
                   };

                   return (
                   <mesh 
                      key={`wall-${room.id}-${i}`} 
                      position={[w[0], w[1], w[2]]} 
                      castShadow 
                      receiveShadow
                      onPointerMove={(e) => {
                          if (builderPhase !== 'PICK_MAIN_DOOR') return;
                          e.stopPropagation();
                          const res = getDockingVectors(e);
                          setHoverMainPoint({ point: res.globalP, normal: res.globalN });
                      }}
                      onPointerLeave={() => setHoverMainPoint(null)}
                      onClick={(e) => {
                          if (builderPhase !== 'PICK_MAIN_DOOR') return;
                          e.stopPropagation();
                          const res = getDockingVectors(e);
                          setMainDoorDock({ point: res.globalP, normal: res.globalN });
                          setBuilderPhase('PICK_NEW_DOOR');
                      }}
                   >
                     <boxGeometry args={[w[3], w[4], w[5]]} />
                     <meshStandardMaterial color={room.isMain ? "#cbd5e1" : "#bae6fd"} transparent opacity={0.15} roughness={0} />
                   </mesh>
                );
                })}
             </group>
          ))}

          {/* MAIN ROOM GREEN HOVER TILE */}
          {builderPhase === 'PICK_MAIN_DOOR' && hoverMainPoint && (
              <mesh position={hoverMainPoint.point}>
                  <boxGeometry args={[1.1, 4.1, 1.1]} />
                  <meshStandardMaterial color="#10b981" emissive="#10b981" emissiveIntensity={1} opacity={0.8} transparent />
              </mesh>
          )}

          {/* SECONDARY ROOM HOLOGRAM (NEW WORLD SPACE) */}
          {builderPhase === 'PICK_NEW_DOOR' && room2Dim && (
             <group position={hologramCenter}>
                {/* Secondary Floor */}
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
                   <planeGeometry args={[room2Dim.w, room2Dim.l]} />
                   <meshStandardMaterial color="#f0f9ff" />
                </mesh>
                {/* Secondary Walls */}
                {[[0, 2, -room2Dim.l / 2, room2Dim.w, 4, 0.5], 
                  [0, 2, room2Dim.l / 2, room2Dim.w, 4, 0.5], 
                  [-room2Dim.w / 2, 2, 0, 0.5, 4, room2Dim.l], 
                  [room2Dim.w / 2, 2, 0, 0.5, 4, room2Dim.l]].map((w, i) => {

                   const getHoloDockingVectors = (e: any) => {
                        const localE = e.point.clone().sub(hologramCenter);
                        let localDockP = new THREE.Vector3();
                        let localN = new THREE.Vector3();
                        
                        if (i === 0) { // North
                            localDockP.set(Math.round(localE.x * 2) / 2, 2, -room2Dim.l / 2 - 0.25);
                            localN.set(0, 0, -1);
                        } else if (i === 1) { // South
                            localDockP.set(Math.round(localE.x * 2) / 2, 2, room2Dim.l / 2 + 0.25);
                            localN.set(0, 0, 1);
                        } else if (i === 2) { // West
                            localDockP.set(-room2Dim.w / 2 - 0.25, 2, Math.round(localE.z * 2) / 2);
                            localN.set(-1, 0, 0);
                        } else if (i === 3) { // East
                            localDockP.set(room2Dim.w / 2 + 0.25, 2, Math.round(localE.z * 2) / 2);
                            localN.set(1, 0, 0);
                        }
                        return { localDockP, localN };
                   };

                   return (
                   <mesh 
                      key={`holo-wall-${i}`} 
                      position={[w[0], w[1], w[2]]} 
                      castShadow 
                      receiveShadow
                      onPointerMove={(e) => {
                          if (builderPhase !== 'PICK_NEW_DOOR') return;
                          e.stopPropagation();
                          const res = getHoloDockingVectors(e);
                          setHoverNewPoint({ localPoint: res.localDockP, localNormal: res.localN });
                      }}
                      onPointerLeave={() => setHoverNewPoint(null)}
                      onClick={(e) => {
                          if (builderPhase !== 'PICK_NEW_DOOR') return;
                          e.stopPropagation();
                          if(hoverNewPoint) {
                              finalizeDocking(hoverNewPoint.localPoint, hoverNewPoint.localNormal);
                          }
                      }}
                   >
                     <boxGeometry args={[w[3], w[4], w[5]]} />
                     <meshStandardMaterial color="#f43f5e" transparent opacity={0.4} roughness={0} />
                   </mesh>
                   );
                })}

                {/* NEW ROOM RED HOVER TILE */}
                {hoverNewPoint && (
                    <mesh position={hoverNewPoint.localPoint}>
                        <boxGeometry args={[1.1, 4.1, 1.1]} />
                        <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={1} opacity={0.8} transparent />
                    </mesh>
                )}
             </group>
          )}

          {/* Computer Station Anchor Mapping */}
          {localTerminal && (
            <mesh 
               position={[localTerminal.x, 0.5, localTerminal.z]} 
               castShadow
               onClick={(e) => { e.stopPropagation(); if(!readonly && builderPhase === 'NONE') setSelectedId('TERMINAL'); }}
            >
               <boxGeometry args={[1.5, 1, 1]} />
               <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={readonly ? 0.2 : (selectedId==='TERMINAL' ? 0.8 : 0.2)} roughness={0.1} />
               {selectedId === 'TERMINAL' && <Edges scale={1.05} threshold={15} color="#10b981" />}
               <Billboard position={[0, 1.25, 0]}>
                 <Text fontSize={0.25} color="#7f1d1d" anchorX="center" fontWeight="900" outlineWidth={0.01} outlineColor="white">TERMINAL</Text>
               </Billboard>
            </mesh>
          )}

          {locations.map(loc => (
            <LocationMesh 
              key={loc.id} 
              loc={loc} 
              highlighted={loc.id === highlightedLocationId} 
              isEditMode={!readonly && builderPhase === 'NONE'}
              isSelected={loc.id === selectedId}
              onSelect={() => setSelectedId(loc.id)}
              localTransform={localTransforms[loc.id] || [0,0,0,0]}
              onLocationClick={onLocationClick}
            />
          ))}
      </Canvas>
    </div>
  );
}
