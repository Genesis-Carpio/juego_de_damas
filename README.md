# ♛ Damas Clásicas (GitHub Pages + Firebase)

Juego web de damas clásicas con damas voladoras, captura obligatoria, modo contra la máquina (IA Minimax con poda Alfa-Beta) y modo multijugador online mediante enlace compartido sincronizado con Firebase Realtime Database.

---

## 📁 Estructura del Proyecto

```text
.
├── index.html              # Estructura principal y maquetación de la aplicación
├── css/
│   └── styles.css          # Estilos visuales del tablero, piezas y modales
├── js/
│   ├── firebase-config.js  # Credenciales de conexión a Firebase Realtime Database
│   ├── rules.js            # Motor puro de reglas: movimientos, capturas y coronación
│   ├── ai.js               # Inteligencia artificial (Minimax con poda Alfa-Beta)
│   └── game.js             # Controlador de interfaz, eventos y sincronización online
├── tests/
│   └── rules.test.js       # Pruebas unitarias automatizadas del motor de reglas e IA
├── package.json            # Configuración de scripts (npm test)
└── README.md               # Documentación del proyecto
```

---

## 🚀 Despliegue en GitHub Pages

1. Sube este repositorio a GitHub.
2. En tu repositorio, dirígete a **Settings → Pages**.
3. En **Build and deployment → Branch**:
   - Selecciona la rama principal (`main` o `master`).
   - Deja la carpeta en `/ (root)`.
   - Haz clic en **Save**.
4. En un par de minutos, GitHub Pages publicará tu juego en `https://<tu-usuario>.github.io/<tu-repositorio>/`.

---

## 🔥 Configuración de Firebase para Multijugador Online

Para que dos amigos puedan jugar en línea compartiendo un enlace:

1. Ingresa a la [Consola de Firebase](https://console.firebase.google.com/) y crea un proyecto (o usa uno existente).
2. Agrega una **Aplicación Web** (`</>`) y copia las credenciales en [`js/firebase-config.js`](file:///home/jaimeberrios/Proyectos/juego_de_damas/js/firebase-config.js).
3. En el menú lateral de Firebase, ve a **Build → Realtime Database** y haz clic en **Crear base de datos**.
4. En la pestaña **Reglas (Rules)**, define las reglas de acceso a las salas de juego:

```json
{
  "rules": {
    "checkers-rooms": {
      "$room": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

5. Haz clic en **Publicar (Publish)**.
6. ¡Listo! Al elegir **«Enlace para jugar (Online)»**, se generará una URL única con el parámetro `?room=...` que podrás copiar con el botón **Copiar enlace** y enviar a tu amigo.

---

## 🧪 Pruebas Unitarias

Para ejecutar la suite de pruebas del motor de reglas y la IA:

```bash
npm test
# o directamente:
node tests/rules.test.js
```
