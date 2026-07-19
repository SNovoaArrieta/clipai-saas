---
description: Diagnostica y coordina una correccion minima de ClipAI.
agent: noryven-cto
---

Gestiona el siguiente bug o fallo de ClipAI:

$ARGUMENTS

Usa tus permisos normales; no ejecutes shell embebido desde este comando.
Primero delega investigacion de solo lectura y determina causa raiz, impacto y
forma de reproduccion. Solicita al builder un plan de correccion minima sin
editar y presenta los archivos y validaciones previstos.

No delegues la correccion hasta recibir autorizacion explicita y comprobar que
la rama actual no es protegida. Dependencias, migraciones, commits y cambios
contractuales necesitan autorizaciones independientes. Despues coordina
validacion con los scripts existentes, revision de regresiones y actualizacion
documental solo si el comportamiento documentado cambia.
