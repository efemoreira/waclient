# QuickStart - WhatsApp Bulk Messaging na Vercel

## 1️⃣ Preparação (2 min)

```bash
# Clonar repositório
git clone <seu-repo>
cd waclient

# Copiar exemplo de env
cp .env.example .env.local

# Editar com suas credenciais
nano .env.local
```

**Variáveis necessárias no `.env.local`:**
- `WHATSAPP_PHONE_NUMBER_ID` - De: Meta for Developers → WhatsApp Business
- `WHATSAPP_BUSINESS_ACCOUNT_ID` - De: Meta for Developers
- `WHATSAPP_ACCESS_TOKEN` - De: Meta for Developers → App Roles
- `WHATSAPP_WEBHOOK_TOKEN` - Gerar valor aleatório (ex: `sha256-token-123`)

## 2️⃣ Desenvolvimento (5 min)

```bash
# Instalar dependências
npm install

# Iniciar servidor local
npm run dev

# Acessar: http://localhost:3000
```

A interface web tem 2 abas:
- **Conversas**: Ver histórico de mensagens
- **Envio em Massa**: Upload CSV e monitorar

## 3️⃣ Arquivo CSV para envio

Salvar como `contatos.csv`:

```csv
numero,mensagem,link
5511987654321,"Olá! Confira nossa oferta especial",https://meusite.com/oferta
5511987654322,"Bem-vindo ao nosso serviço","https://meusite.com"
```

Campos:
- `numero`: 55 + DDD + número (11 dígitos após 55)
- `mensagem`: Texto com até 1000 caracteres
- `link`: URL para compartilhar (opcional)

## 4️⃣ Deploy na Vercel (3 min)

```bash
# Instalar Vercel CLI (primeira vez)
npm i -g vercel

# Login
vercel login

# Deploy
npm run deploy
```

Após deploy:
1. Copiar URL do projeto
2. Ir para Meta for Developers → Webhooks
3. Configurar Callback URL: `https://seu-projeto.vercel.app/api/webhook`
4. Verificar token configurado em `WHATSAPP_WEBHOOK_TOKEN`

## 5️⃣ Usando em produção

Acessar: `https://seu-projeto.vercel.app`

**Fluxo:**
1. WhatsApp envia mensagens → webhook recebe
2. Você vê conversas na aba "Conversas"
3. Você faz upload CSV → envio em massa automático
4. Status em tempo real na interface

## Configuração de Rate Limit

Em `.env.local` ajustar:

```
BULK_DELAY_BETWEEN_MESSAGES=100    # ms entre cada mensagem
BULK_BATCH_SIZE=10                  # mensagens por lote
BULK_DELAY_BETWEEN_BATCHES=5000     # ms entre lotes (5 segundos)
```

⚠️ **Dica**: WhatsApp recomenda mínimo 100ms entre mensagens para evitar rate limit.

## Troubleshooting

### "Invalid access token"
- Verificar token em Meta for Developers
- Token pode estar expirado → regenerar

### "Webhook validation failed"
- Certificar que `WHATSAPP_WEBHOOK_TOKEN` está correto
- Deve bater com valor configurado em Meta for Developers

### "Invalid recipient"
- Número precisa estar no formato: 55DDNNNNNNNNN
- Contacto deve ter aceito opt-in para receberativos de WhatsApp

### CSV não processa
- Verificar encoding UTF-8
- Sem quebras de linha no meio do texto
- Colunas exatas: numero, mensagem, link

## Próximos passos

- [ ] Conectar webhook em Meta for Developers
- [ ] Testar com número pessoal
- [ ] Upload de CSV para envio em massa
- [ ] Monitorar logs em Vercel Dashboard

---

**Dúvidas?** Ver [README.md](README.md) para detalhes completos.
