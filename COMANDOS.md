# Bot de Monitoramento - Guia de Comandos

## 📋 Visão Geral

Este bot foi projetado para ser amigável e fácil de usar, permitindo que usuários monitorem o consumo de água, energia e gás de seus imóveis através do WhatsApp.

## 🚀 Primeiros Passos

### Para Novos Usuários

Quando você envia sua primeira mensagem para o bot, ele irá verificar se você já está cadastrado. Se não estiver, iniciará automaticamente o processo de inscrição:

1. **Nome completo**
2. **Bairro**
3. **CEP**
4. **Tipo de imóvel** (casa, apartamento, comercial, etc.)
5. **Número de pessoas** no imóvel
6. **UID de indicador** (opcional - se alguém te indicou)

Após completar a inscrição, você receberá seu **UID** e **ID do Imóvel**, que são usados para identificar suas propriedades e leituras.

## 💬 Comandos Disponíveis

### 🔍 Consultas

#### Meu UID
```
meu uid
uid
id
meu id
```
Mostra seus identificadores únicos (UID) e IDs dos imóveis cadastrados.

#### Minhas Casas
```
minhas casas
casas
imoveis
meus imoveis
propriedades
```
Lista todos os seus imóveis cadastrados com informações de última leitura.

#### Status
```
status
monitoramento
meu status
meus monitoramentos
```
Mostra o status de monitoramento de cada imóvel (quais tipos estão ativos: água, energia, gás).

### 💡 Ações

#### Enviar Leitura

Você pode enviar leituras de várias formas:

**Formato 1: Apenas o número**
```
123
```
Útil quando você tem apenas um imóvel e um tipo de monitoramento.

**Formato 2: Tipo + número**
```
agua 123
energia 456
gas 789
```
Especifica o tipo de monitoramento.

**Formato 3: ID do imóvel + tipo + número**
```
IMV001 agua 123
```
Para quando você tem múltiplos imóveis.

**Formato 4: ID do imóvel + número**
```
IMV001 123
```
O sistema detecta o tipo automaticamente se houver apenas um tipo de monitoramento ativo para aquele imóvel.

#### Adicionar Nova Casa
```
adicionar casa
nova casa
add casa
adicionar imovel
novo imovel
cadastrar casa
```

Inicia o processo para adicionar um novo imóvel ao seu cadastro. O bot irá perguntar:
1. **Bairro**
2. **CEP**
3. **Tipo de imóvel**
4. **Número de pessoas**

Após completar, você receberá um novo **ID de Imóvel** e poderá começar a enviar leituras para ele.

### 🤝 Indicações

#### Como Indicar
```
como indicar
indicar
indicacao
indicações
```
Mostra informações sobre como indicar amigos e receber benefícios.

### ❓ Ajuda

#### Menu Principal
```
ajuda
help
menu
?
```
Mostra o menu principal com todas as opções disponíveis.

#### Lista de Comandos
```
comandos
lista comandos
todos comandos
opcoes
```
Mostra uma lista completa de todos os comandos disponíveis.

#### Ajuda sobre Leituras
```
como enviar
enviar leitura
ajuda leitura
help leitura
```
Mostra instruções detalhadas sobre como enviar leituras.

## 📊 Exemplos de Uso

### Cenário 1: Usuário com um imóvel monitorando água

```
Usuário: 123
Bot: ✅ Leitura registrada!
📍 Imóvel: IMV001
💧 Tipo: agua
📊 Leitura atual: 123 m³
📈 Leitura anterior: 100 m³ (30 dias atrás)
💧 Consumo no período: 23 m³
📊 Média diária: 0.77 m³/dia
```

### Cenário 2: Usuário com múltiplos imóveis

```
Usuário: 456
Bot: ⚠️ Você tem mais de um imóvel cadastrado.
Por favor, informe o ID do imóvel junto com a leitura.

🏠 Seus imóveis cadastrados

• IMV001 - Centro - última leitura: 123 (15/02/2026)
• IMV002 - Jardins - última leitura: 89 (16/02/2026)

Usuário: IMV001 456
Bot: ✅ Leitura registrada! [...]
```

### Cenário 3: Adicionar novo imóvel

```
Usuário: adicionar casa
Bot: 🏠 Adicionar Novo Imóvel
Vamos cadastrar um novo imóvel para você!
Por favor, me diga o bairro deste imóvel.

Usuário: Vila Nova
Bot: ✅ Bairro: Vila Nova
Agora me diga o CEP do imóvel.

Usuário: 12345-678
Bot: ✅ CEP: 12345-678
Qual é o tipo de imóvel?
(Exemplos: casa, apartamento, comercial, etc.)

Usuário: apartamento
Bot: ✅ Tipo: apartamento
Quantas pessoas moram neste imóvel?

Usuário: 3
Bot: 🎉 Imóvel cadastrado com sucesso!
📋 Detalhes:
🏠 ID do Imóvel: IMV003
🆔 UID: uuid-aqui
📍 Bairro: Vila Nova
👥 Pessoas: 3

Agora você pode enviar leituras para este imóvel usando o ID: IMV003
Exemplo: IMV003 agua 123
```

## 🎯 Dicas de Uso

1. **Comandos flexíveis**: Você pode digitar os comandos em letras maiúsculas ou minúsculas.
2. **Múltiplos imóveis**: Se você tem vários imóveis, sempre inclua o ID do imóvel ao enviar leituras.
3. **Leituras rápidas**: Se você tem apenas um imóvel e um tipo de monitoramento, basta enviar o número.
4. **Aliases**: Muitos comandos têm várias formas de serem chamados (ex: "ajuda", "help", "menu").
5. **Processo interativo**: Quando você inicia uma ação (como adicionar casa), o bot guiará você passo a passo.

## 🔧 Arquitetura Técnica

### Estrutura Modular

O bot foi desenvolvido com uma arquitetura modular e extensível:

#### CommandHandler
Sistema de comandos que permite adicionar novos comandos facilmente sem modificar o código principal. Suporta:
- Múltiplos nomes para o mesmo comando
- Aliases
- Contexto completo da conversa

#### PropertyManager
Gerencia o fluxo de adição de novos imóveis, incluindo:
- Validação de usuário
- Coleta de informações passo a passo
- Integração com planilha Google Sheets

#### GastosManager
Responsável pelo processamento de leituras e consultas:
- Parse de diferentes formatos de leitura
- Validação de dados
- Cálculo de consumo e médias

#### ConversationManager
Orquestra todos os componentes e gerencia o estado da conversa:
- Processamento de webhooks
- Roteamento de mensagens
- Persistência de estado

### Mensagens Centralizadas

Todas as mensagens do bot estão centralizadas em `src/inbox/messages.ts`, facilitando:
- Manutenção
- Tradução futura
- Consistência de tom e estilo
- Personalização

## 🚧 Funcionalidades Futuras

O sistema está preparado para receber facilmente novas funcionalidades:

### Planejadas
- [ ] Adicionar novos tipos de monitoramento além de água/energia/gás
- [ ] Comandos administrativos
- [ ] Notificações automáticas de consumo alto
- [ ] Gráficos e relatórios por período
- [ ] Metas de consumo
- [ ] Comparação entre imóveis

### Como Adicionar Novos Comandos

```typescript
// Em ConversationManager.ts ou em um novo Manager
this.commandHandler.register({
  names: ['novo comando'],
  description: 'Descrição do comando',
  aliases: ['alias1', 'alias2'],
  handler: async (ctx) => {
    // Lógica do comando
    await this.client.sendMessage(ctx.celular, 'Resposta');
    return { handled: true };
  },
});
```

## 📞 Suporte

Se você tiver dúvidas ou problemas:
1. Digite `ajuda` para ver o menu completo
2. Use os comandos de consulta para verificar seus dados
3. Entre em contato com o suporte se necessário

---

**Versão**: 2.0 com melhorias de usabilidade
**Última atualização**: Fevereiro 2026
