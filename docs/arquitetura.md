# Arquitetura do Precificador e Caixa — Respiro Doce

Status: desenho técnico das etapas 1 a 3. Não representa banco implantado, segurança validada ou funcionalidades implementadas.
Data: 21/10/2026.

## 1. Escopo e base existente

Manter a base Lovable existente: React 19, TypeScript, TanStack Start/Router/Query, Vite, Tailwind e componentes Radix.
Não substituir o projeto por um aplicativo paralelo. Respeitar AGENTS.md e não reescrever histórico publicado.
Backend escolhido para implementação: PostgreSQL com Supabase Auth e Realtime.
O projeto Supabase de destino ainda precisa ser identificado e sua vinculação ao Lovable verificada; não criar ou modificar um banco com base em suposição.

Sem estoque, equipe/perfis de acesso, OCR de rótulos ou histórico de auditoria de exclusões nesta versão.
Cada conta possui seu próprio conjunto de dados. Usar a mesma conta em aparelhos diferentes.

## 2. Regras aprovadas

- Preço sugerido = custo de produção por unidade × 3 / (1 − percentual da receita / 100).
- Indiretos: 25% como padrão editável por receita; multiplicador 3 fixo.
- Proposta técnica de base de cálculo dos indiretos: subtotal direto de ingredientes e embalagens × percentual; manter explícito na tela e nos testes.
- Arredondamento comum para centavos. Custo exato R$ 3,84 e taxa 5,49% produzem preço R$ 12,19, substituindo o exemplo original R$ 12,20.
- Um preço sugerido por produto, independentemente do pagamento; preço efetivo editável por venda.
- Dinheiro e Pix: taxa zero. Débito e crédito: percentuais configuráveis do negócio.
- Taxa efetiva sobre o total bruto efetivamente vendido. Não criar gasto separado para ela.
- Guardar valores históricos e todos os percentuais de pagamento vigentes na criação da venda.
- Alterar quantidade/preço preserva custo de produção histórico. Alterar pagamento usa os percentuais guardados na venda. Alterar produto exige aviso e um novo retrato dos custos e percentuais atuais.
- Lucro dos produtos = vendido − produção dos itens vendidos − taxa; gastos gerais separados.
- Caixa = saldo inicial + vendas líquidas − gastos manuais. Custo de receita não é outra saída.
- Saldo inicial padrão zero; ajuste datado não conta como venda/lucro.
- Quantidades vendidas e rendimento: inteiros positivos. Preços/custos não negativos; percentuais de taxa de 0 até menos de 100. Venda gratuita permitida, com confirmação do prejuízo quando houver.
- Ingredientes: g, kg, mL, L ou unidade; embalagens: unidade, com quantidade por pacote.
- Converter kg/g e L/mL. Conversão de massa/volume exige densidade; unidade/massa ou volume exige equivalência informada.
- Peso/volume final após preparo separado da soma bruta dos ingredientes.
- Nutrição ausente é desconhecida; zero preenchido é valor confirmado. Embalagens não entram em peso alimentício/nutrição.
- Cliente identificado exige nome e telefone; alternativa explícita permite venda sem identificação.
- Telefone normalizado identifica cliente; nome associado à compra mais recente, desempate por identificador estável.
- Brasil como país padrão do telefone, preservando código do país de números internacionais.
- Data/hora atual editável, incluindo lançamento retroativo. Persistir instantes em UTC e agrupar usando America/Sao_Paulo.
- Offline: rascunhos locais, sem confirmar venda salva e sem fila automática de reenvio.

## 3. Organização da aplicação

Separar componentes visuais, regras do domínio, acesso ao backend e contratos/validação.
Organização sugerida, adaptada às convenções reais do repositório na implementação:

- src/features/auth: acesso e recuperação de senha;
- src/features/products: ingredientes, embalagens e receitas;
- src/features/sales: vendas e seus formulários;
- src/features/customers: clientes e exportação;
- src/features/expenses: gastos e categorias;
- src/features/cash: movimentações e saldo;
- src/features/reports: dia, mês, ano e produtos;
- src/features/nutrition: validação, cálculo e geração PNG;
- src/lib/domain: funções puras de dinheiro, unidades, telefones e períodos;
- src/lib/data: cliente, consultas, comandos e sincronização;
- supabase/migrations: esquema versionado após validação local;
- docs: decisões, contratos e procedimentos.

Zod valida entradas para feedback imediato; o banco repete as restrições essenciais.
Os cálculos persistidos são autoritativos no servidor, sem confiar em totais enviados pelo navegador.

## 4. Modelo lógico

Todos os dados de negócio carregam owner_id, identificador UUID e datas de criação/alteração.
owner_id vem da identidade autenticada e não de um campo livre do cliente.
Tabelas com relações possuem unicidade (owner_id, id) para referências compostas e impedimento de vínculo entre contas.

| Entidade | Principais campos e restrições |
|---|---|
| business_settings | owner_id único; taxas de débito/crédito; saldo inicial em centavos e instante inicial; moeda BRL; fuso America/Sao_Paulo |
| materials | nome, nome normalizado, tipo ingrediente/embalagem, quantidade da embalagem, unidade, preço em centavos, equivalências opcionais; nome único por dono |
| material_nutrition | material_id único; base 100 g ou 100 mL; energia e nutrientes em numeric; origem dos dados; nulo permitido; relação exclusiva com ingrediente |
| recipes | nome normalizado único por dono; rendimento; indiretos; taxa sugerida; quantidade e unidade finais; porção e medida caseira; metadados da embalagem necessários para nutrição |
| recipe_materials | recipe_id, material_id, quantidade e unidade usadas; uma linha por material na receita |
| customers | nome de exibição e telefone normalizado único por dono; sem totais financeiros persistidos |
| sales | recipe_id anulável; customer_id anulável; nome/identificador histórico não pessoal do produto; quantidade; preço unitário em centavos; custo unitário de produção exato; método; taxas históricas; bruto, produção e taxa totais; instante da venda |
| expense_categories | nome normalizado único por dono; categorias iniciais do briefing, sem categoria de taxa de maquininha |
| expenses | descrição; valor positivo em centavos; categoria anulável; instante do gasto |
| account_sync_state | owner_id único e revisão monotônica para reconciliar mudanças entre aparelhos |
| command_receipts (esquema privado) | chave de operação por dono, resumo criptográfico da entrada e identificador opaco do resultado; deduplicação técnica sem nome/telefone, cópia de registro apagado ou histórico consultável de exclusões |

A modelagem física deve ser criada e exercitada em banco isolado antes de aplicação no destino.
O campo de rendimento pode ficar ausente enquanto a receita está incompleta; uma receita inválida não pode ser vendida.
Material é cadastro único sem marca. A referência nutricional registra qual composição foi usada e deve ser revisada se o produto utilizado mudar.
Sem fotos, arquivos de nutrição ou PNGs armazenados no banco.

### Relações e exclusões

- Receita -> composição: excluir composição junto da receita.
- Receita -> vendas: remover vínculo mantendo os campos históricos e os resultados financeiros.
- Material -> composição: RESTRICT; explicar quais receitas impedem a exclusão.
- Categoria -> gastos: manter gastos, removendo vínculo com categoria.
- Cliente -> vendas: desvincular e remover seus dados pessoais. Não manter nome/telefone ocultos em cópias históricas ou registros de deduplicação.
- Venda -> nenhuma tabela de saldo persistido: excluir a venda remove sua participação em todos os totais.
- Identidade excluída: tratar descarte de dados da conta em operação própria; fora da interface inicial.

Alterar unidade/base de um material usado exige converter explicitamente as quantidades dependentes na mesma operação ou bloquear a troca com explicação. Nunca reinterpretar quantidades silenciosamente.

O nome de cada venda identificada precisa permitir reconstruir o nome da compra mais recente após edição/exclusão. Implementação poderá usar nome informado por venda enquanto vinculada ao cliente; excluir o cliente deve limpar esses nomes em todas as vendas. Não guardar telefone duplicado na venda.

## 5. Dinheiro e arredondamento

- Valores finais de recebimento/pagamento: centavos inteiros.
- Custo fracionário de ingrediente/unidade: numeric com precisão declarada; evitar ponto flutuante binário para cálculo financeiro.
- Percentuais: numeric; manter precisão suficiente e validar limites.
- Subtotal direto = soma(preço da embalagem / quantidade convertida da embalagem × quantidade usada).
- Produção do lote = subtotal direto × (1 + indiretos / 100).
- Produção unitária = produção do lote / rendimento, sem arredondar prematuramente.
- Sugestão em centavos = arredondar(produção unitária × 3 / (1 − taxa sugerida / 100) × 100).
- Venda bruta = quantidade × preço unitário em centavos.
- Taxa da venda = arredondar(bruto em centavos × percentual do método / 100), uma vez sobre o total da venda.
- Custo de produção vendido = arredondar(quantidade × custo unitário histórico × 100).
- Custo total vendido = produção vendida + taxa.
- Lucro = bruto − custo total vendido.
- Entrada líquida = bruto − taxa.
- Somar valores finais das vendas, sem reconstruir custos a partir das receitas atuais.
- Exibição unitária é informativa; quando houver frações de centavos, prevalece o total arredondado da venda.
- Ao apresentar o preço sugerido, identificar lucro/taxa como estimativas e explicitar a taxa usada.

Exemplo de contrato: 1 unidade de custo exato R$ 3,84 vendida por R$ 10,00 no cartão a 5,49%:
bruto 1000, taxa 55, produção 384, custo 439, lucro 561 e entrada 945 centavos.
Em dinheiro/Pix: taxa 0, custo 384, lucro 616 e entrada 1000.
Se o custo de produção informado na interface estiver arredondado, a memória de cálculo mostrará a precisão usada na fórmula.

## 6. Escritas atômicas e repetição de pedidos

Criar/editar venda deve validar produto, cliente, valores históricos, totais e atualizar revisão da conta na mesma transação.
Substituir a composição de uma receita em uma transação, sem período com metade dos ingredientes.
Excluir cliente limpa referências e dados pessoais associados em uma transação.

Toda mutação recebe chave UUID criada para aquela intenção de operação.
Repetir chave com a mesma entrada reconhece a operação; chave com entrada diferente é rejeitada.
Nunca usar upsert de vendas/custos para recuperar falha de rede ou salvar edição de registro desaparecido.
Atualização de ID inexistente retorna registro indisponível; não cria substituto.
Recibo de deduplicação não é apagado junto da venda: repetir criação já concluída não deve recriá-la depois de excluída.
Se o resultado original já não existir, a repetição informa indisponibilidade e solicita atualização da tela, sem reconstrução.
Recibos ficam durante a vida da conta, contêm somente o mínimo técnico e não serão expostos como auditoria.
Rascunhos concluídos são limpos e não se tornam um segundo armazenamento financeiro.

Conflitos em cadastros seguem a última gravação concluída no servidor, com bloqueio transacional onde necessário.
O relógio do aparelho não decide a ordem. Exclusão prevalece sobre edição tardia.
Falha antes de confirmar a transação não deixa cliente ou composição parcialmente gravados.

## 7. Autenticação e autorização

- Supabase Auth por e-mail/senha; recuperação por e-mail com retorno restrito às URLs válidas do app.
- Nunca registrar senha ou token em código, commits, eventos, exportações ou logs.
- Cliente usa chave publicável. Chaves secretas não entram no bundle/browser.
- Dados de negócio protegidos por RLS para leitura e escrita; sem acesso anônimo.
- SELECT/DELETE restringem owner_id; INSERT/UPDATE validam também o dono do resultado.
- Relacionamentos entre contas bloqueados pelas referências compostas, além das políticas.
- Consultas agregadas e funções preservam a autorização; views expostas usam security_invoker.
- Funções de comando têm privilégios mínimos. Se um wrapper privilegiado for indispensável para impedir escrita direta de totais, deve autenticar, verificar dono explicitamente, fixar search_path, revogar EXECUTE de PUBLIC/anon e conceder apenas o necessário; núcleo privilegiado em esquema privado.
- Autorizações não dependem de user_metadata editável.
- Troca de conta/logout limpa cache, canais e rascunhos pessoais. Expiração da mesma sessão permite recuperar rascunho apenas após autenticar o mesmo dono.
- Rascunhos locais possuem prazo de expiração, separação por conta e nunca incluem credenciais.
- Mensagens de erro não expõem existência de cadastros de outra conta.

## 8. Sincronização

Usar canal privado autorizado por dono para avisar que a revisão da conta mudou.
Mensagem contém somente revisão e sinal de atualização, sem nomes, telefones ou payload completo de registros apagados.
O evento é emitido a partir da transação confirmada; não depender de o navegador que escreveu avisar os demais.
Só o servidor publica invalidações oficiais. Outro usuário não pode assinar o canal da conta.
Receber evento invalida consultas TanStack Query relacionadas; refazer leitura autorizada do banco.

Ao abrir, reconectar, recuperar foco ou voltar do login, consultar revisão e refazer consultas relevantes, mesmo que nenhum evento tenha chegado.
Descartar respostas antigas de consultas iniciadas antes da revisão vigente, para não reintroduzir linhas excluídas no cache.
Identificar tela sem conexão/dados desatualizados e não prometer atualização instantânea sem conectividade.
Meta de aceite em conexão estável: venda/edição/exclusão refletida no segundo aparelho em até 3 segundos, aferida na homologação; é meta, não resultado já medido.

## 9. Caixa, resumos e clientes

Caixa é uma consulta derivada: vendas líquidas + gastos negativos + saldo inicial datado.
Ordenar por instante e identificador estável para desempate. Calcular saldo anterior com todo o histórico precedente.
Filtro de tipo/categoria muda linhas exibidas; o saldo acumulado continua representando o caixa completo até cada linha. Explicar isso na interface.
Saldo inicial conta uma vez na data definida e não participa de receita, gastos ou lucro.
Filtros de período usam intervalos [início, próximo início) convertidos do fuso do negócio para UTC.

Resumos diários/mensais/anuais compartilham as mesmas expressões financeiras.
Meses sem movimento aparecem zerados; prejuízos aparecem em vermelho.
Clientes: agregar vendas existentes vinculadas; nunca acumular totais incrementais suscetíveis a divergir.
Itens = soma de quantidades; gasto do cliente = venda bruta, não recebimento líquido.
Última compra considera data da venda; seu nome vence por data da compra e desempate estável, inclusive ao lançar retroativamente.
Cliente sem vendas pode permanecer no cadastro, com zero itens/valor e sem última compra.
Nenhum resumo ou consulta lê receitas atuais para recalcular venda antiga.

## 10. Nutrição e exportação

Nutrição por base declarada, com conversão rastreável das quantidades usadas.
Bloquear ingrediente sem equivalência necessária para conciliar g, mL ou unidade.
Cálculo por 100 g/mL final, por porção e %VD conforme requisitos aplicáveis e enquadramento do alimento.
Calcular com precisão antes dos arredondamentos normativos; nunca transformar ausência de informação em zero.
Porção, conteúdo da embalagem, dimensões físicas de impressão e aplicabilidade das regras devem ser validados na etapa 11.
PNG de 1080 px é saída digital, não prova automática de conformidade ou legibilidade no tamanho impresso.
O briefing pede kJ além de kcal; conferir tratamento no modelo normativo escolhido antes de liberar a etiqueta.
Rotulagem frontal fora do desenvolvimento inicial não implica que seja dispensável legalmente para o produto.
Sem dados suficientes ou conflito normativo, informar o impedimento e não emitir tabela como pronta para embalagem.

Excel: mesmas linhas, filtros e ordenação da tela de clientes; telefone como texto; neutralizar fórmulas em conteúdo fornecido pelo usuário.
Exportação completa versionada e consistente em um único retrato transacional: configurações, categorias, materiais, nutrição, receitas/composição, clientes e vendas/gastos, incluindo seus valores históricos.
Não exportar credenciais, sessões ou recibos internos.
Backup do provedor e exportação do app são mecanismos diferentes; capacidade/retencão do destino precisa ser verificada.
Restauração é explícita e validada em banco isolado, sem fusão automática com dados ativos nem reenvio implícito de registros excluídos.
Antes de troca estrutural do banco, criar cópia recuperável e testar o procedimento definido.

## 11. Índices e limites

Índices por dono e data em vendas/gastos; por dono e cliente nas vendas; por dono e categoria nos gastos.
Indexar referências recipe_materials por receita/material e sales por receita.
Unicidade de nome por dono em receitas, materiais e categorias; telefone por dono em clientes.
Nome normalizado remove espaços excedentes e normaliza caixa; guardar nome original para exibição.
Listas paginadas; agregações realizadas no servidor; não baixar toda a base para montar o resumo no celular.
Constraints para limites e coerência de unidades/tipos; rejeitar valores que ultrapassem limites de precisão com mensagem compreensível.

## 12. Critérios de validação antes da liberação

1. Fórmula do exemplo e arredondamentos de quantidade/taxa conferidos em casos de centavos fracionários.
2. Dinheiro/Pix sem taxa; débito/crédito usando taxas corretas.
3. Histórico preservado após alterar insumo, receita ou configuração de taxas.
4. Criação repetida não duplica; repetição após exclusão não recria registro.
5. Edição tardia de registro excluído não o ressuscita.
6. Falha transacional não deixa venda, cliente ou receita parcialmente salvos.
7. Exclusões e edição atualizam caixa, clientes e todos os períodos.
8. Usuário B não lê, altera, vincula IDs ou recebe eventos do usuário A.
9. Atualização em dois aparelhos, reconexão e resposta antiga em cache exercitadas.
10. Datas retroativas, virada de dia/mês/ano e desempates estáveis conferidos.
11. Categoria apagada preserva gasto; cliente apagado remove dados pessoais das vendas.
12. Exportação consistente e restauração isolada conferidas.
13. Nutrição validada linha por linha e no tamanho real de impressão.
14. Interface em 390 px, navegação por teclado, foco, contraste e erros revisados.

## 13. Situação da entrega e próximos passos

Esta entrega documenta o modelo lógico, contratos financeiros e estratégia de consistência.
Não contém migrações aplicadas, projeto Supabase provisionado, integração ativa, telas novas ou testes executados contra banco.
Próxima implementação: identificar o backend do projeto Lovable, preparar banco isolado, criar esquema/migrações e implementar autenticação/RLS com testes entre contas.
As etapas 5 a 12 concretizam os módulos e validam os contratos descritos aqui.

## Referências técnicas consultadas

- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/realtime/broadcast
- https://supabase.com/docs/guides/realtime/authorization
- https://supabase.com/changelog
- https://www.postgresql.org/docs/current/datatype-numeric.html
- https://www.postgresql.org/docs/current/tutorial-transactions.html
- https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation
- https://docs.lovable.dev/integrations/github
- Anvisa: RDC 429/2020 e IN 75/2020, textos oficiais consolidados consultados durante a análise do briefing.
