import { create } from 'zustand';
import type { AppliedDiagramOperation, DiagramOperation, PresenceUser, RemoteCursor } from '../types/realtime';
import { UMLAttribute, UMLClass, UMLDiagramAST, UMLMethod, UMLRelationship, UMLRelationshipType } from '../types/uml';

export interface SaveSnapshot { epoch: number; revision: number; ast: UMLDiagramAST }
interface DiagramState extends UMLDiagramAST {
  selectedClassId: string | null; selectedRelationshipId: string | null; connectingSourceId: string | null;
  isDirty: boolean; isSaving: boolean; error: string; revision: number; epoch: number;
  presenceUsers: PresenceUser[]; remoteCursors: Record<string, RemoteCursor>; selfSocketId: string | null;
  setDiagram(ast: UMLDiagramAST): void;
  addClass(cls: UMLClass): void; updateClass(id: string, updates: Partial<UMLClass>): void;
  deleteClass(id: string): void; moveClass(id: string, x: number, y: number): void;
  addAttribute(id: string, attr: UMLAttribute): void; updateAttribute(id: string, attrId: string, updates: Partial<UMLAttribute>): void;
  deleteAttribute(id: string, attrId: string): void;
  addMethod(id: string, method: UMLMethod): void; updateMethod(id: string, methodId: string, updates: Partial<UMLMethod>): void;
  deleteMethod(id: string, methodId: string): void;
  addRelationship(rel: UMLRelationship): void; updateRelationship(id: string, updates: Partial<UMLRelationship>): void;
  deleteRelationship(id: string): void;
  selectClass(id: string | null): void; selectRelationship(id: string | null): void;
  startConnecting(id: string | null): void; finishConnecting(id: string, type: UMLRelationshipType): void;
  beginSave(): SaveSnapshot; completeSave(snapshot: SaveSnapshot, version: number): void;
  failSave(snapshot: SaveSnapshot, message: string): void;
  applyRemoteOperation(operation: AppliedDiagramOperation): void;
  setPresence(users: PresenceUser[], selfSocketId: string | null): void;
  updateRemoteCursor(cursor: { socketId: string; userId: string; x: number; y: number }): void;
  clearCollaboration(): void;
}

type OperationListener = (operation: DiagramOperation) => void;
const operationListeners = new Set<OperationListener>();
const seenRemoteOperations = new Set<string>();
export const subscribeDiagramOperations = (listener: OperationListener) => {
  operationListeners.add(listener);
  return () => operationListeners.delete(listener);
};
const operationId = () => crypto.randomUUID();
const publish = (operation: DiagramOperation) => operationListeners.forEach(listener => listener(operation));

export const useDiagramStore = create<DiagramState>((set, get) => {
  const change = (updates: Partial<DiagramState>, operation?: DiagramOperation) => {
    set(state => ({ ...updates, revision: state.revision + 1, isDirty: true, error: '' }));
    if (operation) publish(operation);
  };
  const editMembers = (id: string, update: (cls: UMLClass) => UMLClass, operation: DiagramOperation) => {
    if (!get().classes.some(cls => cls.id === id)) return;
    change({ classes: get().classes.map(cls => cls.id === id ? update(cls) : cls) }, operation);
  };
  const remoteChange = (updates: Partial<DiagramState>) => set(state => ({ ...updates, revision: state.revision + 1, isDirty: true, error: '' }));
  return {
    version: 1, classes: [], relationships: [], selectedClassId: null, selectedRelationshipId: null,
    connectingSourceId: null, isDirty: false, isSaving: false, error: '', revision: 0, epoch: 0,
    presenceUsers: [], remoteCursors: {}, selfSocketId: null,
    setDiagram: ast => {
      seenRemoteOperations.clear();
      set(state => ({ ...structuredClone(ast), selectedClassId: null, selectedRelationshipId: null,
        connectingSourceId: null, isDirty: false, isSaving: false, error: '', revision: 0, epoch: state.epoch + 1 }));
    },
    addClass: cls => {
      if (get().classes.some(current => current.name.trim().toLowerCase() === cls.name.trim().toLowerCase())) { set({ error: 'Ya existe una clase con ese nombre.' }); return; }
      change({ classes: [...get().classes, cls], selectedClassId: cls.id, selectedRelationshipId: null },
        { type: 'class:add', payload: { class: structuredClone(cls) }, operationId: operationId() });
    },
    updateClass: (id, updates) => {
      if (updates.name !== undefined && (!updates.name.trim() || get().classes.some(cls => cls.id !== id && cls.name.trim().toLowerCase() === updates.name!.trim().toLowerCase()))) {
        set({ error: 'El nombre es obligatorio y debe ser único.' }); return;
      }
      if (!get().classes.some(cls => cls.id === id)) return;
      change({ classes: get().classes.map(cls => cls.id === id ? { ...cls, ...updates, id: cls.id } : cls) },
        { type: 'class:update', payload: { classId: id, updates: structuredClone(updates) }, operationId: operationId() });
    },
    deleteClass: id => {
      if (!get().classes.some(cls => cls.id === id)) return;
      change({ classes: get().classes.filter(cls => cls.id !== id),
        relationships: get().relationships.filter(rel => rel.sourceClassId !== id && rel.targetClassId !== id),
        selectedClassId: null, selectedRelationshipId: null, connectingSourceId: null },
        { type: 'class:delete', payload: { classId: id }, operationId: operationId() });
    },
    moveClass: (id, x, y) => {
      if (!Number.isFinite(x) || !Number.isFinite(y) || !get().classes.some(cls => cls.id === id)) return;
      const bounded = { x: Math.max(-100000, Math.min(100000, x)), y: Math.max(-100000, Math.min(100000, y)) };
      change({ classes: get().classes.map(cls => cls.id === id ? { ...cls, position: bounded } : cls) },
        { type: 'class:move', payload: { classId: id, ...bounded }, operationId: operationId() });
    },
    addAttribute: (id, attribute) => editMembers(id, cls => ({ ...cls, attributes: [...cls.attributes, attribute] }),
      { type: 'attribute:add', payload: { classId: id, attribute: structuredClone(attribute) }, operationId: operationId() }),
    updateAttribute: (id, attributeId, updates) => editMembers(id, cls => ({ ...cls, attributes: cls.attributes.map(attribute => attribute.id === attributeId ? { ...attribute, ...updates, id: attribute.id } : attribute) }),
      { type: 'attribute:update', payload: { classId: id, attributeId, updates: structuredClone(updates) }, operationId: operationId() }),
    deleteAttribute: (id, attributeId) => editMembers(id, cls => ({ ...cls, attributes: cls.attributes.filter(attribute => attribute.id !== attributeId) }),
      { type: 'attribute:delete', payload: { classId: id, attributeId }, operationId: operationId() }),
    addMethod: (id, method) => editMembers(id, cls => ({ ...cls, methods: [...cls.methods, method] }),
      { type: 'method:add', payload: { classId: id, method: structuredClone(method) }, operationId: operationId() }),
    updateMethod: (id, methodId, updates) => editMembers(id, cls => ({ ...cls, methods: cls.methods.map(method => method.id === methodId ? { ...method, ...updates, id: method.id } : method) }),
      { type: 'method:update', payload: { classId: id, methodId, updates: structuredClone(updates) }, operationId: operationId() }),
    deleteMethod: (id, methodId) => editMembers(id, cls => ({ ...cls, methods: cls.methods.filter(method => method.id !== methodId) }),
      { type: 'method:delete', payload: { classId: id, methodId }, operationId: operationId() }),
    addRelationship: relationship => {
      if (![relationship.sourceClassId, relationship.targetClassId].every(id => get().classes.some(cls => cls.id === id))) return;
      change({ relationships: [...get().relationships, relationship], selectedClassId: null, selectedRelationshipId: relationship.id },
        { type: 'relationship:add', payload: { relationship: structuredClone(relationship) }, operationId: operationId() });
    },
    updateRelationship: (id, updates) => {
      if (!get().relationships.some(relationship => relationship.id === id)) return;
      change({ relationships: get().relationships.map(relationship => relationship.id === id ? { ...relationship, ...updates, id: relationship.id } : relationship) },
        { type: 'relationship:update', payload: { relationshipId: id, updates: structuredClone(updates) }, operationId: operationId() });
    },
    deleteRelationship: id => {
      if (!get().relationships.some(relationship => relationship.id === id)) return;
      change({ relationships: get().relationships.filter(relationship => relationship.id !== id), selectedRelationshipId: null },
        { type: 'relationship:delete', payload: { relationshipId: id }, operationId: operationId() });
    },
    selectClass: id => set({ selectedClassId: id, selectedRelationshipId: null, error: '' }),
    selectRelationship: id => set({ selectedRelationshipId: id, selectedClassId: null, error: '' }),
    startConnecting: id => set({ connectingSourceId: id }),
    finishConnecting: (target, type) => {
      const source = get().connectingSourceId;
      if (source) {
        if (source === target && (type === 'INHERITANCE' || type === 'REALIZATION' || type === 'COMPOSITION' || type === 'AGGREGATION')) {
          set({ connectingSourceId: null, error: 'Una clase no puede heredar ni componerse de sí misma.' });
          return;
        }
        const duplicate = get().relationships.some(r => r.sourceClassId === source && r.targetClassId === target && r.type === type);
        if (duplicate) {
          set({ connectingSourceId: null, error: 'Ya existe una relación del mismo tipo entre estas clases.' });
          return;
        }
        get().addRelationship({ id: crypto.randomUUID(), sourceClassId: source, targetClassId: target, type,
          sourceMultiplicity: '1', targetMultiplicity: '*', isOrthogonal: true });
      }
      set({ connectingSourceId: null });
    },
    beginSave: () => {
      const state = get(); set({ isSaving: true, error: '' });
      return { epoch: state.epoch, revision: state.revision, ast: structuredClone({ version: state.version, classes: state.classes, relationships: state.relationships }) };
    },
    completeSave: (snapshot, version) => {
      if (get().epoch === snapshot.epoch) set(state => ({ version, isSaving: false, isDirty: state.revision !== snapshot.revision }));
    },
    failSave: (snapshot, message) => { if (get().epoch === snapshot.epoch) set({ isSaving: false, error: message }); },
    applyRemoteOperation: operation => {
      if (seenRemoteOperations.has(operation.operationId)) return;
      seenRemoteOperations.add(operation.operationId);
      const state = get();
      switch (operation.type) {
        case 'class:add': {
          const classes = state.classes.some(cls => cls.id === operation.payload.class.id)
            ? state.classes.map(cls => cls.id === operation.payload.class.id ? operation.payload.class : cls)
            : [...state.classes, operation.payload.class];
          remoteChange({ classes }); break;
        }
        case 'class:update': remoteChange({ classes: state.classes.map(cls => cls.id === operation.payload.classId ? { ...cls, ...operation.payload.updates, id: cls.id } : cls) }); break;
        case 'class:move': remoteChange({ classes: state.classes.map(cls => cls.id === operation.payload.classId ? { ...cls, position: { x: operation.payload.x, y: operation.payload.y } } : cls) }); break;
        case 'class:delete': {
          const remainingRels = state.relationships.filter(rel => rel.sourceClassId !== operation.payload.classId && rel.targetClassId !== operation.payload.classId);
          const relStillExists = remainingRels.some(r => r.id === state.selectedRelationshipId);
          remoteChange({
            classes: state.classes.filter(cls => cls.id !== operation.payload.classId),
            relationships: remainingRels,
            selectedClassId: state.selectedClassId === operation.payload.classId ? null : state.selectedClassId,
            selectedRelationshipId: relStillExists ? state.selectedRelationshipId : null,
          });
          break;
        }
        case 'attribute:add': remoteChange({ classes: state.classes.map(cls => cls.id === operation.payload.classId ? { ...cls, attributes: cls.attributes.some(item => item.id === operation.payload.attribute.id) ? cls.attributes.map(item => item.id === operation.payload.attribute.id ? operation.payload.attribute : item) : [...cls.attributes, operation.payload.attribute] } : cls) }); break;
        case 'attribute:update': remoteChange({ classes: state.classes.map(cls => cls.id === operation.payload.classId ? { ...cls, attributes: cls.attributes.map(item => item.id === operation.payload.attributeId ? { ...item, ...operation.payload.updates, id: item.id } : item) } : cls) }); break;
        case 'attribute:delete': remoteChange({ classes: state.classes.map(cls => cls.id === operation.payload.classId ? { ...cls, attributes: cls.attributes.filter(item => item.id !== operation.payload.attributeId) } : cls) }); break;
        case 'method:add': remoteChange({ classes: state.classes.map(cls => cls.id === operation.payload.classId ? { ...cls, methods: cls.methods.some(item => item.id === operation.payload.method.id) ? cls.methods.map(item => item.id === operation.payload.method.id ? operation.payload.method : item) : [...cls.methods, operation.payload.method] } : cls) }); break;
        case 'method:update': remoteChange({ classes: state.classes.map(cls => cls.id === operation.payload.classId ? { ...cls, methods: cls.methods.map(item => item.id === operation.payload.methodId ? { ...item, ...operation.payload.updates, id: item.id } : item) } : cls) }); break;
        case 'method:delete': remoteChange({ classes: state.classes.map(cls => cls.id === operation.payload.classId ? { ...cls, methods: cls.methods.filter(item => item.id !== operation.payload.methodId) } : cls) }); break;
        case 'relationship:add': remoteChange({ relationships: state.relationships.some(rel => rel.id === operation.payload.relationship.id) ? state.relationships.map(rel => rel.id === operation.payload.relationship.id ? operation.payload.relationship : rel) : [...state.relationships, operation.payload.relationship] }); break;
        case 'relationship:update': remoteChange({ relationships: state.relationships.map(rel => rel.id === operation.payload.relationshipId ? { ...rel, ...operation.payload.updates, id: rel.id } : rel) }); break;
        case 'relationship:delete': remoteChange({ relationships: state.relationships.filter(rel => rel.id !== operation.payload.relationshipId), selectedRelationshipId: state.selectedRelationshipId === operation.payload.relationshipId ? null : state.selectedRelationshipId }); break;
      }
    },
    setPresence: (users, selfSocketId) => set(state => {
      const active = new Map(users.map(user => [user.socketId, user]));
      return {
        presenceUsers: users,
        selfSocketId,
        remoteCursors: Object.fromEntries(Object.entries(state.remoteCursors)
          .filter(([socketId]) => socketId !== selfSocketId && active.has(socketId))
          .map(([socketId, cursor]) => [socketId, { ...cursor, name: active.get(socketId)!.name, color: active.get(socketId)!.color }])),
      };
    }),
    updateRemoteCursor: cursor => set(state => {
      if (cursor.socketId === state.selfSocketId) return state;
      const user = state.presenceUsers.find(item => item.socketId === cursor.socketId);
      if (!user) return state;
      return { remoteCursors: { ...state.remoteCursors, [cursor.socketId]: { ...cursor, name: user.name, color: user.color } } };
    }),
    clearCollaboration: () => set({ presenceUsers: [], remoteCursors: {}, selfSocketId: null }),
  };
});
