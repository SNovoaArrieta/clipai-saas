---
description: Ejecuta validaciones autorizadas sin corregir fallos.
agent: noryven-cto
subtask: false
---

Delega exactamente una vez y exclusivamente en `noryven-tester` las siguientes
validaciones:

$ARGUMENTS

Confirma que los comandos estan autorizados antes de ejecutarlos. No invoques
otros especialistas, no instales dependencias y no corrijas automaticamente los
fallos. Devuelve cada comando, su codigo de salida y el resultado exacto.
