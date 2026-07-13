# ClipAI — Quality Rubric

## Estado y versionado

| Campo   | Valor                            |
| ------- | -------------------------------- |
| Versión | 0.1                              |
| Estado  | Rúbrica inicial sin evaluaciones |
| Fecha   | 2026-07-13                       |

Esta rúbrica sirve para evaluar manualmente una línea base y futuros resultados
de ClipAI. Crear la rúbrica no demuestra calidad ni satisface por sí solo el
criterio de Fase 0. Cada evaluación debe registrar la versión utilizada.

## Escala común

| Puntuación | Significado               |
| ---------- | ------------------------- |
| `0`        | Incorrecto o inutilizable |
| `1`        | Deficiente                |
| `2`        | Parcialmente útil         |
| `3`        | Útil con correcciones     |
| `4`        | Muy útil                  |
| `5`        | Listo para utilizar       |

Debe acompañarse cada puntuación con evidencia, correcciones necesarias y, si
aplica, el timestamp comprobado. No se define todavía un umbral global de
aprobación; se calibrará con ejemplos y evaluadores reales.

## 1. Transcripción

| Criterio                     | Qué comprobar                                                       |
| ---------------------------- | ------------------------------------------------------------------- |
| Fidelidad del texto          | Las palabras representan lo que realmente se escucha.               |
| Identificación del idioma    | Idioma y variante se reconocen sin distorsionar el contenido.       |
| Legibilidad                  | Puntuación, párrafos y limpieza permiten revisar el texto.          |
| Separación de ideas          | Los segmentos conservan unidades comprensibles.                     |
| Conservación del significado | La normalización no cambia intención ni hechos.                     |
| Nombres y términos           | Nombres propios y vocabulario técnico se transcriben correctamente. |
| Precisión temporal           | Texto y timestamps corresponden al audio o video.                   |
| Omisiones                    | Se identifican fragmentos relevantes ausentes.                      |
| Alucinaciones                | Se penaliza cualquier texto que no existe en la fuente.             |

## 2. Resumen

| Criterio                | Qué comprobar                                                 |
| ----------------------- | ------------------------------------------------------------- |
| Fidelidad               | No contradice el contenido.                                   |
| Cobertura               | Incluye las ideas importantes sin exigir ver todo el archivo. |
| Claridad                | Se entiende sin contexto innecesario.                         |
| Concisión               | Evita repetición y detalle que no aporta.                     |
| Ausencia de invenciones | No agrega hechos, conclusiones ni promesas inexistentes.      |
| Utilidad                | Ayuda a comprender y decidir el siguiente paso.               |

## 3. Puntos clave

| Criterio      | Qué comprobar                                                  |
| ------------- | -------------------------------------------------------------- |
| Relevancia    | Representan ideas importantes para el propósito del contenido. |
| Diversidad    | Cubren ángulos distintos cuando la fuente los contiene.        |
| Precisión     | Cada punto se sustenta en la fuente.                           |
| No repetición | No reformulan la misma idea para aumentar cantidad.            |
| Utilidad      | Facilitan una decisión editorial o comercial legítima.         |

## 4. Títulos y hooks

| Criterio               | Qué comprobar                                  |
| ---------------------- | ---------------------------------------------- |
| Relación con la fuente | Describen contenido realmente presente.        |
| Claridad               | Comunican una idea comprensible.               |
| Atención sin engaño    | Resultan atractivos sin clickbait falso.       |
| Adaptabilidad          | Encajan con el público y contexto evaluados.   |
| Variedad               | Evitan alternativas prácticamente idénticas.   |
| Afirmaciones           | No inventan resultados, autoridad o garantías. |

## 5. CTA, hashtags e ideas de publicaciones

| Criterio          | Qué comprobar                                               |
| ----------------- | ----------------------------------------------------------- |
| Coherencia        | Se relacionan con el contenido y su intención.              |
| Utilidad práctica | Pueden usarse o adaptarse con un propósito claro.           |
| Especificidad     | Evitan sugerencias genéricas sin relación con la fuente.    |
| Variedad          | Proponen alternativas distintas cuando existe base.         |
| Adecuación        | Respetan plataforma, audiencia y formato previsto.          |
| Ausencia de spam  | Evitan hashtags o recomendaciones irrelevantes y excesivas. |

## 6. Momentos o recomendaciones temporizadas

| Criterio                     | Qué comprobar                                        |
| ---------------------------- | ---------------------------------------------------- |
| Correspondencia temporal     | Inicio y final coinciden con el contenido citado.    |
| Límites comprensibles        | El fragmento comienza y termina sin cortes confusos. |
| Valor                        | El momento aporta una idea o resultado concreto.     |
| Contexto                     | Puede entenderse sin tergiversar la conversación.    |
| Reutilización                | Tiene uso editorial plausible bajo revisión humana.  |
| Ausencia de cortes engañosos | No cambia el significado al aislar el fragmento.     |

## 7. Evaluación global

| Criterio         | Pregunta de evaluación                                                  |
| ---------------- | ----------------------------------------------------------------------- |
| Ahorro percibido | ¿Reduce trabajo frente a la línea base medida?                          |
| Correcciones     | ¿Cuántas y qué tipo de correcciones necesita?                           |
| Confianza        | ¿Qué evidencia permite confiar o desconfiar del resultado?              |
| Reutilización    | ¿La persona evaluadora volvería a utilizar un resultado así?            |
| Entrega          | ¿Lo entregaría a un cliente después de la revisión indicada?            |
| Pago             | ¿Consideraría pagar por este nivel de resultado y bajo qué condiciones? |

## Hoja de evaluación

| Ejemplo | Versión de rúbrica | Evaluador anónimo | Área | Criterio | Puntuación | Evidencia | Corrección | Desacuerdo | Observaciones |
| ------- | ------------------ | ----------------- | ---- | -------- | ---------- | --------- | ---------- | ---------- | ------------- |

No añadir una fila sin una evaluación real. Los promedios nunca sustituyen el
detalle de fallos críticos, alucinaciones o timestamps incorrectos.

## Reglas de evaluación

- No evaluar únicamente calidad lingüística o estilo.
- Una salida elegante pero inventada recibe una calificación baja.
- Comprobar timestamps directamente contra el archivo autorizado.
- Registrar desacuerdos entre evaluadores y conservar ambas evaluaciones.
- Identificar correcciones necesarias, no solo una puntuación.
- Conservar resultados negativos, fallidos y sin recomendaciones.
- Ajustar la rúbrica solo con evidencia y publicar una nueva versión sin
  reescribir evaluaciones históricas.
- No usar outputs privados en demostraciones o casos comerciales sin
  autorización expresa.
