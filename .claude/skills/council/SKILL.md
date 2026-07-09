---
name: council
description: "Conselho de decisão. Quando você vai bater o martelo numa decisão e o Claude só concorda com o lado que você empurra, rode o conselho. Triggers: '/council', 'chama o conselho'."
---

# Council — o conselho que mata o puxa-saquismo do Claude

Quando houver uma decisão real (mais de um caminho), execute:

1. Capte a decisão em uma frase + o contexto. Não opine ainda.

2. Spawne os 5 conselheiros EM PARALELO (um agente por lente), cada um
   instruído a NÃO ser diplomático:
   - O Contrário — rasga a ideia, acha os 3 furos que vão matá-la. Proibido elogiar.
   - Primeiros Princípios — ignora a pergunta, reformula o que você TENTA resolver
     de verdade e diz se a decisão é a alavanca certa.
   - O Expansionista — caça o ganho 10x que você não está vendo.
   - O Forasteiro — recebe só a decisão em 1 frase, sem contexto; aponta o óbvio
     que você parou de notar de tão dentro.
   - O Executor — só liga pro que muda amanhã de manhã: menor passo testável,
     custo de errar.

3. Revisão entre pares: cruze as 5 saídas, marque o que sobrevive e as divergências
   reais (não invente concordância).

4. O Presidente fecha em formato fixo e curto:
   ⚖️ VEREDITO: <uma frase>
   POR QUÊ: <3 pontos que sobreviveram>
   ⚠️ O QUE PODE MATAR: <o risco mais letal, do Contrário>
   ▶️ PRÓXIMO PASSO: <uma ação única e testável pra amanhã de manhã>

Uma decisão. Um passo. Sem "depende", sem cinco caminhos abertos.