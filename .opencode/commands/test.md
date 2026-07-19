---
description: Ejecuta validaciones declaradas de ClipAI sin modificar ni instalar.
agent: noryven-tester
subtask: true
---

Valida el siguiente alcance:

$ARGUMENTS

Usa exclusivamente tus permisos normales; no ejecutes shell embebido desde este
comando. Si se solicita validacion completa o no se especifica un alcance,
ejecuta `npm run check`. Para una validacion focalizada usa solo scripts
existentes expresamente permitidos.

Solicita autorizacion antes de pruebas integrales. No instales dependencias, no
ejecutes migraciones, no uses Prisma o Vitest directamente y no corrijas
archivos. Reporta comandos exactos, resultados, pasos omitidos y bloqueos.
