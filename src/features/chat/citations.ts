const citationMarkerPattern = /\[((?:\d+)(?:\s*,\s*\d+)*)\]/g

export function citedNumbers(text: string): Set<number> {
  const numbers = new Set<number>()
  for (const match of text.matchAll(citationMarkerPattern)) {
    for (const value of (match[1] ?? '').split(',')) {
      const number = Number(value.trim())
      if (Number.isInteger(number) && number > 0) numbers.add(number)
    }
  }
  return numbers
}

export function removeCitations(text: string, validNumbers: Set<number>): string {
  return text.replace(citationMarkerPattern, (marker, values: string) => {
    const numbers = values.split(',').map((value) => Number(value.trim()))
    return numbers.every((number) => validNumbers.has(number)) ? '' : marker
  })
}
