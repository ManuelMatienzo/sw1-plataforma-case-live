import { apiClient } from './api';
import type { UMLDiagramAST } from '../types/uml';
import type { UmlValidationReport } from '../types/validation';

export interface XmiSummary {
  classes: number;
  interfaces: number;
  attributes: number;
  methods: number;
  relationships: number;
}

export type XmiImportStrategy = 'replace' | 'merge';

export interface XmiPreview {
  content: string;
  fileName: string;
  size: number;
  summary: XmiSummary;
}

export interface XmiImportResult {
  diagram: UMLDiagramAST;
  warnings: string[];
  summary: XmiSummary;
  validationReport: UmlValidationReport;
}

export interface XmiImportInput {
  content: string;
  strategy: XmiImportStrategy;
  expectedVersion: number;
}

const MAX_XMI_BYTES = 5 * 1024 * 1024;
const localName = (element: Element) => (element.localName || element.tagName.split(':').at(-1) || '').toLowerCase();
const xmiType = (element: Element) => (element.getAttribute('xmi:type') || element.getAttribute('type') || '').toLowerCase();

export const inspectXmiContent = (content: string, fileName: string, size: number): XmiPreview => {
  if (!content.trim()) throw new Error('El archivo XMI está vacío.');
  if (size > MAX_XMI_BYTES) throw new Error('El archivo XMI supera el límite de 5 MB.');
  if (/<!DOCTYPE|<!ENTITY/i.test(content)) throw new Error('El archivo XMI contiene declaraciones XML no permitidas.');
  const documentNode = new DOMParser().parseFromString(content, 'application/xml');
  if (documentNode.querySelector('parsererror')) throw new Error('El archivo no contiene XML válido.');
  const elements = Array.from(documentNode.getElementsByTagName('*'));
  if (!elements.some(element => localName(element) === 'model')) throw new Error('El archivo no contiene un modelo UML.');
  const summary: XmiSummary = { classes: 0, interfaces: 0, attributes: 0, methods: 0, relationships: 0 };
  elements.forEach(element => {
    const name = localName(element);
    const type = xmiType(element);
    if (type.endsWith('interface')) summary.interfaces += 1;
    else if (type.endsWith('class')) summary.classes += 1;
    if (name === 'ownedattribute') summary.attributes += 1;
    if (name === 'ownedoperation') summary.methods += 1;
    if (name === 'generalization' || name === 'interfacerealization' || type.endsWith('association') || type.endsWith('dependency') || type.endsWith('usage')) summary.relationships += 1;
  });
  return { content, fileName, size, summary };
};

export const inspectXmiFile = async (file: File): Promise<XmiPreview> => {
  if (!/\.(xmi|xml)$/i.test(file.name)) throw new Error('Selecciona un archivo .xmi o .xml.');
  if (file.size > MAX_XMI_BYTES) throw new Error('El archivo XMI supera el límite de 5 MB.');
  return inspectXmiContent(await file.text(), file.name, file.size);
};

const downloadName = (header: unknown) => {
  if (typeof header !== 'string') return 'modelo-uml.xmi';
  return /filename\*?=(?:UTF-8''|["'])?([^"';]+)/i.exec(header)?.[1]?.trim() || 'modelo-uml.xmi';
};

export const xmiApi = {
  async importar(sessionId: string, input: XmiImportInput): Promise<XmiImportResult> {
    const response = await apiClient.post<{ data: XmiImportResult }>(`/sesiones/${sessionId}/xmi/importar`, input);
    return response.data.data;
  },

  async exportar(sessionId: string): Promise<{ blob: Blob; filename: string }> {
    const response = await apiClient.get<Blob>(`/sesiones/${sessionId}/xmi/exportar`, { responseType: 'blob' });
    return { blob: response.data, filename: downloadName(response.headers['content-disposition']) };
  },
};

export const downloadBlob = ({ blob, filename }: { blob: Blob; filename: string }) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
};
