# ClipAI — Founder Book

## Para qué existe ClipAI

ClipAI busca ahorrar el trabajo de revisar manualmente videos o audios largos
para decidir qué contenido vale la pena reutilizar. Su resultado inicial no será
un video editado: será una base de trabajo clara con transcripción, resumen e
ideas estructuradas que una persona pueda revisar y conservar.

Freelancers y agencias pequeñas que trabajan con podcasters, educadores,
coaches y marcas personales constituyen una **hipótesis inicial de ICP pendiente
de validación**, no un mercado confirmado. La investigación deberá compararla
con creadores independientes, marcas, negocios y equipos que reutilizan
contenido audiovisual antes de escoger un primer segmento prioritario.

## ClipAI dentro de la empresa

ClipAI será el primer software de la empresa, su primer activo tecnológico
propio y el producto insignia con el que podrá demostrar que sabe convertir un
problema concreto en software operable. Será un caso real de desarrollo,
automatización e inteligencia artificial, no una presentación conceptual.

Una versión segura y repetible podrá servir como demostración comercial ante
clientes potenciales. Si el producto obtiene resultados reales, también podrá
convertirse en un caso de éxito documentado. Esa función comercial no permite
exagerar sus capacidades ni presentar como validado lo que siga siendo una
hipótesis.

El desarrollo permitirá validar procesos internos, proveedores, estándares de
calidad, seguridad, operación y formas de medir costes. Los aprendizajes y las
prácticas útiles podrán apoyar futuros productos, pero ClipAI no debe convertirse
prematuramente en una plataforma genérica.

ClipAI necesita identidad, utilidad y valor comercial propios. La decisión es
construir una marca independiente de la imagen personal de la fundadora: Sofía
podrá dirigir y representar el proyecto, pero el producto y la empresa deben
poder explicar su valor por sí mismos.

La empresa podrá utilizar ClipAI internamente para apoyar la producción de su
propio contenido, siempre bajo las mismas reglas de calidad y seguridad. Ese uso
puede aportar aprendizaje, pero no sustituye la validación con el segmento que
finalmente se elija.

Construir un producto propio significa diseñar una solución repetible para un
problema compartido, mantener una dirección de producto y aprender de su uso.
Prestar servicios personalizados significa adaptar el trabajo a las necesidades
particulares de cada cliente. ClipAI puede facilitar conversaciones comerciales
o demostrar capacidades, pero su roadmap no se convertirá en una lista de
desarrollos a medida.

## Qué incluye el primer MVP

Una persona podrá crear una cuenta, entrar en su workspace personal, crear un
proyecto y subir un archivo MP4, MOV, MP3 o WAV que tenga derecho a procesar. El
sistema guardará el archivo de forma privada, procesará el trabajo en segundo
plano, obtendrá una transcripción y generará resultados mediante IA.

Los resultados iniciales podrán incluir transcripción, resumen, puntos clave,
títulos, hooks, llamados a la acción, hashtags e ideas de publicaciones. Antes
de guardarlos, el backend comprobará que tengan la estructura esperada. Los
modelos concretos podrán cambiar mediante configuración sin cambiar el dominio.

## Qué no incluye

El primer MVP no descargará contenido de YouTube, Instagram o TikTok, no hará
scraping, no importará desde Drive o Dropbox y no grabará desde el navegador.
Tampoco editará, cortará, renderizará ni publicará videos; no tendrá calendario,
billing, planes, suscripciones ni colaboración empresarial avanzada.

Estas exclusiones mantienen una pregunta central y medible: ¿el análisis ahorra
tiempo y ayuda a tomar mejores decisiones editoriales?

## Cómo funcionará el primer flujo

1. La persona crea su cuenta mediante autenticación administrada.
2. ClipAI la relaciona con un workspace personal privado.
3. La persona crea un proyecto y confirma que puede procesar el contenido.
4. Sube un archivo a almacenamiento privado mediante acceso temporal.
5. ClipAI valida formato y límites, y crea un trabajo asíncrono.
6. Un proveedor administrado genera una transcripción.
7. Un proveedor de IA genera resultados estructurados.
8. ClipAI valida, guarda y presenta los resultados dentro del mismo workspace.

Los fallos y reintentos deben ser controlados. Una operación repetida no debe
duplicar trabajos, consumo ni resultados.

## Por qué empezar por archivos subidos

Un upload directo reduce dependencias de plataformas externas y evita empezar
con scraping, permisos cambiantes o URLs no confiables. También permite medir
mejor el tamaño, duración, coste y calidad del material que procesa el MVP.

Esto no elimina los riesgos: los archivos pueden ser grandes, estar dañados o
ser maliciosos. Por eso serán privados, se validarán y tendrán límites. Las
fuentes externas solo se evaluarán después mediante decisiones independientes.

## Qué se construirá después

Primero se debe validar que el flujo vertical funciona. Después se probará con
personas de los segmentos candidatos si reduce al menos la mitad del tiempo de
revisión, si los resultados son utilizables y si existe intención de pago. Solo
con esa evidencia se evaluarán fuentes externas, automatización de contenido y
monetización.

## Hipótesis inicial de ICP pendiente de validación

La investigación comparará, como mínimo:

- creadores independientes;
- freelancers de contenido;
- agencias pequeñas;
- marcas y negocios que reutilizan contenido audiovisual; y
- equipos que producen contenido educativo o comercial.

El objetivo es escoger un primer segmento prioritario según frecuencia del
problema, coste del proceso actual, utilidad de los resultados, repetición de
uso y disposición de pago. El MVP no se ampliará para servir simultáneamente a
todos estos segmentos.

## Privacidad en demostraciones y casos de éxito

Ningún archivo, transcript, resultado, nombre o métrica de una persona usuaria
podrá usarse como material comercial sin autorización expresa. Las
demostraciones usarán exclusivamente datos sintéticos, propios o expresamente
autorizados.

Todo caso de éxito requerirá consentimiento y un acuerdo claro sobre qué
información puede publicarse. La función comercial de ClipAI no reduce las
obligaciones de privacidad, confidencialidad y seguridad del producto.

## Decisiones que requerirán aprobación futura

- Límites exactos de tamaño y duración de archivos.
- Hosting, región y proveedor final de almacenamiento compatible con S3.
- Modelos de transcripción y análisis, timeouts y presupuestos.
- Librería de jobs y configuración de reintentos.
- Retención, eliminación, backups y respuesta a incidentes.
- Rate limits, protección frente a malware y observabilidad.
- Fuentes externas, billing, planes y automatizaciones posteriores.

## Riesgos principales

Los riesgos técnicos más relevantes son el aislamiento entre clientes, archivos
maliciosos, exposición accidental de contenido, costes impredecibles, fallos en
trabajos largos y resultados de IA inválidos. Los riesgos comerciales son que
el problema no sea suficientemente frecuente, que el ahorro no compense el
precio o que las recomendaciones no sean accionables.

Las decisiones técnicas reducen riesgos, pero no prueban valor. Tampoco deben
confundirse requisitos de seguridad con controles ya implementados.

## Cómo sabremos si funciona

Se comparará el tiempo de revisión con una línea base manual; se medirá cuántos
análisis válidos producen resultados utilizables, la precisión de timestamps,
la tasa de finalización, la repetición de uso, la intención de pago y el coste
variable. Los objetivos iniciales están en `PRODUCT.md` y deberán ajustarse con
evidencia real.

## Estado de autorización

El alcance del primer MVP está definido, pero la Fase 0 aún necesita evidencia
de investigación, una línea base, una rúbrica y pruebas representativas. Por
eso la Fase 1 todavía no está autorizada para construcción.
