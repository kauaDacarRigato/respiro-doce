# Etapa 9 — Caixa e resumos financeiros

## Entrega

Menu Caixa em `/caixa`, com abas Caixa e Gastos (`/gastos`). Menu Resumo em `/resumo`.

- Caixa derivado dos lançamentos: saldo inicial datado + vendas menos taxas − gastos pagos. O custo de produção não é descontado novamente do caixa.
- Saldo até agora considera todo o histórico até o instante da consulta. Saldo final do período inclui os lançamentos anteriores ao fim do período, inclusive futuros quando o filtro os abrange.
- Cartões de saldo anterior, vendas líquidas, gastos e saldo final; equação explicita o saldo inicial ocorrido dentro do período.
- Filtros por datas, tipo e categoria, com paginação de 20 registros. Tipo/categoria filtram somente a lista. Cartões mantêm o período completo e o saldo de cada linha inclui também as movimentações ocultas pelos filtros e o histórico anterior.
- Ordem determinística por instante, tipo e UUID. No mesmo instante, saldo inicial vem antes de vendas, e vendas antes de gastos. Exibição do mais recente para o mais antigo.
- Saldo inicial permite valor negativo ou zero, data/hora de São Paulo e confirmação explícita. É uma base aditiva única; alterá-la substitui a base anterior e recalcula os saldos, sem zerar ou descartar lançamentos anteriores. Zero retira a linha de saldo inicial.
- Rascunho do saldo inicial separado por conta. Offline preserva a digitação, sem confirmar nem enfileirar gravação. Após resposta desconhecida, repetição mantém UUID e dados; rejeição definitiva libera correção.
- Resumos por dia, mês e ano, com vendas brutas, produção vendida, taxas, lucro dos produtos, vendas líquidas, gastos, fluxo de caixa, quantidade de vendas e unidades.
- Lucro dos produtos = bruto − produção − taxas. Não é apresentado como lucro líquido do negócio. Fluxo de caixa = vendas líquidas − gastos, sem incluir saldo inicial.
- Gráfico de lucro, vendas brutas ou fluxo de caixa, com intervalos sem movimento preenchidos com zero. Horas no dia, dias no mês e meses no ano. Prejuízos em vermelho; tabela acessível com os valores exatos.
- Resultado por produto com paginação, valores históricos e ordenação por vendas brutas. Receita apagada não elimina o produto do relatório; o nome é o último registrado nas vendas daquele período. Gastos não são distribuídos arbitrariamente pelos produtos.

## Banco e consistência

Projeto Respiro Doce: `gogzturzsxayfxakpjcz`. Migrações aplicadas:

- `20261022203248_cash_ledger.sql`
- `20261022203249_financial_reports.sql`
- `20261022203314_opening_balance_command.sql`

View `cash_entries` com security_invoker sobre as tabelas existentes e RLS por dono. Funções públicas de leitura também usam security_invoker, autenticação obrigatória, search_path fixo e execução restrita. Cada consulta entrega lista e totais no mesmo retrato do banco.

`cash_list` calcula a soma acumulada antes de aplicar filtros e paginação. `financial_report` usa os valores salvos nas vendas; alteração de ingredientes, receitas ou taxas atuais não reescreve o passado. Cálculos em numeric no servidor, centavos transmitidos como texto e formatação exata com BigInt no cliente. Number só é usado para a altura visual das barras, após normalização inteira.

`opening_balance_command` valida confirmação, centavos inteiros entre −100 bilhões e +100 bilhões, data válida e identidade. Atualização, recibo de idempotência, revisão e aviso privado ocorrem na mesma transação. Replicar um comando antigo não sobrescreve uma base salva posteriormente. Escrita direta nas colunas de saldo inicial foi revogada.

A sincronização existente reconcilia também caixa, relatórios e saldo inicial ao mudar a revisão da conta. A homologação completa de reconexão e conflitos entre todos os módulos pertence à etapa 10.

## Verificação

- 64 testes automatizados aprovados: regressões anteriores, valores negativos/exatos, limites, confirmação obrigatória, rascunho offline, retomada idêntica após resposta desconhecida, correção após rejeição definitiva e alturas com valores acima da precisão de Number.
- `supabase/tests/finance-contract.sql` executado no projeto real e revertido com ROLLBACK: conciliação; filtros sem perder histórico; virada de dia em São Paulo; horários/dias/meses sem movimento; fevereiro bissexto; produtos históricos após mudança de custo e exclusão de receita; edição/exclusão; saldo inicial único, negativo e zero; repetição antiga sem sobrescrita; paginação de 21 gastos no mesmo instante; bloqueio de escrita direta; isolamento por conta e restrição anônima.
- Navegador em 1440 × 1000 e 390 × 844 px: caixa e saldo por linha, filtro por tipo, confirmação do saldo inicial, rascunho offline, resumos por dia/mês/ano, estado vazio, troca de indicador e tabela do gráfico. Sem rolagem horizontal da página nem erros de JavaScript. Respostas capturadas das funções reais do banco; rede e sessão simuladas exclusivamente no teste visual.
- Limitação: as tentativas de autenticação HTTP no ambiente excederam os limites de 20, 25 e 55 segundos. Não foi possível concluir o teste integrado com sessão e sincronização reais nesta etapa. Os contratos SQL foram executados no Supabase real, incluindo permissões e atualização de revisões; isso não substitui a validação da rede entre dispositivos, a concluir na etapa 10.
- Contas e registros exclusivos dos testes foram removidos antes da publicação; nenhum dado da conta do proprietário foi alterado e nenhum e-mail de teste foi enviado.
- TypeScript sem erros, lint sem erros com os nove avisos anteriores de Fast Refresh. Build de produção aprovado com o aviso anterior sobre tamanho do bundle base.

## Continuidade

Próxima etapa: homologação completa de sincronização, reconexão e conflitos (10). Nutrição/exportações/backups ficam na etapa 11 e aceite geral na etapa 12. Recuperação de senha no domínio definitivo continua uma validação separada da confirmação de e-mail já realizada pelo proprietário.

Advisors sem novas falhas de tabelas/permissões. Permanecem os avisos anteriores de [proteção contra senhas vazadas desativada](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) e [índice de vendas ainda sem uso registrado](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index). O índice foi mantido por atender às consultas de vendas.
