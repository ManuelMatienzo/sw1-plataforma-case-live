# Editor UML · /sesion/:sesionId

## Direction contract

THESIS: El diagrama es el área de trabajo central; herramientas y propiedades sirven al modelado sin métricas decorativas.

OWN-WORLD: Extensión del sistema CASE IA. Sora para controles, JetBrains Mono para firmas UML, superficies azul noche, bordes sólidos y foco índigo.

STORY: Crear una clase, editar miembros, colaborar mediante deltas y cursores remotos, conectar un segundo elemento y guardar la versión. El anfitrión administra colaboradores y permisos sin abandonar el lienzo, e intercambia el modelo mediante XMI con una decisión explícita entre fusionar y reemplazar; presencia, conexión, guardado y permisos permanecen visibles.

FIRST VIEWPORT: Cabecera compacta con proyecto, sesión, presencia autenticada, administración de colaboradores e intercambio XMI para el anfitrión, permiso y guardar; barra de herramientas y lienzo de puntos con cursores remotos; propiedades a la derecha. En móvil las propiedades pasan debajo del lienzo y los diálogos de sesión se anclan al borde inferior. La interacción distintiva es editar el mismo modelo con presencia visible y aplicar una importación XMI validada de forma atómica sin interferir con el lienzo.

FORM: Operate, code-led; extensión del workspace con estructura ya aprobada en CU-05. Seed: no aplica.

FINISH: revisado el 2026-09-21 para CU-09 con veredicto pass. La vista previa, fusión segura, reemplazo advertido, difusión atómica y nombre de descarga quedaron verificados; `Content-Disposition` se expone por CORS. Documentado en DESIGN.md y .impeccable/design.json; validado sin desbordamiento entre 320 y 1440 px y con capturas de revisión que no son assets de producción.
