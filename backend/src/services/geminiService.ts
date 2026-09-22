import { parseVoiceCommandLocal, VoiceCommandAction } from './voiceCommandParser';

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
}

export const createGeminiService = (apiKey?: string) => new GeminiService(apiKey);
