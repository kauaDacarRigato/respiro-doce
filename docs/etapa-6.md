# Etapa 6 — Receitas e precificação

## Entrega

Receitas disponíveis em `/receitas`, na segunda aba de Produtos. Cadastro, edição, busca paginada, composição, memória de cálculo e exclusão com confirmação. O formulário usa o painel inferior existente, com rascunho separado do cadastro de insumos.

- Nome único por conta, normalizando caixa e espaços repetidos.
- Até 200 ingredientes/embalagens por receita, com quantidade e unidade usadas por lote. Cada material aparece uma única vez.
- Conversão kg/g e L/mL. Volume para massa somente com densidade; unidade para massa somente com peso comestível informado. Sem presumir 1 mL = 1 g.
- Embalagens em unidades inteiras, incluídas no custo e excluídas do peso alimentício.
- Rendimento inteiro positivo ou ausente enquanto a receita estiver incompleta.
- Indiretos de 25% por padrão, editáveis, incidentes sobre ingredientes + embalagens. Multiplicador fixo em 3.
- Taxa da sugestão editável, de zero a menos de 100%. Dinheiro/Pix e as taxas efetivas da venda serão tratados na etapa 7.
- Peso/volume final após preparo informado separadamente da soma dos ingredientes. Sem composição alimentícia, rendimento ou quantidade final, o preço fica indisponível com explicação; não aparece um zero que sugira receita válida.
- Porção e medida caseira opcionais, preparadas para a futura etapa nutricional. Nenhuma tabela nutricional é emitida nesta etapa.
- Custo do lote, custo unitário, sugestão, taxa, custo com taxa e lucro estimados. A memória de cálculo mostra a precisão do custo usada na fórmula.
- Alterar preço/quantidade da embalagem de compra recalcula as receitas relacionadas com os valores atuais.
- Bloqueio da exclusão e da alteração de tipo/unidade/equivalências de insumo em uso, informando até cinco receitas relacionadas. Nome, preço e dados nutricionais continuam editáveis.
- Exclusão da receita remove sua composição e mantém os materiais. Uma criação repetida após a exclusão não recria a receita.
- Sem confirmação de salvamento offline. Respostas desconhecidas preservam a chave do pedido e bloqueiam alterações até a confirmação ou rejeição definitiva. O rascunho pode ser retomado após fechar a tela.

## Cálculo e persistência

O navegador pede uma prévia ao servidor, com atraso curto após a digitação. A lista também calcula no servidor, usando os preços atuais dos materiais. Não persistimos um preço derivado que ficaria desatualizado ao editar o insumo.

Valores fracionários são calculados em `numeric` no PostgreSQL. As respostas financeiras são textos decimais; centavos finais são formatados com BigInt no navegador. A conversão para Number é utilizada somente na apresentação de custos intermediários, não na persistência ou no cálculo financeiro.

Fórmula: `(subtotal direto × (1 + indiretos/100) / rendimento × 3) / (1 − taxa/100)`. Arredondamento comum para centavos no preço final. Custo unitário exato R$ 3,84 e taxa 5,49% produzem sugestão R$ 12,19, taxa estimada R$ 0,67 e lucro estimado R$ 7,68.

Migrações aplicadas ao projeto confirmado Respiro Doce, `gogzturzsxayfxakpjcz`:

- `20261021225340_recipes_pricing.sql`
- `20261021230107_recipe_integer_yield_input.sql`

Novas tabelas `recipes` e `recipe_materials`, protegidas por RLS e referências compostas por dono. A view `recipe_catalog` usa security_invoker. A prévia verifica a propriedade de cada material. O cliente possui somente leitura direta; o comando autenticado substitui receita/composição, grava recibo e revisão e publica aviso privado na mesma transação. Escritas da conta compartilham o bloqueio transacional já usado nos insumos.

A migração complementar aceita um rendimento inteiro representado por `5` ou `5.0`, mantendo a rejeição de rendimento fracionado. Não altera registros existentes.

## Verificação

- 40 testes automatizados aprovados, incluindo regressões de autenticação e materiais, validação de receitas, restrições de conversão, centavos grandes, rascunho offline e retomada do mesmo pedido após resposta desconhecida.
- TypeScript sem erros. Lint sem erros, com avisos de Fast Refresh. Build de produção aprovado; permanece o aviso do bundle base acima de 500 kB.
- `supabase/tests/recipes-isolation.sql`: fórmula aprovada, nomes normalizados, falta de rendimento/quantidade final, composição inválida sem alteração parcial, propriedade dos materiais, bloqueio de escrita direta, dependências, recálculo após alteração do insumo, repetição de pedidos e não recriação de excluídos. Papéis authenticated e anon exercitados; ROLLBACK ao final.
- Regressão do script de materiais da etapa 5 aprovada após a inclusão das proteções de dependências.
- `supabase/tests/recipe-conversions.sql`: kg/g, L/mL, densidade explícita, unidade/peso comestível, custo de embalagem sem peso, fração de centavo e bloqueio de conversão sem equivalência. ROLLBACK ao final.
- Navegador com API real: criar receita, incluir ingredientes/embalagens, conferir R$ 12,19, impedir duplicação de nome, bloquear exclusão de insumo usado, alterar seu preço e recalcular a receita, buscar, preservar/retomar rascunho offline, salvar incompleta e excluir receitas.
- Duas janelas da mesma conta: criação e exclusão refletidas sem recarregar; alteração de insumo refletida no preço da receita da segunda janela. Medições observadas: criação em 2.028 ms e recálculo após edição do insumo em 1.718 ms. Não são garantia de latência em qualquer conexão.
- Edição de receita no navegador: rendimento de 5 para 10 unidades recalculou o preço de R$ 12,19 para R$ 6,09 e atualizou a segunda janela.
- Segunda conta sem leitura das receitas e sem acesso a material da primeira na prévia/composição.
- Conferência visual em 390 × 844 e 1440 × 1000 px, sem rolagem horizontal. Chamadas HTTP do navegador encaminhadas à API real devido à restrição de rede do ambiente, sem respostas fictícias.
- Testes com identidades temporárias exclusivas, sem envio de e-mail. Limpeza dos dados e identidades de teste antes da entrega.

## Limites e continuidade

Vendas, clientes e custos históricos pertencem à etapa 7; esta etapa calcula receitas com valores atuais. O lucro exibido é uma estimativa do produto, não o lucro líquido do negócio. A validação completa de conflitos e sincronização entre todos os módulos permanece na etapa 10.

Confirmação de e-mail do cadastro validada pelo proprietário anteriormente. Recuperação de senha e redirecionamento no domínio definitivo ainda aguardam validação separada.

Advisors: nenhuma indicação de segurança nas novas tabelas/view/permissões e nenhum alerta de performance. Permanece a configuração anterior do Auth: [proteção contra senhas vazadas desativada](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Essa configuração não foi alterada.
