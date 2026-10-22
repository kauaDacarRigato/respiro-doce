# Etapa 7 — Vendas e clientes

## Entrega

A tela inicial autenticada agora é Vendas. O menu Clientes está disponível. Caixa e Resumo continuam reservados às próximas etapas.

- Nova venda e edição em painel inferior: receita completa, quantidade inteira, preço unitário livre, pagamento, data/hora e identificação opcional do cliente.
- Preço sugerido preenchido ao selecionar a receita, com edição do preço efetivo da venda.
- Dinheiro e Pix sem taxa. Taxas de débito/crédito configuráveis em Taxas de cartão, de zero a menos de 100%, com até três casas decimais.
- Valores calculados pelo servidor: bruto, produção, taxa, custo total, entrada líquida e lucro do produto.
- Confirmação obrigatória de prejuízo, inclusive para venda gratuita com custo de produção. Os gastos gerais não são confundidos com o lucro do produto.
- Snapshot do custo unitário e de ambas as taxas de cartão na venda. Alterar insumo, receita ou configuração não reescreve os valores antigos.
- Alterar quantidade/preço mantém o custo histórico; alterar pagamento usa as taxas históricas. Trocar produto exige confirmação e usa os custos/taxas atuais.
- Excluir receita preserva o nome do produto e os valores das vendas. Essas vendas continuam editáveis mantendo o produto histórico.
- Data/hora no fuso America/Sao_Paulo, independentemente do fuso do aparelho; aceita lançamentos retroativos. Datas armazenadas em UTC. Filtros de período usam dias de São Paulo e limite final exclusivo.
- Datas entre 2000 e 2099, considerando o relógio de São Paulo. Horários inexistentes durante antigas transições de horário de verão são rejeitados em vez de alterados silenciosamente.
- Venda sem identificação explícita ou nome e telefone obrigatórios. Seleção de cliente existente ou cadastro durante a venda. Telefone com DDD assume Brasil; números internacionais usam + e código de país. A validação confirma formato, não titularidade do número.
- Clientes agrupados pelo telefone normalizado. Nome vem da compra com data mais recente, com desempate pelo UUID da venda. Excluir/retroagir essa compra restaura o nome da anterior.
- Lista paginada de clientes, busca por nome/telefone, quantidade de itens, valor bruto total comprado, última compra e histórico paginado de vendas.
- Exclusão de cliente remove o cadastro e limpa o nome de todas as vendas vinculadas. As vendas passam a ser sem identificação e preservam os valores financeiros. O telefone não é duplicado nas vendas.
- Exclusão de venda com confirmação, recomputando os totais dos clientes a partir das vendas restantes. Cliente sem compras pode permanecer no cadastro.
- Rascunho de venda e de taxas separado por conta. Offline não confirma nem enfileira gravações. Após resposta desconhecida, a repetição usa a mesma operação; os campos ficam bloqueados enquanto a confirmação estiver pendente.

## Banco, precisão e consistência

Projeto confirmado: Respiro Doce, `gogzturzsxayfxakpjcz`.

Novas tabelas `customers` e `sales`, com RLS, referências compostas por dono e índices por data, cliente e receita. Views `sale_catalog` e `customer_catalog` usam security_invoker. O navegador não pode gravar diretamente nas novas tabelas.

Custo unitário em numeric; bruto/produção/taxa calculados no PostgreSQL. Os campos financeiros são retornados como texto decimal e os centavos são formatados com BigInt. Taxa arredondada uma vez sobre o bruto total; produção arredondada após multiplicar quantidade pelo custo exato.

O comando `commerce_command` grava venda/cliente, recibo técnico, revisão e aviso privado na mesma transação. Compartilha a serialização por conta com os comandos dos catálogos. Taxas de cartão também usam esse comando para participar da sincronização.

O servidor recalcula os valores ao salvar e compara a assinatura da prévia revisada. Se preço de insumo ou taxas de uma nova venda mudarem entre prévia e gravação, rejeita a operação e pede recálculo. Não aceita totais enviados pelo navegador. A confirmação de prejuízo é validada novamente no servidor.

Recibos guardam somente dono, UUID da operação, hash da entrada e ID do alvo, sem nome/telefone ou cópia da venda. Repetição após excluir não recria a venda; edição de ID indisponível não faz upsert.

A sincronização existente agora invalida também vendas, clientes, taxas e prévias de venda. Não há saldo incremental para ficar divergente; a fundação financeira fica pronta para as etapas 8 e 9.

Migrações aplicadas e alinhadas com o destino:

- `20261022002458_sales_customers.sql`
- `20261022002629_sale_calculation.sql`
- `20261022002752_commerce_commands.sql`
- `20261022002859_commerce_customer_conflict_constraint.sql`
- `20261022003031_commerce_sale_update.sql`
- `20261022003411_sale_local_date_bounds.sql`

## Verificação

- 48 testes automatizados, incluindo regressões anteriores, normalização de telefone, fuso de São Paulo/virada de dia, centavos, identificação, quantidade inteira, rascunho offline, retomada do mesmo pedido e confirmação de prejuízo.
- TypeScript e lint sem erros; permanecem os nove avisos de Fast Refresh anteriores. Build de produção aprovado, com o aviso já existente do bundle base acima de 500 kB.
- `supabase/tests/sales-contract.sql`: fórmula aprovada (R$ 10,00, produção R$ 3,84, taxa 5,49% → taxa R$ 0,55, lucro R$ 5,61, entrada R$ 9,45), Pix/dinheiro, deduplicação de telefone, nome da compra mais recente, histórico após mudar insumo/taxas, rejeição de prévia antiga, atomicidade, receita excluída, exclusão de dados pessoais, idempotência, edição tardia e isolamento/anon. ROLLBACK ao final.
- `supabase/tests/sales-edge-cases.sql`: troca de produto confirmada, captura das taxas atuais após troca, preservação posterior, débito, frações de centavos, venda gratuita confirmada, limite local de 2099 e horário inexistente em transição de verão. ROLLBACK ao final.
- Navegador contra a API real: configuração de taxas, criação, edição, exclusão, fórmula do cartão, Pix sem taxa, preservação de custos/taxas históricos, seleção de cliente existente, deduplicação, histórico de compras, exclusão dos dados pessoais com valores preservados, confirmação de venda gratuita, filtro por data e rascunho offline.
- Duas telas da mesma conta refletiram as mudanças sem recarregar. Criação observada em 511 ms na segunda tela; resultado medido, não garantia de latência para qualquer conexão.
- Segunda conta sem acesso à venda/prévia da primeira. Nenhum erro de JavaScript no fluxo completo.
- Conferência visual em 1440 × 1000 e 390 × 844 px, sem rolagem horizontal. O ambiente de teste encaminhou chamadas HTTP do navegador à API real, sem respostas fictícias.
- Regressão do isolamento de autenticação aprovada; o teste foi atualizado para usar o comando de taxas, substituindo a permissão direta anterior.
- Identidades e dados temporários exclusivos removidos antes da entrega; nenhum e-mail foi enviado pelos testes.

## Continuidade

Próxima etapa: gastos e categorias. Caixa, relatórios, exportações e homologação completa de sincronização/conflitos continuam nas etapas seguintes. O histórico de compras dos clientes desta etapa corresponde às vendas existentes, sem auditoria de vendas excluídas.

A confirmação de e-mail do cadastro foi validada anteriormente pelo proprietário. Recuperação de senha no domínio definitivo permanece uma validação separada.

O advisor não apontou falhas nas novas tabelas, views ou funções. Permanece o aviso anterior de [proteção contra senhas vazadas desativada](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Os novos índices podem aparecer como ainda não utilizados em uma base sem movimentação; foram mantidos por atenderem às consultas e referências do módulo. [Referência do advisor de índices](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).
