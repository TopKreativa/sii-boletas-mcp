# Cómo contribuir

¡Gracias por querer ayudar! Este proyecto busca que cualquier pyme en Chile pueda emitir sus documentos tributarios sin pagarle a un intermediario.

## Empezar

```bash
git clone https://github.com/TopKreativa/sii-boletas-mcp
cd sii-boletas-mcp
npm install
npm test
```

Las pruebas no se conectan al SII: usan respuestas simuladas.

## Reglas importantes

- **Nunca** subas claves, RUT reales, certificados ni PDFs de boletas reales (ni en el código, ni en issues, ni en capturas).
- Todo lo que emita documentos reales debe pasar por la revisión previa y pedir confirmación.
- Si una respuesta del SII es ambigua, trátala como "no se sabe si se emitió": nunca reintentes una emisión automáticamente.
- Escribe los mensajes para el usuario en español claro, sin jerga técnica.

## Por dónde partir

Revisa los issues con la etiqueta **good first issue**. Ideas:

- Consultar las boletas emitidas del día o del mes.
- Nota de crédito para anular una boleta.
- Soporte de descuentos por línea.
- Traducir mensajes de error del SII a explicaciones simples.
- Mejorar la documentación con capturas de la instalación en Windows y Mac.

## Pull requests

1. Crea una rama desde `main`.
2. Agrega o actualiza pruebas en `test/`.
3. Corre `npm test`.
4. Explica en el PR qué cambia y cómo lo probaste.
