# ClipAI SaaS

ClipAI es una plataforma SaaS comercial planificada para convertir videos de
formato largo en recomendaciones estratégicas de contenido corto para TikTok,
Instagram Reels y YouTube Shorts.

## Estado del proyecto

ClipAI se encuentra en **Fase 0 — Foundation**. Este repositorio contiene la
documentación aprobada y el toolchain inicial, pero todavía no contiene las
aplicaciones frontend o backend.

Existe actualmente:

- documentación aprobada de producto, arquitectura, datos, API y seguridad;
- un workspace npm privado reservado para `client/` y `server/`;
- configuración base de TypeScript, ESLint, Prettier y CI; y
- un prototipo histórico aislado en `legacy/`, usado solo como referencia.

No está implementado:

- el frontend React/Vite;
- la API o el worker Express;
- PostgreSQL, Prisma o migrations;
- autenticación, autorización o billing;
- adquisición o procesamiento de videos y transcripts; ni
- análisis mediante IA o integraciones con proveedores.

## Documentación aprobada

- [Product Charter](docs/PRODUCT.md)
- [Architecture Foundation](docs/ARCHITECTURE.md)
- [Architecture Decisions](docs/DECISIONS.md)
- [Data Model Foundation](docs/DATABASE.md)
- [API Foundation](docs/API.md)
- [Security Foundation](docs/SECURITY.md)
- [Guía de desarrollo](docs/DEVELOPMENT.md)
- [Working Agreement](AGENTS.md)

## Estructura

```text
client/   # Workspace reservado para el frontend futuro
server/   # Workspace reservado para la API y el worker futuros
docs/     # Documentación de producto y técnica
legacy/   # Prototipos históricos excluidos de producción y tooling
```

## Requisitos

- Node.js `22.15.0` como mínimo dentro de la línea Node 22.
- npm `10.9.2` como mínimo dentro de la línea npm 10.

La versión de Node seleccionada está declarada en `.nvmrc`. Node 24 no es un
requisito de este repositorio.

## Instalación y validación

En PowerShell se recomienda invocar `npm.cmd`:

```powershell
node --version
npm.cmd --version
npm.cmd ci
npm.cmd run check
```

En shells donde `npm` se ejecute normalmente:

```sh
npm ci
npm run check
```

## Scripts raíz

| Script         | Comportamiento                                                                               |
| -------------- | -------------------------------------------------------------------------------------------- |
| `format`       | Aplica Prettier a los archivos administrados por el toolchain.                               |
| `format:check` | Comprueba formato sin modificar archivos.                                                    |
| `lint`         | Ejecuta ESLint con cero warnings permitidos.                                                 |
| `typecheck`    | Ejecuta el comando de cada workspace; por ahora informa que no hay aplicaciones TypeScript.  |
| `test`         | Ejecuta el comando de cada workspace; por ahora informa que no existen tests de aplicación.  |
| `build`        | Ejecuta el comando de cada workspace; por ahora informa que no existen builds de aplicación. |
| `check`        | Ejecuta format check, lint, typecheck, tests y builds en orden.                              |

Los scripts provisionales muestran explícitamente `[SKIPPED]`; no representan
cobertura ni aplicaciones construidas. Se reemplazarán por validaciones reales
cuando cada aplicación sea autorizada y creada.

Consulta [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) para las convenciones de
desarrollo, variables de entorno, revisión y solución de problemas en Windows.
