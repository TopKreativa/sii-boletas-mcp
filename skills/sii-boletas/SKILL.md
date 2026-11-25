---
name: sii-boletas
description: Issue Chilean SII electronic receipts (boletas 39/41) through the sii-boletas-mcp server. Use when a Chilean user asks to emit, prepare or check a boleta (boleta electrónica, boleta afecta o exenta) for a sale.
---

# Boletas del SII (Chile)

This skill tells you when and how to use the **sii-boletas-mcp** server (MIT, https://github.com/TopKreativa/sii-boletas-mcp) to issue official electronic receipts in Chile's SII free e-receipt system. Every boleta you issue is a **real tax document**: it cannot be deleted, only cancelled with a credit note on the SII site.

Talk to the user in their language (usually Spanish). Use plain words, not tax jargon.

## Requirements

The MCP server must be installed and configured. If its tools (`sii_empresas`, `sii_previsualizar_boleta`, `sii_emitir_boleta`) are not available, tell the user how to install it and stop:

- **Claude Desktop:** download `sii-boletas.mcpb` from https://github.com/TopKreativa/sii-boletas-mcp/releases/latest and open it.
- **Claude Code:** `claude mcp add sii-boletas -e SII_RUT=… -e SII_CLAVE=… -e SII_EMPRESA=… -- npx -y github:TopKreativa/sii-boletas-mcp`

Never ask the user to paste their tax password (clave tributaria) into the chat. It belongs only in the connector's configuration on their own computer.

## When to use

- "Emite / hazme / saca una boleta…", "boletéame esta venta", "necesito la boleta de…"
- Checking whether a boleta would be valid before issuing it.
- Listing the companies the user can issue for (`sii_empresas`).

Do **not** use it for facturas (33/34), credit notes (61) or dispatch guides (52): this server only issues boletas 39 (afecta, with IVA) and 41 (exenta). Say so and suggest the SII site or a full DTE provider.

## Workflow (always in this order)

1. **Collect the sale.** For each line: product or service name, quantity and **final unit price in pesos with IVA included**. Ask for the payment method if missing. Do not guess it.
2. **Preview** with `sii_previsualizar_boleta`. It checks the issuer's real SII data and changes nothing.
3. **Show the summary** to the user: type, lines, total, payment method, and any errors or warnings. If there are errors, fix them with the user and preview again.
4. **Ask for an explicit yes** with the total, for example: "¿Emito la boleta por $9.000, pagada con transferencia?"
5. Only after a clear yes, call `sii_emitir_boleta` with the same data and `confirmado: true`.
6. **Report** the folio, the total and where the PDF was saved.

Never issue without step 4, never issue a boleta the user did not ask for, and never change amounts after the user confirmed them.

## Field rules

- **tipo:** `39` by default (afecta). Use `41` only when the user says the sale is exempt from IVA.
- **medioPago:** `EF` efectivo, `TC` tarjeta de débito o crédito / pago electrónico, `PE` transferencia, `CH` cheque, `OT` otro. Map the user's words to these codes and confirm when unsure.
- **precio:** final price per unit, IVA included. If the user gives a net price, compute the gross price, show it and confirm before using it.
- **total:** pass the expected total so the server checks the sum of the lines.
- **receptor:** leave it out for normal sales (it goes to the generic RUT 66666666-6). Use it only if the customer asks for a boleta with their RUT; then name and address are required.
- **sucursal:** only needed when the company has more than one branch. If the preview reports several, ask which one.
- **Date:** the SII only issues boletas dated today. You cannot backdate a boleta.

## Errors

- **"No se sabe si la boleta se emitió" (EmisionIncierta):** do **not** retry. Tell the user to check their history at eboleta.sii.cl first, because a retry could issue the same boleta twice.
- **The SII asks for a verification code (equipo nuevo):** the user must log in once at eboleta.sii.cl from that computer, then try again.
- **Login rejected:** the RUT or tax password in the connector's configuration is wrong, or that RUT is not authorized to issue boletas for the company.
- **Validation errors from the preview:** explain them in plain words and fix the data with the user.

## Example

User: *Emite una boleta por 3 cafés de $3.000, pagados con transferencia.*

1. Preview: tipo 39, 3 × Café a $3.000, total $9.000, medio PE.
2. You: "Revisé con el SII: boleta afecta, 3 × Café a $3.000, total **$9.000**, transferencia. ¿La emito?"
3. User: "Sí."
4. Emit with `confirmado: true` and reply: "Boleta emitida. Folio 18342 · Total $9.000 · PDF guardado en *Boletas SII*."
