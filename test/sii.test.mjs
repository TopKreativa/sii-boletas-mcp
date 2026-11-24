import { test } from "node:test";
import assert from "node:assert/strict";
import { firmarSigV4, prepararBoleta, hoyEnChile, limpiarRut, emitirBoleta, EmisionIncierta } from "../dist/sii.js";

const info1 = { sucursales: [{ codigo: 81234567 }] };

test("limpiarRut quita puntos y pasa a mayúscula", () => {
  assert.equal(limpiarRut("12.345.678-k"), "12345678-K");
});

test("boleta simple con RUT genérico", () => {
  const p = prepararBoleta({ tipo: 39, rutEmpresa: "76.123.456-7", medioPago: "PE", lineas: [{ nombre: "Lavado", cantidad: 2, precio: 2500 }], total: 5000 }, info1, "11.111.111-1");
  assert.deepEqual(p.errores, []);
  assert.equal(p.total, 5000);
  assert.equal(p.cuerpo.Encabezado.Receptor.RUTRecep, "66666666-6");
  assert.equal(p.cuerpo.Encabezado.IdDoc.MedioPago, 3);
  assert.equal(p.cuerpo.Encabezado.Emisor.CdgSIISucur, 81234567);
});

test("detecta total que no cuadra", () => {
  const p = prepararBoleta({ tipo: 39, rutEmpresa: "76123456-7", medioPago: "EF", lineas: [{ nombre: "X", cantidad: 1, precio: 1000 }], total: 1500 }, info1, "1-9");
  assert.equal(p.cuerpo, null);
  assert.match(p.errores[0], /no coincide/);
});

test("exige elegir sucursal si hay varias", () => {
  const p = prepararBoleta({ tipo: 39, rutEmpresa: "76123456-7", medioPago: "EF", lineas: [{ nombre: "X", cantidad: 1, precio: 1000 }] }, { sucursales: [{ codigo: 1 }, { codigo: 2 }] }, "1-9");
  assert.match(p.errores.join(), /2 sucursales/);
});

test("receptor con RUT exige nombre y dirección", () => {
  const p = prepararBoleta({ tipo: 39, rutEmpresa: "76123456-7", medioPago: "EF", lineas: [{ nombre: "X", cantidad: 1, precio: 1 }], receptor: { rut: "12345678-5" } }, info1, "1-9");
  assert.match(p.errores.join(), /nombre y dirección/);
});

test("hoyEnChile usa la zona horaria de Santiago", () => {
  // 2026-01-01 02:00 UTC = 2025-12-31 23:00 en Chile (verano, UTC-3)
  assert.equal(hoyEnChile(new Date("2026-01-01T02:00:00Z")), "2025-12-31");
});

test("firma SigV4 coincide con el ejemplo oficial de AWS (get-vanilla)", async () => {
  const h = await firmarSigV4(
    { method: "GET", url: "https://example.amazonaws.com/", headers: {}, body: "" },
    { accessKeyId: "AKIDEXAMPLE", secretKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY" },
    { region: "us-east-1", service: "service", fecha: new Date("2015-08-30T12:36:00Z") },
  );
  assert.equal(
    h.Authorization,
    "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31",
  );
});

test("emisión sin folio se marca como incierta (no reintentar)", async () => {
  const http = async () => ({ status: 502, body: "Bad gateway" });
  await assert.rejects(emitirBoleta(http, { accessKeyId: "a", secretKey: "b", expiration: 0 }, {}), EmisionIncierta);
});

test("emisión exitosa devuelve folio", async () => {
  const http = async () => ({ status: 200, body: JSON.stringify({ folio: 1234, pdf_public_url: "https://x/y.pdf" }) });
  const r = await emitirBoleta(http, { accessKeyId: "a", secretKey: "b", expiration: 0 }, {});
  assert.equal(r.folio, 1234);
});
