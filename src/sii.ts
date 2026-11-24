// Cliente del sistema gratuito de boletas electrónicas del SII (eboleta.sii.cl).
// Inicia sesión con la clave tributaria del usuario y emite boletas 39 (afecta) y 41 (exenta).
// No necesita certificado digital ni folios (CAF): el SII asigna el folio.
//
// Aviso: usa los mismos servicios que la página web de boletas del SII. No es una API
// documentada oficialmente; si el SII la cambia, este módulo puede dejar de funcionar.

const REGION = "us-east-1";
const URL_AUTORIZAR = "https://clave.w.sii.cl/oauthsii-v1-ms/authorization/v1/authorize";
const URL_SIGN_IN = "https://x78kr8nqx5.execute-api.us-east-1.amazonaws.com/prod/sign-in";
const URL_COGNITO = "https://cognito-identity.us-east-1.amazonaws.com/";
const API = "https://cn68i6qm0g.execute-api.us-east-1.amazonaws.com/prod";
const CLIENT_ID = "e0378e96-4014-4a47-b852-9d9246797f5c";
const REDIRECT_URI = "https://eboleta.sii.cl/emitir/";

export class RequiereVerificacion extends Error {}
export class LoginRechazado extends Error {}
/** El envío falló de forma que no se sabe si la boleta quedó emitida. No reintentar sin revisar el historial del SII. */
export class EmisionIncierta extends Error {}

export type Http = (url: string, init: { method: string; headers?: Record<string, string>; body?: string }) => Promise<{ status: number; body: string }>;

export const httpReal: Http = async (url, init) => {
  const r = await fetch(url, { method: init.method, headers: init.headers, body: init.body, signal: AbortSignal.timeout(30_000), redirect: "manual" });
  return { status: r.status, body: await r.text() };
};

export interface Llaves { accessKeyId: string; secretKey: string; sessionToken?: string; expiration: number }
export interface Sesion { identityId: string; tokenOpenId: string; llaves: Llaves }

const enc = new TextEncoder();
const hexa = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const sha256Hex = async (t: string) => hexa(await crypto.subtle.digest("SHA-256", enc.encode(t)));
async function hmac(clave: BufferSource, dato: string) {
  const k = await crypto.subtle.importKey("raw", clave, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", k, enc.encode(dato));
}
const rfc3986 = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
const decSeguro = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } };
const jsonSeguro = (t: string): any => { try { return JSON.parse(t); } catch { return null; } };
const forma = (o: unknown) => (o && typeof o === "object" ? "campos: " + Object.keys(o).slice(0, 12).join(", ") : typeof o);
export const limpiarRut = (r: unknown) => String(r ?? "").replace(/\./g, "").trim().toUpperCase();

/** Firma AWS Signature V4 (la usa el servicio de boletas del SII). */
export async function firmarSigV4(
  p: { method: string; url: string; headers?: Record<string, string>; body?: string },
  cred: { accessKeyId: string; secretKey: string; sessionToken?: string },
  o: { region: string; service: string; fecha: Date },
) {
  const amzDate = o.fecha.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dia = amzDate.slice(0, 8);
  const u = new URL(p.url);
  const firmados: Record<string, string> = { host: u.host, "x-amz-date": amzDate };
  for (const [k, v] of Object.entries(p.headers ?? {})) firmados[k.toLowerCase()] = v;
  if (cred.sessionToken) firmados["x-amz-security-token"] = cred.sessionToken;
  const nombres = Object.keys(firmados).sort();
  const signedHeaders = nombres.join(";");
  const canonHeaders = nombres.map((n) => `${n}:${firmados[n].trim()}\n`).join("");
  const canonUri = (u.pathname || "/").split("/").map((s) => rfc3986(decSeguro(s))).join("/");
  const pares: [string, string][] = [...u.searchParams];
  pares.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const canonQuery = pares.map(([k, v]) => `${rfc3986(k)}=${rfc3986(v)}`).join("&");
  const canonReq = [p.method.toUpperCase(), canonUri, canonQuery, canonHeaders, signedHeaders, await sha256Hex(p.body ?? "")].join("\n");
  const ambito = `${dia}/${o.region}/${o.service}/aws4_request`;
  const aFirmar = ["AWS4-HMAC-SHA256", amzDate, ambito, await sha256Hex(canonReq)].join("\n");
  const kDia = await hmac(enc.encode("AWS4" + cred.secretKey) as Uint8Array<ArrayBuffer>, dia);
  const kReg = await hmac(kDia, o.region);
  const kSer = await hmac(kReg, o.service);
  const kFir = await hmac(kSer, "aws4_request");
  const firma = hexa(await hmac(kFir, aFirmar));
  const salida: Record<string, string> = {
    Authorization: `AWS4-HMAC-SHA256 Credential=${cred.accessKeyId}/${ambito}, SignedHeaders=${signedHeaders}, Signature=${firma}`,
    "X-Amz-Date": amzDate,
  };
  if (cred.sessionToken) salida["X-Amz-Security-Token"] = cred.sessionToken;
  return salida;
}

/** Inicia sesión con RUT y clave tributaria del usuario que emite. */
export async function iniciarSesion(http: Http, usuarioRut: string, clave: string): Promise<Sesion> {
  const sinDv = limpiarRut(usuarioRut).split("-")[0];
  const state = crypto.randomUUID();
  const r1 = await http(URL_AUTORIZAR, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ response_type: "code", client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, scope: "user_info", state, user: sinDv, password: clave, token_captcha: "0", action_captcha: "login" }),
  });
  const a = jsonSeguro(r1.body);
  if (!a) throw new Error(`El login del SII no respondió JSON (estado ${r1.status}). Puede haber sala de espera o mantención.`);
  if (a.action === "CHLNG") throw new RequiereVerificacion("El SII pide verificar la identidad con un código enviado por correo (equipo nuevo). Entra una vez a eboleta.sii.cl desde este computador y vuelve a intentar.");
  if (a.success === false || (a.code && !a.action && !a.redirect_uri)) {
    throw new LoginRechazado(`El SII rechazó el ingreso (código ${a.code ?? "desconocido"}): ${String(a.message ?? "clave incorrecta o cuenta sin clave").slice(0, 200)}`);
  }
  const m = typeof a.redirect_uri === "string" ? /[?&]code=([^&]+)/.exec(a.redirect_uri) : null;
  if (!m) throw new Error(`El SII aceptó el ingreso pero no entregó el código de sesión (${forma(a)}).`);
  const code = decodeURIComponent(m[1]);
  const r2 = await http(URL_SIGN_IN, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rut: "", opts: { code, state, authMethod: "clave-tributaria" } }),
  });
  const b = jsonSeguro(r2.body);
  const identityId = b?.openId?.IdentityId, tokenOpenId = b?.openId?.Token;
  if (!identityId || !tokenOpenId) throw new Error(`El sistema de boletas no entregó la sesión (estado ${r2.status}; ${forma(b)}).`);
  return { identityId, tokenOpenId, llaves: await renovarLlaves(http, identityId, tokenOpenId) };
}

export async function renovarLlaves(http: Http, identityId: string, tokenOpenId: string): Promise<Llaves> {
  const r = await http(URL_COGNITO, {
    method: "POST",
    headers: { "Content-Type": "application/x-amz-json-1.1", "X-Amz-Target": "AWSCognitoIdentityService.GetCredentialsForIdentity" },
    body: JSON.stringify({ IdentityId: identityId, Logins: { "cognito-identity.amazonaws.com": tokenOpenId } }),
  });
  const c = jsonSeguro(r.body)?.Credentials;
  if (!c?.AccessKeyId || !c?.SecretKey || !c?.SessionToken) throw new Error(`No se obtuvieron las llaves temporales (estado ${r.status}).`);
  return { accessKeyId: c.AccessKeyId, secretKey: c.SecretKey, sessionToken: c.SessionToken, expiration: Number(c.Expiration) || 0 };
}

async function getFirmado(http: Http, llaves: Llaves, ruta: string, ahora = new Date()) {
  const url = `${API}${ruta}`;
  const firma = await firmarSigV4({ method: "GET", url, headers: {}, body: "" }, llaves, { region: REGION, service: "execute-api", fecha: ahora });
  const r = await http(url, { method: "GET", headers: firma });
  const corta = ruta.split("/").slice(0, 4).join("/");
  if (r.status < 200 || r.status >= 300) throw new Error(`El SII respondió ${r.status} en ${corta}: ${r.body.slice(0, 150)}`);
  const j = jsonSeguro(r.body);
  if (j === null) throw new Error(`Respuesta no legible del SII en ${corta}`);
  return j;
}

/** Empresas para las que el usuario puede emitir boletas. */
export const empresasDelUsuario = (http: Http, llaves: Llaves, usuarioRut: string) =>
  getFirmado(http, llaves, `/api/info-contribuyente/emisores-usuario/${limpiarRut(usuarioRut)}`);

/** Datos del emisor (razón social, sucursales, etc.) tal como los usa la página del SII. */
export const infoEmisor = (http: Http, llaves: Llaves, empresaRut: string, usuarioRut: string) =>
  getFirmado(http, llaves, `/api/info-contribuyente/info-emisor-usuario/${limpiarRut(empresaRut).split("-")[0]}/${limpiarRut(usuarioRut)}`);

export const MEDIOS_PAGO = { EF: "Efectivo", TC: "Tarjeta / pago electrónico", PE: "Transferencia electrónica", CH: "Cheque", OT: "Otro" } as const;
const MEDIO_A_CODIGO_SII: Record<string, number> = { EF: 1, TC: 2, PE: 3, CH: 4, CF: 4, LT: 5, OT: 5 };
export const RUT_GENERICO = "66666666-6";

export interface LineaBoleta { nombre: string; cantidad: number; precio: number; descripcion?: string }
export interface Boleta {
  tipo: 39 | 41;
  rutEmpresa: string;
  medioPago: keyof typeof MEDIOS_PAGO | "CF" | "LT";
  lineas: LineaBoleta[];
  /** Total esperado (precio final con IVA incluido). Si se indica, se valida contra la suma de las líneas. */
  total?: number;
  receptor?: { rut?: string; nombre?: string; direccion?: string; comuna?: string };
  sucursal?: number;
}

/** Fecha de hoy en Chile (AAAA-MM-DD): el SII solo emite boletas con fecha del día. */
export const hoyEnChile = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

/** Valida la boleta y arma el cuerpo que espera el SII. No envía nada. */
export function prepararBoleta(b: Boleta, info: any, usuarioRut: string) {
  const errores: string[] = [];
  const avisos: string[] = [];
  if (b.tipo !== 39 && b.tipo !== 41) errores.push("Solo se emiten boletas tipo 39 (afecta) o 41 (exenta).");
  const medio = typeof b.medioPago === "string" ? MEDIO_A_CODIGO_SII[b.medioPago.trim().toUpperCase()] : undefined;
  if (!medio) errores.push(`Medio de pago no reconocido: ${String(b.medioPago).slice(0, 20)}. Usa EF, TC, PE, CH u OT.`);

  const sucursales: any[] = Array.isArray(info?.sucursales) ? info.sucursales : [];
  let sucursal: number | undefined;
  if (!sucursales.length) errores.push("Los datos del emisor no traen sucursales: no se puede emitir.");
  else if (b.sucursal !== undefined) {
    if (sucursales.some((s) => s.codigo === b.sucursal)) sucursal = b.sucursal;
    else errores.push(`La sucursal ${b.sucursal} no está entre las del emisor (${sucursales.map((s) => s.codigo).join(", ")}).`);
  } else if (sucursales.length === 1) sucursal = sucursales[0].codigo;
  else errores.push(`El emisor tiene ${sucursales.length} sucursales (${sucursales.map((s) => s.codigo).join(", ")}): indica con cuál emitir.`);

  const rutRecep = limpiarRut(b.receptor?.rut);
  const generico = !rutRecep || rutRecep === RUT_GENERICO;
  const receptor: Record<string, string> = generico
    ? { RUTRecep: RUT_GENERICO, RznSocRecep: "SII Boleta", DirRecep: String(b.receptor?.direccion || "Santiago") }
    : { RUTRecep: rutRecep, RznSocRecep: String(b.receptor?.nombre || ""), DirRecep: String(b.receptor?.direccion || "") };
  if (!generico && (!receptor.RznSocRecep || !receptor.DirRecep)) errores.push("Con RUT de cliente se exige nombre y dirección del receptor.");
  if (!generico && b.receptor?.comuna) receptor.CmnaRecep = String(b.receptor.comuna);

  const lineas = Array.isArray(b.lineas) ? b.lineas : [];
  if (!lineas.length) errores.push("La boleta no tiene líneas de detalle.");
  let suma = 0;
  const Detalle = lineas.map((l, i) => {
    const q = Number(l?.cantidad), p = Number(l?.precio);
    if (!(q > 0) || !(p >= 0)) errores.push(`Línea ${i + 1}: cantidad o precio inválido.`);
    if (!String(l?.nombre ?? "").trim()) errores.push(`Línea ${i + 1}: falta el nombre del producto o servicio.`);
    suma += Math.round(q * p);
    const linea: Record<string, unknown> = { NmbItem: String(l?.nombre ?? "").slice(0, 80), QtyItem: q, PrcItem: p };
    if (String(l?.descripcion ?? "").trim()) linea.DscItem = String(l.descripcion).slice(0, 1000);
    return linea;
  });
  if (lineas.some((l) => String(l?.descripcion ?? "").trim())) avisos.push("La descripción por línea está en la página del SII pero no ha sido probada en muchas emisiones reales.");
  if (b.total !== undefined && lineas.length && suma !== Number(b.total)) errores.push(`La suma de las líneas (${suma}) no coincide con el total indicado (${b.total}).`);
  if (errores.length) return { cuerpo: null, total: suma, errores, avisos };

  return {
    errores, avisos, total: suma,
    cuerpo: {
      vendedor: limpiarRut(usuarioRut),
      Encabezado: {
        IdDoc: { TipoDTE: b.tipo, Folio: 1, MedioPago: medio }, // el folio lo asigna el SII; el 1 es relleno
        Emisor: { RUTEmisor: limpiarRut(b.rutEmpresa), CdgSIISucur: sucursal },
        Receptor: receptor,
      },
      Detalle,
      Meta: { info_emisor: info, geolocalizacion: { latitude: 0, longitude: 0 }, plataforma: "eboleta_web" },
    },
  };
}

/** Emite la boleta en el SII. Es una operación real e irreversible (se anula con nota de crédito). */
export async function emitirBoleta(http: Http, llaves: Llaves, cuerpo: unknown, ahora = new Date()) {
  const url = `${API}/api/dte/documentos/generar`;
  const body = JSON.stringify(cuerpo);
  const firma = await firmarSigV4({ method: "POST", url, headers: {}, body }, llaves, { region: REGION, service: "execute-api", fecha: ahora });
  let r;
  try {
    r = await http(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", ...firma }, body });
  } catch (e) {
    throw new EmisionIncierta(`Falló el envío (${(e as Error).message.slice(0, 120)}). No se sabe si la boleta se emitió: revisa el historial en eboleta.sii.cl antes de reintentar.`);
  }
  const j = jsonSeguro(r.body);
  if (j && typeof j.folio === "number" && j.folio > 0) {
    return { folio: j.folio as number, pdfUrl: (j.pdf_public_url ?? null) as string | null, pdfBase64: (j.b64encoded_pdf ?? null) as string | null };
  }
  if (r.status >= 400 && r.status < 500) throw new Error(`El SII rechazó la boleta (estado ${r.status}): ${r.body.slice(0, 300)}`);
  throw new EmisionIncierta(`Respuesta sin folio (estado ${r.status}). No se sabe si la boleta se emitió: revisa el historial en eboleta.sii.cl antes de reintentar.`);
}

/** Cliente con sesión en memoria: inicia sesión al primer uso y renueva llaves al vencer. */
export class ClienteBoletas {
  private sesion: Sesion | null = null;
  constructor(private usuarioRut: string, private clave: string, private http: Http = httpReal) {}

  private async llaves(): Promise<Llaves> {
    const ahora = Date.now() / 1000;
    if (!this.sesion) this.sesion = await iniciarSesion(this.http, this.usuarioRut, this.clave);
    else if (this.sesion.llaves.expiration && this.sesion.llaves.expiration - ahora < 120) {
      try { this.sesion.llaves = await renovarLlaves(this.http, this.sesion.identityId, this.sesion.tokenOpenId); }
      catch { this.sesion = await iniciarSesion(this.http, this.usuarioRut, this.clave); }
    }
    return this.sesion.llaves;
  }

  async empresas() { return empresasDelUsuario(this.http, await this.llaves(), this.usuarioRut); }

  async previsualizar(b: Boleta) {
    const info = await infoEmisor(this.http, await this.llaves(), b.rutEmpresa, this.usuarioRut);
    const p = prepararBoleta(b, info, this.usuarioRut);
    return { ...p, fecha: hoyEnChile(), sucursales: Array.isArray(info?.sucursales) ? info.sucursales.map((s: any) => ({ codigo: s.codigo, direccion: s.direccion ?? s.dir ?? null })) : [] };
  }

  async emitir(b: Boleta) {
    const llaves = await this.llaves();
    const info = await infoEmisor(this.http, llaves, b.rutEmpresa, this.usuarioRut);
    const p = prepararBoleta(b, info, this.usuarioRut);
    if (!p.cuerpo) throw new Error("No se emitió. Errores: " + p.errores.join(" | "));
    const r = await emitirBoleta(this.http, llaves, p.cuerpo);
    return { ...r, total: p.total, avisos: p.avisos };
  }
}
