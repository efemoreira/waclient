
## Abas do Google Sheets

### ABA 1 — `militantes` *(existente — migrado)*

Schema atual preservado com uma coluna nova na posição O (já existe mas nunca foi incrementada — bug mapeado em US-GAM-01).

| Col | Campo | Tipo | Constraint | Descrição |
|-----|-------|------|-----------|-----------|
| A | `phone` | STRING | PK, UNIQUE, NOT NULL | Telefone E.164 — identificador único |
| B | `nome` | STRING | NOT NULL | Nome do militante |
| C | `ativo` | BOOLEAN | NOT NULL, DEFAULT TRUE | Se o militante está ativo |
| D | `bairro` | STRING | NOT NULL | Bairro de atuação |
| E | `pontos` | INTEGER | NOT NULL, DEFAULT 0 | Pontuação total acumulada |
| F | `nivel` | INTEGER | NOT NULL, DEFAULT 0 | Nível atual (0–5) |
| G | `missoesCompletas` | INTEGER | NOT NULL, DEFAULT 0 | Total de missões completadas (determina nível) |
| H | `ultimaMissao` | DATE (YYYY-MM-DD) | NULLABLE | Data da última missão concluída |
| I | `streakDias` | INTEGER | NOT NULL, DEFAULT 0 | Sequência de dias consecutivos ativos |
| J | `ultimaParticipacao` | DATE (YYYY-MM-DD) | NULLABLE | Data da última atividade qualquer |
| K | `conquistas` | STRING (JSON array) | NOT NULL, DEFAULT "[]" | Ex: `["primeira_missao","streak_7_dias","mobilizador_bronze"]` |
| L | `conteudosVistos` | STRING (JSON array) | NOT NULL, DEFAULT "[]" | IDs de posts já visualizados |
| M | `createdAt` | DATETIME | NOT NULL, AUTO | Data de cadastro |
| N | `updatedAt` | DATETIME | NOT NULL, AUTO | Última atualização |
| O | `militantesRecrutados` | INTEGER | NOT NULL, DEFAULT 0 | **BUG CORRIGIDO** — conta recrutamentos para conquista "Mobilizador" |
| P | `recrutadoPor` | STRING | NULLABLE | Phone do militante que recrutou este |
| Q | `denunciasEnviadas` | INTEGER | NOT NULL, DEFAULT 0 | Total de denúncias enviadas — gatilho das conquistas `denuncia_enviada` e `observador_cidade` |
| R | `eventosConfirmados` | INTEGER | NOT NULL, DEFAULT 0 | Total de eventos confirmados — gatilho da conquista `participacao_evento` |

---

### ABA 2 — `eventos` *(nova)*

Elimina a variável de ambiente `PROXIMOS_EVENTOS`. Coordenadores editam diretamente.

| Col | Campo | Tipo | Constraint | Descrição |
|-----|-------|------|-----------|-----------|
| A | `id` | STRING | PK, UNIQUE, NOT NULL | Slug único: `ev-2026-04-comício-centro` |
| B | `titulo` | STRING | NOT NULL | Nome do evento |
| C | `descricao` | STRING | NOT NULL | Descrição curta (max 200 chars) |
| D | `data` | DATE (YYYY-MM-DD) | NOT NULL | Data do evento |
| E | `hora` | TIME (HH:MM) | NOT NULL | Horário de início |
| F | `local` | STRING | NOT NULL | Endereço completo |
| G | `bairro` | STRING | NULLABLE | Bairro — filtra eventos próximos |
| H | `linkMapa` | STRING (URL) | NULLABLE | Google Maps ou Waze |

---

### ABA 3 — `conteudos` *(nova)*

Elimina a variável de ambiente `NOVO_CONTEUDO`. Substitui dados hardcoded de posts.

| Col | Campo | Tipo | Constraint | Descrição |
|-----|-------|------|-----------|-----------|
| A | `id` | STRING | PK, UNIQUE, NOT NULL | Slug único: `post-2026-04-reforma-agraria` |
| B | `titulo` | STRING | NOT NULL | Título da postagem |
| C | `resumo` | STRING | NOT NULL | Resumo curto para o bot (max 300 chars) |
| D | `url` | STRING (URL) | NOT NULL | Link para o conteúdo completo |
| E | `plataforma` | ENUM(instagram, facebook, youtube, site, outro) | NOT NULL | Origem do conteúdo |
| F | `tags` | STRING (CSV) | NULLABLE | Ex: `reforma,agraria,nordeste` |
| G | `dataPublicacao` | DATE | NOT NULL | Data da publicação original |

---

### ABA 4 — `missoes` *(nova)*

Elimina a variável de ambiente `MISSAO_DO_DIA`. Permite múltiplas missões ativas.

| Col | Campo | Tipo | Constraint | Descrição |
|-----|-------|------|-----------|-----------|
| A | `id` | STRING | PK, UNIQUE, NOT NULL | Slug: `missao-2026-04-panfletagem-centro` |
| B | `titulo` | STRING | NOT NULL | Nome da missão |
| C | `descricao` | STRING | NOT NULL | O que o militante deve fazer |
| D | `tipo` | ENUM(presencial, digital, recrutamento) | NOT NULL | Categoria |
| E | `pontos` | INTEGER | NOT NULL, DEFAULT 10 | Pontos ao completar |
| F | `dataInicio` | DATE | NOT NULL | Disponível a partir de |
| G | `dataFim` | DATE | NULLABLE | NULL = sem expiração |
| H | `bairro` | STRING | NULLABLE | NULL = missão nacional |
| I | `metaParticipantes` | INTEGER | NULLABLE | Objetivo coletivo |
| J | `participantesAtuais` | INTEGER | NOT NULL, DEFAULT 0 | Contador atual |

---

### ABA 5 — `denuncias` *(nova)*

Registra denúncias de necessidades da comunidade enviadas pelo bot.

| Col | Campo | Tipo | Constraint | Descrição |
|-----|-------|------|-----------|-----------|
| A | `id` | STRING | PK, AUTO | UUID gerado pelo bot |
| B | `phone` | STRING | FK → militantes.phone, NOT NULL | Quem enviou |
| C | `bairro` | STRING | NOT NULL | Bairro da ocorrência |
| D | `categoria` | ENUM(saude, educacao, seguranca, infraestrutura, transporte, outro) | NOT NULL | Tipo |
| E | `descricao` | STRING | NOT NULL | Texto da denúncia |
| F | `status` | ENUM(recebida, em_analise, encaminhada, resolvida) | NOT NULL, DEFAULT recebida | Status de processamento |

---

### ABA 6 — `bairros` *(nova)*

Agrega estatísticas coletivas de gamificação por bairro.

| Col | Campo | Tipo | Constraint | Descrição |
|-----|-------|------|-----------|-----------|
| A | `nome` | STRING | PK, UNIQUE, NOT NULL | Nome do bairro |
| B | `totalMissoes` | INTEGER | NOT NULL, DEFAULT 0 | Total de missões do bairro |
| C | `totalMilitantes` | INTEGER | NOT NULL, DEFAULT 0 | Militantes ativos no bairro |
| D | `nivel` | INTEGER | NOT NULL, DEFAULT 0 | 0–4 (50/120/250/400 missões) |
---

## Sistema de Gamificação — waclient-militancia

### Níveis (6)

| Nível | Nome | Missões mínimas | Emoji |
|-------|------|----------------|-------|
| 0 | Novato | 0 | 🌱 |
| 1 | Apoiador | 5 | ✊ |
| 2 | Ativista | 15 | 🔴 |
| 3 | Militante | 40 | ⚡ |
| 4 | Espartano | 80 | 🦁 |
| 5 | Missionário | 150 | 🌟 |

### ABA 7 — `conquistas` (data-driven)

> **Principio:** nenhuma conquista é hardcoded no código. O `AchievementChecker` lê esta aba (cache Redis TTL 1h) e avalia as regras em runtime. Adicionar ou remover conquistas = editar o Sheets, zero redeploy.

| Col | Campo | Tipo | Constraint | Descrição |
|-----|-------|------|-----------|----------|
| A | `id` | STRING | PK, UNIQUE | Slug único. Ex: `primeira_missao`, `mobilizador_bronze` |
| B | `nome` | STRING | NOT NULL | Exibido ao militar. Ex: "Primeira Missão" |
| C | `descricao` | STRING | NOT NULL | Descrição curta para exibir no perfil |
| D | `emoji` | STRING | NOT NULL | Ex: `🏆` |
| E | `tipo_gatilho` | ENUM | NOT NULL | `missoes` \| `streak` \| `denuncias` \| `eventos` \| `recrutados` \| `pontos` |
| F | `valor_gatilho` | INTEGER | NOT NULL | Limiar numérico. Ex: `1`, `7`, `3`, `10` |
| G | `ativo` | BOOLEAN | NOT NULL, DEFAULT TRUE | FALSE = conquista desativada sem deletar |
| H | `ordem` | INTEGER | NULLABLE | Ordem de exibição no perfil |

**Conquistas completas (28 conquistas — inserir como linhas no Sheets):**

> Todas data-driven. Adicionar nova conquista = nova linha. Zero redeploy.

**Série: Missões**
| id | nome | emoji | tipo_gatilho | valor_gatilho | ordem |
|----|------|-------|-------------|---------------|-------|
| `primeira_missao` | Primeira Missão | 🏆 | missoes | 1 | 1 |
| `missoes_5` | Engajado | ✊ | missoes | 5 | 2 |
| `missoes_10` | Militante em Ascensão | 📈 | missoes | 10 | 3 |
| `missoes_25` | Veterano | 🎖️ | missoes | 25 | 4 |
| `missionario_ativo` | Missionário Ativo | ⭐ | missoes | 50 | 5 |
| `centuriao` | Centurião | 💯 | missoes | 100 | 6 |
| `missoes_200` | Lenda Viva | 🌟 | missoes | 200 | 7 |

**Série: Streak (dias consecutivos)**
| id | nome | emoji | tipo_gatilho | valor_gatilho | ordem |
|----|------|-------|-------------|---------------|-------|
| `streak_3_dias` | Consistente | 🔥 | streak | 3 | 8 |
| `streak_7_dias` | Semana Ativa | 🔥🔥 | streak | 7 | 9 |
| `streak_14_dias` | Quinzena | 💥 | streak | 14 | 10 |
| `streak_30_dias` | Mês Inteiro | 🔥🔥🔥 | streak | 30 | 11 |
| `streak_100_dias` | Inabalável | 💪 | streak | 100 | 12 |

**Série: Denúncias**
| id | nome | emoji | tipo_gatilho | valor_gatilho | ordem |
|----|------|-------|-------------|---------------|-------|
| `denuncia_enviada` | Voz da Comunidade | 📣 | denuncias | 1 | 13 |
| `denuncias_3` | Guardião do Bairro | 🛡️ | denuncias | 3 | 14 |
| `observador_cidade` | Observador da Cidade | 🔍 | denuncias | 10 | 15 |
| `fiscal_popular` | Fiscal Popular | 📋 | denuncias | 25 | 16 |
| `sentinela` | Sentinela | 👁️ | denuncias | 50 | 17 |

**Série: Eventos**
| id | nome | emoji | tipo_gatilho | valor_gatilho | ordem |
|----|------|-------|-------------|---------------|-------|
| `participacao_evento` | Presente! | 📅 | eventos | 1 | 18 |
| `frequentador` | Frequentador | 🎯 | eventos | 3 | 19 |
| `engajado_eventos` | Coração da Rua | 🏟️ | eventos | 5 | 20 |
| `coluna_militancia` | Coluna da Militância | 🏛️ | eventos | 10 | 21 |

**Série: Recrutamento (Mobilizador)**
| id | nome | emoji | tipo_gatilho | valor_gatilho | ordem |
|----|------|-------|-------------|---------------|-------|
| `mobilizador_bronze` | Mobilizador Bronze | 🥉 | recrutados | 3 | 22 |
| `mobilizador_prata` | Mobilizador Prata | 🥈 | recrutados | 10 | 23 |
| `mobilizador_ouro` | Mobilizador Ouro | 🥇 | recrutados | 30 | 24 |
| `mobilizador_diamante` | Mobilizador Diamante | 💎 | recrutados | 100 | 25 |

**Série: Pontos acumulados**
| id | nome | emoji | tipo_gatilho | valor_gatilho | ordem |
|----|------|-------|-------------|---------------|-------|
| `centelha` | Centelha | 💡 | pontos | 100 | 26 |
| `chama` | Chama | 🕯️ | pontos | 500 | 27 |
| `fogueira` | Fogueira | 🔥 | pontos | 1000 | 28 |
| `incendio` | Incêndio | 🌋 | pontos | 5000 | 29 |

---

---

### Abas obrigatórias e seus headers (em ordem)

| Aba | Headers (linha 1, colunas A→) |
|-----|------------------------------|
| `militantes` | phone, nome, ativo, bairro, pontos, nivel, missoesCompletas, ultimaMissao, streakDias, ultimaParticipacao, conquistas, conteudosVistos, createdAt, updatedAt, militantesRecrutados, recrutadoPor, idioma, denunciasEnviadas, eventosConfirmados |
| `eventos` | id, titulo, descricao, data, hora, local, bairro, linkMapa, ativo, createdAt |
| `conteudos` | id, titulo, resumo, url, plataforma, tags, dataPublicacao, pontos, ativo, createdAt |
| `missoes` | id, titulo, descricao, tipo, pontos, dataInicio, dataFim, bairro, metaParticipantes, participantesAtuais, ativo, createdAt |
| `denuncias` | id, phone, bairro, categoria, descricao, fotoUrl, status, responsavel, createdAt, updatedAt |
| `bairros` | nome, totalMissoes, totalMilitantes, nivel, updatedAt |
| `conquistas` | id, nome, descricao, emoji, tipo_gatilho, valor_gatilho, ativo, ordem |

