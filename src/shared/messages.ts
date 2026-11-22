/** Assinatura das mensagens de texto: "*Nome:*" + quebra de linha + texto. */
export const signText = (name: string | undefined, text: string): string => {
  const n = (name ?? '').trim().replace(/[*_~`]/g, '')
  return n && text ? `*${n}:*\n${text}` : text
}

export const KIND_LABEL: Record<string, string> = {
  text: 'texto', image: 'foto', video: 'vídeo', audio: 'áudio', voice: 'mensagem de voz', document: 'documento',
  sticker: 'figurinha', location: 'localização', contact: 'contato', other: 'mensagem'
}
