# ClipAI SaaS — Changelog

Este documento registra cambios relevantes de producto, arquitectura y
fundación. No sustituye el historial de Git ni afirma que una decisión esté
implementada.

## 2026-07-13 — Internal user and personal workspace persistence

### Added

- Prisma ORM `7.8.0`, PostgreSQL mediante `PrismaPg`, schema físico y migración
  inicial para `User` y `Workspace`.
- Restricciones UUID, primary keys, `User.authSubject` único,
  `Workspace.ownerUserId` único y foreign key con eliminación `RESTRICT`.
- Contrato provider-neutral `IdentityProvisioner` e implementación transaccional
  idempotente que actualiza email sin borrarlo cuando falta en un token posterior.
- Proyección interna de `GET /api/v1/me` con `user.id`, email opcional y
  `workspace.id`, sin exponer `authSubject` ni ownership interno.
- Códigos seguros de indisponibilidad de persistencia, configuración de
  `DATABASE_URL`, scripts explícitos de Prisma y shutdown de HTTP y PostgreSQL.
- Nueve pruebas de integración PostgreSQL protegidas por `NODE_ENV=test`,
  `TEST_DATABASE_URL` y nombre de base que contenga `test`.

### Validation status

- Las 40 pruebas unitarias se ejecutan sin PostgreSQL, Supabase real ni acceso a
  Internet.
- La migración fue revisada y Prisma valida y genera el cliente sin conexión a
  una base de datos.
- La migración y las nueve pruebas PostgreSQL no se ejecutaron porque el entorno
  no dispone de `TEST_DATABASE_URL` ni servicio PostgreSQL local.
- `npm audit` reporta tres hallazgos moderados en tooling de desarrollo, desde
  `@hono/node-server` transitivo de `@prisma/dev`; la única corrección propuesta
  por npm baja a Prisma 6 y no se aplicó porque esta tarea requiere Prisma 7.
- No se añadieron Projects, uploads, Jobs, IA, equipos, memberships, billing ni
  código en `client/`.

## 2026-07-13 — Supabase identity boundary

### Added

- Verificación criptográfica de Supabase access tokens mediante `jose`, JWKS
  público, issuer, audience, expiración y claims temporales.
- Validación estricta de `role=authenticated` y `sub` con formato UUID para
  tokens Supabase; `anon`, `service_role`, roles ausentes o inválidos se
  rechazan de forma uniforme.
- Límites explícitos del JWKS remoto: timeout de 5 segundos, cooldown de 30
  segundos y caché máxima de 10 minutos mediante `jose`.
- Contratos provider-neutral `IdentityVerifier` y `AuthenticatedIdentity`,
  extracción estricta de `Authorization: Bearer` y middleware de autenticación.
- Ruta protegida `GET /api/v1/me` con una proyección temporal y mínima de la
  identidad verificada.
- Tests HTTP y criptográficos con claves y JWKS locales, sin red externa ni
  credenciales reales.

### Status

- No existen todavía `User` o `Workspace` persistidos, login, registro,
  recuperación, logout, revocación ni lifecycle completo de sesión.
- No se añadieron Supabase SDK, JWT secret, `service_role`, base de datos,
  uploads ni integración de IA.
- La integración real requiere JWT Signing Keys asimétricas (`ES256` o `RS256`)
  y no acepta tokens legacy `HS256`; el proyecto real continúa pendiente de
  configuración y verificación.
- La verificación local no equivale a autenticación completa ni a validación
  comercial del producto.

## 2026-07-13 — Product-first strategy and Internal Alpha

### Changed

- La Product Owner aprobó una estrategia product-first y autorizó la Fase 1 —
  Internal Alpha después del cierre documental de la Fase 0.
- La investigación externa, las entrevistas, la prospección, el contacto con
  aliados o posibles clientes y la selección definitiva del ICP quedan
  aplazados hasta contar con una Demonstrable Alpha.
- La etapa previa medirá internamente funcionamiento, errores, calidad, tiempo,
  coste, utilidad práctica y seguridad básica con contenido propio, sintético o
  expresamente autorizado.
- `ClipAI` se utiliza únicamente como nombre provisional interno, nombre del
  repositorio y codename de desarrollo; no es un nombre comercial definitivo ni
  una marca o identidad pública aprobada. La empresa continúa sin nombre
  definitivo.

### Status

- Construir la Internal Alpha no equivale a validación comercial ni demuestra
  demanda, intención de pago o product-market fit.
- Las evidencias comerciales pendientes conservan sus estados y el plan de
  validación se mantiene sin ejecutar hasta después de la Demonstrable Alpha.

## 2026-07-13 — Product validation kit

### Added

- Plan operativo para comparar segmentos y registrar entrevistas anónimas.
- Plantilla para medir la línea base del proceso manual.
- Rúbrica versionada para transcripción, análisis y outputs editoriales.
- Registro de ejemplos representativos y sus permisos de uso.
- Índice trazable de evidencias para los criterios pendientes de Fase 0.

### Status

- El kit contiene instrumentos y plantillas, no entrevistas, mediciones,
  resultados ni evidencia aceptada.
- Ningún criterio pendiente cambia de estado por crear estos documentos.
- La Fase 0 continúa abierta y la Fase 1 continúa sin autorización.

## 2026-07-13 — Founder product positioning

### Added

- Posicionamiento de ClipAI como primer software oficial de la empresa, producto
  insignia y primer activo tecnológico propio.
- Función del producto como caso real de software, automatización e IA,
  demostración comercial y posible caso de éxito con autorización.
- Uso de los aprendizajes como base para futuros productos, sin convertir
  ClipAI en una plataforma genérica ni en un catálogo de servicios.
- Clasificación del segmento de freelancers y agencias como hipótesis inicial de
  ICP pendiente de validación, junto con los segmentos que deberán compararse.
- Reglas de privacidad para demostraciones, métricas y casos de éxito.
- Objetivos estratégicos para la empresa dentro de cada fase del roadmap.

### Status

- No cambia el alcance técnico ni el estado de implementación.
- La Fase 0 continúa sin cerrarse y la Fase 1 continúa sin autorización.
- No se asigna un nombre a la empresa ni se modifican decisiones técnicas.

## 2026-07-13 — Phase 0 exit gate

### Added

- Roadmap por fases y gate verificable de salida de Fase 0.
- Founder Book orientado a producto, alcance, riesgos y medición.
- Registros de decisión para upload directo, Supabase Auth, tenancy, storage
  compatible con S3, OpenAI, aplazamiento de fuentes externas y billing.
- Alcance autorizado del primer MVP y gates de seguridad del flujo vertical.

### Decision status

- Se aprueba el upload de archivos MP4, MOV, MP3 y WAV como primer `Source`.
- Se aprueba Supabase Auth como proveedor inicial de identidad.
- Se confirma tenancy por `Workspace`, con workspace personal en el MVP.
- Se aprueba object storage privado con interfaz compatible con S3; el proveedor
  final sigue pendiente.
- Se aprueba OpenAI como proveedor inicial de transcripción y análisis detrás de
  adapters, sin fijar modelos.
- Fuentes externas y billing quedan aplazados.
- Se confirma el procesamiento asíncrono y la validación de outputs antes de
  persistirlos.

### Gate conclusion

- La fundación documental inicial y el toolchain ya existen.
- El alcance y las decisiones iniciales del MVP quedan documentados.
- La Fase 0 **no se cierra todavía**: faltan evidencias de investigación de
  producto, línea base manual, rúbrica, ejemplos representativos y evaluación
  preliminar completa de coste y lifecycle de datos.
- La Fase 1 **no queda autorizada** hasta superar y aprobar ese gate.

## 2026-06-27 — Foundation and toolchain

### Added

- Security Foundation, API Foundation y Data Model Foundation.
- Toolchain raíz con npm workspaces, TypeScript, ESLint, Prettier y CI.
- Guía de desarrollo y scripts provisionales que reportan `[SKIPPED]` mientras
  no existen aplicaciones.

## 2026-06-26 — Initial documentary foundation

### Added

- Product Charter, Architecture Foundation y registro inicial de ADRs.
- Estructura `client/`, `server/`, `docs/` y `legacy/`.
- Aislamiento del prototipo histórico fuera de producción.
