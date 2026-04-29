# Bot WhatsApp de Militância Política

Sistema de bot para WhatsApp com gestão de conversas, cadastro de militantes via Google Sheets e envio em massa de mensagens. Deployado como funções serverless na Vercel.

---

## Índice

1. [Como funciona (visão geral)](#como-funciona-visão-geral)
2. [Estrutura do projeto](#estrutura-do-projeto)
3. [Variáveis de ambiente](#variáveis-de-ambiente)
4. [Fluxo de mensagens](#fluxo-de-mensagens)
5. [Fluxo de cadastro do militante](#fluxo-de-cadastro-do-militante)
6. [Armazenamento de dados](#armazenamento-de-dados)
7. [API (endpoints)](#api-endpoints)
8. [Interface web](#interface-web)
9. [Como rodar localmente](#como-rodar-localmente)
10. [Deploy na Vercel](#deploy-na-vercel)
11. [Troubleshooting](#troubleshooting)

---

## Como funciona (visão geral)

O sistema é um **bot para WhatsApp** que:

1. Recebe mensagens dos usuários via **webhook do WhatsApp Cloud API** (Meta)
2. Processa cada mensagem no **MilitanciaManager**, que gerencia o fluxo de conversa
3. Registra dados dos militantes em uma **planilha do Google Sheets**
4. Armazena histórico de conversas no **Upstash Redis** (ou em arquivo `/tmp` como fallback)
5. Expõe uma **interface web** para operadores visualizarem e responderem conversas manualmente

```
Usuário WhatsApp
      │
      ▼
[WhatsApp Cloud API / Meta]
      │ POST webhook
      ▼
[api/webhook.ts]           ← Vercel Serverless Function
      │
      ▼
[ConversationManager]      ← Orquestra tudo
      │
      ├─► [MilitanciaManager]   ← Lógica do bot (cadastro, missão, eventos...)
      │         │
      │         └─► [militanciaSheet.ts]  ← Lê/grava no Google Sheets
      │
      └─► [conversation-storage.ts]  ← Salva histórico (Upstash Redis ou /tmp)
```

## Funcionalidades

- 📨 **Receber mensagens** via webhook
- 💬 **Bot de militância** - fluxo de cadastro, missões, eventos, liderança, denúncias
- 📊 **Google Sheets** - dados dos militantes salvos em planilha
- 📤 **Envio em massa** de mensagens (CSV)
- 💬 **Painel web** - visualizar e responder conversas manualmente
- 🚀 **Serverless** - executa completamente na Vercel (sem servidor dedicado)

---

## Estrutura do projeto

```
/api                        → Funções Vercel (cada arquivo = um endpoint HTTP)
  webhook.ts                → Recebe mensagens do WhatsApp (webhook)
  messages.ts               → Envia mensagem individual (usado pelo painel)
  conversations.ts          → Lista/gerencia conversas (usado pelo painel)
  bulk.ts                   → Dispara envio em massa
  handlers/                 → Sub-handlers do envio em massa (upload, start, stop...)

/src
  config.ts                 → Configuração centralizada (lê variáveis de ambiente)
  wabapi/                   → Cliente da WhatsApp Cloud API (baixo nível)
    WhatsApp.ts             → Classe principal do cliente
    Message.ts              → Funções de envio (texto, mídia, template...)
    Dispatcher.ts           → Roteador de mensagens recebidas
    Handler.ts              → Handlers para tipos de mensagem (texto, imagem, áudio...)
    Update.ts               → Objeto de atualização (mensagem recebida)
    Markup.ts               → Helpers para botões/listas interativas
    types/index.ts          → Tipos TypeScript da API do WhatsApp
  inbox/                    → Lógica do bot de militância
    ConversationManager.ts  → Orquestra webhook, armazenamento e bot
    MilitanciaManager.ts    → Fluxo do bot (cadastro, missão, eventos...)
    militanciaMessages.ts   → Textos/mensagens enviadas pelo bot
    CommandHandler.ts       → Comandos extensíveis (ajuda, uid, casas...)
    GastosManager.ts        → Respostas de comandos de imóveis/gastos
    messages.ts             → Textos gerais do bot
  utils/
    militanciaSheet.ts      → Operações no Google Sheets (militantes, missões...)
    conversation-storage.ts → Salva/lê conversas (Upstash Redis ou /tmp)
    logger.ts               → Logger com escopo (Inbox, Webhook, etc.)
    text-normalizer.ts      → Normaliza texto (remove acentos, lowercase)
    phone-normalizer.ts     → Normaliza números de telefone
    csv-parser.ts           → Faz parse do CSV para envio em massa

/public                     → Interface web (HTML/CSS/JS puro, sem framework)
  index.html                → Página única (painel de conversas + bulk)
  app.js                    → Lógica do painel de conversas
  bulk-messaging.js         → Lógica do envio em massa
  styles.css                → Estilos

vercel.json                 → Configuração de rotas da Vercel
tsconfig.json               → Configuração TypeScript
package.json                → Dependências
```

---

## Variáveis de ambiente

Crie um arquivo `.env.local` na raiz (ou configure no painel da Vercel):

```env
# ─── WhatsApp Cloud API (obrigatório) ─────────────────────────────────────────
# Obtido no Meta for Developers → App → WhatsApp → API Setup
WHATSAPP_PHONE_NUMBER_ID=      # ID do número de telefone (ex: 123456789012345)
WHATSAPP_BUSINESS_ACCOUNT_ID=  # ID da conta business
WHATSAPP_ACCESS_TOKEN=         # Token de acesso permanente ou temporário
WHATSAPP_WEBHOOK_TOKEN=        # Token que você definiu ao configurar o webhook

# ─── Google Sheets (obrigatório para o bot de militância) ─────────────────────
# Crie uma Service Account no Google Cloud Console e compartilhe a planilha com ela
GOOGLE_SHEET_ID=               # ID da planilha (na URL: /d/ESTE_ID/edit)
GOOGLE_SHEETS_CLIENT_EMAIL=    # E-mail da service account (xxx@xxx.iam.gserviceaccount.com)
GOOGLE_SHEETS_PRIVATE_KEY=     # Chave privada da service account (começa com -----BEGIN RSA...)

# ─── Armazenamento de conversas (opcional, recomendado) ───────────────────────
# Sem isso, conversas são salvas em /tmp e perdidas a cada novo deploy
UPSTASH_REDIS_REST_URL=        # URL do banco Redis serverless Upstash
UPSTASH_REDIS_REST_TOKEN=      # Token de autenticação do Upstash

# ─── Segurança do painel web (opcional, recomendado) ──────────────────────────
APP_PASSWORD=                  # Senha para acessar a interface web e a API

# ─── Conteúdo do bot (opcional, tem valor padrão) ─────────────────────────────
MISSAO_DO_DIA=                 # Texto da missão diária
PROXIMOS_EVENTOS=              # Texto dos próximos eventos
NOVO_CONTEUDO=                 # Texto de novo conteúdo
```

---

## Fluxo de mensagens

Quando um usuário envia uma mensagem no WhatsApp, o caminho percorrido é:

```
1. Usuário envia mensagem
      ↓
2. WhatsApp Cloud API chama POST /api/webhook
      ↓
3. api/webhook.ts recebe o payload JSON
      ↓
4. ConversationManager.processarWebhook()
   - Extrai mensagens do payload
   - Cria/atualiza a Conversation no Map em memória
   - Verifica se a conversa está em modo humano (isHuman)
      ↓
5. MilitanciaManager.processar()
   - Verifica se existe stage ativo (fluxo de múltiplos passos)
   - Busca militante na planilha Google Sheets
   - Decide qual resposta enviar e qual próximo stage definir
      ↓
6. WhatsApp.sendMessage() → Message.sendTextMessage()
   - POST para https://graph.facebook.com/v24.0/{numberId}/messages
   - Header: Authorization: Bearer {WHATSAPP_ACCESS_TOKEN}
      ↓
7. Mensagem salva no ConversationManager
   - Persiste em Upstash Redis (ou /tmp como fallback)
```

---

## Fluxo de cadastro do militante

O cadastro é orientado pela planilha. O bot verifica o estado de cada campo na aba "Militantes":

```
Usuário envia qualquer mensagem
      ↓
[Telefone NÃO está na planilha]
  → Registra contato + envia mensagem de boas-vindas (opção 1 = cadastrar, opção 2 = só acompanhar)
      ↓
[Usuário escolhe opção 1]
  → Pergunta nome → Pergunta bairro → Pergunta cidade → Cadastro completo!
      ↓
[Cadastro completo]
  → Mostra menu principal personalizado com o nome do militante
```

**Menu principal (militante cadastrado):**
- `1` – Missão do dia (registra resposta na aba "Missões")
- `2` – Próximos eventos (registra confirmação na aba "Eventos")
- `3` – Novo conteúdo (registra acesso na aba "Conteúdos")
- `4` – Quero liderar (registra interesse na aba "Liderança")
- `5` – Painel do bairro (mostra ranking da aba "Militantes")
- `6` – Fazer uma denúncia (registra na aba "Denúncias")
- `perfil` – Mostra pontos, nível e conquistas do militante

**Stages (fluxos multi-passo):**

| Stage | Descrição |
|---|---|
| `missao_resposta` | Aguardando resposta se concluiu a missão |
| `evento_confirmacao` | Aguardando confirmação de presença em evento |
| `lideranca_area` | Aguardando escolha de área de atuação |
| `denuncia_bairro` | Aguardando bairro da denúncia |
| `denuncia_descricao` | Aguardando descrição da denúncia |
| `denuncia_foto` | Aguardando link de foto da denúncia |
| `painel_bairro` | Aguardando nome do bairro para o painel |

---

## Estrutura da planilha Google Sheets

A planilha precisa ter **6 abas** com os nomes exatos abaixo (ou configure via `.env`).

### Aba `Militantes`
Cada linha representa um militante cadastrado. **Crie a planilha com esta ordem de colunas:**

| Coluna | Nome | Descrição |
|---|---|---|
| A | data_inscricao | Data do primeiro contato |
| B | nome | Nome completo |
| C | telefone | Número com código do país (ex: `5585999...`) |
| D | cidade | Cidade informada no cadastro |
| E | bairro | Bairro informado no cadastro |
| F | nivel | Nível de gamificação (1–6, preenchido pelo bot) |
| G | pontos | Pontuação acumulada |
| H | ultima_interacao | Data da última mensagem |
| I | missoes_concluidas | Total de missões concluídas |
| J | streak_atual | Dias consecutivos com missão |
| K | ultima_missao_data | Data da última missão respondida |
| L | titulos | Conquistas desbloqueadas |
| M | denuncias_enviadas | Contador de denúncias |
| N | conteudos_compartilhados | Contador de conteúdos |
| O | militantes_recrutados | Contador de recrutamentos |

### Aba `Missões`
Registra cada resposta de missão. Colunas: `data`, `telefone`, `missao_do_dia`, `status`, `pontos_gerados`

### Aba `Conteúdos`
Registra acessos a conteúdos. Colunas: `data`, `telefone`, `conteudo_acessado`, `tipo`

### Aba `Eventos`
Registra confirmações de presença. Colunas: `data`, `telefone`, `evento`, `confirmacao`

### Aba `Liderança`
Registra interesse em liderar. Colunas: `data`, `nome`, `telefone`, `bairro`, `area_interesse`, `disponibilidade`

### Aba `Denúncias`
Registra denúncias enviadas. Colunas: `data`, `telefone`, `bairro`, `descricao`, `link_midia`, `status_analise`

> **Importante:** A primeira linha de cada aba deve ser o cabeçalho (nomes das colunas). O bot começa a ler a partir da linha 2.

---

## Como criar a Service Account do Google

É necessário para que o bot leia e escreva na planilha.

1. Acesse [console.cloud.google.com](https://console.cloud.google.com)
2. Crie um projeto (ou use um existente)
3. Ative a **Google Sheets API**: APIs & Services → Library → "Google Sheets API" → Enable
4. Crie uma Service Account: IAM & Admin → Service Accounts → Create Service Account
   - Dê um nome qualquer (ex: `waclient-bot`)
   - Não precisa de papel/role, clique em "Done"
5. Clique na service account criada → Keys → Add Key → JSON
   - Faça o download do arquivo JSON
6. No arquivo JSON, copie:
   - `client_email` → variável `GOOGLE_SHEETS_CLIENT_EMAIL`
   - `private_key` → variável `GOOGLE_SHEETS_PRIVATE_KEY` (incluindo os `-----BEGIN...-----END-----`)
7. **Compartilhe a planilha** com o e-mail da service account (como Editor):
   - Abra a planilha → Compartilhar → cole o `client_email` → Editor

---

## CSV para envio em massa

O envio em massa aceita CSV com vírgula (`,`) ou ponto e vírgula (`;`) como separador.

**Formato com cabeçalho (recomendado):**
```csv
telefone,mensagem,link
5585999990001,Olá! Confira nossa novidade,https://link.com
5585999990002,Bem-vindo ao movimento,
```

**Campos reconhecidos para o telefone:** `telefone`, `numero`, `phone`, `whatsapp`, `celular`, `fone`, `mobile`

**Campos opcionais:** `mensagem` (texto livre), `link` (URL anexada à mensagem)

**Formato sem cabeçalho:** a primeira coluna é tratada como número de telefone.

O número pode estar com ou sem o código do país (`55`). O sistema normaliza automaticamente.

---

**Conversas (histórico de mensagens):**
- Preferência: **Upstash Redis** (configure `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`)
- Fallback: arquivo JSON em `/tmp` (perdido a cada novo deploy na Vercel)

**Dados dos militantes:**
- **Google Sheets** — planilha com abas: Militantes, Missões, Conteúdos, Eventos, Liderança, Denúncias

---

## API (endpoints)

### `GET /api/webhook`
Verificação do webhook pela Meta. Responde ao desafio `hub.challenge`.

### `POST /api/webhook`
Recebe mensagens e eventos do WhatsApp. Sem autenticação (verificada pelo token interno).

### `GET /api/conversations`
Lista todas as conversas. Requer header `x-app-password` se `APP_PASSWORD` estiver definido.

### `GET /api/conversations?id=PHONE`
Retorna uma conversa específica por telefone.

### `POST /api/conversations`
Cria conversa ou altera modo humano/bot. Body: `{ phone, name?, isHuman? }`.

### `POST /api/messages`
Envia uma mensagem. Body: `{ to: "5511...", text: "..." }`. Requer `x-app-password`.

### `GET /api/bulk`
Retorna status do último envio em massa.

### `POST /api/bulk`
Controla envio em massa. Body: `{ action: "upload" | "start" | "process" | "stop" }`.

---

## Interface web

Acesse `https://seu-projeto.vercel.app/` (ou `http://localhost:3000` em dev).

- **Aba Conversas**: lista conversas, clica para ver mensagens, envia resposta manual, alterna entre modo bot e modo humano
- **Aba Envio em Massa**: faz upload de CSV, inicia envio, monitora progresso

**Autenticação:** se `APP_PASSWORD` estiver definido, o painel pede senha. A senha é salva na `sessionStorage` do navegador (dura até fechar a aba).

---

## Como rodar localmente

```bash
# 1. Instalar dependências
npm install

# 2. Copiar e preencher variáveis de ambiente
cp .env.example .env.local
# edite .env.local com seus valores

# 3. Rodar em desenvolvimento
npm run dev
# Acesse: http://localhost:3000
```

> **Nota:** Para receber webhooks localmente, use [ngrok](https://ngrok.com/) ou similar para expor seu localhost e configure o URL no Meta for Developers.

---

## Deploy na Vercel

```bash
# 1. Instalar Vercel CLI
npm i -g vercel

# 2. Fazer login
vercel login

# 3. Deploy
npm run deploy
```

No painel da Vercel: **Settings → Environment Variables** — adicione todas as variáveis do `.env.local`.

Configure o webhook no Meta for Developers:
- **Callback URL**: `https://seu-projeto.vercel.app/api/webhook`
- **Verify Token**: (mesmo valor de `WHATSAPP_WEBHOOK_TOKEN`)
- **Campos inscritos**: `messages`

---

## Troubleshooting

| Problema | Causa provável | Solução |
|---|---|---|
| Webhook não recebe mensagens | Token errado ou URL errada | Verificar `WHATSAPP_WEBHOOK_TOKEN` e URL no Meta |
| Erro 401 ao enviar mensagem | Token do WhatsApp expirado | Gerar novo `WHATSAPP_ACCESS_TOKEN` no Meta |
| Erro 401 no painel web | Senha incorreta | Verificar `APP_PASSWORD` no `.env` |
| Bot não registra no Sheets | Credenciais Google erradas | Verificar `GOOGLE_SHEETS_CLIENT_EMAIL` e `PRIVATE_KEY` |
| Conversas perdidas após deploy | Sem Upstash configurado | Configurar `UPSTASH_REDIS_REST_URL` e `TOKEN` |
| Bot responde mas não cadastra | Planilha não compartilhada | Compartilhar a planilha com o e-mail da service account |

---

## Tech Stack

- **Runtime**: Node.js via Vercel Serverless Functions
- **Linguagem**: TypeScript
- **HTTP**: axios
- **WhatsApp**: Meta Cloud API (v24+)
- **Banco de dados**: Google Sheets (militantes) + Upstash Redis (conversas)
- **Frontend**: HTML/CSS/JS puro (sem framework)
- **Deploy**: Vercel
