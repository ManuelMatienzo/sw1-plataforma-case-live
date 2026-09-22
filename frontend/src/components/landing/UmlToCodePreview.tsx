import { ArrowRight } from 'lucide-react';

const UmlToCodePreview = () => (
  <figure className="uml-preview" aria-labelledby="preview-title">
    <figcaption className="preview-caption">
      <span id="preview-title">Ejemplo ilustrativo</span>
      <span className="preview-file">Paciente.java</span>
    </figcaption>

    <div className="preview-content">
      <div className="uml-class" aria-label="Clase UML Paciente">
        <div className="uml-class__name">Paciente</div>
        <div className="uml-class__section">
          <span>− id: Long</span>
          <span>− nombre: String</span>
          <span>− ci: String</span>
        </div>
        <div className="uml-class__section">
          <span>+ registrar()</span>
        </div>
      </div>

      <div className="preview-bridge" aria-hidden="true">
        <span>transformar</span>
        <ArrowRight size={20} strokeWidth={1.75} />
      </div>

      <pre className="code-preview" aria-label="Ejemplo de entidad Java generada">
        <code>
          <span className="code-annotation">@Entity</span>{'\n'}
          <span className="code-annotation">@Table</span>(name ={' '}
          <span className="code-string">&quot;paciente&quot;</span>){'\n'}
          <span className="code-keyword">public class</span> Paciente {'{'}{'\n'}
          {'  '}<span className="code-annotation">@Id</span>{'\n'}
          {'  '}<span className="code-annotation">@GeneratedValue</span>({'\n'}
          {'    '}strategy ={'\n'}
          {'      '}GenerationType.IDENTITY){'\n'}
          {'  '}<span className="code-keyword">private</span> Long id;{'\n'}
          {'  '}<span className="code-keyword">private</span> String nombre;{'\n'}
          {'}'}
        </code>
      </pre>
    </div>
  </figure>
);

export default UmlToCodePreview;
