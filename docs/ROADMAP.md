# ClipAI SaaS — Roadmap

## Estado del documento

| Campo         | Valor                                                            |
| ------------- | ---------------------------------------------------------------- |
| Versión       | 0.2                                                              |
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

**Exclusiones.** Código productivo, integraciones, base de datos, despliegue,
datos reales, billing y cualquier afirmación de controles implementados.

**Criterios de entrada.** Visión inicial del producto y repositorio de trabajo
disponibles.

**Gate de salida.** Deben cumplirse todos los criterios verificables de la
sección 19 de `PRODUCT.md`, registrarse las decisiones necesarias para el primer
flujo y aprobarse los criterios de seguridad previos a su implementación.

**Dependencias.** Evidencia comparativa de los segmentos candidatos, selección
de un segmento prioritario, línea base manual, rúbrica de calidad, pruebas
representativas autorizadas y evaluación preliminar de coste, latencia,
privacidad y lifecycle de datos.

**Riesgos.** Cerrar la fase solo por completar documentos; confundir decisiones
con controles implementados; diseñar antes de validar valor y coste.

**Estado actual.** `Exit gate not passed`. La fundadora aprobó el alcance y las
decisiones técnicas iniciales el 2026-07-13, pero faltan evidencias de producto
enumeradas en `PRODUCT.md`. La Fase 0 está preparada para completar su gate,
pero no está cerrada.

## Fase 1 — MVP Vertical Slice

**Objetivo.** Construir y verificar un flujo vertical mínimo:
`User → Workspace → Project → File Upload → ProcessingJob → Transcript →
Analysis → Generated Outputs`.

**Alcance y entregables.** Cuenta con Supabase Auth; workspace personal;
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

**Criterios de entrada.** Gate completo de Fase 0, autorización explícita de la
Product Owner, criterios de aceptación técnicos por entrega y decisiones
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

**Estado actual.** `Not authorized`. El alcance está aprobado, pero el gate de
Fase 0 todavía no se ha superado.

## Fase 2 — Product Validation

**Objetivo.** Determinar con personas del segmento priorizado si el flujo reduce
trabajo real y produce resultados accionables y confiables.

**Alcance y entregables.** Piloto controlado; instrumentación de métricas;
comparación contra línea base; revisión humana de timestamps y outputs;
feedback; coste por análisis; decisiones de continuar, ajustar o detener.

**Resultado estratégico para la empresa.** Evidencia de uso real, aprendizajes
comerciales, material autorizado para un posible caso de éxito, una demostración
repetible, evidencia sobre el segmento que obtiene más valor y señales sobre la
capacidad de ClipAI para atraer clientes o alianzas para la empresa.

**Exclusiones.** Escala pública, automatización de publicación, fuentes
externas amplias y monetización completa.

**Criterios de entrada.** Fase 1 verificada, política de datos para el piloto,
participantes autorizados, rúbrica y plan de medición aprobados.

**Criterios de salida.** Evidencia suficiente frente a los umbrales de
`PRODUCT.md`, aprendizaje documentado y decisión explícita sobre el producto.

**Dependencias.** Selección y reclutamiento del segmento prioritario, soporte,
analytics respetuoso de la privacidad y presupuesto de providers.

**Riesgos.** Muestra sesgada, métricas ambiguas, uso de datos sin autorización,
confundir novedad con retención.

**Estado actual.** `Planned / Not authorized`.

## Fase 3 — External Sources

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

## Fase 4 — Content Automation

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

**Dependencias.** Resultados de Fases 2 y 3, UX, storage y providers.

**Riesgos.** Diluir la propuesta de valor, costes multimedia, pérdida de control
editorial y errores publicados.

**Estado actual.** `Future / Not authorized`.

## Fase 5 — Monetization

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

**Dependencias.** Evidencia de Fase 2, modelo comercial, legal, contabilidad y
provider de billing.

**Riesgos.** Cobros duplicados, márgenes negativos, impuestos, refunds y fraude.

**Estado actual.** `Deferred`.

## Conclusión de autorización

La documentación define el primer MVP, pero **no cierra todavía la Fase 0 ni
autoriza iniciar la Fase 1**. La autorización se reconsiderará cuando todas las
evidencias pendientes de la checklist de salida estén registradas y aprobadas.
