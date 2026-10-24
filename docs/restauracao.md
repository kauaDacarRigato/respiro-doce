# Cópia e restauração dos dados do aplicativo

O procedimento está em [etapa-11.md](etapa-11.md#restauração-isolada). Comece por **Dados e backup** no aplicativo e guarde o JSON fora do aparelho.

O ensaio `scripts/check-restore.mjs` usa um Postgres novo em memória; não acessa o projeto ativo. Para um destino real, use um projeto separado com as migrações aplicadas e uma identidade de destino criada. O SQL gerado recusa banco com conta existente, importa tudo em uma transação e compara os valores históricos gerados das vendas.

A conferência do arquivo no aplicativo não é uma restauração. Nenhum botão envia os registros ao banco, faz fusão ou altera o ambiente ativo. O arquivo não contém usuários/senhas, sessões, rascunhos, Storage ou código do app.
