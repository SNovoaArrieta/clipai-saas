---
description: Revisa cambios de ClipAI en solo lectura y reporta hallazgos priorizados.
agent: noryven-reviewer
subtask: true
---

Revisa en solo lectura el siguiente alcance, o el diff actual si no se aporta
uno:

$ARGUMENTS

Usa exclusivamente tus permisos normales. No ejecutes shell embebido, no
edites, no valides y no propongas cambios antes de enumerar hallazgos. Prioriza
bugs, seguridad, aislamiento entre workspaces, regresiones contractuales y
pruebas faltantes. Incluye archivo y linea para cada hallazgo.
