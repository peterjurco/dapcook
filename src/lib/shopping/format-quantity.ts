export function formatQty(qty: number): string {
  if (Number.isInteger(qty)) return String(qty)
  return String(parseFloat(qty.toPrecision(3)))
}

function isAbbreviation(unit: string): boolean {
  return unit.length < 3 || !/[aeiouáéíóúäöüàèìòùâêîôûåæøœ]/i.test(unit)
}

export function formatQtyUnit(quantity: number, unit: string): string {
  if (!unit) return formatQty(quantity)
  const sep = isAbbreviation(unit) ? '' : ' '
  return `${formatQty(quantity)}${sep}${unit}`
}
