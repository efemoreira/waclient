# Bot de Militância – Documentação Técnica

> **Central de Mobilização da Militância** — bot WhatsApp serverless para engajamento político, gamificação e mobilização comunitária.

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
