# 🔒 Troubleshooting Erro 401

Erro 401 = **Não autorizado** (falta ou senha incorreta)

## 🔍 Seu Caso Específico

Seus logs mostram:
- ✅ `GET /api/conversations` = sucesso
- ❌ `POST /api/messages` = erro 401

Isso significa:
1. Autenticação funcionou para leitura (GET)
2. Mas falhou para escrita (POST)
3. **Provavelmente**: `APP_PASSWORD` não configurado ou diferente

---

## 🛠️ Debugging Passo a Passo

### **Passo 1: Abra o Console do Navegador**

Pressione `F12` ou `Cmd+Option+I` (Mac) e vá para a aba **Console**

### **Passo 2: Procure pelos logs de autenticação**

Procure por mensagens como:
```
[Auth] Tentando autenticar com senha de XX caracteres
[tryAuth] Testando autenticação com x-app-password length=XX
[authFetch] Enviando header x-app-password (length=XX)
```

**Anote o número de caracteres!**

### **Passo 3: Verifique o erro exato**

Procure por algo como:
```
[POST /api/messages] ❌ Erro 401 {
  status: 401,
  duration: 833,
  mensagem: "Request failed with status code 401",
  appPasswordLength: 15,
  isAuthed: true,
  fullError: {...}
}
```

### **Passo 4: Verifique no servidor**

Abra um terminal e execute:

```bash
# Verificar se APP_PASSWORD está configurado
grep APP_PASSWORD .env

# Se tiver valor, qual é?
echo $APP_PASSWORD

# Que usuário digitou? (você vê no console do navegador)
```

---

## ✅ Possíveis Soluções

### **Cenário A: GET funciona, POST retorna 401**

Isso é **muito estranho** se a autenticação estiver correta. Pode ser:

1. **Servidor defasado** - reinicie o servidor:
```bash
# Parar servidor (Ctrl+C)
# Aguardar
# npm run dev
```

2. **Variável `APP_PASSWORD` muda entre requisições** - verifique se está set corretamente:
```bash
# Verifique se está carregado
node -e "console.log(process.env.APP_PASSWORD)"

# Se não aparecer, adicione ao .env
echo "APP_PASSWORD=sua-senha-aqui" >> .env
```

3. **Middleware diferente para POST** - verifique se há middlewares que bloqueiam POST:
```bash
# Verificar api/messages.ts vs api/conversations.ts
diff api/messages.ts api/conversations.ts
```

### **Cenário B: A senha não é persistida**

Se `sessionStorage` está sendo limpo:

```javascript
// Execute no console do navegador
console.log(sessionStorage.getItem('appPassword'))
```

Se voltar vazio, a sessão foi perdida. **Digite a senha novamente no modal**.

---

## 📋 Checklist de Verificação

- [ ] `APP_PASSWORD` está configurado no `.env`?
- [ ] Servidor foi reiniciado após mudar `.env`?
- [ ] Você digitou a senha corretamente no modal?
- [ ] Abriu console (`F12`) e procurou pelos logs `[Auth]` e `[POST]`?
- [ ] Verificou quantos caracteres tem a senha?
- [ ] Não há espaços vazios antes/depois na senha?

---

## 🔗 Visioning rapida

Se tiver logs de console, compartilhe:
1. Toda a saída do `[Auth]` logs
2. Toda a saída do `[POST /api/messages] ❌ Erro` objeto
3. O resultado de `grep APP_PASSWORD .env`

---

## 📝 O que foi corrigido nesta versão

✅ **Logs de debug** adicionados para rastrear exatamente o que está sendo enviado  
✅ **Console.log** enriquecido com `appPasswordLength` para verificar se é vazio  
✅ **Mensagens mais específicas** para saber onde está falhando (auth vs POST)  

---

## 🔗 Arquivos envolvidos

- Frontend (auth + POST): [public/app.js](public/app.js)
- API (conversas): [api/conversations.ts](api/conversations.ts)
- API (mensagens): [api/messages.ts](api/messages.ts)
- Config: [src/config.ts](src/config.ts)
