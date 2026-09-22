import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronDown, Download, FileDown, FileUp, FolderDown, Network, Save, ZoomIn, ZoomOut, PanelRightClose, PanelRightOpen, Sun, Moon, MessageSquare, Users, Mic, ShieldCheck, Camera, Database } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { sesionesApi, getApiErrorMessage } from '../services/api';
import { chatApi } from '../services/chatApi';
import { getStoredSession } from '../services/authStorage';
import { readDiagramDraft, trackDiagramDraft } from '../services/diagramDraft';
import { createUmlSocketClient, RealtimeStatus, UmlSocketClient } from '../services/umlSocketClient';
import { subscribeDiagramOperations, useDiagramStore } from '../store/useDiagramStore';
import { useChatStore } from '../store/useChatStore';
import { UMLClass, UMLDiagramAST, UMLRelationshipType, UMLVisibility } from '../types/uml';
import type { AppliedDiagramOperation } from '../types/realtime';
import type { PhotoImportResult, VoiceCommandAction } from '../types/ai';
import { calculateNextClassPosition, normalizeText } from '../services/voiceCommandParser';
import { validateUmlDiagram } from '../services/umlValidator';
import type { UmlDiagnostic, UmlValidationReport } from '../types/validation';
import { mergeUmlDiagrams } from '../utils/diagramMerge';
import UMLToolbox from '../components/canvas/UMLToolbox';
import ElementPropertyPanel from '../components/canvas/ElementPropertyPanel';
import SessionPresenceBar from '../components/canvas/SessionPresenceBar';
import SessionChatDrawer from '../components/chat/SessionChatDrawer';
import VoiceCommandWidget from '../components/voice/VoiceCommandWidget';
import ValidationReportDrawer from '../components/canvas/ValidationReportDrawer';
import { classSize } from '../components/canvas/geometry';
import type { Viewport } from '../components/canvas/UMLCanvas';
import { downloadBlob, XmiImportResult, xmiApi } from '../services/xmiService';
import './Workspace.css';

const UMLCanvas = lazy(() => import('../components/canvas/UMLCanvas'));
const ManageParticipantsModal = lazy(() => import('../components/session/ManageParticipantsModal'));
const ImportXmiModal = lazy(() => import('../components/session/ImportXmiModal'));
const ImportPhotoModal = lazy(() => import('../components/session/ImportPhotoModal'));
const DataModelModal = lazy(() => import('../components/session/DataModelModal'));
const empty: UMLDiagramAST = { version: 1, classes: [], relationships: [] };
export default function WorkspaceDemoPage() {
  const { sesionId } = useParams(); const navigate = useNavigate();
  const [loading, setLoading] = useState(true); const [loadError, setLoadError] = useState('');
  const [info, setInfo] = useState({ proyectoNombre: 'Diagrama de práctica', sesionNombre: 'Demostración local', canEdit: true });
  const [attempt, setAttempt] = useState(0); const [connecting, setConnecting] = useState(false);
  const [type, setType] = useState<UMLRelationshipType>('ASSOCIATION');
  const [view, setView] = useState<Viewport>({ x: 0, y: 0, scale: 1 });
  const [draft, setDraft] = useState<UMLDiagramAST | null>(null);
  const [draftWarning, setDraftWarning] = useState('');
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>('offline');
  const [realtimeError, setRealtimeError] = useState('');
  const [conflictNotice, setConflictNotice] = useState('');
  const [liveCanEdit, setLiveCanEdit] = useState<boolean | null>(null);
  const [permissionNotice, setPermissionNotice] = useState('');
  const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);
  const [isXmiImportOpen, setIsXmiImportOpen] = useState(false);
  const [isPhotoImportOpen, setIsPhotoImportOpen] = useState(false);
  const [isDataModelOpen, setIsDataModelOpen] = useState(false);
  const [isExportingXmi, setIsExportingXmi] = useState(false);
  const [xmiNotice, setXmiNotice] = useState<{ message: string; error?: boolean } | null>(null);
  const [isVoiceWidgetOpen, setIsVoiceWidgetOpen] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState('');
  const [isPropertiesExpanded, setIsPropertiesExpanded] = useState(true);
  const [isValidationOpen, setIsValidationOpen] = useState(false);
  const [validationReport, setValidationReport] = useState<UmlValidationReport | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const [canvasTheme, setCanvasTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('case_canvas_theme') as 'dark' | 'light') || 'dark';
  });

  useEffect(() => {
    if (!isModelMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) {
        setIsModelMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsModelMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isModelMenuOpen]);

  useEffect(() => {
    document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('case_canvas_theme', canvasTheme);
  }, [canvasTheme]);

  useEffect(() => {
    if (!conflictNotice) return;
    const timer = setTimeout(() => setConflictNotice(''), 4000);
    return () => clearTimeout(timer);
  }, [conflictNotice]);

  useEffect(() => {
    if (!voiceNotice) return;
    const timer = setTimeout(() => setVoiceNotice(''), 4000);
    return () => clearTimeout(timer);
  }, [voiceNotice]);

  useEffect(() => {
    if (!xmiNotice) return;
    const timer = setTimeout(() => setXmiNotice(null), xmiNotice.error ? 7_000 : 5_000);
    return () => clearTimeout(timer);
  }, [xmiNotice]);

  const storedSession = getStoredSession();
  const draftKey = 'case.diagram-draft.v1:' + (storedSession?.user.id || 'guest') + ':' + (sesionId || 'demo');
  const canvasArea = useRef<HTMLDivElement>(null);
  const liveClient = useRef<UmlSocketClient | null>(null);
  const diagramReady = useRef(false);
  const queuedRemoteOperations = useRef<AppliedDiagramOperation[]>([]);
  const classesCount = useDiagramStore(s => s.classes.length);
  const relationshipsCount = useDiagramStore(s => s.relationships.length);
  const hasClasses = classesCount > 0;
  const dirty = useDiagramStore(s => s.isDirty); const saving = useDiagramStore(s => s.isSaving);
  const error = useDiagramStore(s => s.error); const version = useDiagramStore(s => s.version);
  const sourceId = useDiagramStore(s => s.connectingSourceId);
  const presenceUsers = useDiagramStore(s => s.presenceUsers);
  const selfSocketId = useDiagramStore(s => s.selfSocketId);
  const selfPresence = presenceUsers.find(u => (selfSocketId && u.socketId === selfSocketId) || u.userId === storedSession?.user.id);
  const isHost = selfPresence?.role === 'ANFITRION';

  const isChatOpen = useChatStore(s => s.isOpen);
  const unreadChatCount = useChatStore(s => s.unreadCount);
  const toggleChatOpen = useChatStore(s => s.toggleOpen);

  useEffect(() => {
    if (!sesionId) {
      useChatStore.getState().reset();
      return;
    }
    chatApi.getHistorial(sesionId)
      .then(mensajes => useChatStore.getState().setMessages(mensajes))
      .catch(() => {});
  }, [sesionId]);

  useEffect(() => {
    let active = true; setLoading(true); setLoadError(''); setConnecting(false); setView({ x: 0, y: 0, scale: 1 });
    diagramReady.current = false; queuedRemoteOperations.current = [];
    useDiagramStore.getState().setDiagram(empty);
    setDraft(readDiagramDraft(draftKey)); setDraftWarning('');
    let stopTracking = () => {};
    const track = () => { stopTracking = trackDiagramDraft(draftKey, () => setDraftWarning('No se pudo conservar el borrador local. Descarga una copia antes de salir.')); };
    if (!sesionId) { setInfo({ proyectoNombre: 'Diagrama de práctica', sesionNombre: 'Demostración local', canEdit: true }); setLoading(false); diagramReady.current = true; track(); return () => stopTracking(); }
    sesionesApi.getDiagrama(sesionId).then(result => {
      if (active) {
        const store = useDiagramStore.getState();
        store.setDiagram(result.diagram);
        diagramReady.current = true;
        queuedRemoteOperations.current.forEach(operation => store.applyRemoteOperation(operation));
        queuedRemoteOperations.current = [];
        setInfo(result); setLoading(false); track();
      }
    }).catch(e => { if (active) { setLoadError(getApiErrorMessage(e, 'No se pudo cargar el diagrama. Comprueba tu conexión y vuelve a intentar.')); setLoading(false); } });
    return () => { active = false; stopTracking(); };
  }, [sesionId, attempt, draftKey]);
  useEffect(() => {
    useDiagramStore.getState().clearCollaboration();
    setRealtimeStatus(sesionId ? 'connecting' : 'offline'); setRealtimeError(''); setConflictNotice(''); setLiveCanEdit(null);
    if (!sesionId || !storedSession?.token) return;
    const client = createUmlSocketClient({
      token: storedSession.token,
      sessionId: sesionId,
      onStatus: status => { setRealtimeStatus(status); if (status === 'online') setRealtimeError(''); },
      onPresence: (users, selfSocketId) => {
        useDiagramStore.getState().setPresence(users, selfSocketId);
        const current = users.find(user => user.socketId === selfSocketId);
        if (current) setLiveCanEdit(current.canEdit);
      },
      onCursor: cursor => useDiagramStore.getState().updateRemoteCursor(cursor),
      onOperation: operation => {
        if (diagramReady.current) useDiagramStore.getState().applyRemoteOperation(operation);
        else if (queuedRemoteOperations.current.length < 1_000) queuedRemoteOperations.current.push(operation);
      },
      onConflict: conflict => setConflictNotice(`Edición simultánea resuelta: prevaleció el cambio de ${conflict.winner.name}.`),
      onChatMessage: message => useChatStore.getState().addMessage(message),
      onChatCleared: () => useChatStore.getState().clearMessages(),
      onPermissionUpdated: event => {
        if (event.userId !== storedSession.user.id) return;
        setLiveCanEdit(event.canEdit);
        setPermissionNotice(event.canEdit ? 'Ahora puedes editar el diagrama.' : 'Ahora tienes permiso de solo lectura.');
      },
      onKicked: event => {
        useDiagramStore.getState().clearCollaboration();
        useChatStore.getState().reset();
        setIsParticipantsOpen(false);
        navigate('/dashboard', { replace: true, state: { sessionNotice: event.message } });
      },
      onDiagramReplaced: event => {
        const currentVersion = useDiagramStore.getState().version;
        if (event.diagram.version < currentVersion) return;
        useDiagramStore.getState().setDiagram(event.diagram);
        setValidationReport(event.validationReport);
        setXmiNotice({ message: `El modelo XMI se actualizó en la sesión · v${event.diagram.version}.` });
      },
      onError: realtime => {
        setRealtimeError(realtime.message);
        if (realtime.code === 'READ_ONLY' || realtime.code === 'SESSION_ACCESS_REVOKED') setLiveCanEdit(false);
      },
    });
    liveClient.current = client;
    const stopOperations = subscribeDiagramOperations(operation => client.emitOperation(operation));
    client.connect();
    return () => {
      stopOperations(); client.disconnect();
      if (liveClient.current === client) liveClient.current = null;
      useDiagramStore.getState().clearCollaboration();
    };
  }, [sesionId, storedSession?.token, storedSession?.user.id, navigate]);
  const effectiveCanEdit = liveCanEdit ?? info.canEdit;

  const handleSendChatMessage = useCallback(async (contenido: string): Promise<boolean> => {
    return new Promise(resolve => {
      if (!liveClient.current) {
        resolve(false);
        return;
      }
      liveClient.current.sendChatMessage(contenido, ok => resolve(ok));
    });
  }, []);

  const handleClearChat = useCallback(async (): Promise<boolean> => {
    return new Promise(resolve => {
      if (!liveClient.current) {
        resolve(false);
        return;
      }
      liveClient.current.clearChat(ok => resolve(ok));
    });
  }, []);
  const save = useCallback(async () => {
    const store = useDiagramStore.getState();
    if (!sesionId || !effectiveCanEdit || loading || store.isSaving || !store.isDirty) return;
    const snapshot = store.beginSave();
    try { const result = await sesionesApi.saveDiagrama(sesionId, snapshot.ast); store.completeSave(snapshot, result.diagram.version); }
    catch (e) { store.failSave(snapshot, getApiErrorMessage(e, 'No se pudo guardar. Tus cambios siguen en el lienzo; vuelve a intentarlo.')); }
  }, [sesionId, effectiveCanEdit, loading]);

  const runValidation = useCallback(async () => {
    setIsValidating(true);
    const store = useDiagramStore.getState();
    const currentAst: UMLDiagramAST = {
      version: store.version,
      classes: store.classes,
      relationships: store.relationships,
    };

    // Validación formal inmediata en cliente según UML 2.5+
    const clientReport = validateUmlDiagram(currentAst);
    setValidationReport(clientReport);

    // Si hay sesión en el servidor, consultamos también el endpoint formal de backend
    if (sesionId) {
      try {
        const serverReport = await sesionesApi.validarDiagrama(sesionId, currentAst);
        setValidationReport(serverReport);
      } catch (err) {
        console.warn('Validación backend diferida, usando reporte local:', err);
      }
    }
    setIsValidating(false);
  }, [sesionId]);

  const toggleValidation = useCallback(() => {
    setIsValidationOpen(prev => {
      const next = !prev;
      if (next) {
        void runValidation();
      }
      return next;
    });
  }, [runValidation]);

  const handleFocusDiagnosticElement = useCallback((targetType: UmlDiagnostic['targetType'], targetId: string) => {
    const store = useDiagramStore.getState();
    const width = canvasArea.current?.clientWidth || 600;
    const height = canvasArea.current?.clientHeight || 400;

    if (targetType === 'CLASS' || targetType === 'ATTRIBUTE' || targetType === 'METHOD') {
      let targetClass = store.classes.find(c => c.id === targetId);
      if (!targetClass) {
        targetClass = store.classes.find(c =>
          c.attributes?.some(a => a.id === targetId) || c.methods?.some(m => m.id === targetId)
        );
      }

      if (targetClass) {
        const size = classSize(targetClass);
        setView(v => ({
          ...v,
          x: width / 2 - (targetClass.position.x + size.width / 2) * v.scale,
          y: height / 2 - (targetClass.position.y + size.height / 2) * v.scale,
        }));
        store.selectClass(targetClass.id);
        store.selectRelationship(null);
        setIsPropertiesExpanded(true);
      }
    } else if (targetType === 'RELATIONSHIP') {
      const rel = store.relationships.find(r => r.id === targetId);
      if (rel) {
        const srcCls = store.classes.find(c => c.id === rel.sourceClassId);
        const tgtCls = store.classes.find(c => c.id === rel.targetClassId);
        if (srcCls && tgtCls) {
          const midX = (srcCls.position.x + tgtCls.position.x) / 2;
          const midY = (srcCls.position.y + tgtCls.position.y) / 2;
          setView(v => ({
            ...v,
            x: width / 2 - midX * v.scale,
            y: height / 2 - midY * v.scale,
          }));
        }
        store.selectRelationship(rel.id);
        store.selectClass(null);
        setIsPropertiesExpanded(true);
      }
    }
  }, []);

  useEffect(() => {
    const leave = (e: BeforeUnloadEvent) => { if (effectiveCanEdit && useDiagramStore.getState().isDirty) { e.preventDefault(); e.returnValue = ''; } };
    const keys = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); void save(); return; }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        toggleValidation();
        return;
      }
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (e.key.toLowerCase() === 'v' && !e.ctrlKey && !e.metaKey && effectiveCanEdit) {
        e.preventDefault();
        setIsVoiceWidgetOpen(prev => !prev);
        return;
      }
      if (e.key === 'Escape') { setConnecting(false); useDiagramStore.getState().startConnecting(null); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && effectiveCanEdit) {
        const s = useDiagramStore.getState();
        if (s.selectedClassId) {
          e.preventDefault();
          s.deleteClass(s.selectedClassId);
        } else if (s.selectedRelationshipId) {
          e.preventDefault();
          s.deleteRelationship(s.selectedRelationshipId);
        }
      }
    };
    window.addEventListener('beforeunload', leave); window.addEventListener('keydown', keys);
    return () => { window.removeEventListener('beforeunload', leave); window.removeEventListener('keydown', keys); };
  }, [save, effectiveCanEdit, toggleValidation]);

  const handleExecuteVoiceAction = useCallback((action: VoiceCommandAction): { success: boolean; message?: string } => {
    if (!effectiveCanEdit) {
      return { success: false, message: 'Modo solo lectura: no tienes permisos de edición.' };
    }
    const store = useDiagramStore.getState();
    const findClassByName = (name: string) => {
      const norm = normalizeText(name).toLowerCase();
      return store.classes.find(c => normalizeText(c.name).toLowerCase() === norm);
    };

    switch (action.type) {
      case 'CREATE_CLASS': {
        const normName = normalizeText(action.name).toLowerCase();
        if (store.classes.some(c => normalizeText(c.name).toLowerCase() === normName)) {
          return { success: false, message: `Ya existe una clase con el nombre "${action.name}".` };
        }
        const width = canvasArea.current?.clientWidth || 800;
        const height = canvasArea.current?.clientHeight || 600;
        const position = calculateNextClassPosition(store.classes, view, width, height);

        const newClass: UMLClass = {
          id: crypto.randomUUID(),
          name: action.name,
          isAbstract: Boolean(action.isAbstract),
          isInterface: Boolean(action.isInterface),
          attributes: (action.attributes || []).map(att => ({
            id: crypto.randomUUID(),
            name: att.name,
            type: att.type,
            visibility: (att.visibility as UMLVisibility) || '+',
            isPrimaryKey: Boolean(att.isPrimaryKey),
          })),
          methods: (action.methods || []).map(m => ({
            id: crypto.randomUUID(),
            name: m.name,
            returnType: m.returnType,
            visibility: (m.visibility as UMLVisibility) || '+',
            parameters: [],
          })),
          position,
        };

        store.addClass(newClass);
        setVoiceNotice(`Clase "${action.name}" creada con éxito.`);
        return { success: true, message: `Clase "${action.name}" agregada al modelo.` };
      }

      case 'ADD_ATTRIBUTE': {
        const cls = findClassByName(action.className);
        if (!cls) {
          return { success: false, message: `No se encontró la clase "${action.className}".` };
        }
        if (cls.attributes.some(a => a.name.toLowerCase() === action.attribute.name.toLowerCase())) {
          return { success: false, message: `"${cls.name}" ya contiene el atributo "${action.attribute.name}".` };
        }
        store.addAttribute(cls.id, {
          id: crypto.randomUUID(),
          name: action.attribute.name,
          type: action.attribute.type,
          visibility: (action.attribute.visibility as UMLVisibility) || '+',
          isPrimaryKey: Boolean(action.attribute.isPrimaryKey),
        });
        setVoiceNotice(`Atributo "${action.attribute.name}" agregado a "${cls.name}".`);
        return { success: true, message: `Atributo "${action.attribute.name}" agregado a "${cls.name}".` };
      }

      case 'ADD_METHOD': {
        const cls = findClassByName(action.className);
        if (!cls) {
          return { success: false, message: `No se encontró la clase "${action.className}".` };
        }
        if (cls.methods.some(m => m.name.toLowerCase() === action.method.name.toLowerCase())) {
          return { success: false, message: `"${cls.name}" ya contiene el método "${action.method.name}".` };
        }
        store.addMethod(cls.id, {
          id: crypto.randomUUID(),
          name: action.method.name,
          returnType: action.method.returnType,
          visibility: (action.method.visibility as UMLVisibility) || '+',
          parameters: [],
        });
        setVoiceNotice(`Método "${action.method.name}()" agregado a "${cls.name}".`);
        return { success: true, message: `Método "${action.method.name}()" agregado a "${cls.name}".` };
      }

      case 'CREATE_RELATION': {
        const src = findClassByName(action.sourceName);
        const dst = findClassByName(action.targetName);
        if (!src) {
          return { success: false, message: `No se encontró la clase origen "${action.sourceName}".` };
        }
        if (!dst) {
          return { success: false, message: `No se encontró la clase destino "${action.targetName}".` };
        }
        store.addRelationship({
          id: crypto.randomUUID(),
          sourceClassId: src.id,
          targetClassId: dst.id,
          type: action.relationshipType,
          sourceMultiplicity: action.sourceMultiplicity || (action.relationshipType === 'ASSOCIATION' ? '1' : undefined),
          targetMultiplicity: action.targetMultiplicity || (action.relationshipType === 'ASSOCIATION' ? '1..*' : undefined),
          isOrthogonal: true,
        });
        setVoiceNotice(`Relación ${action.relationshipType} creada entre "${src.name}" y "${dst.name}".`);
        return { success: true, message: `Relación creada entre "${src.name}" y "${dst.name}".` };
      }

      case 'DELETE_CLASS': {
        const cls = findClassByName(action.className);
        if (!cls) {
          return { success: false, message: `No se encontró la clase "${action.className}" para eliminar.` };
        }
        store.deleteClass(cls.id);
        setVoiceNotice(`Clase "${cls.name}" eliminada.`);
        return { success: true, message: `Clase "${cls.name}" eliminada del diagrama.` };
      }

      default:
        return { success: false, message: 'Acción no soportada.' };
    }
  }, [effectiveCanEdit, view]);
  const selectMode = () => { setConnecting(false); useDiagramStore.getState().startConnecting(null); };
  const addClass = (isInterface: boolean) => {
    if (!effectiveCanEdit) return;
    const store = useDiagramStore.getState(); let n = 1; const base = isInterface ? 'Interfaz' : 'Clase';
    while (store.classes.some(c => c.name === base + n)) n++;
    selectMode();
    const width = canvasArea.current?.clientWidth || 600;
    store.addClass({ id: crypto.randomUUID(), name: base + n, isAbstract: false, isInterface, attributes: [], methods: [],
      position: { x: (Math.max(24, width / 2 - 130) - view.x) / view.scale, y: (100 - view.y) / view.scale + (store.classes.length % 4) * 40 } });
  };
  const download = () => {
    const s = useDiagramStore.getState();
    const url = URL.createObjectURL(new Blob([JSON.stringify({ version: s.version, classes: s.classes, relationships: s.relationships }, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'diagrama-uml.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const handleXmiImported = useCallback((result: XmiImportResult) => {
    useDiagramStore.getState().setDiagram(result.diagram);
    setValidationReport(result.validationReport);
    setIsXmiImportOpen(false);
    const warning = result.warnings.length ? ` · ${result.warnings.length} advertencia${result.warnings.length === 1 ? '' : 's'} de compatibilidad` : '';
    setXmiNotice({ message: `Modelo XMI importado: ${result.summary.classes + result.summary.interfaces} tipos y ${result.summary.relationships} relaciones${warning}.` });
  }, []);
  const handlePhotoDiagramImported = useCallback((result: PhotoImportResult, strategy: 'replace' | 'merge') => {
    const store = useDiagramStore.getState();
    const currentDiagram: UMLDiagramAST = {
      version: store.version,
      nombre: store.nombre,
      classes: store.classes,
      relationships: store.relationships,
    };

    const nextDiagram = strategy === 'merge'
      ? mergeUmlDiagrams(currentDiagram, result.diagram)
      : result.diagram;

    store.setDiagram(nextDiagram);
    useDiagramStore.setState({ isDirty: true, revision: store.revision + 1 });
    setValidationReport(result.validationReport);
    setIsPhotoImportOpen(false);

    const warningsText = result.warnings.length
      ? ` · ${result.warnings.length} advertencia${result.warnings.length > 1 ? 's' : ''}`
      : '';

    setXmiNotice({
      message: `Diagrama importado desde foto: ${result.summary.classes} clases y ${result.summary.relationships} relaciones${warningsText}. Recuerda guardar para persistir cambios.`,
    });
  }, []);
  const exportXmi = useCallback(async () => {
    if (!sesionId || isExportingXmi) return;
    setIsExportingXmi(true); setXmiNotice(null);
    try {
      const exported = await xmiApi.exportar(sesionId);
      downloadBlob(exported);
      setXmiNotice({ message: `Modelo exportado como ${exported.filename}.` });
    } catch (exportError) {
      setXmiNotice({ message: getApiErrorMessage(exportError, 'No se pudo exportar el modelo XMI.'), error: true });
    } finally { setIsExportingXmi(false); }
  }, [sesionId, isExportingXmi]);
  const back = () => { if (!dirty || window.confirm('Hay cambios sin guardar. ¿Salir y descartarlos?')) navigate(sesionId ? '/dashboard' : '/'); };
  return <div className="uml-workspace">
    <header className="uml-header">
      <div className="uml-header-left">
        <button className="uml-icon-btn" aria-label="Volver" title="Volver" onClick={back}><ArrowLeft size={19} /></button>
        <Network size={22} className="uml-brand" aria-hidden="true" />
        <div className="uml-project-title" title={`${info.proyectoNombre} — ${info.sesionNombre}`}>
          <h1>{info.proyectoNombre}</h1>
          <p>{info.sesionNombre}</p>
        </div>
        {sesionId ? (
          <>
            <div className="uml-header-divider" aria-hidden="true" />
            <SessionPresenceBar users={presenceUsers} status={realtimeStatus} />
          </>
        ) : null}
      </div>

      <div className="uml-header-right">
        {/* Validación y Modelo */}
        <div className="uml-btn-group">
          <button
            className={`uml-validation-btn ${validationReport && !validationReport.isValid ? 'is-invalid' : validationReport?.isValid ? 'is-valid' : ''}`}
            aria-label="Validar diagrama UML 2.5+ (Atajo: Ctrl+Shift+V)"
            title="Validar diagrama UML 2.5+ (Atajo: Ctrl+Shift+V)"
            onClick={toggleValidation}
          >
            <ShieldCheck size={17} />
            <span>Validar</span>
            {validationReport ? (
              validationReport.criticalErrorsCount > 0 ? (
                <span className="uml-val-badge is-error">{validationReport.criticalErrorsCount}</span>
              ) : validationReport.warningsCount > 0 ? (
                <span className="uml-val-badge is-warning">{validationReport.warningsCount}</span>
              ) : (
                <span className="uml-val-badge is-ok">✓</span>
              )
            ) : null}
          </button>

          {/* Botón Modelo de Datos Relacional (CU-11) */}
          <button
            className="uml-datamodel-btn"
            aria-label="Generar esquema relacional 3FN (Reglas de Tom)"
            title="Generar esquema relacional 3FN (Reglas de Tom)"
            onClick={() => setIsDataModelOpen(true)}
          >
            <Database size={17} />
            <span>BD Relacional</span>
          </button>

          {/* Menú Desplegable Modelo */}
          <div className="uml-dropdown-container" ref={modelMenuRef}>
            <button
              className={`uml-dropdown-btn ${isModelMenuOpen ? 'is-active' : ''}`}
              aria-label="Menú de modelo y archivos"
              aria-expanded={isModelMenuOpen}
              onClick={() => setIsModelMenuOpen(prev => !prev)}
              title="Importar / Exportar modelo"
            >
              <FolderDown size={17} />
              <span>Modelo</span>
              <ChevronDown size={14} className={`uml-chevron ${isModelMenuOpen ? 'is-rotated' : ''}`} />
            </button>

            {isModelMenuOpen && (
              <div className="uml-dropdown-menu" role="menu">
                <button
                  role="menuitem"
                  className="uml-dropdown-item"
                  aria-label="Generar modelo relacional 3FN"
                  onClick={() => {
                    setIsModelMenuOpen(false);
                    setIsDataModelOpen(true);
                  }}
                  title="Transformación formal UML → Tablas relacionales 3FN (Reglas de Tom)"
                >
                  <Database size={16} />
                  <div className="uml-dropdown-item-text">
                    <span className="uml-dropdown-item-title">Modelo Relacional (3FN)</span>
                    <span className="uml-dropdown-item-desc">Reglas de Tom / TPS / TPH / TPC</span>
                  </div>
                </button>
                <button
                  role="menuitem"
                  className="uml-dropdown-item"
                  aria-label="Importar diagrama desde foto"
                  disabled={loading || Boolean(loadError) || saving || !effectiveCanEdit}
                  onClick={() => {
                    setIsModelMenuOpen(false);
                    setIsPhotoImportOpen(true);
                  }}
                  title="Digitalizar diagrama de pizarra o papel con IA"
                >
                  <Camera size={16} />
                  <div className="uml-dropdown-item-text">
                    <span className="uml-dropdown-item-title">Importar desde foto (IA)</span>
                    <span className="uml-dropdown-item-desc">Visión por computadora / Pizarra</span>
                  </div>
                </button>

                {sesionId && isHost && (
                  <button
                    role="menuitem"
                    className="uml-dropdown-item"
                    aria-label="Importar modelo XMI"
                    disabled={loading || Boolean(loadError) || saving || dirty || !effectiveCanEdit}
                    onClick={() => {
                      setIsModelMenuOpen(false);
                      setIsXmiImportOpen(true);
                    }}
                    title={dirty ? 'Guarda tus cambios antes de importar' : 'Importar modelo XMI (Enterprise Architect)'}
                  >
                    <FileUp size={16} />
                    <div className="uml-dropdown-item-text">
                      <span className="uml-dropdown-item-title">Importar XMI</span>
                      <span className="uml-dropdown-item-desc">Enterprise Architect / UML 2.x</span>
                    </div>
                  </button>
                )}

                {sesionId && isHost && (
                  <button
                    role="menuitem"
                    className="uml-dropdown-item"
                    aria-label="Exportar modelo XMI"
                    disabled={loading || Boolean(loadError) || saving || dirty || isExportingXmi}
                    onClick={() => {
                      setIsModelMenuOpen(false);
                      void exportXmi();
                    }}
                    title={dirty ? 'Guarda tus cambios antes de exportar' : 'Exportar modelo XMI (Enterprise Architect)'}
                  >
                    <FileDown size={16} />
                    <div className="uml-dropdown-item-text">
                      <span className="uml-dropdown-item-title">{isExportingXmi ? 'Exportando…' : 'Exportar XMI'}</span>
                      <span className="uml-dropdown-item-desc">Compatible con EA 15 / XMI 2.1</span>
                    </div>
                  </button>
                )}

                <button
                  role="menuitem"
                  className="uml-dropdown-item"
                  aria-label="Descargar copia JSON"
                  disabled={loading || Boolean(loadError)}
                  onClick={() => {
                    setIsModelMenuOpen(false);
                    download();
                  }}
                  title="Descargar copia JSON del diagrama"
                >
                  <Download size={16} />
                  <div className="uml-dropdown-item-text">
                    <span className="uml-dropdown-item-title">Descargar JSON</span>
                    <span className="uml-dropdown-item-desc">Copia cruda del AST local</span>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="uml-header-divider" aria-hidden="true" />

        {/* Clúster de utilidades (Iconos compactos) */}
        <div className="uml-utility-cluster">
          <button
            className={`uml-icon-btn uml-voice-btn ${isVoiceWidgetOpen ? 'is-active' : ''}`}
            aria-label="Comandos por voz e IA (Atajo: tecla V)"
            title="Comandos por voz e IA (Atajo: tecla V)"
            disabled={!effectiveCanEdit}
            onClick={() => setIsVoiceWidgetOpen((prev) => !prev)}
          >
            <Mic size={18} />
          </button>

          {sesionId ? (
            <button
              className="uml-icon-btn uml-chat-btn"
              aria-label={isChatOpen ? "Cerrar chat de sesión" : "Abrir chat de sesión"}
              title="Chat de la sesión"
              onClick={toggleChatOpen}
            >
              <MessageSquare size={17} />
              {unreadChatCount > 0 && !isChatOpen ? (
                <span className="uml-chat-badge-count">{unreadChatCount}</span>
              ) : null}
            </button>
          ) : null}

          {sesionId && isHost ? (
            <button
              className="uml-icon-btn uml-participants-btn"
              aria-label="Administrar colaboradores"
              title="Administrar colaboradores"
              onClick={() => setIsParticipantsOpen(true)}
            >
              <Users size={17} />
            </button>
          ) : null}

          <button
            className="uml-icon-btn uml-theme-btn"
            aria-label={canvasTheme === 'dark' ? 'Cambiar a lienzo claro (Estilo StarUML)' : 'Cambiar a lienzo oscuro'}
            title={canvasTheme === 'dark' ? 'Lienzo claro (Estilo StarUML)' : 'Lienzo oscuro'}
            onClick={() => setCanvasTheme(t => t === 'dark' ? 'light' : 'dark')}
          >
            {canvasTheme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
        </div>

        <div className="uml-header-divider" aria-hidden="true" />

        {/* Estado y Guardado */}
        <div className="uml-save-cluster">
          <span
            className="uml-status-text"
            role="status"
            title={loading ? 'Cargando…' : !effectiveCanEdit ? 'Solo lectura' : saving ? 'Guardando…' : dirty ? 'Cambios sin guardar' : sesionId ? 'Guardado · v' + version : 'Sin persistencia'}
          >
            {loading ? 'Cargando…' : !effectiveCanEdit ? 'Solo lectura' : saving ? 'Guardando…' : dirty ? 'Cambios sin guardar' : sesionId ? 'Guardado · v' + version : 'v' + version}
          </span>
          <button
            className="uml-primary uml-save-btn"
            aria-label="Guardar diagrama"
            title={sesionId ? 'Guardar (Ctrl+S)' : 'La demo no guarda en el servidor'}
            disabled={!sesionId || !effectiveCanEdit || loading || Boolean(loadError) || saving || !dirty}
            onClick={() => void save()}
          >
            <Save size={16} />
            <span>Guardar</span>
          </button>
        </div>

        {storedSession?.user ? (
          <div className="uml-current-user-badge" title={`Conectado como ${storedSession.user.nombre} (${selfPresence?.role === 'ANFITRION' || storedSession.user.rol === 'ANFITRION' ? 'Anfitrión' : 'Colaborador'})`}>
            <span className="uml-current-user-dot" style={{ backgroundColor: selfPresence?.color || '#22D3A0' }} />
            <div className="uml-current-user-meta">
              <span className="uml-current-user-name">{storedSession.user.nombre} <span className="uml-current-user-you">(Tú)</span></span>
              <span className="uml-current-user-role">{selfPresence?.role === 'ANFITRION' || storedSession.user.rol === 'ANFITRION' ? 'Anfitrión' : 'Colaborador'}</span>
            </div>
          </div>
        ) : null}
      </div>
    </header>
    {loading ? <main className="uml-loading" role="status">Cargando tu diagrama…<div /><div /><div /></main> : loadError ? <main className="uml-load-error"><h2>No pudimos abrir el diagrama</h2><p role="alert">{loadError}</p><button onClick={() => setAttempt(a => a + 1)}>Reintentar</button></main> : <>
      {realtimeError ? <div className="uml-live-notice is-error" role="alert"><span>{realtimeError}</span><button onClick={() => setRealtimeError('')}>Cerrar</button></div> : null}
      {sesionId && realtimeStatus === 'offline' && !realtimeError ? <div className="uml-live-notice" role="status">Colaboración sin conexión. Tus cambios quedan locales hasta reconectar.</div> : null}
      {conflictNotice ? <div className="uml-live-notice is-conflict" role="status"><span>{conflictNotice}</span><button onClick={() => setConflictNotice('')}>Entendido</button></div> : null}
      {permissionNotice ? <div className="uml-live-notice is-conflict" role="status"><span>{permissionNotice}</span><button onClick={() => setPermissionNotice('')}>Entendido</button></div> : null}
      {voiceNotice ? <div className="uml-live-notice" role="status"><span>{voiceNotice}</span><button onClick={() => setVoiceNotice('')}>Entendido</button></div> : null}
      {xmiNotice ? <div className={`uml-live-notice${xmiNotice.error ? ' is-error' : ' is-xmi'}`} role={xmiNotice.error ? 'alert' : 'status'}><span>{xmiNotice.message}</span><button onClick={() => setXmiNotice(null)}>Cerrar</button></div> : null}
      {error ? <div className="uml-error" role="alert"><span>{error}</span><button onClick={download}>Descargar mis cambios</button><button onClick={() => { if (window.confirm('Recargar descartará los cambios locales. Descarga una copia antes de continuar.')) setAttempt(a => a + 1); }}>Recargar</button></div> : null}
      {draft ? <div className="uml-draft" role="status"><span>Hay un borrador local sin guardar (v{draft.version}).</span><button disabled={!effectiveCanEdit} onClick={() => { useDiagramStore.getState().setDiagram(draft); useDiagramStore.setState({ isDirty: true, revision: 1 }); setDraft(null); }}>Restaurar borrador</button><button onClick={() => { try { sessionStorage.removeItem(draftKey); } catch { /* Storage may be unavailable. */ } setDraft(null); }}>Descartar borrador</button></div> : null}
      {draftWarning ? <p className="uml-error" role="alert">{draftWarning}</p> : null}
      <div className="uml-main">
        <UMLToolbox 
          editable={effectiveCanEdit} 
          connecting={connecting || Boolean(sourceId)} 
          type={type} 
          onAdd={addClass} 
          onSelect={selectMode}
          onConnect={(t) => { setType(t); setConnecting(true); useDiagramStore.getState().startConnecting(null); }} 
        />
        <main className="uml-canvas-area" ref={canvasArea} data-canvas-theme={canvasTheme} aria-label="Editor de diagrama">
          <Suspense fallback={<p role="status">Preparando lienzo…</p>}><UMLCanvas editable={effectiveCanEdit} connecting={connecting} relationshipType={type} view={view} setView={setView} canvasTheme={canvasTheme} onConnected={selectMode} onCursorMove={(x, y) => liveClient.current?.moveCursor(x, y)} /></Suspense>
          
          {sesionId ? (
            <SessionChatDrawer
              isOpen={isChatOpen}
              onClose={() => useChatStore.getState().setIsOpen(false)}
              onSendMessage={handleSendChatMessage}
              onClearChat={isHost ? handleClearChat : undefined}
              currentUserId={storedSession?.user.id}
              currentUserName={storedSession?.user.nombre}
              isHost={isHost}
              presenceUsers={presenceUsers}
            />
          ) : null}

          <div className="uml-zoom-controls">
            <button aria-label="Alejar" onClick={() => setView(v => { const scale = Math.max(.25, v.scale / 1.2); const w = (canvasArea.current?.clientWidth || 600) / 2; const h = (canvasArea.current?.clientHeight || 400) / 2; return { scale, x: w - (w - v.x) / v.scale * scale, y: h - (h - v.y) / v.scale * scale }; })} disabled={view.scale <= .25}><ZoomOut size={16} /></button>
            <button aria-label="Restablecer zoom" onClick={() => setView(v => { const w = (canvasArea.current?.clientWidth || 600) / 2; const h = (canvasArea.current?.clientHeight || 400) / 2; return { scale: 1, x: w - (w - v.x) / v.scale, y: h - (h - v.y) / v.scale }; })}>{Math.round(view.scale * 100)}%</button>
            <button aria-label="Acercar" onClick={() => setView(v => { const scale = Math.min(2.5, v.scale * 1.2); const w = (canvasArea.current?.clientWidth || 600) / 2; const h = (canvasArea.current?.clientHeight || 400) / 2; return { scale, x: w - (w - v.x) / v.scale * scale, y: h - (h - v.y) / v.scale * scale }; })} disabled={view.scale >= 2.5}><ZoomIn size={16} /></button>
          </div>

          {!hasClasses ? <div className="uml-empty"><h2>Empieza con una clase</h2><p>Crea una clase, define sus atributos y conéctala con otras para construir tu modelo.</p>{effectiveCanEdit ? <button onClick={() => addClass(false)}>Crear primera clase</button> : null}</div> : null}
          {connecting || sourceId ? <div className="uml-connection-hint" role="status">{sourceId ? 'Selecciona la clase destino' : 'Selecciona la clase origen'}<button onClick={selectMode}>Cancelar</button></div> : null}
          
          <button 
            className="uml-properties-toggle" 
            aria-label={isPropertiesExpanded ? 'Ocultar panel de propiedades' : 'Mostrar panel de propiedades'}
            onClick={() => setIsPropertiesExpanded(!isPropertiesExpanded)}
          >
            {isPropertiesExpanded ? <PanelRightClose size={24} /> : <PanelRightOpen size={24} />}
          </button>
        </main>
        <ElementPropertyPanel isExpanded={isPropertiesExpanded} editable={effectiveCanEdit} connecting={connecting} type={type} onConnected={selectMode} onFocusClass={id => {
          const cls = useDiagramStore.getState().classes.find(c => c.id === id); if (!cls) return; const size = classSize(cls);
          setView(v => ({ ...v, x: (canvasArea.current?.clientWidth || 600) / 2 - (cls.position.x + size.width / 2) * v.scale,
            y: (canvasArea.current?.clientHeight || 400) / 2 - (cls.position.y + size.height / 2) * v.scale }));
        }} />
      </div>
      <footer className="uml-footer"><span>{classesCount} clases · {relationshipsCount} relaciones</span><span>{sesionId ? 'Arrastra el fondo para desplazarte · Rueda para zoom' : 'Demostración local · Descarga una copia para conservar tus cambios'}</span><span>UML 2.5</span></footer>
    </>}
    {sesionId && isHost && isParticipantsOpen ? <Suspense fallback={null}><ManageParticipantsModal sessionId={sesionId} presenceUsers={presenceUsers} onClose={() => setIsParticipantsOpen(false)} /></Suspense> : null}
    {sesionId && isHost && isXmiImportOpen ? <Suspense fallback={null}><ImportXmiModal sessionId={sesionId} expectedVersion={version} hasExistingDiagram={hasClasses} onImported={handleXmiImported} onClose={() => setIsXmiImportOpen(false)} /></Suspense> : null}
    {isPhotoImportOpen ? (
      <Suspense fallback={null}>
        <ImportPhotoModal
          hasExistingDiagram={hasClasses}
          onImported={handlePhotoDiagramImported}
          onClose={() => setIsPhotoImportOpen(false)}
        />
      </Suspense>
    ) : null}
    {isDataModelOpen ? (
      <Suspense fallback={null}>
        <DataModelModal
          isOpen={isDataModelOpen}
          onClose={() => setIsDataModelOpen(false)}
          ast={{
            version: useDiagramStore.getState().version,
            nombre: info.proyectoNombre,
            classes: useDiagramStore.getState().classes,
            relationships: useDiagramStore.getState().relationships,
          }}
          sessionId={sesionId}
        />
      </Suspense>
    ) : null}
    <VoiceCommandWidget
      isOpen={isVoiceWidgetOpen}
      onClose={() => setIsVoiceWidgetOpen(false)}
      onExecuteAction={handleExecuteVoiceAction}
      existingClasses={useDiagramStore.getState().classes.map(c => c.name)}
      canEdit={effectiveCanEdit}
    />
    <ValidationReportDrawer
      isOpen={isValidationOpen}
      onClose={() => setIsValidationOpen(false)}
      report={validationReport}
      isValidating={isValidating}
      onRevalidate={runValidation}
      onFocusElement={handleFocusDiagnosticElement}
    />
  </div>;
}
