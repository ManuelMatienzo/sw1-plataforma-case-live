import { beforeEach, expect, it, vi } from 'vitest';
import { apiClient } from './api';
import { inspectXmiContent, xmiApi } from './xmiService';

vi.mock('./api', () => ({ apiClient: { get: vi.fn(), post: vi.fn() } }));

const xml = `<?xml version="1.0"?>
<xmi:XMI xmlns:xmi="http://schema.omg.org/spec/XMI/2.1" xmlns:uml="http://schema.omg.org/spec/UML/2.1">
  <uml:Model xmi:id="m1" name="Clínica">
    <packagedElement xmi:type="uml:Class" xmi:id="c1" name="Paciente">
      <ownedAttribute xmi:type="uml:Property" xmi:id="a1" name="id" />
      <ownedOperation xmi:type="uml:Operation" xmi:id="o1" name="guardar" />
    </packagedElement>
    <packagedElement xmi:type="uml:Interface" xmi:id="c2" name="Auditable" />
    <packagedElement xmi:type="uml:Association" xmi:id="r1" />
  </uml:Model>
</xmi:XMI>`;

beforeEach(() => vi.clearAllMocks());

it('previsualiza el contenido XMI sin convertirlo en el navegador', () => {
  const preview = inspectXmiContent(xml, 'clinica.xmi', xml.length);
  expect(preview.fileName).toBe('clinica.xmi');
  expect(preview.summary).toEqual({ classes: 1, interfaces: 1, attributes: 1, methods: 1, relationships: 1 });
});

it('rechaza archivos vacíos, demasiado grandes o sin modelo UML', () => {
  expect(() => inspectXmiContent('', 'vacio.xmi', 0)).toThrow(/vacío/i);
  expect(() => inspectXmiContent(xml, 'enorme.xmi', 5 * 1024 * 1024 + 1)).toThrow(/5 MB/i);
  expect(() => inspectXmiContent('<root/>', 'otro.xml', 7)).toThrow(/modelo UML/i);
});

it('importa con versión y estrategia explícitas y obtiene la descarga XMI', async () => {
  vi.mocked(apiClient.post).mockResolvedValue({ data: { data: { diagram: { version: 3, classes: [], relationships: [] } } } });
  vi.mocked(apiClient.get).mockResolvedValue({
    data: new Blob([xml], { type: 'application/xml' }),
    headers: { 'content-disposition': 'attachment; filename="modelo-clinica.xmi"' },
  });

  const imported = await xmiApi.importar('session-1', { content: xml, strategy: 'merge', expectedVersion: 2 });
  const exported = await xmiApi.exportar('session-1');

  expect(apiClient.post).toHaveBeenCalledWith('/sesiones/session-1/xmi/importar', { content: xml, strategy: 'merge', expectedVersion: 2 });
  expect(imported.diagram.version).toBe(3);
  expect(apiClient.get).toHaveBeenCalledWith('/sesiones/session-1/xmi/exportar', { responseType: 'blob' });
  expect(exported.filename).toBe('modelo-clinica.xmi');
});
