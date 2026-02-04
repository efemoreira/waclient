# 📋 Guia de Logging - WAClient

## Resumo

A aplicação agora possui logging abrangente em todos os endpoints principais para facilitar debug e monitoramento de erros e processos.

## 🎯 Endpoints Monitorados

### 1. **POST /api/webhook** (Recepção de Mensagens)
```
🔍 WEBHOOK REQUEST - POST
  Verificação: ✅ Token matches
  Payload: {"messaging_product":"whatsapp"...}
```

**Logs incluem:**
- ✅/❌ Verificação de token
- Presença de challenge (webhook verification)
- Preview do payload (primeiros 200 caracteres)
- Erros com stack trace

---

### 2. **GET /api/conversations** (Listar todas as conversas)
```
📞 GET /api/conversations
  📊 Total: 3 conversa(s)
  ✅ Retornando lista
```

**Logs incluem:**
- Total de conversas
- Sucesso da operação

---

### 3. **GET /api/conversations?id=xxx** (Obter conversa específica)
```
📞 GET /api/conversations
  ID solicitado: 5511987654321
  ✅ Conversa encontrada: João Silva
  📊 Mensagens: 5, Não lidas: 2
```

**Logs incluem:**
- ID da conversa solicitada
- Nome do contato
- Número de mensagens
- Mensagens não lidas

---

### 4. **POST /api/conversations?id=xxx** (Assumir controle manual)
```
📞 POST /api/conversations
  ID: 5511987654321
  Assumir como humano: true
  ✅ Controle alterado com sucesso
```

**Logs incluem:**
- ID da conversa
- Tipo de controle (Humano ou Bot)
- Status da operação

---

### 5. **POST /api/messages** (Enviar mensagem individual)
```
💬 POST /api/messages
  📱 Para: 5511987654321
  ✏️  Texto: "Olá! Como posso ajudar?"
  ✅ Mensagem enviada com ID: wamid.xxx
```

**Logs incluem:**
- Número de destino
- Conteúdo da mensagem (primeiros 50 caracteres)
- ID da mensagem no WhatsApp
- Erros com detalhes

---

### 6. **GET /api/bulk/status** (Status do envio em massa)
```
📊 GET /api/bulk/status
  Ativo: ✅ Sim
  Progresso: 45/100
  Lote: 5/10
  Erros: 2
```

**Logs incluem:**
- Status de atividade
- Progresso do envio
- Número do lote atual
- Contagem de erros

---

### 7. **POST /api/bulk** (Upload e processamento de CSV)
```
📤 POST /api/bulk
  Ação: upload
  📁 Upload de CSV
  Linhas do CSV: 101
  Colunas: telefone, mensagem, link
  ✅ Registros válidos: 98
```

**Logs incluem:**
- Ação realizada (upload/start)
- Número de linhas
- Colunas detectadas
- Registros válidos encontrados

---

### 8. **POST /api/bulk start** (Iniciar envio em massa)
```
📤 POST /api/bulk
  Ação: start
  🚀 Iniciando envio em massa
  📋 Template: hello_world
  🌍 Idioma: pt_BR
  📞 Total de contatos: 100
```

**Logs incluem:**
- Template utilizado
- Idioma da mensagem
- Total de contatos

---

## 🏗️ Processamento Interno

### ConversationManager - processarWebhook
```
🔍 PROCESSANDO WEBHOOK
  👤 Contato: João Silva
  📨 Processando 2 mensagem(ns)...
    ✅ De 5511987654321: "Oi, tudo bem?"
  📊 Processando 1 status(es)
✅ WEBHOOK PROCESSADO
```

### ConversationManager - enviarMensagem
```
  📤 Enviando mensagem
    Para: 5511987654321
    Texto: "Olá! Como posso ajudar?"
    ✅ Enviada com ID: wamid.xxx
```

### ConversationManager - obterConversa
```
  🔍 Buscando conversa: 5511987654321
    ✅ Encontrada com 15 mensagens
```

### ConversationManager - alternarControleManual
```
  🔄 Alternando controle manual: 5511987654321 -> 👤 Humano
    ✅ Controle alterado
```

---

## ⚙️ Configuração do Sistema

Ao iniciar, o sistema valida as variáveis de ambiente:

```
==================================================
⚙️  CONFIGURAÇÃO DO SISTEMA
==================================================
✅ VARIÁVEIS DE AMBIENTE:
  ✓ WHATSAPP_PHONE_NUMBER_ID: 10000...
  ✓ WHATSAPP_BUSINESS_ACCOUNT_ID: 11000...
  ✓ WHATSAPP_ACCESS_TOKEN: presente
  ✓ WHATSAPP_WEBHOOK_TOKEN: presente
  API Version: v18
==================================================
```

**Se houver erro:**
```
❌ ERRO - Variáveis de ambiente faltando:
   - WHATSAPP_ACCESS_TOKEN
```

---

## 🎨 Padrão de Logging

### Emojis Utilizados

| Emoji | Significado | Exemplo |
|-------|-------------|---------|
| 📨 | Webhook/Mensagem recebida | `📨 WEBHOOK REQUEST` |
| 💬 | Mensagem sendo enviada | `💬 POST /api/messages` |
| 📞 | Conversa | `📞 GET /api/conversations` |
| 📤 | Upload/Envio em massa | `📤 POST /api/bulk` |
| 🔍 | Processamento/Debug | `🔍 PROCESSANDO WEBHOOK` |
| ✅ | Sucesso | `✅ Mensagem enviada` |
| ❌ | Erro | `❌ Conversa não encontrada` |
| ⚠️ | Aviso | `⚠️ Mensagem sem origem` |
| 💾 | Persistência | `💾 Salvas 5 conversas` |
| 📊 | Status/Estatísticas | `📊 Processando 3 status(es)` |
| 👤 | Contato/Usuário | `👤 Contato: João Silva` |
| 🚀 | Início de processo | `🚀 Iniciando envio` |
| 🔄 | Alteração | `🔄 Alternando controle` |
| ✏️ | Texto/Conteúdo | `✏️ Texto: "Olá"` |
| 📱 | Telefone | `📱 Para: 55119876...` |

### Estrutura Padrão

Cada requisição segue este padrão:

```
[sepador]
[emoji] [MÉTODO] [ENDPOINT]
[indentação] Parâmetro: valor
[indentação] ✅/❌ Resultado
[sepador]
```

---

## 🔍 Como Usar os Logs

### Ver logs localmente

```bash
npm run build    # Compilar
npm run dev      # Iniciar (vercel dev)
```

Logs aparecerão no terminal em tempo real.

### Ver logs na Vercel

1. Acesse: https://vercel.com/dashboard
2. Selecione o projeto **waclient**
3. Vá em **Deployments** → Clique no deployment recente
4. Clique em **Logs**
5. Filtre por tipo de função (webhook, messages, etc.)

---

## 📊 Exemplos de Debugging

### Problema: Mensagens não chegando

**O que procurar nos logs:**

1. **Webhook não recebendo?**
   - Verifique: `❌ WEBHOOK VERIFICATION` no webhook.ts
   - Cause: Token `WHATSAPP_WEBHOOK_TOKEN` incorreto

2. **Mensagem recebida mas não armazenada?**
   - Verifique: `❌ ERRO ao salvar conversas`
   - Cause: Problema com arquivo `/tmp/conversations.json`

3. **Erro ao enviar?**
   - Verifique: `❌ ERRO:` em `/api/messages`
   - Cause: Token WhatsApp inválido ou número incorreto

---

## ✨ Benefícios

- **Rastreamento completo** de todas as operações
- **Erros visíveis** com mensagens detalhadas
- **Debug fácil** com indicadores visuais
- **Monitoramento** de performance (latência)
- **Auditoria** de ações do sistema

---

## 🚀 Próximos Passos (Opcional)

Para melhorar ainda mais o logging:

1. **Adicionar timestamps** em todos os logs
2. **Persistir logs** em arquivo (Vercel Postgres)
3. **Criar dashboard** de logs em tempo real
4. **Alertas automáticos** para erros críticos
5. **Métricas** de performance (requests/segundo, latência média)

