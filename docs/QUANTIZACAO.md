# Modelo Q4_0 do Bonsai 2 9B

Verificado em 21/11/2026: o repositório oficial (`prism-ml/Ternary-Bonsai-2-9B-gguf`) só publica Q2_0, PQ2_0, PTQ1_0 (e variantes MTP/DFlash); nenhum Q4_0. Os demais repositórios (mradermacher etc.) só têm TQ1_0/TQ2_0.

Como o app já suporta níveis de modelo, para ativar o Q4_0:
1. Obter os pesos bf16 (`prism-ml` / `jonathan-kellerai/Ternary-Bonsai-2-9B-hf-bf16`) e converter com `convert_hf_to_gguf.py` (llama.cpp ≥ b11556), depois `llama-quantize … Q4_0`. Cerca de 20 GB de disco temporário.
2. Hospedar o `.gguf` (~5 GB; arquivos desse tamanho não cabem em release do GitHub: use Hugging Face) e calcular o `sha256`.
3. Preencher `url`, `sha256`, `size` e `available: true` em `AI_ASSETS.models.q4_0` (`src/shared/ai.ts`).

Observação: como o Bonsai é treinado com pesos ternários, o Q4_0 ocupa o dobro do Q2_0 e tende a trazer pouco ganho de qualidade; vale medir no teste do app antes de adotar como padrão.

## Resultado da geração (21/11/2026)
Gerado com `llama-quantize --allow-requantize` (llama.cpp b12623) a partir do **Q2_0 oficial** da PrismML. Os pesos bf16 da comunidade (`jonathan-kellerai/...-hf-bf16`) são apenas o mesmo pacote de 2 bits dequantizado, então não trazem informação extra. Arquivo local: `models/Ternary-Bonsai-2-9B-Q4_0.gguf`, 5.313.428.352 bytes, SHA-256 `5b1fab6465282c701b4fe00ede2c19d7c6926826d3bb2543b38bc5b86f0e525f`.

Medições no Mac (Apple Silicon, Metal):

| | Q2_0 | Q4_0 |
|---|---|---|
| Tamanho | 2,37 GiB | 4,94 GiB |
| Geração (tokens/s) | 30,1 | 17,9 |
| Leitura do prompt (tokens/s) | 164 | 165 |
| Perplexidade (texto pt-BR curto, 12 blocos) | 19,13 ± 2,2 | 20,61 ± 2,4 |

Conclusão: o Q4_0 é 2,1× maior, ~40% mais lento e **não melhora a qualidade** (a diferença está dentro do ruído, a favor do Q2_0). Recomendação: manter o Q2_0 como padrão; ativar o Q4_0 só se testes no Windows mostrarem ganho real. Para ativar: hospedar o arquivo e preencher `AI_ASSETS.models.q4_0`.
