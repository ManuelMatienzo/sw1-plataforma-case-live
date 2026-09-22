import { ArrowRight, Boxes } from 'lucide-react';
import { Link } from 'react-router-dom';
import UmlToCodePreview from '../components/landing/UmlToCodePreview';
import './LandingPage.css';

const capabilities = [
  {
    id: 'uml:model',
    title: 'Modela',
    description: 'Diagramas UML 2.5, comandos de voz e importación desde XMI o una pizarra.',
  },
  {
    id: 'team:sync',
    title: 'Colabora',
    description: 'Sesiones compartidas, presencia de participantes y permisos de edición.',
  },
  {
    id: 'code:gen',
    title: 'Genera',
    description: 'PostgreSQL, Spring Boot, Postman y una futura aplicación móvil con IA offline.',
  },
] as const;

const flowSteps = ['UML validado', 'Modelo lógico 3FN', 'PostgreSQL', 'Spring Boot + Postman'] as const;

const LandingPage = () => (
  <div className="landing-page" id="top">
    <a className="skip-link" href="#main-content">
      Saltar al contenido
    </a>

    <header className="landing-header">
      <div className="landing-shell landing-header__inner">
        <a className="brand" href="#top" aria-label="CASE IA, volver al inicio">
          <span className="brand__mark" aria-hidden="true">
            <Boxes size={20} strokeWidth={1.8} />
          </span>
          <span>CASE IA</span>
        </a>

        <nav className="landing-nav" aria-label="Navegación principal">
          <a href="#resumen">Resumen</a>
          <a href="#flujo">Flujo</a>
        </nav>

        <Link className="button button--small" to="/login">
          Iniciar sesión
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </header>

    <main id="main-content">
      <section className="hero landing-shell" aria-labelledby="hero-title">
        <div className="hero__copy">
          <h1 id="hero-title">Del diagrama de clases a un backend listo para probar.</h1>
          <p className="hero__description">
            Una plataforma CASE colaborativa para modelar, validar y transformar UML en PostgreSQL,
            Spring Boot y colecciones Postman.
          </p>
          <div className="hero__actions">
            <Link className="button" to="/login">
              Entrar a la plataforma
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <a className="button button--secondary" href="#flujo">
              Ver cómo funciona
            </a>
          </div>
          <p className="academic-note">Demostración académica · Software 1</p>
        </div>

        <UmlToCodePreview />
      </section>

      <section
        className="capabilities landing-shell"
        id="resumen"
        aria-labelledby="capabilities-title"
      >
        <div className="section-heading">
          <h2 id="capabilities-title">Resumen de capacidades</h2>
          <p>Las piezas esenciales de un flujo CASE integrado, presentadas sin promesas artificiales.</p>
        </div>

        <div className="capability-list">
          {capabilities.map((capability) => (
            <article className="capability-row" key={capability.id}>
              <code>{capability.id}</code>
              <h3>{capability.title}</h3>
              <p>{capability.description}</p>
            </article>
          ))}
        </div>

        <p className="project-context">
          La plataforma busca reducir trabajo manual y ayudar a afrontar la brecha entre una
          estimación tradicional de 12 meses y un plazo contractual de 6 meses.
        </p>
      </section>

      <section className="product-flow" id="flujo" aria-labelledby="flow-title">
        <div className="landing-shell">
          <div className="section-heading section-heading--flow">
            <h2 id="flow-title">Flujo del producto</h2>
            <p>Un mismo modelo alimenta cada artefacto para conservar la trazabilidad.</p>
          </div>

          <ol className="flow-band">
            {flowSteps.map((step, index) => (
              <li className="flow-step" key={step}>
                <span className="flow-step__index">{String(index + 1).padStart(2, '0')}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="closing landing-shell" aria-labelledby="closing-title">
        <h2 id="closing-title">Modela una vez. Genera los artefactos que tu equipo necesita.</h2>
        <Link className="button" to="/login">
          Ingresar a la plataforma
          <ArrowRight size={18} aria-hidden="true" />
        </Link>
      </section>
    </main>

    <footer className="landing-footer">
      <div className="landing-shell landing-footer__inner">
        <span>Plataforma CASE Colaborativa con IA</span>
        <span>Proyecto académico SW1</span>
      </div>
    </footer>
  </div>
);

export default LandingPage;
