function brt(): string {
  return new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

export function log(...args: unknown[]): void {
  console.log(`pinebery [${brt()}]:`, ...args)
}

export function warn(...args: unknown[]): void {
  console.warn(`pinebery [${brt()}]:`, ...args)
}
