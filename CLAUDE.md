# 🎟️ Sorteo — Proyecto de Rifa Digital

## Descripción
Aplicación web de rifa digital que permite mostrar públicamente una grilla de 2000 números,
indicando cuáles están disponibles y cuáles han sido vendidos. Incluye un panel administrativo
privado (protegido por autenticación) para que el administrador marque números como vendidos
en tiempo real. El sitio se desplegará en GitHub Pages.

---

## Stack Tecnológico
- **Frontend:** HTML + CSS + JavaScript puro (vanilla — sin frameworks)
- **Base de datos:** Firebase Firestore (o Realtime Database)
- **Autenticación:** Firebase Authentication (solo administrador)
- **Hosting:** GitHub Pages (sitio estático)
- **Control de versiones:** Git / GitHub

---

## Estructura de Archivos del Proyecto
```
sorteo/
├── index.html          # Página pública — grilla de números
├── admin.html          # Panel administrativo (protegido)
├── css/
│   ├── main.css        # Estilos globales y variables
│   ├── grid.css        # Estilos de la grilla de números
│   └── admin.css       # Estilos del dashboard admin
├── js/
│   ├── firebase.js     # Configuración e inicialización de Firebase
│   ├── grid.js         # Lógica de la grilla pública
│   ├── admin.js        # Lógica del panel administrativo
│   └── auth.js         # Manejo de autenticación
├── assets/
│   └── (imágenes, íconos, etc.)
└── CLAUDE.md           # Este archivo
```

---

## Etapas del Proyecto

### ✅ Etapa 1 — Configuración de Firebase
- Crear proyecto en Firebase Console
- Configurar Firestore para almacenar el estado de los números (1–2000)
- Habilitar Firebase Authentication (Email/Password para el admin)
- Obtener las credenciales del SDK y configurar `js/firebase.js`
- Estructura de datos en Firestore:
  ```
  colección: numeros
  documento por número: { id: 1, estado: "disponible" | "vendido" }
  ```

### 🔲 Etapa 2 — Front-end Público (Grilla de Números)
- Página `index.html` con grilla responsive de 2000 números
- Números disponibles: color activo/llamativo, clickeables
- Números vendidos: color neutro/deshabilitado, no interactivos
- Escucha en tiempo real de cambios en Firestore (onSnapshot)
- Sin autenticación requerida para el usuario

### 🔲 Etapa 3 — Dashboard Administrativo
- Página `admin.html` protegida por Firebase Auth
- Login con email y contraseña
- Interfaz para buscar y marcar números como vendidos
- Actualización en tiempo real de Firestore
- Logout funcional
- Redirección automática si no hay sesión activa

### 🔲 Etapa 4 — Publicación en GitHub Pages
- Asegurar que todo el sitio funcione como estático
- Configurar el repositorio en GitHub
- Habilitar GitHub Pages desde la rama `main` o `gh-pages`
- Verificar que Firebase funcione correctamente desde el dominio de GitHub Pages
- Agregar el dominio de GitHub Pages a los dominios autorizados en Firebase Console

---

## Reglas de Código

- **Vanilla JS únicamente** — sin jQuery, sin frameworks, sin npm
- Usar `async/await` para todas las llamadas a Firebase
- CSS con variables personalizadas (`--color-*`, `--font-*`, `--space-*`)
- Archivos JS separados por responsabilidad (firebase, grid, auth, admin)
- No hardcodear credenciales de Firebase — usar variables de configuración en `js/firebase.js`
- Comentar secciones clave del código en español

---

## Guía de Diseño (frontend-design skill)

### Dirección Estética
- **Tono:** Festivo pero elegante — sensación de evento especial, no de sorteo barato
- **Tema:** Oscuro con acentos dorados/ámbar — transmite exclusividad y emoción
- **Diferenciador:** La grilla de 2000 números debe sentirse como un tablero de premios,
  no una simple lista

### Tipografía
- Display/títulos: fuente con carácter (ej. serif dramático o display geométrico)
- Cuerpo/UI: fuente legible y refinada
- **Nunca usar:** Arial, Roboto, Inter, system-ui

### Colores (variables CSS base sugeridas)
```css
:root {
  --bg-primary: #0a0a0f;
  --bg-secondary: #12121a;
  --accent-gold: #c9a84c;
  --accent-glow: #e8c96a;
  --numero-disponible: #1a3a2a;
  --numero-vendido: #1a1a1a;
  --text-primary: #f0ead6;
  --text-muted: #666;
  --border: rgba(201, 168, 76, 0.2);
}
```

### Animaciones (CSS puro)
- Entrada escalonada de números al cargar la página
- Hover suave en números disponibles
- Transición visual cuando un número cambia a vendido (tiempo real)
- Sin librerías externas de animación

### Grilla de Números
- Layout: CSS Grid, responsive (más columnas en desktop, menos en móvil)
- Número disponible: fondo oscuro-verde, borde dorado, texto brillante
- Número vendido: fondo muy oscuro, sin borde, texto apagado con tachado sutil
- Tamaño de celda uniforme, fuente monoespaciada para los números

---

## Firebase — Notas Importantes
- Las credenciales del SDK van en `js/firebase.js` (no en HTML directamente)
- Las reglas de Firestore deben permitir **lectura pública** y **escritura solo autenticada**
- Ejemplo de reglas de seguridad:
  ```
  rules_version = '2';
  service cloud.firestore {
    match /databases/{database}/documents {
      match /numeros/{numero} {
        allow read: if true;
        allow write: if request.auth != null;
      }
    }
  }
  ```
- El administrador es **un único usuario** creado manualmente en Firebase Console

---

## Estado Actual del Proyecto
- [ ] Etapa 1 — Firebase configurado
- [ ] Etapa 2 — Grilla pública funcionando
- [ ] Etapa 3 — Dashboard admin funcionando
- [ ] Etapa 4 — Publicado en GitHub Pages
