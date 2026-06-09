# 🔒 Informe de Auditoría de Seguridad — Rifa Digital

**Fecha:** 2026-06-09
**Alcance:** Código del repositorio (HTML, CSS, JS), integración con Firebase (Firestore + Authentication) y despliegue en GitHub Pages.
**Rama con correcciones:** `security-audit-fixes`

---

## 1. Resumen general

El proyecto es un sitio estático (GitHub Pages) que usa Firebase Firestore como base de datos y Firebase Authentication para el acceso de admin y vendedores. La lógica de negocio (roles, estados de boletos, comisiones) vive **íntegramente en el cliente**, por lo que la única barrera real de seguridad son las **reglas de Firestore**.

Estado previo a la auditoría: **riesgo crítico**. Las reglas sugeridas en la documentación (`allow write: if request.auth != null`) tratan a cualquier usuario autenticado como confiable, y el registro de cuentas está abierto (el panel admin crea vendedores con `createUserWithEmailAndPassword` desde el navegador, lo que implica que el sign-up Email/Password está habilitado para cualquiera). Además existían múltiples puntos de **XSS almacenado** en los paneles admin y vendedor.

Tras las correcciones de esta rama, el modelo queda en mínimo privilegio (reglas por rol incluidas en `firestore.rules`, **pendientes de publicar en Firebase Console**) y todos los puntos de inyección HTML quedan sanitizados.

---

## 2. Vulnerabilidades encontradas

### V1 — Reglas de Firestore demasiado permisivas (autorización rota)
- **Archivo afectado:** configuración de Firestore (no existía `firestore.rules` en el repo; CLAUDE.md sugiere `allow write: if request.auth != null`).
- **Descripción:** Cualquier usuario autenticado puede escribir en **todas** las colecciones: `numeros`, `config`, `vendedores`, `ventas`. Un vendedor (o cualquier cuenta autocreada, ver V2) puede: marcar los 2000 números como vendidos, cambiar el precio del boleto, **subirse su propia comisión**, aprobar sus propias ventas, crear/desactivar vendedores o vaciar la base.
- **Riesgo:** 🔴 **Crítico**
- **Impacto:** Compromiso total de la integridad de datos y del negocio (fraude en comisiones, sabotaje del sorteo).
- **Recomendación:** Reglas por rol con mínimo privilegio (admin / vendedor activo / público) y validación de transiciones de estado en las reglas.
- **Prioridad:** Inmediata.
- **Corrección aplicada:** Nuevo archivo `firestore.rules` con modelo de roles (ver §3). **Debe publicarse en Firebase Console** y crearse el documento `admins/{UID_del_admin}`.

### V2 — Registro de cuentas abierto al público
- **Archivo afectado:** `js/auth.js` (`crearCuentaVendedor` usa `createUserWithEmailAndPassword` desde el cliente).
- **Descripción:** Para que el admin pueda crear vendedores desde el navegador, el proveedor Email/Password debe permitir sign-up. Eso significa que **cualquier persona** puede crearse una cuenta con la API key pública y volverse "usuario autenticado". Combinado con V1, esto convertía el sorteo en escribible por cualquiera con conocimientos básicos.
- **Riesgo:** 🔴 **Crítico** (en combinación con V1) / 🟡 Medio una vez aplicadas las reglas nuevas.
- **Impacto:** Escalada de "anónimo" a "autenticado" sin intervención del admin.
- **Recomendación:** Con las reglas nuevas una cuenta autocreada no tiene **ningún** privilegio (no existe en `vendedores` ni en `admins`), por lo que la funcionalidad se conserva de forma segura. Como refuerzo opcional: crear los vendedores y luego, en Firebase Console → Authentication → Settings, activar *"Bloquear creación de cuentas"* mientras no se necesiten altas.
- **Prioridad:** Alta (mitigada por `firestore.rules`).

### V3 — XSS almacenado en panel admin y panel vendedor
- **Archivos afectados:** `js/admin.js` (`renderizarPendientes`, `renderizarVendedores`, `mostrarResultado`, `mostrarConfigStatus`), `js/vendedor.js` (`renderizarMisBoletos`, error de `reservarNumero`), `js/grid.js` (mensaje de error en tiempo real).
- **Descripción:** Datos provenientes de Firestore se interpolaban con `innerHTML` sin escape. El vector más directo: un vendedor escribe como "nombre del comprador" un payload tipo `<img src=x onerror=...>`; cuando el admin abre la pestaña *Pendientes*, el script se ejecuta **en la sesión del admin** y puede realizar cualquier escritura en Firestore con sus privilegios. Con V1 activa, el payload podía inyectarse incluso sin ser vendedor.
- **Riesgo:** 🔴 **Crítico** (XSS almacenado con escalada a admin).
- **Impacto:** Robo de sesión administrativa, manipulación total de la rifa.
- **Recomendación:** Escapar todo dato dinámico antes de interpolarlo en HTML; usar `textContent` cuando no se necesita marcado.
- **Prioridad:** Inmediata.
- **Corrección aplicada:** Nuevo módulo `js/sanitizar.js` (`escapeHTML`) aplicado en todos los puntos de interpolación; el aviso de error de `grid.js` ahora se construye con `textContent`.

### V4 — Autorización solo del lado del cliente
- **Archivos afectados:** `js/admin.js`, `js/vendedor.js`.
- **Descripción:** La distinción admin/vendedor se decide en el navegador (si existe doc en `vendedores` se redirige a `vendedor.html`). Ocultar secciones con CSS/redirecciones no impide que un usuario malicioso invoque las operaciones directamente contra Firestore.
- **Riesgo:** 🟠 **Alto** (consecuencia de V1).
- **Impacto:** Bypass de la separación de roles.
- **Recomendación:** La autorización real debe vivir en las reglas de Firestore. La UI puede seguir usando redirecciones como conveniencia.
- **Prioridad:** Alta.
- **Corrección aplicada:** Cubierta por `firestore.rules` (la UI no cambió: la redirección sigue siendo solo UX).

### V5 — Datos personales de compradores legibles públicamente
- **Archivos afectados:** modelo de datos (`numeros/{id}.compradorNombre`), `js/grid.js`.
- **Descripción:** La grilla pública lee la colección `numeros` completa sin autenticación, y esos documentos incluyen `compradorNombre` y `vendedorId`. Cualquier visitante puede listar los nombres de los compradores desde la consola del navegador. Las reglas de Firestore son a nivel documento, no campo, así que no puede restringirse solo ese campo.
- **Riesgo:** 🟡 **Medio** (privacidad / datos personales).
- **Impacto:** Exposición de nombres de compradores a cualquier visitante.
- **Recomendación (no aplicada para no romper funcionalidad):** Dejar en `numeros` solo `{ id, estado }` y mover los datos del comprador a `ventas` (ya privada con las reglas nuevas). Requiere: que "Mis boletos" del vendedor lea desde `ventas`, que el toggle del admin sincronice `ventas`, y una migración de datos existentes. Se documenta como mejora prioritaria de seguimiento.
- **Prioridad:** Media.

### V6 — Ausencia de Content Security Policy
- **Archivos afectados:** `index.html`, `admin.html`, `vendedor.html`.
- **Descripción:** Sin CSP, cualquier XSS que se cuele puede cargar scripts externos y exfiltrar datos a cualquier dominio. GitHub Pages no permite cabeceras HTTP personalizadas, pero sí `<meta http-equiv>`.
- **Riesgo:** 🟡 **Medio** (defensa en profundidad).
- **Corrección aplicada:** Meta CSP en las tres páginas restringiendo scripts a `'self'` + `www.gstatic.com`, conexiones solo a los endpoints de Firebase, `object-src 'none'`, `base-uri 'self'`.
- **Prioridad:** Media.

### V7 — Mensajes de error insertados con `innerHTML`
- **Archivos afectados:** `js/grid.js`, `js/vendedor.js`.
- **Descripción:** `error.message` (texto controlado en parte por la respuesta del servidor / SDK) se insertaba como HTML.
- **Riesgo:** 🟢 **Bajo** (vector indirecto).
- **Corrección aplicada:** `textContent` en `grid.js` y escape en `vendedor.js`.

### V8 — Enlaces `target="_blank"` sin `rel="noopener"`
- **Archivos afectados:** `admin.html`, `vendedor.html`.
- **Descripción:** Riesgo clásico de *reverse tabnabbing* (mitigado por navegadores modernos, pero es buena práctica explícita).
- **Riesgo:** 🟢 **Bajo**.
- **Corrección aplicada:** `rel="noopener noreferrer"` añadido.

### V9 — Higiene del repositorio
- **Archivos afectados:** `.claude/settings.local.json` (versionado), `admin.html` (atributo `id` duplicado en el `<h2>` del modal de vendedor), ausencia de `.gitignore`.
- **Riesgo:** 🟢 **Bajo**.
- **Corrección aplicada:** `.gitignore` creado, `settings.local.json` retirado del índice, `id` duplicado eliminado.

### Nota informativa — API key de Firebase en el repositorio
La `apiKey` de `js/firebase.js` **no es un secreto**: identifica el proyecto y es pública por diseño en apps web de Firebase. La protección real son las reglas de Firestore (V1) y las restricciones de la key. Recomendado (configuración, no código):
1. Google Cloud Console → Credentials → restringir la API key por **referer HTTP** al dominio de GitHub Pages.
2. Firebase Console → Authentication → *Authorized domains*: dejar solo el dominio de GitHub Pages (y `localhost` durante el desarrollo).

---

## 3. Reglas de Firestore propuestas (`firestore.rules`)

Modelo de mínimo privilegio:

| Colección | Público | Vendedor activo | Admin |
|---|---|---|---|
| `config` | lectura | lectura | lectura + escritura |
| `numeros` | lectura | tomar solo números **disponibles**, asignándoselos a sí mismo, con el estado acorde a su modo de venta | todo |
| `ventas` | — | crear la propia, leer las propias | todo |
| `vendedores` | — | leer su perfil; actualizar **solo** `totalVendidos`/`totalGanancias` | todo |
| `admins` | — | leer su propio doc (no existe) | leer su propio doc; escritura solo desde Console |
| resto | denegado | denegado | denegado |

Validaciones clave en reglas (no solo en el cliente):
- Un vendedor no puede pisar un número ya tomado (`resource.data.estado == 'disponible'`).
- Un vendedor con `ventaDirecta != true` solo puede crear estados `pendiente_aprobacion`; con venta directa, solo `vendido`/`aprobada`.
- Un vendedor **no puede modificar su comisión, estado ni modo de venta** (el `diff().affectedKeys().hasOnly(...)` limita su update a los contadores).

---

## 4. Cambios realizados en la rama `security-audit-fixes`

| Archivo | Cambio |
|---|---|
| `firestore.rules` | **Nuevo.** Reglas de seguridad por rol (deben publicarse en Firebase Console). |
| `js/sanitizar.js` | **Nuevo.** Utilidad `escapeHTML()`. |
| `js/admin.js` | Escape de todos los datos dinámicos interpolados en HTML (pendientes, tabla de vendedores, resultado de búsqueda, mensajes de configuración). |
| `js/vendedor.js` | Escape en "Mis boletos" y en mensajes de error. |
| `js/grid.js` | Aviso de error construido con `textContent` en lugar de `innerHTML`. |
| `index.html` | Meta CSP. |
| `admin.html` | Meta CSP, `rel="noopener noreferrer"`, `id` duplicado eliminado. |
| `vendedor.html` | Meta CSP, `rel="noopener noreferrer"`. |
| `.gitignore` | **Nuevo.** Excluye configuración local. |
| `.claude/settings.local.json` | Retirado del control de versiones. |
| `SECURITY-AUDIT.md` | **Nuevo.** Este informe. |

No se eliminó ninguna funcionalidad. La creación de vendedores desde el panel se conserva (ver V2 para el refuerzo opcional).

---

## 5. Pasos de despliegue y verificación

### Despliegue (orden importante)
1. **Antes de publicar las reglas**, en Firebase Console → Firestore → crear la colección `admins` con un documento cuyo **ID sea el UID del administrador** (Authentication → Users → copiar UID). Contenido sugerido: `{ rol: "admin" }`.
2. Firebase Console → Firestore → *Rules* → pegar el contenido de `firestore.rules` → **Publicar**. (Alternativa con CLI: `firebase deploy --only firestore:rules`).
3. Hacer merge de la rama `security-audit-fixes` y verificar que GitHub Pages reconstruya el sitio.
4. Verificar en Firebase Console → Authentication → *Authorized domains* que figure el dominio `*.github.io` del proyecto.

### Pruebas funcionales
- **Pública:** abrir `index.html` sin login → la grilla carga, contadores correctos, tiempo real funciona (la consola del navegador no debe mostrar errores de CSP ni de permisos).
- **Admin:** login → marcar/desmarcar un número, cambiar precio/total, crear un vendedor, aprobar y rechazar una venta pendiente. Todo debe funcionar igual que antes.
- **Vendedor:** login → reservar un número disponible; verificar que un número tomado da error "ya no está disponible".

### Pruebas de seguridad (negativas — deben FALLAR)
Con la sesión de un **vendedor** abierta, en la consola del navegador:
```js
// 1. Intentar subirse la comisión → debe dar "Missing or insufficient permissions"
const { doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
const { db, auth } = await import('./js/firebase.js');
await updateDoc(doc(db, 'vendedores', auth.currentUser.uid), { comisionValor: 99 });

// 2. Intentar cambiar la config → debe fallar
await updateDoc(doc(db, 'config', 'sorteo'), { precio: 1 });

// 3. Intentar liberar un número vendido de otro vendedor → debe fallar
```
- **XSS:** como vendedor, reservar un número con comprador `<img src=x onerror=alert(1)>`; en el panel admin (pestaña Pendientes) debe verse el texto literal, sin ejecutar ningún script.
- **Anónimo:** sin login, intentar `setDoc` sobre `numeros/1` → debe fallar.

---

## 6. Recomendaciones para mantener la seguridad

1. **Tratar las reglas de Firestore como código:** mantener `firestore.rules` en el repo y desplegarlas con Firebase CLI; nunca editarlas solo en la consola.
2. **Resolver V5** (privacidad de compradores) en una iteración próxima: mover `compradorNombre` fuera de la colección pública `numeros`.
3. Restringir la API key por referer y mantener la lista de *Authorized domains* mínima.
4. Activar **App Check** (reCAPTCHA v3/Enterprise) para que solo el sitio legítimo pueda hablar con Firestore.
5. Mantener actualizada la versión del SDK de Firebase (hoy fijada en 10.12.2 vía CDN); revisar boletines de seguridad de Firebase.
6. Nunca interpolar datos en `innerHTML` sin pasar por `escapeHTML()`; preferir `textContent`.
7. Considerar mover operaciones sensibles (aprobación de ventas, recálculo de comisiones) a **Cloud Functions** si el proyecto crece, para sacar la lógica de negocio del cliente.
8. Revisar periódicamente Firebase Console → Authentication → Users en busca de cuentas no reconocidas (mientras el sign-up siga abierto).
