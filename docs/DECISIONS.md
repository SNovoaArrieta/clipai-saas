# ClipAI SaaS — Architecture Decisions

## 1. Estado y propósito del documento

| Campo | Valor |
| --- | --- |
| Documento | 03 — Architecture Decisions |
| Versión | 0.2 |
| Estado | Registro inicial aprobado |
| Estado de implementación | No implementada |
| Fase | Fase 0 — Foundation |
| Última actualización | 2026-07-13 |

Este documento registra las decisiones arquitectónicas aprobadas para el MVP de
ClipAI y las elecciones que todavía permanecen pendientes. Complementa el
Product Charter y la Architecture Foundation; no autoriza por sí mismo la
construcción del SaaS ni afirma que la arquitectura objetivo ya exista.

Los estados describen la madurez de una decisión, no su implementación. Los
identificadores y nombres de tecnologías se mantienen en English aunque el
contenido esté escrito en español.

## 2. Estados de decisión

| Estado | Significado |
| --- | --- |
| `Accepted` | Decisión aprobada que orientará una implementación futura; no implica que ya esté implementada. |
| `Proposed` | Decisión formulada y en revisión, todavía no vinculante. |
| `Deferred` | Decisión aplazada hasta disponer de evidencia o requisitos suficientes. |
| `Superseded` | Decisión reemplazada; deberá conservarse y enlazar el ADR que la sustituye. |

Todos los ADR de esta versión están `Accepted`. El registro pendiente contiene
decisiones `Deferred`; todavía no existen decisiones `Proposed` ni `Superseded`.

## 3. Decisiones aceptadas

### ADR-001 — Usar un monolito modular

| Campo | Valor |
| --- | --- |
| Identificador | `ADR-001` |
| Título | Usar un monolito modular |
| Estado | `Accepted` |
| Fecha | 2026-06-26 |

**Contexto.** Dos fundadores necesitan límites de dominio claros sin el coste
operativo de múltiples servicios.

**Decisión.** El backend se construirá como un monolito modular, con módulos
explícitos, una base de datos compartida y una sola unidad de release.

**Consecuencias.** Se simplificarán desarrollo y operación, pero deberán
controlarse dependencias entre módulos y accesos a datos.

**Alternativas consideradas.** Microservices desde el inicio y un monolito sin
fronteras internas.

**Trigger de revisión.** Un dominio requiere despliegue, escalado, seguridad u
ownership independiente con base en evidencia medida.

### ADR-002 — Usar React, Vite y TypeScript para el frontend

| Campo | Valor |
| --- | --- |
| Identificador | `ADR-002` |
| Título | Usar React, Vite y TypeScript para el frontend |
| Estado | `Accepted` |
| Fecha | 2026-06-26 |

**Contexto.** El producto necesitará una interfaz interactiva para proyectos,
procesamiento, resultados e historial con un stack manejable.

**Decisión.** El frontend futuro se desarrollará con React, Vite y TypeScript.

**Consecuencias.** Habrá desarrollo ligero, componentes reutilizables y tipos
estáticos; routing y server state requerirán convenciones explícitas.

**Alternativas consideradas.** Un framework full-stack con server-side
rendering, otro bundler o una interfaz sin framework.

**Trigger de revisión.** Requisitos comprobados de rendering, SEO, rendimiento
o mantenimiento que este stack no cubra razonablemente.

### ADR-003 — Usar Node.js, Express y TypeScript para el backend

| Campo | Valor |
| --- | --- |
| Identificador | `ADR-003` |
| Título | Usar Node.js, Express y TypeScript para el backend |
| Estado | `Accepted` |
| Fecha | 2026-06-26 |

**Contexto.** El backend estará orientado a HTTP, persistencia y llamadas
I/O-bound. Compartir TypeScript reduce la carga operativa del equipo.

**Decisión.** La API y el worker futuros usarán Node.js, Express y TypeScript.

**Consecuencias.** El stack será pequeño y coherente con el frontend; routes,
controllers, services y data access deberán permanecer separados.

**Alternativas consideradas.** Otros runtimes, frameworks más prescriptivos y
servicios en lenguajes diferentes.

**Trigger de revisión.** Límites medidos de rendimiento, seguridad o
mantenibilidad que no puedan resolverse dentro del stack.

### ADR-004 — Usar PostgreSQL como system of record

| Campo | Valor |
| --- | --- |
| Identificador | `ADR-004` |
| Título | Usar PostgreSQL como system of record |
| Estado | `Accepted` |
| Fecha | 2026-06-26 |

**Contexto.** Tenancy, proyectos, jobs y uso requieren relaciones, transacciones
e historial durable que no dependa de proveedores externos.

**Decisión.** PostgreSQL será el system of record para dominio, procesamiento y
uso. Los binarios grandes permanecerán fuera de la base de datos.

**Consecuencias.** Se obtendrá consistencia con una sola persistencia; índices,
backups, conexiones y crecimiento deberán gestionarse con disciplina.

**Alternativas consideradas.** NoSQL como fuente principal, bases por módulo y
estado autoritativo en proveedores.

**Trigger de revisión.** Requisitos medidos de escala, residencia, aislamiento o
disponibilidad que PostgreSQL no pueda cubrir razonablemente.

### ADR-005 — Planificar el uso de Prisma como ORM

| Campo | Valor |
| --- | --- |
| Identificador | `ADR-005` |
| Título | Planificar el uso de Prisma como ORM |
| Estado | `Accepted` |
| Fecha | 2026-06-26 |

**Contexto.** El backend necesitará acceso tipado a PostgreSQL y migraciones
controladas cuando se autorice la implementación.

**Decisión.** Prisma será el ORM planificado. Su schema y migraciones se
definirán después; Prisma todavía no está instalado ni configurado.

**Consecuencias.** Aportará tipos y un flujo estándar de migraciones, aunque
consultas concretas podrían requerir SQL controlado.

**Alternativas consideradas.** SQL manual, un query builder u otro ORM.

**Trigger de revisión.** Una prueba previa a la adopción demuestra límites
críticos de consultas, migraciones, rendimiento u operación.

### ADR-006 — Ejecutar transcript y análisis de IA de forma asíncrona

| Campo | Valor |
| --- | --- |
| Identificador | `ADR-006` |
| Título | Ejecutar transcript y análisis de IA de forma asíncrona |
| Estado | `Accepted` |
| Fecha | 2026-06-26 |

**Contexto.** Transcripción y análisis pueden superar una petición HTTP y fallar
de forma transitoria.

**Decisión.** La API persistirá y aceptará el trabajo; un worker ejecutará el
proceso y mantendrá su progreso en `ProcessingJob`.

**Consecuencias.** El trabajo será durable y recuperable, pero exigirá estados,
idempotencia, manejo de errores y reentregas.

**Alternativas consideradas.** Procesamiento síncrono en HTTP y orquestación
desde el browser.

**Trigger de revisión.** Un cambio medido del workload elimina la necesidad de
durabilidad o exige otro modelo de ejecución.

### ADR-007 — Mantener API y worker en el mismo backend y release

| Campo | Valor |
| --- | --- |
| Identificador | `ADR-007` |
| Título | Mantener API y worker en el mismo backend y release |
| Estado | `Accepted` |
| Fecha | 2026-06-26 |

**Contexto.** API y worker compartirán casos de uso, modelo de datos y reglas de
dominio.

**Decisión.** Ambos vivirán en `server/`, se construirán desde la misma base de
código y se versionarán juntos, aunque se ejecuten como procesos diferentes.

**Consecuencias.** Se evitará duplicación y drift; sus cambios compartirán ciclo
de release.

**Alternativas consideradas.** Un worker como microservice o repositorio
independiente y ejecutar todo en HTTP.

**Trigger de revisión.** El worker necesita despliegue, seguridad, tecnología u
ownership independiente de forma comprobada.

### ADR-008 — Usar tenancy basada en Workspace desde el inicio

| Campo | Valor |
| --- | --- |
| Identificador | `ADR-008` |
| Título | Usar tenancy basada en Workspace desde el inicio |
| Estado | `Accepted` |
| Fecha | 2026-06-26 |

**Contexto.** El MVP tendrá espacios personales, pero puede evolucionar a
equipos; vincular recursos solo a `User` crearía una migración transversal.

**Decisión.** Cada recurso privado pertenecerá a `Workspace`. El MVP asociará
cada usuario a un workspace personal y resolverá `workspaceId` server-side.

**Consecuencias.** Habrá una frontera estable para aislamiento y equipos
futuros, a cambio de una capa adicional de ownership.

**Alternativas consideradas.** Propiedad directa por `User` y base o schema por
tenant.

**Trigger de revisión.** Regulación exige aislamiento físico o cambia
materialmente el concepto de workspace.

### ADR-009 — Mantener credenciales y llamadas privilegiadas server-side

| Campo | Valor |
| --- | --- |
| Identificador | `ADR-009` |
| Título | Mantener credenciales y llamadas privilegiadas server-side |
| Estado | `Accepted` |
| Fecha | 2026-06-26 |

**Contexto.** IA, transcripción, billing y storage usarán secretos, generarán
costes o accederán a datos privados.

**Decisión.** Credenciales y llamadas privilegiadas vivirán en el backend; el
browser no contendrá secretos ni privilegios amplios.

**Consecuencias.** Autorización, consumo y errores quedarán centralizados; el
backend asumirá el tráfico de integración.

**Alternativas consideradas.** API keys en el cliente y llamadas directas desde
el browser.

**Trigger de revisión.** Un proveedor exige un flujo delegado con credenciales
efímeras y de mínimo alcance, aprobado mediante revisión de seguridad.

### ADR-010 — Aislar proveedores mediante adaptadores de capacidad estrechos

| Campo | Valor |
| --- | --- |
| Identificador | `ADR-010` |
| Título | Aislar proveedores mediante adaptadores de capacidad estrechos |
| Estado | `Accepted` |
| Fecha | 2026-06-26 |

**Contexto.** SDKs y payloads de proveedores no deben definir el dominio.

**Decisión.** Cada proveedor quedará detrás de un adaptador para una capacidad
concreta que traduzca credenciales, payloads y errores.

**Consecuencias.** Los límites serán testeables y los cambios quedarán acotados,
con una pequeña capa adicional de traducción.

**Alternativas consideradas.** SDKs usados por todo el dominio y un framework
genérico de plugins.

**Trigger de revisión.** Un proveedor real adicional, fugas repetidas de
detalles externos o un contrato de capacidad insuficiente.

### ADR-011 — Derivar timestamps de segmentos reales y temporizados

| Campo | Valor |
| --- | --- |
| Identificador | `ADR-011` |
| Título | Derivar timestamps de segmentos reales y temporizados |
| Estado | `Accepted` |
| Fecha | 2026-06-26 |

**Contexto.** Cada recomendación debe poder localizarse con precisión en la
fuente; texto sin tiempos no ofrece rangos confiables.

**Decisión.** Los timestamps se respaldarán con `TranscriptSegment` reales,
ordenados y validados. La IA no los inventará ni estimará.

**Consecuencias.** Los resultados serán verificables; fuentes insuficientes
deberán rechazarse o pasar a `awaiting_input`.

**Alternativas consideradas.** Timestamps estimados por IA, distribución
proporcional y recomendaciones sin rangos.

**Trigger de revisión.** Una alineación independiente demuestra precisión igual
o superior contra una fuente temporal verificable.

### ADR-012 — Validar server-side toda salida estructurada de IA

| Campo | Valor |
| --- | --- |
| Identificador | `ADR-012` |
| Título | Validar server-side toda salida estructurada de IA |
| Estado | `Accepted` |
| Fecha | 2026-06-26 |

**Contexto.** Un modelo puede devolver datos inválidos, incompletos o
inconsistentes aunque se solicite structured output.

**Decisión.** El backend validará schema, campos, reglas y respaldo temporal
antes de persistir o mostrar cualquier resultado.

**Consecuencias.** Respuestas externas no confiables no se convertirán en estado
de negocio; habrá rechazos y reintentos limitados.

**Alternativas consideradas.** Confiar en el proveedor y validar solo en el
frontend.

**Trigger de revisión.** Cambia el contrato o threat model; cualquier reemplazo
deberá conservar controles server-side equivalentes.

### ADR-013 — Registrar uso con reservas y ledger entries inmutables

| Campo | Valor |
| --- | --- |
| Identificador | `ADR-013` |
| Título | Registrar uso con reservas y ledger entries inmutables |
| Estado | `Accepted` |
| Fecha | 2026-06-26 |

**Contexto.** El procesamiento tendrá costes, fallos y retries. Un balance
mutable no explica ni protege cada movimiento.

**Decisión.** Se reservará capacidad antes del coste y se registrarán reservas,
liquidaciones, liberaciones y ajustes como `UsageLedgerEntry` inmutables e
idempotentes por `ProcessingJob`.

**Consecuencias.** El uso será auditable y no duplicará cargos; aumentarán las
reglas transaccionales del módulo `usage`.

**Alternativas consideradas.** Mutable usage counters, descuento solo al final y
ledger propiedad del billing provider.

**Trigger de revisión.** Un cambio comercial o escala contable requiere nuevas
capacidades sin perder auditabilidad e idempotencia.

### ADR-014 — Usar polling para el estado inicial de procesamiento

| Campo | Valor |
| --- | --- |
| Identificador | `ADR-014` |
| Título | Usar polling para el estado inicial de procesamiento |
| Estado | `Accepted` |
| Fecha | 2026-06-26 |

**Contexto.** El frontend mostrará jobs asíncronos, pero el MVP no necesita
infraestructura realtime compleja.

**Decisión.** El frontend consultará el estado mediante polling sobre HTTPS. El
intervalo se decidirá antes de implementar el flujo.

**Consecuencias.** La operación será simple; deberá equilibrarse latencia visible
y número de peticiones.

**Alternativas consideradas.** Server-Sent Events, WebSockets y push.

**Trigger de revisión.** Carga, latencia o interacción medida justifican SSE u
otro canal.

### ADR-015 — Excluir infraestructura distribuida del MVP inicial

| Campo | Valor |
| --- | --- |
| Identificador | `ADR-015` |
| Título | Excluir microservices, Kubernetes, Redis y multi-region del MVP inicial |
| Estado | `Accepted` |
| Fecha | 2026-06-26 |

**Contexto.** Dos fundadores deben operar el MVP sin complejidad distribuida que
todavía no está justificada.

**Decisión.** El MVP inicial excluirá microservices, Kubernetes, Redis y
multi-region; comenzará en una región con PostgreSQL como núcleo durable.

**Consecuencias.** Bajará el coste operativo, aceptando límites iniciales de
escala y resiliencia regional.

**Alternativas consideradas.** Containers orquestados, servicios separados,
Redis y active-active desde el inicio.

**Trigger de revisión.** SLOs, regulación, capacidad o incidentes medidos exigen
una pieza excluida.

### ADR-016 — Usar una librería madura de jobs respaldada por PostgreSQL

| Campo | Valor |
| --- | --- |
| Identificador | `ADR-016` |
| Título | Usar una librería madura de jobs respaldada por PostgreSQL |
| Estado | `Accepted` |
| Fecha | 2026-06-26 |

**Contexto.** Entrega, concurrencia, retries y recuperación son difíciles de
implementar correctamente y no diferencian al producto.

**Decisión.** Se elegirá una librería madura PostgreSQL-backed. No se construirá
claiming, heartbeat, leases, retry scheduling ni abandoned-job recovery propios.
La librería concreta sigue pendiente.

`ProcessingJob` será el registro de negocio durable de un análisis solicitado
por el usuario y de su estado visible. Un queue job será un mensaje interno de
ejecución administrado por la librería elegida; podrá reintentarse varias veces
sin crear otro `ProcessingJob` ni cobrar varias veces al usuario.

**Consecuencias.** Se reutilizarán garantías probadas sin Redis; la aplicación
dependerá de los límites de la librería y PostgreSQL.

**Alternativas consideradas.** Custom queue, cola Redis-backed y mensajería
administrada.

**Trigger de revisión.** Contención o requisitos medidos no pueden cubrirse con
una opción madura PostgreSQL-backed.

### ADR-017 — Mantener el prototipo legacy fuera de producción

| Campo | Valor |
| --- | --- |
| Identificador | `ADR-017` |
| Título | Mantener legacy fuera de builds, linting, tests e imports de producción |
| Estado | `Accepted` |
| Fecha | 2026-06-26 |

**Contexto.** `legacy/clipai-youtube.jsx` conserva ideas de producto, pero no
cumple la arquitectura, seguridad ni calidad objetivo.

**Decisión.** `legacy/` será solo referencia y quedará fuera de builds, linting,
tests e imports. Solo `client/` y `server/` serán raíces productivas.

**Consecuencias.** El prototipo no contaminará el runtime; sus ideas útiles
deberán reimplementarse y revisarse.

**Alternativas consideradas.** Evolucionar el prototipo, importarlo o eliminarlo
ahora.

**Trigger de revisión.** Cuando pierda su utilidad podrá archivarse o retirarse;
nunca entrará en producción sin una migración explícita y revisada.

### ADR-018 — Usar upload directo como primer tipo de Source

| Campo | Valor |
| --- | --- |
| Identificador | `ADR-018` |
| Estado | `Accepted` |
| Fecha | 2026-07-13 |

**Contexto.** El primer flujo necesita una entrada controlable sin depender de
plataformas, scraping ni disponibilidad de transcripts externos.

**Decisión.** El primer `Source` será un archivo subido por la persona usuaria.
Se prevén MP4, MOV, MP3 y WAV; tamaño y duración serán parámetros configurables
definidos antes de producción. El archivo exige una attestation válida.

**Razones.** Reduce dependencias, acota SSRF y permite medir calidad, coste y
latencia con entradas conocidas.

**Consecuencias.** Se necesita un flujo seguro de upload, validación real de
tipo y lifecycle del objeto. Las URLs no forman parte del primer MVP.

**Alternativas consideradas.** URLs de redes, scraping, importación de drives,
grabación en browser y transcript proporcionado como primer flujo.

**Riesgos.** Malware, archivos dañados, formatos engañosos, tamaño, coste y
contenido sin autorización.

### ADR-019 — Usar Supabase Auth como proveedor inicial de identidad

| Campo | Valor |
| --- | --- |
| Identificador | `ADR-019` |
| Estado | `Accepted` |
| Fecha | 2026-07-13 |

**Contexto.** ClipAI requiere registro, login y recuperación sin construir un
sistema propio de passwords.

**Decisión.** Supabase Auth gestionará inicialmente email/password y
recuperación. El backend validará tokens, resolverá `User` y `Workspace` y no
guardará passwords. Magic link queda como opción futura.

**Razones.** Delegar el lifecycle de credenciales reduce superficie propia y
acelera un flujo estándar, manteniendo identidad interna separada.

**Consecuencias.** Deben documentarse transporte de tokens, expiración,
revocación, recuperación, CSRF/CORS aplicable y mapeo único de `authSubject`.

**Alternativas consideradas.** Auth propia, otros proveedores administrados y
magic link como único mecanismo.

**Riesgos.** Configuración incorrecta, dependencia del proveedor, validación de
tokens incompleta, account enumeration y recuperación abusiva.

### ADR-020 — Confirmar tenancy por Workspace para el primer MVP

| Campo | Valor |
| --- | --- |
| Identificador | `ADR-020` |
| Estado | `Accepted` |
| Fecha | 2026-07-13 |

**Contexto.** `ADR-008` ya establece `Workspace` como tenant. El primer MVP
necesita concretar cómo se representa la pertenencia sin introducir equipos.

**Decisión.** Cada usuario tendrá al menos un workspace; inicialmente podrá ser
un workspace personal creado al registrar la cuenta. Toda operación privada
resolverá usuario y workspace server-side y filtrará por `workspaceId`. Para el
workspace personal, `ownerUserId` demuestra pertenencia. `Membership` continúa
diferido hasta autorizar colaboración o múltiples miembros.

**Razones.** Mantiene aislamiento desde el inicio y conserva el modelo mínimo
aprobado.

**Consecuencias.** Ningún ID del cliente basta para autorizar. Proyectos,
sources, jobs, transcripts y outputs heredan el tenant.

**Alternativas consideradas.** Datos directamente por usuario, workspace
seleccionado sin verificación y `Membership` obligatoria desde el primer MVP.

**Riesgos.** Consultas sin scope, confusión entre autenticación y autorización y
futuras migraciones al introducir equipos.

### ADR-021 — Usar object storage privado compatible con S3

| Campo | Valor |
| --- | --- |
| Identificador | `ADR-021` |
| Estado | `Accepted` |
| Fecha | 2026-07-13 |

**Contexto.** Los binarios no pertenecen en PostgreSQL y requieren acceso
privado, temporal y aislado.

**Decisión.** Los archivos se almacenarán en object storage privado mediante
una interfaz compatible con S3. Se usarán claves opacas con aislamiento por
workspace y URLs firmadas temporales. El proveedor final queda pendiente.

**Razones.** Separa datos binarios del system of record y conserva portabilidad
entre opciones compatibles.

**Consecuencias.** La base guardará referencias opacas y metadata necesaria;
deben definirse permisos, MIME real, límites, expiración, retención y borrado.

**Alternativas consideradas.** PostgreSQL, filesystem local, objetos públicos y
acoplamiento directo a un proveedor concreto.

**Riesgos.** Exposición por ACL, signed URLs demasiado largas, path traversal
lógico, objetos huérfanos, residencia y costes.

### ADR-022 — Usar OpenAI como proveedor inicial de transcripción

| Campo | Valor |
| --- | --- |
| Identificador | `ADR-022` |
| Estado | `Accepted` |
| Fecha | 2026-07-13 |

**Contexto.** El MVP necesita transcripts temporizados de uploads autorizados.

**Decisión.** La primera integración prevista usará la API de OpenAI detrás de
un adapter de transcripción. El modelo será configurable y no se fija en esta
fase.

**Razones.** Permite comenzar con un proveedor administrado manteniendo el
dominio independiente.

**Consecuencias.** Antes de implementar se definirán datos enviados,
identificadores, timeouts, errores, retries, cancelación, retención, eliminación
y registro de consumo.

**Alternativas consideradas.** Procesamiento propio, otros proveedores y
transcripts aportados como único mecanismo.

**Riesgos.** Privacidad, límites de archivo, latencia, coste, disponibilidad,
idiomas y calidad temporal.

### ADR-023 — Usar OpenAI como proveedor inicial de análisis

| Campo | Valor |
| --- | --- |
| Identificador | `ADR-023` |
| Estado | `Accepted` |
| Fecha | 2026-07-13 |

**Contexto.** El primer análisis necesita producir resultados estructurados a
partir de transcripts validados.

**Decisión.** La primera integración prevista usará la API de OpenAI detrás de
un adapter. Prompts, proveedor, modelo, schema y consumo permanecerán separados;
el modelo será configurable. Toda salida se validará antes de persistirse.

**Razones.** Conserva los límites de `ADR-010` y `ADR-012` mientras habilita una
integración inicial concreta.

**Consecuencias.** Se versionarán prompts, identificadores de modelo y schemas;
una salida inválida no será un resultado completado.

**Alternativas consideradas.** Otro proveedor, modelos propios y llamadas
directas desde el frontend o dominio.

**Riesgos.** Prompt injection, output inválido, coste, latencia, retención del
proveedor y cambios de comportamiento del modelo.

### ADR-024 — Aplazar fuentes externas

| Campo | Valor |
| --- | --- |
| Identificador | `ADR-024` |
| Estado | `Accepted` |
| Fecha | 2026-07-13 |

**Contexto.** URLs y plataformas añaden permisos, SSRF, tokens, scraping y
dependencias ajenas al valor central.

**Decisión.** YouTube, Instagram, TikTok, scraping, drives e importaciones
automáticas quedan fuera del primer MVP. Cada futura fuente requiere evidencia
y un ADR independiente.

**Razones.** Mantiene el primer flujo pequeño y reduce riesgos no esenciales.

**Consecuencias.** La arquitectura preservará adapters, pero no implementará
conectores anticipados. SSRF seguirá en el threat model futuro.

**Alternativas consideradas.** URL como fuente principal y soporte simultáneo
de varias plataformas.

**Riesgos.** Menor comodidad inicial y que el upload no represente el flujo
preferido del ICP.

### ADR-025 — Excluir billing del primer flujo vertical

| Campo | Valor |
| --- | --- |
| Identificador | `ADR-025` |
| Estado | `Accepted` |
| Fecha | 2026-07-13 |

**Contexto.** El valor y la economía unitaria todavía no están validados.

**Decisión.** Billing, pagos, planes y suscripciones quedan fuera del primer
flujo. El ledger de uso permanece provider-neutral y no presupone cobro.

**Razones.** Evita complejidad comercial antes de probar valor e intención de
pago.

**Consecuencias.** Monetización será una fase posterior con decisiones propias.

**Alternativas consideradas.** Suscripción desde el MVP y créditos gestionados
por el proveedor de billing.

**Riesgos.** Menor evidencia temprana de pago y necesidad de migrar límites de
piloto a una oferta comercial.

### ADR-026 — Confirmar procesamiento asíncrono mediante Jobs

| Campo | Valor |
| --- | --- |
| Identificador | `ADR-026` |
| Estado | `Accepted` |
| Fecha | 2026-07-13 |

**Contexto.** Upload, transcripción y análisis pueden superar el tiempo de una
petición HTTP. `ADR-006` y `ADR-016` ya establecen procesamiento asíncrono.

**Decisión.** `ProcessingJob` será el registro durable del flujo, con estados
de job `queued`, `processing`, `completed`, `failed` y `cancelled`. `pending` y
`uploaded` serán etapas visibles derivadas del upload y `Source`, no estados
duplicados del job.

**Razones.** Mantiene coherencia entre dominio, UI y cola interna.

**Consecuencias.** Retries, cancelación e idempotencia operan sobre el mismo
job; el queue message no es la entidad de negocio.

**Alternativas consideradas.** Procesamiento síncrono y un enum único mezclando
upload, source, transcript y job.

**Riesgos.** Estados derivados incoherentes, trabajos abandonados, doble coste y
cancelación parcial.

### ADR-027 — Mantener modelos y proveedores configurables mediante adapters

| Campo | Valor |
| --- | --- |
| Identificador | `ADR-027` |
| Estado | `Accepted` |
| Fecha | 2026-07-13 |

**Contexto.** OpenAI es el proveedor inicial previsto, pero modelos, precios y
capacidades cambian y no deben convertirse en reglas del dominio.

**Decisión.** Transcripción y análisis usarán adapters estrechos. Proveedor,
modelo, parámetros, prompts y schemas se resolverán mediante configuración
server-side versionada; no se expondrán secretos al browser.

**Razones.** Confirma `ADR-009`, `ADR-010` y `ADR-012` para las integraciones
elegidas.

**Consecuencias.** Se necesitan contratos, normalización de errores, metadata
de versión y tests de adapters.

**Alternativas consideradas.** SDKs dentro del dominio, modelos hard-coded y
selección de proveedor desde el cliente.

**Riesgos.** Abstracción demasiado genérica, falsa portabilidad y configuración
incompatible con resultados históricos.

## 4. Decision Register — Pending

Estas decisiones permanecen `Deferred`. Su registro no propone ni aprueba
vendors.

| Decisión pendiente | Estado | Evidencia necesaria para decidir |
| --- | --- | --- |
| Supabase Auth session details | `Deferred` | Transporte de tokens, expiración, revocación, CSRF/CORS, recuperación y MFA. |
| OpenAI analysis model y configuración | `Deferred` | Calidad, structured output, coste, latencia, privacidad y transcripts largos. |
| OpenAI transcription model y configuración | `Deferred` | Timestamps, idiomas, cobertura, coste, límites y fallos. |
| Billing provider | `Deferred` | Modelo comercial, créditos, fallos, webhooks, impuestos y conciliación. |
| Provider final de object storage compatible con S3 | `Deferred` | Región, acceso, seguridad, coste, lifecycle y hosting. |
| Hosting platform y region | `Deferred` | Runtime, PostgreSQL, worker, residencia, coste, backups y operación. |
| Librería de jobs PostgreSQL-backed | `Deferred` | Entrega, recuperación, mantenimiento, concurrencia, observabilidad y límites. |
| Herramientas de monitoring y error reporting | `Deferred` | Hosting, señales, privacidad de logs, alertas, presupuesto y objetivos. |
| Periodos de retention y deletion | `Deferred` | Requisitos legales, privacidad, soporte, coste y tipos de datos. |
| Tamaño, duración e idiomas del upload | `Deferred` | Investigación del ICP, calidad, latencia, coste y límites medidos. |
