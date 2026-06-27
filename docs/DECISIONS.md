# ClipAI SaaS — Architecture Decisions

## 1. Estado y propósito del documento

| Campo | Valor |
| --- | --- |
| Documento | 03 — Architecture Decisions |
| Versión | 0.1 |
| Estado | Registro inicial aprobado |
| Estado de implementación | No implementada |
| Fase | Fase 0 — Foundation |
| Última actualización | 2026-06-26 |

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

## 4. Decision Register — Pending

Estas decisiones permanecen `Deferred`. Su registro no propone ni aprueba
vendors.

| Decisión pendiente | Estado | Evidencia necesaria para decidir |
| --- | --- | --- |
| Authentication provider y session model | `Deferred` | Experiencia, seguridad, lifecycle de sesión y mapeo a `User` y `Workspace`. |
| AI provider y model | `Deferred` | Calidad, structured output, coste, latencia, privacidad y transcripts largos. |
| Transcription mechanism y provider | `Deferred` | Acceso autorizado, timestamps, idiomas, cobertura, coste y fallos. |
| Billing provider | `Deferred` | Modelo comercial, créditos, fallos, webhooks, impuestos y conciliación. |
| Necesidad y provider de object storage | `Deferred` | Entradas, uploads, tamaños, acceso, seguridad, coste y retención. |
| Hosting platform y region | `Deferred` | Runtime, PostgreSQL, worker, residencia, coste, backups y operación. |
| Librería de jobs PostgreSQL-backed | `Deferred` | Entrega, recuperación, mantenimiento, concurrencia, observabilidad y límites. |
| Herramientas de monitoring y error reporting | `Deferred` | Hosting, señales, privacidad de logs, alertas, presupuesto y objetivos. |
| Periodos de retention y deletion | `Deferred` | Requisitos legales, privacidad, soporte, coste y tipos de datos. |
| Supported source types, languages y maximum video duration | `Deferred` | Investigación del ICP, acceso, calidad, latencia, coste y límites medidos. |
