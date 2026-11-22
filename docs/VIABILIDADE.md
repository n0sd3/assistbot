# Viabilidade técnica — LibZapitu

Verificado em 21/11/2026.

| Item | LibZapitu (`zapitu/libzapitu`, npm `libzapitu`) | Baileys (`WhiskeySockets/Baileys`, npm `baileys`) |
|---|---|---|
| Origem | Fork do Baileys | Projeto original |
| Versão | `1.0.0-alpha.26` | `7.0.0-rc14` |
| Popularidade | ~15 estrelas, 1 mantenedor npm | ~11,7 mil estrelas, 3 mantenedores npm |
| Dependência crítica | `libsignal` via **GitHub de terceiro** (`renatoiub/libsignal-node`, fork, 0 estrelas) | `libsignal` publicado no npm + `whatsapp-rust-bridge` (WASM) |
| Instalação | Exige git e `tsc` no `prepare` | Pacote pronto, sem build |
| Módulos nativos | Não | Não (WASM) |
| Empacotado em Electron | — | **Testado**: conecta e gera QR real; sem `.node` no pacote Windows |

## Decisão
Usar **Baileys** (upstream da LibZapitu, mesma API) atrás de uma interface (`src/main/whatsapp/transport.ts`).
Motivos: a LibZapitu é alpha, tem cadeia de dependência vinda de um repositório pessoal sem revisão (risco de cadeia de suprimentos) e exigiria git/compilação no build. A troca para LibZapitu, se desejada, é isolada em **um arquivo** (`baileysTransport.ts`).

## Armazenamento seguro
A sessão do WhatsApp fica no SQLite cifrada com `safeStorage` (DPAPI no Windows) — não em arquivos soltos. Backups **não** incluem a sessão.
