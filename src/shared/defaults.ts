import type { BotConfig, AppSettings } from './types'

const day = (open: boolean, from = '08:00', to = '18:00') => ({ open, from, to })

export const DEFAULT_CONFIG: BotConfig = {
  business: { name: 'Minha Assistência Técnica', address: '', hoursText: 'Segunda a sexta, das 8h às 18h. Sábado, das 8h às 12h.', phone: '' },
  schedule: [day(false), day(true), day(true), day(true), day(true), day(true), day(true, '08:00', '12:00')],
  equipmentTypes: [
    { name: 'Celular', keywords: ['celular', 'iphone', 'smartphone', 'galaxy', 'motorola', 'xiaomi', 'redmi', 'poco'], askBrand: true },
    { name: 'Notebook', keywords: ['notebook', 'laptop', 'macbook'], askBrand: true },
    { name: 'Computador', keywords: ['computador', 'pc', 'desktop', 'cpu', 'gabinete'], askBrand: false },
    { name: 'Tablet', keywords: ['tablet', 'ipad'], askBrand: true },
    { name: 'Videogame', keywords: ['video game', 'videogame', 'playstation', 'ps4', 'ps5', 'xbox', 'nintendo', 'switch'], askBrand: true },
    { name: 'TV', keywords: ['tv', 'televisao', 'smart tv'], askBrand: true },
    { name: 'Impressora', keywords: ['impressora', 'multifuncional'], askBrand: true },
    { name: 'Outro equipamento', keywords: [], askBrand: false }
  ],
  services: [
    { name: 'Orçamento / diagnóstico', keywords: ['orcamento', 'diagnostico', 'avaliar', 'avaliacao', 'quanto custa', 'valor'], askPickup: true },
    { name: 'Conserto', keywords: ['consertar', 'conserto', 'reparo', 'arrumar', 'concertar', 'quebrou', 'defeito'], askPickup: true },
    { name: 'Troca de tela', keywords: ['tela', 'display', 'trincou', 'trincada'], askPickup: true },
    { name: 'Troca de bateria', keywords: ['bateria'], askPickup: true },
    { name: 'Formatação / software', keywords: ['formatar', 'formatacao', 'virus', 'sistema', 'windows', 'lento'], askPickup: true },
    { name: 'Consultar andamento', keywords: ['andamento', 'ficou pronto', 'ja esta pronto', 'status'], askPickup: false }
  ],
  pickup: {
    enabled: true,
    options: [
      { label: 'Vou levar até a loja', needsAddress: false },
      { label: 'Quero que busquem (coleta)', needsAddress: true }
    ]
  },
  followUps: [
    { id: 'liga', text: 'O aparelho liga normalmente?', equipments: [], services: [] },
    { id: 'molhou', text: 'Ele já caiu ou molhou?', equipments: ['Celular', 'Notebook', 'Tablet', 'Videogame'], services: [] },
    { id: 'carregador', text: 'Você tem o carregador original?', equipments: ['Celular', 'Notebook', 'Tablet', 'Videogame'], services: [] },
    { id: 'senha', text: 'Existe senha de bloqueio? (não precisa informar a senha agora)', equipments: ['Celular', 'Notebook', 'Computador', 'Tablet'], services: [] }
  ],
  quickReplies: [
    'Olá {nome}, tudo bem? Como posso ajudar?',
    'Já estamos verificando seu aparelho e retornamos em breve.',
    'Pode me enviar uma foto do defeito, por favor?',
    'Seu aparelho está pronto! Pode retirar no nosso horário de funcionamento.',
    'Aguarde um instante, por favor.'
  ],
  messages: {
    greeting: 'Olá! 👋 Bem-vindo(a) à *{empresa}*. Sou o assistente virtual e vou anotar os dados do seu atendimento.',
    askName: 'Para começar, qual é o seu nome?',
    askService: 'Prazer, {nome}! Qual serviço você precisa?\n{opcoes}',
    askEquipment: 'Qual é o equipamento?\n{opcoes}',
    askBrand: 'Qual a marca e o modelo do seu {equipamento}? (se não souber, escreva "não sei")',
    askProblem: 'Conte o que está acontecendo com o aparelho.',
    askPickup: 'Como prefere entregar o aparelho?\n{opcoes}',
    askAddress: 'Qual o endereço completo para a coleta? (rua, número, bairro)',
    askAvailability: 'Quais dias e horários você estará disponível para a coleta?',
    confirm: 'Confira os dados do seu atendimento:\n\n{resumo}\n\nEstá tudo certo? Responda *sim* para enviar ou *corrigir* para alterar algo.',
    closing: 'Pronto, {nome}! ✅ Sua solicitação foi enviada. Em breve um atendente entrará em contato. Horário de funcionamento: {horario}',
    outOfHours: 'No momento estamos fora do horário de atendimento ({horario}). Pode deixar seus dados aqui que respondemos assim que abrirmos. 😉',
    handoff: 'Certo! Vou chamar um atendente para falar com você. Aguarde um instante, por favor. 🙏',
    resume: 'Que bom ter você de volta! Vamos continuar de onde paramos.',
    invalid: 'Não consegui entender. Pode responder de outra forma?',
    correctPrompt: 'O que deseja corrigir? Responda com o número:\n{opcoes}',
    mediaReceived: 'Recebi seu(sua) {tipo}! 👍 Já anexei ao seu atendimento. Para continuar, responda por texto, por favor.',
    audioReceived: 'Ainda não consigo ouvir áudios 😅 Pode escrever sua resposta, por favor?'
  },
  handoff: { keywords: ['atendente', 'humano', 'pessoa', 'falar com alguem', 'responsavel', 'dono'], pauseMinutesAfterHuman: 120 },
  behavior: { enabled: false, outOfHoursMode: 'collect', resumeAfterMinutes: 30, sessionExpireHours: 24 }
}

export const DEFAULT_SETTINGS: AppSettings = {
  setupDone: false, startWithWindows: true, keepRunningInTray: true,
  preventSleep: true, autoBackup: true, notifyHuman: true, backupKeep: 7,
  signHuman: true, signBot: false, botSignatureName: 'Assistente virtual'
}
