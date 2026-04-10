# 🔒 Troubleshooting Erro 401

Erro 401 = **Não autorizado** (falta ou senha incorreta)

## 🔍 Diagnosticando

### 1. Verificar se `APP_PASSWORD` está configurado

No seu `.env`, procure pela variável:

```bash
grep APP_PASSWORD .env
```

**Se nada aparecer**: `APP_PASSWORD` não está configurado (padrão = desabilitado)

**Se aparecer**: `APP_PASSWORD=sua-senha-aqui` está configurado

---

## ✅ Solução Rápida

### **Opção A: Desativar proteção (para desenvolvimento local)**

1. Abra `.env`
2. Comente ou remova a linha `APP_PASSWORD`:
   ```bash
   # APP_PASSWORD=    (comentado = desabilitado)
   ```
3. Salve e reinicie o servidor

---

### **Opção B: Usar proteção de senha**

1. Abra `.env`
2. Configure uma senha:
   ```bash
   APP_PASSWORD=sua-senha-super-segura-123
   ```
3. Salve e reinicie o servidor
4. Quando abrir a página no navegador:
   - Um modal será exibido pedindo a senha
   - Digite a senha que configurou
   - Clique "Entrar"

---

## 🐛 Se o erro continuar

Comprove que seu servidor reiniciou com as mudanças:

```bash
# Parar o servidor (Ctrl+C)

# Verificar variáveis ativas
grep APP_PASSWORD .env

# Reiniciar
npm run dev  # ou seu comando de desenvolvimento
```

---

## 📝 O que foi corrigido

✅ **Proteção melhorada**: Agora o código verifica se você está autenticado antes de fazer requisições  
✅ **Tratamento de sessão expirada**: Se a senha expirar/mudar, apareça um modal para re-autenticar  
✅ **Mensagens mais claras**: Logs agora indicam quando falha autenticação vs outros erros  

---

## 🔗 Contexto

- Arquivo de config: [src/config.ts](src/config.ts)
- Frontend (auth): [public/app.js](public/app.js#L90)
- API (conversas): [api/conversations.ts](api/conversations.ts#L20)
- API (mensagens): [api/messages.ts](api/messages.ts#L17)
