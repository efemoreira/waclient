# WhatsApp Business Bulk Messaging on Vercel

Sistema minimalista para envio em massa e gestão de conversas via WhatsApp Cloud API, deployado na Vercel.

## Funcionalidades

- 📨 **Receber mensagens** via webhook
- 📤 **Envio em massa** de mensagens (CSV)
- 💬 **Conversas** - visualizar histórico de mensagens
- 🚀 **Serverless** - executa completamente na Vercel (sem servidor dedicado)

## Setup

### 1. Variáveis de ambiente

Copiar `.env.example` para `.env.local`:

```bash
cp .env.example .env.local
```

Editar `.env.local` com suas credenciais do WhatsApp Business:

```
WHATSAPP_PHONE_NUMBER_ID=seu_numero_id
WHATSAPP_BUSINESS_ACCOUNT_ID=seu_account_id
WHATSAPP_ACCESS_TOKEN=seu_token_acesso
WHATSAPP_WEBHOOK_TOKEN=seu_token_webhook
```

### 2. Instalar dependências

```bash
npm install
```

### 3. Desenvolvimento local

```bash
npm run dev
```

Acesso: http://localhost:3000

### 4. Deploy na Vercel

```bash
npm run deploy
```

## Endpoints da API

### Webhook (Receber mensagens)
- `GET /api/webhook` - Validar webhook
- `POST /api/webhook` - Receber mensagens do WhatsApp

### Conversas
- `GET /api/conversations` - Listar todas as conversas
- `POST /api/conversations` - Assumir controle de conversa

### Mensagens
- `POST /api/messages` - Enviar mensagem individual

### Envio em massa
- `GET /api/bulk` - Obter status do último envio
- `POST /api/bulk` - Iniciar novo envio (form-data com CSV)

### Frontend
- `GET /api/index` - Interface web para conversas e bulk messaging

## Estrutura do projeto

```
/api              → Funções Vercel (endpoints)
/src
  /wabapi         → Cliente WhatsApp Cloud API
  /inbox          → Gerenciador de conversas
  /bulk           → Envio de mensagens em massa
  /utils          → Funções utilitárias
  config.ts       → Configuração centralizada
/public           → Interface web (HTML/CSS/JS)
vercel.json       → Configuração Vercel
tsconfig.json     → Configuração TypeScript
package.json      → Dependências (apenas axios + dotenv)
```

## CSV para envio em massa

Formato esperado:
```csv
numero,mensagem,link
5511987654321,"Olá! Confira nossa oferta",https://link.com
5511987654322,"Bem-vindo ao nosso serviço","https://outro-link.com"
```

**Campos obrigatórios:**
- `numero`: Número WhatsApp com código do país (ex: 55DDNNNNNNNNN)
- `mensagem`: Texto da mensagem
- `link`: URL (opcional)

## Como funciona

### Webhook
Recebe eventos do WhatsApp Cloud API e armazena mensagens em memória.

### Conversas
Interface para visualizar histórico de mensagens trocadas com contatos.

### Envio em massa
1. Upload do CSV com números e mensagens
2. Processamento com rate limiting (configurável)
3. Monitoramento de status em tempo real
4. Relatório de sucesso/erros

## Configuração avançada

Ver arquivo `src/config.ts` para ajustar:
- Delay entre mensagens (padrão: 100ms)
- Tamanho dos lotes (padrão: 10 mensagens)
- Delay entre lotes (padrão: 5s)
- Webhook token para segurança

## Deploy

### 1. Instalar Vercel CLI
```bash
npm i -g vercel
```

### 2. Fazer login
```bash
vercel login
```

### 3. Deploy
```bash
npm run deploy
```

### 4. Configurar variáveis de ambiente
Na dashboard Vercel, adicionar as variáveis do `.env.example` em Project Settings → Environment Variables.

## Troubleshooting

- **Webhook não recebe mensagens**: Verificar `WHATSAPP_WEBHOOK_TOKEN` e configuração no Meta for Developers
- **Erros de envio**: Verificar token de acesso e número de telefone válido
- **Limite de taxa**: Aumentar `BULK_DELAY_BETWEEN_MESSAGES` em segundos

## Tech Stack

- **Runtime**: Node.js no Vercel Functions
- **Linguagem**: TypeScript
- **API HTTP**: axios
- **Configuração**: dotenv
- **Framework**: Vercel serverless
