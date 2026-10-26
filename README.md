# sif-gestor-chats

Gestor de chats para el proyecto SIF (Sistema de Independencia Financiera). Muestra en un panel cuánto contexto le queda al chat en porcentaje, avisa al acercarse al límite y lanza el acta de traspaso para continuar en un chat nuevo.

## Qué hace

- **Panel «Chats SIF»**: «Quedan X %» de contexto, barra, tokens usados sobre el total y evolución por turno.
- **Semáforo**: verde por debajo del 70 %, ámbar desde el 70 % (cierra el bloque en curso) y rojo desde el 85 % (haz el acta de traspaso).
- **Banda sobre la caja de texto**, solo en ámbar o rojo.
- **Límites de la cuenta**: lo que queda de las ventanas de 5 h y 7 días.
- **Registro de chats**: nombre, pico de contexto y si se cerró o se traspasó.
- **Traspaso**: el botón «Preparar traspaso» pide el acta con la skill `sif-acta-traspaso`.

## Comandos

- `/chats` abre el panel.
- `/chat-nombre Hito 1 · Posiciones` le pone nombre al chat.
- `/chat-traspaso` pide el acta de traspaso.

## Instalación

En la caja de texto de una sesión:

```
/plugin install sif-gestor-chats --marketplace JMCSIF/sif-gestor-chats
```

Responde `y` para añadir el marketplace y elige el ámbito de usuario.

Desde una terminal:

```
claude plugin install sif-gestor-chats --marketplace JMCSIF/sif-gestor-chats
```

En la app de escritorio, donde `/plugin` no funciona: pulsa **+** junto a la caja de texto, luego **Plugins**, **Add marketplace** con `JMCSIF/sif-gestor-chats` y después **Add plugin**.
