# Sociosofia OMR — arquitetura de impressão e leitura v2

Status: especificação de projeto para as próximas avaliações. Não altera nem invalida `OMR-08-v1` já impresso.

## 1. Princípio

A folha de respostas passa a ser tratada como um **formulário óptico versionado**, e não como um bloco visual livre da prova.

Conteúdo, tipografia e paginação da avaliação podem continuar editáveis. A geometria interna do OMR não.

A leitura sempre parte do plano definido pelos fiduciais impressos. QR, bolhas e textos são posicionados em coordenadas relativas a esse plano.

## 2. Separação de responsabilidades

- **QR de correção:** identidade da folha, aluno, aplicação/modelo por consulta ao backend. Não deve ser a única referência geométrica.
- **4 fiduciais de canto:** referência geométrica primária; determinam a homografia do plano OMR.
- **2 fiduciais auxiliares:** validação de deformação e recuperação em caso de um canto ruim; sugeridos no meio das laterais esquerda e direita.
- **Grade de respostas:** posições fixas e conhecidas pelo `modelo_omr`.
- **Quantidade de questões:** vem do backend. Se o modelo suporta 10 linhas e a prova tem 8 questões, Q9 e Q10 simplesmente não são amostradas.

## 3. Fiduciais v2

Trocar o quadrado muito vazado por um desenho de alto contraste e maior área útil, por exemplo:

- quadrado externo preto;
- centro branco menor;
- tamanho físico fixo;
- margem branca ao redor;
- nenhuma linha, texto ou bolha muito próxima.

Objetivo: sobreviver melhor a ambientes claros, sombras, compressão de câmera, cópia e scanner.

Os quatro cantos continuam semanticamente distintos pela posição. Os dois fiduciais auxiliares não substituem os cantos: servem para conferir se a projeção calculada realmente passa onde deveria.

## 4. Modelo físico sugerido

Novo modelo: `OMR-10-v2`.

- até 10 questões;
- alternativas A–E;
- mesma ordem física de colunas para qualquer prova;
- distâncias entre linhas e colunas invariáveis;
- QR em posição fixa no plano OMR;
- fiduciais em posição fixa no plano OMR;
- área inteira do OMR com largura e altura físicas congeladas no CSS de impressão.

A quantidade real de questões é metadado da aplicação, não propriedade visual da grade.

## 5. Coordenadas

O leitor não deve depender de pixels absolutos da página A4. Cada centro de bolha é armazenado como `(u,v)` no retângulo canônico delimitado pelos quatro fiduciais:

- `u = 0` no fiducial esquerdo e `u = 1` no direito;
- `v = 0` no fiducial superior e `v = 1` no inferior.

Assim, escala de impressão, câmera inclinada e digitalização são resolvidas pela transformação projetiva antes da classificação das bolhas.

## 6. Fluxo de leitura

### PDF / scanner

1. localizar QR e obter token;
2. localizar os 4 fiduciais físicos;
3. validar geometria com QR + fiduciais auxiliares;
4. calcular homografia;
5. amostrar somente as questões `1..qtd_questoes`;
6. classificar bolhas;
7. pronta automática somente com geometria física validada;
8. QR sem quatro fiduciais pode produzir leitura para revisão, nunca envio automático.

### Câmera

1. usar QR + fiduciais para orientar o enquadramento;
2. capturar micro-rajada;
3. calcular a geometria separadamente por frame;
4. agregar os escores das bolhas entre os melhores frames;
5. separar segurança de leitura e conteúdo da resposta.

## 7. Regra de segurança

O corretor deve ser **cego ao gabarito durante a leitura OMR**.

O gabarito pode ser usado depois para calcular desempenho e, em laboratório, para diagnosticar viés sistemático do leitor. Nunca deve ser usado para escolher entre duas alternativas detectadas.

## 8. Impressão

A área OMR deve possuir CSS de produção próprio:

- dimensões em `mm`;
- `transform: none` na impressão;
- escala 100%;
- nenhuma edição visual capaz de mover individualmente bolhas, QR ou fiduciais;
- alerta quando o navegador/impressora aplicar “ajustar à página” ou escala diferente, quando for tecnicamente detectável;
- teste de régua/calibração no protótipo antes de congelar o modelo.

O editor visual pode mover o **bloco OMR inteiro** na página, mas não modificar sua geometria interna.

## 9. Embaralhamento futuro

Embaralhar questões e alternativas não deve alterar a grade física. A folha continua A–E e Q1–Q10.

O backend guarda, por token/modelo de prova, o mapa lógico:

`posição impressa -> questão original -> alternativa original`

Itens com dependências devem declarar restrições antes do embaralhamento, por exemplo:

- texto-base vinculado a um conjunto de questões;
- “nenhuma das anteriores”;
- “todas as anteriores”;
- referências como “no texto acima”, “na questão anterior” ou equivalentes.

## 10. Compatibilidade

- `OMR-08-v1`: permanece congelado para as provas já produzidas e para auditoria histórica.
- `OMR-10-v2`: será criado e calibrado com nova folha de impressão.
- O backend informa `modelo_omr` e `qtd_questoes`; o corretor escolhe o modelo correto sem inferência visual improvisada.

## 11. Critério de aceitação antes de produção

Antes de usar `OMR-10-v2` em uma aplicação real, testar uma amostra com:

- caneta azul e preta;
- preenchimento forte e moderado;
- folha perfeitamente plana e levemente inclinada;
- câmera em luz clara e baixa;
- scanner a 0° e 180°;
- PDF com várias turmas misturadas;
- marca dupla, rasura e questão realmente em branco;
- pelo menos uma marca em cada coluna A–E e em cada linha do modelo.

A aprovação não deve considerar apenas a taxa total de acerto: deve verificar erro por **coluna**, **linha**, **origem (câmera/PDF)** e **tipo de marcação**.
