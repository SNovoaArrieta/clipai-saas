# ClipAI — Phase 0 Validation Evidence Index

## Estado y propósito

| Campo   | Valor                                   |
| ------- | --------------------------------------- |
| Versión | 0.1                                     |
| Estado  | Índice inicial; evidencia no recopilada |
| Fecha   | 2026-07-13                              |

Este índice conecta criterios pendientes de Fase 0 con evidencia revisable. No
contiene resultados aceptados. Un documento o plantilla existente no equivale a
evidencia recopilada.

La recolección de evidencia comercial queda aplazada hasta la fase de External
Product Validation, posterior a una Demonstrable Alpha. Las mediciones técnicas
internas podrán informar esa preparación, pero no cambian por sí solas los
estados comerciales: todos los criterios de este índice permanecen
`Not started` hasta que exista actividad externa trazable y revisada.

## Estados permitidos

| Estado                | Significado                                                         |
| --------------------- | ------------------------------------------------------------------- |
| `Not started`         | No existe actividad ni evidencia registrada.                        |
| `In progress`         | La recopilación comenzó, sin evidencia suficiente para revisar.     |
| `Evidence collected`  | Existen registros trazables, todavía no revisados.                  |
| `Reviewed`            | La evidencia fue revisada y conserva limitaciones explícitas.       |
| `Accepted`            | La Product Owner acepta que satisface el criterio definido.         |
| `Rejected`            | La evidencia no apoya el criterio o demuestra lo contrario.         |
| `Needs more evidence` | La evidencia es insuficiente, contradictoria o poco representativa. |

Solo una revisión explícita puede mover un criterio a `Accepted`. `Rejected` no
significa ocultar resultados; exige conservarlos y documentar la decisión.

## Índice inicial

| Criterio                           | Evidencia requerida                                    | Documento o registro                       | Responsable  | Estado        | Fecha | Resultado | Decisión | Limitaciones              | Próximo paso                       |
| ---------------------------------- | ------------------------------------------------------ | ------------------------------------------ | ------------ | ------------- | ----- | --------- | -------- | ------------------------- | ---------------------------------- |
| Selección del segmento prioritario | Comparación trazable de segmentos y decisión revisada  | `VALIDATION_PLAN.md`                       | `Unassigned` | `Not started` | —     | —         | —        | Sin entrevistas           | Elegir segmentos de primera ronda  |
| Frecuencia del problema            | Registros anónimos de casos recientes                  | `VALIDATION_PLAN.md`                       | `Unassigned` | `Not started` | —     | —         | —        | Sin entrevistas           | Preparar reclutamiento             |
| Severidad del problema             | Consecuencias, retrabajo y urgencia observados         | `VALIDATION_PLAN.md`                       | `Unassigned` | `Not started` | —     | —         | —        | Sin entrevistas           | Aplicar guion abierto              |
| Coste o tiempo actual              | Estimaciones justificadas y mediciones                 | `VALIDATION_PLAN.md`; `MANUAL_BASELINE.md` | `Unassigned` | `Not started` | —     | —         | —        | Sin registros             | Medir proceso manual               |
| Línea base manual                  | Varias sesiones comparables con tiempo activo y espera | `MANUAL_BASELINE.md`                       | `Unassigned` | `Not started` | —     | —         | —        | Plantilla vacía           | Seleccionar ejemplos autorizados   |
| Rúbrica de calidad                 | Rúbrica aplicada, calibrada y revisada                 | `QUALITY_RUBRIC.md`                        | `Unassigned` | `Not started` | —     | —         | —        | Rúbrica sin evaluaciones  | Realizar calibración manual        |
| Ejemplos representativos           | Registro con autorización y cobertura revisada         | `REPRESENTATIVE_EXAMPLES.md`               | `Unassigned` | `Not started` | —     | —         | —        | Registro vacío            | Identificar candidatos seguros     |
| Viabilidad del upload              | Evidencia de aceptación, formatos, fricción y riesgos  | Entrevistas; pruebas futuras               | `Unassigned` | `Not started` | —     | —         | —        | Sin evidencia             | Preguntar barreras de upload       |
| Calidad de transcripción           | Evaluaciones contra fuente con rúbrica                 | `QUALITY_RUBRIC.md`                        | `Unassigned` | `Not started` | —     | —         | —        | Sin análisis              | Esperar prueba autorizada          |
| Coste preliminar por análisis      | Costes trazables por duración y etapa                  | Registro futuro de costes                  | `Unassigned` | `Not started` | —     | —         | —        | Sin provider test         | Definir protocolo de medición      |
| Latencia preliminar                | Tiempo activo y espera por etapa                       | Registro futuro de pruebas                 | `Unassigned` | `Not started` | —     | —         | —        | Sin provider test         | Definir protocolo de medición      |
| Riesgos de privacidad              | Hallazgos de entrevistas y revisión del flujo          | Entrevistas; `SECURITY.md`                 | `Unassigned` | `Not started` | —     | —         | —        | Sin evidencia de usuarios | Investigar restricciones           |
| Retención provisional              | Categorías, periodos, justificación y revisión         | Política futura                            | `Unassigned` | `Not started` | —     | —         | —        | Política pendiente        | Preparar propuesta separada        |
| Eliminación provisional            | Workflow, SLA, provider y verificación                 | Política futura                            | `Unassigned` | `Not started` | —     | —         | —        | Política pendiente        | Preparar propuesta separada        |
| Umbrales ajustados                 | Comparación de evidencia con objetivos de `PRODUCT.md` | Síntesis futura                            | `Unassigned` | `Not started` | —     | —         | —        | Sin mediciones            | Revisar después de recopilar datos |

## Plantilla de evidencia individual

| Campo                     | Registro      |
| ------------------------- | ------------- |
| ID de evidencia           | `[Pendiente]` |
| Criterio relacionado      | `[Pendiente]` |
| Fuente o registro anónimo | `[Pendiente]` |
| Método de recopilación    | `[Pendiente]` |
| Fecha                     | `[Pendiente]` |
| Evidencia observada       | `[Pendiente]` |
| Interpretación separada   | `[Pendiente]` |
| Evidencia contradictoria  | `[Pendiente]` |
| Limitaciones              | `[Pendiente]` |
| Revisor                   | `[Pendiente]` |
| Estado posterior          | `[Pendiente]` |

## Reglas de gobernanza

- Enlazar evidencia concreta; no sustituirla por una conclusión sin fuente.
- No guardar PII, archivos privados, secrets ni transcripts completos en el
  índice.
- Conservar evidencia contradictoria, negativa e inconclusa.
- Registrar responsable, fecha, limitaciones y próximo paso en cada cambio.
- No marcar `Accepted` por crear una plantilla o completar una sola actividad.
- Reflejar un criterio como cumplido en `PRODUCT.md` solo después de revisión y
  aceptación explícitas.
- La autorización de Internal Alpha no acepta ninguna evidencia comercial. El
  conjunto deberá revisarse antes de superar el gate de External Product
  Validation.
