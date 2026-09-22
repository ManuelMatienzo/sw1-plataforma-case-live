import { memo, useEffect, useRef } from 'react';
import { Circle, Group, Line, Rect, Text } from 'react-konva';
import { UMLClass } from '../../types/uml';
import { attributeText, CanvasTheme, classSize, methodText } from './geometry';

export type EditTargetData = { type: 'name' | 'attribute' | 'method'; itemId?: string; val: string; x: number; y: number; w: number; h: number };

interface Props { cls: UMLClass; selected: boolean; connecting: boolean; editable: boolean; theme: CanvasTheme;
  onSelect(): void; onConnect(): void; onMove(x: number, y: number): void;
  onDragStart?(): void; onDragEnd?(): void;
  onEdit?(data: EditTargetData): void;
}

const UMLClassNode = memo(({ cls, selected, connecting, editable, theme, onSelect, onConnect, onMove, onDragStart, onDragEnd, onEdit }: Props) => {
  const size = classSize(cls);
  const animFrameRef = useRef<number | null>(null);
  const pendingPosRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, []);

  const handleDblClick = (e: any, type: 'name' | 'attribute' | 'method', itemId?: string, val?: string) => {
    if (!editable || !onEdit) return;
    e.cancelBubble = true;
    const pos = e.target.getAbsolutePosition();
    onEdit({ type, itemId, val: val || '', x: pos.x, y: pos.y, w: e.target.width(), h: e.target.height() });
  };

  const handleDragStart = (e: any) => {
    e.cancelBubble = true;
    onSelect();
    onDragStart?.();
  };

  const handleDragMove = (e: any) => {
    e.cancelBubble = true;
    const x = e.target.x();
    const y = e.target.y();
    pendingPosRef.current = { x, y };
    if (animFrameRef.current === null) {
      animFrameRef.current = requestAnimationFrame(() => {
        animFrameRef.current = null;
        if (pendingPosRef.current) {
          onMove(pendingPosRef.current.x, pendingPosRef.current.y);
        }
      });
    }
  };

  const handleDragEnd = (e: any) => {
    e.cancelBubble = true;
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    onMove(e.target.x(), e.target.y());
    onDragEnd?.();
  };

  return <Group x={cls.position.x} y={cls.position.y} draggable={editable && !connecting}
    onMouseDown={e => { e.cancelBubble = true; }} onTouchStart={e => { e.cancelBubble = true; }}
    onClick={e => { e.cancelBubble = true; onSelect(); }} onTap={e => { e.cancelBubble = true; onSelect(); }}
    onDragStart={handleDragStart}
    onDragMove={handleDragMove}
    onDragEnd={handleDragEnd}>
    <Rect width={size.width} height={size.height} fill={theme.surface} stroke={selected ? theme.focus : theme.border} strokeWidth={selected ? 2 : 1} cornerRadius={8} />
    <Rect x={1} y={1} width={size.width - 2} height={size.header - 1} fill={theme.header} cornerRadius={[7, 7, 0, 0]} />
    {cls.isInterface ? <Text y={10} width={size.width} text="«interface»" align="center" fontSize={12} fontFamily="JetBrains Mono" fill={theme.secondary} /> : null}
    <Text y={cls.isInterface ? 32 : 14} x={12} width={size.width - 24} text={cls.name} align="center" ellipsis wrap="none"
      fontStyle={cls.isAbstract ? 'italic bold' : 'bold'} fontFamily="Sora" fontSize={14} fill={theme.text}
      onDblClick={(e) => handleDblClick(e, 'name', undefined, cls.name)}
      onDblTap={(e) => handleDblClick(e, 'name', undefined, cls.name)} />
    <Line points={[0, size.header, size.width, size.header]} stroke={theme.border} />
    
    {cls.attributes.map((a, i) => <Text key={a.id} x={12} y={size.header + 10 + i * 24} width={size.width - 24}
      text={attributeText(a)} fontFamily="JetBrains Mono" fontSize={12} fill={theme.text} ellipsis wrap="none"
      onDblClick={(e) => handleDblClick(e, 'attribute', a.id, a.name)}
      onDblTap={(e) => handleDblClick(e, 'attribute', a.id, a.name)} />)}
    
    <Line points={[0, size.header + size.attributes, size.width, size.header + size.attributes]} stroke={theme.border} />
    
    {cls.methods.map((m, i) => <Text key={m.id} x={12} y={size.header + size.attributes + 10 + i * 24} width={size.width - 24}
      text={methodText(m)} fontFamily="JetBrains Mono" fontSize={12} fill={theme.text} fontStyle={m.isAbstract ? 'italic' : 'normal'} textDecoration={m.isStatic ? 'underline' : undefined} ellipsis wrap="none"
      onDblClick={(e) => handleDblClick(e, 'method', m.id, m.name)}
      onDblTap={(e) => handleDblClick(e, 'method', m.id, m.name)} />)}
      
    {[[0, size.height / 2], [size.width, size.height / 2], [size.width / 2, 0], [size.width / 2, size.height]].map(([x, y], i) =>
      <Circle key={`anchor-${i}`} x={x} y={y} radius={6} hitStrokeWidth={4} fill={theme.focus} stroke={theme.surface} strokeWidth={2}
        visible={editable && (selected || connecting)}
        onMouseDown={e => { e.cancelBubble = true; }} onTouchStart={e => { e.cancelBubble = true; }}
        onClick={e => { e.cancelBubble = true; onConnect(); }} onTap={e => { e.cancelBubble = true; onConnect(); }} />)}
  </Group>;
});
export default UMLClassNode;
