import JSZip from 'jszip';
import { DataModelResult, InheritanceStrategy } from '../models/dataModel.types';
import { GeneratedFile, GeneratedFileCategory, SpringProjectOptions, SpringProjectResult } from '../models/spring.types';
import { UMLAttribute, UMLClass, UMLDiagramAST, UMLRelationship } from '../models/uml.types';
import { pluralizeSpanish, toSnakeCase } from './dataModelGeneratorService';

const DEFAULT_OPTIONS: SpringProjectOptions = {
  packageName: 'com.generated.app',
  groupId: 'com.generated',
  artifactId: 'backend-generado',
  port: 8080,
  dbHost: 'localhost',
  dbPort: 5432,
  dbName: 'app_db',
  dbUser: 'postgres',
  dbPassword: 'postgres',
};

const JAVA_RESERVED = new Set([
  'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class',
  'const', 'continue', 'default', 'do', 'double', 'else', 'enum', 'extends', 'final',
  'finally', 'float', 'for', 'goto', 'if', 'implements', 'import', 'instanceof', 'int',
  'interface', 'long', 'native', 'new', 'package', 'private', 'protected', 'public',
  'return', 'short', 'static', 'strictfp', 'super', 'switch', 'synchronized', 'this',
  'throw', 'throws', 'transient', 'try', 'void', 'volatile', 'while', 'record', 'sealed',
  'permits', 'var', 'yield', 'user', 'order',
]);

const SQL_RESERVED = new Set(['order', 'user', 'group', 'table', 'default', 'class', 'select', 'where']);
const RESERVED_PLURALS: Record<string, string> = {
  order: 'orders', user: 'users', group: 'groups', table: 'tables', default: 'defaults', class: 'classes',
};

const upperFirst = (value: string): string => value ? value[0].toUpperCase() + value.slice(1) : value;
const lowerFirst = (value: string): string => value ? value[0].toLowerCase() + value.slice(1) : value;
const words = (value: string): string[] => value.trim().replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[^a-zA-Z0-9]+/).filter(Boolean);
const pascal = (value: string): string => words(value).map((part) => upperFirst(part.toLowerCase())).join('') || 'Generated';
const camel = (value: string): string => lowerFirst(pascal(value));
const isMany = (value?: string): boolean => Boolean(value && (value.includes('*') || /(^|\.)[mn]$/i.test(value)));

const javaClassName = (value: string): string => {
  const candidate = pascal(value);
  return JAVA_RESERVED.has(candidate.toLowerCase()) ? `${candidate}Entity` : candidate;
};

const javaFieldName = (value: string): string => {
  const candidate = camel(value);
  return JAVA_RESERVED.has(candidate.toLowerCase()) ? `${candidate}Value` : candidate;
};

const javaType = (raw: string): string => {
  const type = raw.trim().toLowerCase();
  if (['int', 'integer', 'entero'].includes(type)) return 'Integer';
  if (['long', 'bigint'].includes(type)) return 'Long';
  if (['double', 'float', 'decimal', 'number', 'numeric'].includes(type)) return 'Double';
  if (['boolean', 'bool'].includes(type)) return 'Boolean';
  if (['date', 'localdate', 'fecha'].includes(type)) return 'LocalDate';
  if (['datetime', 'localdatetime', 'timestamp'].includes(type)) return 'LocalDateTime';
  return 'String';
};

const tableNameFor = (umlClass: UMLClass): string => {
  const singular = toSnakeCase(umlClass.name);
  const base = RESERVED_PLURALS[singular] ?? pluralizeSpanish(singular);
  return SQL_RESERVED.has(singular) ? `tbl_${base}` : base;
};

const packagePath = (packageName: string): string => packageName.replace(/\./g, '/');

const file = (path: string, content: string, category: GeneratedFileCategory): GeneratedFile => ({
  path,
  name: path.split('/').pop() ?? path,
  content: `${content.trim()}\n`,
  category,
});

interface RelationField {
  annotation: string;
  jsonAnnotation?: string;
  type: string;
  name: string;
  initial?: string;
}

interface EntityMetadata {
  umlClass: UMLClass;
  className: string;
  tableName: string;
  fields: Array<{ attribute: UMLAttribute; name: string; type: string }>;
  relations: RelationField[];
  parent?: string;
  inheritanceRoot?: InheritanceStrategy;
  discriminator?: string;
}

export class SpringGeneratorService {
  async generate(
    diagram: UMLDiagramAST,
    options?: Partial<SpringProjectOptions>,
    dataModel?: DataModelResult,
  ): Promise<SpringProjectResult> {
    const config = { ...DEFAULT_OPTIONS, ...options };
    this.validate(diagram, config);
    const strategy = dataModel?.inheritanceStrategy ?? 'TPS';
    const metadata = this.buildMetadata(diagram, strategy);
    const root = `src/main/java/${packagePath(config.packageName)}`;
    const files: GeneratedFile[] = [];

    for (const entity of metadata) {
      files.push(file(`${root}/entity/${entity.className}.java`, this.entitySource(entity, config.packageName), 'entity'));
      files.push(file(`${root}/dto/${entity.className}DTO.java`, this.dtoSource(entity, config.packageName), 'dto'));
      files.push(file(`${root}/repository/${entity.className}Repository.java`, this.repositorySource(entity, config.packageName), 'repository'));
      files.push(file(`${root}/service/${entity.className}Service.java`, this.serviceSource(entity, config.packageName), 'service'));
      files.push(file(`${root}/controller/${entity.className}Controller.java`, this.controllerSource(entity, config.packageName), 'controller'));
    }

    files.push(file(`${root}/exception/ResourceNotFoundException.java`, this.notFoundSource(config.packageName), 'config'));
    files.push(file(`${root}/exception/GlobalExceptionHandler.java`, this.exceptionHandlerSource(config.packageName), 'config'));
    files.push(file(`${root}/BackendGeneradoApplication.java`, this.applicationSource(config.packageName), 'config'));
    files.push(file('src/main/resources/application.properties', this.propertiesSource(config), 'config'));
    files.push(file('pom.xml', this.pomSource(config), 'config'));
    files.push(file(`${root.replace('src/main/java', 'src/test/java')}/BackendGeneradoApplicationTests.java`, this.testSource(config.packageName), 'test'));

    const postmanCollection = this.postmanCollection(metadata, config);
    files.push(file('postman/coleccion-postman.json', JSON.stringify(postmanCollection, null, 2), 'postman'));
    const zipBuffer = await this.buildZipArchive(files);

    return {
      files,
      zipBuffer,
      postmanCollection,
      summary: {
        entitiesCount: metadata.length,
        endpointsCount: metadata.length * 5,
        filesCount: files.length,
      },
    };
  }

  async buildZipArchive(files: GeneratedFile[]): Promise<Buffer> {
    const archive = new JSZip();
    for (const generated of files) archive.file(generated.path, generated.content);
    return archive.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  }

  private validate(diagram: UMLDiagramAST, options: SpringProjectOptions): void {
    if (!diagram.classes.length) throw new Error('El diagrama debe contener al menos una clase');
    if (!/^[a-zA-Z_]\w*(\.[a-zA-Z_]\w*)+$/.test(options.packageName)) throw new Error('packageName no es válido');
    if (!/^[a-zA-Z0-9_.-]+$/.test(options.groupId) || !/^[a-zA-Z0-9_.-]+$/.test(options.artifactId)) {
      throw new Error('groupId o artifactId no es válido');
    }
    if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) throw new Error('Puerto inválido');
    if (!Number.isInteger(options.dbPort) || options.dbPort < 1 || options.dbPort > 65535) throw new Error('Puerto de base de datos inválido');
    for (const value of [options.dbHost, options.dbName, options.dbUser, options.dbPassword]) {
      if (/[\r\n]/.test(value)) throw new Error('La configuración de base de datos contiene caracteres inválidos');
    }
    const ids = new Set(diagram.classes.map((item) => item.id));
    if (ids.size !== diagram.classes.length) throw new Error('Hay identificadores de clase duplicados');
  }

  private buildMetadata(diagram: UMLDiagramAST, strategy: InheritanceStrategy): EntityMetadata[] {
    const byId = new Map(diagram.classes.map((item) => [item.id, item]));
    const result = diagram.classes.filter((item) => !item.isInterface).map((umlClass) => ({
      umlClass,
      className: javaClassName(umlClass.name),
      tableName: tableNameFor(umlClass),
      fields: umlClass.attributes
        .filter((attribute) => attribute.name.trim().toLowerCase() !== 'id')
        .map((attribute) => ({ attribute, name: javaFieldName(attribute.name), type: javaType(attribute.type) })),
      relations: [],
    } as EntityMetadata));
    const byEntityId = new Map(result.map((item) => [item.umlClass.id, item]));

    for (const relationship of diagram.relationships) {
      const source = byEntityId.get(relationship.sourceClassId);
      const target = byEntityId.get(relationship.targetClassId);
      if (!source || !target) continue;
      if (relationship.type === 'INHERITANCE') {
        source.parent = target.className;
        target.inheritanceRoot = strategy;
        if (strategy === 'TPH') source.discriminator = toSnakeCase(source.umlClass.name).toUpperCase();
        continue;
      }
      if (relationship.type === 'REALIZATION' || relationship.type === 'DEPENDENCY') continue;
      this.addRelationship(source, target, relationship, byId);
    }
    return result;
  }

  private addRelationship(source: EntityMetadata, target: EntityMetadata, relationship: UMLRelationship, _byId: Map<string, UMLClass>): void {
    const sourceMany = isMany(relationship.sourceMultiplicity);
    const targetMany = isMany(relationship.targetMultiplicity);
    const sourceName = javaFieldName(source.umlClass.name);
    const targetName = javaFieldName(target.umlClass.name);
    if (!sourceMany && targetMany) {
      source.relations.push({
        annotation: `@OneToMany(mappedBy = "${sourceName}", cascade = CascadeType.ALL, orphanRemoval = ${relationship.type === 'COMPOSITION'})`,
        jsonAnnotation: '@JsonManagedReference', type: `List<${target.className}>`, name: pluralizeSpanish(targetName), initial: 'new ArrayList<>()',
      });
      target.relations.push({
        annotation: `@ManyToOne(fetch = FetchType.LAZY)\n    @JoinColumn(name = "${toSnakeCase(source.umlClass.name)}_id", nullable = false)`,
        jsonAnnotation: '@JsonBackReference', type: source.className, name: sourceName,
      });
      return;
    }
    if (sourceMany && !targetMany) {
      this.addRelationship(target, source, { ...relationship, sourceMultiplicity: relationship.targetMultiplicity, targetMultiplicity: relationship.sourceMultiplicity }, _byId);
      return;
    }
    if (sourceMany && targetMany) {
      const join = [toSnakeCase(source.umlClass.name), toSnakeCase(target.umlClass.name)].sort().map(pluralizeSpanish).join('_');
      source.relations.push({
        annotation: `@ManyToMany\n    @JoinTable(name = "${join}", joinColumns = @JoinColumn(name = "${toSnakeCase(source.umlClass.name)}_id"), inverseJoinColumns = @JoinColumn(name = "${toSnakeCase(target.umlClass.name)}_id"))`,
        type: `Set<${target.className}>`, name: pluralizeSpanish(targetName), initial: 'new LinkedHashSet<>()',
      });
      target.relations.push({
        annotation: `@ManyToMany(mappedBy = "${pluralizeSpanish(targetName)}")`,
        type: `Set<${source.className}>`, name: pluralizeSpanish(sourceName), initial: 'new LinkedHashSet<>()',
      });
      return;
    }
    source.relations.push({
      annotation: `@OneToOne\n    @JoinColumn(name = "${toSnakeCase(target.umlClass.name)}_id")`,
      type: target.className, name: targetName,
    });
    target.relations.push({
      annotation: `@OneToOne(mappedBy = "${targetName}")`,
      type: source.className, name: sourceName,
    });
  }

  private entitySource(entity: EntityMetadata, pkg: string): string {
    const scalarFields = entity.fields.map(({ attribute, name, type }) => {
      const validations: string[] = [];
      if (attribute.isNullable !== true) validations.push(type === 'String' ? '@NotBlank' : '@NotNull');
      if (type === 'String') validations.push('@Size(max = 255)');
      const column = `@Column(name = "${toSnakeCase(attribute.name)}", nullable = ${attribute.isNullable === true}, unique = ${Boolean(attribute.isUnique)}${type === 'String' ? ', length = 255' : ''})`;
      return `    ${validations.join('\n    ')}\n    ${column}\n    private ${type} ${name};`;
    }).join('\n\n');
    const relationFields = entity.relations.map((relation) =>
      `    ${relation.annotation}${relation.jsonAnnotation ? `\n    ${relation.jsonAnnotation}` : ''}\n    private ${relation.type} ${relation.name}${relation.initial ? ` = ${relation.initial}` : ''};`,
    ).join('\n\n');
    const allFields = [...entity.fields.map(({ name, type }) => ({ name, type })), ...entity.relations.map(({ name, type }) => ({ name, type }))];
    const constructorParams = allFields.map(({ name, type }) => `${type} ${name}`).join(', ');
    const assignments = allFields.map(({ name }) => `        this.${name} = ${name};`).join('\n');
    const accessors = [...(entity.parent ? [] : [{ name: 'id', type: 'Long' }]), ...allFields].map(({ name, type }) =>
      `    public ${type} get${upperFirst(name)}() { return ${name}; }\n\n    public void set${upperFirst(name)}(${type} ${name}) { this.${name} = ${name}; }`,
    ).join('\n\n');
    const inheritance = entity.inheritanceRoot === 'TPH'
      ? '@Inheritance(strategy = InheritanceType.SINGLE_TABLE)\n@DiscriminatorColumn(name = "tipo_discriminador")'
      : entity.inheritanceRoot === 'TPS' ? '@Inheritance(strategy = InheritanceType.JOINED)' : '';
    const discriminator = entity.discriminator ? `@DiscriminatorValue("${entity.discriminator}")\n` : '';
    return `
package ${pkg}.entity;

import com.fasterxml.jackson.annotation.JsonBackReference;
import com.fasterxml.jackson.annotation.JsonManagedReference;
import jakarta.persistence.*;
import jakarta.validation.constraints.*;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;

@Entity
@Table(name = "${entity.tableName}")
${inheritance}
${discriminator}public class ${entity.className}${entity.parent ? ` extends ${entity.parent}` : ''} {
${entity.parent ? '' : `    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
`}

${scalarFields}${scalarFields && relationFields ? '\n\n' : ''}${relationFields}

    public ${entity.className}() {}

${allFields.length ? `    public ${entity.className}(${constructorParams}) {
${assignments}
    }
` : ''}

${accessors}
}`;
  }

  private dtoSource(entity: EntityMetadata, pkg: string): string {
    const fields = entity.fields.map(({ name, type, attribute }) => {
      const validators = attribute.isNullable !== true ? (type === 'String' ? '    @NotBlank\n' : '    @NotNull\n') : '';
      return `${validators}    private ${type} ${name};`;
    }).join('\n\n');
    const accessors = entity.fields.map(({ name, type }) =>
      `    public ${type} get${upperFirst(name)}() { return ${name}; }\n\n    public void set${upperFirst(name)}(${type} ${name}) { this.${name} = ${name}; }`,
    ).join('\n\n');
    return `
package ${pkg}.dto;

import jakarta.validation.constraints.*;
import java.time.LocalDate;
import java.time.LocalDateTime;

public class ${entity.className}DTO {
    private Long id;

${fields}

    public ${entity.className}DTO() {}

    public Long getId() { return id; }

    public void setId(Long id) { this.id = id; }

${accessors}
}`;
  }

  private repositorySource(entity: EntityMetadata, pkg: string): string {
    const methods = entity.fields.filter(({ attribute }) => attribute.isUnique).map(({ name, type }) =>
      `    Optional<${entity.className}> findBy${upperFirst(name)}(${type} ${name});\n    boolean existsBy${upperFirst(name)}(${type} ${name});`,
    ).join('\n\n');
    return `
package ${pkg}.repository;

import ${pkg}.entity.${entity.className};
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface ${entity.className}Repository extends JpaRepository<${entity.className}, Long> {
${methods}
}`;
  }

  private serviceSource(entity: EntityMetadata, pkg: string): string {
    const toDto = entity.fields.map(({ name }) => `        dto.set${upperFirst(name)}(entity.get${upperFirst(name)}());`).join('\n');
    const apply = entity.fields.map(({ name }) => `        entity.set${upperFirst(name)}(dto.get${upperFirst(name)}());`).join('\n');
    return `
package ${pkg}.service;

import ${pkg}.dto.${entity.className}DTO;
import ${pkg}.entity.${entity.className};
import ${pkg}.exception.ResourceNotFoundException;
import ${pkg}.repository.${entity.className}Repository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;

@Service
@Transactional
public class ${entity.className}Service {
    private final ${entity.className}Repository repository;

    public ${entity.className}Service(${entity.className}Repository repository) { this.repository = repository; }

    @Transactional(readOnly = true)
    public List<${entity.className}DTO> findAll() { return repository.findAll().stream().map(this::toDto).toList(); }

    @Transactional(readOnly = true)
    public ${entity.className}DTO findById(Long id) { return toDto(findEntity(id)); }

    public ${entity.className}DTO create(${entity.className}DTO dto) {
        ${entity.className} entity = new ${entity.className}();
        apply(entity, dto);
        return toDto(repository.save(entity));
    }

    public ${entity.className}DTO update(Long id, ${entity.className}DTO dto) {
        ${entity.className} entity = findEntity(id);
        apply(entity, dto);
        return toDto(repository.save(entity));
    }

    public void delete(Long id) { repository.delete(findEntity(id)); }

    private ${entity.className} findEntity(Long id) {
        return repository.findById(id).orElseThrow(() -> new ResourceNotFoundException("${entity.className} no encontrado con id " + id));
    }

    private ${entity.className}DTO toDto(${entity.className} entity) {
        ${entity.className}DTO dto = new ${entity.className}DTO();
        dto.setId(entity.getId());
${toDto}
        return dto;
    }

    private void apply(${entity.className} entity, ${entity.className}DTO dto) {
${apply}
    }
}`;
  }

  private controllerSource(entity: EntityMetadata, pkg: string): string {
    const route = pluralizeSpanish(toSnakeCase(entity.umlClass.name)).replace(/_/g, '-');
    return `
package ${pkg}.controller;

import ${pkg}.dto.${entity.className}DTO;
import ${pkg}.service.${entity.className}Service;
import jakarta.validation.Valid;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import java.net.URI;
import java.util.List;

@RestController
@RequestMapping("/api/v1/${route}")
@CrossOrigin(origins = "*")
public class ${entity.className}Controller {
    private final ${entity.className}Service service;

    public ${entity.className}Controller(${entity.className}Service service) { this.service = service; }

    @GetMapping
    public ResponseEntity<List<${entity.className}DTO>> findAll() { return ResponseEntity.ok(service.findAll()); }

    @GetMapping("/{id}")
    public ResponseEntity<${entity.className}DTO> findById(@PathVariable Long id) { return ResponseEntity.ok(service.findById(id)); }

    @PostMapping
    public ResponseEntity<${entity.className}DTO> create(@Valid @RequestBody ${entity.className}DTO dto) {
        ${entity.className}DTO created = service.create(dto);
        return ResponseEntity.created(URI.create("/api/v1/${route}/" + created.getId())).body(created);
    }

    @PutMapping("/{id}")
    public ResponseEntity<${entity.className}DTO> update(@PathVariable Long id, @Valid @RequestBody ${entity.className}DTO dto) {
        return ResponseEntity.ok(service.update(id, dto));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) { service.delete(id); return ResponseEntity.noContent().build(); }
}`;
  }

  private notFoundSource(pkg: string): string {
    return `package ${pkg}.exception;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

@ResponseStatus(HttpStatus.NOT_FOUND)
public class ResourceNotFoundException extends RuntimeException {
    public ResourceNotFoundException(String message) { super(message); }
}`;
  }

  private exceptionHandlerSource(pkg: string): string {
    return `package ${pkg}.exception;

import org.springframework.http.*;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;
import java.time.Instant;
import java.util.*;

@RestControllerAdvice
public class GlobalExceptionHandler {
    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<Map<String, Object>> notFound(ResourceNotFoundException error) { return response(HttpStatus.NOT_FOUND, error.getMessage()); }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> invalid(MethodArgumentNotValidException error) { return response(HttpStatus.BAD_REQUEST, "La solicitud contiene datos inválidos"); }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> unexpected(Exception error) { return response(HttpStatus.INTERNAL_SERVER_ERROR, "Ocurrió un error inesperado"); }

    private ResponseEntity<Map<String, Object>> response(HttpStatus status, String message) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("timestamp", Instant.now().toString()); body.put("status", status.value()); body.put("error", status.getReasonPhrase()); body.put("message", message);
        return ResponseEntity.status(status).body(body);
    }
}`;
  }

  private applicationSource(pkg: string): string {
    return `package ${pkg};

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class BackendGeneradoApplication {
    public static void main(String[] args) { SpringApplication.run(BackendGeneradoApplication.class, args); }
}`;
  }

  private propertiesSource(options: SpringProjectOptions): string {
    return `server.port=${options.port}
spring.application.name=${options.artifactId}
spring.datasource.url=jdbc:postgresql://${options.dbHost}:${options.dbPort}/${options.dbName}
spring.datasource.username=${options.dbUser}
spring.datasource.password=${options.dbPassword}
spring.datasource.driver-class-name=org.postgresql.Driver
spring.jpa.hibernate.ddl-auto=update
spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.PostgreSQLDialect
spring.jpa.open-in-view=false
spring.jpa.show-sql=true
`;
  }

  private pomSource(options: SpringProjectOptions): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>
  <parent><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-parent</artifactId><version>3.2.4</version><relativePath/></parent>
  <groupId>${options.groupId}</groupId><artifactId>${options.artifactId}</artifactId><version>0.0.1-SNAPSHOT</version>
  <name>${options.artifactId}</name><description>Backend generado por CASE IA</description>
  <properties><java.version>21</java.version></properties>
  <dependencies>
    <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-web</artifactId></dependency>
    <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-data-jpa</artifactId></dependency>
    <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-validation</artifactId></dependency>
    <dependency><groupId>org.postgresql</groupId><artifactId>postgresql</artifactId><scope>runtime</scope></dependency>
    <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-test</artifactId><scope>test</scope></dependency>
  </dependencies>
  <build><plugins><plugin><groupId>org.springframework.boot</groupId><artifactId>spring-boot-maven-plugin</artifactId></plugin></plugins></build>
</project>`;
  }

  private testSource(pkg: string): string {
    return `package ${pkg};

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest
class BackendGeneradoApplicationTests { @Test void contextLoads() {} }`;
  }

  private exampleValue(type: string, name: string): unknown {
    if (type === 'Integer' || type === 'Long') return 1;
    if (type === 'Double') return 125.5;
    if (type === 'Boolean') return true;
    if (type === 'LocalDate') return '2026-01-15';
    if (type === 'LocalDateTime') return '2026-01-15T10:30:00';
    if (/email/i.test(name)) return 'ana@example.com';
    if (/nombre/i.test(name)) return 'Ana Pérez';
    return `Ejemplo de ${name}`;
  }

  private postmanCollection(entities: EntityMetadata[], options: SpringProjectOptions): object {
    const testEvent = (status: number) => [{
      listen: 'test',
      script: { type: 'text/javascript', exec: [`pm.test("Status code is ${status}", function () {`, `  pm.response.to.have.status(${status});`, '});'] },
    }];
    const request = (name: string, method: string, route: string, status: number, body?: object) => ({
      name,
      event: testEvent(status),
      request: {
        method,
        header: body ? [{ key: 'Content-Type', value: 'application/json' }] : [],
        ...(body ? { body: { mode: 'raw', raw: JSON.stringify(body, null, 2), options: { raw: { language: 'json' } } } } : {}),
        url: { raw: `{{baseUrl}}/${route}`, host: ['{{baseUrl}}'], path: route.split('/') },
      },
    });
    return {
      info: {
        name: `${options.artifactId} - API generada`,
        description: 'Colección CRUD generada automáticamente por CASE IA.',
        schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
      },
      variable: [{ key: 'baseUrl', value: `http://localhost:${options.port}/api/v1`, type: 'string' }],
      item: entities.map((entity) => {
        const route = pluralizeSpanish(toSnakeCase(entity.umlClass.name)).replace(/_/g, '-');
        const example = Object.fromEntries(entity.fields.map(({ name, type }) => [name, this.exampleValue(type, name)]));
        return {
          name: entity.className,
          item: [
            request(`Listar ${entity.className}`, 'GET', route, 200),
            request(`Obtener ${entity.className}`, 'GET', `${route}/1`, 200),
            request(`Crear ${entity.className}`, 'POST', route, 201, example),
            request(`Actualizar ${entity.className}`, 'PUT', `${route}/1`, 200, example),
            request(`Eliminar ${entity.className}`, 'DELETE', `${route}/1`, 204),
          ],
        };
      }),
    };
  }
}
