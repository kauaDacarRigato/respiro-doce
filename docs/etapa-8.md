# Etapa 8 — Gastos e categorias

## Entrega

Área de gastos em `/gastos`, acessível pelo menu Caixa. A aba Gastos está ativa; o saldo e as movimentações completas do Caixa pertencem à etapa 9.

- Criar, editar e excluir gastos, com descrição, valor pago, data/hora e categoria opcional.
- Valores em centavos inteiros, maiores que zero. Limite por lançamento: R$ 1 bilhão. Zero, negativos, frações de centavo e valores acima do limite são rejeitados.
- Data/hora no relógio de São Paulo, inclusive retroativos, persistida em UTC. Mesmos limites de 2000–2099 da etapa anterior, com rejeição de horários inexistentes em antigas transições de horário de verão.
- Filtros por descrição, período e categoria, incluindo a opção Sem categoria. Busca textual literal, sem interpretar % ou _ como curingas.
- Paginação de 20 gastos e total calculado no servidor sobre todos os registros do filtro, não apenas os da página visível. Lista e totais vêm do mesmo retrato de consulta.
- Gerenciador de categorias: criar, buscar, renomear e excluir, com paginação de 30 registros. Nome único por conta, normalizando caixa e espaços repetidos.
- As oito categorias iniciais existentes foram preservadas. Categorias apagadas não são recriadas ao entrar novamente na conta.
- Excluir categoria mantém os gastos, valores e datas. Os lançamentos associados passam a Sem categoria. Renomear categoria atualiza seu nome nos gastos relacionados.
- Ao excluir localmente a categoria usada no filtro, a lista muda para Sem categoria, mostrando os lançamentos preservados.
- Exclusões com confirmação. Excluir gasto retira seu valor dos totais consultados; não mantém um saldo incremental suscetível a divergir.
- Rascunhos separados por conta e tipo de formulário. Sem conexão, a interface preserva a digitação sem confirmar nem enfileirar gravações.
- Após resposta desconhecida, campos ficam bloqueados e a repetição usa a mesma chave/dados. Rascunhos permitem retomar a tentativa depois de fechar a tela; rejeição definitiva libera a correção.
- Aviso no formulário: taxas do pagamento já estão nas vendas, evitando um segundo lançamento. O custo de uma receita não gera gasto automático; a tela registra saídas efetivamente pagas.

## Banco e consistência

Projeto confirmado: Respiro Doce, `gogzturzsxayfxakpjcz`.

Migrações aplicadas e alinhadas com o destino:

- `20261022201358_expenses_categories.sql`
- `20261022201444_expense_commands.sql`

Tabela `expenses`, com RLS de leitura por dono, FK composta para categoria e índices por data/categoria. Clientes autenticados não possuem escrita direta na nova tabela nem nas categorias. A view `expense_catalog` e a função de lista `expense_list` usam security_invoker.

`expense_command` valida a identidade e todas as referências, serializa escritas da conta junto aos comandos anteriores e grava lançamento/categoria, recibo técnico, revisão e aviso privado em uma transação. UUIDs excluídos não são recuperados por upsert; criação repetida depois da exclusão retorna indisponibilidade. O recibo não guarda cópia do gasto, apenas os identificadores e hash da entrada.

A exclusão da categoria usa SET NULL somente no vínculo category_id, preservando o dono e todos os dados financeiros do gasto. O total é uma soma em numeric no servidor e chega como texto decimal; a interface formata centavos com BigInt.

A sincronização existente passou a reconciliar também gastos, totais e categorias. Sem filas de reenvio automático. As atualizações seguem a última operação concluída no servidor.

## Verificação

- 56 testes automatizados aprovados, incluindo as regressões anteriores, centavos exatos, valores inválidos, data de São Paulo, rascunhos por entidade, confirmação de salvamento, edição de categoria rejeitada e retomada da mesma operação após resposta desconhecida.
- TypeScript sem erros, lint sem erros com os nove avisos de Fast Refresh já existentes. Build de produção aprovado, com o aviso anterior de tamanho do bundle base.
- `supabase/tests/expenses-contract.sql`: papéis authenticated e anon; isolamento de linhas/totais; bloqueio de escrita direta; categorias únicas; valores inválidos; categorias de outra conta/inexistentes; atomicidade/revisão; paginação e total de 21 lançamentos; busca literal; filtros por data/categoria; virada de dia em São Paulo; horário inexistente; renomeação; exclusão sem perda do gasto; bootstrap sem restauração; repetição de pedidos e não recriação de IDs excluídos. ROLLBACK ao final.
- Navegador com API real: criar/renomear/excluir categoria, bloquear nome repetido, criar/editar/excluir gastos, conferir totais, filtrar por descrição/data/categoria, bloquear valor zero e recuperar rascunho offline.
- Exclusão da categoria preservou os dois gastos, seus valores e o total de R$ 160,25. A segunda tela recebeu a mudança de categoria sem recarregar.
- Criação refletida na segunda tela em 1.523 ms. É uma medição observada, não garantia de latência para qualquer conexão.
- Segunda conta sem leitura dos gastos/totais da primeira e sem permissão para excluir seu lançamento pela API.
- Conferência em 1440 × 1000 e 390 × 844 px, sem rolagem horizontal ou erros de JavaScript. Chamadas HTTP do navegador encaminhadas à API real devido às restrições do ambiente, sem respostas fictícias.
- Identidades e dados temporários exclusivos removidos antes da entrega; nenhum e-mail foi enviado pelos testes.

## Continuidade

A próxima etapa implementa saldo inicial, entradas líquidas das vendas, saídas dos gastos e resumos. Este módulo não apresenta o lucro do produto como saldo de caixa e não duplica o custo de receita como pagamento.

A homologação completa de sincronização e conflitos entre todos os módulos permanece na etapa 10. Recuperação de senha no domínio definitivo continua uma validação separada da confirmação de e-mail já feita pelo proprietário.

Nenhuma indicação nova de falha nas tabelas, views ou permissões desta etapa. Permanece o aviso anterior de [proteção contra senhas vazadas desativada](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). O advisor de performance indicou apenas um índice de vendas ainda sem uso registrado; foi mantido por atender às consultas da etapa seguinte. [Referência do advisor de índices](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).
