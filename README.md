<p align="center">
  <img src="icon.png" width="110" alt="Boletas SII Chile">
</p>

<h1 align="center">Boletas SII Chile para Claude</h1>

<p align="center">
  <b>Emite boletas electrónicas del SII conversando con Claude.</b><br>
  Gratis · Código abierto (MIT) · Sin certificado digital · Tus claves no salen de tu computador
</p>

<p align="center">
  <a href="https://github.com/LADYSLAVANDERIA/sii-boletas-mcp/releases/latest"><img src="https://img.shields.io/github/v/release/LADYSLAVANDERIA/sii-boletas-mcp?label=descargar&color=143070" alt="Descargar"></a>
  <img src="https://img.shields.io/badge/licencia-MIT-green" alt="MIT">
  <img src="https://img.shields.io/badge/hecho%20en-Chile%20🇨🇱-d62839" alt="Hecho en Chile">
  <img src="https://img.shields.io/badge/MCP-compatible-6b4fbb" alt="MCP">
</p>

---

> **Tú:** Emite una boleta por 2 lavados de $4.500, pagados con transferencia.
>
> **Claude:** Revisé con el SII: boleta afecta, 2 × Lavado a $4.500, total **$9.000**, transferencia, sucursal casa matriz. ¿La emito?
>
> **Tú:** Sí.
>
> **Claude:** ✅ Boleta emitida. Folio 18342 · Total $9.000 · PDF guardado en *Boletas SII*.

## ¿Para quién es?

Para **pymes, emprendedores y almaceneros** que ya usan el sistema gratuito de boletas del SII y quieren dejar de llenar el formulario a mano, y para **desarrolladores** que quieren emitir boletas desde sus propios sistemas en Node.js sin pagar un intermediario.

## Qué hace

| | |
|---|---|
| 🧾 **Emite boletas 39 y 41** | Afectas y exentas, con el medio de pago exacto (efectivo, tarjeta, transferencia, cheque). |
| 🔍 **Revisa antes de emitir** | Valida contra los datos reales de tu empresa en el SII (sucursales, totales, receptor) y te muestra el resumen. |
| ✋ **Nunca emite sin tu "sí"** | La emisión exige tu confirmación explícita. |
| 📄 **Guarda el PDF** | Queda en la carpeta *Boletas SII* de tu computador. |
| 🔐 **Privado** | Tu RUT y tu clave tributaria se guardan solo en tu computador y viajan solo al SII. |
| 🪪 **Sin certificado ni folios** | Usa el sistema gratuito de boletas del SII: el SII firma y asigna el folio. |

## Instalación en 1 minuto

### Opción A · Claude Desktop (la más fácil)

1. Descarga **`sii-boletas.mcpb`** desde la [última versión](https://github.com/LADYSLAVANDERIA/sii-boletas-mcp/releases/latest).
2. Ábrelo con doble clic: Claude Desktop lo instala.
3. Escribe tu **RUT**, tu **clave tributaria** y (opcional) el **RUT de tu empresa**. Listo.

### Opción B · Claude Code

```bash
claude mcp add sii-boletas \
  -e SII_RUT=12345678-9 -e SII_CLAVE='tu-clave' -e SII_EMPRESA=76123456-7 \
  -- npx -y github:LADYSLAVANDERIA/sii-boletas-mcp
```

### Opción C · Cualquier cliente MCP (configuración JSON)

```json
{
  "mcpServers": {
    "sii-boletas": {
      "command": "npx",
      "args": ["-y", "github:LADYSLAVANDERIA/sii-boletas-mcp"],
      "env": { "SII_RUT": "12345678-9", "SII_CLAVE": "tu-clave", "SII_EMPRESA": "76123456-7" }
    }
  }
}
```

**Requisitos:** Node.js 20 o superior (Claude Desktop ya lo trae), y que tu RUT esté autorizado en el SII para emitir boletas de la empresa (lo mismo que necesitas para emitir en eboleta.sii.cl).

## Úsalo como librería (Node.js)

```js
import { ClienteBoletas } from "sii-boletas-mcp";

const sii = new ClienteBoletas(process.env.SII_RUT, process.env.SII_CLAVE);

const revision = await sii.previsualizar({
  tipo: 39, rutEmpresa: "76123456-7", medioPago: "PE",
  lineas: [{ nombre: "Lavado", cantidad: 2, precio: 4500 }], total: 9000,
});
console.log(revision.errores); // [] si está todo bien

const { folio, pdfUrl } = await sii.emitir({ /* la misma boleta */ });
```

## Preguntas frecuentes

**¿Es oficial del SII?** No. Es un proyecto comunitario que usa los mismos servicios que la página de boletas del SII (eboleta.sii.cl). No es una API documentada: si el SII la cambia, puede dejar de funcionar hasta que se actualice.

**¿Y las facturas?** Las facturas, notas de crédito y guías necesitan certificado digital y van por otro sistema del SII. Están en el [plan de trabajo](#plan-de-trabajo).

**Me salió "No se sabe si la boleta se emitió".** No reintentes. Revisa tu historial en eboleta.sii.cl: la boleta pudo haber quedado emitida y reintentar la duplicaría.

**El SII me pide un código por correo.** Pasa la primera vez desde un equipo nuevo. Entra una vez a eboleta.sii.cl desde ese computador y vuelve a intentar.

**¿Cómo anulo una boleta?** Con una nota de crédito en el sitio del SII (pronto también desde aquí).

## Plan de trabajo

- [x] Boletas afectas (39) y exentas (41) desde Claude
- [x] Revisión previa y confirmación obligatoria
- [ ] Consultar boletas emitidas del día / del mes
- [ ] Nota de crédito para anular boletas
- [ ] Facturas (33/34), notas de crédito (61) y guías (52) con certificado digital
- [ ] Descuentos por línea

¿Quieres ayudar? Mira los [issues marcados como *good first issue*](https://github.com/LADYSLAVANDERIA/sii-boletas-mcp/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) y la [guía para contribuir](CONTRIBUTING.md).

## Origen

Nació en [Ladys Lavandería](https://ladyslavanderia.cl) (Concón), donde hoy emite las boletas de cada día, y lo mantiene [Top Kreativa](https://topkreativa.com). Lo liberamos porque emitir una boleta no debería costarle una suscripción a ninguna pyme.

## Aviso

Software entregado "tal cual", sin garantía (ver [LICENSE](LICENSE)). Cada boleta emitida es un documento tributario real y es responsabilidad de quien la emite. Prueba primero con montos pequeños.

---

### In English

**Issue Chilean SII electronic receipts (boletas) by chatting with Claude.** A free, MIT-licensed MCP server that drives the SII's free e-receipt system with the user's own tax password, so no digital certificate or CAF folios are needed. It validates against the issuer's real SII data, always previews and asks for confirmation before issuing, and keeps credentials on the user's machine. Install the `.mcpb` from Releases in Claude Desktop, or use `npx -y github:LADYSLAVANDERIA/sii-boletas-mcp` in any MCP client. Contributions welcome.
