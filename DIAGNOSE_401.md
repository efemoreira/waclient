# 🔍 Diagnóstico: Erro 401 ao Enviar Mensagens

O erro `401 Request failed with status code 401` significa **Não Autorizado**.

No seu caso, as conversas carregam OK, mas o POST para enviar falha. Isso aponta para um **problema no token da API do WhatsApp**, não na autenticação do frontend.

---

## 🎯 Checklist de Debug

### **1. Verifique o Token no `.env`:**

```bash
# Terminal
grep "WHATSAPP_ACCESS_TOKEN" .env
```

**Esperado:**
```
WHATSAPP_ACCESS_TOKEN=EAAIxxx...muito-longo...
```

**Se retornar vazio ou "WHATSAPP_ACCESS_TOKEN not found":**
```
❌ Token não configurado!
```

---

### **2. Verifique o Server Logs:**

Abra o terminal onde o servidor está rodando. Procure por mensagens como:

```
[ConversationManager Constructor] 🔐 Configuração:
  tokenPresent: false  ← ❌ PROBLEMA!
  tokenLength: 0
```

**ou**

```
[sendTextMessage] 📤 Enviando para WhatsApp API
  tokenPresent: true ✅
  tokenLength: 123
```

---

### **3. Logs de Erro Detalhado:**

Se receber erro 401, o servidor vai logar:

```
[sendTextMessage] ❌ Erro ao enviar para WhatsApp API
  status: 401
  statusText: Unauthorized
  errorCode: (código do WhatsApp)
  errorType: OAuthException
  fbtrace_id: ABC123...
```

**Copie o `fbtrace_id` - será útil para debug no Facebook!**

---

## 🚨 Possíveis Causas

### **Causa 1: Token não configurado**
```bash
# .env está vazio?
cat .env | grep WHATSAPP_ACCESS_TOKEN
# Retorna nada? Você precisa adicionar:
echo "WHATSAPP_ACCESS_TOKEN=EAAIxxx..." >> .env
```

### **Causa 2: Token expirado**
- Tokens do Facebook expiram periodicamente
- Regenere em: https://developers.facebook.com/
- Vá até: App → Configurações → System User Tokens

### **Causa 3: Token sem permissão**
- O token precisa ter permissões `whatsapp_business_messaging`
- Ou foi criado com permissões limitadas

### **Causa 4: ID do número incorreto**
```bash
# Verifique também:
grep "WHATSAPP_PHONE_NUMBER_ID" .env
grep "WHATSAPP_BUSINESS_ACCOUNT_ID" .env
```

---

## 🔧 Passos para Resolver

### **Opção A: Gerar novo token** (Recomendado)

1. Acesse: https://developers.facebook.com/
2. Vá para seu App → Configurações → System Users
3. Clique no usuário que tem acesso ao WhatsApp
4. Gere um novo **Token de Acesso** (30 dias ou maior)
5. Copie o token completo
6. Cole no `.env`:
   ```bash
   WHATSAPP_ACCESS_TOKEN=EAAIxxx...
   ```
7. Reinicie o servidor:
   ```bash
   npm run build && npm run dev
   ```

### **Opção B: Debug imediato**

```bash
# 1. Verifique as variáveis atuais
cat .env | grep WHATSAPP

# 2. Reinicie o servidor com output detalhado
npm run build

# 3. Execute e OBSERVE os logs iniciais do server:
npm run dev

# Procure por:
# [ConversationManager Constructor] 🔐 Configuração
```

---

## 📝 O que foi adicionado para Debug

✅ **src/wabapi/Message.ts**
- Logs ao iniciar envio
- Logs de sucesso/erro com detalhes

✅ **src/inbox/ConversationManager.ts**
- Verificação do token no constructor
- Logs detalhados do erro 401 com possíveis causas
- Exibição do `fbtrace_id` para debug no Facebook

✅ **public/app.js**
- Já tem logs de autenticação e POST

---

## 📞 Se Ainda Não Funcionar

Com os novos logs, execute:

```bash
# 1. Terminal - veja o output do servidor
npm run dev

# 2. Navegador - procure pelos logs:
# [Auth] INFO: ✅ Autenticado com sucesso
# [POST /api/messages] ❌ Erro 401

# 3. Compartilhe especialmente:
# - O objeto erro completo do console (F12 → Console → red error)
# - Os logs do servidor quando tenta enviar a mensagem
# - O valor de WHATSAPP_ACCESS_TOKEN (primeiros 20 chars + ***)
```

---

## 🎓 Por que funciona assim

```
Frontend (app.js)
    ↓
    POST /api/messages + x-app-password ✅ FUNCIONA
    ↓
API Backend (api/messages.ts)
    ↓
    ConversationManager.enviarMensagem("551199999", "Olá")
    ↓
Message.ts → axios.post("https://graph.facebook.com/v24.0/.../messages", {
    headers: "Bearer {WHATSAPP_ACCESS_TOKEN}"  ← AQUI FALHA COM 401
})
    ↓
❌ 401: Token inválido/expirado/sem permissão
```

A solução é **gerar um novo token** válido e configurar no `.env`.
