import { useMemo } from 'react';
import { Group, Label, Layer, Line, Tag, Text } from 'react-konva';
import { useDiagramStore } from '../../store/useDiagramStore';
import type { RemoteCursor } from '../../types/realtime';

interface Props { cursors?: RemoteCursor[] }
export default function RemoteCursorsLayer({ cursors: propCursors }: Props) {
  const storeCursors = useDiagramStore(s => s.remoteCursors);
  const cursors = useMemo(() => propCursors ?? Object.values(storeCursors), [propCursors, storeCursors]);

  return (
    <Layer listening={false}>
      {cursors.map(cursor => (
        <Group key={cursor.socketId} x={cursor.x} y={cursor.y} listening={false}>
          {/* Main pointer arrow */}
          <Line
            points={[0, 0, 0, 18, 5, 14, 10, 24, 14, 22, 9, 12, 17, 12]}
            closed
            fill={cursor.color}
            stroke="#ffffff"
            strokeWidth={1}
            shadowColor="rgba(0,0,0,0.35)"
            shadowBlur={3}
            shadowOffset={{ x: 0, y: 1 }}
            shadowOpacity={0.5}
          />
          {/* User name tag pill */}
          <Label x={14} y={16} listening={false}>
            <Tag
              fill={cursor.color}
              cornerRadius={4}
              shadowColor="rgba(0,0,0,0.25)"
              shadowBlur={4}
              shadowOffset={{ x: 0, y: 2 }}
              shadowOpacity={0.4}
            />
            <Text
              text={cursor.name}
              fill="#0B0F1A"
              fontFamily="Sora"
              fontStyle="bold"
              fontSize={11}
              padding={5}
            />
          </Label>
        </Group>
      ))}
    </Layer>
  );
}
