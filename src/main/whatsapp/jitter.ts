/** Espera aleatória entre min e max ms. Toda ação automática (não humana) no WhatsApp passa por aqui. */
export const jitterMs = (min = 2000, max = 5000, rnd: () => number = Math.random): number => Math.round(min + rnd() * (max - min))
export const jitter = (min = 2000, max = 5000): Promise<void> => new Promise((r) => setTimeout(r, jitterMs(min, max)))
