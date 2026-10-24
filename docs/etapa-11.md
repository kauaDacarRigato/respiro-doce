# Etapa 11 — Nutrição, exportações e cópias dos dados

## Entrega

### Memória de cálculo nutricional

Em Receitas, o botão **Ver nutrição** consulta os ingredientes e o rendimento atuais. Mostra valores estimados para o lote, por 100 g/mL, por porção informada e %VD estimado para adultos. A tabela contém os dez campos nutricionais cadastrados e uma linha auxiliar em kJ.

- Conversões explícitas de g/kg, mL/L e unidade. Peso por unidade e densidade são exigidos quando necessários para chegar à base nutricional do ingrediente. Embalagens não entram na nutrição.
- Cálculos em numeric no servidor, antes de qualquer arredondamento de apresentação. A interface formata os decimais com operações inteiras, inclusive valores além da precisão de Number.
- Ausência de nutriente não vira zero. Fonte ausente, equivalência ausente, porção/rendimento incompletos, porção maior que o lote, medida caseira ausente e incoerências entre açúcares/carboidratos/gorduras impedem gerar a memória.
- Em receitas medidas em gramas, a soma de carboidratos, proteínas, gorduras e fibras também não pode superar o peso final informado. Isso é uma verificação de coerência dos dados do cálculo, não uma regra de tolerância normativa para rótulos.
- Conferência por ingrediente: quantidade usada, quantidade convertida, base e referência dos valores. Atualizações de ingredientes/receitas invalidam a consulta nutricional pelo coordenador da etapa 10.
- PNG com 1080 px de largura e fundo branco, gerado no aparelho. Nome e medida caseira são quebrados em linhas, e a altura aumenta quando necessário. Valores que não cabem de forma legível impedem gerar a imagem.
- Exportação exige conexão, nova consulta ao servidor e confirmação de que fontes/rendimento foram conferidos. Se os dados mudarem após a conferência, a confirmação é retirada e a exportação exige nova revisão. A imagem sempre contém **ESTIMATIVA — NÃO USAR COMO RÓTULO**.

**Limite da entrega:** este recurso é uma memória de cálculo, não um rótulo nutricional homologado para embalagem. Não aplica arredondamentos de declaração, critérios de quantidade não significativa ou fatores de retenção do processamento. Enquadramento do alimento, porção legal, número de porções por embalagem, eventual rotulagem frontal e legibilidade no tamanho físico final continuam exigindo revisão específica. Não há botão que libere automaticamente uma etiqueta para embalagem.

A referência geral de %VD usada na simulação é para adultos. Açúcares totais, gorduras trans e kJ aparecem sem %VD. O kJ é uma conversão auxiliar de kcal × 4,184; a orientação da Anvisa consultada informa que a declaração do valor energético no modelo de tabela deve usar kcal. [Perguntas e Respostas da Anvisa, 4ª edição, questão 53](https://www.gov.br/anvisa/pt-br/centraisdeconteudo/publicacoes/alimentos/perguntas-e-respostas-arquivos/rotulagem-nutricional_2a-edicao.pdf/@@download/file). [Página oficial sobre rotulagem nutricional](https://www.gov.br/anvisa/pt-br/assuntos/alimentos/rotulagem/rotulagem-nutricional).

### Excel de clientes

Na tela Clientes, **Exportar clientes (Excel)** gera um XLSX com todos os resultados do filtro, em todas as páginas, na mesma ordenação por nome e identificador.

Nome, telefone, quantidade de itens, total comprado e última compra no horário de São Paulo. Telefones, contagens e valores são células de texto, preservando o sinal + e todos os dígitos/centavos. Conteúdo que começa por =, + ou @ não é convertido em fórmula. A aba de informações registra filtro, data, quantidade e a representação dos valores em texto.

A exportação é uma nova consulta consistente ao servidor, não uma concatenação de páginas obtidas em instantes diferentes. Não há o limite de mil linhas das consultas REST paginadas. Dados acima de 20 MB não são truncados: o servidor informa o impedimento.

### Dados e backup

Nova tela `/dados`, disponível no rodapé lateral e pelo botão no cabeçalho do celular.

- **Baixar backup JSON** gera uma cópia completa dos dados da conta em um retrato transacional: configurações, categorias, insumos, nutrição, receitas/composição, clientes, vendas e gastos, preservando os retratos históricos financeiros.
- Esquema e envelope versionados em 1, data da exportação, identificador da conta, revisão de origem e checksum SHA-256 do conteúdo canônico. Checksum detecta corrupção; não é assinatura nem prova de autoria.
- Números chegam do banco como texto antes de atravessar JavaScript, sem perda de centavos ou custos de alta precisão. Datas são normalizadas para o mesmo instante em UTC; zeros decimais finais são normalizados sem arredondar valores.
- Não inclui senhas, sessões, recibos de idempotência, rascunhos locais, objetos de Storage nem cópia do código/esquema. A revisão de origem é metadado; os recibos técnicos não são reexecutados na restauração.
- Limite de 20 MB por arquivo, validado também após a criação do envelope. Erros não produzem um arquivo parcial apresentado como cópia completa.
- **Conferir um backup** lê o arquivo apenas no aparelho e verifica versão, campos, tipos, limites exatos, duplicidades, referências e checksum. Respostas tardias de um arquivo substituído são ignoradas. Não envia o arquivo para o banco nem altera a conta.
- Exportações capturam o sinal do dono autenticado e não iniciam o download após troca de conta/cancelamento.

## Restauração isolada

A interface não mescla um arquivo com os dados ativos. Dois procedimentos revisáveis foram incluídos; exigem Node 24+ e as dependências do repositório.

```sh
node scripts/check-restore.mjs /caminho/backup.json
node scripts/prepare-restore.mjs /caminho/backup.json UUID_DONO restore.local.sql --isolated-empty
```

O primeiro comando cria um **Postgres em memória isolado (PGlite)**, com as definições das tabelas do aplicativo e as consultas de conferência. Restaura o arquivo, compara os dados exportados novamente e confere o saldo calculado pelos valores históricos. Não se conecta ao Supabase. O ensaio valida os dados do app; não restaura infraestrutura, objetos de Storage, usuários/senhas nem configurações do provedor.

O segundo comando só prepara um SQL, sem conexão com banco. A gravação do arquivo usa permissões restritas e recusa sobrescrever um arquivo existente. O SQL exige uma identidade previamente criada no destino e **recusa qualquer banco que já contenha uma conta do app**. Isso também impede aplicá-lo no projeto ativo atual. Dados são inseridos em uma transação, com as relações originais e dono de destino explícito; valores gerados das vendas precisam coincidir com os valores históricos da cópia, senão tudo é revertido.

Para um destino real, prepare um projeto separado com todas as migrações do repositório e a identidade de destino, antes de executar o SQL revisado. Apenas nesse destino isolado vazio, defina na mesma sessão:

```sql
set respiro.restore_isolated='YES_ISOLATED_EMPTY_DATABASE';
```

Depois confira o ensaio, os dados e a autenticação do destino. Nenhuma troca de ambiente ativo, exclusão de produção ou fusão automática foi implementada. Literais e delimitadores do SQL são tratados para que nomes e descrições continuem sendo dados, incluindo apóstrofos e sequências de delimitadores.

A cópia do app é diferente dos backups da infraestrutura. O conector disponível não expôs plano/retenção dos snapshots desse projeto; isso não foi confirmado nem configurado. A documentação atual do Supabase diferencia exportações lógicas, snapshots e recuperação por instante, além de informar que objetos de Storage não são incluídos no backup do banco. [Documentação de backups](https://supabase.com/docs/guides/platform/backups). Não há promessa de backup automático do provedor nesta entrega.

## Banco e dependências

Projeto confirmado: Respiro Doce, `gogzturzsxayfxakpjcz`.

- `20261022212806_nutrition_and_exports.sql`
- `20261022214212_nutrition_mass_balance.sql`

Funções públicas de leitura com security_invoker, autenticação obrigatória, search_path fixo e acesso restrito a authenticated. RLS continua restringindo todas as tabelas por dono. O helper privado de serialização não consulta dados e não eleva privilégios. Não houve alteração dos registros do proprietário.

ExcelJS 4.4.0, carregado somente ao exportar; PGlite 0.5.11 apenas como dependência de desenvolvimento para o ensaio isolado. Versões exatas e bun.lock atualizados. O pacote Excel é um chunk separado; o teste de restauração não é distribuído no aplicativo.

## Verificação

- 94 testes automatizados aprovados: regressões anteriores; decimais exatos; round-trip do envelope; corrupção/versão desconhecida/campos extras; limites sem Number; duplicados/referências; XLSX reaberto e conferido; telefone, total grande, nome semelhante a fórmula e data de São Paulo.
- Restauração em Postgres isolado aprovada: relações, nutrição, produto cuja receita foi excluída, custo histórico, caixa e reexportação equivalente. Recusa sem condição de isolamento; rollback de uma cópia com valor histórico divergente; recusa de fusão após a primeira restauração; nomes com apóstrofos e delimitadores preservados.
- Contrato SQL executado no Supabase real e revertido: ausência distinta de zero; fontes e equivalências; densidade nas duas direções; embalagem excluída; rendimento/porção; kcal/kJ; coerência física do peso final; leitura sem revisão extra; snapshot e valores históricos; mais de 1.000 clientes sem truncamento; busca literal/nome/telefone; ordenação; isolamento entre contas; bloqueio anônimo.
- TypeScript e lint sem erros; nove avisos anteriores de Fast Refresh. Build de produção aprovado. O chunk Excel acrescenta tamanho apenas no carregamento sob demanda.
- Navegador com API/Auth/Realtime reais: bloqueio por dados nutricionais ausentes; atualização da nutrição após completar a fonte; tabela de 11 linhas; download PNG; Excel do filtro reaberto; telefone e nome como texto; backup completo baixado/conferido; arquivo alterado rejeitado; segunda conta isolada; bloqueio de exportação offline. Conferência em 1440 × 1000 e 390 × 844 px, sem rolagem horizontal da página nem erros de JavaScript.

A conferência final confirmou a remoção das duas contas temporárias e dos seus dados de teste. Permaneceu a conta original, sem alteração dos seus registros. O build foi executado novamente após o ajuste final da tabela nutricional no celular e aprovado.

## Continuidade

A próxima etapa é 12: revisão geral e aceite. A memória nutricional pode ser usada para conferência; a liberação de rótulo de embalagem continua condicionada aos dados e à revisão técnica descritos acima. Recuperação de senha no domínio definitivo continua uma validação separada da confirmação de e-mail já realizada pelo proprietário.
