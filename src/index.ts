#!/usr/bin/env node
// Servidor MCP: emite boletas electrónicas del SII de Chile desde Claude (o cualquier cliente MCP).
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { ClienteBoletas, MEDIOS_PAGO, hoyEnChile, type Boleta } from "./sii.js";

const RUT = process.env.SII_RUT ?? "";
const CLAVE = process.env.SII_CLAVE ?? "";
const EMPRESA = (process.env.SII_EMPRESA ?? "").startsWith("${") ? "" : (process.env.SII_EMPRESA ?? "");
const CARPETA_PDF = process.env.SII_CARPETA_PDF || join(homedir(), "Boletas SII");

const cliente = RUT && CLAVE ? new ClienteBoletas(RUT, CLAVE) : null;

const server = new McpServer({ name: "sii-boletas", version: "0.1.0" });

const texto = (t: string, error = false) => ({ content: [{ type: "text" as const, text: t }], isError: error });
const sinCredenciales = () =>
  texto("Faltan las credenciales. Configura SII_RUT (tu RUT personal, ej. 12345678-9) y SII_CLAVE (tu clave tributaria) en la configuración del conector.", true);

const esquemaBoleta = {
  rutEmpresa: z.string().optional().describe("RUT de la empresa que emite (ej. 76123456-7). Si se omite, se usa SII_EMPRESA."),
  tipo: z.union([z.literal(39), z.literal(41)]).default(39).describe("39 = boleta afecta (con IVA, lo normal); 41 = boleta exenta."),
  medioPago: z.enum(["EF", "TC", "PE", "CH", "OT"]).describe("EF efectivo, TC tarjeta/pago electrónico, PE transferencia, CH cheque, OT otro."),
  lineas: z
    .array(
      z.object({
        nombre: z.string().min(1).describe("Producto o servicio (máx. 80 caracteres)."),
        cantidad: z.number().positive(),
        precio: z.number().nonnegative().describe("Precio unitario FINAL en pesos, con IVA incluido."),
        descripcion: z.string().optional(),
      }),
    )
    .min(1),
  total: z.number().optional().describe("Total esperado en pesos, para validar la suma de las líneas."),
  receptor: z
    .object({ rut: z.string().optional(), nombre: z.string().optional(), direccion: z.string().optional(), comuna: z.string().optional() })
    .optional()
    .describe("Solo si el cliente pide boleta con su RUT. Si se omite, va al RUT genérico 66666666-6."),
  sucursal: z.number().optional().describe("Código de sucursal del SII, solo si la empresa tiene más de una."),
};

function armar(a: any): Boleta | string {
  const rutEmpresa = a.rutEmpresa || EMPRESA;
  if (!rutEmpresa) return "Indica el RUT de la empresa que emite (o configura SII_EMPRESA).";
  return { ...a, rutEmpresa } as Boleta;
}

server.registerTool(
  "sii_empresas",
  {
    title: "Empresas habilitadas",
    description: "Lista las empresas para las que el usuario puede emitir boletas en el SII.",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  async () => {
    if (!cliente) return sinCredenciales();
    try {
      return texto(JSON.stringify(await cliente.empresas(), null, 2));
    } catch (e) {
      return texto((e as Error).message, true);
    }
  },
);

server.registerTool(
  "sii_previsualizar_boleta",
  {
    title: "Revisar boleta (sin emitir)",
    description:
      "Valida una boleta contra los datos reales del emisor en el SII y muestra qué se emitiría. NO emite nada. Úsala siempre antes de sii_emitir_boleta y muéstrale el resumen al usuario.",
    inputSchema: esquemaBoleta,
    annotations: { readOnlyHint: true },
  },
  async (a) => {
    if (!cliente) return sinCredenciales();
    const b = armar(a);
    if (typeof b === "string") return texto(b, true);
    try {
      const p = await cliente.previsualizar(b);
      const resumen = [
        p.errores.length ? `❌ No se puede emitir:\n- ${p.errores.join("\n- ")}` : "✅ Lista para emitir.",
        `Fecha: ${p.fecha} · Tipo: ${b.tipo} · Medio de pago: ${MEDIOS_PAGO[b.medioPago as keyof typeof MEDIOS_PAGO] ?? b.medioPago}`,
        `Total: $${p.total.toLocaleString("es-CL")}`,
        ...b.lineas.map((l) => `• ${l.cantidad} × ${l.nombre} a $${l.precio.toLocaleString("es-CL")}`),
        p.avisos.length ? `Avisos:\n- ${p.avisos.join("\n- ")}` : "",
      ].filter(Boolean);
      return texto(resumen.join("\n"), p.errores.length > 0);
    } catch (e) {
      return texto((e as Error).message, true);
    }
  },
);

server.registerTool(
  "sii_emitir_boleta",
  {
    title: "Emitir boleta en el SII",
    description:
      "EMITE una boleta electrónica REAL en el SII (no se puede deshacer; se anula solo con nota de crédito). Antes, usa sii_previsualizar_boleta y obtén la confirmación explícita del usuario con el total. Si falla con 'No se sabe si la boleta se emitió', NO reintentes: pide al usuario revisar eboleta.sii.cl.",
    inputSchema: { ...esquemaBoleta, confirmado: z.literal(true).describe("true solo si el usuario confirmó la emisión.") },
    annotations: { destructiveHint: true, idempotentHint: false },
  },
  async ({ confirmado: _c, ...a }) => {
    if (!cliente) return sinCredenciales();
    const b = armar(a);
    if (typeof b === "string") return texto(b, true);
    try {
      const r = await cliente.emitir(b);
      let pdf = r.pdfUrl ?? "";
      if (r.pdfBase64) {
        await mkdir(CARPETA_PDF, { recursive: true });
        const ruta = join(CARPETA_PDF, `boleta-${b.tipo}-${r.folio}-${hoyEnChile()}.pdf`);
        await writeFile(ruta, Buffer.from(r.pdfBase64, "base64"));
        pdf = ruta;
      }
      return texto(`✅ Boleta emitida. Folio ${r.folio} · Total $${r.total.toLocaleString("es-CL")}${pdf ? `\nPDF: ${pdf}` : ""}`);
    } catch (e) {
      return texto((e as Error).message, true);
    }
  },
);

await server.connect(new StdioServerTransport());
