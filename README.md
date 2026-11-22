# AssistBot

Assistente de WhatsApp para assistência técnica (Electron + React + TypeScript + SQLite embutido `node:sqlite` + Baileys).

## Desenvolvimento
```bash
npm install
npm test          # motor de triagem
npm run dev       # abre o app
npm run dist      # gera release/AssistBot Setup x.y.z.exe (NSIS, sem admin)
```
No macOS arm64 o `makensis` embutido do electron-builder é x86; use `brew install makensis` e substitua `…/nsis-*/mac/makensis` por um script que chame `/opt/homebrew/bin/makensis`. Ou use o workflow `.github/workflows/build-windows.yml` (Windows real, com teste de instalação silenciosa).

## Atualizações
Publique `AssistBot Setup x.y.z.exe`, `.blockmap` e `latest.yml` em um endereço HTTPS e informe a URL em *Configurações › Atualizações › Avançado* (ou troque o `publish.url` em `package.json`). O `electron-updater` confere o SHA-512 de `latest.yml`. **Procedência:** assine o instalador com certificado de code signing (defina `CSC_LINK`/`CSC_KEY_PASSWORD`); sem ele o Windows SmartScreen avisa na instalação.

## IA futura
O motor (`src/main/bot/engine.ts`) é uma função pura `processMessage(sessão, texto, contexto)`; um provedor de IA pode ser plugado como fallback para respostas não reconhecidas, sem mudar o restante.

## Checklist de teste em Windows limpo (manual)
1. Instalar o .exe (sem pedir administrador); atalhos criados. 2. Assistente: 4 passos, ler o QR. 3. Mandar mensagem de outro número e completar o fluxo; conferir Solicitação/Coleta. 4. Responder pelo celular: o bot silencia. 5. Fechar a janela: ícone na bandeja, bot continua. 6. Reiniciar o Windows: abre sozinho minimizado e reconecta. 7. Desligar o Wi‑Fi: aviso de sem internet; religar: reconecta. 8. Instalar versão nova por cima: dados preservados. 9. Desinstalar.
