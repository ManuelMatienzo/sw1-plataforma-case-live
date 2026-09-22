import { UMLDiagramAST, UMLClass, UMLRelationship } from '../models/uml.types';
import {
  DataModelResult,
  InheritanceStrategy,
  NormalizationReport,
  NormalizationViolation,
  RelationalColumn,
  RelationalForeignKey,
  RelationalIndex,
  RelationalTable,
  VirtualDataEngineerRecommendation,
} from '../models/dataModel.types';

export const toSnakeCase = (str: string): string => {
  if (!str) return '';
  return str
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/__+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase();
};

export const pluralizeSpanish = (name: string): string => {
  if (!name) return '';
  const parts = name.split('_');
  const last = parts[parts.length - 1];
  let pluralLast = last;
  if (last.endsWith('s') || last.endsWith('x')) {
    pluralLast = last;
  } else if (/[aeiouáéíóú]$/i.test(last)) {
    pluralLast = `${last}s`;
  } else if (last.endsWith('z')) {
    pluralLast = `${last.slice(0, -1)}ces`;
  } else {
    pluralLast = `${last}es`;
  }
  parts[parts.length - 1] = pluralLast;
  return parts.join('_');
};

export const mapUmlTypeToSql = (rawType?: string, isPk?: boolean): string => {
  if (isPk) return 'BIGSERIAL';
  if (!rawType || !rawType.trim()) return 'VARCHAR(255)';

  const clean = rawType.trim().toLowerCase();
  if (['string', 'texto', 'varchar', 'char', 'cadena'].includes(clean)) return 'VARCHAR(255)';
  if (['text', 'longtext', 'memo', 'descripcion'].includes(clean)) return 'TEXT';
  if (['integer', 'int', 'entero', 'numero', 'number', 'int4'].includes(clean)) return 'INTEGER';
  if (['long', 'bigint', 'int8'].includes(clean)) return 'BIGINT';
  if (['double', 'float', 'real', 'decimal', 'numeric', 'precio', 'monto', 'saldo'].includes(clean)) {
    return 'NUMERIC(15,2)';
  }
  if (['boolean', 'bool', 'booleano'].includes(clean)) return 'BOOLEAN';
  if (['date', 'fecha', 'localdate'].includes(clean)) return 'DATE';
  if (['datetime', 'timestamp', 'fechahora', 'localdatetime'].includes(clean)) return 'TIMESTAMP';
  if (['uuid', 'guid'].includes(clean)) return 'UUID';
  if (['byte[]', 'blob', 'bytea', 'archivo', 'imagen'].includes(clean)) return 'BYTEA';

  return 'VARCHAR(255)';
};

const isManyMultiplicity = (m?: string): boolean => {
  if (!m) return false;
  const clean = m.trim().toLowerCase();
  return ['*', '0..*', '1..*', '0..n', '1..n', 'n', 'm'].includes(clean);
};

export class DataModelGeneratorService {
  /**
   * Transforma el diagrama de clases UML en un Modelo Lógico Relacional formal
   * aplicando las Reglas de Mapeo de Tom (UML 2.5 OMG) y normalización 3FN.
   */
  generateDataModel(
    diagram: UMLDiagramAST,
    options?: { inheritanceStrategy?: InheritanceStrategy; pluralize?: boolean },
  ): DataModelResult {
    const strategy: InheritanceStrategy = options?.inheritanceStrategy || 'TPS';
    const classes = diagram.classes || [];
    const relationships = diagram.relationships || [];

    // 1. Identificar jerarquías de herencia (Regla 4 de Tom)
    const inheritanceRels = relationships.filter(r => r.type === 'INHERITANCE');
    const childToParent = new Map<string, string>(); // childClassId -> parentClassId
    inheritanceRels.forEach(r => {
      childToParent.set(r.sourceClassId, r.targetClassId);
    });

    const classMap = new Map<string, UMLClass>();
    classes.forEach(c => classMap.set(c.id, c));

    // Clases que se aplanan en TPH (las hijas no tienen tabla separada)
    const tphMergedChildIds = new Set<string>();
    if (strategy === 'TPH') {
      childToParent.forEach((_parentId, childId) => {
        tphMergedChildIds.add(childId);
      });
    }

    const tables: RelationalTable[] = [];
    const tableByClassId = new Map<string, RelationalTable>();

    // 2. Mapeo de Clases a Tablas (Regla 1 de Tom)
    classes.forEach(cls => {
      if (strategy === 'TPH' && tphMergedChildIds.has(cls.id)) {
        return; // Las hijas se integran en la tabla padre
      }

      const baseName = toSnakeCase(cls.name);
      const tableName = options?.pluralize ? pluralizeSpanish(baseName) : baseName;
      const columns: RelationalColumn[] = [];
      const foreignKeys: RelationalForeignKey[] = [];
      const indices: RelationalIndex[] = [];

      // Determinar si la clase tiene un atributo PK explícito
      const explicitPkAttr = cls.attributes.find(
        a => a.isPrimaryKey || a.name.toLowerCase() === 'id',
      );

      // Clave primaria surrogate por defecto
      if (!explicitPkAttr) {
        columns.push({
          id: `col-${tableName}-id`,
          name: 'id',
          sqlType: 'BIGSERIAL',
          isPrimaryKey: true,
          isForeignKey: false,
          isNullable: false,
          defaultValue: "nextval('seq_" + tableName + "')",
          description: 'Clave primaria surrogate generada por Regla 1 de Tom',
        });
      }

      // Atributos de la clase base
      cls.attributes.forEach(attr => {
        const colName = toSnakeCase(attr.name);
        const isPk = Boolean(attr.isPrimaryKey || attr.name.toLowerCase() === 'id');
        const isUnique = isPk || ['email', 'ci', 'dni', 'codigo', 'cod', 'sku', 'username'].includes(colName);
        const isNullable = isPk ? false : attr.visibility === '~' || false;

        columns.push({
          id: `col-${tableName}-${colName}`,
          name: colName,
          sqlType: isPk ? 'BIGSERIAL' : mapUmlTypeToSql(attr.type, isPk),
          isPrimaryKey: isPk,
          isForeignKey: false,
          isNullable,
          isUnique,
          defaultValue: attr.defaultValue,
          sourceAttributeName: attr.name,
        });

        if (isUnique && !isPk) {
          indices.push({
            name: `idx_${tableName}_${colName}_unique`,
            tableName,
            columns: [colName],
            isUnique: true,
            reason: `Índice único para clave candidata natural '${colName}'.`,
          });
        }
      });

      // Manejo específico de herencia según estrategia
      if (strategy === 'TPS') {
        // Si esta clase es hija, su PK es también FK hacia la tabla padre (Regla 4B de Tom)
        const parentId = childToParent.get(cls.id);
        if (parentId && classMap.has(parentId)) {
          const parentClass = classMap.get(parentId)!;
          const parentBase = toSnakeCase(parentClass.name);
          const parentTable = options?.pluralize ? pluralizeSpanish(parentBase) : parentBase;

          // Ajustar la PK para que sea FK hacia la superclase
          const pkCol = columns.find(c => c.isPrimaryKey);
          if (pkCol) {
            pkCol.sqlType = 'BIGINT';
            pkCol.isForeignKey = true;
            pkCol.foreignKeyTarget = {
              tableName: parentTable,
              columnName: 'id',
              onDelete: 'CASCADE',
            };
          }

          foreignKeys.push({
            name: `fk_${tableName}_${parentTable}`,
            columnName: 'id',
            targetTable: parentTable,
            targetColumn: 'id',
            onDelete: 'CASCADE',
            relationshipType: 'INHERITANCE',
          });

          indices.push({
            name: `idx_${tableName}_parent_fk`,
            tableName,
            columns: ['id'],
            isUnique: true,
            reason: 'Índice de herencia Table-Per-Subclass para optimizar JOINs con la superclase.',
          });
        }
      } else if (strategy === 'TPH') {
        // En TPH, si la clase es padre, absorbe los atributos de sus hijas y agrega discriminador
        const childIds = Array.from(childToParent.entries())
          .filter(([, pId]) => pId === cls.id)
          .map(([cId]) => cId);

        if (childIds.length > 0) {
          // Columna discriminadora
          columns.push({
            id: `col-${tableName}-tipo-discriminador`,
            name: 'tipo_discriminador',
            sqlType: 'VARCHAR(50)',
            isPrimaryKey: false,
            isForeignKey: false,
            isNullable: false,
            defaultValue: `'${cls.name.toUpperCase()}'`,
            description: 'Columna discriminadora para herencia Table-Per-Hierarchy',
          });

          // Agregar atributos de las subclases (todos nullables)
          childIds.forEach(cId => {
            const childCls = classMap.get(cId);
            if (childCls) {
              childCls.attributes.forEach(attr => {
                if (attr.name.toLowerCase() === 'id') return;
                const childColName = toSnakeCase(attr.name);
                if (!columns.some(c => c.name === childColName)) {
                  columns.push({
                    id: `col-${tableName}-${childColName}`,
                    name: childColName,
                    sqlType: mapUmlTypeToSql(attr.type),
                    isPrimaryKey: false,
                    isForeignKey: false,
                    isNullable: true, // Nullable porque no aplica a todas las instancias
                    sourceAttributeName: `${childCls.name}.${attr.name}`,
                  });
                }
              });
            }
          });
        }
      } else if (strategy === 'TPC') {
        // En TPC, si esta clase es hija, hereda e incorpora todas las columnas de la superclase
        let currentParentId = childToParent.get(cls.id);
        while (currentParentId && classMap.has(currentParentId)) {
          const parentCls = classMap.get(currentParentId)!;
          parentCls.attributes.forEach(attr => {
            if (attr.name.toLowerCase() === 'id') return;
            const parentColName = toSnakeCase(attr.name);
            if (!columns.some(c => c.name === parentColName)) {
              columns.push({
                id: `col-${tableName}-${parentColName}`,
                name: parentColName,
                sqlType: mapUmlTypeToSql(attr.type),
                isPrimaryKey: false,
                isForeignKey: false,
                isNullable: false,
                sourceAttributeName: `${parentCls.name}.${attr.name}`,
              });
            }
          });
          currentParentId = childToParent.get(currentParentId);
        }
      }

      const table: RelationalTable = {
        id: `tbl-${tableName}`,
        name: tableName,
        displayName: cls.name,
        sourceClassId: cls.id,
        sourceClassName: cls.name,
        isJunctionTable: false,
        columns,
        foreignKeys,
        indices,
        description: `Tabla generada para la clase UML '${cls.name}'`,
      };

      tables.push(table);
      tableByClassId.set(cls.id, table);
    });

    // 3. Mapeo de Asociaciones, Agregaciones y Composiciones (Reglas 3 y 5 de Tom)
    const associationRels = relationships.filter(r => r.type !== 'INHERITANCE');

    associationRels.forEach((rel, relIdx) => {
      const srcCls = classMap.get(rel.sourceClassId);
      const dstCls = classMap.get(rel.targetClassId);
      if (!srcCls || !dstCls) return;

      const srcTable = tableByClassId.get(srcCls.id);
      const dstTable = tableByClassId.get(dstCls.id);
      if (!srcTable || !dstTable) return;

      const srcMany = isManyMultiplicity(rel.sourceMultiplicity);
      const dstMany = isManyMultiplicity(rel.targetMultiplicity);

      // CASO A: Relación Muchos a Muchos (N:M) -> Tabla intermedia (Regla 3 de Tom)
      if (srcMany && dstMany) {
        const junctionName = `${srcTable.name}_${dstTable.name}`;
        const srcBase = srcTable.sourceClassName
          ? toSnakeCase(srcTable.sourceClassName)
          : srcTable.name.endsWith('es')
            ? srcTable.name.slice(0, -2)
            : srcTable.name.endsWith('s')
              ? srcTable.name.slice(0, -1)
              : srcTable.name;

        const dstBase = dstTable.sourceClassName
          ? toSnakeCase(dstTable.sourceClassName)
          : dstTable.name.endsWith('es')
            ? dstTable.name.slice(0, -2)
            : dstTable.name.endsWith('s')
              ? dstTable.name.slice(0, -1)
              : dstTable.name;

        const srcFkColName = `${srcBase}_id`;
        const dstFkColName = `${dstBase}_id`;

        const junctionTable: RelationalTable = {
          id: `tbl-junction-${relIdx + 1}`,
          name: junctionName,
          displayName: `${srcTable.displayName} - ${dstTable.displayName}`,
          isJunctionTable: true,
          columns: [
            {
              id: `col-${junctionName}-${srcFkColName}`,
              name: srcFkColName,
              sqlType: 'BIGINT',
              isPrimaryKey: true,
              isForeignKey: true,
              isNullable: false,
              foreignKeyTarget: {
                tableName: srcTable.name,
                columnName: 'id',
                onDelete: 'CASCADE',
              },
            },
            {
              id: `col-${junctionName}-${dstFkColName}`,
              name: dstFkColName,
              sqlType: 'BIGINT',
              isPrimaryKey: true,
              isForeignKey: true,
              isNullable: false,
              foreignKeyTarget: {
                tableName: dstTable.name,
                columnName: 'id',
                onDelete: 'CASCADE',
              },
            },
          ],
          foreignKeys: [
            {
              name: `fk_${junctionName}_${srcTable.name}`,
              columnName: srcFkColName,
              targetTable: srcTable.name,
              targetColumn: 'id',
              onDelete: 'CASCADE',
              relationshipType: rel.type,
            },
            {
              name: `fk_${junctionName}_${dstTable.name}`,
              columnName: dstFkColName,
              targetTable: dstTable.name,
              targetColumn: 'id',
              onDelete: 'CASCADE',
              relationshipType: rel.type,
            },
          ],
          indices: [
            {
              name: `idx_${junctionName}_reverse`,
              tableName: junctionName,
              columns: [dstFkColName, srcFkColName],
              isUnique: false,
              reason: 'Índice de cobertura inversa para consultas bidireccionales en tabla N:M.',
            },
          ],
          description: `Tabla intermedia para relación N:M entre '${srcTable.displayName}' y '${dstTable.displayName}'`,
        };

        tables.push(junctionTable);
        return;
      }

      // CASO B: Relación 1 a Muchos (1:N) o 1 a 1 (Reglas 3 y 5 de Tom)
      // La clave foránea va en la tabla del lado "muchos", o en el destino si es 1:1
      let ownerTable: RelationalTable;
      let targetTable: RelationalTable;
      const isOneToOne = !srcMany && !dstMany;

      if (dstMany) {
        ownerTable = dstTable;
        targetTable = srcTable;
      } else {
        ownerTable = srcTable;
        targetTable = dstTable;
      }

      const targetBase = targetTable.sourceClassName
        ? toSnakeCase(targetTable.sourceClassName)
        : targetTable.name.endsWith('es')
          ? targetTable.name.slice(0, -2)
          : targetTable.name.endsWith('s')
            ? targetTable.name.slice(0, -1)
            : targetTable.name;

      const fkBaseName = rel.name ? toSnakeCase(rel.name) : `${targetBase}_id`;
      let fkColName = fkBaseName.endsWith('_id') ? fkBaseName : `${fkBaseName}_id`;

      // Evitar colisión de nombres de columna
      if (ownerTable.columns.some(c => c.name === fkColName)) {
        fkColName = `${targetBase}_${relIdx + 1}_id`;
      }

      const isComposition = rel.type === 'COMPOSITION';
      const isAggregation = rel.type === 'AGGREGATION';

      // Composición: NOT NULL + CASCADE (Regla 5 de Tom)
      // Agregación: NULLABLE + SET NULL
      // Si la multiplicidad del padre es obligatoria ('1'), es NOT NULL (isNullable = false)
      const parentMultiplicity = dstMany ? rel.sourceMultiplicity : rel.targetMultiplicity;
      const isMandatory = isComposition || parentMultiplicity === '1';
      const isNullable = !isMandatory;
      const onDelete = isComposition ? 'CASCADE' : isAggregation ? 'SET NULL' : 'RESTRICT';

      ownerTable.columns.push({
        id: `col-${ownerTable.name}-${fkColName}`,
        name: fkColName,
        sqlType: 'BIGINT',
        isPrimaryKey: false,
        isForeignKey: true,
        isNullable,
        isUnique: isOneToOne,
        foreignKeyTarget: {
          tableName: targetTable.name,
          columnName: 'id',
          onDelete,
        },
      });

      ownerTable.foreignKeys.push({
        name: `fk_${ownerTable.name}_${targetTable.name}`,
        columnName: fkColName,
        targetTable: targetTable.name,
        targetColumn: 'id',
        onDelete,
        relationshipType: rel.type,
      });

      ownerTable.indices.push({
        name: `idx_${ownerTable.name}_${fkColName}`,
        tableName: ownerTable.name,
        columns: [fkColName],
        isUnique: isOneToOne,
        reason: isOneToOne
          ? 'Índice único para garantizar cardinalidad exacta 1:1.'
          : 'Índice B-tree para acelerar búsquedas y operaciones JOIN.',
      });
    });

    // 4. Auditoría de Normalización (1FN, 2FN, 3FN)
    const normalizationReport = this.analyzeNormalization(tables);

    // 5. Recomendaciones del Ingeniero de Datos Virtual
    const recommendations = this.generateRecommendations(tables, normalizationReport);

    // 6. Generar sintaxis Mermaid erDiagram
    const mermaidErDiagram = this.generateMermaidEr(tables, relationships, classMap);

    const summary = {
      totalTables: tables.length,
      totalColumns: tables.reduce((acc, t) => acc + t.columns.length, 0),
      totalForeignKeys: tables.reduce((acc, t) => acc + t.foreignKeys.length, 0),
      totalIndices: tables.reduce((acc, t) => acc + t.indices.length, 0),
      junctionTablesCount: tables.filter(t => t.isJunctionTable).length,
    };

    return {
      tables,
      inheritanceStrategy: strategy,
      summary,
      mermaidErDiagram,
      normalizationReport,
      recommendations,
    };
  }

  /**
   * Verifica el cumplimiento de las tres formas normales en el modelo relacional.
   */
  private analyzeNormalization(tables: RelationalTable[]): NormalizationReport {
    const violations: NormalizationViolation[] = [];
    const strengths: string[] = [];

    // Verificación 1FN: Todas las tablas tienen PK y columnas atómicas escalares
    let is1FN = true;
    tables.forEach(table => {
      const hasPk = table.columns.some(c => c.isPrimaryKey);
      if (!hasPk) {
        is1FN = false;
        violations.push({
          level: '1FN',
          tableName: table.name,
          description: `La tabla '${table.name}' carece de una clave primaria definida.`,
          suggestion: 'Añadir una columna ID con tipo BIGSERIAL como clave primaria surrogate.',
        });
      }
    });

    if (is1FN) {
      strengths.push('1FN: Todas las entidades poseen clave primaria surrogate definida y tipos escalares atómicos.');
    }

    // Verificación 2FN: En tablas con clave primaria compuesta (tablas intermedias N:M),
    // ningún atributo no-clave debe depender parcialmente de la PK.
    let is2FN = true;
    tables
      .filter(t => t.isJunctionTable)
      .forEach(table => {
        const pkCols = table.columns.filter(c => c.isPrimaryKey);
        const nonPkCols = table.columns.filter(c => !c.isPrimaryKey);

        if (pkCols.length > 1 && nonPkCols.length > 0) {
          // Si hay atributos extra en la tabla intermedia, advertir sobre posible dependencia parcial
          violations.push({
            level: '2FN',
            tableName: table.name,
            description: `La tabla intermedia '${table.name}' contiene columnas adicionales (${nonPkCols.map(c => c.name).join(', ')}) que podrían depender de solo una de las claves foráneas.`,
            suggestion: 'Verificar que las columnas adicionales representen atributos intrínsecos de la relación (ej: fecha_asignacion), no de las entidades aisladas.',
          });
          is2FN = false;
        }
      });

    if (is2FN) {
      strengths.push('2FN: Las tablas intermedias de unión están completamente descompuestas y sin dependencias parciales.');
    }

    // Verificación 3FN: Ausencia de dependencias transitivas entre atributos no clave
    let is3FN = true;
    tables.forEach(table => {
      const colNames = table.columns.map(c => c.name);

      // Heurística de dependencia transitiva:
      // Coexistencia de código/id y descripción/nombre del mismo dominio dentro de la misma tabla
      const suspiciousPairs = [
        ['departamento_id', 'departamento_nombre'],
        ['ciudad_id', 'ciudad_nombre'],
        ['categoria_id', 'categoria_nombre'],
        ['pais_id', 'pais_nombre'],
        ['tipo_id', 'tipo_nombre'],
      ];

      suspiciousPairs.forEach(([idCol, nameCol]) => {
        if (colNames.includes(idCol) && colNames.includes(nameCol)) {
          is3FN = false;
          violations.push({
            level: '3FN',
            tableName: table.name,
            description: `Posible dependencia transitiva detectada en '${table.name}': '${idCol}' determina a '${nameCol}'.`,
            suggestion: `Extraer '${nameCol}' a una entidad separada referenciada por '${idCol}'.`,
          });
        }
      });
    });

    if (is3FN) {
      strengths.push('3FN: No se detectaron dependencias funcionales transitivas entre atributos no clave.');
    }

    return {
      is1FN,
      is2FN,
      is3FN,
      enForma3FN: is1FN && is2FN && is3FN,
      violations,
      strengths,
    };
  }

  /**
   * Genera recomendaciones de diseño e índices B-Tree / Unique para el Ingeniero de Datos.
   */
  private generateRecommendations(
    tables: RelationalTable[],
    report: NormalizationReport,
  ): VirtualDataEngineerRecommendation[] {
    const recs: VirtualDataEngineerRecommendation[] = [];

    // 1. Recomendación de índices sobre Claves Foráneas
    const totalFks = tables.reduce((acc, t) => acc + t.foreignKeys.length, 0);
    if (totalFks > 0) {
      recs.push({
        type: 'INDEX',
        tableName: 'Global',
        message: `Se generaron automáticamente ${totalFks} índices B-tree sobre todas las columnas de clave foránea (FK) para evitar Table Scans durante operaciones JOIN.`,
        impact: 'HIGH',
      });
    }

    // 2. Recomendación sobre tablas intermedias
    const junctionCount = tables.filter(t => t.isJunctionTable).length;
    if (junctionCount > 0) {
      recs.push({
        type: 'STORAGE',
        tableName: 'Tablas Intermedias',
        message: `Se crearon índices compuestos inversos en las ${junctionCount} tablas intermedias para optimizar consultas en ambas direcciones de la relación N:M.`,
        impact: 'MEDIUM',
      });
    }

    // 3. Recomendaciones derivadas de violaciones de normalización
    report.violations.forEach(v => {
      recs.push({
        type: 'CONSTRAINT',
        tableName: v.tableName,
        message: `${v.level}: ${v.description} -> Sugerencia: ${v.suggestion}`,
        impact: v.level === '1FN' ? 'HIGH' : 'MEDIUM',
      });
    });

    return recs;
  }

  /**
   * Construye el diagrama Entidad-Relación en formato estándar Mermaid erDiagram.
   */
  private generateMermaidEr(
    tables: RelationalTable[],
    relationships: UMLRelationship[],
    classMap: Map<string, UMLClass>,
  ): string {
    const lines: string[] = ['erDiagram'];

    // Declaración de entidades con sus columnas
    tables.forEach(table => {
      lines.push(`    ${table.name.toUpperCase()} {`);
      table.columns.forEach(col => {
        const typeToken = col.sqlType.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const pkFkToken = col.isPrimaryKey ? 'PK' : col.isForeignKey ? 'FK' : '';
        const nameToken = col.name;
        lines.push(`        ${typeToken} ${nameToken} ${pkFkToken}`.trimEnd());
      });
      lines.push('    }');
    });

    // Declaración de relaciones relacionales
    const renderedRelPairs = new Set<string>();

    // Relaciones basadas en Claves Foráneas
    tables.forEach(table => {
      table.foreignKeys.forEach(fk => {
        const sourceTable = table.name.toUpperCase();
        const targetTable = fk.targetTable.toUpperCase();
        const pairKey = `${sourceTable}->${targetTable}:${fk.columnName}`;
        if (renderedRelPairs.has(pairKey)) return;
        renderedRelPairs.add(pairKey);

        const col = table.columns.find(c => c.name === fk.columnName);
        const isOneToOne = col?.isUnique || false;

        let connector = '||--o{';
        if (isOneToOne) {
          connector = '||--||';
        } else if (fk.onDelete === 'CASCADE') {
          connector = '||--|{';
        }

        const label = fk.relationshipType.toLowerCase();
        lines.push(`    ${targetTable} ${connector} ${sourceTable} : "${label}"`);
      });
    });

    return lines.join('\n');
  }
}

export const createDataModelGeneratorService = () => new DataModelGeneratorService();
