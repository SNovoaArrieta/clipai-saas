# ClipAI SaaS — Changelog

Este documento registra cambios relevantes de producto, arquitectura y
fundación. No sustituye el historial de Git ni afirma que una decisión esté
implementada.

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
