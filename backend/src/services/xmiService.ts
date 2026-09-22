import { XMLParser, XMLValidator } from 'fast-xml-parser';
import crypto from 'crypto';
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
import { AppError } from '../errors/AppError';
import { DiagramRepository } from './diagramaService';
import { validateUmlDiagram, UmlValidationReport } from './umlValidator';
import { parseDiagram } from '../utils/validateDiagram';

type XmlNode = Record<string, unknown>;

export interface XmiImportSummary {
  classes: number;
  interfaces: number;
  attributes: number;
  methods: number;
  relationships: number;
}

export interface XmiParseResult {
  diagram: UMLDiagramAST;
  warnings: string[];
  summary: XmiImportSummary;
}

const MAX_XMI_BYTES = 5 * 1024 * 1024;
const attr = (node: XmlNode, name: string): string | undefined => {
  const local = name.toLowerCase();
  for (const [key, value] of Object.entries(node)) {
    if (!key.startsWith('@_') || typeof value !== 'string') continue;
    if (key.slice(2).split(':').at(-1)?.toLowerCase() === local) return value;
  }
  return undefined;
};
const localName = (key: string) => key.split(':').at(-1)?.toLowerCase() ?? key.toLowerCase();
const asNodes = (value: unknown): XmlNode[] => {
  if (Array.isArray(value)) return value.filter(item => item && typeof item === 'object') as XmlNode[];
  return value && typeof value === 'object' ? [value as XmlNode] : [];
};
const children = (node: XmlNode, name: string): XmlNode[] => Object.entries(node)
  .filter(([key]) => !key.startsWith('@_') && localName(key) === name.toLowerCase())
  .flatMap(([, value]) => asNodes(value));
const descendants = (value: unknown, name: string, result: XmlNode[] = []): XmlNode[] => {
  if (!value || typeof value !== 'object') return result;
  if (Array.isArray(value)) {
    value.forEach(item => descendants(item, name, result));
    return result;
  }
  Object.entries(value as XmlNode).forEach(([key, child]) => {
    if (localName(key) === name.toLowerCase()) result.push(...asNodes(child));
    descendants(child, name, result);
  });
  return result;
};
const escapeXml = (value: string) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;');
const visibilityToXmi: Record<UMLVisibility, string> = {
  '+': 'public', '-': 'private', '#': 'protected', '~': 'package',
};
const visibilityFromXmi = (value: string | undefined): UMLVisibility => {
  if (value === 'private' || value === '-') return '-';
  if (value === 'protected' || value === '#') return '#';
  if (value === 'package' || value === '~') return '~';
  return '+';
};
const primitiveAliases: Record<string, string> = {
  string: 'String', text: 'String', char: 'String', varchar: 'String', varchar2: 'String',
  integer: 'Integer', int: 'Integer', smallint: 'Integer',
  long: 'Long', bigint: 'Long',
  boolean: 'Boolean', bool: 'Boolean',
  double: 'Double', float: 'Double', real: 'Double', decimal: 'Double', numeric: 'Double',
  date: 'LocalDate', localdate: 'LocalDate',
  datetime: 'LocalDateTime', localdatetime: 'LocalDateTime', timestamp: 'LocalDateTime',
  bytearray: 'byte[]', bytes: 'byte[]', blob: 'byte[]', binary: 'byte[]',
  void: 'void',
};
const normalizeType = (raw: string | undefined, knownNames: Set<string>, warnings: string[]): string => {
  if (!raw) return 'String';
  const decoded = raw.split('#').at(-1)?.split('/').at(-1)?.trim() || raw.trim();
  const aliasKey = decoded.replaceAll('[]', 'array').replace(/[^a-z0-9]/gi, '').toLowerCase();
  const canonical = primitiveAliases[aliasKey];
  if (canonical) {
    if (decoded !== canonical) warnings.push(`El tipo externo "${decoded}" se normalizó a "${canonical}".`);
    return canonical;
  }
  if (knownNames.has(decoded.toLowerCase())) return decoded;
  warnings.push(`El tipo "${decoded}" no es estándar; se conservó sin cambios.`);
  return decoded;
};
const typeFromNode = (node: XmlNode): string | undefined => {
  const direct = attr(node, 'type');
  if (direct && !direct.toLowerCase().startsWith('uml:')) return direct;
  const type = children(node, 'type')[0];
  return type ? attr(type, 'href') ?? attr(type, 'type') : undefined;
};
const readMultiplicity = (node: XmlNode): UMLMultiplicity | undefined => {
  const lowerNode = children(node, 'lowerValue')[0];
  const upperNode = children(node, 'upperValue')[0];
  const lower = lowerNode ? attr(lowerNode, 'value') ?? '0' : attr(node, 'lower');
  const upperRaw = upperNode ? attr(upperNode, 'value') ?? '1' : attr(node, 'upper');
  if (!lower && !upperRaw) return undefined;
  const upper = upperRaw === '-1' ? '*' : upperRaw;
  const candidate: string = lower === upper && lower ? lower : `${lower ?? '0'}..${upper ?? '1'}`;
  return ['1', '0..1', '1..*', '0..*', '*'].includes(candidate) ? candidate as UMLMultiplicity : undefined;
};
const multiplicityXml = (value: UMLMultiplicity | undefined) => {
  const [lower, upper] = value === '*' ? ['0', '*'] : value?.includes('..') ? value.split('..') : [value ?? '1', value ?? '1'];
  return `<lowerValue xmi:type="uml:LiteralInteger" value="${escapeXml(lower)}"/><upperValue xmi:type="uml:LiteralUnlimitedNatural" value="${escapeXml(upper)}"/>`;
};
const referenceTypeXml = (type: string) => `<type xmi:type="uml:PrimitiveType" href="http://schema.omg.org/spec/UML/2.1/uml.xml#${escapeXml(type)}"/>`;

export const toEaId = (id: string, prefix: 'EAID' | 'EAPK' = 'EAID'): string => {
  if (new RegExp(`^${prefix}_[0-9A-Fa-f]{8}_[0-9A-Fa-f]{4}_[0-9A-Fa-f]{4}_[0-9A-Fa-f]{4}_[0-9A-Fa-f]{12}$`).test(id)) {
    return id;
  }
  const hash = crypto.createHash('md5').update(id).digest('hex').toUpperCase();
  return `${prefix}_${hash.slice(0, 8)}_${hash.slice(8, 12)}_${hash.slice(12, 16)}_${hash.slice(16, 20)}_${hash.slice(20, 32)}`;
};

export const toDuid = (id: string): string => {
  const hash = crypto.createHash('md5').update(id).digest('hex').toUpperCase();
  return hash.slice(0, 8);
};

const classXml = (cls: UMLClass, relationships: UMLRelationship[]) => {
  const attributes = cls.attributes.map(attribute => `
      <ownedAttribute xmi:type="uml:Property" xmi:id="${escapeXml(attribute.id)}" name="${escapeXml(attribute.name)}" visibility="${visibilityToXmi[attribute.visibility]}" isStatic="false" isReadOnly="false" isDerived="false" isOrdered="false" isUnique="true" isDerivedUnion="false">
        <lowerValue xmi:type="uml:LiteralInteger" xmi:id="${escapeXml(attribute.id)}_lower" value="1"/>
        <upperValue xmi:type="uml:LiteralInteger" xmi:id="${escapeXml(attribute.id)}_upper" value="1"/>
        ${referenceTypeXml(attribute.type)}
      </ownedAttribute>`).join('');
  const methods = cls.methods.map(method => {
    const parameters = method.parameters.map((parameter, index) => `
        <ownedParameter xmi:type="uml:Parameter" xmi:id="${escapeXml(method.id)}_param_${index + 1}" name="${escapeXml(parameter.name)}" direction="in">${referenceTypeXml(parameter.type)}</ownedParameter>`).join('');
    return `
      <ownedOperation xmi:type="uml:Operation" xmi:id="${escapeXml(method.id)}" name="${escapeXml(method.name)}" visibility="${visibilityToXmi[method.visibility]}"${method.isAbstract ? ' isAbstract="true"' : ''}${method.isStatic ? ' isStatic="true"' : ''}>${parameters}
        <ownedParameter xmi:type="uml:Parameter" xmi:id="${escapeXml(method.id)}_return" name="return" direction="return">${referenceTypeXml(method.returnType || 'void')}</ownedParameter>
      </ownedOperation>`;
  }).join('');
  const structural = relationships.filter(rel => rel.sourceClassId === cls.id && (rel.type === 'INHERITANCE' || rel.type === 'REALIZATION')).map(rel => rel.type === 'INHERITANCE'
    ? `
      <generalization xmi:type="uml:Generalization" xmi:id="${escapeXml(rel.id)}" general="${escapeXml(rel.targetClassId)}"/>`
    : `
      <interfaceRealization xmi:type="uml:InterfaceRealization" xmi:id="${escapeXml(rel.id)}" name="${escapeXml(rel.name ?? '')}" contract="${escapeXml(rel.targetClassId)}"/>`).join('');
  return `
    <packagedElement xmi:type="${cls.isInterface ? 'uml:Interface' : 'uml:Class'}" xmi:id="${escapeXml(cls.id)}" name="${escapeXml(cls.name)}"${cls.isAbstract ? ' isAbstract="true"' : ''} visibility="public">${attributes}${methods}${structural}
    </packagedElement>`;
};

const relationshipXml = (relationship: UMLRelationship) => {
  if (relationship.type === 'INHERITANCE' || relationship.type === 'REALIZATION') return '';
  if (relationship.type === 'DEPENDENCY') {
    return `
    <packagedElement xmi:type="uml:Dependency" xmi:id="${escapeXml(relationship.id)}" name="${escapeXml(relationship.name ?? '')}" client="${escapeXml(relationship.sourceClassId)}" supplier="${escapeXml(relationship.targetClassId)}" visibility="public"/>`;
  }
  const aggregation = relationship.type === 'COMPOSITION' ? ' aggregation="composite"' : relationship.type === 'AGGREGATION' ? ' aggregation="shared"' : '';
  const sourceEnd = `${relationship.id}_source`;
  const targetEnd = `${relationship.id}_target`;
  return `
    <packagedElement xmi:type="uml:Association" xmi:id="${escapeXml(relationship.id)}" name="${escapeXml(relationship.name ?? '')}" visibility="public">
      <memberEnd xmi:idref="${escapeXml(sourceEnd)}"/><memberEnd xmi:idref="${escapeXml(targetEnd)}"/>
      <ownedEnd xmi:type="uml:Property" xmi:id="${escapeXml(sourceEnd)}" name="${escapeXml(relationship.sourceRole ?? '')}" type="${escapeXml(relationship.sourceClassId)}" association="${escapeXml(relationship.id)}"${aggregation} visibility="public">${multiplicityXml(relationship.sourceMultiplicity)}</ownedEnd>
      <ownedEnd xmi:type="uml:Property" xmi:id="${escapeXml(targetEnd)}" name="${escapeXml(relationship.targetRole ?? '')}" type="${escapeXml(relationship.targetClassId)}" association="${escapeXml(relationship.id)}" visibility="public">${multiplicityXml(relationship.targetMultiplicity)}</ownedEnd>
    </packagedElement>`;
};

export const serializeXmi = (diagram: UMLDiagramAST, modelName = diagram.nombre ?? 'Modelo'): string => {
  const classes = diagram.classes.map(cls => classXml(cls, diagram.relationships)).join('');
  const relationships = diagram.relationships.map(relationshipXml).join('');
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  const packageId = toEaId(modelName + '_package', 'EAPK');
  const packageEaId = toEaId(modelName + '_package', 'EAID');
  const diagramId = toEaId(modelName + '_diagram', 'EAID');

  const eaElements = diagram.classes.map((cls, idx) => {
    const classAttributesXml = cls.attributes.length > 0 ? `
        <attributes>${cls.attributes.map((attr, aIdx) => `
          <attribute xmi:idref="${escapeXml(attr.id)}" name="${escapeXml(attr.name)}" scope="${attr.visibility === '+' ? 'Public' : attr.visibility === '#' ? 'Protected' : 'Private'}">
            <properties type="${escapeXml(attr.type)}" collection="false" static="0" duplicates="0" changeability="changeable"/>
            <bounds lower="1" upper="1"/>
            <containment containment="Not Specified" position="${aIdx}"/>
          </attribute>`).join('')}
        </attributes>` : '<attributes/>';

    const classOperationsXml = cls.methods.length > 0 ? `
        <operations>${cls.methods.map(m => `
          <operation xmi:idref="${escapeXml(m.id)}" name="${escapeXml(m.name)}" scope="${m.visibility === '+' ? 'Public' : m.visibility === '#' ? 'Protected' : 'Private'}">
            <type type="${escapeXml(m.returnType || 'void')}" const="false" static="${m.isStatic ? 'true' : 'false'}" isAbstract="${m.isAbstract ? 'true' : 'false'}" synchronised="0" concurrency="Sequential" pure="0" isQuery="false"/>
            <parameters>${m.parameters.map((p, pIdx) => `
              <parameter xmi:idref="${escapeXml(m.id)}_param_${pIdx + 1}" name="${escapeXml(p.name)}" visibility="public">
                <properties pos="${pIdx}" type="${escapeXml(p.type)}" const="false"/>
              </parameter>`).join('')}
              <parameter xmi:idref="${escapeXml(m.id)}_return" name="return" kind="return" visibility="public">
                <properties pos="0" type="${escapeXml(m.returnType || 'void')}" const="false"/>
              </parameter>
            </parameters>
          </operation>`).join('')}
        </operations>` : '<operations/>';

    const classLinks = diagram.relationships
      .filter(r => r.sourceClassId === cls.id || r.targetClassId === cls.id)
      .map(r => {
        const linkTag = r.type === 'INHERITANCE' ? 'Generalization' : r.type === 'REALIZATION' ? 'Realisation' : r.type === 'DEPENDENCY' ? 'Dependency' : r.type === 'COMPOSITION' || r.type === 'AGGREGATION' ? 'Aggregation' : 'Association';
        return `
          <${linkTag} xmi:id="${escapeXml(r.id)}" start="${escapeXml(r.sourceClassId)}" end="${escapeXml(r.targetClassId)}"/>`;
      }).join('');
    const classLinksXml = classLinks ? `
        <links>${classLinks}
        </links>` : '<links/>';

    return `
      <element xmi:idref="${escapeXml(cls.id)}" xmi:type="${cls.isInterface ? 'uml:Interface' : 'uml:Class'}" name="${escapeXml(cls.name)}" scope="public">
        <model package="${packageId}" tpos="${idx}" ea_localid="${idx + 2}" ea_eleType="element"/>
        <properties isSpecification="false" sType="${cls.isInterface ? 'Interface' : 'Class'}" nType="0" scope="public" isRoot="false" isLeaf="false" isAbstract="${cls.isAbstract ? 'true' : 'false'}" isActive="false"/>
        <project author="CASE-Collaborative" version="1.0" phase="1.0" created="${now}" modified="${now}" complexity="1" status="Proposed"/>
        <code product_name="Java" gentype="Java"/>
        <style appearance="BackColor=-1;BorderColor=-1;BorderWidth=-1;FontColor=-1;VSwimLanes=1;HSwimLanes=1;BorderStyle=0;"/>
        <tags/>
        <xrefs/>
        <extendedProperties tagged="0" package_name="${escapeXml(modelName)}"/>${classAttributesXml}${classOperationsXml}${classLinksXml}
      </element>`;
  }).join('');

  const classNameMap = new Map(diagram.classes.map(c => [c.id, c.name]));
  const connectorsXml = diagram.relationships.length > 0 ? `
    <connectors>${diagram.relationships.map((rel, rIdx) => {
      const srcName = classNameMap.get(rel.sourceClassId) || 'Source';
      const tgtName = classNameMap.get(rel.targetClassId) || 'Target';
      const eaType = rel.type === 'INHERITANCE' ? 'Generalization' : rel.type === 'REALIZATION' ? 'Realisation' : rel.type === 'DEPENDENCY' ? 'Dependency' : rel.type === 'COMPOSITION' || rel.type === 'AGGREGATION' ? 'Aggregation' : 'Association';
      const subtype = rel.type === 'COMPOSITION' ? ' subtype="Strong"' : rel.type === 'AGGREGATION' ? ' subtype="Weak"' : '';
      const aggregation = rel.type === 'COMPOSITION' ? 'composite' : rel.type === 'AGGREGATION' ? 'shared' : 'none';
      const isAggregationOrComposition = rel.type === 'COMPOSITION' || rel.type === 'AGGREGATION';
      const direction = (rel.type === 'ASSOCIATION' || isAggregationOrComposition) ? 'Unspecified' : 'Source -&gt; Destination';
      return `
      <connector xmi:idref="${escapeXml(rel.id)}" name="${escapeXml(rel.name ?? '')}">
        <source xmi:idref="${escapeXml(rel.sourceClassId)}">
          <model type="Class" name="${escapeXml(srcName)}"/>
          <role visibility="Public" targetScope="instance"/>
          <type multiplicity="${escapeXml(rel.sourceMultiplicity ?? '')}" aggregation="${aggregation}" containment="Unspecified"/>
        </source>
        <target xmi:idref="${escapeXml(rel.targetClassId)}">
          <model type="Class" name="${escapeXml(tgtName)}"/>
          <role visibility="Public" targetScope="instance"/>
          <type multiplicity="${escapeXml(rel.targetMultiplicity ?? '')}" aggregation="none" containment="Unspecified"/>
        </target>
        <model ea_localid="${rIdx + 1}"/>
        <properties ea_type="${eaType}"${subtype} direction="${direction}"/>
        <appearance linemode="3" linecolor="-1" linewidth="0" seqno="0" headStyle="0" lineStyle="0"/>
        <labels lb="${escapeXml(rel.sourceMultiplicity ?? '')}" mt="${escapeXml(rel.name ?? '')}" rb="${escapeXml(rel.targetMultiplicity ?? '')}"/>
      </connector>`;
    }).join('')}
    </connectors>` : '<connectors/>';

  const diagramClassElements = diagram.classes.map((cls, idx) => {
    const width = cls.width ?? 240;
    const height = cls.height ?? 160;
    const left = Math.round(cls.position.x);
    const top = Math.round(cls.position.y);
    const right = left + width;
    const bottom = top + height;
    const duid = toDuid(cls.id);
    return `
          <element geometry="Left=${left};Top=${top};Right=${right};Bottom=${bottom};" subject="${escapeXml(cls.id)}" seqno="${idx + 1}" style="DUID=${escapeXml(duid)};"/>`;
  }).join('');

  const diagramRelElements = diagram.relationships.map(rel => {
    const srcDuid = toDuid(rel.sourceClassId);
    const tgtDuid = toDuid(rel.targetClassId);
    return `
          <element geometry="SX=0;SY=0;EX=0;EY=0;Path=;" subject="${escapeXml(rel.id)}" style="Mode=3;EOID=${escapeXml(tgtDuid)};SOID=${escapeXml(srcDuid)};Color=-1;LWidth=0;Hidden=0;"/>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<xmi:XMI xmi:version="2.1" xmlns:uml="http://schema.omg.org/spec/UML/2.1" xmlns:xmi="http://schema.omg.org/spec/XMI/2.1">
  <xmi:Documentation exporter="Enterprise Architect" exporterVersion="6.5"/>
  <uml:Model xmi:type="uml:Model" name="EA_Model" visibility="public">
    <packagedElement xmi:type="uml:Package" xmi:id="${packageId}" name="${escapeXml(modelName)}" visibility="public">${classes}${relationships}
    </packagedElement>
  </uml:Model>
  <xmi:Extension extender="Enterprise Architect" extenderID="6.5">
    <elements>
      <element xmi:idref="${packageId}" xmi:type="uml:Package" name="${escapeXml(modelName)}" scope="public">
        <model package2="${packageEaId}" package="${packageId}" tpos="0" ea_localid="1" ea_eleType="package"/>
        <properties isSpecification="false" sType="Package" nType="0" scope="public"/>
        <project author="CASE-Collaborative" version="1.0" phase="1.0" created="${now}" modified="${now}" complexity="1" status="Proposed"/>
        <code gentype="Java"/>
        <style appearance="BackColor=-1;BorderColor=-1;BorderWidth=-1;FontColor=-1;VSwimLanes=1;HSwimLanes=1;BorderStyle=0;"/>
        <tags/>
        <xrefs/>
        <extendedProperties tagged="0" package_name="Model"/>
        <packageproperties version="1.0"/>
        <paths/>
        <times created="${now}" modified="${now}"/>
        <flags iscontrolled="FALSE" isprotected="FALSE" usedtd="FALSE" logxml="FALSE" packageFlags="isModel=1;VICON=3;"/>
      </element>${eaElements}
    </elements>${connectorsXml}
    <diagrams>
      <diagram xmi:id="${diagramId}">
        <model package="${packageId}" localID="1" owner="${packageId}"/>
        <properties name="${escapeXml(modelName)}" type="Logical"/>
        <project author="CASE-Collaborative" version="1.0" created="${now}" modified="${now}"/>
        <style1 value="ShowPrivate=1;ShowProtected=1;ShowPublic=1;HideRelationships=0;Locked=0;Border=1;HighlightForeign=1;PackageContents=1;SequenceNotes=0;ScalePrintImage=0;PPgs.cx=0;PPgs.cy=0;DocSize.cx=850;DocSize.cy=1098;ShowDetails=0;Orientation=P;Zoom=100;ShowTags=0;OpParams=1;VisibleAttributeDetail=1;ShowOpRetType=1;ShowIcons=1;CollabNums=0;HideProps=0;ShowReqs=0;ShowCons=0;PaperSize=1;HideParents=0;UseAlias=0;HideAtts=0;HideOps=0;HideStereo=0;HideElemStereo=0;ShowTests=0;ShowMaint=0;ConnectorNotation=UML 2.1;ExplicitNavigability=0;ShowShape=1;AllDockable=0;AdvancedElementProps=1;AdvancedFeatureProps=1;AdvancedConnectorProps=1;m_bElementClassifier=1;SPT=1;ShowNotes=0;SuppressBrackets=0;SuppConnectorLabels=0;PrintPageHeadFoot=0;ShowAsList=0;"/>
        <style2 value="ExcludeRTF=0;DocAll=0;HideQuals=0;AttPkg=1;ShowTests=0;ShowMaint=0;SuppressFOC=1;MatrixActive=0;SwimlanesActive=1;KanbanActive=0;MatrixLineWidth=1;MatrixLineClr=0;MatrixLocked=0;TConnectorNotation=UML 2.1;TExplicitNavigability=0;AdvancedElementProps=1;AdvancedFeatureProps=1;AdvancedConnectorProps=1;m_bElementClassifier=1;SPT=1;MDGDgm=;STBLDgm=;ShowNotes=0;VisibleAttributeDetail=1;ShowOpRetType=1;SuppressBrackets=0;SuppConnectorLabels=0;PrintPageHeadFoot=0;ShowAsList=0;SuppressedCompartments=;Theme=:119;SaveTag=0648B2F6;"/>
        <swimlanes value="locked=false;orientation=0;width=0;inbar=false;names=false;color=-1;bold=false;fcol=0;tcol=-1;ofCol=-1;ufCol=-1;hl=0;ufh=0;hh=0;cls=0;bw=0;hli=0;SwimlaneFont=lfh:-13,lfw:0,lfi:0,lfu:0,lfs:0,lfface:Calibri,lfe:0,lfo:0,lfchar:1,lfop:0,lfcp:0,lfq:0,lfpf=0,lfWidth=0;"/>
        <matrixitems value="locked=false;matrixactive=false;swimlanesactive=true;kanbanactive=false;width=1;clrLine=0;"/>
        <extendedProperties/>
        <elements>${diagramClassElements}${diagramRelElements}
        </elements>
      </diagram>
    </diagrams>
  </xmi:Extension>
</xmi:XMI>`;
};

const parsePosition = (element: XmlNode): { id: string; position: { x: number; y: number } } | null => {
  const id = attr(element, 'subject') ?? attr(element, 'idref');
  if (!id) return null;
  const geometry = attr(element, 'geometry') ?? '';
  const left = /(?:^|;)Left=(-?\d+(?:\.\d+)?)/i.exec(geometry)?.[1] ?? attr(element, 'x');
  const top = /(?:^|;)Top=(-?\d+(?:\.\d+)?)/i.exec(geometry)?.[1] ?? attr(element, 'y');
  if (left === undefined || top === undefined) return null;
  const x = Number(left); const y = Number(top);
  return Number.isFinite(x) && Number.isFinite(y) ? { id, position: { x: Math.max(20, Math.round(x)), y: Math.max(20, Math.round(Math.abs(y))) } } : null;
};

const parseAttributes = (node: XmlNode, knownNames: Set<string>, warnings: string[]): UMLAttribute[] => children(node, 'ownedAttribute').map((attribute, index) => ({
  id: attr(attribute, 'id') ?? `${attr(node, 'id') ?? 'class'}_attribute_${index + 1}`,
  name: attr(attribute, 'name')?.trim() || `atributo${index + 1}`,
  type: normalizeType(typeFromNode(attribute), knownNames, warnings),
  visibility: visibilityFromXmi(attr(attribute, 'visibility')),
}));
const parseMethods = (node: XmlNode, knownNames: Set<string>, warnings: string[]): UMLMethod[] => children(node, 'ownedOperation').map((operation, index) => {
  const parameters = children(operation, 'ownedParameter');
  const returnParameter = parameters.find(parameter => attr(parameter, 'direction') === 'return');
  return {
    id: attr(operation, 'id') ?? `${attr(node, 'id') ?? 'class'}_operation_${index + 1}`,
    name: attr(operation, 'name')?.trim() || `operacion${index + 1}`,
    returnType: normalizeType(typeFromNode(returnParameter ?? {}), knownNames, warnings) || 'void',
    visibility: visibilityFromXmi(attr(operation, 'visibility')),
    parameters: parameters.filter(parameter => attr(parameter, 'direction') !== 'return').map((parameter, parameterIndex) => ({
      name: attr(parameter, 'name')?.trim() || `parametro${parameterIndex + 1}`,
      type: normalizeType(typeFromNode(parameter), knownNames, warnings),
    })),
    isAbstract: attr(operation, 'isAbstract') === 'true',
    isStatic: attr(operation, 'isStatic') === 'true',
  };
});

export const parseXmi = (xml: string): XmiParseResult => {
  if (typeof xml !== 'string' || !xml.trim()) throw new AppError('El archivo XMI está vacío', 400, 'EMPTY_XMI');
  if (Buffer.byteLength(xml, 'utf8') > MAX_XMI_BYTES) throw new AppError('El archivo XMI supera el límite de 5 MB', 413, 'XMI_TOO_LARGE');
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new AppError('El XMI no puede contener DOCTYPE ni entidades externas', 400, 'UNSAFE_XML');
  const validation = XMLValidator.validate(xml);
  if (validation !== true) throw new AppError(`XML XMI inválido: ${validation.err.msg}`, 400, 'INVALID_XMI');
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseAttributeValue: false, trimValues: true, processEntities: false });
  const document = parser.parse(xml) as XmlNode;
  const models = descendants(document, 'model');
  const model = models.find(candidate => {
    const type = attr(candidate, 'type');
    if (type && type.toLowerCase().endsWith('model')) return true;
    return children(candidate, 'packagedElement').length > 0;
  }) ?? models[0];
  if (!model) throw new AppError('El archivo no contiene un modelo UML', 400, 'UML_MODEL_NOT_FOUND');
  const warnings: string[] = [];
  const packaged = descendants(model, 'packagedElement');
  const classNodes = packaged.filter(node => {
    const type = attr(node, 'type')?.toLowerCase();
    return type?.endsWith('class') || type?.endsWith('interface');
  });
  const knownNames = new Set(classNodes.map(node => attr(node, 'name')?.trim().toLowerCase()).filter((name): name is string => Boolean(name)));
  const positionById = new Map(descendants(document, 'element').map(parsePosition).filter((position): position is NonNullable<ReturnType<typeof parsePosition>> => position !== null).map(position => [position.id, position.position]));
  const classes: UMLClass[] = classNodes.map((node, index) => {
    const id = attr(node, 'id') ?? `Class_${index + 1}`;
    return {
      id,
      name: attr(node, 'name')?.trim() || `Clase${index + 1}`,
      isAbstract: attr(node, 'isAbstract') === 'true',
      isInterface: attr(node, 'type')?.toLowerCase().endsWith('interface') ?? false,
      attributes: parseAttributes(node, knownNames, warnings),
      methods: parseMethods(node, knownNames, warnings),
      position: positionById.get(id) ?? { x: 48 + (index % 4) * 280, y: 48 + Math.floor(index / 4) * 220 },
    };
  });
  const classIds = new Set(classes.map(cls => cls.id));
  const relationships: UMLRelationship[] = [];
  classNodes.forEach(node => {
    const sourceClassId = attr(node, 'id');
    if (!sourceClassId) return;
    children(node, 'generalization').forEach((relation, index) => {
      const targetClassId = attr(relation, 'general');
      if (targetClassId && classIds.has(targetClassId)) relationships.push({ id: attr(relation, 'id') ?? `${sourceClassId}_generalization_${index + 1}`, sourceClassId, targetClassId, type: 'INHERITANCE' });
      else warnings.push(`Se omitió una generalización de "${sourceClassId}" porque su destino no existe.`);
    });
    children(node, 'interfaceRealization').forEach((relation, index) => {
      const targetClassId = attr(relation, 'contract') ?? attr(relation, 'supplier');
      if (targetClassId && classIds.has(targetClassId)) relationships.push({ id: attr(relation, 'id') ?? `${sourceClassId}_realization_${index + 1}`, sourceClassId, targetClassId, type: 'REALIZATION', name: attr(relation, 'name') || undefined });
      else warnings.push(`Se omitió una realización de "${sourceClassId}" porque su destino no existe.`);
    });
  });
  packaged.forEach((node, index) => {
    const rawType = attr(node, 'type')?.toLowerCase() ?? '';
    if (rawType.endsWith('association')) {
      const ends = children(node, 'ownedEnd');
      const getEndType = (endNode: XmlNode | undefined) => {
        if (!endNode) return undefined;
        const direct = attr(endNode, 'type');
        if (direct && !direct.toLowerCase().startsWith('uml:')) return direct;
        const typeChild = children(endNode, 'type')[0];
        return typeChild ? attr(typeChild, 'idref') ?? attr(typeChild, 'href') : undefined;
      };
      const srcEnd = ends.find(e => (attr(e, 'id') ?? '').includes('src')) ?? ends[0];
      const dstEnd = ends.find(e => (attr(e, 'id') ?? '').includes('dst')) ?? (srcEnd === ends[0] ? ends[1] : ends[0]);
      const sourceClassId = getEndType(srcEnd);
      const targetClassId = getEndType(dstEnd);
      if (!sourceClassId || !targetClassId || !classIds.has(sourceClassId) || !classIds.has(targetClassId)) {
        warnings.push(`Se omitió la asociación "${attr(node, 'name') ?? attr(node, 'id') ?? index + 1}" porque sus extremos no son válidos.`);
        return;
      }
      const aggregation = attr(srcEnd, 'aggregation') ?? attr(dstEnd, 'aggregation');
      const type: UMLRelationshipType = aggregation === 'composite' ? 'COMPOSITION' : aggregation === 'shared' ? 'AGGREGATION' : 'ASSOCIATION';
      relationships.push({ id: attr(node, 'id') ?? `Association_${index + 1}`, sourceClassId, targetClassId, type, name: attr(node, 'name') || undefined, sourceRole: attr(srcEnd, 'name') || undefined, targetRole: attr(dstEnd, 'name') || undefined, sourceMultiplicity: readMultiplicity(srcEnd), targetMultiplicity: readMultiplicity(dstEnd) });
      return;
    }
    if (rawType.endsWith('dependency') || rawType.endsWith('usage') || rawType.endsWith('realization')) {
      const sourceClassId = attr(node, 'client') ?? attr(node, 'specific');
      const targetClassId = attr(node, 'supplier') ?? attr(node, 'general');
      if (sourceClassId && targetClassId && classIds.has(sourceClassId) && classIds.has(targetClassId)) relationships.push({ id: attr(node, 'id') ?? `Relation_${index + 1}`, sourceClassId, targetClassId, type: rawType.endsWith('realization') ? 'REALIZATION' : 'DEPENDENCY', name: attr(node, 'name') || undefined });
    }
  });
  const diagram: UMLDiagramAST = { version: 1, nombre: attr(model, 'name') || undefined, classes, relationships };
  return {
    diagram,
    warnings: [...new Set(warnings)],
    summary: {
      classes: classes.filter(cls => !cls.isInterface).length,
      interfaces: classes.filter(cls => cls.isInterface).length,
      attributes: classes.reduce((total, cls) => total + cls.attributes.length, 0),
      methods: classes.reduce((total, cls) => total + cls.methods.length, 0),
      relationships: relationships.length,
    },
  };
};

const uniqueId = (preferred: string, used: Set<string>) => {
  if (!used.has(preferred)) { used.add(preferred); return preferred; }
  let suffix = 2;
  while (used.has(`${preferred}_imported_${suffix}`)) suffix += 1;
  const id = `${preferred}_imported_${suffix}`;
  used.add(id);
  return id;
};
const normalizedName = (value: string) => value.trim().toLocaleLowerCase('es');

export const mergeUmlDiagrams = (current: UMLDiagramAST, imported: UMLDiagramAST): UMLDiagramAST => {
  const classes = structuredClone(current.classes);
  const relationships = structuredClone(current.relationships);
  const usedClassIds = new Set(classes.map(cls => cls.id));
  const usedMemberIds = new Set(classes.flatMap(cls => [...cls.attributes.map(attribute => attribute.id), ...cls.methods.map(method => method.id)]));
  const idMap = new Map<string, string>();
  imported.classes.forEach(incoming => {
    const existing = classes.find(cls => normalizedName(cls.name) === normalizedName(incoming.name));
    if (existing) {
      idMap.set(incoming.id, existing.id);
      const attributeNames = new Set(existing.attributes.map(attribute => normalizedName(attribute.name)));
      incoming.attributes.forEach(attribute => {
        if (attributeNames.has(normalizedName(attribute.name))) return;
        const cloned = structuredClone(attribute);
        cloned.id = uniqueId(cloned.id, usedMemberIds);
        existing.attributes.push(cloned);
        attributeNames.add(normalizedName(attribute.name));
      });
      const methodSignatures = new Set(existing.methods.map(method => `${normalizedName(method.name)}(${method.parameters.map(parameter => normalizedName(parameter.type)).join(',')})`));
      incoming.methods.forEach(method => {
        const signature = `${normalizedName(method.name)}(${method.parameters.map(parameter => normalizedName(parameter.type)).join(',')})`;
        if (methodSignatures.has(signature)) return;
        const cloned = structuredClone(method);
        cloned.id = uniqueId(cloned.id, usedMemberIds);
        existing.methods.push(cloned);
        methodSignatures.add(signature);
      });
      return;
    }
    const cloned = structuredClone(incoming);
    cloned.id = uniqueId(cloned.id, usedClassIds);
    idMap.set(incoming.id, cloned.id);
    cloned.attributes = cloned.attributes.map(attribute => ({ ...attribute, id: uniqueId(attribute.id, usedMemberIds) }));
    cloned.methods = cloned.methods.map(method => ({ ...method, id: uniqueId(method.id, usedMemberIds) }));
    classes.push(cloned);
  });
  const usedRelationshipIds = new Set(relationships.map(relation => relation.id));
  const relationKeys = new Set(relationships.map(relation => `${relation.type}|${relation.sourceClassId}|${relation.targetClassId}|${normalizedName(relation.name ?? '')}`));
  imported.relationships.forEach(incoming => {
    const sourceClassId = idMap.get(incoming.sourceClassId);
    const targetClassId = idMap.get(incoming.targetClassId);
    if (!sourceClassId || !targetClassId) return;
    const key = `${incoming.type}|${sourceClassId}|${targetClassId}|${normalizedName(incoming.name ?? '')}`;
    if (relationKeys.has(key)) return;
    relationships.push({ ...structuredClone(incoming), id: uniqueId(incoming.id, usedRelationshipIds), sourceClassId, targetClassId });
    relationKeys.add(key);
  });
  return { ...structuredClone(current), classes, relationships };
};

export type XmiImportStrategy = 'replace' | 'merge';

export interface XmiImportInput {
  content: string;
  strategy: XmiImportStrategy;
  expectedVersion: number;
}

export interface XmiImportResult extends XmiParseResult {
  validationReport: UmlValidationReport;
}

export interface XmiImportEvent {
  sessionId: string;
  diagram: UMLDiagramAST;
  summary: XmiImportSummary;
  warnings: string[];
  validationReport: UmlValidationReport;
}

const SESSION_ID_PATTERN = /^[\da-f]{8}-([\da-f]{4}-){3}[\da-f]{12}$/i;

const assertSessionId = (sessionId: string) => {
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    throw new AppError('Identificador de sesión inválido', 400, 'INVALID_ID');
  }
};

const safeFileStem = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 80) || 'modelo';

export class XmiSessionService {
  private readonly listeners = new Set<(event: XmiImportEvent) => void>();

  constructor(private readonly repository: DiagramRepository) {}

  subscribe(listener: (event: XmiImportEvent) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async export(sessionId: string, userId: string): Promise<{ xml: string; filename: string }> {
    assertSessionId(sessionId);
    return this.repository.run(sessionId, userId, async (context, storage) => {
      if (!context.canRead) throw new AppError('No perteneces a esta sesión', 403, 'FORBIDDEN');
      if (!context.isHost) throw new AppError('Solo el anfitrión puede exportar el modelo', 403, 'ONLY_HOST_ALLOWED');
      const diagram = await storage.load();
      return {
        xml: serializeXmi(diagram, diagram.nombre ?? context.proyectoNombre),
        filename: `${safeFileStem(context.proyectoNombre)}.xmi`,
      };
    });
  }

  async import(sessionId: string, userId: string, input: XmiImportInput): Promise<XmiImportResult> {
    assertSessionId(sessionId);
    if (!input || (input.strategy !== 'replace' && input.strategy !== 'merge')) {
      throw new AppError('Estrategia de importación inválida', 400, 'INVALID_IMPORT_STRATEGY');
    }
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) {
      throw new AppError('Versión esperada inválida', 400, 'INVALID_VERSION');
    }

    const result = await this.repository.run(sessionId, userId, async (context, storage) => {
      if (!context.canRead) throw new AppError('No perteneces a esta sesión', 403, 'FORBIDDEN');
      if (!context.isHost) throw new AppError('Solo el anfitrión puede importar modelos', 403, 'ONLY_HOST_ALLOWED');
      if (context.estado !== 'ABIERTA' || context.proyectoEstado !== 'ACTIVO') {
        throw new AppError('La sesión o el proyecto ya no admite cambios', 409, 'SESSION_CLOSED');
      }

      const current = await storage.load();
      if (current.version !== input.expectedVersion) {
        throw new AppError('Hay una versión más reciente. Actualiza el diagrama antes de importar.', 409, 'DIAGRAM_CONFLICT');
      }

      const parsed = parseXmi(input.content);
      const candidate = input.strategy === 'merge'
        ? mergeUmlDiagrams(current, parsed.diagram)
        : parsed.diagram;
      const nextVersion = current.version + 1;
      const structurallyValid = parseDiagram({ ...candidate, version: nextVersion });
      const next: UMLDiagramAST = {
        ...structurallyValid,
        nombre: candidate.nombre ?? current.nombre ?? context.proyectoNombre,
      };
      const validationReport = validateUmlDiagram(next);
      const diagram = await storage.save(next);
      return { diagram, warnings: parsed.warnings, summary: parsed.summary, validationReport };
    });

    const event: XmiImportEvent = { sessionId, ...result };
    this.listeners.forEach(listener => listener(event));
    return result;
  }
}

// Spanish aliases retained because the approved plan names this public API explicitly.
export const serializarXMI = serializeXmi;
export const parsearXMI = parseXmi;
