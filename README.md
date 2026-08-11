# Corretor OMR — Sociosofia

Protótipo público do leitor de folhas de respostas por câmera.

## Escopo deste repositório

Este front-end contém apenas lógica de captura e leitura visual:

- câmera em HTTPS;
- QR de correção como identificador opaco e, quando possível, âncora geométrica;
- marcadores de referência como validação/fallback;
- alinhamento guiado com tolerância humana;
- correção projetiva da perspectiva;
- leitura OMR das respostas;
- conferência humana antes do envio;
- ponte local configurável para o Apps Script.

## Não colocar neste repositório

- nomes ou listas de estudantes;
- gabaritos;
- IDs/segredos de planilhas;
- tokens em massa;
- dados do Avalia;
- credenciais;
- regras sensíveis de backend.

A arquitetura separa:

**GitHub Pages = olhos (câmera/OMR)**  
**Apps Script = regras e validação**  
**Google Sheets = dados**

## Estado atual

`v0.11 — QR como âncora`: para o modelo OMR-08-v1, os quatro cantos detectados do QR podem definir a homografia da folha inteira. Os quatro finders impressos permanecem como referência visual e fallback. O modo diagnóstico congela exatamente o quadro capturado e sobrepõe os pontos usados na leitura das bolhas.
