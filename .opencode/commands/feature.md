---
description: Planifica y coordina una feature de ClipAI con autorizaciones y revision.
agent: noryven-cto
---

Gestiona la siguiente solicitud de feature para ClipAI:

$ARGUMENTS

Usa tus permisos normales; no ejecutes shell embebido desde este comando.
Delega exploracion, solicita al builder un plan sin ediciones y presenta al
usuario alcance, archivos, criterios de aceptacion, pruebas, documentacion y
posibles cambios contractuales, dependencias o migraciones.

No delegues implementacion hasta recibir autorizacion explicita y comprobar que
la rama actual no es protegida. Solicita autorizaciones separadas para
dependencias, migraciones, commits y contratos. Tras una implementacion
autorizada, coordina `npm run check` mediante tester, revision de solo lectura y
documentacion cuando corresponda. Finaliza con un handoff verificable.
