# ClipAI SaaS

ClipAI es una plataforma SaaS comercial planificada para convertir videos de
formato largo en recomendaciones estratégicas de contenido corto para TikTok,
Instagram Reels y YouTube Shorts.

## Estado del proyecto

ClipAI se encuentra en **Fase 1 — Internal Alpha**. El repositorio contiene una
fundación backend Express/TypeScript con persistencia PostgreSQL/Prisma,
autenticación server-side y el primer flujo privado de Source por upload.

Existe actualmente:

- documentación de producto, arquitectura, datos, API y seguridad;
- API autenticada para Projects, Sources, uploads y attestations;
- confirmación versionada e inspección MP4, MOV, MP3 y WAV mediante ffprobe;
- configuración de TypeScript, ESLint, Prettier, Prisma, Vitest y CI; y
- un prototipo histórico aislado en `legacy/`, usado solo como referencia.

No está implementado:

- el frontend React/Vite;
- activación de Sources, workers, queues o ProcessingJobs;
- transcripción, análisis, consumo o billing;
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
client/   # Workspace reservado para el frontend
server/   # API Express, dominio, adapters y persistencia
docs/     # Documentación de producto y técnica
legacy/   # Prototipos históricos excluidos de producción y tooling
scripts/  # Aprovisionamiento explícito de herramientas de desarrollo/CI
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
npm.cmd run ffprobe:provision:win32-x64
npm.cmd run check
```

En shells donde `npm` se ejecute normalmente:

```sh
npm ci
npm run ffprobe:provision:linux-x64
npm run check
```

## Scripts raíz

| Script         | Comportamiento                                                  |
| -------------- | --------------------------------------------------------------- |
| `format`       | Aplica Prettier a los archivos administrados por el toolchain.  |
| `format:check` | Comprueba formato sin modificar archivos.                       |
| `lint`         | Ejecuta ESLint con cero warnings permitidos.                    |
| `typecheck`    | Ejecuta la comprobación TypeScript de cada workspace.           |
| `test`         | Ejecuta las pruebas unitarias de cada workspace.                |
| `build`        | Genera los builds autorizados de cada workspace.                |
| `check`        | Ejecuta format check, lint, typecheck, tests y builds en orden. |

Las pruebas PostgreSQL requieren `TEST_DATABASE_URL`. El contract test real de
media requiere `FFPROBE_PATH`; los scripts `ffprobe:provision:*` descargan el
artefacto fijado, verifican su SHA-256 y no se ejecutan durante requests.

Consulta [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) para las convenciones de
desarrollo, variables de entorno, revisión y solución de problemas en Windows.
