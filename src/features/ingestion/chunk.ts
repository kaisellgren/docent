export function chunkText(text: string, size = 400, stride = 320): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const chunks: string[] = [];
  for (let index = 0; index < words.length; index += stride) {
    chunks.push(words.slice(index, index + size).join(' '));
  }
  return chunks.filter(Boolean);
}
