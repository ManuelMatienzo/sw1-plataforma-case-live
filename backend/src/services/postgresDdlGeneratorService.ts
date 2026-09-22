import {
  DataModelResult,
  RelationalColumn,
  RelationalForeignKey,
  RelationalIndex,
  RelationalTable,
} from '../models/dataModel.types';
import { UMLDiagramAST } from '../models/uml.types';
import {
  DataModelGeneratorService,
  createDataModelGeneratorService,
} from './dataModelGeneratorService';
import { PostgresDdlOptions, PostgresDdlResult } from '../models/ddl.types';

export class PostgresDdlGeneratorService {
  constructor(
    private readonly dataModelGenerator: DataModelGeneratorService = createDataModelGeneratorService(),
  ) {}

  /**
   * Genera el script SQL DDL para PostgreSQL 15+ a partir de un AST de UML,
   * un DataModelResult o una lista de RelationalTable.
   */
  generateDdl(
    input: UMLDiagramAST | DataModelResult | RelationalTable[],
    options?: PostgresDdlOptions,
  ): PostgresDdlResult {
    const opts: Required<PostgresDdlOptions> = {
      includeDropTable: options?.includeDropTable ?? true,
      ifNotExists: options?.ifNotExists ?? true,
      includeComments: options?.includeComments ?? true,
      includeIndices: options?.includeIndices ?? true,
      pluralize: options?.pluralize ?? true,
      inheritanceStrategy: options?.inheritanceStrategy || 'TPS',
      schemaName: options?.schemaName || 'public',
    };

    let tables: RelationalTable[];

    if (Array.isArray(input)) {
      tables = input;
    } else if ('tables' in input && Array.isArray(input.tables)) {
      tables = input.tables;
    } else if ('classes' in input && Array.isArray(input.classes)) {
      const modelResult = this.dataModelGenerator.generateDataModel(input, {
        inheritanceStrategy: opts.inheritanceStrategy,
        pluralize: opts.pluralize,
      });
      tables = modelResult.tables;
    } else {
      tables = [];
    }

    const lines: string[] = [];
    const generatedAt = new Date().toISOString();

    // 1. Encabezado descriptivo
    lines.push('-- ========================================================');
    lines.push('-- Plataforma CASE Colaborativa - Script DDL PostgreSQL 15+');
    lines.push('-- Generado conforme a Reglas de Mapeo de Tom y Normalización 3FN');
    lines.push(`-- Fecha de generación: ${generatedAt}`);
    lines.push(`-- Estrategia de Herencia: ${opts.inheritanceStrategy}`);
    lines.push(`-- Esquema: ${opts.schemaName}`);
    lines.push('-- ========================================================');
    lines.push('');

    // 2. Eliminación preventiva en orden inverso de dependencias (Idempotencia)
    if (opts.includeDropTable && tables.length > 0) {
      lines.push('-- --------------------------------------------------------');
      lines.push('-- 1. Eliminación preventiva de tablas (Orden seguro CASCADE)');
      lines.push('-- --------------------------------------------------------');

      // Ordenar: tablas intermedias primero, luego hijas con FKs, luego padres
      const sortedForDrop = [...tables].sort((a, b) => {
        if (a.isJunctionTable && !b.isJunctionTable) return -1;
        if (!a.isJunctionTable && b.isJunctionTable) return 1;
        return b.foreignKeys.length - a.foreignKeys.length;
      });

      for (const t of sortedForDrop) {
        lines.push(`DROP TABLE IF EXISTS ${t.name} CASCADE;`);
      }
      lines.push('');
    }

    // 3. Creación de Tablas Base
    lines.push('-- --------------------------------------------------------');
    lines.push('-- 2. Creación de Tablas');
    lines.push('-- --------------------------------------------------------');

    let totalForeignKeys = 0;
    let totalIndices = 0;

    for (const table of tables) {
      const ifNotExistsClause = opts.ifNotExists ? 'IF NOT EXISTS ' : '';
      lines.push(`CREATE TABLE ${ifNotExistsClause}${table.name} (`);

      const colDefs: string[] = [];
      const primaryKeys: string[] = [];

      for (const col of table.columns) {
        let def = `    ${col.name.padEnd(24)} ${this.formatPostgresType(col)}`;

        if (col.isPrimaryKey) {
          primaryKeys.push(col.name);
          // Si es tipo SERIAL/BIGSERIAL en PostgreSQL, el PRIMARY KEY puede ir inline
          if (col.sqlType.toUpperCase().includes('SERIAL')) {
            def += ' PRIMARY KEY';
          }
        }

        if (!col.isNullable && !col.sqlType.toUpperCase().includes('SERIAL')) {
          def += ' NOT NULL';
        }

        if (col.isUnique && !col.isPrimaryKey) {
          def += ' UNIQUE';
        }

        if (col.defaultValue && !col.sqlType.toUpperCase().includes('SERIAL')) {
          def += ` DEFAULT ${col.defaultValue}`;
        }

        colDefs.push(def);
      }

      // Si hay clave primaria compuesta o no es serial, agregar CONSTRAINT PRIMARY KEY
      const hasSerialPk = table.columns.some(
        c => c.isPrimaryKey && c.sqlType.toUpperCase().includes('SERIAL'),
      );
      if (!hasSerialPk && primaryKeys.length > 0) {
        colDefs.push(`    CONSTRAINT pk_${table.name} PRIMARY KEY (${primaryKeys.join(', ')})`);
      }

      lines.push(colDefs.join(',\n'));
      lines.push(');');
      lines.push('');

      totalForeignKeys += table.foreignKeys.length;
      totalIndices += table.indices.length;
    }

    // 4. Restricciones de Integridad Referencial (FOREIGN KEY)
    // Se agregan con ALTER TABLE para evitar problemas de dependencias cíclicas
    const allForeignKeys: { tableName: string; fk: RelationalForeignKey }[] = [];
    for (const table of tables) {
      for (const fk of table.foreignKeys) {
        allForeignKeys.push({ tableName: table.name, fk });
      }
    }

    if (allForeignKeys.length > 0) {
      lines.push('-- --------------------------------------------------------');
      lines.push('-- 3. Restricciones de Integridad Referencial (Foreign Keys)');
      lines.push('-- --------------------------------------------------------');

      for (const { tableName, fk } of allForeignKeys) {
        const onDelete = fk.onDelete || 'RESTRICT';
        const constraintName = fk.name || `fk_${tableName}_${fk.columnName}`;
        lines.push(`ALTER TABLE ${tableName}`);
        lines.push(`    ADD CONSTRAINT ${constraintName}`);
        lines.push(`    FOREIGN KEY (${fk.columnName})`);
        lines.push(`    REFERENCES ${fk.targetTable}(${fk.targetColumn})`);
        lines.push(`    ON DELETE ${onDelete};`);
        lines.push('');
      }
    }

    // 5. Creación de Índices de Rendimiento
    if (opts.includeIndices) {
      const allIndices: { tableName: string; idx: RelationalIndex }[] = [];
      for (const table of tables) {
        for (const idx of table.indices) {
          allIndices.push({ tableName: table.name, idx });
        }
      }

      if (allIndices.length > 0) {
        lines.push('-- --------------------------------------------------------');
        lines.push('-- 4. Índices de Rendimiento y Cobertura B-Tree');
        lines.push('-- --------------------------------------------------------');

        for (const { tableName, idx } of allIndices) {
          const uniqueClause = idx.isUnique ? 'UNIQUE ' : '';
          const ifNotExistsClause = opts.ifNotExists ? 'IF NOT EXISTS ' : '';
          const indexName = idx.name || `idx_${tableName}_${idx.columns.join('_')}`;
          lines.push(
            `CREATE ${uniqueClause}INDEX ${ifNotExistsClause}${indexName} ON ${tableName} (${idx.columns.join(', ')});`,
          );
        }
        lines.push('');
      }
    }

    // 6. Comentarios de Documentación (COMMENT ON)
    if (opts.includeComments) {
      const commentLines: string[] = [];

      for (const table of tables) {
        if (table.description) {
          const cleanDesc = table.description.replace(/'/g, "''");
          commentLines.push(`COMMENT ON TABLE ${table.name} IS '${cleanDesc}';`);
        }

        for (const col of table.columns) {
          if (col.description) {
            const cleanDesc = col.description.replace(/'/g, "''");
            commentLines.push(`COMMENT ON COLUMN ${table.name}.${col.name} IS '${cleanDesc}';`);
          }
        }
      }

      if (commentLines.length > 0) {
        lines.push('-- --------------------------------------------------------');
        lines.push('-- 5. Comentarios de Documentación de Tablas y Columnas');
        lines.push('-- --------------------------------------------------------');
        for (const c of commentLines) {
          lines.push(c);
        }
        lines.push('');
      }
    }

    const sql = lines.join('\n');

    return {
      sql,
      tablesCount: tables.length,
      foreignKeysCount: totalForeignKeys,
      indicesCount: totalIndices,
      options: opts,
      generatedAt,
      filename: 'schema.sql',
    };
  }

  /**
   * Normaliza tipos de datos estándar al dialecto específico de PostgreSQL 15+.
   */
  private formatPostgresType(col: RelationalColumn): string {
    const raw = (col.sqlType || '').trim().toUpperCase();

    if (raw === 'BIGSERIAL') return 'BIGSERIAL';
    if (raw === 'SERIAL') return 'SERIAL';
    if (raw.startsWith('VARCHAR')) return raw;
    if (raw === 'TEXT') return 'TEXT';
    if (raw === 'INTEGER' || raw === 'INT') return 'INTEGER';
    if (raw === 'BIGINT') return 'BIGINT';
    if (raw.startsWith('NUMERIC') || raw.startsWith('DECIMAL')) return raw;
    if (raw === 'BOOLEAN' || raw === 'BOOL') return 'BOOLEAN';
    if (raw === 'DATE') return 'DATE';
    if (raw === 'TIMESTAMP' || raw.includes('TIME ZONE')) return 'TIMESTAMP WITH TIME ZONE';
    if (raw === 'UUID') return 'UUID';
    if (raw === 'BYTEA' || raw === 'BLOB') return 'BYTEA';

    return raw || 'VARCHAR(255)';
  }
}

export const createPostgresDdlGeneratorService = (): PostgresDdlGeneratorService =>
  new PostgresDdlGeneratorService();
