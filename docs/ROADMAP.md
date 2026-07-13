# ClipAI SaaS — Roadmap

## Estado del documento

| Campo         | Valor                                                            |
| ------------- | ---------------------------------------------------------------- |
| Versión       | 0.3                                                              |
| Estado        | Aprobado como secuencia inicial; sujeto a los gates de cada fase |
| Fecha         | 2026-07-13                                                       |
| Product Owner | Sofía                                                            |

Este roadmap ordena el trabajo autorizado y futuro. Una fase no comienza por
haber sido descrita: requiere que sus criterios de entrada estén satisfechos y
una autorización explícita de la Product Owner. Los estados técnicos solo se
marcan como implementados después de existir código, pruebas y revisión.

## Fase 0 — Foundation

**Objetivo.** Acordar la hipótesis de producto, los límites del MVP, la
arquitectura, el modelo conceptual, la API inicial, el baseline de seguridad y
el toolchain antes de construir aplicaciones.

**Alcance y entregables.** Product Charter; Architecture Foundation; ADRs;
modelo de datos; contrato API inicial; Security Foundation; guía de desarrollo;
toolchain raíz; definición del primer flujo vertical; roadmap, Founder Book y
registro de cambios.

**Resultado estratégico para la empresa.** Una hipótesis clara y revisable de
cómo ClipAI, como primer software y producto insignia, demostrará capacidades
reales de software, automatización e IA sin sustituir la validación del problema.

**Exclusiones.** Integraciones, base de datos, despliegue, datos reales, billing
y cualquier afirmación de controles implementados.

**Criterios de entrada.** Visión inicial del producto y repositorio de trabajo
disponibles.

**Gate de salida.** Documentación fundacional, alcance, arquitectura, estándares
técnicos y decisiones iniciales revisados, con autorización explícita de la
Product Owner para iniciar construcción interna limitada.

El trabajo de evidencia utilizará [el plan de validación](VALIDATION_PLAN.md),
[la línea base manual](MANUAL_BASELINE.md),
[la rúbrica de calidad](QUALITY_RUBRIC.md),
[el registro de ejemplos](REPRESENTATIVE_EXAMPLES.md) y
[el índice de evidencias](VALIDATION_EVIDENCE.md). Estos instrumentos se
conservan para la validación externa posterior y no se consideran ejecutados ni
aceptados por cerrar documentalmente esta fase.

**Dependencias.** Aprobación documental del alcance, decisiones técnicas
iniciales, estándares de seguridad y autorización expresa de la Product Owner.

**Riesgos.** Confundir el cierre documental con validación comercial; presentar
decisiones como controles implementados; ampliar el alcance durante la alpha.

**Estado actual.** `Closed for Internal Alpha`. La Product Owner cerró
documentalmente la Fase 0 el 2026-07-13 para permitir construcción técnica
limitada. Las evidencias comerciales pendientes conservan su estado y pasan al
gate de External Product Validation.

## Fase 1 — Internal Alpha

**Objetivo.** Construir y verificar un flujo vertical mínimo:
`User → Workspace → Project → File Upload → ProcessingJob → Transcript →
Analysis → Generated Outputs`.

**Alcance y entregables.** Construcción incremental del flujo. La primera
entrega autorizada es la fundación técnica del backend; las entregas posteriores
podrán incorporar cuenta con Supabase Auth, workspace personal;
proyectos; upload privado MP4, MOV, MP3 y WAV; object storage compatible con S3;
jobs asíncronos; transcripción mediante OpenAI detrás de un adapter; análisis
mediante OpenAI detrás de un adapter; resultados estructurados validados;
historial; seguridad y pruebas del flujo.

**Resultado estratégico para la empresa.** Una versión demostrable de principio
a fin que pueda presentarse de forma segura y repetible con datos sintéticos,
propios o expresamente autorizados. No se usarán datos de usuarios como material
comercial sin consentimiento.

**Exclusiones.** Fuentes URL o redes sociales; scraping; edición o renderizado;
publicación; calendario; billing; planes; equipos avanzados; integraciones de
drive; grabación desde browser.

**Criterios de entrada.** Cierre documental de Fase 0, autorización explícita de
la Product Owner, criterios de aceptación técnicos por entrega y decisiones
operativas mínimas para desarrollar sin defaults inseguros.

**Criterios de salida.** Flujo desplegable con datos de prueba seguros; tests de
aislamiento, autorización, uploads, idempotencia y validación de outputs;
observabilidad mínima; límites configurados; revisión de seguridad; medición de
coste, latencia y calidad; ninguna capacidad declarada sin evidencia.

**Dependencias.** Hosting y región; proveedor S3 final; librería de jobs;
configuración de modelos; límites de archivo; retención provisional;
eliminación; rate limits; gestión de secretos.

**Riesgos.** Coste y latencia de archivos largos; formatos maliciosos;
aislamiento de tenant; fallos parciales; outputs inválidos; tratamiento de
contenido sensible.

**Estado actual.** `Authorized`. La construcción incremental de la Internal
Alpha está autorizada; esto no autoriza lanzamiento ni afirma validación.

## Fase 2 — Internal Testing and Demonstration

**Objetivo.** Probar internamente la aplicación y preparar una Demonstrable
Alpha estable, segura y repetible.

**Alcance y entregables.** Pruebas con contenido propio, sintético o
expresamente autorizado; medición de funcionamiento, errores, calidad, tiempo
de procesamiento, coste, utilidad práctica y seguridad básica; corrección de
fallos; preparación de una demo sin datos privados ni operaciones manuales
ocultas.

**Resultado estratégico para la empresa.** Una versión interna demostrable y
mediciones técnicas que permitan decidir si está lista para exposición externa.
Este resultado no constituye evidencia de demanda o intención de pago.

**Exclusiones.** Usuarios externos, entrevistas, prospección, presentación
pública, escala pública, fuentes externas amplias y monetización.

**Criterios de entrada.** Flujo interno suficiente para pruebas, material seguro
y autorizado, rúbrica y protocolo de medición revisados.

**Criterios de salida.** Demonstrable Alpha estable, repetible, sin exposición
de datos privados ni dependencias manuales ocultas, con mediciones internas
documentadas y revisión explícita de la Product Owner.

**Dependencias.** Internal Alpha funcional, entorno controlado, ejemplos
seguros, observabilidad y presupuesto de providers.

**Riesgos.** Confundir resultados internos con validación de mercado, usar datos
sin autorización, ocultar operaciones manuales o exponer información privada.

**Estado actual.** `Planned / Not authorized`.

## Fase 3 — External Product Validation

**Objetivo.** Determinar con usuarios externos si el producto reduce trabajo
real, produce resultados accionables y ofrece valor suficiente para repetición
e intención de pago.

**Alcance y entregables.** Ejecución del plan de validación; comparación externa
de segmentos; pruebas con usuarios; entrevistas; contacto con lugares, aliados
y posibles clientes; prospección controlada; selección definitiva del ICP;
comparación contra línea base y decisión de continuar, ajustar o detener.

**Resultado estratégico para la empresa.** Evidencia comercial trazable sobre
problema, segmento, uso, utilidad e intención de pago, sin confundir una demo
técnica con product-market fit.

**Exclusiones.** Presentación pública masiva, escala abierta, automatización de
publicación y monetización completa.

**Criterios de entrada.** Demonstrable Alpha aprobada, política de datos para el
piloto, participantes autorizados y plan de medición listo para ejecución.

**Criterios de salida.** Evidencia revisada frente a los criterios de
`PRODUCT.md`, segmento inicial seleccionado y decisión explícita sobre el
producto.

**Dependencias.** Reclutamiento, soporte, analytics respetuoso de la privacidad
y presupuesto de providers.

**Riesgos.** Muestra sesgada, métricas ambiguas, uso de datos sin autorización y
confundir interés inicial con retención o disposición de pago.

**Estado actual.** `Deferred until Demonstrable Alpha`.

## Fase 4 — External Sources

**Objetivo.** Evaluar y añadir fuentes externas autorizadas solo cuando exista
evidencia de necesidad y un mecanismo legal y técnicamente seguro.

**Alcance y entregables.** ADR por tipo de fuente; contratos de adapters;
controles SSRF; autorización y lifecycle; pruebas de disponibilidad y fallos.

**Resultado estratégico para la empresa.** Ampliar el producto únicamente cuando
la demanda validada fortalezca su valor y produzca aprendizaje reutilizable, no
para convertir el roadmap en un catálogo general de servicios.

**Exclusiones.** Scraping no autorizado y soporte universal de URLs.

**Criterios de entrada.** Validación del MVP, demanda demostrada, revisión legal
y de seguridad, provider o protocolo permitido.

**Criterios de salida.** Al menos una fuente externa aprobada, implementada,
verificada y operable sin degradar el flujo de upload.

**Dependencias.** APIs oficiales, permisos, threat model, rate limits y soporte.

**Riesgos.** SSRF, cambios de terceros, revocación, copyright, tokens y coste.

**Estado actual.** `Deferred`.

## Fase 5 — Content Automation

**Objetivo.** Evaluar automatizaciones posteriores a la recomendación editorial.

**Alcance y entregables.** Solo capacidades validadas mediante investigación y
ADRs, como exportaciones o asistencia de producción.

**Resultado estratégico para la empresa.** Demostrar evolución responsable de
un producto propio, manteniendo una identidad comercial independiente y evitando
automatizaciones a medida sin evidencia común.

**Exclusiones.** Automatización sin revisión humana, garantías de viralidad y
expansión simultánea a edición, renderizado y publicación.

**Criterios de entrada.** Valor probado de las recomendaciones, demanda medida,
riesgos y costes evaluados.

**Criterios de salida.** Automatización limitada con calidad, permisos,
reversibilidad y métricas verificadas.

**Dependencias.** Resultados de Fases 3 y 4, UX, storage y providers.

**Riesgos.** Diluir la propuesta de valor, costes multimedia, pérdida de control
editorial y errores publicados.

**Estado actual.** `Future / Not authorized`.

## Fase 6 — Monetization

**Objetivo.** Introducir un modelo comercial respaldado por valor y economía
unitaria medidos.

**Alcance y entregables.** Oferta, unidades, límites, planes, billing provider,
webhooks, conciliación, impuestos y soporte, cada uno con decisión y controles.

**Resultado estratégico para la empresa.** Convertir valor demostrado en un
modelo comercial sostenible que fortalezca el activo tecnológico, sin mezclar
la monetización del producto con un plan general de servicios personalizados.

**Exclusiones.** Billing dentro del primer flujo vertical o dependencia del
proveedor de pagos para el ledger de uso.

**Criterios de entrada.** Intención de pago validada, costes conocidos,
privacidad y operación listas, ADRs comerciales y técnicos aprobados.

**Criterios de salida.** Cobro verificable, idempotente, auditable y soportable,
con métricas de conversión y margen.

**Dependencias.** Evidencia de Fase 3, modelo comercial, legal, contabilidad y
provider de billing.

**Riesgos.** Cobros duplicados, márgenes negativos, impuestos, refunds y fraude.

**Estado actual.** `Deferred`.

## Conclusión de autorización

La Fase 0 queda cerrada documentalmente y la Fase 1 — Internal Alpha queda
autorizada para construcción incremental. La investigación externa permanece
aplazada hasta una Demonstrable Alpha aprobada. Esta autorización no cambia los
estados de evidencia comercial ni autoriza lanzamiento, ampliación del MVP o
inicio de fases posteriores.
