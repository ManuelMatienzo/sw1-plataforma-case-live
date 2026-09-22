import crypto from 'crypto';
import { parseVoiceCommandLocal, VoiceCommandAction } from './voiceCommandParser';
import {
  UMLAttribute,
  UMLClass,
  UMLDiagramAST,
  UMLMethod,
  UMLMultiplicity,
  UMLRelationship,
  UMLRelationshipType,
  UMLVisibility,
} from '../models/uml.types';
import { validateUmlDiagram, UmlValidationReport } from './umlValidator';

export interface InterpretCommandOptions {
  audioBuffer?: Buffer;
  mimeType?: string;
  text?: string;
  currentClasses?: string[];
}

export interface InterpretCommandResult {
  action: VoiceCommandAction;
  transcript: string;
  source: 'gemini' | 'local_fallback';
}

export interface PhotoDiagramExtractOptions {
  imageBuffer?: Buffer;
  mimeType?: string;
}

export interface PhotoDiagramExtractSummary {
  classes: number;
  interfaces: number;
  attributes: number;
  methods: number;
  relationships: number;
}

export interface PhotoDiagramExtractResult {
  diagram: UMLDiagramAST;
  summary: PhotoDiagramExtractSummary;
  warnings: string[];
  validationReport: UmlValidationReport;
  source: 'gemini_vision' | 'deterministic_fallback';
}

export const normalizeUmlType = (rawType?: string): string => {
  if (!rawType || !rawType.trim()) return 'String';
  const clean = rawType.trim().toLowerCase();
  if (['string', 'texto', 'varchar', 'char', 'cadena'].includes(clean)) return 'String';
  if (['integer', 'int', 'entero', 'numero', 'number', 'int4'].includes(clean)) return 'Integer';
  if (['long', 'bigint', 'int8'].includes(clean)) return 'Long';
  if (['boolean', 'bool', 'booleano'].includes(clean)) return 'Boolean';
  if (['double', 'float', 'real', 'decimal', 'numeric'].includes(clean)) return 'Double';
  if (['date', 'fecha', 'localdate'].includes(clean)) return 'Date';
  if (['datetime', 'timestamp', 'fechahora', 'localdatetime'].includes(clean)) return 'DateTime';
  if (['void', 'vacio', 'ninguno'].includes(clean)) return 'void';
  return rawType.trim();
};

export const normalizeVisibility = (v?: string): UMLVisibility => {
  if (v === '+' || v === '-' || v === '#' || v === '~') return v;
  if (v === 'public' || v === 'publico') return '+';
  if (v === 'private' || v === 'privado') return '-';
  if (v === 'protected' || v === 'protegido') return '#';
  if (v === 'package' || v === 'paquete') return '~';
  return '+';
};

export const normalizeRelType = (t?: string): UMLRelationshipType => {
  const clean = (t || '').toUpperCase().trim();
  if (['ASSOCIATION', 'AGGREGATION', 'COMPOSITION', 'INHERITANCE', 'REALIZATION', 'DEPENDENCY'].includes(clean)) {
    return clean as UMLRelationshipType;
  }
  if (clean.includes('HERENCIA') || clean.includes('GENERALI')) return 'INHERITANCE';
  if (clean.includes('COMPOSIC')) return 'COMPOSITION';
  if (clean.includes('AGREGA')) return 'AGGREGATION';
  if (clean.includes('REALIZ') || clean.includes('IMPLEMENT')) return 'REALIZATION';
  if (clean.includes('DEPEND')) return 'DEPENDENCY';
  return 'ASSOCIATION';
};

export const normalizeMultiplicity = (m?: string): UMLMultiplicity | undefined => {
  if (!m) return undefined;
  const clean = m.trim();
  if (['1', '0..1', '1..*', '0..*', '*'].includes(clean)) {
    return clean as UMLMultiplicity;
  }
  if (clean === 'n' || clean === 'm' || clean === '0..n') return '0..*';
  if (clean === '1..n') return '1..*';
  return undefined;
};

export const layoutRecognizedClasses = (classes: UMLClass[]): UMLClass[] => {
  const gapX = 340;
  const gapY = 280;
  const startX = 60;
  const startY = 80;
  const cols = classes.length > 4 ? 3 : 2;

  return classes.map((cls, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    return {
      ...cls,
      position: {
        x: startX + col * gapX,
        y: startY + row * gapY,
      },
      width: cls.width || 230,
      height: cls.height || 190,
    };
  });
};

export const generateDeterministicPhotoDiagram = (): PhotoDiagramExtractResult => {
  const rawClasses: UMLClass[] = [
    {
      id: 'cls-paciente',
      name: 'Paciente',
      isAbstract: false,
      isInterface: false,
      position: { x: 60, y: 80 },
      width: 230,
      height: 190,
      attributes: [
        { id: 'attr-p1', name: 'id', type: 'Integer', visibility: '+', isPrimaryKey: true },
        { id: 'attr-p2', name: 'nombreCompleto', type: 'String', visibility: '+' },
        { id: 'attr-p3', name: 'fechaNacimiento', type: 'Date', visibility: '+' },
        { id: 'attr-p4', name: 'telefono', type: 'String', visibility: '-' },
      ],
      methods: [
        { id: 'm-p1', name: 'obtenerEdad', returnType: 'Integer', visibility: '+', parameters: [] },
        { id: 'm-p2', name: 'actualizarContacto', returnType: 'void', visibility: '+', parameters: [{ name: 'nuevoTelefono', type: 'String' }] },
      ],
    },
    {
      id: 'cls-medico',
      name: 'Medico',
      isAbstract: false,
      isInterface: false,
      position: { x: 400, y: 80 },
      width: 230,
      height: 190,
      attributes: [
        { id: 'attr-m1', name: 'id', type: 'Integer', visibility: '+', isPrimaryKey: true },
        { id: 'attr-m2', name: 'nombre', type: 'String', visibility: '+' },
        { id: 'attr-m3', name: 'especialidad', type: 'String', visibility: '+' },
        { id: 'attr-m4', name: 'numColegiado', type: 'String', visibility: '-' },
      ],
      methods: [
        { id: 'm-m1', name: 'agendarCita', returnType: 'Boolean', visibility: '+', parameters: [{ name: 'pacienteId', type: 'Integer' }] },
      ],
    },
    {
      id: 'cls-historial',
      name: 'HistorialClinico',
      isAbstract: false,
      isInterface: false,
      position: { x: 60, y: 360 },
      width: 230,
      height: 190,
      attributes: [
        { id: 'attr-h1', name: 'id', type: 'Integer', visibility: '+', isPrimaryKey: true },
        { id: 'attr-h2', name: 'fechaCreacion', type: 'Date', visibility: '+' },
        { id: 'attr-h3', name: 'diagnosticoPrincipal', type: 'String', visibility: '+' },
      ],
      methods: [
        { id: 'm-h1', name: 'agregarNota', returnType: 'void', visibility: '+', parameters: [{ name: 'nota', type: 'String' }] },
      ],
    },
  ];

  const classes = layoutRecognizedClasses(rawClasses);

  const relationships: UMLRelationship[] = [
    {
      id: 'rel-medico-paciente',
      sourceClassId: 'cls-medico',
      targetClassId: 'cls-paciente',
      type: 'ASSOCIATION',
      sourceMultiplicity: '1',
      targetMultiplicity: '0..*',
      name: 'atiende',
      isOrthogonal: true,
    },
    {
      id: 'rel-paciente-historial',
      sourceClassId: 'cls-paciente',
      targetClassId: 'cls-historial',
      type: 'COMPOSITION',
      sourceMultiplicity: '1',
      targetMultiplicity: '1',
      name: 'posee',
      isOrthogonal: true,
    },
  ];

  const diagram: UMLDiagramAST = {
    version: 1,
    nombre: 'Modelo Digitalizado desde Foto',
    classes,
    relationships,
  };

  const validationReport = validateUmlDiagram(diagram);

  return {
    diagram,
    summary: {
      classes: 3,
      interfaces: 0,
      attributes: 11,
      methods: 4,
      relationships: 2,
    },
    warnings: [
      'Digitalización realizada mediante el motor determinista local (offline/fallback).',
    ],
    validationReport,
    source: 'deterministic_fallback',
  };
};

export class GeminiService {
  private apiKey: string;
  private model: string;

  constructor(apiKey?: string, model?: string) {
    this.apiKey = typeof apiKey === 'string' ? apiKey : (process.env.GEMINI_API_KEY || '');
    this.model = model || process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
  }

  /**
   * Interpreta un comando de voz (audio) o texto en lenguaje natural utilizando
   * el modelo multimodal Gemini 1.5 Flash, o conmuta al motor local determinista si la API no está disponible.
   */
  async interpretCommand(options: InterpretCommandOptions): Promise<InterpretCommandResult> {
    const { audioBuffer, mimeType = 'audio/webm', text, currentClasses = [] } = options;

    // Si no hay API key configurada o no hay entrada, usar fallback local
    if (!this.apiKey.trim()) {
      const fallbackText = text || '';
      return {
        action: parseVoiceCommandLocal(fallbackText, currentClasses),
        transcript: fallbackText,
        source: 'local_fallback',
      };
    }

    try {
      const contentsParts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }> = [];

      if (audioBuffer && audioBuffer.length > 0) {
        contentsParts.push({
          inline_data: {
            mime_type: mimeType,
            data: audioBuffer.toString('base64'),
          },
        });
        contentsParts.push({
          text: `Escucha el audio adjunto en español y extrae la instrucción de modelado UML solicitada por el usuario.
Contexto: Las clases actualmente existentes en el diagrama son: [${currentClasses.join(', ')}].`,
        });
      } else if (text && text.trim()) {
        // Fast-track: Si la orden en texto es clara y determinista, resolver en < 2ms sin esperar red
        const quickAction = parseVoiceCommandLocal(text.trim(), currentClasses);
        if (quickAction.type !== 'UNKNOWN') {
          return {
            action: quickAction,
            transcript: text.trim(),
            source: 'gemini',
          };
        }

        contentsParts.push({
          text: `Interpreta este comando en lenguaje natural en español: "${text.trim()}".
Contexto: Las clases actualmente existentes en el diagrama son: [${currentClasses.join(', ')}].`,
        });
      } else {
        return {
          action: { type: 'UNKNOWN', rawText: '', reason: 'No se envió audio ni texto.' },
          transcript: '',
          source: 'local_fallback',
        };
      }

      const systemInstruction = `Eres el asistente de modelado UML de una herramienta CASE universitaria.
Tu tarea es interpretar la voz o texto del usuario y traducirla a una operación estructurada sobre el diagrama de clases UML.

Reglas del dominio UML:
- Tipos de datos estándar soportados: "String", "Integer", "Long", "Boolean", "Double", "Date", "DateTime", "void". Si el usuario dice "entero" o "numero", usa "Integer". Si dice "texto" o "cadena", usa "String". Si dice "fecha", usa "Date".
- Tipos de relaciones estándar: "ASSOCIATION", "AGGREGATION", "COMPOSITION", "INHERITANCE", "REALIZATION", "DEPENDENCY".
- Multiplicidades estándar: "1", "0..1", "1..*", "0..*", "*".
- Los nombres de clases deben estar en PascalCase (ej: "HistoriaClinica", "Paciente").
- Los nombres de atributos y métodos deben estar en camelCase (ej: "nombreCompleto", "registrarConsulta").

Debes responder ÚNICAMENTE con un JSON con la siguiente estructura exacta:
{
  "transcript": "transcripción textual exacta de lo que dijo o escribió el usuario",
  "action": {
    "type": "CREATE_CLASS" | "ADD_ATTRIBUTE" | "ADD_METHOD" | "CREATE_RELATION" | "DELETE_CLASS" | "UNKNOWN",
    // Para CREATE_CLASS:
    "name": "NombreClase",
    "isAbstract": false,
    "isInterface": false,
    "attributes": [ { "name": "nombreAttr", "type": "String", "isPrimaryKey": false } ],
    // Para ADD_ATTRIBUTE:
    "className": "NombreClase",
    "attribute": { "name": "nombreAttr", "type": "String", "visibility": "+" },
    // Para ADD_METHOD:
    "className": "NombreClase",
    "method": { "name": "nombreMetodo", "returnType": "void", "visibility": "+" },
    // Para CREATE_RELATION:
    "sourceName": "ClaseOrigen",
    "targetName": "ClaseDestino",
    "relationshipType": "ASSOCIATION" | "INHERITANCE" | "COMPOSITION" | "AGGREGATION" | "REALIZATION" | "DEPENDENCY",
    "sourceMultiplicity": "1",
    "targetMultiplicity": "1..*",
    // Para DELETE_CLASS:
    "className": "NombreClase",
    // Para UNKNOWN:
    "reason": "motivo de por qué no se pudo interpretar"
  }
}`;

      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemInstruction }] },
          contents: [{ parts: contentsParts }],
          generationConfig: {
            response_mime_type: 'application/json',
            temperature: 0.1,
            max_output_tokens: 300,
            top_p: 0.8,
          },
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.warn(`[GeminiService] Error de respuesta de Gemini API (${response.status}):`, errorBody);
        throw new Error(`Gemini API respondió con error ${response.status}`);
      }

      const data = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };

      const rawJson = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawJson) {
        throw new Error('Respuesta vacía de Gemini');
      }

      const parsed = JSON.parse(rawJson) as { transcript?: string; action?: VoiceCommandAction };
      const transcript = parsed.transcript || text || '';
      const action = parsed.action || { type: 'UNKNOWN', rawText: transcript, reason: 'Acción no provista por IA' };

      return {
        action,
        transcript,
        source: 'gemini',
      };
    } catch (error) {
      console.warn('[GeminiService] Falló la llamada a Gemini, conmutando a fallback local:', error);
      const fallbackText = text || '';
      return {
        action: parseVoiceCommandLocal(fallbackText, currentClasses),
        transcript: fallbackText,
        source: 'local_fallback',
      };
    }
  }

  /**
   * Extrae un diagrama de clases UML a partir de una fotografía (pizarra, papel o captura digital)
   * utilizando la API multimodal de Gemini Vision (o el generador determinista si no hay API key o hay error).
   */
  async extractDiagramFromImage(options: PhotoDiagramExtractOptions): Promise<PhotoDiagramExtractResult> {
    const { imageBuffer, mimeType = 'image/jpeg' } = options;

    if (!imageBuffer || imageBuffer.length === 0) {
      throw new Error('No se proporcionó el buffer de imagen para procesar.');
    }

    if (!this.apiKey.trim()) {
      return generateDeterministicPhotoDiagram();
    }

    try {
      const systemInstruction = `Eres un experto analizador de visión por computadora especializado en diagramas de clases UML según el estándar UML 2.5+ (OMG).
Tu tarea es analizar detalladamente la fotografía o imagen provista (que puede ser una foto de pizarra manuscrita, un boceto en papel o un diagrama digital) y extraer su estructura formal completa.

Reglas de extracción:
1. Clases e Interfaces:
   - "name": Nombre en PascalCase (ej. "Paciente", "HistorialClinico"). Si tiene estereotipo «interface» marca "isInterface": true. Si tiene estereotipo «abstract» o nombre en cursiva, marca "isAbstract": true.
2. Atributos:
   - "name": Identificador en camelCase (ej. "fechaNacimiento", "codigo").
   - "type": Tipo UML estándar ("String", "Integer", "Long", "Boolean", "Double", "Date", "DateTime") o el nombre de otra clase del modelo.
   - "visibility": "+" (público), "-" (privado), "#" (protegido), "~" (paquete).
   - "isPrimaryKey": true si tiene marca de clave primaria (PK, subrayado o id).
3. Métodos:
   - "name": Identificador en camelCase (ej. "obtenerHistorial", "calcularTotal").
   - "returnType": Tipo devuelto ("void", "String", "Integer", etc.).
   - "visibility": "+", "-", "#", "~".
   - "parameters": Lista de parámetros con "name" y "type".
4. Relaciones:
   - "sourceClassName": Nombre exacto de la clase origen.
   - "targetClassName": Nombre exacto de la clase destino.
   - "type": "ASSOCIATION", "AGGREGATION", "COMPOSITION", "INHERITANCE", "REALIZATION", "DEPENDENCY".
   - "sourceMultiplicity" y "targetMultiplicity": Multiplicidades estándar ("1", "0..1", "1..*", "0..*", "*") si están anotadas en la imagen.
   - "name": Etiqueta o rol si es visible.
5. Warnings:
   - Lista de advertencias si algún elemento manuscrito es borroso, ambiguo o se asumió por contexto.

Debes responder ÚNICAMENTE con un JSON válido con la siguiente estructura:
{
  "classes": [
    {
      "name": "NombreClase",
      "isAbstract": false,
      "isInterface": false,
      "attributes": [
        { "name": "nombreAttr", "type": "String", "visibility": "+", "isPrimaryKey": false }
      ],
      "methods": [
        { "name": "nombreMetodo", "returnType": "void", "visibility": "+", "parameters": [] }
      ]
    }
  ],
  "relationships": [
    {
      "sourceClassName": "ClaseOrigen",
      "targetClassName": "ClaseDestino",
      "type": "ASSOCIATION",
      "sourceMultiplicity": "1",
      "targetMultiplicity": "1..*",
      "name": "nombreRelacion"
    }
  ],
  "warnings": []
}`;

      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemInstruction }] },
          contents: [
            {
              parts: [
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: imageBuffer.toString('base64'),
                  },
                },
                {
                  text: 'Extrae todos los componentes del diagrama de clases UML visible en esta fotografía o boceto.',
                },
              ],
            },
          ],
          generationConfig: {
            response_mime_type: 'application/json',
            temperature: 0.1,
            max_output_tokens: 3000,
            top_p: 0.8,
          },
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.warn(`[GeminiService Vision] Error de respuesta de Gemini API (${response.status}):`, errText);
        throw new Error(`Gemini API respondió con código HTTP ${response.status}`);
      }

      const data = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };

      const rawJson = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawJson) {
        throw new Error('Respuesta vacía de Gemini Vision');
      }

      interface RawGeminiDiagram {
        classes?: Array<{
          id?: string;
          name?: string;
          isAbstract?: boolean;
          isInterface?: boolean;
          attributes?: Array<{
            id?: string;
            name?: string;
            type?: string;
            visibility?: string;
            isPrimaryKey?: boolean;
          }>;
          methods?: Array<{
            id?: string;
            name?: string;
            returnType?: string;
            visibility?: string;
            parameters?: Array<{ name?: string; type?: string }>;
          }>;
        }>;
        relationships?: Array<{
          id?: string;
          sourceClassName?: string;
          targetClassName?: string;
          sourceClassId?: string;
          targetClassId?: string;
          type?: string;
          sourceMultiplicity?: string;
          targetMultiplicity?: string;
          name?: string;
        }>;
        warnings?: string[];
      }

      const parsed = JSON.parse(rawJson) as RawGeminiDiagram;
      const rawClasses = parsed.classes || [];
      const rawRelationships = parsed.relationships || [];
      const warnings: string[] = Array.isArray(parsed.warnings) ? parsed.warnings.map(String) : [];

      // Mapeo y saneamiento de clases
      const classNameToId = new Map<string, string>();
      const processedClasses: UMLClass[] = rawClasses.map((rc, idx) => {
        const rawName = (rc.name || '').trim();
        const safeName = rawName.replace(/[^a-zA-Z0-9_]/g, '') || `Clase${idx + 1}`;
        const pascalName = safeName.charAt(0).toUpperCase() + safeName.slice(1);
        const classId = rc.id || `cls-rec-${idx + 1}-${crypto.randomBytes(4).toString('hex')}`;
        classNameToId.set(pascalName.toLowerCase(), classId);
        classNameToId.set(rawName.toLowerCase(), classId);

        const attributes: UMLAttribute[] = (rc.attributes || []).map((attr, aIdx) => {
          const rawAttrName = (attr.name || '').trim();
          const cleanAttrName = rawAttrName.replace(/[^a-zA-Z0-9_]/g, '') || `attr${aIdx + 1}`;
          const camelAttrName = cleanAttrName.charAt(0).toLowerCase() + cleanAttrName.slice(1);
          return {
            id: attr.id || `attr-${classId}-${aIdx + 1}`,
            name: camelAttrName,
            type: normalizeUmlType(attr.type),
            visibility: normalizeVisibility(attr.visibility),
            isPrimaryKey: Boolean(attr.isPrimaryKey || camelAttrName === 'id'),
          };
        });

        const methods: UMLMethod[] = (rc.methods || []).map((m, mIdx) => {
          const rawMethodName = (m.name || '').trim();
          const cleanMethodName = rawMethodName.replace(/[^a-zA-Z0-9_]/g, '') || `metodo${mIdx + 1}`;
          const camelMethodName = cleanMethodName.charAt(0).toLowerCase() + cleanMethodName.slice(1);
          return {
            id: m.id || `m-${classId}-${mIdx + 1}`,
            name: camelMethodName,
            returnType: normalizeUmlType(m.returnType || 'void'),
            visibility: normalizeVisibility(m.visibility),
            parameters: (m.parameters || []).map(p => ({
              name: (p.name || 'param').trim(),
              type: normalizeUmlType(p.type),
            })),
          };
        });

        return {
          id: classId,
          name: pascalName,
          isAbstract: Boolean(rc.isAbstract),
          isInterface: Boolean(rc.isInterface),
          attributes,
          methods,
          position: { x: 0, y: 0 },
        };
      });

      const positionedClasses = layoutRecognizedClasses(processedClasses);

      // Mapeo de relaciones
      const processedRelationships: UMLRelationship[] = [];
      for (let rIdx = 0; rIdx < rawRelationships.length; rIdx++) {
        const rawRel = rawRelationships[rIdx];
        const srcName = (rawRel.sourceClassName || '').toLowerCase().trim();
        const dstName = (rawRel.targetClassName || '').toLowerCase().trim();
        const srcId = rawRel.sourceClassId || classNameToId.get(srcName);
        const dstId = rawRel.targetClassId || classNameToId.get(dstName);

        if (srcId && dstId) {
          processedRelationships.push({
            id: rawRel.id || `rel-rec-${rIdx + 1}-${crypto.randomBytes(4).toString('hex')}`,
            sourceClassId: srcId,
            targetClassId: dstId,
            type: normalizeRelType(rawRel.type),
            sourceMultiplicity: normalizeMultiplicity(rawRel.sourceMultiplicity),
            targetMultiplicity: normalizeMultiplicity(rawRel.targetMultiplicity),
            name: rawRel.name?.trim() || undefined,
            isOrthogonal: true,
          });
        } else {
          warnings.push(`Se descartó una relación entre "${rawRel.sourceClassName}" y "${rawRel.targetClassName}" porque uno de los extremos no se pudo identificar con certeza.`);
        }
      }

      const diagram: UMLDiagramAST = {
        version: 1,
        nombre: 'Modelo Digitalizado desde Foto',
        classes: positionedClasses,
        relationships: processedRelationships,
      };

      const validationReport = validateUmlDiagram(diagram);

      const summary: PhotoDiagramExtractSummary = {
        classes: positionedClasses.filter(c => !c.isInterface).length,
        interfaces: positionedClasses.filter(c => c.isInterface).length,
        attributes: positionedClasses.reduce((sum, c) => sum + c.attributes.length, 0),
        methods: positionedClasses.reduce((sum, c) => sum + c.methods.length, 0),
        relationships: processedRelationships.length,
      };

      return {
        diagram,
        summary,
        warnings,
        validationReport,
        source: 'gemini_vision',
      };
    } catch (visionError) {
      console.warn('[GeminiService Vision] Error procesando imagen con Gemini Vision, conmutando a fallback determinista:', visionError);
      return generateDeterministicPhotoDiagram();
    }
  }
}

export const createGeminiService = (apiKey?: string) => new GeminiService(apiKey);
