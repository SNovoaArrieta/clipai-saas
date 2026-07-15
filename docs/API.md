# ClipAI SaaS — API Foundation

## 1. Estado y propósito del documento

| Campo | Valor |
| --- | --- |
| Documento | `05 — API Foundation` |
| Versión | `0.4` |
| Estado | `Approved as initial API design` |
| Estado de implementación | `Partial — Project/Source listing and private upload confirmation implemented` |
| Fase | Fase 1 — Internal Alpha |
| Última actualización | 2026-07-15 |

Este documento define el diseño inicial de la API HTTP que el frontend de
ClipAI podrá consumir cuando se autorice la construcción del MVP. Establece
convenciones REST, contratos preliminares, límites de seguridad y el
comportamiento observable del procesamiento asíncrono.

La fundación del servidor, `GET /health`, la frontera protegida de identidad y
el provisioning persistido de `User` y `Workspace` personal, la creación y el
listado de `Project`, el listado de `Source` por Project y la intención privada inicial de upload están implementados. El resto de rutas de dominio continúa
en estado `Draft / Not implemented`; este documento no crea una API pública para
terceros ni presenta el SaaS completo como construido.

La documentación se escribe en español. Rutas, headers, campos, entidades,
estados y códigos de error se mantienen en English para que puedan convertirse
en contratos técnicos sin traducciones ambiguas.

## 2. Principios de la API

1. **Backend autoritativo.** El servidor decide autenticación, autorización,
   tenancy, validación, uso y transiciones de estado. La validación del cliente
   solo mejora la experiencia.
2. **Workspace resuelto server-side.** Ningún request privado puede elegir un
   `workspaceId`; el servidor lo deriva de la sesión autenticada.
3. **Procesamiento asíncrono.** Transcripción y análisis no mantienen abierta
   una petición HTTP. `ProcessingJob` representa el trabajo durable y visible.
4. **Fuentes inmutables por job.** Cada `ProcessingJob` fija un solo `Source`.
   Una entrada alternativa crea otro `Source`; después de cerrar el job
   anterior, su análisis crea otro job.
5. **Un análisis activo por proyecto.** Un `Project` admite como máximo un
   `ProcessingJob` de análisis no terminal en el MVP.
6. **Operaciones idempotentes.** Los reintentos de requests y queue messages no
   duplican proyectos, fuentes, attestations, análisis ni movimientos de uso.
7. **Contratos provider-neutral.** La API no expone payloads, errores, IDs ni
   capacidades específicas de proveedores externos.
8. **Errores seguros y accionables.** El cliente recibe códigos estables y
   mensajes seguros; los detalles internos permanecen en observabilidad.
9. **Resultados verificables.** Los timestamps se expresan en milisegundos y
   provienen de segmentos temporizados validados, no de estimaciones libres.
10. **Simplicidad operativa.** El contrato debe poder ser implementado y operado
   por un equipo fundador de dos personas.
11. **Evolución explícita.** Las decisiones pendientes se registran sin
    seleccionar silenciosamente proveedores, límites comerciales o formatos.

## 3. Base path y versionado

Las rutas de dominio futuras usarán el prefijo:

```text
/api/v1
```

Los health checks son operativos y no forman parte del contrato de dominio:

```text
/health/live
/health/ready
```

`v1` identifica la primera versión compatible del contrato HTTP. Un cambio que
rompa nombres, tipos, semántica o campos requeridos necesitará otra versión
mayor. Dentro de `v1` podrán añadirse campos opcionales, nuevos códigos seguros
o nuevos valores documentados de etapas; los clientes deberán ignorar campos
desconocidos en responses, pero el servidor rechazará campos desconocidos en
requests.

No se generará todavía una especificación OpenAPI. Este documento es la fuente
de diseño revisable durante Fase 0, no un artefacto ejecutable.

## 4. Autenticación y contexto de workspace

Todos los endpoints bajo `/api/v1` son privados y requieren una sesión válida,
incluido `GET /api/v1/me`. La primera frontera implementada acepta únicamente
`Authorization: Bearer <access-token>` y verifica JWTs de Supabase Auth mediante
el JWKS público fijo del proyecto, issuer, audience y claims temporales. El
frontend de sesión, refresh, revocación, logout, recuperación y demás lifecycle
continúa pendiente.

La integración real requiere que el proyecto Supabase tenga habilitado el
sistema de JWT Signing Keys asimétricas. El backend acepta únicamente `ES256` y
`RS256`; no verifica tokens `HS256` del sistema legacy ni utiliza el legacy JWT
secret, `anon`, `service_role` o secret API keys como identidad de usuario.

Para cada request privado, el backend deberá progresivamente:

1. validar el access token mediante el límite de identidad implementado;
2. resolver el `User` interno cuando exista persistencia;
3. resolver su `Workspace` personal cuando exista persistencia;
4. aplicar `workspaceId` a todas las lecturas y escrituras privadas; y
5. comprobar que las relaciones entre recursos pertenecen al mismo workspace.

El cliente puede enviar IDs opacos como `projectId`, `sourceId`,
`processingJobId` o `analysisId`. Esos IDs no confieren acceso. Un recurso que
existe en otro workspace responde igual que uno inexistente:
`404 RESOURCE_NOT_FOUND`.

`workspaceId` no se acepta en body, query ni como mecanismo de autorización.
Si aparece en un body de dominio, el servidor responde
`400 VALIDATION_ERROR`. `GET /api/v1/me` puede devolver el ID del workspace del
usuario para presentación o diagnóstico, pero ese valor nunca permite cambiar
el tenant de otro request.

## 5. Convenciones de request y response

- El transporte de producción será HTTPS.
- Los payloads de dominio usarán `application/json; charset=utf-8`.
- Los nombres JSON usarán `camelCase`.
- Los IDs serán strings opacos. El cliente no debe interpretar prefijos,
  longitud ni estrategia de generación.
- Los timestamps usarán ISO 8601 en UTC, por ejemplo
  `2026-06-27T16:30:00.000Z`.
- Los tiempos de contenido usarán enteros en milisegundos mediante campos como
  `startMs`, `endMs` y `durationMs`.
- Los campos opcionales se omitirán cuando no sean aplicables. `null` solo se
  usará cuando represente explícitamente ausencia dentro del contrato.
- Los enums y códigos usarán `snake_case`; los códigos de error usarán
  `UPPER_SNAKE_CASE`.
- El servidor rechazará JSON malformado, tipos incorrectos, campos desconocidos
  y valores fuera de los límites documentados.
- Los mensajes humanos no son claves de programa. El frontend deberá decidir
  comportamiento mediante `code`, `state`, `resultStatus` y
  `actionRequired.type`.
- Responses privadas y sensibles usarán `Cache-Control: no-store`.

Los ejemplos contienen IDs, fechas, referencias, cantidades e intervalos
ilustrativos. No seleccionan vendors, unidades comerciales, límites reales ni
formatos de ID.

## 6. Standard success envelope

Una respuesta de dominio exitosa contiene `data` y metadata transversal:

```json
{
  "data": {
    "id": "resource_01JYV7Y3M6Q9XG5W0R2N8A4C1B"
  },
  "meta": {
    "requestId": "req_01JYV80D9S4WJ7E2K6F3P1H8ZT"
  }
}
```

Las colecciones usan un array en `data` y añaden `meta.page`:

```json
{
  "data": [],
  "meta": {
    "requestId": "req_01JYV80D9S4WJ7E2K6F3P1H8ZT",
    "page": {
      "limit": 20,
      "nextCursor": null,
      "hasMore": false
    }
  }
}
```

Los health checks son una excepción deliberada: devuelven un payload mínimo y
no exponen recursos de dominio.

## 7. Standard error envelope

Todo error HTTP utiliza esta forma:

```json
{
  "code": "VALIDATION_ERROR",
  "message": "The request body is invalid.",
  "requestId": "req_01JYV83EAQ6Y4K8W2D9M5T7RNC",
  "details": {
    "fields": [
      {
        "field": "title",
        "reason": "required"
      }
    ]
  }
}
```

`code`, `message` y `requestId` son obligatorios. `details` es opcional y solo
incluye información segura y estructurada. Nunca contiene stack traces,
consultas SQL, secretos, tokens, referencias firmadas, prompts, transcripts,
payloads crudos de providers ni datos pertenecientes a otro workspace.

El mismo `code` conserva una semántica estable dentro de `v1`. `message` puede
mejorar o localizarse más adelante y no debe usarse para branching.

La fundación ejecutable todavía usa temporalmente
`{ "error": { "code", "message" } }`, sin `requestId`. La alineación con el
envelope objetivo y el tracing continúa pendiente y no se resuelve dentro del
límite de identidad.

## 8. Request IDs y tracing

El servidor genera un `requestId` único para cada request HTTP y lo devuelve:

- en el header `X-Request-Id`; y
- en `meta.requestId` para éxitos o `requestId` para errores.

Un ID suministrado por el cliente no reemplaza el identificador autoritativo
del servidor. Si en el futuro se acepta un correlation ID externo, se guardará
en un campo separado y validado.

Los logs estructurados podrán relacionar `requestId` con `workspaceId`,
`projectId`, `processingJobId` y el ID interno del queue message. Cada polling
request recibe un nuevo `requestId`; la continuidad del proceso se sigue con
`processingJobId`. Los IDs permiten correlación sin registrar el contenido
procesado.

## 9. Convenciones de validación

La validación server-side se ejecutará antes de cualquier efecto externo o
reserva de uso.

- Un body inexistente, campo requerido ausente o tipo incorrecto devuelve
  `400 VALIDATION_ERROR`.
- JSON sintácticamente inválido devuelve `400 INVALID_JSON`.
- Un cursor inválido o expirado devuelve `400 INVALID_CURSOR`.
- Un `Idempotency-Key` requerido, ausente o inválido devuelve
  `400 IDEMPOTENCY_KEY_REQUIRED` o `400 VALIDATION_ERROR`.
- Un body demasiado grande devuelve `413 CONTENT_TOO_LARGE`.
- Un media type no admitido devuelve `415 UNSUPPORTED_MEDIA_TYPE`.
- Una fuente bien formada pero no soportada devuelve
  `422 UNSUPPORTED_SOURCE`.
- Los IDs se validan como strings opacos antes de consultar datos.
- Los campos desconocidos se rechazan, incluido `workspaceId`.
- `PATCH /projects/:projectId` solo permite `title`; no permite modificar
  `state`, `activeSourceId`, timestamps ni ownership.
- Los endpoints de comando que no requieren parámetros aceptan un body vacío o
  `{}`; cualquier otro campo se rechaza.
- `POST /projects/:projectId/analyses` comprueba que no exista otro
  ProcessingJob de análisis en `queued`, `processing` o `awaiting_input` para
  el mismo Project. Una clave diferente ante un job no terminal devuelve
  `409 ANALYSIS_ALREADY_IN_PROGRESS`.
- `POST /projects/:projectId/archive` comprueba que el Project no tenga un
  ProcessingJob no terminal. Si existe, devuelve
  `409 PROJECT_HAS_ACTIVE_JOB` sin cancelar el job.

`details.fields` identifica campos mediante nombres públicos y razones seguras
como `required`, `invalid_type`, `unknown_field`, `too_short` o `too_long`. No
repite valores sensibles enviados por el usuario.

Los tamaños máximos, longitudes de texto, tipos de fuente y formatos permitidos
permanecen abiertos y deberán añadirse antes de implementar cada endpoint.

## 10. Convenciones de idempotencia

`Idempotency-Key` será obligatorio en estas operaciones de creación:

- `POST /api/v1/projects`
- `POST /api/v1/projects/:projectId/sources`
- `POST /api/v1/projects/:projectId/sources/:sourceId/attestations`
- `POST /api/v1/projects/:projectId/analyses`

La clave será un string opaco de 16 a 255 caracteres ASCII visibles y podrá
usar letras, números, `.`, `_`, `:`, y `-`. No es una credencial ni concede
acceso. El backend no deberá registrarla completa en logs.

La identidad idempotente se determina por workspace autenticado, operación,
clave y fingerprint normalizado de path y body:

- misma clave y mismo request semántico: devuelve la misma identidad de
  recurso sin repetir efectos;
- misma clave y payload, path o intención diferentes:
  `409 IDEMPOTENCY_CONFLICT`;
- requests concurrentes equivalentes: se serializan y observan un solo efecto.

Una replay puede devolver la representación durable más reciente del mismo
recurso, por lo que el body no tiene que ser byte a byte idéntico al original.
El header `Idempotency-Replayed: true` permite reconocer la replay. El status
original `201` o `202` puede repetirse.

Para iniciar un análisis, la clave se resuelve conceptualmente mediante
`(workspaceId, operation, requestIdempotencyKey)` y siempre apunta al mismo
`ProcessingJob`. Un retry del queue message también usa ese job: no crea otro
resultado ni otro movimiento de uso.

La idempotencia se evalúa antes del control de concurrencia del Project. Una
repetición con la misma clave continúa devolviendo el mismo ProcessingJob. Una
solicitud con otra clave, mientras exista un job de `operation = analysis` en
`queued`, `processing` o `awaiting_input` para el Project, devuelve
`409 ANALYSIS_ALREADY_IN_PROGRESS`. Sus `details` pueden incluir el
`processingJobId` existente después de comprobar que Project y job pertenecen
al workspace autenticado. Un queue retry ejecuta el mismo ProcessingJob y no
cuenta como otro análisis.

`archive`, `activate` y `cancel` no requieren header: alcanzar de nuevo el mismo
estado devuelve el recurso actual sin duplicar efectos. La duración de
retención de claves permanece pendiente; un cliente no debe reutilizar claves
para intenciones distintas.

## 11. Convenciones de paginación

Todos los list endpoints usan cursor pagination. No se admitirán `offset`,
`page` ni números de página.

Query parameters comunes:

| Parámetro | Regla |
| --- | --- |
| `limit` | Opcional; default `20`, mínimo `1`, máximo `100`. |
| `cursor` | Opcional; token opaco emitido por el servidor. |

El cliente no debe decodificar, editar ni construir cursores. Un cursor puede
capturar las claves de orden y filtros necesarios, pero su codificación,
firma y retención son detalles server-side todavía pendientes.

Órdenes estables iniciales:

| Colección | Orden |
| --- | --- |
| Projects | `updatedAt DESC`, `id DESC` |
| Sources | `createdAt DESC`, `id DESC` |
| Recommendations | `rank ASC`, `id ASC` |
| Usage ledger | `occurredAt DESC`, `id DESC` |

`nextCursor` es `null` y `hasMore` es `false` al finalizar. No se devuelve
`totalCount` en el contrato inicial. Si los filtros futuros afectan el orden,
formarán parte del cursor y no podrán cambiarse a mitad de la navegación.

## 12. Resource naming y convenciones HTTP

- Las colecciones usan sustantivos plurales: `projects`, `sources`,
  `analyses`, `recommendations` y `processing-jobs`.
- Los path parameters usan nombres explícitos como `:projectId`.
- Las acciones con semántica de comando usan subrutas verbales: `archive`,
  `activate`, `attestations` y `cancel`.
- `GET` nunca cambia estado.
- `POST` crea recursos o ejecuta comandos.
- `PATCH` actualiza únicamente los campos editables proporcionados.
- No se usa `DELETE` mientras la política normal sea archive/soft-delete.

Status codes iniciales:

| Status | Uso |
| --- | --- |
| `200 OK` | Lectura, actualización o comando completado. |
| `201 Created` | Creación durable de Project, Source o OwnershipAttestation. Incluye `Location`. |
| `202 Accepted` | ProcessingJob persistido y aceptado para trabajo asíncrono. Incluye `Location`. |
| `400 Bad Request` | JSON, cursor, idempotencia o validación inválidos. |
| `401 Unauthorized` | Sesión ausente o inválida. |
| `403 Forbidden` | Reservado para una prohibición explícita futura; no revela recursos de otro workspace. |
| `404 Not Found` | Recurso ausente o fuera del workspace. |
| `409 Conflict` | Conflicto de estado, uso o idempotencia. |
| `413 Content Too Large` | Payload supera un límite aprobado. |
| `415 Unsupported Media Type` | Media type no admitido. |
| `422 Unprocessable Content` | Entrada bien formada, pero no soportada semánticamente. |
| `429 Too Many Requests` | Rate limit excedido. |
| `500 Internal Server Error` | Fallo inesperado seguro. |
| `503 Service Unavailable` | Dependencia esencial o readiness no disponible. |

Los comandos de archive y cancelación devuelven la representación resultante
en lugar de `204`, lo que conserva el success envelope y permite al cliente
actualizar su estado sin una lectura adicional.

## 13. Draft endpoint catalog

Los endpoints indican individualmente su estado. Solo la proyección de identidad
y la creación y listado de Projects están implementados.

### Authentication/session boundary

| Estado | Método y ruta | Auth | Request | Response | Success |
| --- | --- | --- | --- | --- | --- |
| `Implemented — internal identity projection` | `GET /api/v1/me` | Required | Sin body | `User` y `Workspace` internos | `200` |

Después de verificar el Bearer token, `GET /api/v1/me` crea o recupera de forma
atómica el `User` interno y su único `Workspace` personal. Devuelve únicamente
la proyección interna:

```json
{
  "data": {
    "user": {
      "id": "7fb91c19-15de-4c33-9466-2fa72d541b35",
      "email": "user@example.com"
    },
    "workspace": {
      "id": "d281ed0c-2201-4ca5-8d9f-381ca4324618"
    }
  }
}
```

`email` se omite cuando no existe un valor almacenado. Un email válido del token
actualiza el mismo usuario; su ausencia no borra uno anterior. No se devuelven
`authSubject`, `ownerUserId`, token, claims completos, issuer, audience, roles,
metadata, timestamps, headers JWT o key identifiers.

Tras autenticación válida, una persistencia no configurada responde
`503 PERSISTENCE_NOT_CONFIGURED`; una indisponibilidad temporal responde
`503 PERSISTENCE_UNAVAILABLE`. Los errores inesperados usan
`500 INTERNAL_ERROR` sin exponer Prisma, SQL, constraints o conexión.

### Projects

| Estado | Método y ruta | Auth | Request | Response | Success |
| --- | --- | --- | --- | --- | --- |
| `Implemented — workspace-scoped foundation` | `POST /api/v1/projects` | Required | `{ title }` + `Idempotency-Key` | Project en `draft` | `201` |
| `Implemented — workspace-scoped foundation` | `GET /api/v1/projects` | Required | `cursor`, `limit` | Projects paginados | `200` |
| `Draft / Not implemented` | `GET /api/v1/projects/:projectId` | Required | Sin body | Project | `200` |
| `Draft / Not implemented` | `PATCH /api/v1/projects/:projectId` | Required | `{ title }` | Project actualizado | `200` |
| `Draft / Not implemented` | `POST /api/v1/projects/:projectId/archive` | Required | `{}` | Project en `archived` | `200` |

Project expone `id`, `title`, `state`, `activeSourceId`, `createdAt`,
`updatedAt` y `archivedAt`. `state` usa `draft`, `active` o `archived`. Crear un
proyecto nunca crea Source, ProcessingJob, reserva ni queue message.

La fundación implementada expone `id`, `title`, `state`, `createdAt`,
`updatedAt` y `archivedAt`; `activeSourceId` se añadirá únicamente cuando se
autorice la activación de Sources. `title` se recorta en sus extremos, admite Unicode, exige entre 1 y
160 caracteres y rechaza caracteres de control. El body acepta exclusivamente
`title`; ownership, IDs, estado y timestamps son server-controlled.

`POST /api/v1/projects` deriva el workspace del contexto interno y exige la
clave idempotente normativa. Una replay equivalente devuelve el mismo Project
con `201` e `Idempotency-Replayed: true`; reutilizar la clave con otro título
devuelve `409 IDEMPOTENCY_CONFLICT`.

`GET /api/v1/projects` filtra en PostgreSQL por el workspace resuelto, excluye
Projects archivados y usa `updatedAt DESC, id DESC`. `limit` conserva default
`20`, mínimo `1` y máximo `100`. El cursor opaco contiene las claves de orden y
el workspace interno, se valida antes de consultar y se rechaza si no coincide
con el contexto actual. La respuesta usa `meta.page` con `limit`, `nextCursor` y `hasMore`; al finalizar,
`nextCursor` es `null` conforme al contrato aprobado.

Archivar es síncrono e idempotente cuando no existe un ProcessingJob no
terminal. El endpoint no cancela jobs automáticamente en el MVP. Si el Project
tiene un job en `queued`, `processing` o `awaiting_input`, responde
`409 PROJECT_HAS_ACTIVE_JOB`. El usuario debe cancelar primero el job, esperar
hasta que alcance `completed`, `failed` o `cancelled`, y volver a solicitar el
archive.

### Sources

| Estado | Método y ruta | Auth | Request | Response | Success |
| --- | --- | --- | --- | --- | --- |
| `Implemented — private upload foundation` | `POST /api/v1/projects/:projectId/upload-intents` | Required | `{ filename, contentType, sizeBytes }` + `Idempotency-Key` | Source `submitted` + target PUT temporal | `201` |
| `Implemented — private upload confirmation` | `POST /api/v1/projects/:projectId/upload-intents/:uploadHandle/confirm` | Required | Body ausente o `{}` | Source `validating` + upload completado | `200` |
| `Draft / Not implemented` | `POST /api/v1/projects/:projectId/sources` | Required | `{ sourceType: "upload", uploadHandle }` + `Idempotency-Key` | Source | `201` |
| `Implemented — workspace/project-scoped foundation` | `GET /api/v1/projects/:projectId/sources` | Required | `cursor`, `limit` | Sources paginados | `200` |
| `Draft / Not implemented` | `POST /api/v1/projects/:projectId/sources/:sourceId/attestations` | Required | Attestation + `Idempotency-Key` | OwnershipAttestation | `201` |
| `Draft / Not implemented` | `POST /api/v1/projects/:projectId/sources/:sourceId/activate` | Required | `{}` | Project y Source | `200` |

Source expone `id`, `projectId`, `sourceType`, `safeReference`, `state`,
`isActive`, `durationMs`, `createdAt` y `updatedAt`. `safeReference` es una
representación apta para UI; no es una signed URL durable, una ruta interna ni
un payload de provider. `upload` es el primer tipo aprobado, limitado a MP4,
MOV, MP3 y WAV; `uploadHandle` es temporal, opaco, emitido server-side y no es
una object key elegida por el cliente. Los
estados conceptuales son `submitted`, `validating`, `accepted` y `rejected`.
`awaiting_input` pertenece exclusivamente a ProcessingJob. Una
Source puede permanecer `accepted` mientras su ProcessingJob cambia a
`awaiting_input` porque se necesita un transcript temporizado u otra entrada
alternativa.

`GET /api/v1/projects/:projectId/sources` deriva el Workspace del principal
autenticado y comprueba en PostgreSQL que el Project pertenezca a ese Workspace.
Un Project inexistente o perteneciente a otro Workspace devuelve el mismo
`404 PROJECT_NOT_FOUND`; un Project archivado conserva el contrato existente
`409 PROJECT_ARCHIVED`. La consulta excluye Sources archivadas y se ordena por
`createdAt DESC, id DESC`, sin offset. `limit` tiene default `20`, mínimo `1` y
máximo `100`. El cursor opaco queda ligado al Workspace interno, Project,
`createdAt` e `id`; se valida antes de consultar y un cursor malformado, con
checksum incoherente o emitido para otro scope devuelve
`400 SOURCE_QUERY_INVALID`. El checksum SHA-256 no usa una clave y no constituye
una firma criptográfica: detecta corrupción o mutaciones que no lo recalculen,
pero la autorización depende del binding de scope y de los filtros tenant-safe
en PostgreSQL. La respuesta usa
`meta.page.limit`, `nextCursor` y `hasMore`; en la última página devuelve
`nextCursor: null` y `hasMore: false`.

Cada elemento listado expone exclusivamente `id`, `projectId`, `sourceType`,
`safeReference`, `state`, `isActive`, `durationMs`, `createdAt` y `updatedAt`.
`durationMs` se convierte desde `BigInt` solo cuando puede representarse como un
entero JSON seguro. El endpoint no devuelve `workspaceId`, object keys, bucket,
signed URLs, handles de upload, `UploadIntent`, nombres internos, tamaños, MIME,
ETag, metadata de provider, idempotencia ni referencias internas de storage.

La ruta de upload intent crea atómicamente el `Source` en `submitted` y su
intención durable, pero no confirma que el objeto exista. Acepta declaraciones
MP4, MOV, MP3 y WAV de 1 a 262144000 bytes; filename, tipo y tamaño siguen siendo
datos no confiables hasta una confirmación posterior. Devuelve un handle opaco,
una URL `PUT` firmada por diez minutos y los headers requeridos `Content-Type` y
`x-amz-meta-upload-intent-id`, ambos ligados a la firma. No
persiste la URL ni expone object key, bucket o ownership interno. El endpoint
genérico `POST /sources` permanece en draft y no debe duplicar este Source.
La limpieza automática de intenciones expiradas permanece pendiente; una
intención vigente o regenerada no afirma que el objeto exista.

La confirmación busca la intención solo dentro del Project y Workspace
autenticados, ejecuta `HeadObject` sobre la object key persistida y exige tamaño,
`Content-Type` normalizado y metadata `upload-intent-id` coincidentes. Persiste
solo tamaño y tipo observados, `completedAt` y un ETag opaco opcional; el ETag no
es un checksum y nunca se devuelve. La operación permite confirmar después de
`expiresAt`, porque ese campo solo expira el target firmado. La primera
confirmación cambia `submitted → validating`; no verifica MIME real, no acepta,
no attesta y no activa el Source. Un replay completado no repite `HEAD` y puede
incluir `Upload-Confirmation-Replayed: true`.

Crear una fuente no inicia análisis ni consume uso. La attestation requiere:

```json
{
  "accepted": true,
  "statementVersion": "ownership-v1",
  "authorizationBasis": "owner"
}
```

`statementVersion` y `authorizationBasis` son campos públicos, pero sus valores
definitivos requieren revisión legal y de producto. Una attestation registra
una declaración del usuario; no constituye garantía legal.

Activar una fuente exige que pertenezca al proyecto y workspace, esté
`accepted` y tenga una attestation válida. El proyecto mantiene como máximo un
`activeSourceId`. Activar no inicia un análisis, no reserva uso y no modifica el
`sourceId` de jobs existentes.

### Analysis processing

| Estado | Método y ruta | Auth | Request | Response | Success |
| --- | --- | --- | --- | --- | --- |
| `Draft / Not implemented` | `POST /api/v1/projects/:projectId/analyses` | Required | `{}` + `Idempotency-Key` | ProcessingJob | `202` |
| `Draft / Not implemented` | `GET /api/v1/processing-jobs/:processingJobId` | Required | Sin body | ProcessingJob | `200` |
| `Draft / Not implemented` | `POST /api/v1/processing-jobs/:processingJobId/cancel` | Required | `{}` | ProcessingJob en `cancelled` | `200` |

Iniciar un análisis usa exclusivamente el `activeSourceId` del proyecto. El
request no acepta `sourceId` ni `workspaceId`. La fuente debe estar
`accepted`, activa y respaldada por una attestation. En una operación durable e
idempotente se crea el ProcessingJob, se fija su Source y se reserva uso antes
de habilitar trabajo externo.

El MVP permite como máximo un ProcessingJob con `operation = analysis` en
estado `queued`, `processing` o `awaiting_input` por Project. Una replay con la
misma `Idempotency-Key` devuelve ese mismo job. Una solicitud con una clave
distinta mientras el job sea no terminal devuelve
`409 ANALYSIS_ALREADY_IN_PROGRESS`; no crea otro job, reserva ni queue message.
Los retries técnicos del queue message pertenecen al mismo ProcessingJob y no
cuentan como jobs adicionales.

ProcessingJob expone:

- `id`, `projectId`, `sourceId` y `operation`; `operation` será `analysis`;
- `state`: `queued`, `processing`, `awaiting_input`, `completed`, `failed` o
  `cancelled`;
- `currentStage`: una etapa segura como `waiting`, `source_access`,
  `transcription`, `transcript_validation`, `analysis`, `result_validation` o
  `finalization`;
- `analysisId` cuando existe un resultado;
- `actionRequired` únicamente cuando el usuario debe actuar;
- `error` únicamente para un fallo seguro visible; y
- `createdAt`, `startedAt` y `completedAt`.

El cliente debe tolerar nuevas etapas seguras dentro de `currentStage` y basar
el lifecycle principalmente en `state`.

Cancelar es best effort e idempotente. `queued`, `processing` o
`awaiting_input` pueden pasar a `cancelled`; el backend impide persistir efectos
posteriores y libera una reserva activa cuando sea seguro. Una llamada externa
ya iniciada podría no poder interrumpirse físicamente, pero su resultado no
puede reactivar el job. Repetir sobre un job ya cancelado devuelve `200`; un job
`completed` o `failed` devuelve `409 JOB_NOT_CANCELLABLE`.

### Results

| Estado | Método y ruta | Auth | Request | Response | Success |
| --- | --- | --- | --- | --- | --- |
| `Draft / Not implemented` | `GET /api/v1/analyses/:analysisId` | Required | Sin body | Analysis | `200` |
| `Draft / Not implemented` | `GET /api/v1/analyses/:analysisId/recommendations` | Required | `cursor`, `limit` | ClipRecommendations paginadas | `200` |

Analysis expone `id`, `projectId`, `sourceId`, `processingJobId`, `state`,
`summary`, `mainTopic`, `resultStatus`, `recommendationCount` y `completedAt`.
Un resultado visible debe estar `completed`. `resultStatus` será
`recommendations_found` cuando exista al menos una recomendación válida o
`no_recommendations` cuando no exista ninguna. Ambos son resultados exitosos.

ClipRecommendation expone `id`, `analysisId`, `rank`, `startMs`, `endMs`,
`title`, `hook`, `platforms` y `rationale`. Las plataformas iniciales de
presentación son `tiktok`, `instagram_reels` y `youtube_shorts`. `rank` expresa
prioridad editorial, no probabilidad ni garantía de viralidad.

El primer MVP también podrá exponer `keyPoints` en `Analysis` y
`callToAction`, `hashtags` y `derivedPostIdeas` en cada recomendación. Estos
campos siguen `Draft / Not implemented`; sus límites y schema final deberán
versionarse y validarse server-side antes de incorporarlos a los ejemplos
normativos. `Generated Outputs` no es un recurso API ni una entidad adicional.

### Usage

| Estado | Método y ruta | Auth | Request | Response | Success |
| --- | --- | --- | --- | --- | --- |
| `Draft / Not implemented` | `GET /api/v1/usage/summary` | Required | Sin body | Resumen por unit | `200` |
| `Draft / Not implemented` | `GET /api/v1/usage/ledger` | Required | `cursor`, `limit` | Ledger entries paginados | `200` |

El summary usa una forma provider-neutral:

```json
{
  "asOf": "2026-06-27T17:00:00.000Z",
  "balances": [
    {
      "unit": "analysis",
      "available": 8,
      "reserved": 1,
      "consumed": 3
    }
  ]
}
```

`analysis` es solo una unidad ilustrativa; la unidad comercial real sigue
pendiente. Un ledger item expone `id`, `processingJobId`, `entryType`,
`quantity`, `unit`, `compensatesEntryId` y `occurredAt`. `entryType` puede ser
`reservation`, `settlement`, `release`, `expiration`, `adjustment_credit` o
`adjustment_debit`. Los items son inmutables; una corrección crea otro item.

### Health

| Estado | Método y ruta | Auth | Request | Response | Success |
| --- | --- | --- | --- | --- | --- |
| `Planned Phase 0 / Not implemented` | `GET /health/live` | Public | Sin body | `{ status: "ok" }` | `200` |
| `Planned Phase 0 / Not implemented` | `GET /health/ready` | Public | Sin body | `{ status: "ready" }` o `{ status: "not_ready" }` | `200`, `503` |

`live` solo indica que el proceso HTTP puede responder. `ready` comprueba las
dependencias esenciales definidas para el entorno. Ninguno devuelve versiones,
credenciales, hosts, nombres de bases de datos, detalles de providers ni stack
traces.

## 14. Detailed request y response examples

Los ejemplos de creación y validación de Project reflejan la implementación
actual. Los ejemplos de las demás rutas continúan como contratos de diseño no
implementados. Las credenciales de sesión se omiten porque su transporte sigue
pendiente.

### 14.1 Crear un draft project

```http
POST /api/v1/projects HTTP/1.1
Content-Type: application/json
Idempotency-Key: create-project:01JYV8D2AQ2YH8R3M7F5G9K4WP

{
  "title": "Episode 42 — Product strategy"
}
```

```http
HTTP/1.1 201 Created
Location: /api/v1/projects/9dbe3a14-ded1-4f9f-9ca7-e091a7a2f482
Cache-Control: no-store
Content-Type: application/json; charset=utf-8
```

```json
{
  "data": {
    "id": "9dbe3a14-ded1-4f9f-9ca7-e091a7a2f482",
    "title": "Episode 42 — Product strategy",
    "state": "draft",
    "createdAt": "2026-06-27T17:05:00.000Z",
    "updatedAt": "2026-06-27T17:05:00.000Z",
    "archivedAt": null
  }
}
```

No se crea una fuente, job, reserva ni queue message.

### 14.2 Crear una intención privada de upload

```http
POST /api/v1/projects/9dbe3a14-ded1-4f9f-9ca7-e091a7a2f482/upload-intents HTTP/1.1
Authorization: Bearer <token>
Content-Type: application/json
Idempotency-Key: create-upload:01JYV8M1D4P7Q2G5X9K3T6RNWB

{
  "filename": "Episodio 01.mp4",
  "contentType": "video/mp4",
  "sizeBytes": 52428800
}
```

```http
HTTP/1.1 201 Created
Cache-Control: no-store
Content-Type: application/json; charset=utf-8
```

```json
{
  "data": {
    "source": {
      "id": "87c00c7d-d959-46f1-a760-e067a42ae525",
      "sourceType": "upload",
      "state": "submitted",
      "safeReference": "Episodio 01.mp4",
      "durationMs": null,
      "isActive": false,
      "createdAt": "2026-07-13T18:00:00.000Z",
      "updatedAt": "2026-07-13T18:00:00.000Z"
    },
    "upload": {
      "handle": "0144e07d-7f4b-4c3d-82df-6ad1d9fd3188",
      "method": "PUT",
      "url": "https://temporary-signed-target.example.invalid/opaque",
      "headers": {
        "Content-Type": "video/mp4",
        "x-amz-meta-upload-intent-id": "0144e07d-7f4b-4c3d-82df-6ad1d9fd3188"
      },
      "expiresAt": "2026-07-13T18:10:00.000Z",
      "maxSizeBytes": 262144000
    }
  }
}
```

Un replay equivalente conserva Source y handle, genera otro target temporal y
devuelve `201` con `Idempotency-Replayed: true`. No se ejecuta el `PUT`; MIME,
tamaño, existencia y estructura reales continúan sin verificar.

### 14.3 Confirmar metadata del objeto cargado

```http
POST /api/v1/projects/9dbe3a14-ded1-4f9f-9ca7-e091a7a2f482/upload-intents/0144e07d-7f4b-4c3d-82df-6ad1d9fd3188/confirm HTTP/1.1
Authorization: Bearer <token>
Content-Type: application/json

{}
```

```json
{
  "data": {
    "source": {
      "id": "87c00c7d-d959-46f1-a760-e067a42ae525",
      "sourceType": "upload",
      "state": "validating",
      "safeReference": "Episodio 01.mp4",
      "durationMs": null,
      "isActive": false,
      "createdAt": "2026-07-13T18:00:00.000Z",
      "updatedAt": "2026-07-13T18:11:00.000Z"
    },
    "upload": {
      "handle": "0144e07d-7f4b-4c3d-82df-6ad1d9fd3188",
      "status": "completed",
      "sizeBytes": 52428800,
      "contentType": "video/mp4",
      "completedAt": "2026-07-13T18:11:00.000Z"
    }
  }
}
```

### 14.4 Añadir, attestar y activar una source

El ejemplo usa el único tipo aprobado para el primer MVP. La creación de la
intención de upload y el transporte al storage requieren un contrato separado
antes de implementación; `uploadHandle` representa esa capacidad temporal sin
exponer una signed URL ni una object key.

```http
POST /api/v1/projects/proj_01JYV8H42T5XQ9R6B3N7D1KMWC/sources HTTP/1.1
Content-Type: application/json
Idempotency-Key: create-source:01JYV8M1D4P7Q2G5X9K3T6RNWB

{
  "sourceType": "upload",
  "uploadHandle": "uph_01JYV8M0Q2K6R4T9P7N3X5CWBG"
}
```

```http
HTTP/1.1 201 Created
Location: /api/v1/projects/proj_01JYV8H42T5XQ9R6B3N7D1KMWC/sources/src_01JYV8P8C6W4Z2N9Q5T7M3HRGK
X-Request-Id: req_01JYV8PBBQ9H4M6R2K8X5T7GNC
Content-Type: application/json; charset=utf-8
```

```json
{
  "data": {
    "id": "src_01JYV8P8C6W4Z2N9Q5T7M3HRGK",
    "projectId": "proj_01JYV8H42T5XQ9R6B3N7D1KMWC",
    "sourceType": "upload",
    "safeReference": "episode-42.mp4",
    "state": "submitted",
    "isActive": false,
    "durationMs": null,
    "createdAt": "2026-06-27T17:07:00.000Z",
    "updatedAt": "2026-06-27T17:07:00.000Z"
  },
  "meta": {
    "requestId": "req_01JYV8PBBQ9H4M6R2K8X5T7GNC"
  }
}
```

```http
POST /api/v1/projects/proj_01JYV8H42T5XQ9R6B3N7D1KMWC/sources/src_01JYV8P8C6W4Z2N9Q5T7M3HRGK/attestations HTTP/1.1
Content-Type: application/json
Idempotency-Key: attest-source:01JYV8S5F7K2P9X4M6R3G8TNQC

{
  "accepted": true,
  "statementVersion": "ownership-v1",
  "authorizationBasis": "owner"
}
```

```http
HTTP/1.1 201 Created
Location: /api/v1/projects/proj_01JYV8H42T5XQ9R6B3N7D1KMWC/sources/src_01JYV8P8C6W4Z2N9Q5T7M3HRGK/attestations/att_01JYV8V3M5G7Q2R9T4K6X8NPCB
X-Request-Id: req_01JYV8V6R8T4M2P7G9K5Q3XNWC
Content-Type: application/json; charset=utf-8
```

```json
{
  "data": {
    "id": "att_01JYV8V3M5G7Q2R9T4K6X8NPCB",
    "sourceId": "src_01JYV8P8C6W4Z2N9Q5T7M3HRGK",
    "statementVersion": "ownership-v1",
    "authorizationBasis": "owner",
    "attestedAt": "2026-06-27T17:08:00.000Z"
  },
  "meta": {
    "requestId": "req_01JYV8V6R8T4M2P7G9K5Q3XNWC"
  }
}
```

Después de que la fuente supere la validación permitida y quede `accepted`, el
cliente puede activarla:

```http
POST /api/v1/projects/proj_01JYV8H42T5XQ9R6B3N7D1KMWC/sources/src_01JYV8P8C6W4Z2N9Q5T7M3HRGK/activate HTTP/1.1
Content-Type: application/json

{}
```

```json
{
  "data": {
    "project": {
      "id": "proj_01JYV8H42T5XQ9R6B3N7D1KMWC",
      "title": "Episode 42 — Product strategy",
      "state": "active",
      "activeSourceId": "src_01JYV8P8C6W4Z2N9Q5T7M3HRGK",
      "createdAt": "2026-06-27T17:05:00.000Z",
      "updatedAt": "2026-06-27T17:09:00.000Z",
      "archivedAt": null
    },
    "source": {
      "id": "src_01JYV8P8C6W4Z2N9Q5T7M3HRGK",
      "projectId": "proj_01JYV8H42T5XQ9R6B3N7D1KMWC",
      "sourceType": "upload",
      "safeReference": "episode-42.mp4",
      "state": "accepted",
      "isActive": true,
      "durationMs": 3725000,
      "createdAt": "2026-06-27T17:07:00.000Z",
      "updatedAt": "2026-06-27T17:09:00.000Z"
    }
  },
  "meta": {
    "requestId": "req_01JYV8Y8C4P6M2R9G7K3T5XNWB"
  }
}
```

Ninguna de estas tres operaciones inicia análisis o consume uso.

### 14.4 Iniciar un análisis idempotente

```http
POST /api/v1/projects/proj_01JYV8H42T5XQ9R6B3N7D1KMWC/analyses HTTP/1.1
Content-Type: application/json
Idempotency-Key: start-analysis:01JYV91B7G3M8Q2R5K9T4XN6PC

{}
```

```http
HTTP/1.1 202 Accepted
Location: /api/v1/processing-jobs/job_01JYV94G6T2P8M5R9K3X7QNWCB
Retry-After: 5
ClipAI-Usage-Unit: analysis
ClipAI-Usage-Reserved: 1
ClipAI-Usage-Remaining: 8
X-Request-Id: req_01JYV94K9R7M2T5G8Q3P6XNWCB
Content-Type: application/json; charset=utf-8
```

```json
{
  "data": {
    "id": "job_01JYV94G6T2P8M5R9K3X7QNWCB",
    "projectId": "proj_01JYV8H42T5XQ9R6B3N7D1KMWC",
    "sourceId": "src_01JYV8P8C6W4Z2N9Q5T7M3HRGK",
    "operation": "analysis",
    "state": "queued",
    "currentStage": "waiting",
    "analysisId": null,
    "createdAt": "2026-06-27T17:10:00.000Z",
    "startedAt": null,
    "completedAt": null
  },
  "meta": {
    "requestId": "req_01JYV94K9R7M2T5G8Q3P6XNWCB"
  }
}
```

Repetir el mismo request con la misma clave devuelve el mismo job y no crea
otra reserva:

```http
HTTP/1.1 202 Accepted
Idempotency-Replayed: true
Location: /api/v1/processing-jobs/job_01JYV94G6T2P8M5R9K3X7QNWCB
Retry-After: 5
X-Request-Id: req_01JYV96S3Q5G8M2R7T9K4XNWCB
Content-Type: application/json; charset=utf-8
```

El `state` de la representación replayed puede haber avanzado, pero `id`,
`projectId` y `sourceId` son los mismos.

Una solicitud con una `Idempotency-Key` diferente mientras ese job continúa no
terminal no crea un segundo análisis:

```http
POST /api/v1/projects/proj_01JYV8H42T5XQ9R6B3N7D1KMWC/analyses HTTP/1.1
Content-Type: application/json
Idempotency-Key: start-analysis:01JYVB1M6T3R8Q2G5K7X4PNWCB

{}
```

```http
HTTP/1.1 409 Conflict
X-Request-Id: req_01JYVB1Q8M4T2R7G5K3X6PNWCB
Content-Type: application/json; charset=utf-8
```

```json
{
  "code": "ANALYSIS_ALREADY_IN_PROGRESS",
  "message": "An analysis is already in progress for this project.",
  "requestId": "req_01JYVB1Q8M4T2R7G5K3X6PNWCB",
  "details": {
    "processingJobId": "job_01JYV94G6T2P8M5R9K3X7QNWCB"
  }
}
```

El ID es seguro porque el backend ya autorizó el Project y el ProcessingJob en
el mismo workspace. Esta respuesta no es `IDEMPOTENCY_CONFLICT`: la clave es
nueva, pero el Project ya tiene un análisis no terminal.

### 14.5 Polling de un queued o processing job

```http
GET /api/v1/processing-jobs/job_01JYV94G6T2P8M5R9K3X7QNWCB HTTP/1.1
```

```http
HTTP/1.1 200 OK
Retry-After: 5
X-Request-Id: req_01JYV99F2M6T8Q3R5K7G4XNWCB
Content-Type: application/json; charset=utf-8
```

```json
{
  "data": {
    "id": "job_01JYV94G6T2P8M5R9K3X7QNWCB",
    "projectId": "proj_01JYV8H42T5XQ9R6B3N7D1KMWC",
    "sourceId": "src_01JYV8P8C6W4Z2N9Q5T7M3HRGK",
    "operation": "analysis",
    "state": "queued",
    "currentStage": "waiting",
    "analysisId": null,
    "createdAt": "2026-06-27T17:10:00.000Z",
    "startedAt": null,
    "completedAt": null
  },
  "meta": {
    "requestId": "req_01JYV99F2M6T8Q3R5K7G4XNWCB"
  }
}
```

Una lectura posterior puede mostrar progreso sin cambiar el job:

```json
{
  "data": {
    "id": "job_01JYV94G6T2P8M5R9K3X7QNWCB",
    "projectId": "proj_01JYV8H42T5XQ9R6B3N7D1KMWC",
    "sourceId": "src_01JYV8P8C6W4Z2N9Q5T7M3HRGK",
    "operation": "analysis",
    "state": "processing",
    "currentStage": "transcription",
    "analysisId": null,
    "createdAt": "2026-06-27T17:10:00.000Z",
    "startedAt": "2026-06-27T17:10:04.000Z",
    "completedAt": null
  },
  "meta": {
    "requestId": "req_01JYV9C1T8G4M2R7Q5K9X3NWCB"
  }
}
```

### 14.6 Recibir awaiting input

```http
HTTP/1.1 200 OK
X-Request-Id: req_01JYV9F5Q3M8T2R7K4G6X9NWCB
Content-Type: application/json; charset=utf-8
```

```json
{
  "data": {
    "id": "job_01JYV94G6T2P8M5R9K3X7QNWCB",
    "projectId": "proj_01JYV8H42T5XQ9R6B3N7D1KMWC",
    "sourceId": "src_01JYV8P8C6W4Z2N9Q5T7M3HRGK",
    "operation": "analysis",
    "state": "awaiting_input",
    "currentStage": "transcription",
    "analysisId": null,
    "actionRequired": {
      "type": "alternative_source_required",
      "reasonCode": "TIMED_TRANSCRIPT_REQUIRED",
      "message": "Provide an authorized alternative source with reliable timing."
    },
    "createdAt": "2026-06-27T17:10:00.000Z",
    "startedAt": "2026-06-27T17:10:04.000Z",
    "completedAt": null
  },
  "meta": {
    "requestId": "req_01JYV9F5Q3M8T2R7K4G6X9NWCB"
  }
}
```

`awaiting_input` no mantiene un worker ocupado. El usuario puede registrar otra
Source, attestarla y activarla, pero primero debe cancelar el job anterior y
observar `state = cancelled`. Solo entonces un nuevo `POST /analyses` con otra
clave crea otro ProcessingJob. El job anterior libera su reserva activa cuando
sea seguro y conserva su `sourceId` original.

### 14.7 Recibir un completed analysis con recommendations

El job completado referencia el resultado:

```json
{
  "data": {
    "id": "job_01JYV94G6T2P8M5R9K3X7QNWCB",
    "projectId": "proj_01JYV8H42T5XQ9R6B3N7D1KMWC",
    "sourceId": "src_01JYV8P8C6W4Z2N9Q5T7M3HRGK",
    "operation": "analysis",
    "state": "completed",
    "currentStage": "finalization",
    "analysisId": "ana_01JYV9K8R4T2M7Q5G3X6PNWCB",
    "createdAt": "2026-06-27T17:10:00.000Z",
    "startedAt": "2026-06-27T17:10:04.000Z",
    "completedAt": "2026-06-27T17:16:00.000Z"
  },
  "meta": {
    "requestId": "req_01JYV9KB6M3T8Q2R7G5X4PNWCB"
  }
}
```

```http
GET /api/v1/analyses/ana_01JYV9K8R4T2M7Q5G3X6PNWCB HTTP/1.1
```

```json
{
  "data": {
    "id": "ana_01JYV9K8R4T2M7Q5G3X6PNWCB",
    "projectId": "proj_01JYV8H42T5XQ9R6B3N7D1KMWC",
    "sourceId": "src_01JYV8P8C6W4Z2N9Q5T7M3HRGK",
    "processingJobId": "job_01JYV94G6T2P8M5R9K3X7QNWCB",
    "state": "completed",
    "summary": "A discussion about validating product strategy through customer evidence.",
    "mainTopic": "Evidence-led product strategy",
    "resultStatus": "recommendations_found",
    "recommendationCount": 2,
    "completedAt": "2026-06-27T17:16:00.000Z"
  },
  "meta": {
    "requestId": "req_01JYV9N4T7M2Q8R5G3K6XPNWCB"
  }
}
```

```http
GET /api/v1/analyses/ana_01JYV9K8R4T2M7Q5G3X6PNWCB/recommendations?limit=20 HTTP/1.1
```

```json
{
  "data": [
    {
      "id": "rec_01JYV9Q2M6T8R3G5K7X4PNWCB",
      "analysisId": "ana_01JYV9K8R4T2M7Q5G3X6PNWCB",
      "rank": 1,
      "startMs": 615000,
      "endMs": 671000,
      "title": "Evidence before roadmap",
      "hook": "Your roadmap is not a strategy until customers validate it.",
      "platforms": ["tiktok", "instagram_reels", "youtube_shorts"],
      "rationale": "The segment presents a complete, actionable contrast with a clear opening."
    },
    {
      "id": "rec_01JYV9R7Q3M8T2G5K6X4PNWCB",
      "analysisId": "ana_01JYV9K8R4T2M7Q5G3X6PNWCB",
      "rank": 2,
      "startMs": 1290000,
      "endMs": 1348000,
      "title": "The cost of weak assumptions",
      "hook": "The most expensive product decisions begin as untested assumptions.",
      "platforms": ["instagram_reels", "youtube_shorts"],
      "rationale": "The idea is self-contained and supports a practical editorial takeaway."
    }
  ],
  "meta": {
    "requestId": "req_01JYV9S9T4M2Q7R5G8K3XPNWCB",
    "page": {
      "limit": 20,
      "nextCursor": null,
      "hasMore": false
    }
  }
}
```

### 14.8 Recibir un completed analysis con zero recommendations

```json
{
  "data": {
    "id": "ana_01JYVA0M6T2R8Q4G7K3X5PNWCB",
    "projectId": "proj_01JYV8H42T5XQ9R6B3N7D1KMWC",
    "sourceId": "src_01JYV8P8C6W4Z2N9Q5T7M3HRGK",
    "processingJobId": "job_01JYV9Y7Q3M8T2R5G6K4XPNWCB",
    "state": "completed",
    "summary": "The recording contains fragmented discussion without self-contained moments.",
    "mainTopic": "Internal planning discussion",
    "resultStatus": "no_recommendations",
    "recommendationCount": 0,
    "completedAt": "2026-06-27T17:30:00.000Z"
  },
  "meta": {
    "requestId": "req_01JYVA0Q8M4T2R7G5K3X6PNWCB"
  }
}
```

La colección asociada responde exitosamente con un array vacío:

```json
{
  "data": [],
  "meta": {
    "requestId": "req_01JYVA1S7M3T8Q2R5G4K6XPNWB",
    "page": {
      "limit": 20,
      "nextCursor": null,
      "hasMore": false
    }
  }
}
```

La ausencia válida de momentos no es `failed` y no autoriza fabricar
recomendaciones.

### 14.9 Recibir un safe validation error

```http
POST /api/v1/projects HTTP/1.1
Content-Type: application/json
Idempotency-Key: create-project:01JYVA4M2T8R5Q3G7K6X9PNWCB

{
  "title": "",
  "workspaceId": "ws_other"
}
```

```http
HTTP/1.1 400 Bad Request
Content-Type: application/json; charset=utf-8
```

```json
{
  "error": {
    "code": "PROJECT_INPUT_INVALID",
    "message": "Project input is invalid."
  }
}
```

### 14.10 Recibir un safe not-found response

La respuesta es idéntica si el ID no existe o pertenece a otro workspace:

```http
GET /api/v1/projects/proj_01JYVA7M3T8R2Q5G6K4X9PNWCB HTTP/1.1
```

```http
HTTP/1.1 404 Not Found
X-Request-Id: req_01JYVA7Q6M2T8R3G5K4X9PNWCB
Content-Type: application/json; charset=utf-8
```

```json
{
  "code": "RESOURCE_NOT_FOUND",
  "message": "The requested resource was not found.",
  "requestId": "req_01JYVA7Q6M2T8R3G5K4X9PNWCB"
}
```

No se revela tipo real, owner, workspace ni existencia del recurso.

### 14.11 Listar usage ledger entries con cursor pagination

```http
GET /api/v1/usage/ledger?limit=2&cursor=cur_eyJvY2N1cnJlZEF0IjoiLi4uIn0 HTTP/1.1
```

```http
HTTP/1.1 200 OK
X-Request-Id: req_01JYVAB3M6T2R8Q4G5K7X9PNWC
Content-Type: application/json; charset=utf-8
```

```json
{
  "data": [
    {
      "id": "ule_01JYVA9T4M7R2Q8G5K3X6PNWCB",
      "processingJobId": "job_01JYV94G6T2P8M5R9K3X7QNWCB",
      "entryType": "settlement",
      "quantity": 1,
      "unit": "analysis",
      "compensatesEntryId": null,
      "occurredAt": "2026-06-27T17:16:00.000Z"
    },
    {
      "id": "ule_01JYV94P8M3T7R2G5K6X9QNWCB",
      "processingJobId": "job_01JYV94G6T2P8M5R9K3X7QNWCB",
      "entryType": "reservation",
      "quantity": 1,
      "unit": "analysis",
      "compensatesEntryId": null,
      "occurredAt": "2026-06-27T17:10:00.000Z"
    }
  ],
  "meta": {
    "requestId": "req_01JYVAB3M6T2R8Q4G5K7X9PNWC",
    "page": {
      "limit": 2,
      "nextCursor": "cur_eyJvY2N1cnJlZEF0IjoiMjAyNi0wNi0yN1QxNzoxMDowMC4wMDBaIiwiaWQiOiJ1bGVfLi4uIn0",
      "hasMore": true
    }
  }
}
```

El cursor es opaco aunque el ejemplo parezca codificado. La unidad `analysis`
y las cantidades son ilustrativas y no definen el modelo comercial.

### 14.12 Archivar un project con un active job

El archive no cancela automáticamente un ProcessingJob:

```http
POST /api/v1/projects/proj_01JYVB8M3T7R2Q5G6K4X9PNWCB/archive HTTP/1.1
Content-Type: application/json

{}
```

```http
HTTP/1.1 409 Conflict
X-Request-Id: req_01JYVB8Q6M2T7R3G5K4X9PNWCB
Content-Type: application/json; charset=utf-8
```

```json
{
  "code": "PROJECT_HAS_ACTIVE_JOB",
  "message": "Cancel the active job and wait for it to finish before archiving the project.",
  "requestId": "req_01JYVB8Q6M2T7R3G5K4X9PNWCB",
  "details": {
    "processingJobId": "job_01JYVB7T4M8R2Q5G3K6X9PNWCB"
  }
}
```

El cliente debe solicitar la cancelación, consultar el job hasta observar un
estado terminal y solo entonces repetir el archive:

```http
POST /api/v1/processing-jobs/job_01JYVB7T4M8R2Q5G3K6X9PNWCB/cancel HTTP/1.1
Content-Type: application/json

{}
```

```http
GET /api/v1/processing-jobs/job_01JYVB7T4M8R2Q5G3K6X9PNWCB HTTP/1.1
```

Después de observar `state = cancelled`:

```http
POST /api/v1/projects/proj_01JYVB8M3T7R2Q5G6K4X9PNWCB/archive HTTP/1.1
Content-Type: application/json

{}
```

```http
HTTP/1.1 200 OK
X-Request-Id: req_01JYVBC2M6T8R3Q5G7K4X9PNWB
Content-Type: application/json; charset=utf-8
```

```json
{
  "data": {
    "id": "proj_01JYVB8M3T7R2Q5G6K4X9PNWCB",
    "title": "Episode ready to archive",
    "state": "archived",
    "activeSourceId": "src_01JYVB6Q8M4T2R7G5K3X9PNWCB",
    "createdAt": "2026-06-27T18:00:00.000Z",
    "updatedAt": "2026-06-27T18:12:00.000Z",
    "archivedAt": "2026-06-27T18:12:00.000Z"
  },
  "meta": {
    "requestId": "req_01JYVBC2M6T8R3Q5G7K4X9PNWB"
  }
}
```

Repetir el archive sin un job no terminal devuelve el mismo Project archivado
sin efectos adicionales.

## 15. Processing-status polling

El frontend consulta:

```text
GET /api/v1/processing-jobs/:processingJobId
```

Para el control de concurrencia, `queued`, `processing` y `awaiting_input` son
estados no terminales. Un Project puede tener como máximo un ProcessingJob de
análisis en cualquiera de esos estados. `completed`, `failed` y `cancelled` son
terminales y permiten solicitar un análisis posterior con otra clave.

Mientras `state` sea `queued` o `processing`, el servidor puede devolver
`Retry-After` con un número entero de segundos. El valor es una recomendación
configurable, no una garantía de finalización. El cliente deberá:

1. respetar `Retry-After` cuando esté presente;
2. aplicar backoff y jitter ante errores transitorios;
3. detener polling al perder la sesión o recibir un error permanente;
4. detener polling en `awaiting_input`, `completed`, `failed` o `cancelled`;
5. no iniciar otro análisis solo porque un polling request falló; y
6. no tratar `currentStage` como porcentaje de progreso.

Comportamiento por estado:

| State | Comportamiento del cliente |
| --- | --- |
| `queued` | Mostrar espera y continuar polling. |
| `processing` | Mostrar la etapa segura y continuar polling. |
| `awaiting_input` | Detener polling y presentar `actionRequired`. |
| `completed` | Detener polling y consultar `analysisId`. |
| `failed` | Detener polling y mostrar `error.code` y acción segura. |
| `cancelled` | Detener polling y confirmar cancelación. |

`awaiting_input` no consume un worker. Aportar otra entrada no muta el Source
del job: se crea una nueva Source, se cancela el job anterior y se espera su
estado terminal antes de iniciar otro ProcessingJob. El intervalo inicial,
backoff máximo y timeout de UX permanecen pendientes de medición.

## 16. Safe error codes

### HTTP error codes

| Code | HTTP | Uso seguro |
| --- | --- | --- |
| `VALIDATION_ERROR` | `400` | Uno o más campos no cumplen el contrato. |
| `INVALID_JSON` | `400` | El body no es JSON válido. |
| `INVALID_CURSOR` | `400` | Cursor inválido, incompatible o expirado. |
| `IDEMPOTENCY_KEY_REQUIRED` | `400` | Falta el header requerido. |
| `IDEMPOTENCY_CONFLICT` | `409` | La clave ya representa otra intención. |
| `AUTHENTICATION_REQUIRED` | `401` | Sesión ausente, inválida o expirada. |
| `FORBIDDEN` | `403` | Acción explícitamente prohibida sin revelar otros tenants. |
| `RESOURCE_NOT_FOUND` | `404` | Recurso ausente o fuera del workspace. |
| `INVALID_STATE` | `409` | El recurso no admite la transición solicitada. |
| `ANALYSIS_ALREADY_IN_PROGRESS` | `409` | El Project ya tiene un ProcessingJob de análisis no terminal. |
| `PROJECT_HAS_ACTIVE_JOB` | `409` | El job del Project debe alcanzar un estado terminal antes del archive. |
| `OWNERSHIP_ATTESTATION_REQUIRED` | `409` | Falta una attestation válida. |
| `SOURCE_NOT_ACCEPTED` | `409` | Source aún no aceptada. |
| `SOURCE_NOT_ACTIVE` | `409` | Source no es la activa del Project. |
| `JOB_NOT_CANCELLABLE` | `409` | Job terminal que no admite cancelación. |
| `USAGE_LIMIT_EXCEEDED` | `409` | No puede crearse una reserva de uso. |
| `CONTENT_TOO_LARGE` | `413` | Payload supera el límite permitido. |
| `UNSUPPORTED_MEDIA_TYPE` | `415` | Content type no admitido. |
| `UNSUPPORTED_SOURCE` | `422` | Tipo o referencia de Source no soportados. |
| `RATE_LIMIT_EXCEEDED` | `429` | Se excedió una política de rate limit. |
| `INTERNAL_ERROR` | `500` | Fallo inesperado sin detalles internos. |
| `SERVICE_UNAVAILABLE` | `503` | Capacidad esencial temporalmente no disponible. |
| `PERSISTENCE_NOT_CONFIGURED` | `503` | Persistencia ausente en un entorno que permite mantener health activo. |
| `PERSISTENCE_UNAVAILABLE` | `503` | PostgreSQL no está disponible temporalmente. |
| `UPLOAD_CONFIRMATION_INVALID` | `400` | Parámetros o body de confirmación inválidos. |
| `UPLOAD_INTENT_NOT_FOUND` | `404` | Intent ausente o fuera del Project y Workspace visibles. |
| `UPLOAD_NOT_COMPLETED` | `409` | El objeto privado todavía no existe. |
| `UPLOAD_METADATA_MISMATCH` | `409` | La metadata observada no coincide con la declaración. |
| `PROJECT_ARCHIVED` | `409` | El Project archivado no admite confirmación. |
| `STORAGE_NOT_CONFIGURED` | `503` | Object storage no está configurado. |
| `STORAGE_UNAVAILABLE` | `503` | Object storage no está disponible temporalmente. |

### Safe ProcessingJob codes

Un job `failed` puede incluir `error: { code, message }`. Un job
`awaiting_input` puede incluir los mismos códigos como `reasonCode` cuando sean
accionables.

| Code | Significado visible |
| --- | --- |
| `TRANSCRIPT_UNAVAILABLE` | No se obtuvo un transcript mediante un mecanismo permitido. |
| `TIMED_TRANSCRIPT_REQUIRED` | Se necesita otra entrada con tiempos confiables. |
| `ANALYSIS_FAILED` | No se produjo un resultado estructurado válido. |
| `PROCESSING_FAILED` | Fallo permanente seguro no clasificable con mayor detalle. |

Los nombres de provider, payloads, status externos, retries internos y razones
sensibles no atraviesan esta frontera. Errores transitorios todavía bajo retry
no deben mostrarse como un fallo terminal prematuro.

## 17. Rate-limit y usage headers

Cuando exista una política de rate limit, una respuesta puede incluir:

| Header | Significado |
| --- | --- |
| `RateLimit-Limit` | Máximo aplicable en la ventana actual. |
| `RateLimit-Remaining` | Requests restantes en esa ventana. |
| `RateLimit-Reset` | Segundos hasta que se restablezca la ventana. |
| `Retry-After` | Segundos mínimos antes de reintentar tras `429` o recomendación para polling. |

Una respuesta `429` usa `RATE_LIMIT_EXCEEDED` y debe incluir `Retry-After`
cuando el servidor pueda calcularlo. Los umbrales, ventanas y scopes
permanecen pendientes. Los headers pueden omitirse mientras no exista una
política activa.

Las operaciones relacionadas con uso pueden incluir headers informativos:

| Header | Significado |
| --- | --- |
| `ClipAI-Usage-Unit` | Unidad aplicada a las cantidades siguientes. |
| `ClipAI-Usage-Reserved` | Cantidad reservada por la operación. |
| `ClipAI-Usage-Remaining` | Disponibilidad estimada después de la operación. |

Estos valores ayudan a la UI, pero no reemplazan
`GET /api/v1/usage/summary` ni el ledger autoritativo. No son prueba de pago,
factura, precio ni saldo financiero. La unidad comercial, precisión y política
de costes parciales permanecen abiertas.

## 18. Consideraciones de seguridad

- **HTTPS obligatorio.** Credenciales, referencias y resultados no circularán
  en texto plano en producción.
- **Auth provider-neutral.** No se elige cookie, bearer token ni provider en
  este documento. Si se usan cookies deberán definirse protección CSRF,
  `Secure`, `HttpOnly` y `SameSite`; otro transporte requerirá su propia
  revisión.
- **Autorización server-side.** Todo acceso privado filtra por `workspaceId`.
  IDs opacos no reemplazan autorización.
- **No tenant selection.** `workspaceId` enviado por el cliente se rechaza y
  nunca altera el contexto autenticado.
- **Not-found uniforme.** Los recursos cross-workspace no producen señales de
  existencia ni respuestas diferentes.
- **Conflict details autorizados.** `ANALYSIS_ALREADY_IN_PROGRESS` y
  `PROJECT_HAS_ACTIVE_JOB` pueden incluir `processingJobId` únicamente después
  de comprobar que Project y job pertenecen al workspace autenticado.
- **CORS mínimo.** Solo se permitirán orígenes first-party aprobados cuando se
  defina el despliegue.
- **SSRF y fuentes no confiables.** URLs se validarán mediante protocolos,
  destinos y resolución segura; no habrá fetch arbitrario del backend.
- **Uploads controlados.** Si se autorizan, tendrán límites de tipo, tamaño,
  duración, almacenamiento y acceso temporal.
- **Datos externos no confiables.** Transcripts, metadata y outputs de IA se
  validan por schema, tamaño y coherencia antes de persistir estado final.
- **Prompt injection.** El contenido se trata como datos, no como instrucciones.
  Prompts y reglas del sistema permanecen server-side.
- **Secretos server-side.** API keys, tokens, passwords y credenciales no se
  aceptan en payloads de dominio ni se devuelven al browser.
- **Logs minimizados.** No se registran bodies completos, transcripts, prompts,
  tokens, signed URLs ni idempotency keys completas por defecto.
- **Errors redactados.** Ninguna respuesta incluye stack traces, SQL, paths
  internos o payloads de provider.
- **Caching restringido.** Responses privadas usan `Cache-Control: no-store`.
- **Health checks mínimos.** Las rutas públicas no revelan topología ni estado
  granular de dependencias.
- **Rate y payload limits.** Se definirán antes de exponer la API para limitar
  abuso, coste y agotamiento de recursos.

Las políticas de privacidad, retención, eliminación, región, incidentes y abuso
deben aprobarse antes del lanzamiento.

## 19. Implemented endpoints versus draft endpoints

Estado real del repositorio al publicar esta versión:

| Área | Estado |
| --- | --- |
| 14 domain endpoints restantes bajo `/api/v1` | `Draft / Not implemented` |
| `GET /api/v1/me` | `Implemented — internal User and Workspace projection` |
| `POST /api/v1/projects` | `Implemented — workspace-scoped and idempotent` |
| `GET /api/v1/projects` | `Implemented — workspace-scoped cursor pagination` |
| `POST /api/v1/projects/:projectId/upload-intents` | `Implemented — private temporary PUT target` |
| `POST /api/v1/projects/:projectId/upload-intents/:uploadHandle/confirm` | `Implemented — private HEAD metadata confirmation` |
| `GET /health/live` | `Planned Phase 0 / Not implemented` |
| `GET /health/ready` | `Planned Phase 0 / Not implemented` |
| JWT identity verification | `Implemented and locally verified` |
| Session lifecycle | `Not implemented` |
| Express application y routes | `Partially implemented` |
| PostgreSQL, Prisma schema y migrations | `Partially implemented — User, Workspace, Project, Source and UploadIntent` |
| ProcessingJob worker y queue integration | `Not implemented` |
| Usage reservations y ledger | `Not implemented` |

`client/` continúa sin aplicación. `server/` persiste `User`, `Workspace`,
`Project`, `Source` y `UploadIntent`; crea y lista Projects, emite targets
temporales y confirma metadata de objetos con aislamiento de workspace, pero no
inspecciona bytes, procesa videos ni cobra uso. Las 127 pruebas unitarias y las 61 pruebas
PostgreSQL pasan localmente. La ejecución remota del CI para esta ampliación
permanece pendiente hasta publicar los cambios.

## 20. Open API decisions

Las siguientes decisiones permanecen abiertas y no deben inferirse de los
ejemplos:

1. Lifecycle del Bearer access token con Supabase Auth, refresh, revocación,
   logout, recuperación y controles CORS/CSRF asociados.
2. Contrato de finalización de upload, duración, idiomas, expiración definitiva
   de handles y verificación real de MP4, MOV, MP3 y WAV. La intención inicial
   usa provisionalmente 250 MiB y diez minutos.
3. Texto legal, `statementVersion`, valores de `authorizationBasis`, revocación
   y evidencia necesaria para OwnershipAttestation.
4. Longitudes máximas, límites exactos de body y reglas de normalización de los
   campos públicos que aún no están implementados.
5. Retención y almacenamiento de idempotency keys y fingerprints.
6. Firma, expiración y compatibilidad futura de cursores.
7. Intervalo inicial de polling, backoff, jitter, timeout de UX y triggers para
   considerar SSE.
8. Rate-limit thresholds, ventanas, scopes y tratamiento de tráfico interno.
9. Unidad de uso, precisión, límites, expiración de reservas, costes parciales
   y política comercial.
10. Schema final del resultado, límites de recomendaciones, versionado de
    prompts y modelos, y política de nuevos valores de `platforms`.
11. Política de cancelación cuando un provider ya incurrió en coste y momento
    exacto en que una reserva puede liberarse de forma segura.
12. Política de retención, eliminación, privacidad, residencia y exposición de
    datos en soporte y observabilidad.
13. Objetivos de latencia, disponibilidad y capacidad que afecten timeouts,
    retries o readiness.
14. Momento y herramienta para generar y validar una futura especificación
    OpenAPI.

No están abiertas en este documento la base `/api/v1`, el aislamiento por
Workspace, la resolución server-side del tenant, el uso de cursor pagination,
los success/error envelopes, la inmutabilidad de Source por ProcessingJob, la
idempotencia del inicio de análisis, el polling inicial ni la validez de un
Analysis completado con cero recomendaciones. Tampoco están abiertas la regla
de un solo ProcessingJob de análisis no terminal por Project ni la obligación
de rechazar el archive mientras exista ese job. Para el primer MVP tampoco están
abiertas las direcciones de upload como `Source`, Supabase Auth, storage
compatible con S3 ni OpenAI detrás de adapters. La intención inicial y el signer
S3-compatible ya están implementados; el lifecycle de sesión, bucket real,
confirmación, procesamiento y OpenAI siguen `Not implemented`.
