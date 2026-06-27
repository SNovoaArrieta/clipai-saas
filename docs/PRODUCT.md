# ClipAI SaaS — Product Charter

## 1. Estado y versión del documento

| Campo | Valor |
| --- | --- |
| Documento | 01 — Product Charter |
| Versión | 0.1 |
| Estado | Aprobado como hipótesis inicial |
| Fase | Fase 0 — Foundation |
| Product Owner | Sofía |
| Última actualización | 2026-06-26 |

Este documento propone la dirección inicial del producto y los límites de su
MVP. No autoriza el desarrollo del SaaS completo ni afirma que las capacidades
descritas estén implementadas. El nombre `ClipAI` es provisional.

## 2. Visión del producto

Convertir contenido autorizado de formato largo en una base estratégica clara
para producir contenido corto, de modo que profesionales y equipos pequeños
puedan encontrar oportunidades valiosas sin revisar manualmente horas de video.

ClipAI aspira a ser una herramienta confiable para decidir **qué momentos vale
la pena convertir en clips y por qué**, no un sustituto del criterio editorial
ni una promesa de rendimiento viral.

## 3. Misión

Reducir el tiempo y la incertidumbre necesarios para transformar videos largos
en planes accionables de contenido corto para audiencias hispanohablantes.

La misión inicial es entregar recomendaciones priorizadas, verificables y
útiles para que cada usuario pueda tomar mejores decisiones editoriales y
continuar el trabajo en sus herramientas habituales de edición.

## 4. ICP primario y secundario

### ICP primario

Freelancers y agencias pequeñas de contenido que gestionan videos de formato
largo para podcasters, coaches, educadores y marcas personales de habla
española.

Características esperadas:

- Trabajan con varios videos o clientes de manera recurrente.
- Seleccionan manualmente momentos para TikTok, Instagram Reels o YouTube
  Shorts.
- Necesitan justificar y comunicar sus elecciones a clientes o editores.
- Tienen equipos pequeños, tiempo limitado y procesos poco automatizados.
- Poseen el contenido procesado o cuentan con autorización para utilizarlo.

### ICP secundario

Podcasters y educadores independientes de habla española que producen contenido
largo y administran directamente su reutilización en formatos cortos.

Este grupo comparte el problema principal, pero suele tener menor volumen,
menos división de roles y un flujo de aprobación más simple que el ICP primario.

## 5. Jobs to be done

### Job principal

> Cuando recibo o termino un video largo autorizado, quiero identificar y
> priorizar rápidamente los momentos con mayor valor para contenido corto, para
> poder entregar un plan de clips útil sin revisar todo el material manualmente.

### Jobs funcionales

- Entender el tema principal y el contenido general del video.
- Encontrar momentos que puedan sostenerse como piezas cortas con suficiente
  contexto.
- Verificar cada recomendación contra un rango temporal real de la fuente.
- Comprender por qué se recomienda cada momento y para qué plataformas podría
  funcionar.
- Transferir una selección clara a un editor, cliente o flujo de producción.
- Consultar análisis anteriores y controlar el consumo disponible.

### Jobs emocionales y profesionales

- Sentir confianza al presentar recomendaciones a un cliente o colaborador.
- Reducir la fatiga y el riesgo de omitir buenos momentos.
- Mantener el control editorial en lugar de delegarlo por completo a la IA.

## 6. Problema central

Revisar videos largos para localizar momentos adecuados para contenido corto es
un proceso lento, repetitivo y difícil de escalar. No basta con encontrar frases
aisladas: cada recomendación debe conservar contexto, tener un inicio atractivo,
ofrecer valor a la audiencia y poder localizarse con precisión en el material
original.

Los equipos pequeños suelen resolver este trabajo mediante reproducción manual,
notas dispersas y criterio individual. Esto consume tiempo operativo, dificulta
la delegación y vuelve inconsistentes las entregas entre proyectos y clientes.

Una respuesta generada rápidamente pero difícil de comprobar no resuelve el
problema. El ahorro existe solo si el usuario puede revisar, entender y utilizar
las recomendaciones con menos esfuerzo que en su proceso actual.

## 7. Propuesta de valor

ClipAI transformará una fuente autorizada de video largo en un brief editorial
priorizado para contenido corto. El usuario recibirá un resumen del video y una
lista de momentos verificables con timestamps, títulos, hooks, plataformas
sugeridas y una explicación estratégica.

Para freelancers y agencias pequeñas, esto busca reducir el tiempo de revisión,
estandarizar la calidad del análisis y facilitar la entrega a clientes o
editores, manteniendo siempre la decisión final en manos humanas.

## 8. Promesa del producto

Para cada análisis completado correctamente, el producto buscará entregar:

- Un resumen del video y su tema principal.
- Recomendaciones de clips ordenadas por prioridad.
- Timestamps de inicio y fin derivados de segmentos reales de una transcripción
  temporizada.
- Un título y un hook sugeridos para cada recomendación.
- Sugerencias de plataformas relevantes.
- Una explicación estratégica específica sobre el valor de cada momento.

ClipAI entregará **recomendaciones editoriales**, no archivos de video editados.
Las recomendaciones no garantizan alcance, engagement, conversión ni viralidad.
El usuario conservará la responsabilidad y el control sobre la selección,
edición y publicación final.

## 9. Política de contenido autorizado

ClipAI se diseñará para procesar únicamente contenido que el usuario posea o
para el cual tenga autorización suficiente. Antes de enviar una fuente, el
usuario deberá confirmar que cumple esta condición.

Principios iniciales de producto:

- El usuario deberá enviar contenido propio o autorizado y respetar los derechos
  de terceros aplicables.
- El producto podrá rechazar fuentes no soportadas o casos en los que no pueda
  obtenerse el material necesario por medios permitidos.
- Una URL soportada se procesará solo mediante mecanismos de acceso definidos y
  aceptados para el producto.
- La estrategia principal de transcripción no dependerá de scraping no
  autorizado ni de buscar copias de transcripciones en sitios de terceros.
- Si una URL soportada no proporciona una transcripción utilizable, el flujo
  podrá solicitar un archivo de video, un archivo de audio o una transcripción
  temporizada proporcionada por el usuario.
- La adquisición, conservación y eliminación de archivos y transcripciones se
  limitarán a políticas que deberán definirse antes del lanzamiento.

Esta política expresa una condición de uso y un principio de diseño; no
constituye asesoría ni garantía legal. Los términos, controles y procedimientos
definitivos requerirán revisión separada antes de operar el servicio.

## 10. Alcance del MVP

Las siguientes son capacidades **planificadas para un MVP futuro**. No están
implementadas ni aprobadas para desarrollo por este documento:

1. **Cuenta y workspace personal:** registro, acceso y un espacio privado por
   usuario.
2. **Creación de proyectos:** organización de cada fuente y su análisis dentro
   de un proyecto.
3. **Envío de una fuente autorizada:** recepción de una URL soportada o de una
   entrada alternativa permitida.
4. **Estado de procesamiento asíncrono:** comunicación clara de estados como
   pendiente, procesando, completado y fallido.
5. **Obtención de transcripción:** adquisición por un mecanismo soportado o uso
   de una transcripción proporcionada por el usuario.
6. **Resumen y tema principal:** síntesis del contenido analizado.
7. **Recomendaciones priorizadas:** lista ordenada de momentos candidatos para
   contenido corto.
8. **Timestamps reales:** rangos de inicio y fin sustentados en segmentos
   temporizados; el modelo no deberá inventar ni estimar timestamps desde texto
   sin información temporal.
9. **Detalle estratégico por recomendación:** título, hook, plataformas
   sugeridas y explicación del criterio editorial.
10. **Historial de análisis:** consulta de proyectos y resultados anteriores del
    usuario.
11. **Seguimiento de uso o créditos:** registro comprensible del consumo asociado
    a los análisis.

El MVP se limitará a demostrar que el análisis y las recomendaciones ahorran
tiempo y son suficientemente confiables. Su alcance debe poder ser construido y
operado por un equipo fundador de dos personas.

## 11. Non-goals explícitos del MVP

El MVP no incluirá:

- Edición, corte o renderizado automático de video.
- Reencuadre visual automático para formatos verticales.
- Subtítulos animados incrustados en el video.
- Publicación o programación directa en redes sociales.
- Colaboración avanzada de equipos, portales de clientes o flujos complejos de
  aprobación.
- Una API pública para desarrolladores.
- Procesamiento de todas las redes o plataformas sociales.
- Garantías de viralidad o predicciones presentadas como certezas.
- Una estrategia de contenido completamente automatizada.
- Un editor de video de propósito general.

Estos límites evitan que la automatización posterior oculte la pregunta central:
si las recomendaciones por sí mismas son útiles, verificables y valiosas.

## 12. Recorrido principal del usuario

1. El usuario crea su cuenta y accede a su workspace personal.
2. Crea un proyecto para una pieza de contenido largo.
3. Envía una fuente soportada y confirma que es propietario del contenido o que
   tiene autorización para procesarlo.
4. Si la URL no ofrece una transcripción utilizable por un mecanismo soportado,
   el producto solicita un archivo de video, audio o una transcripción
   temporizada.
5. El proyecto muestra el estado del procesamiento asíncrono y comunica con
   claridad cualquier fallo o acción requerida.
6. Al finalizar, el usuario revisa el resumen, el tema principal y las
   recomendaciones priorizadas.
7. Comprueba cada recomendación mediante sus timestamps y evalúa el título, el
   hook, las plataformas sugeridas y la explicación estratégica.
8. Selecciona las recomendaciones útiles y continúa el trabajo en su flujo de
   edición o entrega habitual.
9. Puede consultar el análisis en su historial y revisar el uso o los créditos
   consumidos.

## 13. Supuestos de producto

Los siguientes puntos son **supuestos pendientes de validación**, no hechos
confirmados:

- El ICP primario revisa contenido largo con suficiente frecuencia para que el
  ahorro de tiempo sea valioso y pagable.
- Una recomendación estratégica puede aportar valor antes de automatizar la
  edición del video.
- Los usuarios confiarán más en el análisis cuando cada recomendación sea
  verificable mediante timestamps reales y una explicación concreta.
- Los freelancers y agencias pequeñas necesitan estandarizar sus entregas sin
  adoptar herramientas complejas de colaboración empresarial.
- Existe una combinación viable de fuentes autorizadas, archivos o
  transcripciones proporcionadas por el usuario para alimentar el MVP.
- Es posible alcanzar una calidad útil con costes y tiempos de procesamiento
  compatibles con un producto comercial operado por dos fundadores.
- TikTok, Instagram Reels y YouTube Shorts cubren las necesidades iniciales más
  relevantes del ICP.

## 14. Hipótesis de validación

| Hipótesis | Señal inicial de validación propuesta |
| --- | --- |
| El problema es frecuente y costoso para el ICP primario. | Las entrevistas confirman un flujo recurrente de revisión manual y un coste claro en tiempo o dinero. |
| Las recomendaciones reducen trabajo real. | Las pruebas comparativas muestran al menos 50 % menos tiempo de revisión frente al proceso manual. |
| El resultado es accionable. | Al menos 70 % de los análisis válidos produce una recomendación que el usuario considera utilizable. |
| Los timestamps generan confianza. | Al menos 95 % de las recomendaciones revisadas corresponde correctamente con el segmento temporizado indicado. |
| El flujo soportado es suficientemente confiable. | Al menos 90 % de las entradas válidas y soportadas completa el análisis. |
| El valor no termina en la primera prueba. | Al menos 60 % de los usuarios piloto analiza otro proyecto durante el periodo de validación. |
| Existe intención de pago. | Usuarios del ICP aceptan probar una oferta pagada o expresar un compromiso verificable ante una propuesta concreta. |

Estos umbrales son objetivos preliminares de aprendizaje. Deberán revisarse con
datos reales y no representan compromisos comerciales ni garantías de
rendimiento.

## 15. Métricas iniciales de éxito

### Valor para el usuario

- Reducción mediana del tiempo de revisión frente a una línea base manual:
  objetivo preliminar de al menos 50 %.
- Porcentaje de análisis válidos con al menos una recomendación marcada como
  utilizable: objetivo preliminar de al menos 70 %.
- Porcentaje de recomendaciones que coinciden correctamente con el segmento
  temporizado señalado: objetivo preliminar de al menos 95 % en una muestra
  revisada.

### Confiabilidad del flujo

- Tasa de análisis completados sobre entradas válidas y soportadas: objetivo
  preliminar de al menos 90 %.
- Distribución de fallos por fuente, transcripción, procesamiento y generación
  de resultados.
- Tiempo desde el envío válido hasta un resultado revisable; el objetivo se
  definirá después de medir fuentes y duraciones representativas.

### Adopción y negocio

- Porcentaje de usuarios piloto que analiza otro proyecto durante el periodo de
  validación: objetivo preliminar de al menos 60 %.
- Frecuencia de uso por usuario y proyectos analizados por cliente.
- Conversión a una oferta pagada, una vez que exista una propuesta de precio
  validable.
- Coste variable por hora de contenido y por análisis completado; el límite
  aceptable queda pendiente de validación técnica y comercial.

Las métricas deberán segmentarse por tipo de fuente, duración, tipo de cliente y
resultado del procesamiento para evitar conclusiones engañosas.

## 16. Criterios de salida de producto para la Fase 0

La dimensión de producto de la Fase 0 podrá considerarse completada cuando:

- Sofía haya revisado y aprobado este charter o una versión posterior.
- La investigación con el ICP primario aporte evidencia sobre la frecuencia,
  severidad y coste del problema.
- Se haya documentado el flujo actual del usuario y una línea base de tiempo de
  revisión manual.
- Exista una rúbrica de calidad para evaluar recomendaciones, contexto,
  utilidad y precisión de timestamps.
- Se hayan probado ejemplos representativos con contenido autorizado.
- Se haya definido una estrategia viable de transcripción que no dependa de
  scraping no autorizado y contemple entradas alternativas.
- Los límites del MVP, sus non-goals y el recorrido principal estén aprobados.
- Se hayan revisado de manera preliminar coste, latencia, privacidad, retención,
  eliminación y riesgos de acceso a las fuentes.
- Los umbrales de éxito y fracaso del MVP se hayan ajustado con evidencia.
- Las decisiones de arquitectura y estándares técnicos se hayan aprobado en sus
  documentos correspondientes.

Cumplir estos criterios permite decidir si se inicia la planificación del MVP;
no autoriza por sí mismo su implementación ni su lanzamiento.

## 17. Decisiones de producto abiertas

Las siguientes decisiones permanecen **sin resolver** y deberán documentarse
cuando exista evidencia suficiente:

- Nombre definitivo, identidad y posicionamiento comercial del producto.
- Primer tipo de fuente soportada y mecanismos permitidos para obtener su
  transcripción.
- Formatos, tamaños, duraciones y límites para archivos de video, audio y
  transcripciones proporcionadas por usuarios.
- Idiomas, países y variantes del español que se validarán primero.
- Número y duración esperada de las recomendaciones por análisis.
- Criterios exactos de priorización y forma de comunicar confianza o calidad sin
  presentar una garantía de viralidad.
- Formato mínimo de salida o entrega para el flujo de freelancers y agencias.
- Evidencia y controles necesarios para confirmar la autorización del contenido.
- Política de privacidad, retención, eliminación y uso de contenido para mejorar
  el sistema.
- Modelo de créditos, límites de uso, precio y tratamiento de análisis fallidos.
- Objetivos aceptables de latencia, coste variable y margen por análisis.
- Herramientas y métodos para recoger feedback sobre recomendaciones aceptadas,
  rechazadas o modificadas.
- Condiciones exactas que autorizarán el paso de Fase 0 a construcción del MVP.
