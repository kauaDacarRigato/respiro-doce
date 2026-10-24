# Etapa 11.5 — PWA do Respiro Doce

Etapa adicional solicitada antes da revisão geral (12). O aplicativo mantém React/TanStack Start, o build do Lovable e o Supabase existentes. Nenhuma migração, conta, dado financeiro ou regra de negócio foi alterada nesta entrega.

## Instalação e identidade

- Manifesto `/manifest.webmanifest`: identificação estável `/`, nome Respiro Doce, idioma pt-BR, abertura `/`, escopo `/`, modo `standalone`, cores de fundo e tema.
- Ícones PNG opacos de 192 e 512 px, versão maskable de 512 px com conteúdo na área segura, apple-touch-icon de 180 px e fonte SVG. A identidade usa o CakeSlice do Lucide já utilizado no app, com a licença correspondente em `public/icons/LICENSE.txt`.
- Botão de instalação aparece somente quando o navegador disponibiliza `beforeinstallprompt`; o prompt só abre após clique. `appinstalled` e `display-mode` removem a oferta quando instalado.
- Nos demais casos, orientação acessível em “Como instalar”, incluindo Safari/iPhone, Android/computador e abertura pelo endereço publicado fora da prévia do editor.
- Meta tags de tema e Apple, viewport com `viewport-fit=cover`, respeito às áreas seguras do aparelho. A faixa de instalação fica no fluxo da página e não cobre formulários.
- Publicação exige HTTPS (localhost é a exceção para testes). A experiência e a promoção de instalação dependem do sistema/navegador; não se promete instalação automática nem aparência idêntica em todas as plataformas.

## Service worker e falta de conexão

Implementação nativa, sem acrescentar dependências. `pwa/build-plugin.ts` emite `/sw.js` exclusivamente no build do cliente. A revisão é derivada do conteúdo do bundle, do template, do manifesto, da tela offline e dos ícones; mudanças da publicação geram outra versão. O registro ocorre apenas em produção, em contexto seguro, após o carregamento e dentro de um efeito do navegador, sem executar no SSR.

O worker guarda **apenas seis arquivos públicos**: tela offline e cinco ícones. Navegações GET da própria origem tentam a rede e, se a requisição falhar, mostram a tela offline pública. Não armazena HTML do aplicativo, arquivos JS/CSS do app, respostas de API/RPC, autenticação, clientes, vendas, exportações ou backups. Requisições não GET e chamadas externas não são interceptadas. Ícones com parâmetros não entram na política de cache. Nenhuma fila, reenvio ou sincronização de escrita em segundo plano foi criada.

A tela offline preserva o endereço solicitado e oferece tentativa explícita de reconexão. O evento `online` apenas informa que uma nova tentativa pode ser feita; não reenvia operações. Uma aba já aberta mantém o indicador e o comportamento de conexão da etapa 10. Os rascunhos anteriores continuam separados por conta; o PWA não amplia o armazenamento de dados privados.

O cache público do PWA não substitui o backup JSON. Não há promessa de consulta completa ou lançamento financeiro offline. Fazer vendas sem internet exigirá outra etapa de produto, com fila persistente, estados de confirmação e regras de reconciliação.

## Atualizações

- O novo worker instala os arquivos públicos e espera. Não usa ativação imediata durante `install`.
- A interface avisa “Nova versão disponível”. A aplicação por botão é recusada quando existe formulário editado, diálogo aberto ou operação marcada como ocupada. O rastreador de edição guarda somente referências em memória, sem conteúdo de campos.
- O worker verifica as janelas abertas antes de aceitar a ativação: exige uma única janela, correspondente à solicitante. Com outras abas ou janelas abertas, pede que sejam fechadas. Se todas forem fechadas, vale a ativação natural do navegador na próxima abertura.
- Após ativação, a página recarrega. Uma edição surgida durante a transição também impede o recarregamento automático. A interface pede salvar e reabrir nesse caso.
- O registro verifica atualizações na abertura; também verifica ao voltar à aba ou recuperar conexão, respeitando um intervalo mínimo de um minuto. Falha na verificação não interrompe a versão atual.
- A limpeza remove somente caches com o prefixo próprio do PWA. Nunca remove localStorage, sessões, rascunhos ou caches de outros aplicativos.
- `/sw.js` e manifesto têm revalidação HTTP (`no-cache`), e o registro usa `updateViaCache: none`. O `_headers` é combinado pelo build Nitro com a regra existente dos assets imutáveis.

## Validação

- 102 testes automatizados aprovados, incluindo as 94 verificações anteriores. Novos testes cobrem política de cache, exclusão de dados privados, navegação online/offline, isolamento da limpeza, bloqueio com múltiplas abas, instalação por clique e proteção dos formulários.
- TypeScript sem erros. Lint sem erros; permanecem os nove avisos anteriores de Fast Refresh.
- Build de produção com o alvo Cloudflare do Lovable, incluindo manifesto, ícones, `/sw.js` e cabeçalhos na saída pública.
- Ensaio no Chromium real com servidor de produção Node do mesmo projeto e entrega HTTP do worker pelo servidor estático do ensaio: critérios de instalação sem erros, controle efetivo pelo worker, cache limitado aos seis arquivos públicos, falta de rede e reconexão na rota `/caixa`, preservação de edição ao tentar atualizar, bloqueio com segunda aba e ativação de uma segunda versão após fechá-la, removendo o cache público antigo. Layout móvel de 390 × 844 px sem estouro horizontal e sem erros de JavaScript.

O comando `vite preview` desta versão da base procura um arquivo SSR ausente (`dist/server/server.js`). Para o ensaio local foi usado `NITRO_PRESET=node-server npm run build` e `PORT=5182 HOST=127.0.0.1 node .output/server/index.mjs`. O teste de segunda publicação entrega o worker atualizado por um servidor HTTP estático, pois os metadados de ETag/tamanho do Nitro ficam fixos no bundle e não representam uma nova publicação quando apenas se altera um arquivo na saída de um servidor já iniciado. As páginas e os assets do app vêm do build de produção, sem substituir respostas de API. Depois do ensaio, o build padrão foi executado novamente para confirmar a saída Cloudflare usada no Lovable. O alvo da publicação não foi alterado no código.

Validação de instalação e execução em um iPhone físico e Android físico continua sendo uma checagem de aceite no endereço publicado. Emulação e critérios do Chromium não substituem Safari/iOS real. Não foram criadas contas nem registros de teste no Supabase nesta etapa.

## Referências consultadas

- [MDN — critérios e diferenças de instalação](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable)
- [MDN — service workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers)
- [Apple — instalar um site como aplicativo](https://support.apple.com/en-lamr/guide/iphone/iphea86e5236/ios)
- [Google/Workbox — ciclo de vida](https://developer.chrome.com/docs/workbox/service-worker-lifecycle)
- [Google/Workbox — respostas de fallback](https://developer.chrome.com/docs/workbox/managing-fallback-responses)
- [Vite PWA — atualização controlada e SSR](https://vite-pwa-org.netlify.app/guide/prompt-for-update)

A próxima etapa segue sendo 12: revisão geral e aceite, incluindo a instalação pelo proprietário no aparelho real. Lojas de aplicativos, push e lançamentos offline não fazem parte desta etapa.
