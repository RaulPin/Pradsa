# Homepty

Aplicación web de entrevistas 1 a 1 que utiliza WebRTC para establecer una videollamada directamente entre los navegadores y un servidor Node.js para la señalización.

## Características

- Salas privadas basadas en un identificador compartido.
- Intercambio de video y audio mediante WebRTC sin dependencias externas.
- Controles de muteo, pausa de video, compartir pantalla y notas locales.
- Indicador de calidad de llamada y temporizador de sesión.
- Servidor de señalización implementado con Node.js puro (sin dependencias externas), compatible con entornos con conectividad restringida.

## Requisitos previos

- Node.js 18 o superior.

## Ejecución

```bash
npm start
```

El servidor se inicia en `http://localhost:3000`. Abre la URL en dos pestañas o dispositivos distintos, introduce el mismo ID de sala y concede permisos de cámara/micrófono para comenzar la entrevista.

> **Nota:** Para entrevistas a través de internet es recomendable desplegar el servidor detrás de HTTPS y configurar un servidor TURN adicional para conexiones en redes restrictivas.

## Estructura del proyecto

```
├── package.json
├── public
│   ├── app.js
│   ├── index.html
│   └── styles.css
└── server.js
```

## Próximos pasos sugeridos

- Persistir notas o resultados de la entrevista en una base de datos segura.
- Añadir autenticación y agenda de entrevistas con enlaces únicos.
- Integrar servicios de transcripción o grabación bajo consentimiento expreso.
