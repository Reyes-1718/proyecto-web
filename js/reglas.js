// Estados que NO permiten reducir el total de boletos
// porque representan boletos comprometidos.
const ESTADOS_BLOQUEANTES_REDUCCION = [
  'vendido',
  'reservado',
  'pendiente_aprobacion',
  'apartado'
];

/**
 * Valida si se puede reducir el total de boletos.
 *
 * @param {Object} params
 * @param {number} params.totalActual - Total actual de boletos.
 * @param {number} params.nuevoTotal - Nuevo total que el admin quiere guardar.
 * @param {Array} params.boletos - Lista de boletos existentes.
 *
 * @returns {Object}
 */
export function validarReduccionBoletos({ totalActual, nuevoTotal, boletos }) {
  const totalActualNum = Number(totalActual);
  const nuevoTotalNum = Number(nuevoTotal);

  if (!Number.isFinite(nuevoTotalNum) || nuevoTotalNum <= 0) {
    return {
      puedeReducir: false,
      mensaje: 'El nuevo total de boletos debe ser un número mayor a 0.',
      boletosFueraRango: []
    };
  }

  // Si está aumentando o dejando igual el total, no hay problema.
  if (nuevoTotalNum >= totalActualNum) {
    return {
      puedeReducir: true,
      mensaje: '',
      boletosFueraRango: []
    };
  }

  // Buscar boletos comprometidos que quedarían fuera del nuevo rango.
  const boletosFueraRango = boletos
    .map(boleto => ({
      ...boleto,
      numero: Number(boleto.numero)
    }))
    .filter(boleto =>
      boleto.numero > nuevoTotalNum &&
      ESTADOS_BLOQUEANTES_REDUCCION.includes(boleto.estado)
    )
    .sort((a, b) => a.numero - b.numero);

  if (boletosFueraRango.length === 0) {
    return {
      puedeReducir: true,
      mensaje: '',
      boletosFueraRango: []
    };
  }

  const vendidosFueraRango = boletosFueraRango.filter(
    boleto => boleto.estado === 'vendido'
  );

  const reservadosFueraRango = boletosFueraRango.filter(
    boleto => boleto.estado === 'reservado'
  );

  const pendientesFueraRango = boletosFueraRango.filter(
    boleto => boleto.estado === 'pendiente_aprobacion'
  );

  const apartadosFueraRango = boletosFueraRango.filter(
    boleto => boleto.estado === 'apartado'
  );

  let mensaje = `No puedes reducir el total de boletos a ${nuevoTotalNum}.\n\n`;
  mensaje += 'Existen boletos fuera del nuevo rango:\n\n';

  if (vendidosFueraRango.length > 0) {
    mensaje += `Vendidos: ${vendidosFueraRango.map(b => b.numero).join(', ')}\n`;
  }

  if (reservadosFueraRango.length > 0) {
    mensaje += `Reservados: ${reservadosFueraRango.map(b => b.numero).join(', ')}\n`;
  }

  if (pendientesFueraRango.length > 0) {
    mensaje += `Pendientes de aprobación: ${pendientesFueraRango.map(b => b.numero).join(', ')}\n`;
  }

  if (apartadosFueraRango.length > 0) {
    mensaje += `Apartados: ${apartadosFueraRango.map(b => b.numero).join(', ')}\n`;
  }

  mensaje += '\nDebes cancelar, liberar o resolver esos boletos antes de reducir el total.';

  return {
    puedeReducir: false,
    mensaje,
    boletosFueraRango,
    vendidosFueraRango,
    reservadosFueraRango,
    pendientesFueraRango,
    apartadosFueraRango
  };
}