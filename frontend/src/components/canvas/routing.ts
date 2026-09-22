import { UMLClass } from '../../types/uml';
import { classSize } from './geometry';

export type Point = { x: number; y: number };
export type AnchorSide = 'top' | 'right' | 'bottom' | 'left';

const MARGIN = 30;

function getAnchors(node: UMLClass): Record<AnchorSide, Point> {
  const s = classSize(node);
  const px = node.position.x;
  const py = node.position.y;
  return {
    top: { x: px + s.width / 2, y: py },
    right: { x: px + s.width, y: py + s.height / 2 },
    bottom: { x: px + s.width / 2, y: py + s.height },
    left: { x: px, y: py + s.height / 2 },
  };
}

function getRoutingPath(p1: Point, side1: AnchorSide, p2: Point, side2: AnchorSide): Point[] {
  // Extract primary directions
  const isHorizontal1 = side1 === 'left' || side1 === 'right';
  const isHorizontal2 = side2 === 'left' || side2 === 'right';

  const m1 = { x: p1.x + (side1 === 'left' ? -MARGIN : side1 === 'right' ? MARGIN : 0),
               y: p1.y + (side1 === 'top' ? -MARGIN : side1 === 'bottom' ? MARGIN : 0) };
  const m2 = { x: p2.x + (side2 === 'left' ? -MARGIN : side2 === 'right' ? MARGIN : 0),
               y: p2.y + (side2 === 'top' ? -MARGIN : side2 === 'bottom' ? MARGIN : 0) };

  if (isHorizontal1 && !isHorizontal2) {
    return [p1, m1, { x: m1.x, y: m2.y }, m2, p2];
  } else if (!isHorizontal1 && isHorizontal2) {
    return [p1, m1, { x: m2.x, y: m1.y }, m2, p2];
  } else if (isHorizontal1 && isHorizontal2) {
    // Both horizontal
    const midX = (m1.x + m2.x) / 2;
    return [p1, m1, { x: midX, y: m1.y }, { x: midX, y: m2.y }, m2, p2];
  } else {
    // Both vertical
    const midY = (m1.y + m2.y) / 2;
    return [p1, m1, { x: m1.x, y: midY }, { x: m2.x, y: midY }, m2, p2];
  }
}

function distance(pts: Point[]): number {
  let dist = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    dist += Math.abs(pts[i].x - pts[i + 1].x) + Math.abs(pts[i].y - pts[i + 1].y);
  }
  return dist;
}

export function orthogonalRouting(source: UMLClass, target: UMLClass): number[] {
  if (source.id === target.id) {
    const s = classSize(source);
    const px = source.position.x;
    const py = source.position.y;
    return [
      px + s.width, py + s.height / 2 - 20,
      px + s.width + 40, py + s.height / 2 - 20,
      px + s.width + 40, py - 40,
      px + s.width / 2, py - 40,
      px + s.width / 2, py
    ];
  }

  const sAnchors = getAnchors(source);
  const tAnchors = getAnchors(target);
  const sides: AnchorSide[] = ['top', 'right', 'bottom', 'left'];
  
  let bestPath: Point[] = [];
  let minLength = Infinity;

  for (const sSide of sides) {
    for (const tSide of sides) {
      // Basic heuristic: check if the side makes sense
      const sPt = sAnchors[sSide];
      const tPt = tAnchors[tSide];
      
      // Penalize bad sides (e.g. going left when target is to the right)
      let penalty = 0;
      if (sSide === 'right' && tPt.x < sPt.x) penalty += 1000;
      if (sSide === 'left' && tPt.x > sPt.x) penalty += 1000;
      if (sSide === 'bottom' && tPt.y < sPt.y) penalty += 1000;
      if (sSide === 'top' && tPt.y > sPt.y) penalty += 1000;
      
      if (tSide === 'right' && sPt.x < tPt.x) penalty += 1000;
      if (tSide === 'left' && sPt.x > tPt.x) penalty += 1000;
      if (tSide === 'bottom' && sPt.y < tPt.y) penalty += 1000;
      if (tSide === 'top' && sPt.y > tPt.y) penalty += 1000;

      const path = getRoutingPath(sPt, sSide, tPt, tSide);
      const dist = distance(path) + penalty;
      
      if (dist < minLength) {
        minLength = dist;
        bestPath = path;
      }
    }
  }

  // Remove duplicate consecutive points to clean up the line
  const cleaned: Point[] = [];
  for (const pt of bestPath) {
    if (cleaned.length > 0) {
      const prev = cleaned[cleaned.length - 1];
      if (Math.abs(prev.x - pt.x) < 1 && Math.abs(prev.y - pt.y) < 1) continue;
    }
    cleaned.push(pt);
  }

  return cleaned.flatMap(p => [p.x, p.y]);
}
