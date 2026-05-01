# removido.md — Itens não implementados ou obsoletos

> Este documento lista o que existe no código mas **não está ativo**, ou o que foi descrito em versões anteriores da documentação mas **não condiz com o código real**. Verificado arquivo por arquivo em maio/2026.

---

## 1. `PEDIR_FOTO_DENUNCIA` — mensagem definida, nunca enviada

**Arquivo:** `src/inbox/militanciaMessages.ts`

A mensagem existe no objeto `MESSAGES_MILITANCIA`:

```typescript
PEDIR_FOTO_DENUNCIA: `📸 Se tiver uma foto do problema, pode enviar agora.\nOu envie *pular* para registrar sem foto.`
```

**O problema:** não existe stage `denuncia_foto` no `MilitanciaManager.ts`. O flow de denúncia vai direto de `denuncia_bairro` → `denuncia_descricao` → registra. A mensagem de foto nunca é enviada.

**Para ativar:** criar stage `denuncia_foto`, enviar `PEDIR_FOTO_DENUNCIA` após `PEDIR_DESCRICAO_DENUNCIA`, tratar o recebimento (ou timeout/pular), depois registrar.

---

## 2. `COMANDO_NAO_RECONHECIDO` — definido, nunca chamado

**Arquivo:** `src/inbox/militanciaMessages.ts`

```typescript
COMANDO_NAO_RECONHECIDO: `❓ Não entendi esse comando.\n\n${MESSAGES_MILITANCIA.MENU}`
```

**O problema:** no `MilitanciaManager.ts`, o bloco `default` do switch de comandos envia `MENU_PERSONALIZADO(militante.nome)` diretamente — não usa `COMANDO_NAO_RECONHECIDO`. Resultado: o militante sempre recebe o menu personalizado com o nome, nunca a mensagem de "não entendi".

**Se quiser usar:** substituir o `default` do switch em `processarMenuOuComando()` por:

```typescript
default:
  await whatsapp.sendMessage(celular, MESSAGES_MILITANCIA.COMANDO_NAO_RECONHECIDO);
  return false;
```

---

## 3. `LIDERANCA_MENU` — mantido como "backward compat", nunca enviado

**Arquivo:** `src/inbox/militanciaMessages.ts`

```typescript
// mantido para compatibilidade
LIDERANCA_MENU: `🌟 *Quero Contribuir Mais*\n\nComo você pode ajudar? ...`
```

**O problema:** nenhum ponto do `MilitanciaManager.ts` envia `LIDERANCA_MENU`. O flow atual usa `LIDERANCA_AGRADECIMENTO` + `LIDERANCA_OPCOES`.

**Status:** pode ser removido com segurança quando o código legado que o chamava for definitivamente descartado.

---

## 4. `PEDIR_DISPONIBILIDADE` — só usado no stage legado

**Arquivo:** `src/inbox/militanciaMessages.ts`

```typescript
// mantido para compatibilidade
PEDIR_DISPONIBILIDADE: `⏰ *Disponibilidade*\n\nQuando você estaria disponível para contribuir? ...`
```

**O problema:** esta mensagem é enviada **apenas** no stage `lideranca_disponibilidade`, que é marcado explicitamente no código como "backward-compat". Nenhum flow novo redireciona para esse stage — ele só existe para que usuários que ainda estejam com o stage salvo no Redis não travem.

**Status:** pode ser removido junto com o stage `lideranca_disponibilidade` após um ciclo de deploy seguro (Redis limpo ou TTL natural).

---

## 5. Stage `lideranca_disponibilidade` — obsoleto

**Arquivo:** `src/inbox/MilitanciaManager.ts`

```typescript
case 'lideranca_disponibilidade':
  // backward compatibility — ninguém novo chega aqui
  await registrarInteresseLideranca(militante.nome, celular, militante.bairro, conversa.militanciaData?.area || '', texto);
  await whatsapp.sendMessage(celular, MESSAGES_MILITANCIA.PEDIR_DISPONIBILIDADE);
  ...
```

**O problema:** o flow atual de liderança vai direto para `lideranca_area` e depois para `LIDERANCA_REGISTRADA`, sem coletar disponibilidade. A coluna F da aba `Liderança` (`disponibilidade`) nunca é preenchida para usuários novos.

**Status:** pode ser removido depois que não houver conversas com stage `lideranca_disponibilidade` ativo no Redis.

---

## 6. `obterTitulosSheet()` — função exportada, nunca chamada no manager

**Arquivo:** `src/utils/militanciaSheet.ts`

```typescript
export async function obterTitulosSheet(): Promise<Record<string, string>> { ... }
```

**O problema:** essa função lê a aba `Títulos` e retorna um `Record<string,string>`. Nenhum lugar em `MilitanciaManager.ts` a importa ou chama. O sistema de títulos foi substituído por `obterConquistas()` (aba `conquistas`).

**Status:** pode ser removido. A aba `Títulos` pode ser descontinuada.

---

## 7. `buscarMilitantePorPosicao()` — usada internamente, não exposta ao manager

**Arquivo:** `src/utils/militanciaSheet.ts`

```typescript
export async function buscarMilitantePorPosicao(posicao: number): Promise<MilitanteInfo | null> { ... }
```

**O problema:** é exportada mas `MilitanciaManager.ts` não a importa diretamente. Ela só é chamada **dentro** de `registrarOrigem()` para resolver um `#42` em telefone. Isso é correto e funcional — mas a exportação pública serve apenas para possíveis usos futuros ou testes.

**Status:** funcional onde está. Não precisa ser removida, mas pode ser tornada não-exportada se nenhum outro arquivo a usar fora do Sheets.

---

## 8. `isConcluido()` em `obterPainelBairro` — **CORRIGIDO**

**Status:** ✅ Corrigido em maio/2026.

**Era:** `obterPainelBairro()` lia col D da aba Missões para status "concluído", mas col D nunca era escrita. `missoesConcluidasSemana` era sempre 0.

**Correção:** a função agora lê col C (`concluiram` = CSV de telefones), filtra pelos membros do bairro e filtra para os últimos 7 dias via `parseDateBR`.

---

## 9. Docs anteriores — seções removidas da documentação

As seções abaixo existiam em versões anteriores do `MILITANCIA_BOT.md` mas foram **removidas por não refletirem o código real**:

- **"Roadmap e Melhorias Futuras"** — era especulativo e não baseado em código existente.
- **"Perfil com emoji de nível Espartano 🦁"** — o código usa `🦱`, não `🦁`.
- **`contarMilitantes()` como fonte de posição no CADASTRO_SUCESSO** — incorreto; agora usa `militante.posicao` se > 0, com fallback para `contarMilitantes()`.
- **Fluxo de foto de denúncia** — nunca foi implementado (ver item 1 acima).
- **Índice mencionando `lideranca_disponibilidade` como fluxo ativo** — é backward-compat apenas.
