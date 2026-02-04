# ⚙️ Configuração de Variáveis de Ambiente - Vercel

## 1️⃣ Coletando os Valores

### WHATSAPP_PHONE_NUMBER_ID
1. Entre em [Meta for Developers](https://developers.facebook.com/)
2. Acesse seu **App** → **WhatsApp** → **Configuration**
3. Copie o **Phone number ID**

### WHATSAPP_BUSINESS_ACCOUNT_ID
1. Vá para **Settings** → **Basic**
2. Copie o **App ID** (é o que precisa de início, ou vá para WhatsApp Settings para encontrar)
3. Ou acesse **WhatsApp Manager** → **Settings** para encontrar o Business Account ID

### WHATSAPP_ACCESS_TOKEN
1. Em **App Roles**, clique em **Get Token**
2. Selecione seu aplicativo
3. Permissões necessárias:
   - `whatsapp_business_messaging`
   - `whatsapp_business_management` (opcional)
4. Clique em **Generate Token**
5. ⚠️ **COPIE AGORA** - só aparece uma vez!

### WHATSAPP_WEBHOOK_TOKEN
- **Crie um valor aleatório e seguro** (ex: uma sequência aleatória como `abc123def456ghi789`)
- Use o **MESMO VALOR** quando configurar o webhook no Meta for Developers
- Nunca revele publicamente

## 2️⃣ Adicionando no Vercel

### Via Dashboard Web
1. Vá para [vercel.com/dashboard](https://vercel.com/dashboard)
2. Clique em seu projeto **waclient**
3. **Settings** → **Environment Variables**
4. Adicione cada variável:
   - Name: `WHATSAPP_PHONE_NUMBER_ID`
   - Value: `seu_valor_aqui`
   - Clique em **Save**

Repita para:
- `WHATSAPP_BUSINESS_ACCOUNT_ID`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_WEBHOOK_TOKEN`

### Via CLI (se tiver Vercel CLI instalado)
```bash
vercel env add WHATSAPP_PHONE_NUMBER_ID
vercel env add WHATSAPP_BUSINESS_ACCOUNT_ID
vercel env add WHATSAPP_ACCESS_TOKEN
vercel env add WHATSAPP_WEBHOOK_TOKEN
```

## 3️⃣ Validando Webhook no Meta for Developers

Depois de adicionar as env vars na Vercel:

1. Vá para **Settings** → **Configuration** (sua app WhatsApp)
2. Procure por **Webhook**
3. Clique em **Edit** (ou **Verify Token** se já existente)
4. Preencha:
   - **Callback URL**: `https://waclient-puce.vercel.app/api/webhook`
   - **Verify Token**: `meu-token-secreto-seguro-123` (o valor que colocou em `WHATSAPP_WEBHOOK_TOKEN`)
5. Clique em **Verify and Save**

### ✅ Webhook Subscription
Certifique-se que está inscrito em:
- ✅ `messages` - para receber mensagens
- ✅ `message_status` - para status de entrega (opcional)

## 4️⃣ Testando Tudo

### Teste 1: Acessar a interface
```bash
https://waclient-puce.vercel.app/
```

Você deve ver a interface web com as abas:
- 💬 Conversas
- 📨 Envio em Massa

### Teste 2: Enviar Mensagem
1. Vá para a aba **Conversas**
2. Selecione um contato
3. Digite uma mensagem
4. Clique em enviar

## 5️⃣ Troubleshooting

### ❌ Erro: "Token inválido" no webhook
- Verifique se `WHATSAPP_WEBHOOK_TOKEN` está exatamente igual no Vercel e no Meta
- Aguarde ~1 min para Vercel fazer redeploy após adicionar env var

### ❌ Erro: "Não é possível validar a URL de callback"
- Certifique-se que a URL está correta: `https://waclient-puce.vercel.app/api/webhook`
- Verifique se o projeto foi deployado com sucesso no Vercel

### ❌ Mensagens não são recebidas
- Confirme que webhook passou na validação ✅
- Verifique se `messages` está inscrito em Webhook Subscriptions
- Verifique os **Logs** no Vercel para erros

### ❌ Erro ao enviar mensagem
- Verifique se `WHATSAPP_ACCESS_TOKEN` está correto
- Confirme se o número tem permissão (adicione números em Message Template Testing)

## 📚 Links Úteis

- [Meta for Developers - WhatsApp Docs](https://developers.facebook.com/docs/whatsapp)
- [Webhook Testing Tool](https://webhook.site/) - para testar webhooks localmente
- [Vercel Environment Variables](https://vercel.com/docs/projects/environment-variables)
