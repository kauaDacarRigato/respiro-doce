# Etapa 4 — Acesso e fundação dos dados

## Escopo implementado

- Cliente Supabase no navegador, sem sessão compartilhada no servidor.
- Projeto confirmado pelo proprietário: Respiro Doce (gogzturzsxayfxakpjcz).
- Login por e-mail/senha, cadastro e formulários de recuperação/atualização de senha.
- Área autenticada inicial e logout do aparelho atual.
- Interface em português, tema escuro e formulário adequado ao celular.
- Limpeza de cache na troca/expiração de sessão; rascunhos separados por conta, com expiração de 24 horas e bloqueio de campos de credenciais.
- Fundação do banco: business_settings e expense_categories, protegidas por RLS.
- Preparação atômica e repetível da própria conta via initialize_account, com oito categorias iniciais.
- Usuário autenticado lê apenas sua conta e pode alterar somente os campos permitidos das próprias configurações; categorias ainda não têm escrita direta pelo cliente.

## Configuração

src/lib/public-config.ts contém apenas URL e chave publicável do projeto confirmado. Esses identificadores podem estar no navegador; a proteção é feita pelas políticas do banco. Não existe chave administrativa no código.

É possível substituir o projeto por variáveis VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no ambiente de build. Quando qualquer override estiver presente, ambos são obrigatórios; configuração inválida bloqueia o acesso em vez de misturar projetos.

Para instalar, usar Bun com o bun.lock versionado. Os comandos npm test, npm run lint e npm run build continuam disponíveis depois da instalação.

As migrações são versionadas em supabase/migrations. A migração auth_foundation já foi aplicada ao projeto confirmado; não reaplicar manualmente como SQL avulso. O arquivo local está alinhado com a versão registrada no servidor.

## Recuperação de senha: requisito de ambiente

O envio solicita retorno para a origem em que o app está aberto. Essa origem precisa estar nas URLs de redirecionamento permitidas em Supabase Authentication > URL Configuration, para o endereço real de visualização/publicação do Lovable.

O cliente usa PKCE: o link deve ser aberto no mesmo navegador em que a recuperação foi solicitada. A interface de redefinição acompanha PASSWORD_RECOVERY e preserva o modo após recarregar a mesma aba autenticada.

O fluxo de formulários foi testado com respostas simuladas. Entrega do e-mail, lista de redirecionamentos e clique no link no domínio definitivo ainda precisam de validação. Não foi enviado e-mail de teste a terceiros, nem alterada a configuração de e-mail do projeto.

## Verificações

- 20 testes automatizados aprovados: configuração pública, formulários, rascunhos, ciclo de sessão e roteamento. TypeScript sem erros; lint sem erros (avisos de Fast Refresh dos componentes); build de produção aprovado.
- Testes SQL com papéis reais authenticated e anon: usuário B não lê/edita A; anônimo não lê nem prepara conta; trocar owner_id é bloqueado; taxa inválida é rejeitada; bootstrap repetido não duplica categorias.
- Script SQL versionado em supabase/tests/auth-isolation.sql; usa identidades fictícias e ROLLBACK.
- Login real, leitura do usuário, bootstrap, leitura das configurações/categorias e logout exercitados com identidade temporária exclusiva de teste, sem envio de e-mail.
- Verificador de segurança do Supabase sem apontamentos após a migração.
- Interface inspecionada em 390 × 844 e 1440 × 1000 px; sem rolagem horizontal em 390 px e sem erros de execução.
- Login, recarga com sessão preservada e logout exercitados no navegador, encaminhando o transporte à API real por causa da restrição de rede do navegador de teste. Logout removeu a sessão local.
- Conta temporária e configurações/categorias criadas no teste foram excluídas; consulta final confirmou zero registros de teste remanescentes.

## Próximos módulos

Cadastros de insumos/embalagens, receitas, vendas, clientes, gastos e relatórios ainda não estão implementados. Os cadastros e suas tabelas serão adicionados nas respectivas etapas, mantendo o modelo descrito em arquitetura.md.

O suporte a rascunhos é uma infraestrutura; só será conectado aos formulários de negócio quando esses módulos forem construídos. A homologação da preservação de vendas em digitação depende dessas telas.
