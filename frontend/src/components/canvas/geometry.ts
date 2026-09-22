import { UMLAttribute, UMLClass, UMLMethod } from '../../types/uml';
export const attributeText = (a: UMLAttribute) => `${a.visibility} ${a.name}: ${a.type}${a.isPrimaryKey ? ' [PK]' : ''}${a.isNullable ? ' [0..1]' : ''}${a.isUnique ? ' {unique}' : ''}${a.defaultValue ? ` = ${a.defaultValue}` : ''}`;
export const methodText = (m: UMLMethod) => `${m.visibility} ${m.name}(${m.parameters.map(p => `${p.name}: ${p.type}`).join(', ')}): ${m.returnType}`;
export const classSize = (c: UMLClass) => {
  const lines = [c.name, ...c.attributes.map(attributeText), ...c.methods.map(methodText)];
  return { width: Math.max(c.width || 260, Math.min(540, Math.max(...lines.map(l => l.length)) * 8 + 32)),
    header: c.isInterface ? 64 : 44, attributes: Math.max(40, c.attributes.length * 24 + 16),
    methods: Math.max(40, c.methods.length * 24 + 16),
    get height() { return this.header + this.attributes + this.methods; } };
};
export function relationshipPoints(source: UMLClass, target: UMLClass): number[] {
  const a = classSize(source); const b = classSize(target);
  if (source.id === target.id) return [source.position.x + a.width, source.position.y + a.header / 2,
    source.position.x + a.width + 60, source.position.y + a.header / 2,
    source.position.x + a.width + 60, source.position.y - 40,
    source.position.x + a.width / 2, source.position.y - 40,
    source.position.x + a.width / 2, source.position.y];
  const ac = { x: source.position.x + a.width / 2, y: source.position.y + a.height / 2 };
  const bc = { x: target.position.x + b.width / 2, y: target.position.y + b.height / 2 };
  const dx = bc.x - ac.x; const dy = bc.y - ac.y;
  if (!dx && !dy) return [ac.x + a.width / 2, ac.y, bc.x + b.width / 2 + 40, bc.y];
  const at = Math.min(dx ? a.width / 2 / Math.abs(dx) : Infinity, dy ? a.height / 2 / Math.abs(dy) : Infinity);
  const bt = Math.min(dx ? b.width / 2 / Math.abs(dx) : Infinity, dy ? b.height / 2 / Math.abs(dy) : Infinity);
  return [ac.x + dx * at, ac.y + dy * at, bc.x - dx * bt, bc.y - dy * bt];
}
export interface CanvasTheme { surface: string; header: string; border: string; text: string; secondary: string; focus: string; background: string }

export const canvasThemes: Record<'dark' | 'light', CanvasTheme> = {
  dark: {
    surface: '#111827',
    header: '#172033',
    background: '#0b0f1a',
    border: '#2b3a52',
    text: '#f4f7ff',
    secondary: '#a5b4cc',
    focus: '#9db0ff',
  },
  light: {
    surface: '#ffffff',
    header: '#f1f5f9',
    background: '#f8fafc',
    border: '#94a3b8',
    text: '#0f172a',
    secondary: '#475569',
    focus: '#2563eb',
  },
};

/** Place endpoint text outwards from its class, not behind the node layer. */
export function endpointLabel(x: number, y: number, towardX: number, towardY: number, node?: UMLClass) {
  if (node) {
    const size = classSize(node);
    const edges = [
      { side: 'left', distance: Math.abs(x - node.position.x) },
      { side: 'right', distance: Math.abs(x - node.position.x - size.width) },
      { side: 'top', distance: Math.abs(y - node.position.y) },
      { side: 'bottom', distance: Math.abs(y - node.position.y - size.height) },
    ];
    const side = edges.reduce((closest, edge) => edge.distance < closest.distance ? edge : closest).side;
    if (side === 'left') return { x: x - 148, y: y - 30, width: 120, align: 'right' };
    if (side === 'right') return { x: x + 28, y: y - 30, width: 120, align: 'left' };
    return { x: x + 14, y: y + (side === 'top' ? -48 : 28), width: 120, align: 'left' };
  }
  const dx = towardX - x; const dy = towardY - y; const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length; const uy = dy / length;
  if (Math.abs(ux) > Math.abs(uy)) return {
    x: x + ux * 28 - (ux < 0 ? 120 : 0), y: y + uy * 28 - 30, width: 120, align: ux < 0 ? 'right' : 'left',
  };
  return { x: x + ux * 28 + 14, y: y + (uy < 0 ? -48 : 28), width: 120, align: 'left' };
}
