import crypto from 'crypto';
import {
  UMLAttribute,
  UMLClass,
  UMLDiagramAST,
  UMLMethod,
  UMLRelationship,
} from '../models/uml.types';
import { validateUmlDiagram, UmlValidationReport } from './umlValidator';
import {
  layoutRecognizedClasses,
  normalizeMultiplicity,
  normalizeRelType,
  normalizeUmlType,
  normalizeVisibility,
  PhotoDiagramExtractResult,
  PhotoDiagramExtractSummary,
} from './geminiService';

export interface GroqVisionExtractOptions {
  imageBuffer: Buffer;
  mimeType?: string;
  apiKey?: string;
  model?: string;
}

export interface RawUmlClassJson {
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
}

export interface RawUmlRelationshipJson {
  id?: string;
  sourceClassName?: string;
  targetClassName?: string;
  sourceClassId?: string;
  targetClassId?: string;
  type?: string;
  sourceMultiplicity?: string;
  targetMultiplicity?: string;
  name?: string;
}

export interface RawUmlDiagramJson {
  classes?: RawUmlClassJson[];
  relationships?: RawUmlRelationshipJson[];
  warnings?: string[];
}

export class GroqVisionService {
  private apiKey: string;
  private model: string;

  constructor(apiKey?: string, model?: string) {
    this.apiKey = typeof apiKey === 'string' ? apiKey : (process.env.GROQ_API_KEY || '');
    this.model = model || process.env.GROQ_MODEL || 'qwen/qwen3.8-27b';
  }

  /**
   * Extrae un diagrama de clases UML a partir de una fotografía o boceto
   * utilizando la API multimodal de Groq Cloud (ultra baja latencia).
   */
  async extractDiagramFromImage(options: GroqVisionExtractOptions): Promise<PhotoDiagramExtractResult> {
    const { imageBuffer, mimeType = 'image/jpeg' } = options;
    const effectiveApiKey = (options.apiKey && options.apiKey.trim()) || this.apiKey.trim();
    const effectiveModel = (options.model && options.model.trim()) || this.model;

    if (!imageBuffer || imageBuffer.length === 0) {
      throw new Error('No se proporcionó el buffer de imagen para procesar con Groq.');
    }

    if (!effectiveApiKey) {
      throw new Error('No se ha configurado la API Key de Groq Cloud (GROQ_API_KEY).');
    }

    const systemPrompt = `Eres un experto analizador de visión por computadora especializado en diagramas de clases UML según el estándar UML 2.5 (OMG).
Tu tarea es analizar la fotografía o boceto manuscrito y extraer el diagrama de clases en formato JSON estricto:
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
      "targetMultiplicity": "0..*",
      "name": "nombreRelacion"
    }
  ],
  "warnings": []
}

Reglas:
1. Clases en PascalCase ("Cliente", "Pedido", "Producto").
2. Atributos en camelCase ("id", "nombre", "precioUnitario"). Tipos válidos: "String", "Integer", "Long", "Double", "Boolean", "Date", "DateTime", "void".
3. Métodos en camelCase ("calcularTotal", "registrar").
4. Relaciones admitidas: "ASSOCIATION", "COMPOSITION", "AGGREGATION", "INHERITANCE", "REALIZATION", "DEPENDENCY".
5. Responde ÚNICAMENTE con el objeto JSON solicitado.`;

    const base64Data = imageBuffer.toString('base64');
    const dataUri = `data:${mimeType};base64,${base64Data}`;

    const endpoint = 'https://api.groq.com/openai/v1/chat/completions';
    const payload = {
      model: effectiveModel,
      max_tokens: 850,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Extrae con exactitud y exhaustividad el diagrama de clases UML dibujado en esta imagen.',
            },
            {
              type: 'image_url',
              image_url: { url: dataUri },
            },
          ],
        },
      ],
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${effectiveApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMsg = `Groq API respondió con código HTTP ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson?.error?.message) {
          errorMsg += `: ${errorJson.error.message}`;
        }
      } catch {
        errorMsg += `: ${errorText.substring(0, 200)}`;
      }
      throw new Error(errorMsg);
    }

    const data = (await response.json()) as {
      choices?: Array<{
        message?: { content?: string };
      }>;
    };

    const rawJson = data.choices?.[0]?.message?.content;
    if (!rawJson) {
      throw new Error('Respuesta vacía de Groq Vision API.');
    }

    return this.parseAndValidateDiagram(rawJson);
  }

  /**
   * Parsea la respuesta JSON de Groq, sanea identificadores, aplica posicionamiento y valida con UML 2.5 OMG.
   */
  public parseAndValidateDiagram(rawJson: string): PhotoDiagramExtractResult {
    let parsed: RawUmlDiagramJson;
    try {
      parsed = JSON.parse(rawJson) as RawUmlDiagramJson;
    } catch {
      // Intento de extracción si contiene bloques markdown
      const match = rawJson.match(/\{[\s\S]*\}/);
      if (!match) {
        throw new Error('La respuesta de la IA no contiene una estructura JSON válida.');
      }
      parsed = JSON.parse(match[0]) as RawUmlDiagramJson;
    }

    const rawClasses = parsed.classes || [];
    const rawRelationships = parsed.relationships || [];
    const warnings: string[] = Array.isArray(parsed.warnings) ? parsed.warnings.map(String) : [];

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
        warnings.push(
          `Se omitió relación entre "${rawRel.sourceClassName}" y "${rawRel.targetClassName}" por no encontrar una de las clases identificadas.`,
        );
      }
    }

    const diagram: UMLDiagramAST = {
      version: 1,
      nombre: 'Modelo Digitalizado con Groq Vision',
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
      source: 'gemini_vision', // Retenemos compatibilidad con tipo de fuente
    };
  }
}

export const createGroqVisionService = (apiKey?: string, model?: string) =>
  new GroqVisionService(apiKey, model);
