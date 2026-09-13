export function formatQty(qty: number): string {
  if (Number.isInteger(qty)) return String(qty)
  return String(parseFloat(qty.toPrecision(3)))
}

// Short forms that read as typos when glued to the number ("2ČL"), unlike "200g"
const SPACED_ABBREVIATIONS = new Set(['čl', 'pl'])

function isAbbreviation(unit: string): boolean {
  if (SPACED_ABBREVIATIONS.has(unit.toLowerCase())) return false
  return unit.length < 3 || !/[aeiouáéíóúäöüàèìòùâêîôûåæøœ]/i.test(unit)
}

export function formatQtyUnit(quantity: number, unit: string): string {
  if (!unit) return formatQty(quantity)
  const sep = isAbbreviation(unit) ? '' : ' '
  return `${formatQty(quantity)}${sep}${unit}`
}
