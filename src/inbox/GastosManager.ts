/**
 * Gerenciador de Acompanhamento de Gastos (Água, Energia, Gás)
 * Separado da lógica de partido/mensagens genéricas
 */

import { appendPredioEntry, obterUltimaLeitura } from '../utils/predioSheet';
import { verificarInscrito, adicionarInscrito, listarInscricoesPorCelular } from '../utils/inscritosSheet';
import type { WhatsApp } from '../wabapi';

export interface PendingLeitura {
  valor?: string;
  tipo?: 'agua' | 'energia' | 'gas';
  idImovel?: string;
}

export interface InscritoDados {
  uid: string;
  idImovel: string;
  nome?: string;
  bairro?: string;
  celular: string;
  monitorandoAgua?: boolean;
  monitorandoEnergia?: boolean;
  monitorandoGas?: boolean;
}

/**
 * Gerenciador de lógica de gastos
 */
export class GastosManager {
  private client: WhatsApp;

  constructor(client: WhatsApp) {
    this.client = client;
  }

  /**
   * Verificar e listar inscrições de um usuário
   */
  async obterInscricoes(celular: string): Promise<InscritoDados[]> {
    try {
      return await listarInscricoesPorCelular(celular);
    } catch (erro) {
      return [];
    }
  }

  /**
   * Formatar lista de casas com última leitura
   */
  async formatarCasas(inscricoes: InscritoDados[]): Promise<string> {
    if (!inscricoes.length) return 'Nenhum imóvel encontrado.';
    
    const linhas: string[] = [];
    for (const item of inscricoes) {
      const ultima = await obterUltimaLeitura(item.idImovel);
      const ultimaTexto = ultima.leitura
        ? `${ultima.leitura}${ultima.data ? ` (${ultima.data})` : ''}`
        : 'sem leitura';
      linhas.push(`• ${item.idImovel} - ${item.bairro || 'bairro não informado'} - última leitura: ${ultimaTexto}`);
    }
    return linhas.join('\n');
  }

  /**
   * Responder comando "Meu UID"
   */
  async responderMeuUid(de: string, inscricoes: InscritoDados[]): Promise<void> {
    if (!inscricoes.length) {
      await this.client.sendMessage(de, 'Não encontrei seu cadastro.');
      return;
    }
    const linhas = inscricoes.map((i) => `• UID: ${i.uid} | Imóvel: ${i.idImovel}`);
    await this.client.sendMessage(de, `🔎 Seus dados:\n${linhas.join('\n')}`);
  }

  /**
   * Responder comando "Minhas casas"
   */
  async responderMinhasCasas(de: string, inscricoes: InscritoDados[]): Promise<void> {
    const lista = await this.formatarCasas(inscricoes);
    await this.client.sendMessage(de, `🏠 Suas casas:\n${lista}`);
  }

  /**
   * Responder comando "Como indicar"
   */
  async responderComoIndicar(de: string, inscricoes: InscritoDados[]): Promise<void> {
    if (!inscricoes.length) {
      await this.client.sendMessage(de, 'Não encontrei seu cadastro.');
      return;
    }
    await this.client.sendMessage(
      de,
      '🤝 Para indicar, compartilhe seu UID com um amigo e peça para ele informar no cadastro.\n\nSeus UID\'S estão abaixo:'
    );
    for (const item of inscricoes) {
      await this.client.sendMessage(de, item.uid);
    }
  }

  /**
   * Processar fluxo pendente de leitura
   * Retorna true se a mensagem foi processada como parte do fluxo
   */
  async processarPendingLeitura(
    de: string,
    texto: string,
    textoNormalizado: string,
    pending: PendingLeitura,
    inscricoes: InscritoDados[]
  ): Promise<{ processado: boolean; proximoStage?: 'tipo' | 'imovel' }> {
    const tipoMatch = textoNormalizado.match(/^(agua|energia|gas)$/i);
    if (!pending.tipo && tipoMatch) {
      pending.tipo = tipoMatch[1].toLowerCase() as 'agua' | 'energia' | 'gas';
    } else if (!pending.idImovel && inscricoes.length > 1) {
      const imovel = inscricoes.find((i) => i.idImovel.toLowerCase() === textoNormalizado);
      if (imovel) {
        pending.idImovel = imovel.idImovel;
      }
    }

    const unicoImovel = inscricoes.length === 1 ? inscricoes[0] : undefined;
    if (!pending.idImovel && unicoImovel) {
      pending.idImovel = unicoImovel.idImovel;
    }

    if (!pending.tipo) {
      await this.client.sendMessage(de, 'Qual o tipo de monitoramento? Responda com: água, energia ou gás.');
      return { processado: true, proximoStage: 'tipo' };
    }

    if (!pending.idImovel) {
      const lista = await this.formatarCasas(inscricoes);
      await this.client.sendMessage(de, `Qual o ID do imóvel?\n${lista}`);
      return { processado: true, proximoStage: 'imovel' };
    }

    // Tentar registrar a leitura
    const leituraValor = pending.valor || texto;
    const result = await appendPredioEntry({
      predio: pending.idImovel,
      numero: leituraValor,
      tipo: pending.tipo,
    });

    if (result.ok) {
      let reply = `✅ Você atualizou os gastos de ${pending.tipo} da ${pending.idImovel}.`;
      
      const leituraAtual = pending.valor;
      reply += `\n\n📊 Sua leitura atual é de ${leituraAtual} m³.`;
      
      if (result.anterior && result.dias && result.dias > 0) {
        reply += `\n📈 A leitura anterior de ${result.dias} dia${result.dias !== 1 ? 's' : ''} atrás foi de ${result.anterior} m³.`;
      }
      
      if (result.consumo) {
        const consumoNum = parseFloat(String(result.consumo).replace(',', '.'));
        if (result.dias && result.dias > 0) {
          const mediaStr = (consumoNum / result.dias).toFixed(2);
          reply += `\n💧 Seu consumo entre esses dias foi de ${result.consumo} m³, o que dá uma média de ${mediaStr} m³ por dia.`;
        } else {
          reply += `\n💧 Consumo calculado: ${result.consumo} m³.`;
        }
      }
      
      await this.client.sendMessage(de, reply);
    } else {
      await this.client.sendMessage(de, `❌ Não consegui registrar a leitura. ${result.erro || ''}`.trim());
    }

    return { processado: true };
  }

  /**
   * Parser de leitura - detecta padrões de envio de leitura
   * Retorna valor, tipo e id (se detectado)
   */
  parseArLeitura(textoNormalizado: string): {
    leituraValor?: string;
    leituraTipo?: 'agua' | 'energia' | 'gas';
    leituraId?: string;
  } {
    const partes = textoNormalizado.trim().split(/\s+/);
    let leituraValor: string | undefined;
    let leituraTipo: 'agua' | 'energia' | 'gas' | undefined;
    let leituraId: string | undefined;

    // Padrão 1: 3 partes = id tipo numero
    if (partes.length === 3) {
      const [id, tipo, numero] = partes;
      if (/^\d+[\d.,]*$/.test(numero) && /^(agua|energia|gas)$/i.test(tipo)) {
        leituraId = id;
        leituraTipo = tipo.toLowerCase() as 'agua' | 'energia' | 'gas';
        leituraValor = numero;
      }
    }

    // Padrão 2: 2 partes = tipo numero ou id numero
    if (!leituraValor && partes.length === 2) {
      const [parte1, parte2] = partes;
      if (/^\d+[\d.,]*$/.test(parte2)) {
        if (/^(agua|energia|gas)$/i.test(parte1)) {
          // tipo numero
          leituraTipo = parte1.toLowerCase() as 'agua' | 'energia' | 'gas';
          leituraValor = parte2;
        } else {
          // id numero
          leituraId = parte1;
          leituraValor = parte2;
        }
      }
    }

    // Padrão 3: 1 parte = só número
    if (!leituraValor && partes.length === 1) {
      if (/^\d+[\d.,]*$/.test(partes[0])) {
        leituraValor = partes[0];
      }
    }

    return { leituraValor, leituraTipo, leituraId };
  }

  /**
   * Processar envio de leitura
   * Retorna true se foi processado com sucesso
   */
  async processarLeitura(
    de: string,
    texto: string,
    leituraValor: string,
    leituraTipo: 'agua' | 'energia' | 'gas' | undefined,
    leituraId: string | undefined,
    inscricoes: InscritoDados[]
  ): Promise<{ processado: boolean; erro?: string; pendingLeitura?: PendingLeitura }> {
    if (!inscricoes.length) {
      await this.client.sendMessage(de, 'Não encontrei seu cadastro.');
      return { processado: true };
    }

    const unicoImovel = inscricoes.length === 1 ? inscricoes[0] : undefined;
    const monitoramentos = unicoImovel
      ? [
          unicoImovel.monitorandoAgua ? 'agua' : null,
          unicoImovel.monitorandoEnergia ? 'energia' : null,
          unicoImovel.monitorandoGas ? 'gas' : null,
        ].filter(Boolean)
      : [];

    // Validar/completar ID do imóvel
    if (leituraId && inscricoes.length > 1) {
      const imovelEncontrado = inscricoes.find((i) => i.idImovel.toLowerCase() === leituraId.toLowerCase());
      if (!imovelEncontrado) {
        const lista = await this.formatarCasas(inscricoes);
        await this.client.sendMessage(de, `ID de imóvel não encontrado.\n${lista}`);
        return { processado: true };
      }
    } else if (!leituraId && inscricoes.length > 1) {
      return {
        processado: true,
        pendingLeitura: { valor: leituraValor, tipo: leituraTipo },
        erro: 'NEED_ID',
      };
    }

    // Se não tem tipo informado
    if (!leituraTipo) {
      if (monitoramentos.length === 1) {
        leituraTipo = monitoramentos[0] as 'agua' | 'energia' | 'gas';
      } else if (monitoramentos.length > 1) {
        return {
          processado: true,
          pendingLeitura: { valor: leituraValor, idImovel: leituraId },
          erro: 'NEED_TYPE',
        };
      }
    }

    const idImovel = leituraId || unicoImovel?.idImovel;
    if (!idImovel || !leituraTipo) {
      return { processado: false };
    }

    // Registrar a leitura
    const result = await appendPredioEntry({
      predio: idImovel,
      numero: leituraValor,
      tipo: leituraTipo,
    });

    if (result.ok) {
      let reply = `✅ Você atualizou os gastos de ${leituraTipo} da ${idImovel}.`;
      
      reply += `\n\n📊 Sua leitura atual é de ${leituraValor} m³.`;
      
      if (result.anterior && result.dias && result.dias > 0) {
        reply += `\n📈 A leitura anterior de ${result.dias} dia${result.dias !== 1 ? 's' : ''} atrás foi de ${result.anterior} m³.`;
      }
      
      if (result.consumo) {
        const consumoNum = parseFloat(String(result.consumo).replace(',', '.'));
        if (result.dias && result.dias > 0) {
          const mediaStr = (consumoNum / result.dias).toFixed(2);
          reply += `\n💧 Seu consumo entre esses dias foi de ${result.consumo} m³, o que dá uma média de ${mediaStr} m³ por dia.`;
        } else {
          reply += `\n💧 Consumo calculado: ${result.consumo} m³.`;
        }
      }
      
      await this.client.sendMessage(de, reply);
    } else {
      await this.client.sendMessage(de, `❌ Não consegui registrar a leitura. ${result.erro || ''}`.trim());
    }

    return { processado: true };
  }
}
