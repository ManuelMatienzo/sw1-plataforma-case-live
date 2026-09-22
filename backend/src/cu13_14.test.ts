import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import net from 'node:net';
import jwt from 'jsonwebtoken';
import { UMLDiagramAST } from './models/uml.types';
import { SpringGeneratorService } from './services/springGeneratorService';
import { findAvailablePort, SpringRunnerService } from './services/springRunnerService';
import { createApp } from './app';

const diagram: UMLDiagramAST = {
  version: 1,
  nombre: 'Clinica Integral',
  classes: [
    {
      id: 'paciente', name: 'Paciente', isAbstract: false, isInterface: false,
      position: { x: 0, y: 0 }, methods: [], attributes: [
        { id: 'id-explicito', name: 'id', type: 'Long', visibility: '+' },
        { id: 'nombre', name: 'nombreCompleto', type: 'String', visibility: '+', isNullable: false },
        { id: 'ci', name: 'ci', type: 'String', visibility: '+', isUnique: true },
        { id: 'nacimiento', name: 'fechaNacimiento', type: 'Date', visibility: '+', isNullable: true },
      ],
    },
    {
      id: 'consulta', name: 'Consulta', isAbstract: false, isInterface: false,
      position: { x: 300, y: 0 }, methods: [], attributes: [
        { id: 'motivo', name: 'motivo', type: 'String', visibility: '+' },
      ],
    },
  ],
  relationships: [{
    id: 'relacion', sourceClassId: 'paciente', targetClassId: 'consulta',
    type: 'COMPOSITION', sourceMultiplicity: '1', targetMultiplicity: '0..*',
  }],
};

const options = {
  packageName: 'com.generated.app', groupId: 'com.generated', artifactId: 'clinica-api',
  port: 8080, dbHost: 'localhost', dbPort: 5432, dbName: 'clinica',
  dbUser: 'postgres', dbPassword: 'postgres',
};

test('CU-13: genera las cuatro capas, DTO, configuración y una colección Postman ejecutable', async () => {
  const result = await new SpringGeneratorService().generate(diagram, options);
  const paths = result.files.map((file) => file.path);

  assert.ok(paths.includes('src/main/java/com/generated/app/entity/Paciente.java'));
  assert.ok(paths.includes('src/main/java/com/generated/app/repository/PacienteRepository.java'));
  assert.ok(paths.includes('src/main/java/com/generated/app/service/PacienteService.java'));
  assert.ok(paths.includes('src/main/java/com/generated/app/controller/PacienteController.java'));
  assert.ok(paths.includes('src/main/java/com/generated/app/dto/PacienteDTO.java'));
  assert.ok(paths.includes('src/main/resources/application.properties'));
  assert.ok(paths.includes('pom.xml'));
  assert.ok(paths.includes('postman/coleccion-postman.json'));
  assert.equal(result.summary.entitiesCount, 2);
  assert.equal(result.summary.endpointsCount, 10);
  assert.equal(result.summary.filesCount, result.files.length);

  const collection = result.postmanCollection as any;
  assert.equal(collection.info.schema, 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json');
  assert.equal(collection.variable[0].value, 'http://localhost:8080/api/v1');
  assert.equal(collection.item.length, 2);
  assert.ok(collection.item[0].item.every((request: any) => request.event?.length > 0));
});

test('CU-13: genera entidades coherentes, sin id duplicado y con relación JPA sin ciclos JSON', async () => {
  const result = await new SpringGeneratorService().generate(diagram, options);
  const paciente = result.files.find((file) => file.name === 'Paciente.java')?.content ?? '';
  const consulta = result.files.find((file) => file.name === 'Consulta.java')?.content ?? '';

  assert.match(paciente, /@Entity/);
  assert.match(paciente, /@Table\(name = "pacientes"\)/);
  assert.match(paciente, /@GeneratedValue\(strategy = GenerationType\.IDENTITY\)/);
  assert.equal((paciente.match(/private Long id;/g) ?? []).length, 1);
  assert.match(paciente, /@OneToMany\(mappedBy = "paciente"/);
  assert.match(paciente, /@JsonManagedReference/);
  assert.match(consulta, /@ManyToOne\(fetch = FetchType\.LAZY\)/);
  assert.match(consulta, /@JoinColumn\(name = "paciente_id"/);
  assert.match(consulta, /@JsonBackReference/);
});

test('CU-13: empaqueta todos los archivos en un ZIP legible', async () => {
  const result = await new SpringGeneratorService().generate(diagram, options);
  const zip = await JSZip.loadAsync(result.zipBuffer);
  assert.ok(zip.file('pom.xml'));
  assert.ok(zip.file('src/main/java/com/generated/app/BackendGeneradoApplication.java'));
  assert.ok(zip.file('postman/coleccion-postman.json'));
});

test('CU-13: normaliza tipos UML y nombres reservados de Java/SQL', async () => {
  const reservedDiagram: UMLDiagramAST = {
    version: 1,
    classes: [{
      id: 'order', name: 'Order', isAbstract: false, isInterface: false,
      position: { x: 0, y: 0 }, methods: [], attributes: [
        { id: 'class', name: 'class', type: 'String', visibility: '+' },
        { id: 'amount', name: 'amount', type: 'float', visibility: '+' },
        { id: 'date', name: 'createdAt', type: 'LocalDate', visibility: '+' },
      ],
    }], relationships: [],
  };
  const result = await new SpringGeneratorService().generate(reservedDiagram, options);
  const entity = result.files.find((file) => file.category === 'entity')?.content ?? '';
  assert.match(entity, /public class OrderEntity/);
  assert.match(entity, /@Table\(name = "tbl_orders"\)/);
  assert.match(entity, /private String classValue;/);
  assert.match(entity, /private Double amount;/);
  assert.match(entity, /private LocalDate createdAt;/);
});

test('CU-14: encuentra el siguiente puerto disponible cuando el inicial está ocupado', async () => {
  const occupied = net.createServer();
  await new Promise<void>((resolve, reject) => occupied.once('error', reject).listen(0, '127.0.0.1', resolve));
  const address = occupied.address();
  assert.ok(address && typeof address !== 'string');
  try {
    const port = await findAvailablePort(address.port, '127.0.0.1');
    assert.equal(port, address.port + 1);
  } finally {
    await new Promise<void>((resolve) => occupied.close(() => resolve()));
  }
});

test('CU-13: representa herencia TPS y TPH con las anotaciones de Jakarta correctas', async () => {
  const inheritanceDiagram: UMLDiagramAST = {
    version: 1,
    classes: [
      { id: 'base', name: 'Persona', isAbstract: true, isInterface: false, position: { x: 0, y: 0 }, methods: [], attributes: [] },
      { id: 'child', name: 'Doctor', isAbstract: false, isInterface: false, position: { x: 0, y: 100 }, methods: [], attributes: [] },
    ],
    relationships: [{ id: 'extends', sourceClassId: 'child', targetClassId: 'base', type: 'INHERITANCE' }],
  };
  const service = new SpringGeneratorService();
  const tps = await service.generate(inheritanceDiagram, options);
  const tph = await service.generate(inheritanceDiagram, options, { inheritanceStrategy: 'TPH' } as any);
  assert.match(tps.files.find((item) => item.name === 'Persona.java')!.content, /InheritanceType\.JOINED/);
  assert.match(tps.files.find((item) => item.name === 'Doctor.java')!.content, /extends Persona/);
  assert.match(tph.files.find((item) => item.name === 'Persona.java')!.content, /InheritanceType\.SINGLE_TABLE/);
  assert.match(tph.files.find((item) => item.name === 'Doctor.java')!.content, /@DiscriminatorValue\("DOCTOR"\)/);
});

test('CU-13: representa relaciones muchos a muchos con tabla de unión', async () => {
  const manyToMany: UMLDiagramAST = {
    version: 1,
    classes: [
      { id: 'a', name: 'Estudiante', isAbstract: false, isInterface: false, position: { x: 0, y: 0 }, methods: [], attributes: [] },
      { id: 'b', name: 'Curso', isAbstract: false, isInterface: false, position: { x: 100, y: 0 }, methods: [], attributes: [] },
    ],
    relationships: [{ id: 'r', sourceClassId: 'a', targetClassId: 'b', type: 'ASSOCIATION', sourceMultiplicity: '0..*', targetMultiplicity: '0..*' }],
  };
  const generated = await new SpringGeneratorService().generate(manyToMany, options);
  const estudiante = generated.files.find((item) => item.name === 'Estudiante.java')!.content;
  assert.match(estudiante, /@ManyToMany/);
  assert.match(estudiante, /@JoinTable\(name = "cursos_estudiantes"/);
  assert.match(estudiante, /inverseJoinColumns = @JoinColumn\(name = "curso_id"\)/);
});

test('CU-13: produce Maven y application.properties listos para Java 21 y PostgreSQL', async () => {
  const generated = await new SpringGeneratorService().generate(diagram, { ...options, port: 8090, dbPassword: 'secreto' });
  const pom = generated.files.find((item) => item.path === 'pom.xml')!.content;
  const properties = generated.files.find((item) => item.path.endsWith('application.properties'))!.content;
  assert.match(pom, /<version>3\.2\.4<\/version>/);
  assert.match(pom, /<java\.version>21<\/java\.version>/);
  assert.match(pom, /spring-boot-starter-data-jpa/);
  assert.match(properties, /server\.port=8090/);
  assert.match(properties, /jdbc:postgresql:\/\/localhost:5432\/clinica/);
  assert.match(properties, /spring\.datasource\.password=secreto/);
});

test('CU-14: reporta IDLE antes de iniciar y rechaza identificadores inseguros', () => {
  const runner = new SpringRunnerService();
  assert.equal(runner.getStatus('sesion-segura').status, 'IDLE');
  assert.throws(() => runner.getStatus('../escape'), /Identificador de sesión inválido/);
});

test('CU-13: expone generación, ZIP y Postman por HTTP con control de anfitrión', async () => {
  const secret = 'spring-test-secret';
  const user = { id: 'host-1', email: 'host@test.dev', nombre: 'Host', rol: 'ANFITRION' as const, activo: true };
  const app = createApp({
    authService: {} as any,
    adminService: {} as any,
    sessionRepository: { findSessionUserById: async () => user } as any,
    jwtSecret: secret,
    corsOrigin: 'http://localhost:5173',
    diagramService: { get: async () => ({ diagram, canEdit: true, isHost: true, proyectoNombre: 'Clinica Integral', sesionNombre: 'Diseño' }) } as any,
  });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}/api/spring`;
  const token = jwt.sign({ sub: user.id }, secret);
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const sessionId = '10000000-0000-4000-8000-000000000013';
  try {
    const direct = await fetch(`${base}/generar-directo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ diagrama: diagram, options }) });
    assert.equal(direct.status, 200);
    const directBody = await direct.json() as any;
    assert.equal(directBody.data.summary.entitiesCount, 2);

    const generation = await fetch(`${base}/sesiones/${sessionId}/generar`, { method: 'POST', headers, body: '{}' });
    assert.equal(generation.status, 200);

    const zip = await fetch(`${base}/sesiones/${sessionId}/descargar-zip`, { headers });
    assert.equal(zip.status, 200);
    assert.match(zip.headers.get('content-disposition') ?? '', /clinica_integral_backend\.zip/);
    const zipBytes = new Uint8Array(await zip.arrayBuffer());
    assert.deepEqual([...zipBytes.slice(0, 2)], [0x50, 0x4b]);

    const postman = await fetch(`${base}/sesiones/${sessionId}/postman`, { headers });
    assert.equal(postman.status, 200);
    assert.equal((await postman.json() as any).info.schema, 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
