# Corretor OMR — Sociosofia

Protótipo público do leitor de folhas de respostas por câmera.

## Escopo deste repositório

Este front-end deve conter apenas lógica de captura e leitura visual:

- câmera em HTTPS;
- QR de correção como identificador opaco;
- quatro marcadores de referência;
- alinhamento guiado;
- leitura OMR das oito respostas;
- conferência local da captura.

## Não colocar neste repositório

- nomes ou listas de estudantes;
- gabaritos;
- IDs/segredos de planilhas;
- tokens em massa;
- dados do Avalia;
- credenciais;
- regras sensíveis de backend.

A arquitetura prevista separa:

**GitHub Pages = olhos (câmera/OMR)**  
**Apps Script = regras e validação**  
**Google Sheets = dados**

## Estado atual

`v0.4 — captura guiada`: o usuário alinha os quatro quadrados impressos aos quatro cantos da moldura. A captura automática só é armada quando QR + 4 marcadores + alinhamento ficam estáveis.

Nesta versão nada é enviado ao Google.
