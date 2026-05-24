# Checklist responsiva e WCAG 2.1 AA

Escopo da issue #120: fluxo principal de compra do frontend, sem alterar a identidade visual nem adicionar assets decorativos.

## Viewports obrigatorios

- Mobile: validar a partir de 375 px de largura.
- Desktop: validar a partir de 1024 px de largura.
- Wide desktop: confirmar que o conteudo permanece limitado pelo container principal e legivel.
- Mapa de assentos: confirmar rolagem horizontal no container do mapa sem perda de foco, clique ou teclado.

## Fluxo principal

- Navegacao: links e acoes de conta quebram linha ou rolam horizontalmente sem sobreposicao.
- Home/catalogo: banner, grids, estados de carregamento, vazio e erro permanecem legiveis.
- Detalhe do filme: poster, metadados, sinopse, seletor de datas e sessoes nao estouram o container.
- Mapa de assentos: legenda textual, marcadores de estado, foco nos assentos e container rolavel funcionam em mobile.
- Resumo do pedido: sidebar em desktop; painel empilhado em mobile.
- Tipos de ingresso: cada grupo de radio tem legenda por assento, foco visivel e subtotal legivel.
- Checkout: resumo, grupos de pagamento, erro de envio e botao final permanecem associados semanticamente.
- Confirmacao: lista de ingressos, codigo visual e acoes se adaptam sem overflow.
- Meus ingressos: filtros, lista, estados vazios e erro funcionam em 375 px e desktop.

## Acessibilidade

- Landmarks: header, main e secoes principais presentes; skip link leva ao `main`.
- Titulos: cada pagina tem `h1`; secoes internas usam headings associados por `aria-labelledby` quando aplicavel.
- Teclado: links, botoes, filtros, radios e assentos disponiveis/selecionados sao alcancaveis e operaveis por Tab + Enter/Espaco.
- Foco: estados `:focus-visible` aparecem em botoes, links, cards clicaveis, opcoes de radio e mapa rolavel.
- Formularios: login, cadastro, cupom, tipos de ingresso e pagamento possuem label/legend; erros usam `role="alert"` e `aria-describedby` quando aplicavel.
- Assentos: estados nao dependem so de cor; cada assento tem texto acessivel e marcador visual (`L`, `S`, `R`, `C` ou acessivel).
- Contraste: texto principal, botoes e estados devem preservar contraste compativel com WCAG 2.1 AA.

## Automacao adicionada

- Testes de renderizacao estatica cobrem lista/legenda do mapa de assentos, instrucao de rolagem, labels acessiveis de sessoes, grupos de ingresso e listas de ingressos.
- Nenhuma ferramenta de snapshot visual ou E2E foi introduzida nesta issue; a validacao manual acima continua sendo a referencia para comportamento de viewport.
