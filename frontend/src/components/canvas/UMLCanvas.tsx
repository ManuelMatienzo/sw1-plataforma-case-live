import { useEffect, useMemo, useRef, useState } from 'react';
import Konva from 'konva/lib/Core';
import { Layer, Stage } from 'react-konva';
import { useDiagramStore } from '../../store/useDiagramStore';
import { UMLRelationshipType } from '../../types/uml';
import UMLClassNode, { EditTargetData } from './UMLClassNode';
import UMLRelationshipLine from './UMLRelationshipLine';
import { CanvasTheme, canvasThemes } from './geometry';
import InlineEditor from './InlineEditor';
import FloatingContextMenu from './FloatingContextMenu';
import RemoteCursorsLayer from './RemoteCursorsLayer';

export interface Viewport { x: number; y: number; scale: number }
interface Props { editable: boolean; connecting: boolean; relationshipType: UMLRelationshipType; view: Viewport;
  setView(view: Viewport): void; onConnected(): void; canvasTheme?: 'dark' | 'light'; onCursorMove?(x: number, y: number): void; }

export default function UMLCanvas({ editable, connecting, relationshipType, view, setView, onConnected, canvasTheme = 'dark', onCursorMove }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const theme: CanvasTheme = canvasThemes[canvasTheme];
  const [editing, setEditing] = useState<(EditTargetData & { classId: string }) | null>(null);
  const [isDraggingNode, setIsDraggingNode] = useState(false);
  const classes = useDiagramStore(s => s.classes); const relationships = useDiagramStore(s => s.relationships);
  const selectedClassId = useDiagramStore(s => s.selectedClassId); const selectedRelationshipId = useDiagramStore(s => s.selectedRelationshipId);
  const sourceId = useDiagramStore(s => s.connectingSourceId);
  const index = useMemo(() => new Map(classes.map(c => [c.id, c])), [classes]);

  useEffect(() => {
    Konva.dragDistance = 5;
    const node = container.current!;
    const observer = new ResizeObserver(() => setSize({ width: node.clientWidth, height: node.clientHeight }));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!editable) {
      setEditing(null);
      useDiagramStore.getState().startConnecting(null);
    }
  }, [editable]);
  const choose = (id: string, anchor = false) => {
    const s = useDiagramStore.getState();
    if (editable && (connecting || anchor || sourceId)) {
      if (sourceId) { s.finishConnecting(id, relationshipType); onConnected(); } else s.startConnecting(id);
    } else s.selectClass(id);
  };
  const handleSaveEdit = (newVal: string) => {
    if (editing && editable) {
      const s = useDiagramStore.getState();
      if (editing.type === 'name') s.updateClass(editing.classId, { name: newVal });
      else if (editing.type === 'attribute' && editing.itemId) s.updateAttribute(editing.classId, editing.itemId, { name: newVal });
      else if (editing.type === 'method' && editing.itemId) s.updateMethod(editing.classId, editing.itemId, { name: newVal });
    }
    setEditing(null);
  };

  const handleStageBackgroundClick = (e: any) => {
    if (e.target === e.target.getStage()) {
      const s = useDiagramStore.getState();
      s.selectClass(null);
      s.selectRelationship(null);
      s.startConnecting(null);
      setEditing(null);
      onConnected();
    }
  };

  return <div ref={container} className="uml-canvas" role="img" aria-label="Lienzo UML. Usa el panel Elementos para seleccionar y editar con teclado."
    style={{ backgroundPosition: `${view.x}px ${view.y}px`, backgroundSize: `${24 * view.scale}px ${24 * view.scale}px` }}>
    {theme ? <Stage width={size.width} height={size.height} x={view.x} y={view.y} scaleX={view.scale} scaleY={view.scale} draggable={!isDraggingNode}
      onDragEnd={e => { if (e.target === e.target.getStage()) setView({ ...view, x: e.target.x(), y: e.target.y() }); }}
      onMouseMove={e => { const pointer = e.target.getStage()?.getPointerPosition(); if (pointer) onCursorMove?.((pointer.x - view.x) / view.scale, (pointer.y - view.y) / view.scale); }}
      onTouchMove={e => { const pointer = e.target.getStage()?.getPointerPosition(); if (pointer) onCursorMove?.((pointer.x - view.x) / view.scale, (pointer.y - view.y) / view.scale); }}
      onClick={handleStageBackgroundClick}
      onTap={handleStageBackgroundClick}
      onWheel={e => {
        e.evt.preventDefault(); const pointer = e.target.getStage()?.getPointerPosition(); if (!pointer) return;
        const scale = Math.max(.25, Math.min(2.5, view.scale * (e.evt.deltaY > 0 ? .9 : 1.1)));
        setView({ scale, x: pointer.x - (pointer.x - view.x) / view.scale * scale, y: pointer.y - (pointer.y - view.y) / view.scale * scale });
        setEditing(null);
      }}>
      <Layer>{relationships.map(r => { const source = index.get(r.sourceClassId); const target = index.get(r.targetClassId);
        return source && target ? <UMLRelationshipLine key={r.id} relationship={r} source={source} target={target} selected={selectedRelationshipId === r.id} theme={theme} onSelect={() => { useDiagramStore.getState().selectRelationship(r.id); setEditing(null); }} /> : null;
      })}</Layer>
      <Layer>{classes.map(c => <UMLClassNode key={c.id} cls={c} selected={selectedClassId === c.id || sourceId === c.id} connecting={connecting || Boolean(sourceId)}
        editable={editable} theme={theme} onSelect={() => { choose(c.id); setEditing(null); }} onConnect={() => choose(c.id, true)}
        onMove={(x, y) => { useDiagramStore.getState().moveClass(c.id, x, y); setEditing(null); }}
        onDragStart={() => setIsDraggingNode(true)}
        onDragEnd={() => setIsDraggingNode(false)}
        onEdit={data => setEditing({ ...data, classId: c.id })} />)}</Layer>
      <RemoteCursorsLayer />
    </Stage> : null}
    {editing ? <InlineEditor initialValue={editing.val} x={editing.x} y={editing.y} width={editing.w} height={editing.h} scale={view.scale} theme={theme} onSave={handleSaveEdit} onCancel={() => setEditing(null)} /> : null}
    {editable && selectedClassId && !connecting && !sourceId && !editing && !isDraggingNode ? (() => {
      const selectedCls = classes.find(c => c.id === selectedClassId);
      if (!selectedCls) return null;
      return <FloatingContextMenu 
        cls={selectedCls} 
        x={view.x + selectedCls.position.x * view.scale} 
        y={view.y + selectedCls.position.y * view.scale} 
        scale={view.scale} 
        onConnect={() => choose(selectedCls.id, true)} 
      />;
    })() : null}
  </div>;
}
