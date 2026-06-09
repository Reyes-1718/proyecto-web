// Utilidades de sanitización para prevenir XSS.
// Todo dato dinámico (Firestore, inputs, mensajes de error) que se
// interpole en plantillas HTML debe pasar por escapeHTML().

export function escapeHTML(valor) {
  return String(valor ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
