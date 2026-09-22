import os from 'node:os';
import JSZip from 'jszip';
import { AppError } from '../errors/AppError';
import { MobileAppConfig, MobileAppResult, MobileEntityField } from '../models/mobile.types';
import { UMLDiagramAST } from '../models/uml.types';
import { parseDiagram } from '../utils/validateDiagram';
import { pluralizeSpanish, toSnakeCase } from './dataModelGeneratorService';
import { mobileFiles } from './mobileTemplates';

type InterfaceAddress = { address: string; family: string | number; internal: boolean };
const PRIVATE_IPV4 = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;
const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;

export function detectLanAddress(interfaces: Record<string, InterfaceAddress[] | undefined> = os.networkInterfaces()): string {
  const candidates = Object.values(interfaces).flatMap((entries) => entries ?? [])
    .filter((entry) => !entry.internal && (entry.family === 'IPv4' || entry.family === 4));
  return candidates.find((entry) => PRIVATE_IPV4.test(entry.address))?.address ?? candidates[0]?.address ?? '127.0.0.1';
}

export function mobileAccessUrl(appId: string, port: number, address = detectLanAddress(), publicOrigin?: string): string {
  if (!SAFE_ID.test(appId)) throw new AppError('Identificador de app inválido', 400, 'INVALID_ID');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new AppError('Puerto inválido', 400, 'INVALID_PORT');
  let origin: string;
  if (publicOrigin) {
    const parsed = new URL(publicOrigin);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.pathname !== '/') {
      throw new AppError('Origen móvil público inválido', 400, 'INVALID_ORIGIN');
    }
    origin = parsed.origin;
  } else {
    origin = `http://${address}:${port}`;
  }
  return `${origin}/m/${appId}`;
}

const field = (name: string, umlType: string, required: boolean): MobileEntityField => {
  const type = umlType.toLowerCase();
  const inputType = ['integer', 'int', 'long', 'double', 'float', 'real', 'bigdecimal'].includes(type) ? 'number'
    : ['boolean', 'bool'].includes(type) ? 'checkbox'
      : ['date', 'localdate'].includes(type) ? 'date'
        : ['datetime', 'localdatetime'].includes(type) ? 'datetime-local' : 'text';
  return { name, label: name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (char) => char.toUpperCase()), umlType, inputType, required };
};

export class MobileAppService {
  async generate(
    input: UMLDiagramAST,
    options: { appId?: string; backendBaseUrl?: string; name?: string } = {},
  ): Promise<MobileAppResult> {
    const diagram = parseDiagram(input);
    const classes = diagram.classes.filter((item) => !item.isInterface && !item.isAbstract);
    if (!classes.length) throw new AppError('El diagrama necesita al menos una entidad concreta', 400, 'EMPTY_MODEL');
    const appId = options.appId ?? crypto.randomUUID();
    if (!SAFE_ID.test(appId)) throw new AppError('Identificador de app inválido', 400, 'INVALID_ID');
    const name = (options.name ?? input.nombre ?? 'App CASE IA').trim().slice(0, 80);
    const backendBaseUrl = options.backendBaseUrl ?? '';
    if (backendBaseUrl && !/^https?:\/\/[^/\s]+\/api\/v1\/?$/.test(backendBaseUrl)) {
      throw new AppError('URL del backend inválida', 400, 'INVALID_BACKEND_URL');
    }
    const config: MobileAppConfig = {
      name, shortName: name.slice(0, 24), backgroundColor: '#0b0e14', themeColor: '#3b82f6',
      version: '1.0.0', backendBaseUrl,
      entities: classes.map((item) => ({
        name: item.name,
        route: pluralizeSpanish(toSnakeCase(item.name)).replace(/_/g, '-'),
        fields: item.attributes.filter((attribute) => attribute.name.toLowerCase() !== 'id')
          .map((attribute) => field(attribute.name, attribute.type, attribute.isNullable === false)),
      })),
    };
    const files = mobileFiles(config);
    const zip = new JSZip();
    for (const generated of files) zip.file(generated.path, generated.encoding === 'base64' ? Buffer.from(generated.content, 'base64') : generated.content);
    return {
      appId, config, files,
      zipBuffer: await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }),
      summary: { entitiesCount: config.entities.length, filesCount: files.length },
    };
  }
}
