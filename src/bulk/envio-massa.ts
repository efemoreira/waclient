import { WhatsApp } from '../wabapi';
import { config } from '../config';

/**
 * Representa um contato para envio
 */
export interface Contact {
  numero: string;
  mensagem: string;
  link?: string;
  status?: string;
  mensagem_id?: string;
  erro?: string;
}

/**
 * Gerenciador de envio de mensagens em massa
 */
export class EnvioMassa {
  private client: WhatsApp;
  private delayMensagens: number;

  constructor() {
    const apiVersion = parseInt(config.whatsapp.apiVersion, 10);
    this.client = new WhatsApp({
      token: config.whatsapp.token,
      numberId: config.whatsapp.numberId,
      version: apiVersion,
    });
    this.delayMensagens = config.bulk.delayBetweenMessages;
  }

  /**
   * Enviar mensagem para um contato individual
   */
  private async enviarParaContato(contato: Contact): Promise<void> {
    try {
      let texto = contato.mensagem;
      if (contato.link) {
        texto += `\n\n${contato.link}`;
      }

      const response = await this.client.sendMessage(
        contato.numero,
        texto
      );

      contato.status = 'enviado';
      contato.mensagem_id = response.data.messages?.[0]?.id;
    } catch (error: any) {
      contato.status = 'erro';
      contato.erro =
        error.response?.data?.error?.message || error.message;
    }
  }

  /**
   * Processar contatos com rate limiting
   */
  private async procesarContatos(contatos: Contact[]): Promise<void> {
    for (let i = 0; i < contatos.length; i++) {
      const contato = contatos[i];

      if (contato.status === 'enviado') {
        continue;
      }

      await this.enviarParaContato(contato);

      if (i < contatos.length - 1) {
        await new Promise(resolve => setTimeout(resolve, this.delayMensagens));
      }
    }
  }

  /**
   * Executar envio em massa
   */
  async executar(contatos: Contact[]): Promise<void> {
    await this.procesarContatos(contatos);
  }
}


