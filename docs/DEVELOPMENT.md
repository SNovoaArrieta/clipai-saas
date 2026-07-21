# ClipAI SaaS — Development Guide

## Estado y alcance

Esta guía describe el toolchain inicial de **Fase 0 — Foundation**. Los
workspaces `client/` y `server/` solo tienen manifiestos mínimos: todavía no
existen aplicaciones React, Vite, Express o Prisma ni código de dominio.

`legacy/clipai-youtube.jsx` es una referencia inmutable. Está fuera de los
workspaces, imports, builds, linting, formatting y tests de producción.

## Versiones requeridas

- Node.js: `>=22.15.0 <23`.
- npm: `>=10.9.2 <11`.

`.nvmrc` declara Node `22.15.0` para alinear el entorno local y CI. Una
actualización a Node 24 requiere una revisión deliberada de compatibilidad y del
entorno de la fundadora; Node 24 no es necesario actualmente.

Comprueba las versiones antes de instalar:

```powershell
node --version
npm.cmd --version
```

Con nvm-windows, si la versión todavía no está instalada:

```powershell
nvm install 22.15.0
nvm use 22.15.0
```

## Windows y PowerShell

PowerShell puede resolver `npm` mediante `npm.ps1` y bloquearlo por su execution
policy. No es necesario cambiar la política del sistema para trabajar en este
repositorio: usa el ejecutable `npm.cmd` en los comandos locales.

```powershell
npm.cmd ci
npm.cmd run check
```

Para comprobar qué ejecutables están disponibles:

```powershell
Get-Command node
Get-Command npm.cmd
```

## Instalación

Desde la raíz del repositorio:

```powershell
npm.cmd ci
```

`npm ci` usa el `package-lock.json` versionado y no modifica las versiones
declaradas. Usa `npm.cmd install` únicamente al añadir, retirar o actualizar una
dependencia de forma intencional; revisa y versiona juntos `package.json` y el
lockfile resultante.

No instales dependencias sin documentar su finalidad y revisar su mantenimiento,
licencia, scripts de instalación y necesidad real.

## Scripts oficiales

| Comando PowerShell         | Propósito                                                              |
| -------------------------- | ---------------------------------------------------------------------- |
| `npm.cmd run format`       | Modifica los archivos administrados para aplicar Prettier.             |
| `npm.cmd run format:check` | Verifica formato sin escribir.                                         |
| `npm.cmd run lint`         | Ejecuta ESLint flat config sobre el código y configuración aplicables. |
| `npm.cmd run typecheck`    | Ejecuta el typecheck de cada workspace.                                |
| `npm.cmd run test`         | Ejecuta los tests de cada workspace.                                   |
| `npm.cmd run build`        | Construye cada workspace.                                              |
| `npm.cmd run check`        | Ejecuta todas las validaciones no mutantes en el orden de CI.          |

Mientras las aplicaciones no existan, `typecheck`, `test` y `build` terminan
correctamente después de mostrar `[SKIPPED]` e indicar que la validación de
aplicación correspondiente aún no está configurada. Esto no afirma cobertura,
compilación ni funcionalidad de producto. Al crear una aplicación, sus scripts
deben reemplazarse por comandos reales en el mismo cambio.

## Variables de entorno

- Los secretos locales pertenecen a archivos `.env` ignorados por Git.
- Nunca guardes API keys, tokens, passwords, cookies, credenciales o datos
  reales dentro del repositorio.
- Los archivos `.env.example` solo contienen nombres y valores ficticios
  seguros; nunca contienen secretos funcionales.
- No existe `.env.example` raíz porque el toolchain no necesita variables
  compartidas.
- `client/.env.example` y `server/.env.example` se crearán cuando cada
  aplicación introduzca variables reales y documentadas.
- Una variable expuesta mediante un prefijo público de Vite nunca se considera
  secreta.

**Los secretos y los datos de producción están prohibidos en desarrollo local,
tests, fixtures, documentación, logs, screenshots y artifacts de CI.**

## Git y commits

- Mantén los cambios pequeños, enfocados y revisables.
- No modifiques archivos ajenos al objetivo de la tarea.
- No trabajes directamente sobre `main` ni hagas push sin revisión.
- No crees commits automáticamente.
- Usa conventional commits:
  - `feat(scope):` funcionalidad nueva;
  - `fix(scope):` corrección;
  - `refactor(scope):` mejora interna;
  - `docs(scope):` documentación;
  - `test(scope):` tests; y
  - `chore(scope):` mantenimiento.

## Revisión y definición de terminado

Antes de solicitar revisión:

1. revisa `git status` y el diff completo;
2. confirma que no haya secretos ni datos de producción;
3. ejecuta `npm.cmd ci` desde el lockfile versionado;
4. ejecuta `npm.cmd run check`;
5. ejecuta `git diff --check`;
6. confirma que `legacy/` sigue sin cambios; y
7. actualiza documentación si cambió comportamiento o arquitectura.

Una tarea termina únicamente cuando el comportamiento solicitado existe, las
validaciones relevantes pasan, los fallos se reportan honestamente y el cambio
ha sido revisado. Los mensajes provisionales de los workspaces vacíos deben
reportarse como limitación, no como cobertura de aplicación.

## CI

GitHub Actions valida pull requests y pushes a `main`. El workflow instala con
`npm ci` y ejecuta format check, lint, typecheck, tests y builds como pasos
separados. Usa permisos de solo lectura y no despliega, no requiere PostgreSQL,
no usa secretos y no publica artifacts.

PostgreSQL solo podrá añadirse a CI cuando exista el backend y un readiness test
que lo necesite.

## Solución de problemas

### `npm.ps1 cannot be loaded because running scripts is disabled`

Usa `npm.cmd` en lugar de `npm`:

```powershell
npm.cmd ci
npm.cmd run check
```

### La versión de Node no coincide

Comprueba `node --version`, revisa `.nvmrc` y activa Node `22.15.0`. Cierra y
abre de nuevo la terminal si el gestor de versiones no actualizó el `PATH`.

### `npm ci` indica que el lockfile no coincide

No edites `package-lock.json` manualmente. Confirma que `package.json` y el
lockfile provienen del mismo cambio. Si la dependencia cambió intencionalmente,
ejecuta `npm.cmd install`, revisa el diff y vuelve a ejecutar `npm.cmd ci`.

### Los comandos indican que no hay aplicación configurada

Es el comportamiento esperado durante esta etapa de Fase 0. No añadas tests
ficticios ni builds vacíos para ocultarlo. Los scripts se sustituirán cuando se
creen las aplicaciones autorizadas.
