/**
 * Gerenciador de Acompanhamento de Gastos (Água, Energia, Gás)
 * Separado da lógica de partido/mensagens genéricas
 */

import { appendPredioEntry, obterUltimaLeitura } from '../utils/predioSheet';
import { verificarInscrito, adicionarInscrito, listarInscricoesPorCelular } from '../utils/inscritosSheet';
import type { WhatsApp } from '../wabapi';
import { MESSAGES } from './messages';

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
   * Determinar tipos de monitoramento comuns a todas as inscrições.
   * Retorna um array com todos os tipos comuns (vazio se não houver nenhum).
   */
  private obterMonitoramentosComuns(inscricoes: InscritoDados[]): ('agua' | 'energia' | 'gas')[] {
    if (!inscricoes.length) return [];

    // Mapeamento entre tipos e suas propriedades correspondentes
    const tipoParaPropriedade: Record<'agua' | 'energia' | 'gas', keyof InscritoDados> = {
      agua: 'monitorandoAgua',
      energia: 'monitorandoEnergia',
      gas: 'monitorandoGas',
    };

    // Coletar todos os tipos que TODAS as inscrições monitoram
    const tipos = ['agua', 'energia', 'gas'] as const;
    const tiposComuns: ('agua' | 'energia' | 'gas')[] = [];

    for (const tipo of tipos) {
      const propriedade = tipoParaPropriedade[tipo];
      // Se TODAS as inscrições monitoram este tipo
      const todasMonitoram = inscricoes.every((inscricao) => inscricao[propriedade] === true);
      if (todasMonitoram) {
        tiposComuns.push(tipo);
      }
    }

    return tiposComuns;
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
      await this.client.sendMessage(de, MESSAGES.ERRO_CADASTRO_NAO_ENCONTRADO);
      return;
    }
    const uids = inscricoes.map((i) => ({ uid: i.uid, idImovel: i.idImovel }));
    await this.client.sendMessage(de, MESSAGES.INFO_MEUS_UIDS(uids));
  }

  /**
   * Responder comando "Minhas casas"
   */
  async responderMinhasCasas(de: string, inscricoes: InscritoDados[]): Promise<void> {
    const lista = await this.formatarCasas(inscricoes);
    await this.client.sendMessage(de, MESSAGES.INFO_MINHAS_CASAS(lista));
  }

  /**
   * Responder comando "Como indicar"
   */
  async responderComoIndicar(de: string, inscricoes: InscritoDados[]): Promise<void> {
    if (!inscricoes.length) {
      await this.client.sendMessage(de, MESSAGES.ERRO_CADASTRO_NAO_ENCONTRADO);
      return;
    }
    const uids = inscricoes.map((i) => i.uid);
    await this.client.sendMessage(de, MESSAGES.INFO_COMO_INDICAR(uids));
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

    // Auto-detectar tipo:
    // 1) Se um imóvel já foi selecionado, considerar apenas as inscrições daquele imóvel
    //    e auto-detectar somente se houver exatamente um tipo possível para ele.
    // 2) Caso contrário (ou se o imóvel tiver mais de um tipo possível), cair no
    //    comportamento atual: tipo comum entre todas as inscrições.
    if (!pending.tipo) {
      if (pending.idImovel) {
        const inscricoesDoImovel = inscricoes.filter(
          (i) => i.idImovel === pending.idImovel
        );
        if (inscricoesDoImovel.length > 0) {
          const monitoramentosImovel = this.obterMonitoramentosComuns(inscricoesDoImovel);
          if (monitoramentosImovel.length === 1) {
            pending.tipo = monitoramentosImovel[0];
          }
        }
      }

      if (!pending.tipo) {
        const monitoramentos = this.obterMonitoramentosComuns(inscricoes);
        if (monitoramentos.length === 1) {
          pending.tipo = monitoramentos[0];
        }
      }
    }

    if (!pending.tipo) {
      await this.client.sendMessage(de, MESSAGES.ERRO_PRECISA_TIPO);
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
      const leituraAtual = pending.valor || leituraValor;
      const media = result.consumo && result.dias && result.dias > 0
        ? (parseFloat(String(result.consumo).replace(',', '.')) / result.dias).toFixed(2)
        : undefined;

      const reply = MESSAGES.LEITURA_COM_HISTORICO({
        tipo: pending.tipo,
        idImovel: pending.idImovel,
        leituraAtual,
        leituraAnterior: result.anterior,
        dias: result.dias,
        consumo: result.consumo,
        media,
      });
      
      await this.client.sendMessage(de, reply);
    } else {
      await this.client.sendMessage(de, MESSAGES.ERRO_LEITURA_REGISTRO(result.erro));
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
      await this.client.sendMessage(de, MESSAGES.ERRO_CADASTRO_NAO_ENCONTRADO);
      return { processado: true };
    }

    const unicoImovel = inscricoes.length === 1 ? inscricoes[0] : undefined;
    // Obter tipos de monitoramento comuns a todas as inscrições
    const monitoramentos = this.obterMonitoramentosComuns(inscricoes);

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
      const media = result.consumo && result.dias && result.dias > 0
        ? (parseFloat(String(result.consumo).replace(',', '.')) / result.dias).toFixed(2)
        : undefined;

      const reply = MESSAGES.LEITURA_COM_HISTORICO({
        tipo: leituraTipo,
        idImovel,
        leituraAtual: leituraValor,
        leituraAnterior: result.anterior,
        dias: result.dias,
        consumo: result.consumo,
        media,
      });
      
      await this.client.sendMessage(de, reply);
    } else {
      await this.client.sendMessage(de, MESSAGES.ERRO_LEITURA_REGISTRO(result.erro));
    }

    return { processado: true };
  }
}
