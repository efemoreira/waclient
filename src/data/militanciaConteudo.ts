/**
 * Fonte de conteúdo da militância (missão do dia, publicações, eventos).
 *
 * Substitui a leitura via Google Sheets: o conteúdo agora vem direto do
 * arquivo militanciaConteudo.json, editado manualmente pela equipe.
 */
import conteudo from './militanciaConteudo.json';

export type MissaoAtual = {
  id: string;
  texto: string;
};

export type PublicacaoItem = {
  rede: string;
  link: string;
  texto: string;
  data: string;
};

export type EventoItem = {
  data: string;
  hora: string;
  local: string;
  texto: string;
};

function parseDataBr(data: string): number {
  const [dia, mes, ano] = data.split('/').map(Number);
  if (!dia || !mes || !ano) return 0;
  return new Date(ano, mes - 1, dia).getTime();
}

export function obterMissaoAtual(): MissaoAtual | null {
  return conteudo.missaoAtual ?? null;
}

export function obterPublicacoesRecentes(): PublicacaoItem[] {
  return conteudo.publicacoes ?? [];
}

export function obterProximosEventos(limite = 3): EventoItem[] {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return (conteudo.eventos ?? [])
    .filter((evento) => parseDataBr(evento.data) >= hoje.getTime())
    .sort((a, b) => parseDataBr(a.data) - parseDataBr(b.data))
    .slice(0, limite);
}
