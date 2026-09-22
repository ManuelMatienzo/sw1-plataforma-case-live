import { useDiagramStore } from '../store/useDiagramStore';
import { UMLDiagramAST } from '../types/uml';

export function readDiagramDraft(key: string): UMLDiagramAST | null {
  try {
    const raw = sessionStorage.getItem(key); if (!raw) return null;
    const value = JSON.parse(raw) as UMLDiagramAST;
    return Number.isInteger(value.version) && Array.isArray(value.classes) && Array.isArray(value.relationships) ? value : null;
  } catch { return null; }
}
export function trackDiagramDraft(key: string, onError: () => void): () => void {
  let touched = false;
  let draft: UMLDiagramAST | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    if (!touched) return;
    try { if (draft) sessionStorage.setItem(key, JSON.stringify(draft)); else sessionStorage.removeItem(key); }
    catch { onError(); }
  };
  const unsubscribe = useDiagramStore.subscribe(s => {
    if (!s.isDirty && !touched) return;
    touched = true;
    draft = s.isDirty ? { version: s.version, classes: s.classes, relationships: s.relationships } : null;
    clearTimeout(timer); timer = setTimeout(flush, 200);
  });
  window.addEventListener('beforeunload', flush);
  return () => { unsubscribe(); clearTimeout(timer); window.removeEventListener('beforeunload', flush); flush(); };
}
