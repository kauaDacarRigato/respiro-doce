# Etapa 10 — Sincronização, reconexão e conflitos

## Entrega e correções

- Um coordenador por área autenticada cuida dos canais e das consultas de insumos, receitas, prévias, vendas, clientes, taxas, gastos, categorias, caixa, resumos e saldo inicial. Os componentes compartilham o mesmo estado de conexão.
- Canal privado por dono, autorizado com a sessão real. O SDK recebe as renovações de token; a inicialização explícita do Realtime ocorre fora do callback de autenticação.
- Verificação da revisão a cada dois segundos enquanto a página está visível e o navegador está online. Há recuperação por verificação periódica quando o WebSocket não está disponível.
- Consulta de revisão com prazo de oito segundos: uma requisição travada não bloqueia indefinidamente as próximas verificações. Transporte HTTP compartilhado com prazo de quinze segundos até a resposta, incluindo Auth e consultas. Comandos mantêm também o prazo de vinte segundos capturado antes da resolução do token.
- Abertura, reconexão, retorno ao foco, entrada no canal e atualização manual forçam reconciliação. Falhas de leitura de listas são tentadas novamente mesmo se a revisão não mudou; erros de validação das prévias não provocam essa repetição global.
- Atualizações recebidas cancelam leituras antigas antes de refazer as consultas da própria conta. Verificações são serializadas e avisos acumulados são agrupados, evitando ciclos concorrentes de cancelamento/refetch.
- Indicador distingue conexão sendo conferida, canal automático, verificação periódica, ausência de internet e falha ao conferir atualizações. Botão Atualizar permite conferência manual. O indicador não promete que o aparelho está atualizado quando a revisão não pôde ser consultada.
- Formulários mantêm a digitação durante atualizações externas. Um aviso sinaliza que a revisão da conta mudou desde a abertura. Edições explicam a regra de última gravação concluída e a possibilidade de fechar/reabrir para carregar os dados atuais. Aviso refere-se à conta, não afirma que o mesmo registro foi alterado.
- Não há fila automática de gravação offline. Resposta perdida mantém a tentativa pendente e a repetição usa a mesma chave/dados. Timeout ou cancelamento não significam que o servidor deixou de concluir a operação.
- Troca de identidade reinicia a árvore da área de trabalho, cancela comandos pendentes ligados ao dono anterior e elimina cache e rascunhos anteriores. Isso impede manter um formulário da conta A aberto na conta B e impede que um comando aguardando token seja enviado com a identidade seguinte.
- Login após recarregar também remove rascunhos de outros donos. Expiração/perda da sessão preserva os rascunhos para reautenticação da mesma conta; renovação de token não reinicia o formulário.
- Logout explícito termina a limpeza local mesmo quando o SDK já removeu a sessão, mas retornou falha na revogação remota. Se o SDK continua autenticado após a falha, o app informa o erro. Sair do aparelho não é apresentado como revogação imediata de todos os tokens já emitidos.

## Banco

Nenhuma migração de produção foi necessária. Foram mantidas a serialização por conta, a revisão transacional, as mensagens emitidas pelo servidor, a idempotência por UUID/hash e as permissões existentes. Não há escrita direta de totais, saldo acumulado ou revisões pelo navegador.

`supabase/tests/sync-contract.sql` verifica última gravação concluída, repetição sem regressão de valores/revisão extra, reutilização indevida de chave entre módulos, falha atômica de referência excluída, edição tardia sem recriação de registros, reconciliação de agregados, bloqueio de revisão forjada, recibos privados e isolamento entre contas. Identidades SQL temporárias e alterações são revertidas com ROLLBACK.

## Verificação

- 80 testes automatizados aprovados, incluindo regressões, timeout e recuperação da revisão, fallback sem canal, foco/visibilidade/offline, invalidação de todos os módulos apenas do dono, agrupamento de avisos, descarte de resposta antiga, nova leitura após falha sem mudança de revisão, limpeza de canal e cancelamento ao desmontar, aviso de revisão, troca direta de conta, renovação preservando formulário, rascunhos após reinicialização, logout local e cancelamento dos comandos ligados à identidade anterior.
- TypeScript e lint sem erros. Permanecem os nove avisos anteriores de Fast Refresh. Build de produção aprovado, com o aviso anterior de tamanho do bundle base.
- API real com requisições em paralelo: duas criações idênticas geraram uma única linha e uma revisão; edições concorrentes permaneceram atômicas; repetir a criação após excluir retornou indisponibilidade sem recriar a linha nem alterar novamente a revisão.
- Contrato SQL de sincronização aprovado no projeto real Respiro Doce (`gogzturzsxayfxakpjcz`).
- Realtime com sessões reais: assinatura do canal próprio aprovada; tentativa de outra conta no canal do primeiro dono rejeitada com CHANNEL_ERROR; publicação de uma invalidação pelo cliente rejeitada com `error`. A política permite receber, e não forjar as mensagens oficiais.
- Navegador com API/Auth/Realtime reais em duas sessões do mesmo dono e uma segunda conta isolada. Transporte HTTP/WebSocket encaminhado ao serviço real por causa do proxy do ambiente, sem respostas fictícias. Frames binários do Realtime preservados no encaminhamento.
- Caixa e Resumo: saldo inicial positivo/negativo e confirmação, filtros e saldo por linha, rascunho offline, relatórios dia/mês/ano e intervalos zerados, custos históricos após mudar ingrediente, edição/exclusão de venda, exclusão de gasto e reflexo nas duas telas. Sem erros de JavaScript ou rolagem horizontal em 1440 × 1000 e 390 × 844 px.
- Falha induzida depois de o servidor concluir um gasto: a segunda sessão recebeu o lançamento, a primeira mostrou tentativa pendente, e a repetição enviou exatamente os mesmos dados/UUID, sem criar outra linha nem incrementar a revisão outra vez.
- Duas edições abertas a partir do mesmo valor: primeira gravação refletida na segunda sessão, aviso exibido sem substituir a digitação; a segunda gravação concluída prevaleceu nas duas telas.
- Offline com formulário aberto e atualização remota: retorno da conexão reconciliou a lista sem enviar automaticamente o rascunho e sem alterar o valor digitado.
- Renovação real de token preservou o formulário. Perda da sessão foi exercitada por saída do SDK, seguida de login real do mesmo dono e retomada do rascunho. Não se aguardou o prazo natural de expiração de um token para simular esse cenário.
- Substituição direta por uma sessão válida da conta B: formulário anterior desmontado, rascunhos removidos e nenhum lançamento de A visível em B.
- Resposta antiga de lista retida durante exclusão remota: ao liberá-la, o lançamento permaneceu excluído, com total atualizado.
- Criação refletida na segunda sessão em 1.417 ms na primeira medição e 1.390 ms na repetição final. É um resultado observado neste teste, compatível com a meta de três segundos em conexão estável, e não uma garantia em qualquer rede.

- Contas e registros temporários exclusivos dos testes foram removidos antes da publicação. A conta do proprietário e seus dados não foram alterados; nenhum e-mail de teste foi enviado.

## Continuidade

A pendência do teste integrado da etapa 9 foi encerrada nesta etapa. A próxima etapa é 11: nutrição, exportações e backups. A etapa 12 reúne o aceite geral. A recuperação de senha no domínio definitivo permanece uma validação separada da confirmação de e-mail já feita pelo proprietário.

Consultados o changelog e a documentação atual do Supabase sobre callbacks de Auth, canais privados e autorização. O aviso de retirada de cifras TLS antigas em novembro de 2026 não exige mudança nos navegadores e Node usados nesta homologação. Dependências Supabase permaneceram fixadas.

Permanece o aviso anterior de [proteção contra senhas vazadas desativada](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), sem alteração dessa configuração nesta etapa.

O advisor de performance manteve somente o aviso informativo de [índice de vendas ainda sem uso registrado](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index); o índice foi preservado.
