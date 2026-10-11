# Damas en GitHub Pages

1. Crea un proyecto en Firebase y añade una aplicación Web.
2. Crea una **Realtime Database** y copia la configuración Web en `firebase-config.js`.
3. Para una demostración sin inicio de sesión, usa estas reglas en Realtime Database:

```json
{"rules":{"checkers-rooms":{"$room":{".read":true,".write":true}}}}
```

4. Sube esta carpeta a GitHub. En **Settings → Pages**, selecciona *Deploy from a branch*, la rama publicada y `/ (root)`.
5. Abre la URL de Pages, escoge **Enlace para jugar** y comparte el enlace mostrado.

La configuración pública de Firebase identifica el proyecto, pero no es una clave secreta. Para producción se debe añadir Firebase Authentication y reglas que validen participantes y turnos.
