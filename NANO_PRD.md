# Nano PRD — Simulador Personal de Rutas

**Estado:** concepto validado y prototipo interactivo inicial  
**Prototipo actual:** https://simulador-rutas.fvalenzuelabeck.chatgpt.site

## Propósito

Construir un simulador personal que permita practicar rutas urbanas antes de conducirlas en la ciudad real. La práctica busca fortalecer la memoria y orientación espacial, aumentar la familiaridad con las calles y llegar al recorrido real con experiencia previa.

La analogía principal es un simulador de vuelo: permite ensayar un escenario concreto todas las veces necesarias antes de enfrentarlo físicamente.

## Escenario principal

1. Elijo un origen y un destino que realmente necesito recorrer.
2. Estudio brevemente el trayecto, las calles principales y algunos hitos reconocibles.
3. Entro a una recreación 3D de esa zona y conduzco apoyándome en lo que recuerdo.
4. Las ayudas permanecen ocultas al comenzar y puedo revelarlas progresivamente.
5. Si tomo una calle equivocada, la simulación continúa: puedo volver, reconectarme más adelante o construir una ruta alternativa.
6. Al terminar, reviso los puntos donde dudé y repito la práctica cuando sea necesario.

## Experiencia que se quiere entrenar

- **Orientación:** comprender en qué dirección me desplazo y cómo se relacionan los distintos sectores.
- **Secuencia:** recordar calles, giros e intersecciones utilizando un mapa mental propio.
- **Referencias:** reconocer edificios, plazas, pendientes, puentes y otros hitos útiles.
- **Recuperación:** detectar un desvío y decidir cómo retomar el recorrido o llegar por otra vía.
- **Flexibilidad:** invertir la ruta, comenzar desde otro punto y descubrir alternativas cercanas.

## Comportamiento del simulador

- La conducción debe sentirse fluida, accesible y suficientemente entretenida para repetir una ruta varias veces.
- La fidelidad principal es espacial: trazado de calles, intersecciones, nombres, pendientes y referencias reconocibles.
- El usuario puede conducir libremente dentro de la zona cargada.
- Equivocarse forma parte natural de la sesión y no provoca un reinicio automático.
- Las ayudas se presentan por niveles: orientación general, distancia, próximo hito y ruta de referencia.
- Al llegar se muestran resultados simples, como ayudas utilizadas, desvíos recuperados y puntos donde hubo dudas.

## Primera versión útil

La primera versión carga una ruta real o un sector pequeño de una ciudad, usando información geográfica de OpenStreetMap. Three.js presenta el entorno 3D y una física liviana controla el vehículo.

Debe incluir:

- selección de un origen y un destino;
- calles reales con sus nombres;
- edificios simples y algunos hitos reconocibles;
- vehículo conducible con teclado y controles táctiles;
- destino comprobable;
- ayudas progresivas;
- continuidad ante desvíos;
- resumen al finalizar la práctica.

## Resultado esperado

Después de una o varias sesiones, puedo explicar el recorrido, reconocer sus puntos decisivos y realizar el viaje real con menor dependencia de instrucciones externas. Una sesión también es valiosa cuando contiene errores y rutas alternativas, siempre que logre conservar o recuperar la orientación y comprender cómo se conecta el espacio recorrido.

## Siguiente hito

Reemplazar el barrio demostrativo del prototipo por una zona real y pequeña, generada desde OpenStreetMap, manteniendo la conducción, las ayudas graduales y la recuperación activa de desvíos.
