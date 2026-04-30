/** Mock do cliente WhatsApp — captura mensagens enviadas sem chamadas de rede */
export class WhatsApp {
  public sent: Array<{ to: string; text: string }> = [];

  async sendMessage(to: string, text: string): Promise<void> {
    this.sent.push({ to, text });
  }

  lastMessage(): string | undefined {
    return this.sent[this.sent.length - 1]?.text;
  }

  messagesTo(to: string): string[] {
    return this.sent.filter((m) => m.to === to).map((m) => m.text);
  }

  reset(): void {
    this.sent = [];
  }
}
