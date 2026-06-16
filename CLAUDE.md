# 🎟️ Sorteo — Rifa Digital

## Instrucciones para Claude

Eres el asistente de desarrollo de este proyecto. Sigue estas reglas en **cada sesión**:

### Al INICIAR una sesión
1. Ejecuta `git log --oneline -20` para ver los últimos 20 commits
2. Ejecuta `git show HEAD --stat` para ver archivos del último cambio
3. Lee el archivo más reciente en `.claude/sessions/`
4. Cruza ambas fuentes: commits = qué se hizo / sesiones = qué quedó pendiente
5. Resume en máximo 5 líneas y pregunta: "¿Continuamos con lo pendiente o hay algo nuevo?"

### Comandos git para investigar
```bash
git log --oneline -20
git show HEAD --stat
git show <hash> --stat
git log --oneline --follow js/auth.js
git diff HEAD~1 HEAD
git log --grep="feat\|fix\|security"
git branch -a                              # ver todas las ramas activas
git log --oneline origin/feat/google-login-vendedores  # ver rama en progreso
```

### Durante la sesión
- Bug encontrado → `.claude/errors/bugs-conocidos.md`
- Decisión de arquitectura → anótala en la sesión activa
- **El sitio está en producción** — cualquier push a `main` es público e inmediato
- Cambios en `firestore.rules` → **siempre recordar publicar en Firebase Console**
- No interpolar datos en `innerHTML` sin pasar por `escapeHTML()` de `js/sanitizar.js`

### Al FINALIZAR una sesión
Cuando el usuario diga "fin de sesión", "guarda el resumen" o "hasta luego":

```
## Resumen — [fecha]
**Rama activa:** ...
**Objetivo de la sesión:** ...
**Lo que se hizo:** ...
**Decisiones tomadas:** ...
**Errores encontrados:** ...
**Pendiente para la próxima sesión:** ...
**Archivos modificados:** ...
**Commits relevantes:** ...
**Estado de Firebase Console:** (reglas publicadas sí/no)
```

---

## Convención de Commits

```
tipo(scope): Mensaje corto

Why:    Por qué se hizo
What:   Qué se implementó
Impact: Qué impacto tiene
```

| Tipo | Significa |
|------|-----------|
| `feat` | Nueva funcionalidad |
| `fix` | Corrección de bug |
| `security` | Cambio de seguridad |
| `refactor` | Cambio interno |
| `docs` | Documentación |
| `chore` | Mantenimiento |

---

## Stack Tecnológico

- **Frontend:** HTML + CSS + JavaScript vanilla — sin frameworks, sin npm
- **Base de datos:** Firebase Firestore
- **Autenticación:** Firebase Authentication (Google OAuth + Email/Password para admin)
- **Hosting:** GitHub Pages ✅ En producción
- **Repo:** GitHub

### Regla de oro del stack
> Vanilla JS únicamente. Sin jQuery, sin frameworks, sin npm.
> `async/await` para Firebase. CSS con variables `--color-*`, `--font-*`, `--space-*`.
> Comentarios en español. Nunca `innerHTML` sin `escapeHTML()`.

---

## Estructura de Archivos

```
sorteo/
├── index.html           # Grilla pública de 2000 números
├── admin.html           # Panel admin (protegido)
├── vendedor.html        # Panel vendedor (protegido)
├── pendiente.html       # Página de espera para usuarios sin rol
├── css/
│   ├── main.css         # Variables globales y estilos base
│   ├── grid.css         # Grilla de números
│   └── admin.css        # Dashboard admin (incluye estilos Google btn y tarjetas solicitud)
├── js/
│   ├── firebase.js      # Config e inicialización Firebase
│   ├── grid.js          # Grilla pública + tiempo real
│   ├── admin.js         # Panel admin: aprobación, vendedores, solicitudes
│   ├── vendedor.js      # Panel vendedor: reservar, ver boletos, enrutamiento por rol
│   ├── auth.js          # Autenticación: crear vendedores (Email/Password)
│   ├── login.js         # Google Login + enrutamiento por rol (NUEVO en rama actual)
│   └── sanitizar.js     # escapeHTML() — NUNCA omitir en innerHTML (NUEVO en security)
├── assets/
├── firestore.rules      # Reglas de seguridad — deben publicarse en Firebase Console
├── .gitignore
└── CLAUDE.md
```

---

## Modelo de Roles y Autenticación

### Regla principal
> Google autentica al usuario. Firestore decide su rol.
> El frontend solo mejora la UX. La seguridad real vive en `firestore.rules`.

### Flujo de autenticación con Google
```
Usuario entra con Google
  ↓
¿existe admins/{uid}?     → SÍ → admin.html
  ↓ NO
¿existe vendedores/{uid} activo? → SÍ → vendedor.html
  ↓ NO
Crear solicitudesAcceso/{uid} → pendiente.html
```

### Colecciones de roles
| Colección | Quién tiene acceso | Cómo se crea |
|-----------|-------------------|--------------|
| `admins/{uid}` | Admins | Manual desde Firebase Console — nunca desde el frontend |
| `vendedores/{uid}` | Vendedores activos | Admin aprueba desde panel |
| `solicitudesAcceso/{uid}` | Usuarios sin rol | Automático al primer login con Google |

### Creación de admins
**Nunca desde el frontend.** Solo manual en Firebase Console → Firestore → colección `admins` → documento con ID = UID del usuario. Contenido: `{ rol: "admin" }`. Esto elimina riesgo de escalada de privilegios.

---

## Modelo de Datos — Firestore

### `numeros/{id}`
```js
{ id: Number, estado: "disponible" | "reservado" | "pendiente_aprobacion" | "vendido" | "cancelado" }
// ⚠️ V5 pendiente: compradorNombre está aquí pero es público — mover a `ventas` en futura iteración
```

### `vendedores/{uid}`
```js
{
  nombre, telefono, email,
  estado: "activo" | "inactivo",
  comisionesActivas: Boolean,
  tipoComision: "fija" | "porcentaje",   // solo si comisionesActivas
  comisionValor: Number,                  // solo si comisionesActivas
  requiereAprobacion: Boolean,
  ventaDirecta: Boolean,                  // mutuamente excluyente con requiereAprobacion
  totalVendidos: Number,
  totalGanancias: Number,
  creadoEn: Timestamp
}
// REGLA: requiereAprobacion y ventaDirecta son mutuamente excluyentes — usar radio buttons, no checkboxes
```

### `solicitudesAcceso/{uid}`
```js
{ email, nombre, solicitadoEn: Timestamp, estado: "pendiente" | "rechazada" }
```

### `ventas/{id}`
```js
{ vendedorId, numeroId, compradorNombre, monto, estado, creadoEn, aprobadoPor? }
```

### `config/sorteo`
```js
{ precio: Number, total: Number, titulo: String }
```

---

## Reglas de Firestore (modelo de mínimo privilegio)

| Colección | Público | Vendedor activo | Admin |
|-----------|---------|-----------------|-------|
| `config` | lectura | lectura | lectura + escritura |
| `numeros` | lectura | tomar solo disponibles, estado según modo de venta | todo |
| `ventas` | — | crear propia, leer propias | todo |
| `vendedores` | — | leer su perfil; actualizar solo contadores | todo |
| `admins` | — | leer su propio doc | leer su propio doc |
| `solicitudesAcceso` | — | leer/crear su propio doc | todo |

**Validaciones clave en reglas (no solo en cliente):**
- Vendedor no puede pisar número ya tomado (`resource.data.estado == 'disponible'`)
- Vendedor con `ventaDirecta != true` solo puede crear `pendiente_aprobacion`
- Vendedor no puede modificar su comisión, estado ni modo de venta
- Un usuario solo puede leer su propia solicitud de acceso

**⚠️ Acción recurrente:** cada vez que se modifique `firestore.rules`, publicar en Firebase Console → Firestore → Reglas → Publicar (o `firebase deploy --only firestore:rules`).

---

## Estado del Proyecto

### Ramas activas
| Rama | Estado | Descripción |
|------|--------|-------------|
| `main` | ✅ En producción | Base estable en GitHub Pages |
| `security-audit-fixes` | ✅ Listo para merge | Correcciones de seguridad (ver SECURITY-AUDIT.md) |
| `feat/google-login-vendedores` | 🔴 En progreso | Google Login + aprobación de vendedores |

### Etapas generales
| Etapa | Descripción | Estado |
|-------|-------------|--------|
| 1 | Firebase configurado (Firestore + Auth) | ✅ Completo |
| 2 | Grilla pública de 2000 números con tiempo real | ✅ Completo |
| 3 | Dashboard admin con login y marcado de números | ✅ Completo |
| 4 | Publicado en GitHub Pages | ✅ En producción |
| 5 | Auditoría de seguridad | ✅ Auditado — rama lista para merge |
| 6 | Google Login + flujo de aprobación | 🔴 En progreso |
| 7 | Gestión de vendedores y boletos (comisiones, flujos) | 📌 Pendiente |

---

## 🔴 Pendiente Crítico — Rama `feat/google-login-vendedores`

### Bug resuelto en código, falta publicar la fix en Firebase Console
**Causa raíz:** `solicitudesAcceso/{uid}` solo permitía lectura a admins. Un usuario nuevo de Google intentaba leer su propio doc (para no duplicarlo) antes de crearlo — la lectura se rechazaba y la solicitud nunca se creaba. El usuario quedaba autenticado en Auth pero sin registro en Firestore.

**Fix aplicado en `firestore.rules`:**
```
match /solicitudesAcceso/{uid} {
  allow read: if isAdmin() || (isSignedIn() && request.auth.uid == uid);
  ...
}
```

**⚠️ ACCIÓN PENDIENTE:** Publicar las reglas en Firebase Console. El código del repo ya tiene el fix pero lo publicado es la versión vieja.

### Checklist de pruebas pendiente
- [ ] **Primero:** publicar reglas en Firebase Console
- [ ] Usuario nuevo Google → debe crear `solicitudesAcceso/{uid}` y redirigir a `pendiente.html`
- [ ] Panel admin → pestaña Solicitudes lista la solicitud nueva
- [ ] Aprobar como vendedor → crea `vendedores/{uid}`, borra `solicitudesAcceso/{uid}`
- [ ] Vendedor aprobado entra a `vendedor.html`
- [ ] Rechazar solicitud → queda `estado: "rechazada"`
- [ ] Copiar UID funciona
- [ ] Admin manual (crear `admins/{uid}` en Console) entra a `admin.html`
- [ ] Sin errores de CSP ni permisos en consola del navegador (F12)

### Pruebas negativas (deben FALLAR)
- [ ] Usuario pendiente leyendo solicitud de otro uid → denegado
- [ ] Usuario pendiente creando `vendedores/{suUid}` desde consola → denegado
- [ ] Usuario pendiente autoaprobándose → denegado

---

## 📌 Próxima Etapa — Gestión de Vendedores y Boletos

Módulos a implementar (en orden sugerido):

**1. Modelo de datos** — vendedores, permisos, comisión, estado de boleto, venta asociada
**2. Flujo de boletos** — disponible → reservado → pendiente_aprobacion → vendido / cancelado
**3. Panel admin** — pendientes por aprobación, aprobar/rechazar, configuración de vendedores
**4. Panel vendedor** — reservar boletos, ver sus boletos, ver ventas y ganancias

### Reglas de negocio importantes
- `requiereAprobacion` y `ventaDirecta` son **mutuamente excluyentes** — radio buttons en UI, nunca checkboxes
- Boleto reservado por un vendedor **no aparece disponible** para otros (concurrencia: cambiar estado inmediatamente)
- `totalVendidos` y `totalGanancias` se recalculan cuando cambia el estado de un boleto — no confiar en valores acumulados
- Vendedor sin comisiones: **ocultar y deshabilitar** toda sección de comisiones en su perfil
- Venta válida = boleto existe + asociado al vendedor + estado `vendido` + no cancelado

---

## Seguridad — Hallazgos del Audit

| ID | Riesgo | Estado |
|----|--------|--------|
| V1 | Reglas Firestore permisivas | ✅ Fix en rama `security-audit-fixes` |
| V2 | Registro de cuentas abierto | ✅ Mitigado por reglas nuevas |
| V3 | XSS almacenado en admin/vendedor | ✅ Fix con `escapeHTML()` |
| V4 | Autorización solo en cliente | ✅ Cubierto por reglas nuevas |
| V5 | `compradorNombre` público en `numeros` | 📌 Pendiente — mover a `ventas` |
| V6 | Sin Content Security Policy | ✅ Meta CSP en las 3 páginas |
| V7 | `error.message` en innerHTML | ✅ Fix con `textContent` |
| V8 | `target="_blank"` sin `rel="noopener"` | ✅ Corregido |
| V9 | Higiene del repo | ✅ `.gitignore` creado |

---

## Diseño

- **Tono:** Festivo pero elegante — tema oscuro con acentos dorados/ámbar
- **Tipografía:** Nunca Arial, Roboto, Inter, system-ui
- **Animaciones:** CSS puro — entrada escalonada, hover suave, transición al marcar vendido

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

---

## Configuración Firebase — Recordatorios

- **Dominios autorizados:** `reyes-1718.github.io` + `localhost` (para desarrollo)
- **API key:** pública por diseño en Firebase — restringir por referer HTTP al dominio de GitHub Pages en Google Cloud Console
- **App Check:** pendiente (consola lo sugiere) — reCAPTCHA v3/Enterprise
- **Admin único** creado manualmente — no existe endpoint de creación de admins en el frontend
