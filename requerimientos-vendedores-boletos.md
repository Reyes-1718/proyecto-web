# Gestión de vendedores y aprobación de boletos

## Objetivo

Agregar un flujo para que los vendedores puedan gestionar boletos, con control administrativo sobre la aprobación de ventas, comisiones y permisos individuales.

## Roles

### Administrador

El administrador puede:

* Crear y gestionar perfiles de vendedores.
* Ver los boletos reservados por vendedores.
* Aprobar boletos pendientes y marcarlos como vendidos.
* Configurar la ganancia o comisión de los vendedores.
* Definir si un vendedor necesita aprobación para vender.
* Permitir que ciertos vendedores marquen boletos como vendidos directamente.

### Vendedor

El vendedor puede:

* Reservar boletos.
* Ver los boletos que ha reservado.
* Consultar el estado de sus boletos.
* Vender boletos directamente solo si el administrador le concede ese permiso.

## Estados de los boletos

Cada boleto puede tener uno de estos estados:

* `disponible`: el boleto aún no ha sido tomado por ningún cliente o vendedor.
* `reservado`: el boleto fue apartado por un vendedor, pero todavía no está aprobado como vendido.
* `pendiente_aprobacion`: el boleto está esperando revisión del administrador.
* `vendido`: el boleto fue confirmado como vendido.
* `cancelado`: la reserva o venta fue anulada.

## Flujo normal de venta con aprobación

1. El vendedor selecciona uno o varios boletos.
2. El sistema marca esos boletos como `reservado` o `pendiente_aprobacion`.
3. Los boletos dejan de aparecer como disponibles para otros usuarios.
4. En el panel del administrador aparece una sección de boletos pendientes por aprobación.
5. El administrador revisa la solicitud.
6. El administrador puede aprobar o rechazar la venta.
7. Si aprueba, los boletos pasan a estado `vendido`.
8. Si rechaza, los boletos vuelven a estar `disponible` o quedan como `cancelado`, según la lógica definida.

## Flujo de venta sin aprobación

El administrador puede habilitar a un vendedor para vender directamente.

Cuando este permiso está activo:

1. El vendedor selecciona uno o varios boletos.
2. El sistema los marca directamente como `vendido`.
3. No pasan por aprobación del administrador.
4. La venta queda registrada con el vendedor responsable.

## Panel de administrador

El panel de administrador debe incluir una sección para vendedores con estas partes:

### Boletos pendientes por aprobación

Debe mostrar:

* Número del boleto.
* Nombre del comprador, si aplica.
* Vendedor que reservó el boleto.
* Fecha de reserva.
* Monto del boleto.
* Estado actual.
* Botón para aprobar.
* Botón para rechazar o cancelar.

### Configuración de vendedores

Debe permitir:

* Crear vendedor.
* Editar vendedor.
* Activar o desactivar vendedor.
* Definir si requiere aprobación para vender.
* Definir si puede vender directamente.
* Configurar su ganancia o comisión.

## Comisión o ganancia del vendedor

El administrador puede configurar la ganancia del vendedor de dos formas:

### Comisión fija

El vendedor gana un monto fijo por cada boleto vendido.

Ejemplo:

* Precio del boleto: 100
* Comisión fija del vendedor: 10
* Ganancia del vendedor por boleto: 10

### Comisión por porcentaje

El vendedor gana un porcentaje del precio del boleto.

Ejemplo:

* Precio del boleto: 100
* Comisión: 15%
* Ganancia del vendedor por boleto: 15

## Configuración recomendada por vendedor

Cada perfil de vendedor debería guardar:

* Nombre del vendedor.
* Teléfono o contacto.
* Estado: activo o inactivo.
* Comisión: fija o porcentaje.
* Valor de comisión.
* Requiere aprobación: sí o no.
* Puede vender directamente: sí o no.
* Fecha de creación.
* Total de boletos vendidos.
* Total de ganancias generadas.

## Reglas importantes

* Un boleto reservado por un vendedor no debe aparecer como disponible para otros usuarios.
* Un boleto pendiente de aprobación no debe poder venderse dos veces.
* Solo el administrador puede aprobar boletos si el vendedor requiere aprobación.
* Si el vendedor tiene permiso para venta directa, el boleto pasa a vendido sin intervención del administrador.
* Todas las ventas deben quedar asociadas al vendedor responsable.
* El sistema debe permitir calcular la ganancia del vendedor según la configuración definida por el administrador.

## Ejemplo de permisos por vendedor

| Vendedor | Requiere aprobación | Venta directa |      Comisión |
| -------- | ------------------: | ------------: | ------------: |
| Juan     |                  Sí |            No |           10% |
| María    |                  No |            Sí | 50 por boleto |
| Pedro    |                  Sí |            No |           15% |

## Impacto esperado

* El administrador mantiene control sobre las ventas realizadas por vendedores.
* Los vendedores pueden apartar boletos sin confirmar ventas automáticamente.
* El sistema evita duplicidad en la venta de boletos.
* Se puede calcular la ganancia de cada vendedor.
* Se permite manejar vendedores con distintos niveles de confianza.


## Yo lo separaría en 4 módulos para desarrollo: 

```
Modelo de datos: vendedores, permisos, comisión, estado de boleto y venta asociada.
Flujo de boletos: disponible, reservado, pendiente de aprobación, vendido, cancelado.
Panel admin: pendientes por aprobación, aprobar/rechazar, configuración de vendedores.
Panel vendedor: reservar boletos, ver sus boletos, ver ventas y ganancias.
```

## Comisiones opcionales por vendedor

Al momento de crear o editar un vendedor, el administrador debe poder definir si ese vendedor trabajará con comisiones o no.

Esta configuración debe ser individual por cada vendedor, ya que no todos los vendedores necesariamente tendrán derecho a recibir comisión por los boletos vendidos.

### Vendedor con comisiones activadas

Cuando un vendedor tenga las comisiones activadas, el sistema debe permitir configurar la forma en que se calculará su ganancia.

El administrador podrá definir si la comisión será:

* Un monto fijo por cada boleto vendido.
* Un porcentaje basado en el precio del boleto.

En este caso, el perfil del vendedor podrá mostrar información relacionada con sus comisiones, como el tipo de comisión, el valor configurado y las ganancias generadas por sus ventas.

### Vendedor sin comisiones

Cuando un vendedor sea marcado como que no utiliza comisiones, el sistema no debe calcular ningún tipo de ganancia por comisión para ese vendedor.

Además, en el perfil de ese vendedor no se debe mostrar ninguna sección, campo o resumen relacionado con comisiones.

Esto significa que:

* No se muestra tipo de comisión.
* No se muestra valor de comisión.
* No se muestran ganancias por comisión.
* No se calculan comisiones sobre sus boletos vendidos.
* No se deben solicitar datos de comisión al crear o editar ese vendedor.

### Regla principal

Si un vendedor no utiliza comisiones, todo lo relacionado con comisiones debe permanecer oculto y deshabilitado para ese vendedor.

Las ventas realizadas por ese vendedor se registran normalmente, pero sin generar cálculos de comisión ni mostrar información de ganancias por comisión en su perfil.


## Corrección de ventas desactualizadas en vendedores

Cuando un vendedor tenga boletos asociados como vendidos, el sistema debe validar que esos boletos sigan existiendo como ventas activas y que su estado actual sea realmente `vendido`.

Si un boleto asociado a un vendedor fue eliminado, cancelado o volvió a estar marcado como `disponible`, esa venta no debe seguir contando dentro de las estadísticas del vendedor.

Esto aplica para:

* Total de boletos vendidos del vendedor.
* Total de ganancias generadas por comisión.
* Listado de boletos vendidos en el perfil del vendedor.
* Resumen mostrado en el panel del administrador.

Actualmente puede ocurrir una inconsistencia cuando el documento del vendedor conserva valores acumulados antiguos, por ejemplo `totalVendidos` o `totalGanancias`, aunque algunas ventas ya no existan o los boletos relacionados estén disponibles nuevamente.

### Comportamiento esperado

El sistema debe contar únicamente las ventas válidas.

Una venta válida es aquella donde:

* El boleto existe.
* El boleto está asociado al vendedor.
* El estado del boleto es `vendido`.
* La venta no fue eliminada ni cancelada.
* El boleto no está marcado como `disponible`.

Si un boleto vuelve a estado `disponible`, se elimina o se cancela, el sistema debe remover esa venta del vendedor y actualizar sus totales.

### Regla principal

Los campos `totalVendidos` y `totalGanancias` del vendedor no deben mostrar datos antiguos o desactualizados.

Estos valores deben recalcularse o actualizarse cada vez que cambie el estado de un boleto asociado al vendedor.

Si el vendedor tiene 1 boleto vendido activo, el panel del administrador, el perfil del vendedor y la base de datos deben reflejar 1 boleto vendido, no ventas antiguas eliminadas.


### 1. Exclusión mutua de modos de venta

En el formulario de creación o edición de vendedores, el sistema debe validar que los modos de venta sean mutuamente excluyentes.

Esto significa que un vendedor no debe poder operar bajo dos reglas de negocio contradictorias al mismo tiempo. Puede tener autonomía para vender directamente, o puede requerir que sus ventas sean revisadas y aprobadas por un Administrador, pero no ambas condiciones simultáneamente.

Por esta razón, en la interfaz de usuario estas opciones no deberían mostrarse como casillas de verificación independientes, ya que eso permite seleccionar ambas. Lo recomendable es utilizar botones de opción, conocidos como radio buttons, o implementar una lógica condicional que deshabilite una opción cuando la otra sea seleccionada.

El objetivo es evitar configuraciones inválidas desde el formulario y asegurar que cada vendedor tenga un único flujo de venta definido.

### 2. Concurrencia y bloqueo de números

Existe un punto pendiente de validación en QA relacionado con la concurrencia del sistema, específicamente cuando dos vendedores intentan reservar o vender el mismo número al mismo tiempo.

Esta situación puede generar una condición de carrera si el sistema no bloquea el número inmediatamente después de que un vendedor lo selecciona o lo reserva. En ese caso, podría ocurrir que ambos vendedores vean el número como disponible e intenten procesarlo de forma simultánea, provocando una posible duplicidad de ventas.

Para evitar este escenario, se debe implementar una restricción de bloqueo a nivel de estado. En el momento en que un vendedor reserva un número, ese número debe cambiar inmediatamente de estado, por ejemplo, de “Disponible” a “Reservado” o “Pendiente de aprobación”, según corresponda al flujo del sistema.

Además, la grilla de números debe actualizarse para reflejar ese cambio de estado de forma oportuna. De esta manera, otros vendedores no seguirán viendo el número como disponible y no podrán intentar venderlo.

Esta mejora no solo protege la integridad de la operación, sino que también mejora la experiencia de usuario al mostrar información consistente y actualizada.
