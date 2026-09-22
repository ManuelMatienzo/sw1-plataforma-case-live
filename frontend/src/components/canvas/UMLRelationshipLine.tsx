import { Group, Line, Text } from 'react-konva';
import { UMLClass, UMLRelationship } from '../../types/uml';
import { CanvasTheme, endpointLabel, relationshipPoints } from './geometry';
import { orthogonalRouting } from './routing';

interface Props { relationship: UMLRelationship; source: UMLClass; target: UMLClass; selected: boolean; theme: CanvasTheme; onSelect(): void }

export default function UMLRelationshipLine({ relationship: r, source, target, selected, theme, onSelect }: Props) {
  const isOrthogonal = r.isOrthogonal !== false; // Default to true
  const points = isOrthogonal ? orthogonalRouting(source, target) : relationshipPoints(source, target);
  const n = points.length;
  const diamond = r.type === 'COMPOSITION' || r.type === 'AGGREGATION';
  const triangle = r.type === 'INHERITANCE' || r.type === 'REALIZATION';
  const open = r.type === 'DEPENDENCY';
  const start = { x: points[0], y: points[1] }; const end = { x: points[n - 2], y: points[n - 1] };
  const angle = (diamond ? Math.atan2(points[3] - start.y, points[2] - start.x) : Math.atan2(points[n - 3] - end.y, points[n - 4] - end.x)) * 180 / Math.PI;
  const color = selected ? theme.focus : theme.secondary;
  return <Group onClick={e => { e.cancelBubble = true; onSelect(); }} onTap={e => { e.cancelBubble = true; onSelect(); }}>
    <Line points={points} stroke={color} strokeWidth={selected ? 2.5 : 1.5} lineJoin="round" lineCap="round" hitStrokeWidth={18} dash={r.type === 'REALIZATION' || open ? [8, 5] : undefined} />
    {diamond || triangle || open ? <Group x={diamond ? start.x : end.x} y={diamond ? start.y : end.y} rotation={angle}>
      <Line points={diamond ? [0, 0, 12, -7, 24, 0, 12, 7] : [18, -9, 0, 0, 18, 9]} closed={!open}
        fill={open ? undefined : r.type === 'COMPOSITION' ? color : theme.background} stroke={color} strokeWidth={1.5} />
    </Group> : null}
    <Text {...endpointLabel(start.x, start.y, points[2], points[3], source)} height={32} ellipsis text={[r.sourceMultiplicity, r.sourceRole].filter(Boolean).join(' ')} fontFamily="JetBrains Mono" fontSize={12} fill={theme.text} />
    <Text {...endpointLabel(end.x, end.y, points[n - 4], points[n - 3], target)} height={32} ellipsis text={[r.targetMultiplicity, r.targetRole].filter(Boolean).join(' ')} fontFamily="JetBrains Mono" fontSize={12} fill={theme.text} />
    {r.name ? <Text x={(start.x + end.x) / 2 - 70} y={(start.y + end.y) / 2 - 22} width={140} align="center" text={r.name} fontSize={12} fontFamily="Sora" fill={theme.text} /> : null}
  </Group>;
}
