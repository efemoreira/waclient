import { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import { parse } from 'csv-parse/sync';
import { EnvioMassa } from '../src/bulk/envio-massa';
import { config, validateConfig } from '../src/config';
import { promises as fs } from 'fs';

if (!validateConfig()) {
  console.error('❌ Configuração inválida');
}

// Store status em arquivo (Vercel tmp)
const statusFile = '/tmp/bulk-status.json';
const stopFile = '/tmp/bulk-stop.json';
const queueFile = '/tmp/bulk-queue.json';

interface BulkStatus {
  ativo: boolean;
  total: number;
  enviados: number;
  erros: number;
  loteAtual: number;
  totalLotes: number;
  template: string;
  language: string;
  timestamp: number;
  lastErrors?: Array<{ numero: string; erro: string; at: number }>;
  interrompido?: boolean;
  mensagem?: string;
  lastRequests?: Array<{ url: string; payload: any; at: number }>;
}

const defaultStatus: BulkStatus = {
  ativo: false,
  total: 0,
  enviados: 0,
  erros: 0,
  loteAtual: 0,
  totalLotes: 0,
  template: '',
  language: 'pt_BR',
  timestamp: Date.now(),
  lastErrors: [],
  interrompido: false,
  mensagem: '',
  lastRequests: [],
};

function normalizarNumero(numero: string): string {
  const digits = String(numero || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.startsWith('55') ? digits : `55${digits}`;
}

function limparLinhaSep(csv: string): string {
  const linhas = csv.split('\n');
  if (linhas[0]?.trim().toLowerCase().startsWith('sep=')) {
    linhas.shift();
  }
  return linhas.join('\n');
}

function detectarDelimiter(csv: string): string {
  const primeiraLinha = csv.split('\n').find(l => l.trim()) || '';
  const virgulas = (primeiraLinha.match(/,/g) || []).length;
  const pontosEVirgula = (primeiraLinha.match(/;/g) || []).length;
  return pontosEVirgula > virgulas ? ';' : ',';
}

function parseCsvSemHeader(csv: string): any[] {
  const delimiter = detectarDelimiter(csv);
  const rows = parse(csv, {
    columns: false,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
    bom: true,
    delimiter,
  }) as any[];

  return rows
    .map((row) => ({ numero: normalizarNumero(row?.[0] || '') }))
    .filter((obj) => obj.numero);
}

function encontrarCampoNumero(obj: Record<string, any>): string | null {
  const keys = Object.keys(obj || {});
  const candidatos = ['telefone', 'numero', 'phone', 'whatsapp', 'celular', 'fone', 'mobile'];
  const direto = keys.find(k => candidatos.includes(k));
  if (direto) return direto;

  const regex = /(tel|fone|cel|whats|phone|mobile|numero|número)/i;
  return keys.find(k => regex.test(k)) || null;
}

function parseCsv(csv: string): any[] {
  const cleaned = limparLinhaSep(csv);
  const delimiter = detectarDelimiter(cleaned);
  const primeiraLinha = cleaned.split('\n').find(l => l.trim()) || '';
  const temHeader = /[a-zA-Z]/.test(primeiraLinha);

  if (!temHeader) {
    return parseCsvSemHeader(cleaned);
  }

  const records = parse(cleaned, {
    columns: (header: string[]) => header.map((h: string) => h.trim().toLowerCase()),
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
    bom: true,
    delimiter,
  }) as any[];

  const normalized = records
    .map((obj) => {
      const campoNumero = encontrarCampoNumero(obj);
      if (campoNumero && !obj.numero && !obj.telefone) {
        obj.numero = obj[campoNumero];
      }
      if (obj.telefone) obj.telefone = normalizarNumero(obj.telefone);
      if (obj.numero) obj.numero = normalizarNumero(obj.numero);
      return obj;
    })
    .filter((obj) => obj.telefone || obj.numero);

  if (normalized.length === 0) {
    return parseCsvSemHeader(cleaned);
  }

  return normalized;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

async function validarNumerosWhatsApp(numeros: string[]): Promise<{
  resultado: Map<string, { valido: boolean | null; wa_id?: string; motivo?: string }>;
  disponivel: boolean;
}> {
  const resultado = new Map<string, { valido: boolean | null; wa_id?: string; motivo?: string }>();
  let disponivel = true;

  if (!config.whatsapp.token || !config.whatsapp.numberId) {
    numeros.forEach((n) => resultado.set(n, { valido: null, motivo: 'Configuração WhatsApp incompleta' }));
    return { resultado, disponivel: false };
  }

  const apiVersion = config.whatsapp.apiVersion;
  const url = `https://graph.facebook.com/v${apiVersion}/${config.whatsapp.numberId}/contacts`;
  const headers = { Authorization: `Bearer ${config.whatsapp.token}` };

  const chunks = chunkArray(numeros, 100);
  for (const chunk of chunks) {
    try {
      const payload = { blocking: 'wait', contacts: chunk };
      const response = await axios.post(url, payload, { headers });
      const contacts = response.data?.contacts || [];

      const retornados = new Set<string>();
      contacts.forEach((c: any) => {
        retornados.add(c.input);
        if (c.status === 'valid') {
          resultado.set(c.input, { valido: true, wa_id: c.wa_id });
        } else {
          resultado.set(c.input, { valido: false, motivo: c.status || 'invalid' });
        }
      });

      // Qualquer número não retornado é marcado como inválido
      chunk.forEach((n) => {
        if (!retornados.has(n)) {
          resultado.set(n, { valido: false, motivo: 'não verificado' });
        }
      });
    } catch (erro: any) {
      const motivo = erro?.response?.data?.error?.message || erro.message || 'erro de validação';
      const indisponivel = /unsupported post request/i.test(motivo) || /does not exist/i.test(motivo);
      if (indisponivel) {
        disponivel = false;
      }
      chunk.forEach((n) => resultado.set(n, { valido: indisponivel ? null : false, motivo }));
    }
  }

  return { resultado, disponivel };
}

async function lerStatus(): Promise<BulkStatus> {
  try {
    const data = await fs.readFile(statusFile, 'utf-8');
    return JSON.parse(data);
  } catch {
    return defaultStatus;
  }
}

async function salvarStatus(status: BulkStatus): Promise<void> {
  await fs.writeFile(statusFile, JSON.stringify(status, null, 2));
}

async function salvarFila(payload: { contatos: any[]; index: number }): Promise<void> {
  await fs.writeFile(queueFile, JSON.stringify(payload, null, 2));
}

async function lerFila(): Promise<{ contatos: any[]; index: number } | null> {
  try {
    const data = await fs.readFile(queueFile, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

async function salvarStop(flag: boolean): Promise<void> {
  await fs.writeFile(stopFile, JSON.stringify({ stop: flag, at: Date.now() }));
}

async function deveParar(): Promise<boolean> {
  try {
    const data = await fs.readFile(stopFile, 'utf-8');
    const parsed = JSON.parse(data);
    return Boolean(parsed?.stop);
  } catch {
    return false;
  }
}

/**
 * Bulk Messaging
 * POST /api/bulk/upload - Upload do CSV
 * POST /api/bulk/start - Iniciar envio
 * GET /api/bulk/status - Obter status
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // GET - Status do envio
  if (req.method === 'GET') {
    console.log('\n' + '='.repeat(50));
    console.log('📊 GET /api/bulk/status');
    
    const status = await lerStatus();
    console.log(`  Ativo: ${status.ativo ? '✅ Sim' : '❌ Não'}`);
    
    if (status.ativo) {
      console.log(`  Progresso: ${status.enviados}/${status.total}`);
      console.log(`  Lote: ${status.loteAtual}/${status.totalLotes}`);
      console.log(`  Erros: ${status.erros}`);
    }
    
    console.log('='.repeat(50) + '\n');
    res.json(status);
    return;
  }

  // POST - Upload ou Start
  if (req.method === 'POST') {
    console.log('\n' + '='.repeat(50));
    console.log('📤 POST /api/bulk');
    
    const { action, template, language, mission, csvPath, marketing, productPolicy, messageActivitySharing } = req.body as {
      action?: string;
      template?: string;
      language?: string;
      mission?: string;
      csvPath?: string;
      marketing?: boolean;
      productPolicy?: 'CLOUD_API_FALLBACK' | 'STRICT';
      messageActivitySharing?: boolean;
    };

    console.log(`  Ação: ${action || 'vazio'}`);

    if (action === 'upload') {
      console.log('  📁 Upload de CSV');
      const { csv } = req.body as { csv?: string };
      
      if (!csv) {
        console.log('  ❌ CSV não fornecido');
        console.log('='.repeat(50) + '\n');
        res.status(400).json({ erro: 'CSV não fornecido' });
        return;
      }

      try {
        const dados = parseCsv(csv);
        console.log(`  Registros válidos: ${dados.length}`);
        
        if (dados.length === 0) {
          console.log('  ❌ CSV vazio ou inválido');
          console.log('='.repeat(50) + '\n');
          res.status(400).json({ erro: 'CSV vazio ou inválido' });
          return;
        }
        const numeros = Array.from(new Set(dados.map((d) => normalizarNumero(d.numero || d.telefone || '')).filter(Boolean)));
        console.log(`  🔎 Validando ${numeros.length} números no WhatsApp...`);

        const { resultado: validacao, disponivel } = await validarNumerosWhatsApp(numeros);
        const contatos = dados.map((d) => {
          const numero = normalizarNumero(d.numero || d.telefone || '');
          const info = validacao.get(numero);
          return {
            ...d,
            numero,
            valido: info?.valido ?? null,
            wa_id: info?.wa_id,
            motivo: info?.motivo,
          };
        }).filter(c => c.numero);

        const validos = contatos.filter(c => c.valido === true).length;
        const invalidos = contatos.filter(c => c.valido === false).length;
        const naoVerificados = contatos.filter(c => c.valido === null).length;
        console.log(`  ✅ Válidos: ${validos} | ❌ Inválidos: ${invalidos} | ⚠️ Não verificados: ${naoVerificados}`);
        console.log('='.repeat(50) + '\n');

        res.json({
          ok: true,
          total: contatos.length,
          validos,
          invalidos,
          naoVerificados,
          validacaoDisponivel: disponivel,
          contatos,
          preview: contatos.slice(0, 3),
        });
      } catch (erro: any) {
        console.log(`  ❌ ERRO: ${erro.message}`);
        console.log('='.repeat(50) + '\n');
        res.status(500).json({ erro: erro.message });
      }
      return;
    }

    if (action === 'start') {
      console.log('  🚀 Iniciando envio em massa');
      
      if (!template) {
        console.log('  ❌ Template não especificado');
        console.log('='.repeat(50) + '\n');
        res.status(400).json({ erro: 'Template não especificado' });
        return;
      }

      const { contatos, csv } = req.body as { contatos?: any[]; csv?: string };
      let contatosEntrada = contatos;
      if ((!contatosEntrada || contatosEntrada.length === 0) && csv) {
        contatosEntrada = parseCsv(csv);
      }
      if (!contatosEntrada || contatosEntrada.length === 0) {
        console.log('  ❌ Contatos não fornecidos');
        console.log('='.repeat(50) + '\n');
        res.status(400).json({ erro: 'Contatos não fornecidos' });
        return;
      }

      const status = await lerStatus();
      if (status.ativo) {
        console.log('  ⚠️  Envio já em andamento');
        console.log('='.repeat(50) + '\n');
        res.status(400).json({ erro: 'Envio já em andamento' });
        return;
      }

      try {
        console.log(`  📋 Template: ${template}`);
        console.log(`  🌍 Idioma: ${language || 'pt_BR'}`);
        console.log(`  📞 Total de contatos: ${contatosEntrada.length}`);
        
        // Converter contatos para formato correto
        const contatosFormatados = contatosEntrada.reduce((acc: any[], c: any) => {
          const numero = normalizarNumero(c.numero || c.telefone || '');
          if (!numero) return acc;
          if (c?.valido === false) return acc;

          const base = {
            numero,
            mensagem: c.mensagem || '',
            link: c.link || '',
            status: 'pendente',
              marketing: Boolean(marketing),
            productPolicy,
            messageActivitySharing,
          } as any;
          if (template) {
            base.template = template;
            base.language = language || 'pt_BR';
          }
          acc.push(base);
          return acc;
        }, []);

        await salvarStop(false);

        await salvarStop(false);

        // Atualizar status como ativo
        const novoStatus: BulkStatus = {
          ativo: true,
          total: contatosFormatados.length,
          enviados: 0,
          erros: 0,
          loteAtual: 0,
          totalLotes: contatosFormatados.length > 0 ? Math.ceil(contatosFormatados.length / config.bulk.batchSize) : 0,
          template,
          language: language || 'pt_BR',
          timestamp: Date.now(),
          lastErrors: [],
          interrompido: false,
          mensagem: '',
          lastRequests: [],
        };
        
        await salvarStatus(novoStatus);
        await salvarFila({ contatos: contatosFormatados, index: 0 });

        res.json({ ok: true, mensagem: 'Envio iniciado', total: contatosFormatados.length });
      } catch (erro: any) {
        res.status(500).json({ erro: erro.message });
      }
      return;
    }

    if (action === 'process') {
      const status = await lerStatus();
      if (!status.ativo) {
        res.json(status);
        return;
      }

      if (await deveParar()) {
        status.ativo = false;
        status.interrompido = true;
        status.mensagem = 'Envio interrompido pelo usuário';
        status.timestamp = Date.now();
        await salvarStatus(status);
        res.json(status);
        return;
      }

      const fila = await lerFila();
      if (!fila || !Array.isArray(fila.contatos)) {
        status.ativo = false;
        status.mensagem = 'Fila não encontrada';
        status.timestamp = Date.now();
        await salvarStatus(status);
        res.json(status);
        return;
      }

      const inicio = fila.index || 0;
      const batchSize = config.bulk.batchSize;
      const lote = fila.contatos.slice(inicio, inicio + batchSize);
      if (lote.length === 0) {
        status.ativo = false;
        status.mensagem = 'Envio concluído';
        status.timestamp = Date.now();
        await salvarStatus(status);
        res.json(status);
        return;
      }

      status.loteAtual = Math.floor(inicio / batchSize) + 1;
      status.timestamp = Date.now();
      await salvarStatus(status);

      const envio = new EnvioMassa({
        onProgress: async ({ contato }) => {
          if (contato.status === 'enviado') {
            status.enviados += 1;
          } else if (contato.status === 'erro') {
            status.erros += 1;
            if (contato.erro) {
              status.lastErrors = [
                { numero: contato.numero, erro: contato.erro, at: Date.now() },
                ...(status.lastErrors || []),
              ].slice(0, 10);
            }
          }
          status.timestamp = Date.now();
          await salvarStatus(status);
        },
        onRequest: async ({ url, payload }) => {
          const item = { url, payload, at: Date.now() };
          status.lastRequests = [item, ...(status.lastRequests || [])].slice(0, 10);
          status.timestamp = Date.now();
          await salvarStatus(status);
        },
        shouldStop: async () => {
          const stop = await deveParar();
          if (stop) {
            status.ativo = false;
            status.interrompido = true;
            status.mensagem = 'Envio interrompido pelo usuário';
            await salvarStatus(status);
          }
          return stop;
        },
      });

      try {
        await envio.executar(lote);
        fila.index = inicio + lote.length;
        await salvarFila(fila);
        if (fila.index >= fila.contatos.length) {
          status.ativo = false;
          status.mensagem = 'Envio concluído';
        }
        status.timestamp = Date.now();
        await salvarStatus(status);
        res.json(status);
      } catch (err: any) {
        status.ativo = false;
        status.mensagem = err?.message || 'Erro no envio';
        status.timestamp = Date.now();
        await salvarStatus(status);
        res.status(500).json({ erro: status.mensagem });
      }
      return;
    }

    if (action === 'stop') {
      console.log('  🛑 Solicitando parada do envio');
      await salvarStop(true);
      const status = await lerStatus();
      status.ativo = false;
      status.interrompido = true;
      status.mensagem = 'Envio interrompido pelo usuário';
      status.timestamp = Date.now();
      await salvarStatus(status);
      res.json({ ok: true, mensagem: 'Envio interrompido' });
      return;
    }

    res.status(400).json({ erro: 'Action não especificada' });
    return;
  }

  res.status(405).json({ erro: 'Método não permitido' });
}
