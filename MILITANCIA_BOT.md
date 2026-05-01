# Bot de Militância – Documentação Técnica

> **Central de Mobilização da Militância** — bot WhatsApp serverless para engajamento político, gamificação e mobilização comunitária.
>
> **Versão do documento:** maio/2026 — gerado a partir do código-fonte real. Tudo aqui foi verificado arquivo por arquivo.

---

## Índice

1. [Visão Geral](#visão-geral)
2. [Sistema de Gamificação](#sistema-de-gamificação)
3. [Análise de Gamificação](#análise-de-gamificação)
4. [Código – Arquivos e Responsabilidades](#código--arquivos-e-responsabilidades)
5. [Planilhas Google Sheets](#planilhas-google-sheets)
6. [O que precisa ser feito nas Planilhas](#o-que-precisa-ser-feito-nas-planilhas)
7. [Estruturas de Dados](#estruturas-de-dados)
8. [Flows de Mensagens](#flows-de-mensagens)
9. [Variáveis de Ambiente](#variáveis-de-ambiente)
10. [Observações Técnicas](#observações-técnicas)

---

## Visão Geral

O bot de militância é um módulo do **waclient**, sistema serverless no Vercel que recebe mensagens via WhatsApp Cloud API. Objetivos:

- Cadastrar militantes e armazenar perfil em Google Sheets.
- Engajar com missões diárias, pontuação, níveis e conquistas (data-driven).
- Registrar denúncias, confirmações de eventos e acessos a conteúdos.
- Mapear interesse em liderança.
- Rastrear recrutamento por número de membro (`#42`) ou texto livre (rede social).

```
WhatsApp Cloud API
       ↓ (webhook POST)
   api/webhook.ts
       ↓
ConversationManager.processarWebhook()
       ↓
MilitanciaManager.processar()
       ↓
 [conversa.isHuman = true] → silêncio (operador responde manualmente)
 [stage legado: cadastro_nome/bairro/cidade] → limpa stage, cai no fluxo da planilha
 [stage ativo] → processarStage()
 [militante cadastrado completo] → atualizarUltimaInteracao() + processarMenuOuComando()
 [militante incompleto] → deriva etapa do cadastro pelos campos vazios na planilha
 [telefone não existe] → registrarContato() + WELCOME_FIRST_CONTACT
       ↓
militanciaSheet.ts (Google Sheets API)
       ↓
[conquistas?] → obterConquistas() [cache 1h] → verificarConquistasDataDriven() → atualizarTitulos()
               ↓ se aba vazia
           verificarConquistas() + verificarStreakMilestones() [legado hardcoded]
```

---

## Sistema de Gamificação

### Pontos

Acumulados na coluna `G` (`pontos`) da aba **Militantes**. São a base de todos os rankings.

| Ação | Pontos |
|------|-------:|
| Missão concluída (streak 1–6 dias) | **10** |
| Missão concluída (streak 7–29 dias) | **15** (+5 bônus) |
| Missão concluída (streak 30+ dias) | **20** (+10 bônus) |
| Confirmar presença em evento | **+5** |
| Enviar denúncia comunitária | **+8** |
| Acessar conteúdo | **+3** |
| Recrutar um novo militante | **+15** (creditados ao recrutador) |

### Níveis (baseados em `missoes_concluidas`)

| Nível | Nome | Missões |
|------:|------|--------:|
| 1 | Novato 🌱 | 0 |
| 2 | Apoiador ✊ | 5 |
| 3 | Ativista 🔴 | 15 |
| 4 | Militante ⚡ | 40 |
| 5 | Espartano 🦱 | 80 |
| 6 | Missionário 🌟 | 150 |

> **Nota:** o emoji do Espartano no código é `🦱` (não `🦁`).

```typescript
// calcularNivel() em militanciaSheet.ts
if (missoes >= 150) return 6;
if (missoes >= 80)  return 5;
if (missoes >= 40)  return 4;
if (missoes >= 15)  return 3;
if (missoes >= 5)   return 2;
return 1;
```

### Streak (Sequência diária)

Lógica em `atualizarMissoesStreakNivel()`: se `ultima_missao_data` (col K) for **ontem** no fuso `America/Sao_Paulo` → `streak + 1`; caso contrário, `streak = 1`. A verificação usa a função `isOntem()` que parseia datas no formato `dd/mm/aaaa`.

### Sistema de Conquistas — Data-driven

A aba `conquistas` do Sheets define todas as conquistas. Se a aba estiver vazia, o sistema faz fallback para conquistas hardcoded.

**Fluxo:**
1. `obterConquistas()` — lê a aba, faz cache de **1 hora em memória** (`_conquistasCache`).
2. `verificarConquistasDataDriven(militante, conquistas)` — função pura, retorna novas conquistas.
3. `verificarERegistrarConquistas(celular, militante?)` — orquestra: busca militante se necessário, chama data-driven ou legado, chama `atualizarTitulos()`.

**Quando conquistas são verificadas:**

| Evento | Verificação |
|--------|-------------|
| Missão concluída | ✅ em `registrarRespostaMissao()` |
| Confirmação de evento (`sim`) | ✅ em `processarStage('evento_confirmacao')` |
| Denúncia enviada | ✅ em `processarStage('denuncia_descricao')` |

**Tipos de gatilho suportados no código:**

| `tipo_gatilho` | Campo do militante usado |
|----------------|--------------------------|
| `missoes` | `missoesConcluidasTotal` |
| `streak` | `streakAtual` |
| `denuncias` | `denunciasEnviadas` |
| `eventos` | `eventosConfirmados` (col R) |
| `recrutados` | `militantesRecrutados` |
| `pontos` | `pontos` |

### Sistema Legado (fallback quando aba `conquistas` está vazia)

Conquistas hardcoded em `verificarConquistas()` + milestones de streak em `verificarStreakMilestones()`:

| ID | Nome | Critério |
|----|------|----------|
| `1` | Recruta | 1ª missão |
| `2` | Ativista | 7 missões |
| `3` | Combatente | 30 missões |
| `4` | Porta-Voz | 20 conteúdos |
| `5` | Articulador | 3 recrutados |
| `6` | Fiscal das Ruas | 3 denúncias |
| `7` | Semana em Campo | streak 7 |
| `8` | Mês em Campo | streak 30 |
| `9` | Ativista Prata | 20 missões |
| `10` | Ativista Ouro | 50 missões |
| `11` | Combatente Prata | 80 missões |
| `12` | Combatente Ouro | 120 missões |
| `13` | Veterano da Causa | 180 missões |
| `14` | Semana em Campo Prata | streak 14 |
| `15` | Mês em Campo Ouro | streak 60 |
| `16` | Incansável | streak 90 |
| `17` | Porta-Voz Prata | 40 conteúdos |
| `18` | Porta-Voz Ouro | 60 conteúdos |
| `19` | Articulador Prata | 7 recrutados |
| `20` | Articulador Ouro | 15 recrutados |
| `21` | Fiscal Prata | 7 denúncias |
| `22` | Fiscal Ouro | 15 denúncias |
| `23` | Força do Movimento | 500 pontos |
| `24` | Pilar da Causa | 1000 pontos |

### Nível Coletivo do Bairro (`calcularNivelBairro`)

| Nível | Missões totais do bairro |
|------:|--------------------------|
| 0 | < 50 |
| 1 | ≥ 50 |
| 2 | ≥ 120 |
| 3 | ≥ 250 |
| 4 | ≥ 400 |

### Número de Membro (`posicao`, col R)

Cada militante recebe um número sequencial **no momento em que conclui o cadastro** (nome + bairro + cidade preenchidos). É exibido no menu como `🔢 Membro #42` e pode ser usado no recrutamento: ao informar `#42` no campo de origem, o sistema resolve o telefone do recrutador e credita os pontos.

> **Nota:** o número só é atribuído em `atualizarDataCadastro()`, que é chamado quando a cidade é salva. Contatos que nunca completam o cadastro não recebem número.

---

## Análise de Gamificação

> Estudo completo do que existe, do que funciona, do que estava quebrado e do que pode ser melhorado.

### O que funciona corretamente

| Mecanismo | Como funciona | Status |
|-----------|--------------|--------|
| **Pontos** | Acumulados por missão (10–20), evento (+5), denúncia (+8), conteúdo (+3), recrutamento (+15 ao recrutador) | ✅ |
| **Streak diário** | `isOntem()` verifica a data da última missão. Bônus de +5 pts no streak ≥7, +10 no streak ≥30 | ✅ |
| **Níveis por missões** | 6 níveis, thresholds: 5/15/40/80/150. Calcula e persiste em batchUpdate | ✅ |
| **Notificação de level-up** | `NIVEL_SUBIU` enviado imediatamente após `atualizarMissoesStreakNivel` | ✅ |
| **Conquistas após missão** | `verificarERegistrarConquistas` chamado após `registrarRespostaMissao` com militante já atualizado | ✅ |
| **Conquistas após denúncia** | `incrementarContador('M')` é awaited antes de `verificarERegistrarConquistas` | ✅ |
| **Ranking de bairros** | Lê E:G (bairro, nivel, pontos), agrupa por bairro, ordena por soma de pontos. Cache 5 min | ✅ |
| **Dashboard pessoal** | Posição no bairro e geral por pontos. Social proof: exibe ≥3 mesmo com menos | ✅ |
| **Recrutamento por #N** | `registrarOrigem` resolve posicao → phone via col R, credita O+15pts ao recrutador | ✅ |
| **Conquistas data-driven** | Aba `conquistas` com TTL 1h. Fallback para 24 títulos hardcoded se aba vazia | ✅ |
| **Número de membro (#42)** | Atribuído apenas ao concluir cadastro (nome+bairro+cidade). Exibido no PERFIL e CADASTRO_SUCESSO | ✅ corrigido |

### Bugs corrigidos nesta versão

| Bug | Causa | Correção |
|-----|-------|---------|
| **Número de membro atribuído no primeiro contato** | `registrarContato()` calculava e salvava posicao em col U para qualquer pessoa que mandasse uma mensagem, sem ter completado o cadastro | `registrarContato()` não atribui mais posicao. `atualizarDataCadastro()` (chamada quando nome+bairro+cidade estão completos) agora atribui o número sequencial e é `awaited` (não fire-and-forget) |
| **`missoesConcluidasSemana` sempre zero no painel do bairro** | `obterPainelBairro()` lia col D da aba Missões para verificar status "concluído", mas col D nunca é escrita por nenhuma função | Corrigido para ler col C (`concluiram` = CSV de telefones) e contar completações dos membros do bairro nos últimos 7 dias |
| **Conquistas de conteúdo nunca disparavam** | Após o militante acessar conteúdo (opção 3), `verificarERegistrarConquistas` nunca era chamado | Adicionado check de conquistas fire-and-forget após registrar acesso a conteúdo em `processarMenuOuComando` |
| **Conquistas de recrutamento nunca disparavam** | `registrarOrigem()` creditava +15 pts e incrementava col O para o recrutador, mas `verificarERegistrarConquistas` nunca era chamado para ele | Adicionado `verificarERegistrarConquistas(recrutadorPhone)` após crédito. O incremento de col O também passou a ser `awaited` para que o check veja o valor atualizado |
| **Conquistas de eventos com race condition** | `incrementarContador('R')` era fire-and-forget em `registrarConfirmacaoEvento()`, mas `verificarERegistrarConquistas` era chamado logo depois no stage — podendo ler o valor antigo de col R | `incrementarContador(celular, 'R')` agora é awaited dentro de `registrarConfirmacaoEvento()` |

### O que não deveria estar sendo usado

| Item | Motivo |
|------|--------|
| **`PEDIR_FOTO_DENUNCIA`** | Mensagem definida em `militanciaMessages.ts` mas nunca enviada. Não existe stage `denuncia_foto`. Foto de denúncia não é processada pelo bot — gera expectativa falsa se enviada manualmente |
| **`COMANDO_NAO_RECONHECIDO`** | Definido mas nunca chamado. O fallback de comando desconhecido usa `MENU_PERSONALIZADO`, que é mais útil |
| **Stage `lideranca_disponibilidade`** | Backward-compat only. O fluxo novo vai direto de `lideranca_area` para `LIDERANCA_REGISTRADA` sem coletar disponibilidade. A coluna F da aba Liderança nunca é preenchida para usuários novos |
| **`obterTitulosSheet()`** | Função exportada que lê a aba `Títulos`. Nunca chamada em `MilitanciaManager` nem em nenhum outro arquivo ativo. O sistema de títulos usa `TITULOS_PADRAO` (hardcoded) como fallback, não essa função |
| **Nível baseado só em missões** | O campo `nivel` (col F) só avança por missões concluídas. Usuários que fazem muitas denúncias, confirmam eventos e recrutam acumulam pontos mas ficam no nível 1 para sempre se não fizerem missões. Isso cria uma percepção de "nível" irrelevante para quem não faz missões diárias |

### Mecanismos sub-utilizados (funcionam mas poderiam fazer mais)

| Mecanismo | Situação atual | Oportunidade |
|-----------|---------------|--------------|
| **`eventosConfirmados` (col R)** | Incrementado e verificado para conquistas. Mas o bot não envia confirmação após conquista de evento (a notificação vai no próximo acesso) | Enviar notificação de conquista logo após confirmação — já implementado, mas depende de conquistas configuradas na aba `conquistas` |
| **`conteudosCompartilhados` (col N)** | Incrementado. Conquistas agora verificadas após acesso (bug corrigido). Mas o contador cresce mesmo que a conquista não esteja configurada na aba | Criar conquistas na aba `conquistas` para os marcos: 20, 40, 60 conteúdos |
| **`militantesRecrutados` (col O)** | Incrementado e conquistas agora verificadas (bug corrigido). Mas o recrutador não recebe notificação quando alguém usa seu código | Difícil sem um canal de notificação proativo, mas já funciona no nível de conquistas |
| **Painel do bairro** | Mostra militantes ativos, pontos, nível do bairro, líder. Mas `missoesConcluidasSemana` era sempre 0 (bug corrigido) | Com o bug corrigido, o painel agora mostra completações reais dos últimos 7 dias |
| **Conquistas data-driven** | Sistema completo implementado com cache 1h. Mas se a aba `conquistas` estiver vazia, cai no fallback hardcoded sem emojis personalizados nem descrições | Preencher a aba `conquistas` com as 24 conquistas do TITULOS_PADRAO + customizações |

### O que poderia ser adicionado profissionalmente

> Estas sugestões NÃO estão implementadas. São recomendações baseadas em gamificação comprovada para aplicações de mobilização cívica.

| Mecanismo | Impacto | Complexidade |
|-----------|---------|-------------|
| **Bônus de onboarding** | Concluir o cadastro dá +20 pts e título "Recruta" imediatamente, criando primeira experiência de recompensa | Baixa |
| **Missão semanal coletiva** | Meta do bairro: "100 missões até domingo". Todos os membros do bairro veem o progresso. Cria senso de propósito coletivo | Média |
| **Nível baseado em engajamento total** | Nível atual = missões. Proposta: pontos gerais determinam o nível (missão ainda vale mais). Quem só faz denúncias avança | Média |
| **Lembretes de streak** | Se o militante fez missão ontem mas ainda não fez hoje (consulta a col K), enviar lembrete às 20h | Alta (requer cron job / scheduler) |
| **Quadro de honra mensal** | Top 3 por pontos do mês. Enviado para todos no 1º dia do mês seguinte | Alta (requer cron + broadcast) |
| **Conquista por tempo de cadastro** | "Veterano" para quem está ativo há 30/90/180 dias. Incentiva retenção de longo prazo | Baixa |
| **Compartilhamento do resultado** | MISSAO_CONCLUIDA poderia sugerir "compartilhe seu progresso: Sou Militante ⚡ #42" | Baixa |

---

## Código – Arquivos e Responsabilidades

```
src/
├── config.ts                    # Variáveis de ambiente e configurações globais
├── inbox/
│   ├── ConversationManager.ts   # Recebe webhooks, mantém estado da conversa (Redis/tmp)
│   ├── MilitanciaManager.ts     # Orquestrador: roteia stages e comandos do menu
│   └── militanciaMessages.ts    # Templates de todas as mensagens do bot
└── utils/
    └── militanciaSheet.ts       # Toda a lógica de leitura/escrita nas planilhas
```

### `MilitanciaManager.ts` — Métodos públicos e privados

| Método | Tipo | Responsabilidade |
|--------|------|-----------------|
| `processar(celular, texto, conversa)` | public async | Ponto de entrada — deriva estado e roteia |
| `processarStage(...)` | private async | Switch para cada stage ativo |
| `processarMenuOuComando(...)` | private async | Interpreta comandos de usuário cadastrado |
| `enviarConteudoEEvento(celular)` | private async | Envia conteúdo + evento para não-cadastrados |
| `detectarRespostaMissao(textoNorm)` | private | Retorna `'concluído'` ou `'pendente'` |
| `isSaudacao(textoNorm)` | private static | Detecta saudações que reiniciam o fluxo |

**Palavras reconhecidas como missão concluída:** `1`, `já fiz`, `já`, `fiz`, `concluído`, `feito`, `ok`, `✅`, `sim` (e qualquer texto que comece com essas palavras).

**Saudações reconhecidas (reiniciam o fluxo de cadastro):** `ola`, `oi`, `hello`, `hi`, `hey`, `bom dia`, `boa tarde`, `boa noite`, `inicio`, `iniciar`, `comecar`, `recomecar`, `reiniciar`, `voltar`.

### `militanciaSheet.ts` — Funções exportadas

**Busca e cadastro**

| Função | Descrição |
|--------|-----------|
| `buscarMilitante(celular)` | Lê `A:R`, retorna `MilitanteInfo` ou `null`. Quando há duplicatas, prefere a linha incompleta (scoreMilitante) |
| `buscarMilitantePorPosicao(posicao)` | Busca por col R. Usado no recrutamento por `#42` |
| `isCadastroCompleto(militante)` | Retorna `true` se `nome`, `bairro` e `cidade` estão preenchidos |
| `registrarContato(celular)` | Idempotente — só insere se telefone não existe |
| `registrarMilitante(nome, celular, bairro, cidade)` | Insere linha completa com `posicao` |
| `contarMilitantes()` | Conta linhas com `nome` preenchido. Fallback para `posicao` quando col U está vazia |
| `atualizarCamposMilitante(celular, campos)` | Atualiza `nome` (B), `cidade` (D) ou `bairro` (E) sem duplicar linha |
| `atualizarDataCadastro(celular)` | Escreve `dataAtual()` em col O (`data_cadastro`); atribui número sequencial de membro em col R (`posicao`) |
| `atualizarUltimaInteracao(celular)` | Escreve `dataAtual()` em col H |
| `registrarOrigem(celular, origem)` | Aceita `#42` ou número de posição (1–5 dígitos) — resolve o recrutador e credita +15 pts + incrementa col N. Aceita texto livre (rede social) — salva em col P. **Não aceita telefone.** |

**Gamificação**

| Função | Descrição |
|--------|-----------|
| `registrarRespostaMissao(celular, missao)` | Atualiza col C da aba Missões + chama `atualizarMissoesStreakNivel` + `verificarERegistrarConquistas` |
| `atualizarMissoesStreakNivel(celular)` | `batchUpdate` de 6 colunas em 1 chamada: F (nivel), G (pontos), H (ultima_interacao), I (missoes), J (streak), K (ultima_missao_data) |
| `atualizarPontosENivel(celular, pontos)` | Incrementa só col G. Usado para eventos (+5), denúncias (+8), conteúdo (+3), recrutamento (+15) |
| `calcularPontosMissao(streak)` | `streak≥30→20`, `streak≥7→15`, senão `10` |
| `calcularNivel(missoes)` | Retorna 1–6 |
| `nomeDoNivel(nivel)` | Ex: `"Espartano 🦱"` |
| `calcularNivelBairro(missoes)` | Retorna 0–4 |

**Conquistas data-driven**

| Função | Descrição |
|--------|-----------|
| `obterConquistas()` | Lê aba `conquistas`, cache em memória 1h. Retorna `[]` se vazia |
| `verificarConquistasDataDriven(militante, conquistas)` | Função pura. Retorna `ConquistaDefinicao[]` novas |
| `verificarERegistrarConquistas(celular, militante?)` | Orquestra: data-driven se aba preenchida, legado se vazia |
| `verificarConquistas(militante)` | Legado hardcoded — retorna IDs numéricos `string[]` |
| `verificarStreakMilestones(titulos, streak)` | Legado — verifica IDs 7, 8, 14, 15, 16 |
| `resolverNomeTitulo(id)` | Resolve ID ou slug → nome. Prioridade: `TITULOS_PADRAO[id]` → `_conquistasMap` (cache da aba) → formata slug |
| `obterTitulosSheet()` | Lê aba `Títulos`. Fallback para `TITULOS_PADRAO` |

**Conteúdo, eventos, denúncias, liderança**

| Função | Descrição |
|--------|-----------|
| `registrarAcessoConteudo(celular, conteudo, tipo)` | Localiza a linha do conteúdo na aba Conteúdos e adiciona o telefone em col E (acessos) com vírgula — sem criar nova linha. Fire-and-forget: +3 pts |
| `registrarConfirmacaoEvento(celular, nomeEvento, confirmado)` | Atualiza col F (confirmacoes) em Eventos + se `confirmado=true`: +5 pts (fire-and-forget) + incrementa col R (eventosConfirmados, fire-and-forget) |
| `registrarDenuncia(celular, bairro, descricao)` | Append em Denúncias + **awaita** `incrementarContador('M')` + fire-and-forget +8 pts. Retorna protocolo `D260501-1435` |
| `registrarInteresseLideranca(nome, celular, bairro, area, disponibilidade)` | Append em Liderança |
| `obterMissaoDia()` | Busca col A == hoje em Missões. Retorna `null` se não encontrar |
| `obterProximoEvento()` | Retorna o evento futuro mais próximo da aba Eventos |
| `obterProximosEventos(limite)` | Retorna até N eventos futuros ordenados por data |
| `obterUltimoConteudo(filtroTipo?)` | Último item catalog da aba Conteúdos, com filtro opcional |
| `obterUltimosConteudosPorTipo()` | Um item por tipo distinto (bottom-to-top = mais recente por tipo) |

### `militanciaMessages.ts` — Templates

| Chave | Tipo | Descrição |
|-------|------|-----------|
| `WELCOME_FIRST_CONTACT` | string | Primeiro contato: opções 1 (cadastrar) / 2 (ver novidades) |
| `WELCOME_SECOND_CONTACT` | string | Retorno sem cadastro completo |
| `WELCOME_NEW_USER` | string | Pede nome completo |
| `PEDIR_BAIRRO` | string | Pede bairro/distrito |
| `PEDIR_CIDADE` | string | Pede cidade |
| `PEDIR_ORIGEM` | string | Aceita `#42` (posição de membro) ou rede social. `0` para pular. **Não aceita mais telefone** |
| `CADASTRO_SUCESSO(nome, posicao)` | function | Boas-vindas + número de membro + instrução de recrutamento + menu |
| `ERRO_CADASTRO` | string | Erro genérico de salvamento |
| `MENU_PERSONALIZADO(nome, posicao?)` | function | Menu 1–5 com `🔢 Membro #N` quando `posicao` fornecida |
| `MENU` | string | Menu 1–5 sem nome (fallback e stage default) |
| `MISSAO(texto)` | function | Envia missão com instruções `Já fiz` / `Ainda não` |
| `MISSAO_CONCLUIDA(streak, pontos, pontosGanhos)` | function | Confirma com delta, bônus streak e motivação |
| `MISSAO_PENDENTE` | string | Confirma pendência |
| `NIVEL_SUBIU(nomeNivel)` | function | Notificação de level-up |
| `CONQUISTA_DESBLOQUEADA(conquista, missoesTotal)` | function | Usa `conquista.emoji`, `conquista.nome`, `conquista.descricao` |
| `EVENTOS(evento)` | function | Primeiro evento + prompt de confirmação (1️⃣ Sim / 2️⃣ Talvez) |
| `MOSTRAR_EVENTO(evento)` | function | Evento sem prompt (2º e 3º eventos) |
| `EVENTO_CONFIRMADO('sim'\|'talvez')` | function | Resposta à confirmação |
| `CONTEUDO(texto)` | function | Fallback quando env var é usado |
| `MOSTRAR_CONTEUDO(conteudo)` | function | Exibe conteúdo do Sheets com tipo, título e link |
| `MOSTRAR_NOVIDADES_FALLBACK` | string | Quando não há conteúdo nem evento cadastrado |
| `DENUNCIA_INICIO` | string | Pede bairro da denúncia |
| `PEDIR_DESCRICAO_DENUNCIA` | string | Pede descrição detalhada |
| `PEDIR_FOTO_DENUNCIA` | string | Existe no código mas **não é enviado em nenhum flow ativo** |
| `DENUNCIA_REGISTRADA(protocolo)` | function | Confirma com protocolo |
| `LIDERANCA_AGRADECIMENTO` | string | Agradece interesse |
| `LIDERANCA_OPCOES` | string | 4 opções de contribuição + nota de texto livre |
| `LIDERANCA_MENU` | string | **Legado** — mantido para compatibilidade, não é enviado |
| `PEDIR_DISPONIBILIDADE` | string | **Legado** — mantido para compatibilidade, só usado em stage `lideranca_disponibilidade` (backward-compat) |
| `LIDERANCA_REGISTRADA` | string | Confirma registro |
| `COMANDO_NAO_RECONHECIDO` | string | Definido mas **não é usado** — comandos não reconhecidos mostram `MENU_PERSONALIZADO` |

---

## Planilhas Google Sheets

### Aba: `Militantes`

> `GOOGLE_MILITANTES_SHEET_NAME` (padrão: `Militantes`)

| Col | Índice | Campo | Tipo | Descrição |
|-----|--------|-------|------|-----------|
| A | 0 | `data_inscricao` | string dd/mm/aaaa | Data do primeiro contato |
| B | 1 | `nome` | string | Nome completo |
| C | 2 | `telefone` | string (só dígitos) | Telefone normalizado |
| D | 3 | `cidade` | string | Cidade |
| E | 4 | `bairro` | string | Bairro |
| F | 5 | `nivel` | number 1–6 | Calculado por missões |
| G | 6 | `pontos` | number | Base dos rankings |
| H | 7 | `ultima_interacao` | string dd/mm/aaaa | Última mensagem recebida |
| I | 8 | `missoes_concluidas` | number | Total histórico |
| J | 9 | `streak_atual` | number | Dias consecutivos |
| K | 10 | `ultima_missao_data` | string dd/mm/aaaa | Data da última missão |
| L | 11 | `titulos` | string CSV | IDs ou slugs separados por vírgula |
| M | 12 | `denuncias_enviadas` | number | Total de denúncias |
| N | 13 | `militantes_recrutados` | number | Total de indicados |
| O | 14 | `data_cadastro` | string dd/mm/aaaa | Data em que nome+bairro+cidade foram concluídos |
| P | 15 | `origem` | string | `#42 (Nome)` ou rede social |
| Q | 16 | `eventosConfirmados` | number | Total de confirmações de evento com "sim" |
| R | 17 | `posicao` | number | Número sequencial de membro (ex: 42) |

**Cabeçalho (linha 1) obrigatório:**
```
data_inscricao | nome | telefone | cidade | bairro | nivel | pontos | ultima_interacao | missoes_concluidas | streak_atual | ultima_missao_data | titulos | denuncias_enviadas | militantes_recrutados | data_cadastro | origem | eventosConfirmados | posicao
```

---

### Aba: `conquistas`

> `GOOGLE_CONQUISTAS_SHEET_NAME` (padrão: `conquistas`)
>
> Se vazia → fallback para conquistas hardcoded legadas.

| Col | Campo | Tipo | Descrição |
|-----|-------|------|-----------|
| A | `id` | string slug | Ex: `primeira_missao` |
| B | `nome` | string | Exibido ao militante |
| C | `descricao` | string | Exibido na notificação |
| D | `emoji` | string | Ex: `🏆` |
| E | `tipo_gatilho` | enum | `missoes` \| `streak` \| `denuncias` \| `eventos` \| `recrutados` \| `pontos` |
| F | `valor_gatilho` | number | Limiar numérico |
| G | `ativo` | string `TRUE`/`FALSE` | `FALSE` = desativada |
| H | `ordem` | number | Ordem de exibição |

---

### Aba: `Missões`

> `GOOGLE_MISSOES_SHEET_NAME` (padrão: `Missões`)

| Col | Campo | Descrição |
|-----|-------|-----------|
| A | `data` | Data dd/mm/aaaa — bot busca por `== hoje` |
| B | `missao` | Texto da missão |
| C | `concluiram` | CSV de telefones que confirmaram conclusão |

Se não encontrar linha com data de hoje → fallback para `config.militancia.missaoDia` (env `MISSAO_DO_DIA`).

---

### Aba: `Conteúdos`

> `GOOGLE_CONTEUDOS_SHEET_NAME` (padrão: `Conteúdos`)

Duplo uso: **catálogo** (col B = título) e **log de acessos** (col B = telefone). A função `isCatalogRow()` distingue verificando se col B tem 10–13 dígitos.

| Col | Campo (catálogo) | Descrição |
|-----|------------------|-----------|
| A | `data` | Data de publicação |
| B | `titulo` | Título do conteúdo |
| C | `link` | URL (opcional) |
| D | `tipo` | `instagram`, `video`, `youtube`, `artigo`, `tiktok`, etc. |
| E | `acessos` | Não usado pelo bot atualmente |

---

### Aba: `Eventos`

> `GOOGLE_EVENTOS_SHEET_NAME` (padrão: `Eventos`)

| Col | Campo | Descrição |
|-----|-------|-----------|
| A | `nome` | Nome do evento |
| B | `texto` | Descrição (opcional) |
| C | `data` | Data dd/mm/aaaa |
| D | `hora` | Ex: `19h00` (opcional) |
| E | `local` | Endereço (opcional) |
| F | `confirmacoes` | CSV de telefones confirmados |

Eventos com data < hoje são filtrados. Eventos sem data aparecem no final da lista.

---

### Aba: `Denúncias`

> `GOOGLE_DENUNCIAS_SHEET_NAME` (padrão: `Denúncias`)

| Col | Campo | Descrição |
|-----|-------|-----------|
| A | `data` | Data da denúncia |
| B | `telefone` | Telefone normalizado |
| C | `bairro` | Bairro informado |
| D | `descricao` | Descrição do problema |
| E | `protocolo` | Código: `D260501-1435` (D + YYMMDD-HHMM) |

---

### Aba: `Liderança`

> `GOOGLE_LIDERANCA_SHEET_NAME` (padrão: `Liderança`)

| Col | Campo | Descrição |
|-----|-------|-----------|
| A | `data` | Data do registro |
| B | `nome` | Nome |
| C | `telefone` | Telefone |
| D | `bairro` | Bairro |
| E | `area` | Área de interesse |
| F | `disponibilidade` | Preenchido apenas no fluxo legado `lideranca_disponibilidade` |

**Áreas mapeadas pelo código:**

| Tecla | Área registrada |
|-------|----------------|
| `1` | Fazer uma doação |
| `2` | Organizar reuniões no meu bairro |
| `3` | Ajudar com minha experiência profissional |
| `4` | Participar de pesquisas e estratégias |
| outro | texto livre enviado pelo usuário |

---

### Aba: `Títulos` (fallback legado)

> `GOOGLE_TITULOS_SHEET_NAME` (padrão: `Títulos`)

Substituída pela aba `conquistas`. Lida por `obterTitulosSheet()` mas raramente usada em produção. Estrutura: `id | nome | criterio`.

---

## O que precisa ser feito nas Planilhas

### 1. Criar aba `conquistas` (obrigatório para gamificação data-driven)

Cabeçalho na linha 1: `id | nome | descricao | emoji | tipo_gatilho | valor_gatilho | ativo | ordem`

Sem essa aba populada, o sistema usa os **24 títulos hardcoded legados** da lista TITULOS_PADRAO — funciona, mas não tem emojis personalizados nem série de eventos.

### 2. Verificar cabeçalho da aba `Militantes` (18 colunas A–R)

A planilha deve ter exatamente 18 colunas. Se havia colunas N (`conteudos_compartilhados`), S (`recrutadoPor`) ou T (`ativo`) e foram deletadas, o layout atual é:

```
A=data_inscricao, B=nome, C=telefone, D=cidade, E=bairro, F=nivel, G=pontos,
H=ultima_interacao, I=missoes_concluidas, J=streak_atual, K=ultima_missao_data,
L=titulos, M=denuncias_enviadas, N=militantes_recrutados, O=data_cadastro,
P=origem, Q=eventosConfirmados, R=posicao
```

### 3. Inserir missões (uma linha por dia)

Formato: `dd/mm/aaaa | texto da missão`. Sem linha para hoje → bot usa fallback do env `MISSAO_DO_DIA`.

### 4. Inserir conteúdos e eventos direto no Sheets

Os env vars `NOVO_CONTEUDO`, `PROXIMOS_EVENTOS` e `MISSAO_DO_DIA` são apenas fallback. O Sheets tem prioridade.

---

## Estruturas de Dados

### `MilitanteInfo`

```typescript
export type MilitanteInfo = {
  dataInscricao: string;
  nome: string;
  celular: string;
  bairro: string;
  cidade: string;
  nivel: number;                    // 1–6
  pontos: number;
  dataUltimaInteracao: string;
  missoesConcluidasTotal: number;
  streakAtual: number;
  ultimaMissaoData: string;
  titulos: string;                  // CSV de IDs ou slugs
  denunciasEnviadas: number;
  militantesRecrutados: number;
  eventosConfirmados: number;       // col Q
  posicao: number;                  // col R — número sequencial de membro
};
```

### `ConquistaDefinicao`

```typescript
export type ConquistaDefinicao = {
  id: string;
  nome: string;
  descricao: string;
  emoji: string;
  tipoGatilho: 'missoes' | 'streak' | 'denuncias' | 'eventos' | 'recrutados' | 'pontos';
  valorGatilho: number;
  ativo: boolean;
  ordem: number;
};
```

### `MissaoResultado`

```typescript
export type MissaoResultado = {
  levelUp: boolean;
  nivelAnterior: number;
  novoNivel: number;
  novasConquistas: ConquistaDefinicao[];  // objetos completos (não IDs)
  streakAtual: number;
  missoesConcluidasTotal: number;
  pontos: number;       // total após a missão
  pontosGanhos: number; // delta: 10, 15 ou 20
};
```

### `militanciaStage` — estados ativos

```typescript
conversa.militanciaStage?:
  | 'cadastro_origem'           // aguarda recrutador (#42 ou rede social)
  | 'missao_resposta'           // aguarda "já fiz" ou "ainda não"
  | 'evento_confirmacao'        // aguarda "1/sim" ou "2/talvez"
  | 'lideranca_area'            // aguarda opção 1–4 de contribuição
  | 'lideranca_disponibilidade' // legado (backward-compat — registra disponibilidade)
  | 'denuncia_bairro'           // aguarda nome do bairro
  | 'denuncia_descricao'        // aguarda descrição do problema
```

**Stages limpos automaticamente:** `cadastro_nome`, `cadastro_bairro`, `cadastro_cidade` — quando encontrados, o bot os apaga e deriva o estado da planilha.

### `Conversation` (campos relevantes)

```typescript
// Definida em ConversationManager.ts
conversa.isHuman: boolean                 // true = bot silencia, operador responde
conversa.militanciaStage?: string
conversa.militanciaData?: {
  cadastroIniciado?: boolean              // true após usuário pressionar "1" no WELCOME_SECOND_CONTACT
  missao?: string                         // texto da missão do dia salvo no stage
  evento?: string                         // nome do evento salvo no stage
  bairro?: string                         // bairro coletado no stage denuncia_bairro
  area?: string                           // área coletada no stage lideranca_area (legado)
}
```

---

## Flows de Mensagens

### Flow 1 — Primeiro Contato (telefone novo)

```
Usuário envia qualquer mensagem
        ↓
registrarContato() — idempotente, atribui posicao (col U)
        ↓
Bot → WELCOME_FIRST_CONTACT ("1 Participar" ou "2 Ver novidades")

Próximas mensagens (estado derivado da planilha):
  cadastroIniciado=false + opção 2 → enviarConteudoEEvento()
  cadastroIniciado=false + opção 1 → cadastroIniciado=true, vai para próximo campo vazio
  cadastroIniciado=false + outra → WELCOME_SECOND_CONTACT

  cadastroIniciado=true:
    nome vazio → atualizarCamposMilitante({nome}) → PEDIR_BAIRRO
    bairro vazio → atualizarCamposMilitante({bairro}) → PEDIR_CIDADE
    cidade vazia → atualizarCamposMilitante({cidade}) + atualizarDataCadastro()
                 → stage: 'cadastro_origem' → PEDIR_ORIGEM

  stage 'cadastro_origem':
    #42 ou dígitos (1–5) → buscarMilitantePorPosicao() → credita recrutador (+15 pts, col N), salva col P
    texto livre (rede social) → salva só col P
    0 / pular → pula
    → CADASTRO_SUCESSO(nome, posicao_do_militante_ou_contarMilitantes())
```

### Flow 2 — Missão do Dia

```
"1" / "missao" / "missão de hoje"
        ↓
obterMissaoDia() → fallback: config.militancia.missaoDia (env MISSAO_DO_DIA)
Se vazio → mensagem de erro + menu
        ↓
Bot → MISSAO(texto) + stage: 'missao_resposta', data: { missao }
        ↓
Usuário responde
detectarRespostaMissao() → "concluído" ou "pendente"

  "concluído":
    registrarRespostaMissao()
      → atualiza col C da aba Missões (adiciona tel a concluiram)
      → atualizarMissoesStreakNivel() [batchUpdate: F,G,H,I,J,K]
      → verificarERegistrarConquistas()
    Bot → MISSAO_CONCLUIDA(streak, pontos, pontosGanhos)
    Se levelUp → NIVEL_SUBIU(nomeNivel)
    Para cada conquista → CONQUISTA_DESBLOQUEADA(conquista.emoji + nome + descricao)

  "pendente":
    Bot → MISSAO_PENDENTE
```

### Flow 3 — Eventos

```
"2" / "eventos"
        ↓
obterProximosEventos(3) → até 3 eventos futuros
Sem eventos → mensagem de erro + menu
        ↓
Bot → EVENTOS(eventos[0])  ← inclui prompt "Sim / Talvez"
Bot → MOSTRAR_EVENTO(eventos[1])  ← sem prompt (fire-and-forget)
Bot → MOSTRAR_EVENTO(eventos[2])  ← sem prompt (fire-and-forget)
stage: 'evento_confirmacao', data: { evento: eventos[0].nome }
        ↓
"1" / "sim" / "vou":
    registrarConfirmacaoEvento(celular, nomeEvento, true)
      → +5 pts (fire-and-forget) + incrementa col R (fire-and-forget)
    Bot → EVENTO_CONFIRMADO("sim")
    verificarERegistrarConquistas() → CONQUISTA_DESBLOQUEADA se novas

"2" / qualquer outra:
    registrarConfirmacaoEvento(celular, nomeEvento, false)
    Bot → EVENTO_CONFIRMADO("talvez")
```

### Flow 4 — Denúncia Comunitária

```
"4" / "denuncia"
        ↓
Bot → DENUNCIA_INICIO + stage: 'denuncia_bairro'
        ↓
Usuário envia bairro
Bot → PEDIR_DESCRICAO_DENUNCIA + stage: 'denuncia_descricao'
        ↓
Usuário descreve o problema
    registrarDenuncia(celular, bairro, descricao)
      → appendRow em Denúncias
      → await incrementarContador(celular, 'M')   ← aguardado
      → +8 pts (fire-and-forget)
    Bot → DENUNCIA_REGISTRADA(protocolo)
    verificarERegistrarConquistas()
      → CONQUISTA_DESBLOQUEADA se novas denúncias desbloquearam conquista
```

### Flow 5 — Conteúdo

```
"3" / "conteudo"
        ↓
obterUltimosConteudosPorTipo() → um item por tipo distinto (mais recente)
Se tem conteúdos:
    Para cada conteúdo → MOSTRAR_CONTEUDO(c)
    registrarAcessoConteudo() fire-and-forget (+3 pts, incrementa col N)
Senão:
    fallback env NOVO_CONTEUDO → CONTEUDO(texto)
    registrarAcessoConteudo() fire-and-forget
```

### Flow 6 — Quero Contribuir (Liderança)

```
"5" / "liderança" / "quero ajudar" / "assumir responsabilidade"
        ↓
Bot → LIDERANCA_AGRADECIMENTO
Bot → LIDERANCA_OPCOES (4 opções)
stage: 'lideranca_area'
        ↓
Usuário escolhe 1/2/3/4 ou texto livre
registrarInteresseLideranca(nome, celular, bairro, area, '')
    ← disponibilidade não é mais coletada no fluxo novo
Bot → LIDERANCA_REGISTRADA
```

### Flow 7 — Comandos Globais (usuário cadastrado)

| Comando(s) | Ação | Muta estado? |
|-----------|------|:---:|
| `menu`, `ajuda`, `help`, `inicio`, `início`, `voltar` | MENU_PERSONALIZADO | não |
| `1`, `missao`, `missão`, `missao de hoje`, `missão de hoje` | Missão do dia | sim |
| `2`, `eventos`, `evento`, `proximos eventos` | Próximos eventos (até 3) | sim |
| `3`, `conteudo`, `conteúdo`, `conteudos`, `conteúdos`, `novo conteudo`, `novo conteúdo` | Conteúdos | não |
| `4`, `denuncia`, `denúncia`, `enviar denuncia`, `enviar denúncia` | Inicia denúncia | sim |
| `5`, `lideranca`, `liderança`, `responsabilidade`, `quero liderar`, `quero ajudar`, `assumir responsabilidade` | Liderança | sim |
| qualquer outro | MENU_PERSONALIZADO | não |

---

## Variáveis de Ambiente

| Variável | Padrão | Obrigatória | Descrição |
|----------|--------|:-----------:|-----------|
| `WHATSAPP_ACCESS_TOKEN` | — | ✅ | Token de acesso à WhatsApp Cloud API |
| `WHATSAPP_PHONE_NUMBER_ID` | — | ✅ | ID do número WhatsApp Business |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | — | ✅ | ID da conta Business |
| `WHATSAPP_WEBHOOK_TOKEN` | — | ✅ | Token de verificação do webhook |
| `WHATSAPP_API_VERSION` | `25.0` | | Versão da API Graph |
| `GOOGLE_SHEET_ID` | hardcoded (dev) | ✅ prod | ID da planilha Google Sheets |
| `GOOGLE_SHEETS_CLIENT_EMAIL` | — | ✅ | E-mail da Service Account |
| `GOOGLE_SHEETS_PRIVATE_KEY` | — | ✅ | Chave privada. Suporta `base64:` prefix e `\n` escaped |
| `GOOGLE_MILITANTES_SHEET_NAME` | `Militantes` | | Nome da aba |
| `GOOGLE_MISSOES_SHEET_NAME` | `Missões` | | Nome da aba |
| `GOOGLE_CONTEUDOS_SHEET_NAME` | `Conteúdos` | | Nome da aba |
| `GOOGLE_EVENTOS_SHEET_NAME` | `Eventos` | | Nome da aba |
| `GOOGLE_LIDERANCA_SHEET_NAME` | `Liderança` | | Nome da aba |
| `GOOGLE_DENUNCIAS_SHEET_NAME` | `Denúncias` | | Nome da aba |
| `GOOGLE_TITULOS_SHEET_NAME` | `Títulos` | | Nome da aba legada |
| `GOOGLE_CONQUISTAS_SHEET_NAME` | `conquistas` | | Nome da aba data-driven |
| `MISSAO_DO_DIA` | texto padrão | | Fallback quando aba Missões não tem linha de hoje |
| `PROXIMOS_EVENTOS` | texto padrão | | Fallback para nome de evento no stage |
| `NOVO_CONTEUDO` | texto padrão | | Fallback de conteúdo |
| `NOVO_CONTEUDO_TIPO` | `post` | | Tipo do fallback |

---

## Observações Técnicas

### Persistência de Conversas

`ConversationManager` usa **Upstash Redis** como armazenamento primário do objeto `Conversation` (incluindo `militanciaStage`, `militanciaData` e `isHuman`). Fallback local: `/tmp/conversations.json` — usado em dev ou quando Redis não está configurado.

### Controle Humano (`isHuman`)

Quando `conversa.isHuman = true`, `MilitanciaManager.processar()` retorna `false` imediatamente sem enviar mensagem. O operador responde manualmente pelo painel.

### Derivação de estado pelo Sheets (não por flags)

O estado de cadastro é determinado lendo a planilha, não por um stage local. Isso evita inconsistências após re-deploys: se o bot reiniciar no meio de um cadastro, na próxima mensagem ele relê os campos e continua do ponto certo.

### Exceção: `cadastroIniciado`

A flag `conversa.militanciaData.cadastroIniciado` é usada para separar o momento em que o usuário **ainda decidindo** (mostra `WELCOME_SECOND_CONTACT`) do momento em que **já confirmou cadastro** (coleta campos). Ela é resetada quando o cadastro completa.

### Performance — Redução de Chamadas ao Sheets

| Técnica | Impacto |
|---------|---------|
| `batchUpdate` 6 colunas na missão | 6 chamadas → 1 |
| Cache de ranking de bairros (5 min) | Evita releitura de toda aba por usuário |
| Cache de conquistas (1h) | Evita leitura da aba `conquistas` a cada mensagem |
| Colunas M e N são `awaited` em denúncias e recrutamento | Garante valor atualizado antes de verificar conquistas |
| Pontos de evento, conteúdo e recrutamento são fire-and-forget | Não bloqueia resposta ao usuário |

### Fallback de Conquistas

```
obterConquistas() retorna [] ?
    ↓ sim
verificarConquistas() [hardcoded, IDs numéricos]
verificarStreakMilestones() [hardcoded, IDs 7/8/14/15/16]
atualizarTitulos() salva IDs numéricos em col L

obterConquistas() retorna dados ?
    ↓ sim
verificarConquistasDataDriven() [slugs]
atualizarTitulos() salva slugs em col L
```

`resolverNomeTitulo(id)` funciona com ambos: `TITULOS_PADRAO['1']` → `"Recruta"`, `_conquistasMap.get('primeira_missao')` → `"Primeira Missão"`.

### Regra de Social Proof

Se o número de militantes no bairro for 1 ou 2, o bot exibe `3` para não desmotivar os primeiros membros. Implementado em `obterPainelBairro()` e `obterDashboardPessoal()`.


