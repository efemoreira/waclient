# Bot de Militância – Documentação Técnica

> **Central de Mobilização da Militância** — bot WhatsApp serverless para engajamento político, gamificação e mobilização comunitária.
>
> **Versão do documento:** maio/2026 — gerado a partir do código-fonte real. Tudo aqui foi verificado arquivo por arquivo.

---

## Índice

1. [Visão Geral](#visão-geral)
2. [Sistema de Gamificação](#sistema-de-gamificação)
3. [Código – Arquivos e Responsabilidades](#código--arquivos-e-responsabilidades)
4. [Planilhas Google Sheets](#planilhas-google-sheets)
5. [O que precisa ser feito nas Planilhas](#o-que-precisa-ser-feito-nas-planilhas)
6. [Estruturas de Dados](#estruturas-de-dados)
7. [Flows de Mensagens](#flows-de-mensagens)
8. [Variáveis de Ambiente](#variáveis-de-ambiente)
9. [Observações Técnicas](#observações-técnicas)
10. [Roadmap e Melhorias Futuras](#roadmap-e-melhorias-futuras)

---

## Visão Geral

O bot de militância é um dos módulos do **waclient**, sistema serverless hospedado no Vercel que recebe mensagens via WhatsApp Cloud API. Seu objetivo é:

- Cadastrar membros (militantes) e armazenar o perfil em uma planilha Google Sheets.
- Engajar os membros com missões diárias e um sistema de pontuação, níveis e conquistas.
- Registrar denúncias comunitárias, confirmações de eventos e acesso a conteúdos.
- Mapear interesse em liderança e disponibilidade dos militantes.
- Exibir rankings por bairro e dashboard pessoal de progresso.

```
WhatsApp Cloud API
       ↓ (webhook POST)
   api/webhook.ts
       ↓
ConversationManager.processarWebhook()
       ↓
MilitanciaManager.processar()
       ↓
 [stage ativo?] → processarStage()
 [usuário cadastrado] → processarMenuOuComando()
 [cadastro incompleto] → estado derivado dos campos da planilha
 [novo contato] → registrarContato() + WELCOME_FIRST_CONTACT
       ↓
militanciaSheet.ts (Google Sheets API)
       ↓
[conquistas?] → obterConquistas() → verificarConquistasDataDriven() → atualizarTitulos()
```

---

## Sistema de Gamificação

### Pontos

Os pontos são a principal moeda de engajamento e base dos rankings. São acumulados na coluna `pontos` (col G) da aba **Militantes**.

| Ação | Pontos concedidos |
|------|------------------:|
| Missão concluída (streak 1–6 dias) | **10 pts** |
| Missão concluída (streak 7–29 dias) | **15 pts** (+5 bônus streak) |
| Missão concluída (streak 30+ dias) | **20 pts** (+10 bônus streak) |
| Confirmar presença em evento | **+5 pts** |
| Enviar denúncia comunitária | **+8 pts** |
| Acessar conteúdo | **+3 pts** |
| Recrutar um novo militante | **+15 pts** (creditados ao recrutador) |

Os rankings (posição no bairro, posição geral, ranking de bairros) são calculados pela soma de **pontos**, não por missões. Isso incentiva engajamento diversificado.

### Níveis

O nível é calculado automaticamente a partir do total de missões concluídas (`missoes_concluidas`, col I):

| Nível | Nome | Missões necessárias |
|------:|------|---------------------|
| 1 | Novato 🌱 | 0 |
| 2 | Apoiador ✊ | 5 |
| 3 | Ativista 🔴 | 15 |
| 4 | Militante ⚡ | 40 |
| 5 | Espartano 🦁 | 80 |
| 6 | Missionário 🌟 | 150 |

```typescript
export function calcularNivel(missoesConcluidasTotal: number): number {
  if (missoesConcluidasTotal >= 150) return 6;
  if (missoesConcluidasTotal >= 80)  return 5;
  if (missoesConcluidasTotal >= 40)  return 4;
  if (missoesConcluidasTotal >= 15)  return 3;
  if (missoesConcluidasTotal >= 5)   return 2;
  return 1;
}
```

Quando a missão é concluída, `atualizarMissoesStreakNivel()` faz um único `batchUpdate` na planilha atualizando 6 colunas simultaneamente: F (nível), G (pontos), H (última interação), I (missões), J (streak) e K (data da última missão).

### Streak (Sequência Diária)

O streak mede quantos dias consecutivos o militante completou a missão do dia. A lógica verifica se a data da última missão (`ultima_missao_data`, col K) foi **ontem** no fuso `America/Sao_Paulo`:

- Se foi ontem → `streak = streak + 1`
- Caso contrário → `streak = 1` (sequência reinicia)

### Sistema de Conquistas — Data-Driven (Fase 1)

> **Principal melhoria implementada.** As conquistas agora são definidas em uma aba do Sheets chamada `conquistas`. Adicionar ou remover conquistas = editar o Sheets. **Zero redeploy.**

#### Como funciona

1. `obterConquistas()` lê a aba `conquistas` e armazena em **cache de 1 hora** em memória.
2. `verificarConquistasDataDriven(militante, conquistas)` é uma função pura que avalia cada conquista ativa contra os contadores do militante.
3. `verificarERegistrarConquistas(celular, militante?)` orquestra leitura, verificação e persistência. **Fallback automático:** se a aba `conquistas` estiver vazia, o sistema usa os títulos hardcoded legados.

#### Quando conquistas são verificadas

| Evento | Verificação |
|--------|-------------|
| Missão concluída | ✅ Sempre (inside `registrarRespostaMissao`) |
| Confirmação de evento (sim) | ✅ Após `registrarConfirmacaoEvento` |
| Denúncia enviada | ✅ Após `registrarDenuncia` (contador aguardado) |

#### Tipos de gatilho suportados

| `tipo_gatilho` | Contador usado |
|----------------|----------------|
| `missoes` | `missoesConcluidasTotal` |
| `streak` | `streakAtual` |
| `denuncias` | `denunciasEnviadas` |
| `eventos` | `eventosConfirmados` ← **coluna R (nova)** |
| `recrutados` | `militantesRecrutados` |
| `pontos` | `pontos` |

#### Conquistas disponíveis (28 — inserir na aba `conquistas`)

**Série: Missões**

| id | nome | emoji | tipo_gatilho | valor_gatilho |
|----|------|-------|-------------|---------------|
| `primeira_missao` | Primeira Missão | 🏆 | missoes | 1 |
| `missoes_5` | Engajado | ✊ | missoes | 5 |
| `missoes_10` | Militante em Ascensão | 📈 | missoes | 10 |
| `missoes_25` | Veterano | 🎖️ | missoes | 25 |
| `missionario_ativo` | Missionário Ativo | ⭐ | missoes | 50 |
| `centuriao` | Centurião | 💯 | missoes | 100 |
| `missoes_200` | Lenda Viva | 🌟 | missoes | 200 |

**Série: Streak**

| id | nome | emoji | tipo_gatilho | valor_gatilho |
|----|------|-------|-------------|---------------|
| `streak_3_dias` | Consistente | 🔥 | streak | 3 |
| `streak_7_dias` | Semana Ativa | 🔥🔥 | streak | 7 |
| `streak_14_dias` | Quinzena | 💥 | streak | 14 |
| `streak_30_dias` | Mês Inteiro | 🔥🔥🔥 | streak | 30 |
| `streak_100_dias` | Inabalável | 💪 | streak | 100 |

**Série: Denúncias**

| id | nome | emoji | tipo_gatilho | valor_gatilho |
|----|------|-------|-------------|---------------|
| `denuncia_enviada` | Voz da Comunidade | 📣 | denuncias | 1 |
| `denuncias_3` | Guardião do Bairro | 🛡️ | denuncias | 3 |
| `observador_cidade` | Observador da Cidade | 🔍 | denuncias | 10 |
| `fiscal_popular` | Fiscal Popular | 📋 | denuncias | 25 |
| `sentinela` | Sentinela | 👁️ | denuncias | 50 |

**Série: Eventos**

| id | nome | emoji | tipo_gatilho | valor_gatilho |
|----|------|-------|-------------|---------------|
| `participacao_evento` | Presente! | 📅 | eventos | 1 |
| `frequentador` | Frequentador | 🎯 | eventos | 3 |
| `engajado_eventos` | Coração da Rua | 🏟️ | eventos | 5 |
| `coluna_militancia` | Coluna da Militância | 🏛️ | eventos | 10 |

**Série: Recrutamento**

| id | nome | emoji | tipo_gatilho | valor_gatilho |
|----|------|-------|-------------|---------------|
| `mobilizador_bronze` | Mobilizador Bronze | 🥉 | recrutados | 3 |
| `mobilizador_prata` | Mobilizador Prata | 🥈 | recrutados | 10 |
| `mobilizador_ouro` | Mobilizador Ouro | 🥇 | recrutados | 30 |
| `mobilizador_diamante` | Mobilizador Diamante | 💎 | recrutados | 100 |

**Série: Pontos**

| id | nome | emoji | tipo_gatilho | valor_gatilho |
|----|------|-------|-------------|---------------|
| `centelha` | Centelha | 💡 | pontos | 100 |
| `chama` | Chama | 🕯️ | pontos | 500 |
| `fogueira` | Fogueira | 🔥 | pontos | 1000 |
| `incendio` | Incêndio | 🌋 | pontos | 5000 |

### Nível Coletivo do Bairro

Bairros também têm nível coletivo, calculado a partir do somatório de missões de todos os militantes do bairro:

| Nível | Missões totais |
|------:|----------------|
| 0 | < 50 |
| 1 | ≥ 50 |
| 2 | ≥ 120 |
| 3 | ≥ 250 |
| 4 | ≥ 400 |

---

## Código – Arquivos e Responsabilidades

```
src/
├── inbox/
│   ├── MilitanciaManager.ts     # Orquestrador do bot – roteamento de stages e comandos
│   ├── militanciaMessages.ts    # Templates de todas as mensagens enviadas pelo bot
│   └── ConversationManager.ts   # Recebe webhooks e delega para MilitanciaManager
│
└── utils/
    └── militanciaSheet.ts       # Toda a lógica de leitura/escrita nas planilhas Google Sheets
```

### `MilitanciaManager.ts`

Classe principal que implementa `processar(celular, texto, conversa)`:

| Método | Responsabilidade |
|--------|-----------------|
| `processar()` | Ponto de entrada — detecta stage ativo e deriva estado de cadastro pela planilha |
| `processarStage()` | Switch para cada etapa do fluxo multi-passo |
| `processarMenuOuComando()` | Interpreta comandos de usuário cadastrado |
| `enviarDashboard()` | Monta e envia o dashboard pessoal de progresso |
| `enviarPainelBairro()` | Monta e envia painel coletivo do bairro + ranking |
| `enviarConteudoEEvento()` | Envia conteúdo e evento para não-cadastrados |
| `detectarRespostaMissao()` | Detecta se a resposta significa "concluído" ou "pendente" |

**Detalhe importante:** após confirmação de evento (`sim`) e após envio de denúncia, o bot agora chama `verificarERegistrarConquistas()` e notifica o militante sobre conquistas desbloqueadas — fechando o loop de gamificação para esses dois fluxos.

### `militanciaMessages.ts`

Objeto `MESSAGES_MILITANCIA` com todos os templates do bot. Alterações no texto = editar apenas este arquivo.

| Chave | Descrição |
|-------|-----------|
| `WELCOME_FIRST_CONTACT` | Primeiro contato — opção cadastrar ou acompanhar |
| `WELCOME_SECOND_CONTACT` | Retorno sem cadastro — oferece cadastro ou novidades |
| `MENU_PERSONALIZADO(nome)` | Menu principal personalizado |
| `MISSAO(texto)` | Envia missão do dia com instruções |
| `MISSAO_CONCLUIDA(streak, pontos, pontosGanhos)` | Confirmação — mostra delta e bônus de streak |
| `NIVEL_SUBIU(nomeNivel)` | Notificação de subida de nível (com emoji) |
| `CONQUISTA_DESBLOQUEADA(conquista, missoesTotal)` | Usa `conquista.emoji` + `conquista.nome` + `conquista.descricao` da aba |
| `PERFIL(params)` | Perfil: nível com emoji, pontos, missões, streak, conquistas, próximo nível |
| `DASHBOARD(params)` | Dashboard: pontos, streak, posição no bairro, posição geral |
| `PAINEL_BAIRRO(params)` | Painel coletivo — nível do bairro, pontos totais, ranking |
| `PAINEL_RANKING(ranking)` | Ranking de bairros com medalhas |

### `militanciaSheet.ts`

Todas as funções de acesso ao Google Sheets. Funções exportadas relevantes:

**Busca e cadastro**

| Função | Descrição |
|--------|-----------|
| `buscarMilitante(celular)` | Busca por telefone, lê colunas A:T (inclui novas cols R–T) |
| `isCadastroCompleto(militante)` | Verifica nome + bairro + cidade preenchidos |
| `registrarContato(celular)` | Registra telefone idempotente (inclui cols R–T zeradas) |
| `registrarMilitante(...)` | Registra militante completo (inclui cols R–T) |
| `contarMilitantes()` | Conta militantes com nome para social proof |
| `atualizarCamposMilitante(celular, campos)` | Atualiza nome/bairro/cidade em linha existente |
| `registrarOrigem(celular, origem)` | Salva col Q (origem) e col S (recrutadoPor) se for telefone |

**Gamificação**

| Função | Descrição |
|--------|-----------|
| `registrarRespostaMissao(celular, missao)` | Registra missão + atualiza gamificação + verifica conquistas |
| `atualizarMissoesStreakNivel(celular)` | batchUpdate de 6 colunas em uma só chamada |
| `calcularPontosMissao(streak)` | Retorna 10, 15 ou 20 conforme streak |
| `calcularNivel(missoes)` | Converte missões em nível 1–6 |
| `nomeDoNivel(nivel)` | Ex: `"Espartano 🦁"` |
| `calcularNivelBairro(missoes)` | Nível coletivo do bairro 0–4 |

**Conquistas data-driven** *(novo)*

| Função | Descrição |
|--------|-----------|
| `obterConquistas()` | Lê aba `conquistas`, cache 1h. Retorna `[]` se aba vazia |
| `verificarConquistasDataDriven(militante, conquistas)` | Função pura — avalia quais são novas |
| `verificarERegistrarConquistas(celular, militante?)` | Orquestra verificação + persistência. Fallback automático para legado |
| `resolverNomeTitulo(id)` | Resolve ID ou slug → nome. Consulta cache da aba + TITULOS_PADRAO |

**Conteúdo, eventos, denúncias**

| Função | Descrição |
|--------|-----------|
| `registrarAcessoConteudo(...)` | Registra acesso + incrementa contador col N |
| `registrarConfirmacaoEvento(...)` | Registra confirmação + pontos + incrementa col R (eventosConfirmados) |
| `registrarDenuncia(...)` | Registra denúncia + **awaita** incremento col M + pontos. Retorna protocolo |
| `registrarInteresseLideranca(...)` | Registra interesse na aba Liderança |
| `obterMissaoDia()` | Retorna missão do dia da aba Missões |
| `obterProximoEvento()` | Próximo evento futuro |
| `obterProximosEventos(limite)` | Até N eventos futuros, do mais próximo ao mais distante |
| `obterUltimoConteudo(filtroTipo?)` | Último conteúdo do catálogo, filtro opcional por tipo |
| `obterUltimosConteudosPorTipo()` | Último conteúdo de cada tipo distinto |
| `obterDashboardPessoal(celular, bairro)` | Posição no bairro e posição geral por pontos |
| `obterPainelBairro(bairro)` | Agrega dados do bairro |
| `obterRankingBairros()` | Ordena bairros por pontos totais (cache 5 min) |

---

## Planilhas Google Sheets

O bot usa uma única planilha (`GOOGLE_SHEET_ID`) com múltiplas abas.

---

### Aba: `Militantes`

> Variável: `GOOGLE_MILITANTES_SHEET_NAME` (padrão: `Militantes`)

| Col | Campo | Tipo | Descrição |
|-----|-------|------|-----------|
| A | `data_inscricao` | string dd/mm/aaaa | Data de primeiro contato |
| B | `nome` | string | Nome completo |
| C | `telefone` | string (só dígitos) | Telefone normalizado |
| D | `cidade` | string | Cidade |
| E | `bairro` | string | Bairro |
| F | `nivel` | number 1–6 | Nível calculado por missões |
| G | `pontos` | number | Pontuação acumulada (base dos rankings) |
| H | `ultima_interacao` | string dd/mm/aaaa | Data da última mensagem |
| I | `missoes_concluidas` | number | Total de missões concluídas |
| J | `streak_atual` | number | Sequência de dias consecutivos |
| K | `ultima_missao_data` | string dd/mm/aaaa | Data da última missão concluída |
| L | `titulos` | string CSV | IDs ou slugs das conquistas desbloqueadas |
| M | `denuncias_enviadas` | number | Total de denúncias enviadas |
| N | `conteudos_compartilhados` | number | Total de conteúdos acessados |
| O | `militantes_recrutados` | number | Total de militantes indicados |
| P | `data_cadastro` | string dd/mm/aaaa | Data em que nome+bairro+cidade foram concluídos |
| Q | `origem` | string | Número do recrutador (com 55) ou nome da rede social |
| R | `eventosConfirmados` | number | **Novo — Fase 2.** Total de eventos confirmados com "sim" |
| S | `recrutadoPor` | string | **Novo — Fase 2.** Telefone do recrutador (separado de origem) |
| T | `ativo` | string `true`/`false` | **Novo — Fase 2.** Flag de militante ativo |

**Linha de cabeçalho obrigatória (linha 1):**
```
data_inscricao | nome | telefone | cidade | bairro | nivel | pontos | ultima_interacao | missoes_concluidas | streak_atual | ultima_missao_data | titulos | denuncias_enviadas | conteudos_compartilhados | militantes_recrutados | data_cadastro | origem | eventosConfirmados | recrutadoPor | ativo
```

---

### Aba: `conquistas` ← **Nova (obrigatória para o sistema data-driven)**

> Variável: `GOOGLE_CONQUISTAS_SHEET_NAME` (padrão: `conquistas`)
>
> Esta aba é o coração do novo sistema. Se estiver vazia, o bot usa fallback para os títulos hardcoded legados.

| Col | Campo | Tipo | Descrição |
|-----|-------|------|-----------|
| A | `id` | string slug | Identificador único. Ex: `primeira_missao` |
| B | `nome` | string | Nome exibido ao militante |
| C | `descricao` | string | Descrição curta exibida na notificação |
| D | `emoji` | string | Ex: `🏆` |
| E | `tipo_gatilho` | enum | `missoes` \| `streak` \| `denuncias` \| `eventos` \| `recrutados` \| `pontos` |
| F | `valor_gatilho` | number | Limiar numérico. Ex: `1`, `7`, `30` |
| G | `ativo` | string `TRUE`/`FALSE` | `FALSE` = desativada sem deletar |
| H | `ordem` | number | Ordem de exibição no perfil |

**Linha de cabeçalho obrigatória (linha 1):**
```
id | nome | descricao | emoji | tipo_gatilho | valor_gatilho | ativo | ordem
```

---

### Aba: `Missões`

> Variável: `GOOGLE_MISSOES_SHEET_NAME` (padrão: `Missões`)

| Col | Campo | Descrição |
|-----|-------|-----------|
| A | `data` | Data da missão (dd/mm/aaaa) |
| B | `missao` | Texto da missão do dia |
| C | `concluiram` | Telefones (CSV) dos que confirmaram conclusão |

**Cabeçalho:** `data | missao | concluiram`

O bot busca a linha cujo campo `data` é igual a hoje. Se não encontrar, o texto da missão vem do env var `MISSAO_DO_DIA`.

---

### Aba: `Conteúdos`

> Variável: `GOOGLE_CONTEUDOS_SHEET_NAME` (padrão: `Conteúdos`)

Duplo propósito: **catálogo** (linhas sem telefone — inseridas pelo admin) e **log de acessos** (linhas com telefone — inseridas pelo bot). A função `isCatalogRow()` distingue os dois tipos pelo conteúdo da coluna B.

| Col | Campo | Descrição |
|-----|-------|-----------|
| A | `data` | Data de publicação (catálogo) ou data de acesso (log) |
| B | `titulo_ou_telefone` | Título (catálogo) ou telefone normalizado (log) |
| C | `conteudo` | Texto ou título do conteúdo |
| D | `link` | URL do conteúdo (opcional) |
| E | `tipo` | `instagram`, `video`, `artigo`, `youtube`, `tiktok`, etc. |

**Cabeçalho:** `data | titulo | link | tipo | acessos`

---

### Aba: `Eventos`

> Variável: `GOOGLE_EVENTOS_SHEET_NAME` (padrão: `Eventos`)

| Col | Campo | Descrição |
|-----|-------|-----------|
| A | `nome` | Nome do evento |
| B | `texto` | Descrição / corpo (opcional) |
| C | `data` | Data do evento (dd/mm/aaaa) |
| D | `hora` | Horário (opcional, ex: `19h00`) |
| E | `local` | Endereço (opcional) |
| F | `confirmacoes` | Telefones (CSV) dos confirmados |

**Cabeçalho:** `nome | texto | data | hora | local | confirmacoes`

Eventos com data anterior a hoje são filtrados automaticamente. Eventos sem data aparecem ao final da lista.

---

### Aba: `Denúncias`

> Variável: `GOOGLE_DENUNCIAS_SHEET_NAME` (padrão: `Denúncias`)

| Col | Campo | Descrição |
|-----|-------|-----------|
| A | `data` | Data da denúncia |
| B | `telefone` | Telefone do militante |
| C | `bairro` | Bairro relatado |
| D | `descricao` | Descrição do problema |
| E | `protocolo` | Código gerado: `D260430-1435` |

**Cabeçalho:** `data | telefone | bairro | descricao | protocolo`

---

### Aba: `Liderança`

> Variável: `GOOGLE_LIDERANCA_SHEET_NAME` (padrão: `Liderança`)

| Col | Campo | Descrição |
|-----|-------|-----------|
| A | `data` | Data do registro |
| B | `nome` | Nome |
| C | `telefone` | Telefone |
| D | `bairro` | Bairro |
| E | `area` | Área de interesse escolhida |

**Cabeçalho:** `data | nome | telefone | bairro | area`

**Opções de área:**

| Opção digitada | Área registrada |
|---|---|
| 1 | Fazer uma doação |
| 2 | Organizar reuniões no meu bairro |
| 3 | Ajudar com minha experiência profissional |
| 4 | Participar de pesquisas e estratégias |

---

### Aba: `Títulos` *(legada — opcional)*

> Variável: `GOOGLE_TITULOS_SHEET_NAME` (padrão: `Títulos`)

Usada como fallback quando a aba `conquistas` está vazia. Permite sobrescrever nomes de títulos hardcoded sem redeploy.

| Col | Campo | Descrição |
|-----|-------|-----------|
| A | `id` | ID numérico legado (1–24) |
| B | `nome` | Nome exibido |
| C | `criterio` | Critério de desbloqueio |

**Com a aba `conquistas` populada, esta aba se torna desnecessária.**

---

## O que precisa ser feito nas Planilhas

Esta seção lista as tarefas necessárias para o bot funcionar corretamente com todas as melhorias implementadas.

### 1. ✅ Criar a aba `conquistas` (obrigatório para gamificação data-driven)

Criar uma nova aba com o nome exato `conquistas` (minúsculo) e inserir a linha de cabeçalho seguida das 28 conquistas listadas acima.

**Passos:**
1. Abrir a planilha Google Sheets
2. Adicionar nova aba nomeada `conquistas`
3. Linha 1 (cabeçalho): `id | nome | descricao | emoji | tipo_gatilho | valor_gatilho | ativo | ordem`
4. Linhas 2–29: inserir as 28 conquistas da tabela da seção [Sistema de Gamificação](#sistema-de-gamificação)

Exemplo das primeiras linhas:

```
id                  | nome              | descricao                           | emoji | tipo_gatilho | valor_gatilho | ativo | ordem
primeira_missao     | Primeira Missão   | Completou sua primeira missão       | 🏆    | missoes      | 1             | TRUE  | 1
missoes_5           | Engajado          | 5 missões concluídas                | ✊    | missoes      | 5             | TRUE  | 2
streak_7_dias       | Semana Ativa      | 7 dias consecutivos de missão       | 🔥🔥 | streak       | 7             | TRUE  | 9
denuncia_enviada    | Voz da Comunidade | Enviou sua primeira denúncia        | 📣    | denuncias    | 1             | TRUE  | 13
participacao_evento | Presente!         | Confirmou presença em um evento     | 📅    | eventos      | 1             | TRUE  | 18
mobilizador_bronze  | Mobilizador Bronze| Recrutou 3 novos membros            | 🥉    | recrutados   | 3             | TRUE  | 22
```

---

### 2. ✅ Adicionar colunas R, S, T na aba `Militantes`

Para militantes já cadastrados (linhas antigas), as novas colunas R, S, T estarão **vazias** — o bot lê `0`, `""` e `true` respectivamente como padrão. Linhas novas criadas pelo bot já incluem esses valores.

**Passos:**
1. Adicionar os headers na linha 1: coluna R = `eventosConfirmados`, S = `recrutadoPor`, T = `ativo`
2. Para militantes existentes, as células podem ficar vazias (o bot interpreta corretamente)

---

### 3. ✅ Garantir que as missões estão sendo inseridas corretamente

A aba `Missões` deve ter **uma linha por dia** no formato `dd/mm/aaaa | texto da missão`. O bot busca a linha onde a data de hoje corresponde.

**Dica de operação:** criar as missões da semana toda de uma vez no Sheets — sem necessidade de acessar o painel admin.

---

### 4. ✅ Conteúdos e Eventos — inserir pelo Sheets (sem variáveis de ambiente)

As variáveis `NOVO_CONTEUDO`, `PROXIMOS_EVENTOS` e `MISSAO_DO_DIA` funcionam como **fallback**. O bot prioriza sempre os dados das abas:

- Conteúdo → aba `Conteúdos` (linhas sem telefone na col B)
- Eventos → aba `Eventos` (linhas com data futura)
- Missão → aba `Missões` (linha com data de hoje)

Inserir diretamente no Sheets é o fluxo correto de operação.

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
  nivel: number;                   // 1–6
  pontos: number;
  dataUltimaInteracao: string;
  missoesConcluidasTotal: number;
  streakAtual: number;
  ultimaMissaoData: string;
  titulos: string;                 // CSV de IDs ou slugs
  denunciasEnviadas: number;
  conteudosCompartilhados: number;
  militantesRecrutados: number;
  // Fase 2 — novas colunas (R, S, T)
  eventosConfirmados: number;      // col R
  recrutadoPor: string;            // col S
  ativo: boolean;                  // col T
};
```

### `ConquistaDefinicao`

```typescript
export type ConquistaDefinicao = {
  id: string;           // slug único: 'primeira_missao'
  nome: string;         // exibido ao militante
  descricao: string;    // exibido na notificação de desbloqueio
  emoji: string;        // ex: '🏆'
  tipoGatilho: 'missoes' | 'streak' | 'denuncias' | 'eventos' | 'recrutados' | 'pontos';
  valorGatilho: number; // limiar: 1, 7, 30…
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
  novasConquistas: ConquistaDefinicao[]; // objetos completos (não mais IDs)
  streakAtual: number;
  missoesConcluidasTotal: number;
  pontos: number;       // total após a missão
  pontosGanhos: number; // delta: 10, 15 ou 20
};
```

### `militanciaStage` — estados do fluxo

```typescript
militanciaStage?:
  | 'missao_resposta'            // aguarda resposta da missão do dia
  | 'evento_confirmacao'         // aguarda confirmação de presença
  | 'lideranca_area'             // aguarda escolha de área
  | 'lideranca_disponibilidade'  // legado (fluxo antigo)
  | 'denuncia_bairro'            // coleta bairro da denúncia
  | 'denuncia_descricao'         // coleta descrição
  | 'painel_bairro'              // coleta bairro para painel coletivo
  | 'cadastro_origem'            // último passo do cadastro: recrutador ou rede social
```

---

## Flows de Mensagens

### Flow 1 — Primeiro Contato

```
Usuário envia qualquer mensagem
        ↓
Bot → WELCOME_FIRST_CONTACT ("1️⃣ Cadastrar" ou "2️⃣ Ver novidades")
        ↓
"1" → registrarContato() idempotente + Bot → WELCOME_NEW_USER (pede nome)
"2" → enviarConteudoEEvento() (busca Conteúdos + Eventos)

  Próximas mensagens (campo faltante deriva da planilha):
  nome vazio   → atualizarCamposMilitante({nome}) → pede bairro
  bairro vazio → atualizarCamposMilitante({bairro}) → pede cidade
  cidade vazia → atualizarCamposMilitante({cidade}) → stage: 'cadastro_origem'

  Stage 'cadastro_origem':
    Telefone (10–13 dígitos) → recrutador: +1 militantesRecrutados, +15 pts, salva col S
    Texto (rede social)       → salva só col Q
    "0" / "pular"             → pula
  → Bot → CADASTRO_SUCESSO(nome, posição)
```

### Flow 2 — Missão do Dia

```
"1" / "missao" / "missão de hoje"
        ↓
obterMissaoDia() [prioridade] → fallback: env MISSAO_DO_DIA
Bot → MISSAO(texto) + stage: 'missao_resposta'
        ↓
Usuário responde
detectarRespostaMissao() → "concluído" | "pendente"

  "concluído":
    registrarRespostaMissao()
      → atualizarMissoesStreakNivel() [batchUpdate 6 colunas]
      → verificarERegistrarConquistas()
          → obterConquistas() [cache 1h]
          → verificarConquistasDataDriven() [função pura]
          → atualizarTitulos() se novas
    Bot → MISSAO_CONCLUIDA(streak, pontos, pontosGanhos)
    Se levelUp → Bot → NIVEL_SUBIU(nomeNivel com emoji)
    Para cada conquista → Bot → CONQUISTA_DESBLOQUEADA(conquista.emoji + conquista.nome)

  "pendente":
    Bot → MISSAO_PENDENTE
```

### Flow 3 — Eventos

```
"2" / "eventos"
        ↓
obterProximosEventos(3) → até 3 eventos futuros ordenados por data
Primeiro evento → EVENTOS(evento) + stage: 'evento_confirmacao'
Demais eventos → MOSTRAR_EVENTO(evento) [sem prompt de confirmação]
        ↓
"1" / "sim" / "vou":
    registrarConfirmacaoEvento(celular, evento, true)
      → +5 pts + incrementa col R (eventosConfirmados)
    Bot → EVENTO_CONFIRMADO("sim")
    verificarERegistrarConquistas() → notifica conquistas de eventos

"2" / qualquer outra coisa:
    registrarConfirmacaoEvento(celular, evento, false) [sem pontos]
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
      → appendRow aba Denúncias
      → await incrementarContador(celular, 'M')   ← aguardado
      → +8 pts (fire-and-forget)
    Bot → DENUNCIA_REGISTRADA(protocolo)
    verificarERegistrarConquistas()  ← verifica conquistas de denúncias
      → notifica se "Voz da Comunidade", "Guardião do Bairro", etc.
```

### Flow 5 — Conteúdo

```
"3" / "conteudo"
        ↓
obterUltimosConteudosPorTipo() → um item de cada tipo
Para cada conteúdo:
    Bot → MOSTRAR_CONTEUDO(conteudo)
    registrarAcessoConteudo() fire-and-forget (+3 pts, incrementa col N)
```

### Flow 6 — Quero Contribuir (Liderança)

```
"5" / "liderança" / "quero ajudar"
        ↓
Bot → LIDERANCA_AGRADECIMENTO + LIDERANCA_OPCOES
        ↓ stage: 'lideranca_area'
Usuário escolhe 1/2/3/4 (ou texto livre)
registrarInteresseLideranca() → aba Liderança
Bot → LIDERANCA_REGISTRADA
```

### Flow 7 — Dashboard e Painel

```
"6" / "dashboard" / "painel":
    obterDashboardPessoal(celular, bairro)
      → posição no bairro e posição geral por pontos
    Bot → DASHBOARD(nome, nível, pontos, streak, missões, posições)

"perfil" / "pontos" / "nivel":
    Bot → PERFIL(nome, bairro, nível+emoji, pontos, missões, streak, conquistas, próximo nível)

"7" / "painel do bairro":
    Bot → PAINEL_BAIRRO_PROMPT (pede qual bairro)
    stage: 'painel_bairro'
    Usuário envia bairro:
    obterPainelBairro() + obterRankingBairros()
    Bot → PAINEL_BAIRRO + PAINEL_RANKING
```

### Comandos Globais (usuário cadastrado)

| Comando(s) | Ação |
|-----------|------|
| `menu`, `ajuda`, `help`, `inicio`, `voltar` | Exibe menu personalizado |
| `perfil`, `meu perfil`, `pontos`, `nivel` | Exibe perfil e progresso |
| `1`, `missao`, `missão de hoje` | Missão do dia |
| `2`, `eventos`, `próximos eventos` | Próximos eventos |
| `3`, `conteudo`, `novo conteúdo` | Último conteúdo |
| `4`, `denuncia`, `enviar denúncia` | Denúncia comunitária |
| `5`, `liderança`, `quero ajudar` | Assumir responsabilidade |
| `6`, `dashboard`, `painel` | Dashboard pessoal |
| `7`, `painel do bairro` | Painel coletivo do bairro |

---

## Variáveis de Ambiente

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `GOOGLE_SHEET_ID` | — | ID da planilha Google Sheets |
| `GOOGLE_SHEETS_CLIENT_EMAIL` | — | E-mail da Service Account |
| `GOOGLE_SHEETS_PRIVATE_KEY` | — | Chave privada (suporta `base64:` e `\n` escaped) |
| `GOOGLE_MILITANTES_SHEET_NAME` | `Militantes` | Nome da aba de militantes |
| `GOOGLE_MISSOES_SHEET_NAME` | `Missões` | Nome da aba de missões |
| `GOOGLE_CONTEUDOS_SHEET_NAME` | `Conteúdos` | Nome da aba de conteúdos |
| `GOOGLE_EVENTOS_SHEET_NAME` | `Eventos` | Nome da aba de eventos |
| `GOOGLE_LIDERANCA_SHEET_NAME` | `Liderança` | Nome da aba de liderança |
| `GOOGLE_DENUNCIAS_SHEET_NAME` | `Denúncias` | Nome da aba de denúncias |
| `GOOGLE_CONQUISTAS_SHEET_NAME` | `conquistas` | **Novo** — nome da aba de conquistas data-driven |
| `GOOGLE_TITULOS_SHEET_NAME` | `Títulos` | Nome da aba de títulos legados (fallback) |
| `MISSAO_DO_DIA` | — | Fallback: texto da missão (se aba Missões não tiver linha de hoje) |
| `PROXIMOS_EVENTOS` | — | Fallback: texto de eventos (se aba Eventos estiver vazia) |
| `NOVO_CONTEUDO` | — | Fallback: texto de conteúdo |
| `NOVO_CONTEUDO_TIPO` | `post` | Fallback: tipo do conteúdo |
| `APP_PASSWORD` | — | Senha de autenticação do painel admin |
| `WHATSAPP_ACCESS_TOKEN` | — | Token de acesso à WhatsApp Cloud API |

---

## Observações Técnicas

### Persistência de Conversas

O estado do fluxo (`militanciaStage`, `militanciaData`) é armazenado no objeto `Conversation` e persistido via **Upstash Redis** (ou `/tmp/conversations.json` como fallback local). Isso garante que o bot retome exatamente o mesmo ponto do fluxo mesmo entre invocações serverless distintas.

### Controle Humano (`isHuman`)

Quando `isHuman = true`, o `MilitanciaManager` não processa a mensagem. O atendimento manual pelo operador acontece sem interferência do bot.

### Performance — Redução de Chamadas ao Sheets

| Técnica | Impacto |
|---------|---------|
| `batchUpdate` em 6 colunas simultaneamente (missão) | 5 chamadas → 1 |
| Cache de ranking de bairros (5 min) | Elimina releitura da planilha inteira por usuário |
| Cache de conquistas (1h) | Elimina leitura da aba `conquistas` a cada mensagem |
| `obterRankingBairros` lê só E:G (3 colunas) | 57% menos dados transferidos |
| `obterDashboardPessoal` lê só C:I | 22% menos dados transferidos |
| Contadores de denúncias são `await`ed antes de verificar conquistas | Garante valor atualizado sem segunda leitura |
| Incremento de eventos, pontos de conteúdo são fire-and-forget | Não bloqueia resposta ao usuário |

### Fallback Automático de Conquistas

```
obterConquistas() retorna [] ?
    ↓ sim
verificarConquistas() hardcoded (legado) +
verificarStreakMilestones() (legado)
    ↓
atualizarTitulos() com IDs numéricos

obterConquistas() retorna dados ?
    ↓ sim
verificarConquistasDataDriven() com objetos ConquistaDefinicao
    ↓
atualizarTitulos() com slugs
```

---

## Roadmap e Melhorias Futuras

### Fase 3 — Migração de Schema (planejada)

> Requer preparação cuidadosa — migra dados existentes.

- [ ] Reordenar colunas da aba `Militantes` para o schema do `data-model.md` (`phone` como col A / PK)
- [ ] Migrar valores de `titulos` de IDs numéricos (`"1, 2, 7"`) para slugs (`"primeira_missao, missoes_5, streak_7_dias"`)
- [ ] Migrar `conteudos_compartilhados` de contador inteiro para JSON array de IDs visitados (evita conteúdo repetido)
- [ ] Adicionar campo `cidade` no schema do `data-model.md` (removido propositalmente do modelo novo, mas ainda em uso)

### Melhorias de UX no Bot

- [ ] **Resumo semanal automático** — toda segunda-feira, enviar para cada militante ativo um resumo da semana anterior: missões, streak, ranking, conquistas novas.
- [ ] **Notificação de evento próximo** — 24h antes de um evento, enviar lembrete para militantes do mesmo bairro ou cidade.
- [ ] **Missão de recrutamento guiada** — quando o usuário escolhe "missão", se a missão do dia for do tipo `recrutamento`, enviar um link personalizado com o número do militante como parâmetro (para rastrear `recrutadoPor` automaticamente).
- [ ] **Conquistas de bairro** — notificar todos os militantes de um bairro quando o bairro sobe de nível coletivo.
- [ ] **Resposta a saudações mais natural** — detectar palavras como "tô de volta", "voltei", "boa" como saudação além das já mapeadas.
- [ ] **Fluxo de categoria de denúncia** — adicionar etapa de categoria (`saúde`, `educação`, `segurança`, `infraestrutura`, `transporte`, `outro`) antes da descrição, como definido no `data-model.md`.

### Melhorias Técnicas

- [ ] **Cache Redis para `obterConquistas()`** — substituir o cache em memória (TTL 1h, perde no cold start) por cache no Upstash Redis para persistência entre instâncias.
- [ ] **Aba `bairros`** — implementar aba de bairros para agregar estatísticas sem precisar recalcular em tempo real. Atualizar via cron job.
- [ ] **Aba `missoes` com colunas novas** — suportar o schema completo: `tipo`, `pontos`, `dataInicio`, `dataFim`, `bairro`, `metaParticipantes`, `participantesAtuais` — permitindo múltiplas missões ativas simultâneas.
- [ ] **Validação de conquistas no boot** — ao iniciar a função serverless, verificar se a aba `conquistas` existe e tem dados válidos, logando um aviso claro se não.
- [ ] **Limitar mensagens simultâneas** — ao notificar múltiplas conquistas de uma vez, agrupar em uma única mensagem para evitar spam.


---

## Índice

1. [Visão Geral](#visão-geral)
2. [Sistema de Gamificação](#sistema-de-gamificação)
3. [Código – Arquivos e Responsabilidades](#código--arquivos-e-responsabilidades)
4. [Planilhas Google Sheets](#planilhas-google-sheets)
5. [Estruturas de Dados](#estruturas-de-dados)
6. [Flows de Mensagens](#flows-de-mensagens)

---

## Visão Geral

O bot de militância é um dos módulos do **waclient**, sistema serverless hospedado no Vercel que recebe mensagens via WhatsApp Cloud API. Seu objetivo é:

- Cadastrar membros (militantes) e armazenar o perfil em uma planilha Google Sheets.
- Engajar os membros com missões diárias e um sistema de pontuação e níveis.
- Registrar denúncias comunitárias, confirmações de eventos e acesso a conteúdos.
- Mapear interesse em liderança e disponibilidade dos militantes.
- Exibir rankings por bairro e dashboard pessoal de progresso.

```
WhatsApp Cloud API
       ↓ (webhook POST)
   api/webhook.ts
       ↓
ConversationManager.processarWebhook()
       ↓
MilitanciaManager.processar()
       ↓
 [stage ativo?] → processarStage() (somente missão/evento/liderança/denúncia)
 [usuário cadastrado] → processarMenuOuComando()
 [cadastro] → estado derivado da planilha (nome/bairro/cidade)
       ↓
Google Sheets (militanciaSheet.ts)
```

---

## Sistema de Gamificação

### Pontos

Os pontos são a principal moeda de engajamento e base dos rankings. São acumulados na coluna `pontos` (col G) da aba **Militantes**.

| Ação | Pontos concedidos |
|------|------------------:|
| Missão concluída (streak 1–6 dias) | **10 pts** |
| Missão concluída (streak 7–29 dias) | **15 pts** (+5 bônus streak) |
| Missão concluída (streak 30+ dias) | **20 pts** (+10 bônus streak) |
| Confirmar presença em evento | **+5 pts** |
| Enviar denúncia comunitária | **+8 pts** |
| Acessar conteúdo | **+3 pts** |

A função `calcularPontosMissao(streak)` encapsula o multiplicador de streak:

```typescript
// src/utils/militanciaSheet.ts
export function calcularPontosMissao(streak: number): number {
  if (streak >= 30) return 20;
  if (streak >= 7)  return 15;
  return 10;
}
```

Os rankings — tanto pessoal (posição no bairro / posição geral) quanto coletivo (ranking de bairros) — são calculados pela soma de **pontos**, não por missões. Isso incentiva engajamento diversificado: quem confirma eventos, denuncia problemas e acessa conteúdos pode superar quem só faz missões.

### Níveis

O nível é calculado automaticamente a partir do total de missões concluídas (`missoes_concluidas`, col I):

| Nível | Nome            | Missões necessárias |
|------:|-----------------|---------------------|
|     1 | Simpatizante    | 0                   |
|     2 | Militante       | 5                   |
|     3 | Militante Ativo | 15                  |
|     4 | Mobilizador     | 40                  |
|     5 | Líder de Bairro | 80                  |
|     6 | Coordenador     | 150                 |

```typescript
// src/utils/militanciaSheet.ts
export function calcularNivel(missoesConcluidasTotal: number): number {
  if (missoesConcluidasTotal >= 150) return 6;
  if (missoesConcluidasTotal >= 80)  return 5;
  if (missoesConcluidasTotal >= 40)  return 4;
  if (missoesConcluidasTotal >= 15)  return 3;
  if (missoesConcluidasTotal >= 5)   return 2;
  return 1;
}
```

Quando a missão é concluída, `atualizarMissoesStreakNivel()` faz um `batchUpdate` na planilha atualizando colunas F (nível), G (pontos), H (última interação), I (missões), J (streak) e K (data da última missão) em uma única chamada à API.

### Streak (Sequência)

O streak mede quantos dias consecutivos o militante completou a missão do dia. A lógica verifica se a data da última missão (`ultima_missao_data`, col K) foi **ontem**:

- Se foi ontem → `streak = streak + 1`
- Caso contrário → `streak = 1` (sequência reinicia)

```typescript
const novoStreak = isOntem(ultimaMissaoData) ? streakPrev + 1 : 1;
```

### Conquistas (Títulos)

As conquistas são desbloqueadas automaticamente pelas funções `verificarConquistas()` (missões, conteúdo, recrutamento, denúncias, pontos) e `verificarStreakMilestones()` (sequências). Os IDs são armazenados como CSV na coluna `titulos` (col L). O nome de cada título é resolvido em tempo de execução via `resolverNomeTitulo(id)` — pode ser personalizado na aba **Títulos** da planilha sem novo deploy.

Ao concluir uma missão, o bot verifica quais conquistas são novas e envia uma mensagem de desbloqueio para cada uma. A função `verificarStreakMilestones` usa **loop** (não `else if`), portanto um militante que pular de 1 para 30 dias recebe todos os títulos de streak de uma vez.

#### Títulos por missões concluídas

| ID | Nome | Critério |
|----|------|----------|
| 1 | Recruta | ≥ 1 missão |
| 2 | Ativista | ≥ 7 missões |
| 9 | Ativista Prata | ≥ 20 missões |
| 3 | Combatente | ≥ 30 missões |
| 10 | Ativista Ouro | ≥ 50 missões |
| 11 | Combatente Prata | ≥ 80 missões |
| 12 | Combatente Ouro | ≥ 120 missões |
| 13 | Veterano da Causa | ≥ 180 missões |

#### Títulos por streak (dias consecutivos)

| ID | Nome | Critério |
|----|------|----------|
| 7 | Semana em Campo | ≥ 7 dias |
| 14 | Semana em Campo Prata | ≥ 14 dias |
| 8 | Mês em Campo | ≥ 30 dias |
| 15 | Mês em Campo Ouro | ≥ 60 dias |
| 16 | Incansável | ≥ 90 dias |

#### Títulos por conteúdo compartilhado

| ID | Nome | Critério |
|----|------|----------|
| 4 | Porta-Voz | ≥ 20 conteúdos |
| 17 | Porta-Voz Prata | ≥ 40 conteúdos |
| 18 | Porta-Voz Ouro | ≥ 60 conteúdos |

#### Títulos por recrutamento

| ID | Nome | Critério |
|----|------|----------|
| 5 | Articulador | ≥ 3 recrutados |
| 19 | Articulador Prata | ≥ 7 recrutados |
| 20 | Articulador Ouro | ≥ 15 recrutados |

#### Títulos por denúncias

| ID | Nome | Critério |
|----|------|----------|
| 6 | Fiscal das Ruas | ≥ 3 denúncias |
| 21 | Fiscal Prata | ≥ 7 denúncias |
| 22 | Fiscal Ouro | ≥ 15 denúncias |

#### Títulos por pontos acumulados

| ID | Nome | Critério |
|----|------|----------|
| 23 | Força do Movimento | ≥ 500 pts |
| 24 | Pilar da Causa | ≥ 1000 pts |

### Nível do Bairro

Bairros também têm nível coletivo, calculado a partir do somatório de missões de todos os militantes do bairro:

| Nível do bairro | Missões totais |
|----------------:|----------------|
|               0 | < 50           |
|               1 | ≥ 50           |
|               2 | ≥ 120          |
|               3 | ≥ 250          |
|               4 | ≥ 400          |

---

## Código – Arquivos e Responsabilidades

```
src/
├── inbox/
│   ├── MilitanciaManager.ts     # Orquestrador do bot – roteamento de stages e comandos
│   ├── militanciaMessages.ts    # Templates de todas as mensagens enviadas pelo bot
│   └── ConversationManager.ts   # Recebe webhooks e delega para MilitanciaManager
│
└── utils/
    └── militanciaSheet.ts       # Toda a lógica de leitura/escrita nas planilhas Google Sheets
```

### `MilitanciaManager.ts`

Classe principal que implementa o método `processar(celular, texto, conversa)`:

| Método | Responsabilidade |
|--------|-----------------|
| `processar()` | Ponto de entrada — detecta stage ativo e deriva estado de cadastro pela planilha |
| `processarStage()` | Switch para cada etapa do fluxo multi-passo |
| `processarMenuOuComando()` | Interpreta comandos de usuário cadastrado |
| `enviarDashboard()` | Monta e envia o dashboard pessoal de progresso |
| `enviarPainelBairro()` | Monta e envia painel coletivo do bairro + ranking |
| `enviarConteudoEEvento()` | Envia conteúdo e evento para não-cadastrados |
| `detectarRespostaMissao()` | Detecta se a resposta significa "concluído" ou "pendente" |

### `militanciaMessages.ts`

Objeto `MESSAGES_MILITANCIA` com todas as mensagens do bot. Funções que geram texto dinâmico:

| Chave | Descrição |
|-------|-----------|
| `WELCOME_FIRST_CONTACT` | Primeiro contato — opção de cadastrar ou acompanhar |
| `WELCOME_SECOND_CONTACT` | Retorno sem cadastro — oferece cadastro ou novidades |
| `MENU_PERSONALIZADO(nome)` | Menu principal personalizado com o nome do usuário |
| `MISSAO(texto)` | Envia a missão do dia com instruções de resposta |
| `MISSAO_CONCLUIDA(streak, pontos, pontosGanhos)` | Confirmação de missão — mostra delta de pontos ganhos e bônus de streak |
| `NIVEL_SUBIU(nomeNivel)` | Notificação de subida de nível |
| `CONQUISTA_DESBLOQUEADA(nome, total)` | Notificação de nova conquista (usa singular/plural: "1 missão" / "N missões") |
| `PERFIL(params)` | Perfil compacto: nome, bairro, nível, pontos, missões, streak, conquistas e próximo nível |
| `DASHBOARD(params)` | Dashboard compacto: pontos em destaque, streak, posição no bairro e posição geral |
| `PAINEL_BAIRRO(params)` | Painel coletivo do bairro — exibe nível do bairro, pontos totais, ranking |
| `PAINEL_RANKING(ranking)` | Ranking de bairros por pontos totais com medalhas |

A função auxiliar `proximoNivel()` calcula quantas missões faltam para o próximo nível e retorna `null` quando o usuário está no nível máximo.

### `militanciaSheet.ts`

Funções exportadas para operações na planilha:

| Função | Descrição |
|--------|-----------|
| `buscarMilitante(celular)` | Busca militante pelo telefone (retorna `MilitanteInfo` ou `null`) |
| `isCadastroCompleto(militante)` | Verifica se nome, bairro e cidade estão preenchidos |
| `registrarContato(celular)` | Registra telefone na aba Militantes sem duplicar telefone já existente |
| `contarMilitantes()` | Conta militantes com nome preenchido (para social proof no cadastro) |
| `atualizarCamposMilitante(celular, campos)` | Atualiza nome/bairro/cidade em linha existente do telefone |
| `atualizarUltimaInteracao(celular)` | Atualiza coluna H com a data de hoje |
| `atualizarPontosENivel(celular, pontos)` | Incrementa pontos na coluna G |
| `registrarRespostaMissao(celular, missao)` | Registra missão e atualiza gamificação |
| `registrarAcessoConteudo(...)` | Registra acesso na aba Conteúdos e incrementa contador |
| `registrarConfirmacaoEvento(...)` | Registra confirmação na aba Eventos |
| `registrarInteresseLideranca(...)` | Registra interesse na aba Liderança |
| `registrarDenuncia(...)` | Registra denúncia na aba Denúncias, retorna código de protocolo |
| `registrarOrigem(celular, origem)` | Salva origem do novo militante (col Q); se for número de telefone, credita +1 recrutado e +15 pts ao recrutador |
| `obterDashboardPessoal(celular, bairro)` | Calcula posição no bairro e posição geral — ambas ranqueadas por **pontos** |
| `obterPainelBairro(bairro)` | Agrega dados do bairro (militantes, missões, nível médio, **pontos totais**) |
| `obterRankingBairros()` | Ordena bairros por **pontos totais** dos membros |
| `calcularPontosMissao(streak)` | Retorna pontos a conceder pela missão: 10, 15 ou 20 conforme streak |
| `obterMissaoDia()` | Retorna missão do dia da aba Missões (linha com data de hoje) |
| `obterUltimoConteudo(filtroTipo?)` | Retorna último conteúdo publicado, com filtro opcional por tipo |
| `obterProximoEvento()` | Retorna próximo evento futuro |
| `obterProximosEventos(limite)` | Retorna até N eventos futuros do mais próximo ao mais distante |
| `obterUltimosConteudosPorTipo()` | Retorna o último conteúdo de cada tipo distinto |
| `obterTitulosSheet()` | Lê a aba Títulos; fallback para `TITULOS_PADRAO` |
| `resolverNomeTitulo(id)` | Retorna nome do título por ID (rápido, sem I/O) |
| `calcularNivel(missoes)` | Converte missões em nível numérico |
| `nomeDoNivel(nivel)` | Retorna nome textual do nível |
| `calcularNivelBairro(missoes)` | Nível coletivo do bairro |
| `verificarConquistas(militante)` | Retorna IDs de novas conquistas desbloqueadas |

---

## Planilhas Google Sheets

O bot usa uma única planilha do Google (variável `GOOGLE_SHEET_ID`) com múltiplas abas. Cada aba tem seu nome configurável por variável de ambiente.

### Aba: Militantes

> Variável: `GOOGLE_MILITANTES_SHEET_NAME` (padrão: `Militantes`)

Armazena o perfil e os dados de gamificação de cada militante.

| Col | Variável | Tipo | Descrição |
|-----|----------|------|-----------|
| A | `data_inscricao` | string (dd/mm/aaaa) | Data de registro |
| B | `nome` | string | Nome completo |
| C | `telefone` | string (só dígitos) | Telefone normalizado |
| D | `cidade` | string | Cidade |
| E | `bairro` | string | Bairro do militante |
| F | `nivel` | number (1–6) | Nível calculado por missões |
| G | `pontos` | number | Pontuação acumulada |
| H | `ultima_interacao` | string (dd/mm/aaaa) | Data da última mensagem |
| I | `missoes_concluidas` | number | Total de missões concluídas |
| J | `streak_atual` | number | Sequência de dias consecutivos |
| K | `ultima_missao_data` | string (dd/mm/aaaa) | Data da última missão concluída |
| L | `titulos` | string (CSV) | Conquistas desbloqueadas, separadas por vírgula |
| M | `denuncias_enviadas` | number | Total de denúncias enviadas |
| N | `conteudos_compartilhados` | number | Total de conteúdos acessados |
| O | `militantes_recrutados` | number | Total de militantes indicados |
| P | `data_cadastro` | string (dd/mm/aaaa) | Data em que o cadastro foi concluído |
| Q | `origem` | string | Número do recrutador (normalizado com 55) ou nome da rede social |

### Aba: Missões

> Variável: `GOOGLE_MISSOES_SHEET_NAME` (padrão: `Missões`)

Cada linha representa uma missão do dia. A coluna `concluiram` armazena um array (lista separada por vírgulas) com os números de telefone dos militantes que responderam que já fizeram a missão.

| Col | Variável | Descrição |
|-----|----------|-----------|
| A | `data` | Data da missão (dd/mm/aaaa) |
| B | `missao` | Texto identificador da missão do dia |
| C | `concluiram` | Telefones separados por vírgula dos que concluíram |

### Aba: Conteúdos

> Variável: `GOOGLE_CONTEUDOS_SHEET_NAME` (padrão: `Conteúdos`)

Duplo propósito: catálogo de conteúdos (linhas sem telefone, inseridas pelo admin) e log de acessos (linhas com telefone, inseridas pelo bot).

| Col | Variável | Descrição |
|-----|----------|-----------|
| A | `data` | Data de publicação ou acesso |
| B | `telefone` | Vazio = linha de catálogo; preenchido = log de acesso |
| C | `conteudo` | Título ou texto do conteúdo |
| D | `link` | URL do conteúdo (opcional) |
| E | `tipo` | Tipo: `instagram`, `video`, `artigo`, etc. |

### Aba: Eventos

> Variável: `GOOGLE_EVENTOS_SHEET_NAME` (padrão: `Eventos`)

Cada linha representa um evento. A coluna `confirmacoes` armazena um array (lista separada por vírgulas) com os números de telefone dos militantes que confirmaram presença.

| Col | Variável | Descrição |
|-----|----------|-----------|
| A | `nome` | Nome do evento |
| B | `texto` | Descrição ou corpo do evento (opcional) |
| C | `data` | Data do evento (dd/mm/aaaa) |
| D | `hora` | Horário (opcional, ex: `19h00`) |
| E | `local` | Local do evento (opcional) |
| F | `confirmacoes` | Telefones separados por vírgula dos confirmados |

### Aba: Liderança

> Variável: `GOOGLE_LIDERANCA_SHEET_NAME` (padrão: `Liderança`)

Registra militantes interessados em assumir responsabilidades.

| Col | Variável | Descrição |
|-----|----------|-----------|
| A | `data` | Data do registro |
| B | `nome` | Nome do militante |
| C | `telefone` | Telefone |
| D | `bairro` | Bairro |
| E | `area` | Área de interesse escolhida |

**Opções de área disponíveis:**

| Opção | Área |
|-------|------|
| 1 | Fazer uma doação |
| 2 | Organizar reuniões no meu bairro |
| 3 | Ajudar com minha experiência profissional |
| 4 | Participar de pesquisas e estratégias |

### Aba: Denúncias

> Variável: `GOOGLE_DENUNCIAS_SHEET_NAME` (padrão: `Denúncias`)

Denúncias comunitárias enviadas pelos militantes. O bot gera automaticamente um código de protocolo único por denúncia.

| Col | Variável | Descrição |
|-----|----------|-----------|
| A | `data` | Data da denúncia |
| B | `telefone` | Telefone do militante |
| C | `bairro` | Bairro relatado |
| D | `descricao` | Descrição do problema |
| E | `protocolo` | Código de protocolo gerado automaticamente (ex: `D260430-1435`) |

### Aba: Títulos

> Variável: `GOOGLE_TITULOS_SHEET_NAME` (padrão: `Títulos`)

Opcional. Define os títulos/conquistas exibidos no sistema de gamificação. A coluna `titulos` da aba Militantes armazena apenas os **IDs** dos títulos conquistados (CSV). A resolução ID → nome é feita em tempo de execução — mudar o nome de um título nesta aba atualiza imediatamente o texto do bot, sem novo deploy.

| Col | Variável | Descrição |
|-----|----------|-----------|
| A | `id` | Identificador numérico (1–8) |
| B | `nome` | Nome exibido ao militante |
| C | `criterio` | Descrição do critério de desbloqueio |

**IDs fixos no código (fallback `TITULOS_PADRAO`):**

A aba Títulos pode sobrescrever os nomes sem alterar os IDs. Os 24 IDs ativos são documentados na seção [Conquistas (Títulos)](#conquistas-títulos) acima.

---

## Estruturas de Dados

### `MilitanteInfo` — perfil completo do militante

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
  titulos: string;                  // CSV de conquistas
  denunciasEnviadas: number;
  conteudosCompartilhados: number;
  militantesRecrutados: number;
};
```

### `MissaoResultado` — retorno após registrar uma missão

```typescript
export type MissaoResultado = {
  levelUp: boolean;
  nivelAnterior: number;
  novoNivel: number;
  novasConquistas: string[];
  streakAtual: number;
  missoesConcluidasTotal: number;
  pontos: number;       // total de pontos após a missão
  pontosGanhos: number; // delta concedido nessa missão (10, 15 ou 20)
};
```

### `Conversation` — estado da conversa no bot

```typescript
// src/inbox/ConversationManager.ts
interface Conversation {
  id: string;
  name?: string;
  phoneNumber: string;
  lastMessage?: string;
  lastTimestamp?: number;
  unreadCount: number;
  isHuman: boolean;       // se true, o bot não processa (atendimento humano)
  messages: MessageRecord[];
  militanciaStage?: string;        // stage ativo do fluxo multi-passo
  militanciaData?: {               // dados temporários coletados no fluxo
    nome?: string;
    bairro?: string;
    descricao?: string;
    area?: string;
  };
}
```

### `militanciaStage` — estados do fluxo

```typescript
militanciaStage?:
  | 'missao_resposta'         // aguarda resposta da missão do dia
  | 'evento_confirmacao'      // aguarda confirmação de presença no evento
  | 'lideranca_area'          // aguarda escolha de área de liderança
  | 'lideranca_disponibilidade' // legado — disponibilidade (fluxo antigo)
  | 'denuncia_bairro'         // coleta bairro da denúncia
  | 'denuncia_descricao'      // coleta descrição do problema
  | 'painel_bairro'           // coleta bairro para exibir painel coletivo
  | 'cadastro_origem'         // último passo do cadastro: quem convidou ou qual rede social
```

---

## Flows de Mensagens

### Flow 1 — Primeiro Contato (usuário nunca interagiu)

```
Usuário envia qualquer mensagem
        ↓
Bot → WELCOME_FIRST_CONTACT
      "1️⃣ Fazer meu cadastro para participar ativamente"
      "2️⃣ Ver último conteúdo e próximo evento"
        ↓
Se responder "1":
  registrarContato() (idempotente por telefone)
  Bot → WELCOME_NEW_USER (pedindo nome)

Nas próximas mensagens, o bot busca o telefone na planilha e decide o próximo passo:
  - nome vazio   → salva nome via atualizarCamposMilitante() e pede bairro
  - bairro vazio → salva bairro e pede cidade
  - cidade vazia → salva cidade, define stage `cadastro_origem` e pergunta a origem

Na resposta da origem (stage `cadastro_origem`):
  - Número de telefone (10–13 dígitos) → salva com `55` prefix, credita recrutador (+1 recrutado, +15 pts)
  - Texto (rede social) → salva como está (ex: Instagram)
  - `0` ou equivalente → pula sem registrar
  Em seguida mostra CADASTRO_SUCESSO com posição na rede.

Não há stage de cadastro para nome/bairro/cidade; o progresso vem dos campos da planilha.
```

Se o usuário responder "2" (ou qualquer outra coisa) no `welcome_opcao`, o bot busca o último conteúdo ou evento publicado e exibe como novidades.

---

### Flow 2 — Retorno sem cadastro completo

```
Usuário envia mensagem
        ↓ (telefone já existe, mas sem nome/bairro/cidade completo)
Bot continua o cadastro com base no campo faltante da planilha.
```

---

### Flow 3 — Missão do Dia (usuário cadastrado)

```
Usuário envia "1" / "missao" / "missão de hoje"
        ↓
Bot → MISSAO(texto da missão do dia)
      "✅ Já fiz" ou "⏳ Vou fazer agora"
        ↓ (stage: missao_resposta)
Usuário responde
        ↓
detectarRespostaMissao() → "concluído" | "pendente"

  Se "concluído":
    registrarRespostaMissao()
      → atualizarMissoesStreakNivel() [batchUpdate Sheets: nível, pontos, interação, missões, streak, data]
      → verificarConquistas()
      → atualizarTitulos() se novas conquistas
    Bot → MISSAO_CONCLUIDA(streak, pontos, pontosGanhos) — mostra bônus se streak ≥ 7
    Se levelUp → Bot → NIVEL_SUBIU(nomeNivel)
    Para cada conquista nova → Bot → CONQUISTA_DESBLOQUEADA(nome, total)

  Se "pendente":
    registrarRespostaMissao() com status "pendente"
    Bot → MISSAO_PENDENTE
        ↓ (stage: undefined)
```

---

### Flow 4 — Confirmação de Evento

```
Usuário envia "2" / "eventos"
        ↓
Bot → EVENTOS(texto dos próximos eventos)
      "1 - ✅ Sim, vou!" ou "2 - 🤔 Talvez"
        ↓ (stage: evento_confirmacao)
Usuário responde "1" / "sim" / "vou"
        ↓
confirmacao = 'sim'
registrarConfirmacaoEvento(celular, evento, true) → aba Eventos + atualizarPontosENivel(celular, 5)
Bot → EVENTO_CONFIRMADO("confirmada")

Usuário responde "2" / qualquer outra coisa
        ↓
confirmacao = 'talvez'
registrarConfirmacaoEvento(celular, evento, false) → aba Eventos (sem pontos)
Bot → EVENTO_CONFIRMADO("talvez")
        ↓ (stage: undefined)
```

---

### Flow 5 — Acesso a Conteúdo

```
Usuário envia "3" / "conteudo" / "novo conteúdo"
        ↓
Bot → CONTEUDO(texto do novo conteúdo)
registrarAcessoConteudo() → aba Conteúdos (fire-and-forget)
        ↓ (stage não alterado — sem etapa de resposta)
```

---

### Flow 6 — Enviar Denúncia

```
Usuário envia "4" / "denuncia"
        ↓
Bot → DENUNCIA_INICIO ("Qual é o seu bairro?")
        ↓ (stage: denuncia_bairro)
Usuário envia bairro
        ↓
Bot → PEDIR_DESCRICAO_DENUNCIA
        ↓ (stage: denuncia_descricao)
Usuário descreve o problema
        ↓
registrarDenuncia(celular, bairro, descricao) → aba Denúncias (retorna protocolo)
Bot → DENUNCIA_REGISTRADA(protocolo) com código de protocolo
        ↓ (stage: undefined)
```

---

### Flow 7 — Assumir Responsabilidade / Liderança

```
Usuário envia "5" / "liderança" / "quero ajudar"
        ↓
Bot → LIDERANCA_AGRADECIMENTO
Bot → LIDERANCA_OPCOES (4 opções numeradas)
        ↓ (stage: lideranca_area)
Usuário responde "1"/"2"/"3"/"4" (ou texto livre)
        ↓
registrarInteresseLideranca() → aba Liderança
Bot → LIDERANCA_REGISTRADA
        ↓ (stage: undefined)
```

---

### Flow 8 — Dashboard e Painel do Bairro

```
Usuário envia "6" / "dashboard" / "painel"
        ↓
obterDashboardPessoal(celular, bairro)
  → busca todos os militantes do bairro na planilha
  → calcula posição no bairro e posição geral por **pontos**
Bot → DASHBOARD(nome, nível, pontos, streak, missões, posição no bairro, posição geral)
        ↓ (stage não alterado)

Usuário envia "perfil" / "meu perfil" / "pontos"
        ↓
Bot → PERFIL(nome, bairro, nível, missões, streak, títulos, próximo nível)
        ↓ (stage não alterado)
```

---

### Comandos Globais (usuário cadastrado)

| Comando(s) | Ação |
|-----------|------|
| `menu`, `ajuda`, `help`, `inicio`, `voltar` | Exibe menu personalizado |
| `perfil`, `meu perfil`, `pontos`, `nivel` | Exibe perfil e progresso |
| `1`, `missao`, `missão de hoje` | Inicia flow de missão |
| `2`, `eventos`, `próximos eventos` | Inicia flow de eventos |
| `3`, `conteudo`, `novo conteúdo` | Exibe último conteúdo |
| `4`, `denuncia`, `enviar denúncia` | Inicia flow de denúncia |
| `5`, `liderança`, `quero ajudar` | Inicia flow de liderança |
| `6`, `dashboard`, `painel` | Exibe dashboard pessoal |

---

## Observações Adicionais

### Variáveis de Ambiente

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `GOOGLE_SHEET_ID` | — | ID da planilha Google Sheets |
| `GOOGLE_SHEETS_CLIENT_EMAIL` | — | E-mail da Service Account |
| `GOOGLE_SHEETS_PRIVATE_KEY` | — | Chave privada (suporta `base64:` e `\n` escaped) |
| `GOOGLE_MILITANTES_SHEET_NAME` | `Militantes` | Nome da aba de militantes |
| `GOOGLE_MISSOES_SHEET_NAME` | `Missões` | Nome da aba de missões |
| `GOOGLE_CONTEUDOS_SHEET_NAME` | `Conteúdos` | Nome da aba de conteúdos |
| `GOOGLE_EVENTOS_SHEET_NAME` | `Eventos` | Nome da aba de eventos |
| `GOOGLE_LIDERANCA_SHEET_NAME` | `Liderança` | Nome da aba de liderança |
| `GOOGLE_DENUNCIAS_SHEET_NAME` | `Denúncias` | Nome da aba de denúncias |
| `MISSAO_DO_DIA` | — | Texto da missão do dia atual |
| `PROXIMOS_EVENTOS` | — | Texto dos próximos eventos |
| `NOVO_CONTEUDO` | — | Texto do novo conteúdo (fallback) |
| `NOVO_CONTEUDO_TIPO` | `post` | Tipo do conteúdo (fallback) |

### Persistência de Conversas

O estado do fluxo (`militanciaStage`, `militanciaData`) é armazenado no objeto `Conversation` e persistido via **Upstash Redis** (ou `/tmp/conversations.json` como fallback). Isso garante que o bot retome exatamente o mesmo ponto do fluxo mesmo em chamadas de serverless separadas.

### Controle Humano (`isHuman`)

Quando um atendente humano assume a conversa via painel administrativo, o campo `isHuman = true` é definido. Nesse estado, o `ConversationManager` **ignora** qualquer processamento do `MilitanciaManager`, permitindo atendimento manual sem interferência do bot.

### Rate Limiting e Timeout (Vercel)

As funções serverless têm limite de **10 segundos** de execução no Vercel. Para evitar timeout:
- As chamadas à planilha que não precisam de resposta imediata usam **fire-and-forget** com `.catch(() => {})`.
- A função `atualizarMissoesStreakNivel` consolida 6 atualizações de células em um único `batchUpdate`.
- `obterRankingBairros` lê apenas as colunas `E:G` (bairro, nível, pontos) em vez de `A:G`, reduzindo 57% dos dados transferidos.
- `obterDashboardPessoal` lê `C:I` em vez de `A:I`, reduzindo 22% dos dados transferidos.
- O resultado de `obterRankingBairros` é mantido em **cache em memória** com TTL de 5 minutos. Instâncias aquecidas do Vercel respondem ao ranking sem nenhuma chamada à API do Sheets.
- O bulk messaging usa um sistema de fila com múltiplas chamadas sequenciais à API.
