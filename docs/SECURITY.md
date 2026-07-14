# ClipAI SaaS — Security Foundation

## 1. Estado y propósito del documento

| Campo | Valor |
| --- | --- |
| Documento | `06 — Security Foundation` |
| Versión | `0.3` |
| Estado | `Approved as initial security baseline` |
| Estado de implementación | `Partial — identity persistence implemented` |
| Fase | Fase 1 — Internal Alpha |
| Última actualización | 2026-07-13 |

Este documento define la línea base de seguridad objetivo para el MVP de
ClipAI. Establece activos, límites de confianza, amenazas, controles mínimos y
criterios de verificación que deberán respetarse cuando se autorice la
construcción del producto.

No implementa controles, no certifica el sistema, no constituye asesoría legal
ni afirma cumplimiento con una norma o regulación. Tampoco selecciona un
authentication provider, hosting platform, región, object storage, proveedor de
IA, mecanismo de transcripción ni herramienta de observabilidad.

La Security Foundation complementa el Product Charter, la Architecture
Foundation, el Architecture Decision Register, la Data Model Foundation y la
API Foundation. Si una implementación exige cambiar una decisión aceptada, el
cambio deberá registrarse antes de modificar este baseline.

Los términos técnicos, nombres de headers, estados, campos y componentes se
mantienen en English aunque el contenido esté escrito en español.

## 2. Objetivos y principios de seguridad

Los objetivos prioritarios del MVP son:

1. **Aislamiento entre tenants.** Un usuario no debe conocer ni acceder a
   recursos de otro `Workspace`.
2. **Protección del contenido.** Fuentes, archivos, transcripts, análisis y
   recomendaciones deben permanecer accesibles solo para actores autorizados.
3. **Integridad del procesamiento.** Entradas externas, providers y modelos no
   deben convertir datos no validados en estado autoritativo.
4. **Control de privilegios y costes.** Solo el backend puede ejecutar llamadas
   privilegiadas, reservar uso o iniciar trabajo que genere coste.
5. **Disponibilidad proporcional al MVP.** Abuso, payloads costosos, fallos de
   providers y retries no deben agotar de forma descontrolada la API, el worker
   ni PostgreSQL.
6. **Trazabilidad segura.** Los incidentes y acciones sensibles deben poder
   investigarse sin registrar secretos ni contenido completo por defecto.
7. **Minimización.** ClipAI recopilará, compartirá y conservará solo los datos
   necesarios para finalidades aprobadas.

Estos objetivos se aplican mediante los siguientes principios:

- **Deny by default.** La ausencia de una autorización explícita produce
  rechazo, no acceso implícito.
- **Backend autoritativo.** El browser nunca decide identidad, tenant,
  permisos, uso ni transiciones de dominio.
- **Least privilege.** Personas, procesos, credenciales y providers reciben el
  alcance mínimo y durante el tiempo mínimo necesario.
- **Defense in depth.** Ningún ID opaco, validación de frontend, firma, firewall
  o control aislado se considera suficiente por sí mismo.
- **Datos externos no confiables.** Requests, URLs, archivos, metadata,
  transcripts, outputs de IA, webhooks y errores de providers se validan antes
  de producir efectos.
- **Fail safely.** Un fallo no debe abrir acceso, duplicar cargos, filtrar
  detalles internos ni dejar una operación sensible en estado ambiguo.
- **Controles verificables.** Cada control crítico debe tener una prueba o una
  evidencia operativa revisable antes del lanzamiento.

## 3. Alcance, supuestos y non-goals

### Alcance del baseline

Esta versión cubre el frontend first-party, la API, el worker, PostgreSQL, el
posible object storage, las integraciones externas, el pipeline de entrega y el
acceso operativo del equipo. Protege el recorrido desde la autenticación hasta
la eliminación de datos y considera tanto requests HTTP como ejecución
asíncrona.

El threat model asume:

- una aplicación pública accesible desde Internet;
- un `Workspace` personal por usuario durante el MVP;
- contenido privado proporcionado o autorizado por el usuario;
- procesamiento server-side mediante providers externos todavía no elegidos;
- una API y un worker del mismo backend y release;
- PostgreSQL como system of record; y
- un equipo pequeño que debe limitar carga operativa y accesos privilegiados.

### Non-goals de esta versión

- declarar cumplimiento con SOC 2, ISO 27001, GDPR, CCPA u otra norma;
- diseñar roles de equipo, SSO empresarial, SCIM o una API pública;
- construir un Security Operations Center o infraestructura multi-region;
- definir controles para edición o publicación automática de clips, que están
  fuera del MVP;
- crear criptografía propia, un identity provider propio o un sistema genérico
  de policy-as-code; y
- sustituir revisión legal de privacidad, términos, propiedad intelectual,
  notificaciones o residencia de datos.

## 4. Activos y clasificación de datos

La clasificación determina el control más estricto aplicable cuando un dato
pertenece a más de una categoría.

| Clase | Ejemplos | Tratamiento mínimo |
| --- | --- | --- |
| `Restricted` | Passwords si llegaran a existir, session tokens, API keys, database credentials, webhook secrets, encryption keys, recovery codes | Nunca en repositorio, dominio, browser, analytics ni logs; acceso excepcional, cifrado, rotación y auditoría. |
| `Confidential` | PII, archivos de video o audio, transcripts, prompts con contenido, análisis, recomendaciones, source references privadas, datos de soporte | Acceso por tenant y finalidad, cifrado en tránsito y reposo donde aplique, no-cache, minimización, retención y eliminación definidas. |
| `Internal` | IDs internos, metadata operativa, métricas agregadas, configuración no secreta, versiones de prompt y schema | Acceso limitado al producto o equipo; no publicar sin revisión. |
| `Public` | Contenido de marketing aprobado, documentación pública futura, respuestas mínimas de health checks | Puede exponerse deliberadamente; no debe inferir topología, clientes ni estado interno. |

### Matriz práctica de clasificación

`Pending` en la columna de retención significa que la categoría está
identificada, pero su periodo, evento de inicio, excepciones y proceso de purga
todavía no han sido aprobados. Esta matriz no crea periodos de retención. En
esta versión ninguna categoría tiene una política final con estado `Approved`.

| Activo | Data class | Motivo de la clasificación | Regla mínima de acceso | Regla de logging | Estado de retención |
| --- | --- | --- | --- | --- | --- |
| Marketing content | `Public` | Está destinado a publicación después de revisión y no debe contener datos privados del producto o de usuarios. | Lectura pública solo después de aprobación; creación y cambios limitados a personal autorizado. | Registrar actor, versión y resultado de publicación cuando aplique; no duplicar el contenido completo en logs operativos. | `Pending` |
| User profile information | `Confidential` | Puede contener PII, preferencias y datos que identifican o describen al usuario. | Usuario autenticado sobre su propio perfil, servicios necesarios y soporte excepcional con mínimo privilegio. | Usar `userId` interno cuando sea necesario; no registrar email, nombre u otra PII por defecto. | `Pending` |
| `Workspace` y `Project` metadata | `Confidential` | Títulos, estados, actividad e IDs describen trabajo privado y relaciones del tenant. | Solo miembros autorizados del workspace —el owner personal en el MVP— y servicios con scope por `workspaceId`. | Se permiten IDs internos, estado y resultado operativo; no títulos ni metadata libre por defecto. | `Pending` |
| Source references | `Confidential` | URLs, object references y metadata pueden revelar contenido privado, ubicaciones, permisos o tokens temporales. | Workspace autorizado y adaptadores server-side que procesan la Source; acceso temporal y de finalidad limitada. | Registrar `sourceId`, tipo y resultado; no URLs completas, query strings, signed URLs ni nombres sensibles. | `Pending` |
| Video y audio files | `Confidential` | Contienen material del usuario o de terceros y pueden incluir imagen, voz, PII y propiedad intelectual. | Usuario autorizado y procesos de ingestión, transcripción o eliminación mediante referencias privadas de corta duración. | Registrar object ID opaco, tamaño, tipo validado y estado; nunca bytes, contenido ni signed URL. | `Pending` |
| Transcripts y `TranscriptSegment` | `Confidential` | Reproducen el contenido hablado y pueden contener PII, información sensible y material protegido. | Workspace autorizado y servicios de transcripción, análisis, soporte aprobado o eliminación con necesidad explícita. | Registrar IDs, versión, conteos, duración y resultado de validación; no texto ni segmentos completos. | `Pending` |
| AI system prompts | `Internal` | Contienen instrucciones, reglas y lógica propietaria; la plantilla no debe incluir secretos ni datos de usuario persistentes. | Backend y personal de ingeniería autorizado; nunca se entregan como contrato al browser o al usuario. | Registrar `promptVersion` y resultado; no el prompt completo por defecto. | `Pending` |
| AI outputs y `ClipRecommendation` | `Confidential` | Se derivan de contenido privado y constituyen resultados propios de un workspace. | Workspace autorizado y servicios que validan, almacenan o presentan el resultado. | Registrar `analysisId`, schema version, conteos y validación; no output completo, rationale ni recomendaciones. | `Pending` |
| Authentication identifiers | `Confidential` | `authSubject`, email e identificadores externos permiten correlacionar la identidad y pueden ser PII. | Módulo de authentication y procesos estrictamente necesarios; soporte solo con autorización y trazabilidad. | Preferir `userId` interno; no registrar `authSubject`, email ni identificadores externos por defecto. | `Pending` |
| Session tokens y provider credentials | `Restricted` | Conceden acceso directo o privilegios sobre cuentas, datos, infraestructura o servicios con coste. | Solo el componente que los necesita; acceso humano excepcional, temporal y auditable. | Nunca registrar valores, hashes reutilizables, cookies, authorization headers ni signatures; redacción antes del sink. | `Pending` |
| `UsageReservation` y `UsageLedgerEntry` data | `Confidential` | Revela consumo, capacidad y actividad comercial; su integridad afecta límites y conciliación. | Workspace autorizado para lectura permitida; escritura solo por el módulo `usage` mediante operaciones transaccionales e idempotentes. | Registrar IDs, tipo de movimiento y resultado cuando sea necesario; no idempotency keys completas ni detalles comerciales innecesarios. | `Pending` |
| Payment references | `Confidential` | Vinculan eventos comerciales con un usuario o workspace, aunque no deben contener instrumentos ni credenciales de pago. | Módulo de billing futuro y personal autorizado de soporte o conciliación con mínimo privilegio. | Usar IDs internos y estado seguro; no payment instruments, secrets, payloads completos ni referencias externas completas. | `Pending` |
| Logs, metrics, traces y error events | `Confidential` | Contienen topología, actividad, IDs y contexto operativo que puede facilitar correlación o ataque. | Servicios emisores y personal operativo autorizado; acceso segmentado, individual y auditable. | Aplicar minimización y redacción antes de almacenar; nunca convertir observabilidad en una copia de contenido, PII o secretos. | `Pending` |

Los siguientes activos también requieren protección aunque no sean contenido de
usuario:

- integridad de `UsageReservation` y `UsageLedgerEntry`;
- estados e idempotencia de `ProcessingJob` y queue jobs;
- prompts del sistema, schemas de salida y reglas de validación;
- repositorio, CI/CD, artefactos y configuración de despliegue;
- backups, logs, métricas, traces y herramientas de soporte; y
- cuentas de cloud, DNS, dominio, source control y providers.

Los datos de producción no se copiarán a entornos locales, demos o tests. Una
excepción requerirá finalidad aprobada, minimización o anonimización, acceso
temporal y eliminación verificable.

## 5. Actores y límites de confianza

### Actores relevantes

| Actor | Consideración de seguridad |
| --- | --- |
| Usuario legítimo | Puede equivocarse, perder su sesión o intentar acceder a IDs ajenos sin que ello conceda acceso. |
| Atacante no autenticado | Puede enumerar rutas, credenciales, recursos, errores y límites públicos. |
| Usuario autenticado malicioso | Puede manipular IDs, concurrencia, idempotency keys, fuentes y payloads para cruzar tenants o generar coste. |
| Contenido malicioso | Puede incluir prompt injection, payloads activos, metadata engañosa o estructuras diseñadas para agotar recursos. |
| Provider externo | Puede fallar, enviar datos inválidos, sufrir compromiso o retener información bajo sus propias condiciones. |
| Dependencia comprometida | Puede ejecutar durante desarrollo, build o runtime con los privilegios del proceso. |
| Operador o cuenta privilegiada | Puede acceder por error o abuso; sus privilegios deben ser mínimos, individuales y auditables. |

### Límites de confianza

1. **Internet — frontend/CDN.** Todo input y header del cliente es no
   confiable.
2. **Frontend — API.** La sesión prueba identidad según el mecanismo elegido;
   el frontend no prueba autorización ni tenant.
3. **API — módulos de dominio.** Controllers validan la forma; services aplican
   autorización, invariantes y efectos. Ninguna ruta accede directamente a
   data access.
4. **API/worker — PostgreSQL.** Las queries deben conservar el contexto de
   `Workspace` y usar una identidad de base de datos con privilegios mínimos.
5. **API — queue — worker.** Un queue message no es una autorización. El worker
   carga el `ProcessingJob` durable y vuelve a validar estado, ownership e
   invariantes antes de actuar.
6. **Backend — providers.** Solo adaptadores server-side pueden enviar datos o
   credenciales. Inputs y responses se consideran no confiables.
7. **Backend — object storage.** Las referencias son opacas; el acceso a objetos
   privados es server-side o temporal y de alcance mínimo.
8. **Producción — equipo y tooling.** Soporte, logs, dashboards, base de datos y
   despliegues requieren identidades individuales, MFA y trazabilidad.

## 6. Threat model inicial

`Likelihood` representa la exposición inicial esperada, no el riesgo residual
después de implementar controles. `High` indica una amenaza probable en el
flujo normal o ante input hostil; `Medium`, una amenaza creíble que depende en
parte de decisiones técnicas; y `Low`, condiciones menos frecuentes o con
prerrequisitos fuertes. `Impact` estima el peor efecto razonable sobre
confidencialidad, integridad, disponibilidad, coste o usuarios.

| Threat | Affected asset | Likelihood | Impact | Initial mitigation | Launch-blocking | Owner o decision dependency |
| --- | --- | --- | --- | --- | --- | --- |
| Account takeover | User profile, Workspace content, sessions y usage | `Medium` | `Critical` | Provider revisado, lifecycle y revocación de sesión, transporte protegido, recovery seguro, rate limits y señales de abuso. | `Yes` | Backend + Product / authentication y session model. |
| Broken object-level authorization | `Workspace`, `Project`, Source, Transcript, Analysis y usage data | `High` | `Critical` | Resolver `workspaceId` server-side, scope obligatorio en data access, not-found uniforme y integration tests con dos tenants. | `Yes` | Backend + Data / repositories y queries con workspace scope. |
| Tenant injection o mass assignment | Ownership, estados de dominio y relaciones entre recursos | `High` | `Critical` | Schemas allowlist, rechazo de campos desconocidos, tenant inmutable y campos reservados controlados por services. | `Yes` | Backend + API / runtime validation y ownership rules. |
| SSRF | Network boundary, cloud metadata, internal services y credentials | `Medium` | `Critical` | Protocolos y destinos permitidos, resolución y redirects seguros, bloqueo de rangos internos, límites de fetch y egress restringido. | `Conditional` | Backend + Infrastructure / Source acquisition, DNS y egress design. |
| Malicious uploads | Storage, parsers, worker, availability y user content | `Medium` | `Critical` | Storage privado y no ejecutable, validación real de tipo, límites, quarantine, scanning basado en riesgo y timeouts. | `Conditional` | Backend + Infrastructure / upload formats, storage y processing flow. |
| Prompt injection | AI system prompts, transcripts, provider boundary y analysis integrity | `High` | `High` | Tratar contenido como datos, separar instrucciones, no exponer secretos ni tools amplias, minimizar contexto y validar toda salida. | `Yes` | AI integration + Backend / provider y prompt contract. |
| Invalid AI output | `Analysis`, `ClipRecommendation`, timestamps y confianza del usuario | `High` | `High` | Schema estricto, límites, validación semántica y referencial, timestamps respaldados y retries de reparación acotados. | `Yes` | AI integration + Backend / output schema y validation rules. |
| Forged o replayed webhooks | Billing state, provider callbacks, jobs y ledger | `Medium` | `Critical` | Firma oficial, body exacto, timestamp o nonce, replay window, event ID idempotente, schema y transición de estado validada. | `Conditional` | Backend + provider integration / webhook mechanism y event lifecycle. |
| Duplicate jobs o ledger movements | `ProcessingJob`, `UsageReservation`, `UsageLedgerEntry` y provider cost | `High` | `High` | Idempotencia por workspace, unique constraints, locks, transacciones, side-effect IDs y retries sobre el mismo job. | `Yes` | Backend + Data / queue library y usage policy. |
| Secret leakage | Sessions, provider credentials, database, CI/CD e infrastructure | `Medium` | `Critical` | Secrets fuera de Git y bundles, storage seguro, mínimo scope, redacción antes del sink, scanning, rotación y revocación. | `Yes` | Engineering + Infrastructure / secret management y CI/CD design. |
| Supply-chain compromise | Source code, build, CI/CD, runtime y production data | `Medium` | `Critical` | Dependencias mínimas, lockfiles, revisión de packages y install scripts, scanning, CI con mínimo privilegio y builds reproducibles. | `Yes` | Engineering / dependency governance y security tooling. |
| Sensitive-data exposure | PII, Sources, media, transcripts, AI outputs y telemetry | `Medium` | `Critical` | TLS, access control, encryption gestionado, no-cache, minimización, redacción y data lifecycle definido. | `Yes` | Engineering + Product / data inventory, infrastructure y privacy decisions. |
| Denial of wallet | Provider quota, usage capacity, worker y operating budget | `High` | `High` | Rate limits, quotas, reservas previas, concurrency caps, timeouts, retries acotados, budget limits y alertas de coste. | `Yes` | Backend + Product / provider limits y commercial usage rules. |
| Privileged-account compromise | Source control, CI/CD, hosting, database, storage, DNS y providers | `Medium` | `Critical` | Identidades individuales, MFA, separación de entornos, mínimo privilegio, acceso temporal y audit logs. | `Yes` | Operations / hosting, identity y privileged-access design. |
| Incomplete data deletion | Media, transcripts, AI outputs, PII, logs, providers y backups | `Medium` | `High` | Inventario de datos, workflow idempotente, bloqueo de nuevas operaciones, purga coordinada, anonymization y evidencia de ejecución. | `Yes` | Backend + Product + Legal + Infrastructure / retention y deletion policy. |

Estas valoraciones son provisionales y deberán reevaluarse cuando se elijan
authentication, hosting, storage, AI, transcription, billing y monitoring
providers, así como después de definir infraestructura, tipos de Source y
flujos de soporte. La selección puede cambiar `Likelihood`, `Impact`, controles
y owner, pero no puede eliminar una amenaza sin evidencia revisada.

### Regla de launch blocking

- Toda amenaza marcada `Launch-blocking: Yes` debe tener el control requerido
  implementado y probado antes del lanzamiento público.
- Una amenaza `Conditional` se convierte en launch-blocking cuando se introduce
  la capacidad relacionada. El control debe estar implementado y probado antes
  de habilitar esa capacidad.
- Una amenaza `No` permanece en el registro y se gestiona según su riesgo, pero
  no bloquea por sí sola el lanzamiento. Esta clasificación no equivale a
  aceptar el riesgo ni a omitir controles básicos.
- Por ejemplo, upload security es `Conditional` mientras uploads no estén
  implementados; pasa a bloquear el release antes de habilitar cualquier
  upload para usuarios.

Una capacidad con datos o privilegios no puede tratarse como cubierta de forma
automática por esta versión. Debe incorporarse al threat model y a la matriz de
verificación antes de su release.

## 7. Identidad, autenticación y sesiones

Supabase Auth está `Approved` como proveedor inicial de identidad. El backend ya
acepta Bearer access tokens y verifica criptográficamente JWTs asimétricos
mediante el JWKS público fijo del proyecto, issuer, audience, expiración y
claims temporales. `authSubject` se persiste como UUID privado y único para
resolver un `User.id` interno; un email validado es opcional y nunca se usa para
identidad o autorización. No almacena tokens ni passwords y `/api/v1/me` no
expone `authSubject`.

La Internal Alpha requerirá que el proyecto Supabase real complete el sistema
de JWT Signing Keys asimétricas. La implementación admite solo `ES256` y
`RS256`, exige `role=authenticated` y un `sub` con formato UUID, y no verifica
tokens legacy `HS256`. No requiere, almacena ni utiliza el legacy JWT secret,
`anon`, `service_role` o secret API keys para autenticar usuarios. La existencia
y configuración del proyecto real siguen pendientes de verificación.

El frontend de sesión, refresh, revocación, recuperación, logout, controles de
abuso, CORS/CSRF y pruebas con un proyecto real permanecen
`Requirement pending detail`. El mapeo persistido a `User` y la resolución de
su único `Workspace` personal ya existen. La creación y el listado de Projects
resuelven el workspace server-side, rechazan campos de ownership controlados por
el cliente y exigen scope de tenant en las consultas PostgreSQL. La autorización
de los recursos posteriores continúa sin implementar.

Independientemente del mecanismo elegido:

- cada identidad externa se mapeará a un `User.id` interno mediante una
  referencia estable y única;
- todos los endpoints `/api/v1` validarán una sesión vigente; los health checks
  serán la única excepción pública prevista;
- session tokens, refresh tokens y credenciales no se almacenarán en registros
  de dominio ni aparecerán en responses, analytics o logs;
- login, recuperación, cambio de email, vinculación de identidad, revocación y
  cierre de sesión requerirán un diseño explícito contra account takeover;
- cambios sensibles invalidarán o reevaluarán sesiones cuando corresponda;
- respuestas de autenticación no permitirán enumerar cuentas de forma
  innecesaria; y
- endpoints de autenticación tendrán límites de abuso y observabilidad
  separados del procesamiento de contenido.

Si se usan cookies de sesión, serán `Secure`, `HttpOnly` y tendrán el
`SameSite`, scope, duración y rotación mínimos compatibles con la experiencia.
Toda operación con efectos deberá contar con una defensa CSRF apropiada y
probada. Si se usa otro transporte, se documentarán almacenamiento, exposición
a XSS, renovación, revocación y envío cross-origin antes de aprobarlo. No queda
aprobado almacenar credenciales duraderas en `localStorage`.

MFA será obligatorio antes del lanzamiento para cuentas con acceso a source
control, CI/CD, hosting, DNS, producción, database, storage, observabilidad,
billing o providers. La disponibilidad de MFA para usuarios finales permanece
como decisión de producto y riesgo del authentication provider.

No se implementará autenticación propia basada en passwords salvo una decisión
posterior con threat model, almacenamiento mediante un password hashing scheme
maduro, recuperación segura y capacidad operativa demostrada.

## 8. Autorización y aislamiento por Workspace

Autenticación y autorización son controles distintos. Probar quién es un actor
no decide a qué recursos puede acceder.

Para cada operación privada, el backend deberá:

1. validar la sesión y resolver el `User` interno;
2. resolver server-side su `Workspace` personal;
3. conservar ese contexto como inmutable durante el request;
4. filtrar toda lectura y escritura privada por `workspaceId`;
5. comprobar que las relaciones entre IDs pertenecen al mismo workspace; y
6. autorizar la acción y el estado solicitado antes de cualquier efecto
   externo.

`workspaceId` enviado por body, query o header nunca cambia el contexto. Los IDs
opacos reducen enumeración accidental, pero no conceden acceso. Un recurso de
otro workspace se comportará como uno inexistente mediante
`404 RESOURCE_NOT_FOUND`, excepto cuando una política explícita y revisada
requiera otra respuesta.

Data access deberá favorecer funciones o repositorios que exijan
`workspaceId`, evitando queries privadas sin scope. Los joins, writes y locks
comprobarán coherencia de tenant; duplicar `workspaceId` en una entidad no
permite que difiera del de sus padres. Caches futuras incluirán el tenant en su
key y nunca compartirán respuestas privadas entre workspaces.

Queue messages contendrán solo identificadores y metadata mínima. El worker no
heredará ciegamente autorización del mensaje: cargará el job, comprobará
ownership, relaciones, estado y versión esperada, y mantendrá `workspaceId` en
todo acceso posterior.

La evolución a workspaces de equipo exige un nuevo modelo de `Membership`,
roles, invitaciones, revocación y auditoría. No se inferirán esos permisos desde
el workspace personal del MVP.

## 9. Seguridad HTTP y del browser

La API de producción se expondrá únicamente mediante HTTPS. HTTP se redirigirá
o rechazará en el edge sin procesar credenciales ni payloads sensibles.

La implementación deberá definir y verificar:

- CORS limitado a orígenes first-party exactos, métodos y headers necesarios;
- protección CSRF coherente con el transporte de sesión;
- `Cache-Control: no-store` para responses privadas y sensibles;
- límites de body, headers, parámetros, profundidad JSON y tiempo de request;
- rechazo de JSON malformado, tipos incorrectos y campos desconocidos;
- headers de browser apropiados, incluyendo HSTS cuando todo el dominio esté
  preparado, `X-Content-Type-Options: nosniff`, una política contra framing,
  `Referrer-Policy` y una Content Security Policy compatible con el frontend;
- encoding y escaping contextual de contenido mostrado, sin renderizar HTML de
  transcripts, metadata o outputs de IA como confiable; y
- cookies con scope mínimo, sin Domain amplio salvo necesidad revisada.

Errores públicos conservarán códigos estables y mensajes seguros. Nunca
incluirán stack traces, SQL, paths internos, secretos, prompts, transcripts,
signed URLs, payloads crudos de providers ni información de otro workspace.
Los health checks públicos serán mínimos y no revelarán versiones, topología o
dependencias concretas.

Los rate limits se aplicarán por riesgo y no solo por IP. Antes del lanzamiento
se definirán scopes para autenticación, usuario, workspace, ruta costosa,
provider y origen anónimo, junto con ventanas, respuestas y comportamiento ante
proxies confiables. Los límites de uso comercial no sustituyen rate limiting de
seguridad.

## 10. Fuentes, SSRF y uploads

### Fuentes URL

El backend no realizará fetch arbitrario de una URL enviada por el usuario. Las
fuentes URL están fuera del primer MVP y siguen `Deferred`; cualquier fuente
futura requiere ADR, threat model y mecanismos de acceso aprobados antes de
implementarse.

Cada Source requerirá una `OwnershipAttestation` ligada al usuario, workspace,
fuente, versión exacta del texto aceptado, base declarada y momento. Una
attestation no se reutiliza para otra fuente, no demuestra por sí sola que el
usuario posea los derechos y no sustituye controles de acceso ni revisión
legal. Su texto, revocación y periodo de conservación permanecen pendientes.

Como mínimo, un fetch server-side deberá:

- aceptar solo protocolos, hosts, puertos y mecanismos de acceso permitidos;
- rechazar credenciales embebidas, URLs ambiguas y normalizaciones inválidas;
- resolver el destino de forma controlada y bloquear loopback, link-local,
  private, multicast, reserved y cloud metadata addresses;
- validar de nuevo cada redirect, limitar su cantidad y no reenviar
  credenciales a otro origen;
- defender contra DNS rebinding y conectar únicamente al destino validado;
- aplicar timeouts, límites de bytes, duración, content type y decompression;
- no incluir cookies, tokens internos ni headers privilegiados en la solicitud;
  y
- registrar metadata segura del resultado, no la URL completa cuando contenga
  información sensible.

La preferencia será usar mecanismos oficiales o referencias proporcionadas por
el provider cuando eviten un fetch directo. Cualquier excepción a los destinos
permitidos requiere revisión del threat model y controles de egress.

### Uploads

El upload directo de MP4, MOV, MP3 y WAV está `Approved` como primer Source. La
intención privada y la confirmación de metadata de storage están implementadas;
la inspección real de bytes y los controles posteriores siguen pendientes. Los uploads:

- requerirán una sesión y una intención server-side previa;
- usarán referencias y object keys aleatorios, no paths elegidos por el usuario;
- tendrán límites explícitos de tamaño, duración, cantidad, frecuencia y
  formatos;
- validarán firma o contenido real además de extensión y `Content-Type`;
- permanecerán privados y no ejecutables en un storage separado del contenido
  web público;
- se procesarán como no confiables, con cuarentena y escaneo cuando el riesgo y
  formato lo exijan;
- no admitirán archives ni formatos activos sin una necesidad y revisión
  específicas;
- usarán acceso temporal, de alcance mínimo y sin signed URLs duraderas; y
- eliminarán objetos incompletos, rechazados y expirados mediante un lifecycle
  definido.

La implementación actual genera object keys aleatorias server-side y targets
`PUT` firmados por diez minutos sobre storage S3-compatible privado. El target
exige `Content-Type` y `x-amz-meta-upload-intent-id` ligados a la firma. La
confirmación usa `HEAD` solo sobre la key persistida y exige existencia, tamaño
exacto, `Content-Type` normalizado y metadata vinculante; no acepta key, bucket ni
URL del cliente. Esta metadata no demuestra MIME real, magic bytes, ausencia de
malware ni autorización. El Source queda `validating`, inactivo y sin
attestation; nunca `accepted`. La URL temporal
se entrega con `Cache-Control: no-store`, no se persiste ni se registra.
La eliminación de intenciones expiradas y objetos incompletos sigue pendiente
de una política de lifecycle; su expiración no demuestra que exista un objeto.

Los nombres originales se tratarán como metadata no confiable: se limitarán,
normalizarán para presentación y nunca se usarán como filesystem paths.

## 11. Transcripts, IA y prompt injection

Transcripts, metadata y contenido del usuario son datos, no instrucciones. Un
texto que solicite ignorar reglas, revelar prompts, usar secretos o ejecutar
acciones no cambia el comportamiento autorizado del sistema.

Los adaptadores de IA deberán:

- mantener prompts de sistema, schemas y credenciales server-side;
- enviar únicamente el contexto necesario para la finalidad aprobada;
- no incluir secretos, tokens, datos de otros workspaces ni instrucciones
  internas innecesarias;
- separar con claridad instrucciones controladas y contenido no confiable;
- no conceder al modelo acceso abierto a red, filesystem, database, billing,
  publicación u otras tools privilegiadas;
- validar schema, tipos, enums, tamaños, rangos, coherencia y referencias de
  toda salida antes de persistirla o mostrarla;
- derivar timestamps solo de `TranscriptSegment` reales y temporizados;
- escapar outputs al presentarlos y no interpretar HTML, Markdown activo, URLs
  o comandos como confiables; y
- limitar retries de reparación para evitar loops y costes no controlados.

Structured output reduce errores de forma, pero no prueba verdad, seguridad ni
autorización. Un `Analysis` solo será autoritativo después de validación
server-side. ClipAI no permitirá que la IA publique contenido, cambie permisos,
mueva uso ni tome decisiones de administración en el MVP.

La política de uso de contenido por providers, retención, training, región y
subprocesadores deberá revisarse antes de enviar datos reales. Las opciones de
no-training o zero-retention, cuando existan, no sustituyen una evaluación
contractual y técnica.

## 12. Providers, callbacks y webhooks

Cada provider estará detrás de un adaptador de capacidad estrecho. Sus SDKs,
IDs, errores y payloads no se convertirán en contratos del dominio.

Antes de integrar un provider se documentarán:

- datos enviados, finalidad, región, retención y subprocesadores relevantes;
- credenciales, scopes, rotación y separación por entorno;
- autenticidad de callbacks, disponibilidad e idempotencia;
- timeouts, retries, cuotas, límites de coste y failure modes;
- redacción de errores y soporte; y
- procedimiento de revocación, sustitución y eliminación.

Un webhook futuro se verificará con el mecanismo oficial usando el body exacto
cuando el esquema de firma lo requiera. Después se validarán timestamp o nonce,
ventana de replay, provider, event ID único, schema, tamaño y transición de
dominio. Una firma válida no autoriza por sí sola una transición inválida.

La respuesta al webhook será rápida y el trabajo largo se delegará de forma
durable. Eventos repetidos no duplicarán efectos. No se registrarán signatures,
secrets ni payloads completos por defecto.

## 13. Secretos, credenciales y criptografía

Los secretos reales no aparecerán en Git, documentación, issues, fixtures,
tests, logs, screenshots, prompts, analytics ni bundles del frontend.
`.env.example` contendrá solo nombres y valores ficticios seguros.

En local, los secretos se cargarán desde un `.env` ignorado u otro mecanismo
aprobado. En entornos desplegados se usarán variables inyectadas de forma
segura o un secret manager. Ningún valor expuesto mediante el prefijo público
del build de Vite se considerará secreto.

Cada credencial deberá tener:

- propietario y finalidad conocidos;
- scope y entorno mínimos;
- almacenamiento y acceso restringidos;
- proceso de creación, rotación, revocación y respuesta a exposición; y
- ausencia de reutilización entre development, test, staging y production.

La rotación se realizará al sospechar exposición, al cambiar personal o
proveedor y según una cadencia basada en riesgo. Una credencial comprometida se
revoca antes de considerarse resuelto el incidente.

Se usará TLS para datos en tránsito y cifrado gestionado para database, object
storage, backups y servicios que almacenen datos `Confidential` o `Restricted`,
según las capacidades del entorno elegido. No se inventarán algoritmos ni
protocolos criptográficos. La necesidad de claves administradas por ClipAI,
field-level encryption o key management adicional permanece pendiente del
threat model y los requisitos aplicables.

## 14. Privacidad, retención y eliminación

Seguridad y privacidad comparten controles, pero este documento no define por
sí solo una política legal de privacidad.

Antes del lanzamiento se aprobará un inventario que, para cada categoría de
datos, registre finalidad, fuente, clasificación, ubicación, acceso, provider,
retención, eliminación y respaldo. No se conservará un dato porque “podría ser
útil” sin una finalidad revisada.

En particular:

- transcripts, segmentos, archivos y análisis usarán retención mínima;
- logs, métricas y traces excluirán contenido completo por defecto;
- soporte accederá solo a los datos necesarios, con identidad individual y
  trazabilidad;
- analytics no recibirá contenido, tokens ni identificadores innecesarios;
- backups tendrán acceso limitado, cifrado, lifecycle y restore tests;
- una solicitud de eliminación distinguirá retirada de acceso, anonymization,
  purga activa y expiración de backups; y
- la purga coordinada entre PostgreSQL, storage, providers, caches, logs y
  backups será idempotente, observable y recuperable.

`OwnershipAttestation`, `ProcessingJob`, `UsageReservation` y
`UsageLedgerEntry` podrán requerir conservación mínima o anonimización en lugar
de borrado inmediato. Los periodos y bases aplicables necesitan revisión legal
y de producto; no se asumirán desde esta foundation.

## 15. Procesamiento asíncrono, uso y abuso

El procesamiento asíncrono conserva los mismos límites de seguridad que HTTP:

- el queue message se trata como input no confiable y no como autorización;
- cada ejecución verifica el `ProcessingJob`, su workspace, estado, Source y
  versión esperada;
- retries reutilizan el mismo job y claves idempotentes;
- side effects externos tienen identificadores estables cuando el provider los
  soporte;
- locks, constraints y transacciones protegen reservas, ledger y transiciones;
- timeouts, retries con backoff y jitter, concurrencia y tamaños estarán
  acotados; y
- un error terminal produce un estado seguro y una liquidación o liberación
  idempotente conforme a la política aprobada.

Antes de generar coste se validarán autorización, Source, attestation, estado,
límites de uso y reserva. La disponibilidad mostrada por el frontend no concede
capacidad; PostgreSQL conserva la decisión autoritativa.

La protección contra denial of wallet incluirá cuotas por workspace, límites
de concurrencia, topes de provider, alertas de consumo y capacidad de detener
nuevo trabajo sin corromper jobs existentes. Retries automáticos no podrán ser
infinitos ni multiplicar cobros.

## 16. Logging, monitoring y auditabilidad

Los logs estructurados podrán incluir `requestId`, `workspaceId`, `projectId`,
`processingJobId`, etapa, resultado, duración y códigos seguros. Los IDs se
registrarán solo donde la finalidad operativa lo requiera y su acceso estará
restringido.

Por defecto no se registrarán:

- credentials, cookies, authorization headers o webhook signatures;
- bodies completos, archivos, transcripts o prompts completos;
- signed URLs, source URLs sensibles o idempotency keys completas;
- responses crudas de providers o outputs no validados; ni
- PII que no sea necesaria para investigar el evento.

La redacción deberá ocurrir antes de que el dato llegue al sink. Configurar una
UI para ocultarlo después no elimina la exposición. Los errores conservarán la
causa técnica en un canal restringido cuando sea necesario, pero nunca en la
respuesta pública.

Como mínimo se observarán señales de:

- intentos repetidos de autenticación y recuperación;
- respuestas `401`, `403`, `404` y `429` anómalas;
- rechazos cross-workspace detectados por tests o runtime;
- validaciones fallidas, payloads excesivos y destinos SSRF bloqueados;
- signatures inválidas y replays de webhook;
- cambios y accesos privilegiados;
- creación, rotación o uso anómalo de credenciales;
- spikes de jobs, retries, provider errors, coste o consumo;
- fallos de redacción, scanning, backups o restore tests; y
- cambios de configuración o despliegues no esperados.

Antes del lanzamiento se definirán herramienta, retención, acceso, alertas,
severidad, owner y runbook por señal crítica. Un futuro `AuditLog` de dominio se
añadirá solo al definir eventos, integridad, acceso y retención; su ausencia no
elimina la necesidad de logs de seguridad operativos.

## 17. Desarrollo seguro y supply chain

La implementación futura deberá aplicar estas prácticas:

- cambios pequeños, revisión de código y branch protection para `main`;
- TypeScript strict y validación runtime en cada límite no confiable;
- separación entre routes, controllers, services y data access;
- dependencias mínimas, con propósito explicado, licencia y mantenimiento
  revisados;
- lockfiles versionados e instalaciones reproducibles en CI;
- revisión de install scripts y paquetes de alto privilegio;
- scanning de secretos, dependencias y código en el pipeline, con política de
  triage y excepciones documentadas;
- workflows de CI con permisos mínimos, secrets por entorno y acciones o tools
  fijadas a versiones revisables;
- validación PostgreSQL en un job aislado con permisos `contents: read`, base y
  credenciales sintéticas efímeras, sin conexiones cloud o de producción;
- builds desde source control revisado, sin cambios manuales en producción;
- separación de entornos, cuentas, credenciales y datos; y
- parches de seguridad priorizados por explotabilidad, exposición e impacto.

Un hallazgo no se cierra solo porque una herramienta deje de detectarlo. Debe
existir evidencia de corrección, mitigación aceptada o falso positivo revisado.
Los cambios de dependencia conservarán la explicación exigida por el working
agreement y ejecutarán tests, lint y type checks relevantes.

No se usarán datos ni secretos de producción en tests. Fixtures maliciosas para
validar controles deberán ser sintéticas y seguras para el repositorio.

## 18. Infraestructura y acceso operativo

Aunque hosting y topología siguen pendientes, el despliegue objetivo deberá:

- separar development, test, staging y production;
- exponer públicamente solo frontend, API y health checks necesarios;
- mantener database, queue internals, storage administration y dashboards fuera
  de acceso público directo;
- usar service identities distintas y de mínimo privilegio para API, worker,
  migrations y CI/CD cuando el entorno lo permita;
- restringir egress a destinos necesarios, especialmente en componentes que
  procesen URLs o archivos no confiables;
- cifrar backups y probar restauración con una cadencia definida;
- proteger cambios de DNS, dominio, certificados y configuración; y
- mantener inventario y owner de recursos desplegados.

El acceso humano a producción será individual, con MFA, mínimo privilegio y
registro. No se compartirán cuentas. El acceso de emergencia tendrá un
procedimiento, expiración y revisión posterior. Las consultas directas a datos
de usuarios se limitarán a incidentes o soporte autorizado y dejarán evidencia.

Las migraciones se ejecutarán como un paso controlado del release. Un rollback
no deberá restaurar código incompatible con datos ni reintroducir secretos. Los
valores de configuración se validarán al arrancar sin imprimir su contenido.

## 19. Resiliencia y respuesta a incidentes

Antes de procesar datos reales deberá existir un runbook mínimo que permita:

1. recibir y clasificar un reporte;
2. identificar sistemas, workspaces y datos potencialmente afectados;
3. contener acceso, detener trabajo o revocar credenciales;
4. preservar evidencia con acceso restringido;
5. erradicar la causa y rotar secretos comprometidos;
6. recuperar servicio y comprobar integridad;
7. evaluar comunicaciones y notificaciones aplicables; y
8. documentar causas, impacto, decisiones y acciones preventivas.

El runbook definirá severidades, owners, canales alternos, contactos de
providers y criterios para pausar procesamiento. Ningún miembro dependerá
exclusivamente de un dashboard que pueda estar afectado por el mismo incidente.

Backups protegen recuperación, no disponibilidad instantánea ni eliminación
selectiva. Se definirán objetivos de recuperación, frecuencia, retención y
restore tests después de elegir infraestructura. Un restore test usará un
entorno aislado y no expondrá contenido a personal o servicios innecesarios.

## 20. Verificación de controles

Los controles críticos deberán probarse en proporción al riesgo. El baseline
mínimo incluye:

| Área | Evidencia requerida antes del lanzamiento |
| --- | --- |
| Authentication | Tests de sesión ausente, inválida, expirada, revocada y del flujo de recuperación elegido. |
| Authorization | Integration tests para cada lectura, escritura y relación usando recursos de dos workspaces. |
| Tenant isolation | Tests que manipulen IDs, nested resources, joins, locks, jobs y caches sin revelar existencia ajena. |
| Validation | Tests de tipos, campos desconocidos, tamaños, encoding, mass assignment y errores seguros. |
| Browser security | Verificación de CORS, CSRF si aplica, cookies, caching, CSP y security headers en el entorno desplegado. |
| SSRF | Casos de loopback, private/link-local, metadata, redirects, DNS rebinding, puertos, timeouts y respuestas excesivas. |
| Uploads | Tipo real, límites, nombres, acceso privado, cuarentena, lifecycle y formatos maliciosos relevantes. |
| IA y transcripts | Prompt injection, schema inválido, tamaños, timestamps inventados, HTML no confiable y retries limitados. |
| Webhooks | Firma inválida, timestamp vencido, replay, payload inválido, evento desconocido y transición duplicada. |
| Jobs y uso | Concurrencia, retry, cancelación, provider timeout y ledger sin duplicación. |
| Secrets y logs | Scanning del repositorio/build y pruebas que confirmen redacción de errores, headers, URLs y payloads. |
| Data lifecycle | Acceso, archive, deletion workflow, expiración de objetos y tratamiento documentado de backups. |
| Supply chain | Lockfile reproducible, inventario de dependencias y triage de vulnerabilidades conocido. |
| Recovery | Restore test y ejercicio del runbook de incidente con acciones registradas. |

Los tests de frontend no sustituyen tests server-side. Los tests unitarios de un
guard no sustituyen integration tests de cada query y flujo. Los controles de
producción, como TLS, headers, CORS, permisos de storage y egress, deben
verificarse contra el entorno desplegado y no solo contra configuración local.

## 21. Estado actual frente al estado objetivo

Estado real del repositorio al publicar esta versión:

| Área | Estado |
| --- | --- |
| Security Foundation | `Approved as initial security baseline` |
| Frontend productivo | `Not implemented` |
| API de Internal Alpha | `Identity, Project create/list and private upload confirmation implemented` |
| Supabase JWT verification | `Control implemented / locally verified` |
| Session lifecycle | `Requirement pending detail` |
| Autorización por Workspace | `Project and upload intent isolation implemented / locally verified` |
| PostgreSQL, Prisma y migrations | `Control implemented / locally verified` |
| Worker y queue | `Not implemented` |
| OpenAI para IA y transcripción | `Approved initial provider / Not implemented` |
| Object storage S3-compatible y upload flow | `PUT signer and HEAD metadata confirmation implemented / real bucket not validated` |
| Hosting, región, networking y secret management | `Deferred` |
| Logging, alerting y security scanning | `Deferred` |
| Retention, deletion e incident policies | `Not approved` |

`client/` continúa sin aplicación productiva y `server/` solo implementa la
fundación de Internal Alpha y el límite de identidad descrito. La verificación
local no certifica la seguridad del producto ni cubre lifecycle de sesión,
revocación, tenancy o autorización.

## 22. Security gates

### Antes de autorizar implementación del MVP

- mantener esta foundation aprobada y registrar cualquier cambio material en
  decisiones y threat model;
- resolver mediante decisiones registradas el authentication/session model y
  el primer mecanismo de Source;
- clasificar los datos del primer flujo vertical y sus providers;
- definir criterios de aceptación de tenant isolation, SSRF, uploads si aplican
  y outputs de IA; y
- acordar owner y tratamiento de hallazgos de seguridad.

### Antes de usar datos reales en staging

- separar entorno, credenciales, database y storage de producción;
- implementar autenticación, autorización y redacción con tests negativos;
- confirmar que no se usan secretos ni datos de producción en fixtures;
- configurar límites de payload, egress, provider y coste; y
- verificar acceso, retención y eliminación provisional de los datos de prueba.

### Antes del lanzamiento

- cerrar todos los puntos aplicables de la matriz de verificación;
- aprobar privacidad, términos, contenido autorizado, retención, eliminación y
  respuesta a solicitudes;
- habilitar MFA y mínimo privilegio para todas las cuentas operativas;
- configurar monitoring, alertas, budget limits y owners;
- ejecutar restore test y tabletop de incidente;
- revisar providers, subprocesadores, regiones y data lifecycle;
- resolver hallazgos críticos y altos o aceptar formalmente una mitigación y
  fecha; y
- realizar una revisión final de secretos, dependencias, configuración y estado
  real de implementación.

Pasar un gate no autoriza por sí solo el siguiente release. Cada entrega debe
cumplir también producto, arquitectura, calidad y operación.

## 23. Decisiones de seguridad abiertas

| Tema | Decisión pendiente | Evidencia necesaria |
| --- | --- | --- |
| Authentication | Session transport, duración, revocación, recuperación y MFA de usuarios con Supabase Auth | Threat model, UX, integración, operación y coste. |
| Browser boundary | Cookie o token, CSRF, CORS, CSP y dominios exactos | Arquitectura de despliegue y flujo de autenticación elegidos. |
| Source acquisition | Límites y controles operativos del upload; futuras URLs siguen diferidas | Producto, derechos de acceso, parser, calidad y coste. |
| Upload security | Formatos, tamaños, duración, quarantine y malware scanning | Casos reales, parser, storage y evaluación de riesgo. |
| Providers | Modelos/configuración de OpenAI, billing futuro y posibles callbacks | Privacidad, retención, región, scopes, autenticidad, coste y resiliencia. |
| Storage | Provider S3-compatible final, ubicación de transcripts, acceso temporal y lifecycle | Volumen, consultas, privacidad, eliminación y hosting. |
| Secrets | Secret manager, cadencias y procedimiento de rotación | Hosting, CI/CD, providers y capacidad operativa. |
| Rate limiting | Scopes, thresholds, ventanas, store y respuesta | Carga, costes, UX, proxy topology y abuse tests. |
| Retention | Periodos por contenido, PII, logs, attestations, ledger y backups | Producto, soporte, legal, privacidad y coste. |
| Deletion | Workflow, SLA, anonymization y expiración de backups | Data inventory, providers, obligaciones y pruebas. |
| Observability | Logging, metrics, alerting, audit y error reporting tools | Hosting, privacidad, señales, presupuesto y ownership. |
| Infrastructure | Hosting, región, network boundaries, egress y service identities | Residencia, providers, coste, backups y SLOs. |
| Vulnerability management | Scanners, cadencia, SLAs y canal de reporte | Stack implementado, exposición y capacidad del equipo. |
| Incident response | Severidades, contactos, notificaciones y canal alterno | Infraestructura, providers, requisitos aplicables y ownership. |
| Recovery | RPO, RTO, backup frequency, retention y restore cadence | SLOs, datos, coste y capacidades del hosting. |

Ninguna decisión abierta autoriza un default inseguro. Hasta resolverla, la
capacidad afectada permanece sin implementar o utiliza el control provisional
más restrictivo compatible con los documentos aprobados.

## 24. Trazabilidad con decisiones existentes

| Decisión | Aplicación en esta foundation |
| --- | --- |
| `ADR-001` Monolito modular | Los límites de módulos y data access deben impedir bypass de autorización dentro del mismo proceso. |
| `ADR-006` Procesamiento asíncrono | Queue messages no confieren autorización; jobs y efectos son recuperables e idempotentes. |
| `ADR-008` Tenancy por Workspace | Todo recurso privado se filtra y relaciona mediante el workspace resuelto server-side. |
| `ADR-009` Credenciales server-side | Secretos y llamadas privilegiadas no llegan al browser ni a contratos de dominio. |
| `ADR-010` Adaptadores de providers | Cada integración limita datos, credenciales, errores y capacidades externas. |
| `ADR-011` Timestamps reales | La IA no puede fabricar evidencia temporal ni reemplazar segmentos validados. |
| `ADR-012` Validación de IA | Ningún output externo se convierte en resultado autoritativo sin validación server-side. |
| `ADR-013` Ledger inmutable | Concurrencia, retries y fallos no duplican movimientos ni ocultan correcciones. |
| `ADR-015` Infraestructura mínima | Los controles se diseñan para una región y pocas piezas sin asumir seguridad por complejidad. |
| `ADR-016` Queue PostgreSQL-backed | La librería elegida deberá aportar garantías maduras sin trasladar sus tablas al dominio. |
| `ADR-017` Legacy fuera de producción | `legacy/` no entra en builds, imports, tests ni dependencias productivas. |

Esta trazabilidad describe consecuencias de seguridad de decisiones aceptadas;
no cambia su estado ni resuelve las decisiones `Deferred`.

## 25. Gate de seguridad del primer flujo vertical

### Taxonomía de evidencia

| Estado | Significado |
| --- | --- |
| `Decision approved` | La Product Owner aprobó una dirección y existe un ADR. |
| `Requirement defined` | El comportamiento verificable está documentado. |
| `Control implemented` | Existe código o configuración revisada que aplica el requisito. |
| `Control verified` | Pruebas o evidencia operativa demuestran que funciona, incluidos casos negativos. |

La verificación JWT, su middleware y el provisioning interno están
`Control implemented / locally verified` mediante tests unitarios. Las nueve
pruebas PostgreSQL de idempotencia, concurrencia, foreign key y unicidad se
ejecutaron tres veces contra una base local exclusiva; cada ejecución incluyó
ocho solicitudes concurrentes y terminó sin datos sintéticos residuales. La
migración, sus tablas, índices, restricciones y foreign key también se
verificaron directamente en PostgreSQL. Esta evidencia es local y no valida
ningún entorno productivo o cloud. Los demás elementos del flujo conservan sus
estados anteriores. El job PostgreSQL de CI está configurado para repetir esta
validación sobre una base efímera, pero permanece pendiente de evidencia remota
hasta que el workflow se ejecute en GitHub.

La fundación de Project añade quince pruebas PostgreSQL para creación scoped,
idempotencia concurrente, aislamiento entre dos workspaces, cursor
cross-workspace, orden, paginación, foreign key, `ON DELETE RESTRICT` y limpieza
dirigida. La validación HTTP local confirmó `201` para creación, listados
aislados y responses sin `workspaceId` ni `authSubject`. Esta evidencia no
sustituye la ejecución remota del CI ni valida un entorno productivo.

### Criterios previos a completar el vertical slice

| Área | Decisión o requisito verificable | Estado actual |
| --- | --- | --- |
| Autenticación | Supabase Auth; registro, login, recuperación y validación backend de tokens; nunca passwords en ClipAI | `JWT verification implemented / remaining lifecycle pending` |
| Sesiones | Rechazo de token ausente, inválido, expirado o revocado; transporte, CSRF/CORS, logout y recuperación probados | `Requirement pending detail` |
| Workspace | Cada acceso privado resuelve usuario y pertenencia server-side; queries y relaciones filtran por `workspaceId`; cross-tenant denegado | `Project create/list isolation implemented / locally verified` |
| Upload | Intención privada y confirmación de metadata para MP4, MOV, MP3 y WAV; MIME real, duración, frecuencia y contenido malicioso siguen pendientes | `Intent and HEAD metadata confirmation implemented / byte validation pending` |
| Object storage | Adapter S3-compatible, URL PUT temporal y HEAD implementados; bucket, permisos y lifecycle reales no validados | `Signer and HEAD implemented / real bucket validation pending` |
| Jobs | Idempotencia, un efecto por transición, retries acotados, timeout, cancelación y recuperación sin doble consumo | `Requirement defined` |
| Transcripción | Adapter de OpenAI; modelo configurable; minimización de datos; errores, timeouts, cancelación, retención, eliminación y consumo documentados | `Decision approved / Requirement defined` |
| IA | Adapter de OpenAI; prompts y schemas versionados; modelo configurable; output no confiable y validado antes de persistir | `Decision approved / Requirement defined` |
| Logs y auditoría | Redacción previa al sink; sin archivos, transcripts, tokens, prompts ni signed URLs; actor y resultado para operaciones sensibles | `Requirement defined` |
| Rate y processing limits | Límites por identidad, workspace, ruta costosa y provider; budgets y concurrencia acotados | `Requirement pending parameters` |
| Retención | Periodos y tratamiento para archivos, transcripts, outputs, attestations, logs, provider data y backups | `Requirement pending policy` |
| Eliminación | Workflow idempotente entre DB, storage y providers, con SLA, fallos parciales y evidencia | `Requirement pending policy` |
| Fuentes URL futuras | Fuera del MVP; antes de activarlas: allowlist, SSRF, redirects, DNS, egress, tokens y lifecycle revisados | `Deferred / Requirement defined` |

### Gates de implementación y verificación

Antes de considerar completo el primer flujo deberán existir tests negativos de
cross-tenant access; autorización de proyectos y archivos; MIME y tamaños;
storage público accidental; signed URL expirada; duplicación de requests y
retries; output de IA inválido; redacción; eliminación; y acceso sin sesión.
También deberán registrarse owner, severidad y tratamiento de cada hallazgo.

La aprobación documental del proveedor o requisito no autoriza datos reales.
El gate de staging de la sección 22 permanece aplicable y exige controles
implementados y verificados.
