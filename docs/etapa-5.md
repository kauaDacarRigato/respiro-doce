# Etapa 5 — Insumos e embalagens

## Entrega

- Área Produtos em /produtos, com menu lateral no computador e barra inferior no celular.
- Cadastro, edição, busca por nome, filtro por tipo, paginação e exclusão com confirmação.
- Nome único por conta, normalizado por caixa e espaços repetidos.
- Ingredientes em g, kg, mL, L e unidade; embalagens por quantidade inteira de unidades.
- Quantidade da embalagem, preço pago e prévia de custo por g, mL ou unidade. Valores monetários finais enviados em centavos inteiros.
- Peso comestível de uma unidade e densidade opcionais, sem presumir equivalência entre g e mL.
- Dados nutricionais opcionais por 100 g ou 100 mL, com referência do rótulo. Campos ausentes destacados e diferenciados de zero.
- Embalagens sem peso alimentício ou nutrição. A geração da tabela nutricional pertence à etapa 11.
- Rascunho separado por conta, retomada, descarte e preservação durante indisponibilidade de conexão. O navegador informa se não conseguir gravar o rascunho.
- Nenhuma confirmação de salvamento offline. Uma tentativa sem confirmação mantém os dados e a chave da operação para uma repetição segura.

## Banco e consistência

Projeto: Respiro Doce, gogzturzsxayfxakpjcz, confirmado pelo proprietário.

Tabelas novas: materials, material_nutrition e account_sync_state. Recibos técnicos em private.command_receipts armazenam somente identificadores e resumo criptográfico da entrada, sem cópia do cadastro ou seus dados nutricionais.

O navegador tem leitura das próprias linhas via RLS. As mutações usam material_command, que autentica a identidade, limita a operação ao dono e grava cadastro, nutrição, recibo e revisão na mesma transação. Escrita direta nas tabelas não está liberada para clientes.

As operações da mesma conta são serializadas no servidor. Repetir uma operação concluída não duplica o cadastro; repetir sua criação depois de excluí-lo retorna indisponibilidade, sem recriá-lo. Edição de ID excluído também não cria um novo registro.

As mudanças emitem apenas um número de revisão em canal privado por conta. A interface cancela consultas antigas e busca os dados novamente. Há reconciliação periódica a cada dois segundos enquanto a página está visível, além de reconciliação ao recuperar foco/conexão. Consultas de revisão sem alteração não recarregam a lista.

As migrações locais estão alinhadas às versões aplicadas no Supabase:

- 20261021223210_materials_catalog.sql
- 20261021223509_explicit_private_receipts_policy.sql

## Verificação realizada

- 32 testes automatizados aprovados, incluindo os testes das etapas anteriores.
- TypeScript sem erros; lint sem erros, com avisos de Fast Refresh; build de produção aprovado, mantendo o aviso de tamanho do bundle base.
- SQL com papéis reais authenticated e anon: isolamento, bloqueio de escrita direta, validações, nomes duplicados, ausência versus zero nutricional e reversão de alteração parcial.
- SQL confirmou que exclusão seguida de repetição da criação não recria o cadastro e que repetir um pedido não incrementa a revisão novamente.
- Navegador contra a API real: criar ingrediente, alterar preço, bloquear nome repetido, criar embalagem, filtrar, excluir e retomar rascunho após ficar offline.
- Duas janelas da mesma conta receberam criação, edição e exclusão sem recarregar. Na medição de criação, a segunda janela recebeu o cadastro em 519 ms; isso é resultado observado, não garantia de latência para qualquer conexão.
- Segunda conta não leu os cadastros da primeira e não conseguiu excluí-los pela API.
- Conferência visual em 390 × 844 e 1440 × 1000 px. Ajustada a animação do painel móvel para permanecer centralizado e dentro da largura disponível.
- As chamadas HTTP do navegador de teste foram encaminhadas à API real por causa da restrição de rede do ambiente; não foram substituídas por respostas fictícias.
- Identidades temporárias exclusivas com TESTE no nome/e-mail; registros de teste removidos antes da entrega. Scripts SQL usam ROLLBACK.

## Limites e próximos passos

Receitas ainda não estão disponíveis. A proteção de insumos utilizados em receitas será adicionada junto às referências da composição na etapa 6, antes de liberar esse uso.

A homologação completa de sincronização e conflitos de todos os módulos pertence à etapa 10. Nesta etapa foram exercitados os cadastros de insumos e embalagens.

A confirmação de e-mail do cadastro foi testada pelo proprietário. Recuperação de senha e redirecionamento no domínio definitivo ainda exigem validação separada.

O verificador do Supabase não apontou problemas nas novas tabelas e permissões após o bloqueio explícito dos recibos. Permanece um aviso de configuração do Auth: proteção contra senhas vazadas desativada. Nenhuma alteração foi feita nessa configuração ou no plano contratado. Referência: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
