import { VercelRequest, VercelResponse } from '@vercel/node';
import { EnvioMassa } from '../src/bulk/envio-massa';
import { config, validateConfig } from '../src/config';
import { promises as fs } from 'fs';

if (!validateConfig()) {
  console.error('❌ Configuração inválida');
}

// Store status em arquivo (Vercel tmp)
const statusFile = '/tmp/bulk-status.json';

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
};

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
    const status = await lerStatus();
    res.json(status);
    return;
  }

  // POST - Upload ou Start
  if (req.method === 'POST') {
    const { action, template, language, mission, csvPath } = req.body as {
      action?: string;
      template?: string;
      language?: string;
      mission?: string;
      csvPath?: string;
    };

    if (action === 'upload') {
      const { csv } = req.body as { csv?: string };
      
      if (!csv) {
        res.status(400).json({ erro: 'CSV não fornecido' });
        return;
      }

      try {
        const linhas = csv.split('\n').filter(l => l.trim());
        if (linhas.length < 2) {
          res.status(400).json({ erro: 'CSV vazio ou inválido' });
          return;
        }

        const headers = linhas[0].split(',').map(h => h.trim().toLowerCase());
        const dados = linhas.slice(1).map(linha => {
          const valores = linha.split(',');
          const obj: any = {};
          headers.forEach((h, i) => {
            obj[h] = valores[i]?.trim() || '';
          });
          return obj;
        }).filter(obj => obj.telefone);

        res.json({
          ok: true,
          total: dados.length,
          preview: dados.slice(0, 3),
        });
      } catch (erro: any) {
        res.status(500).json({ erro: erro.message });
      }
      return;
    }

    if (action === 'start') {
      if (!template) {
        res.status(400).json({ erro: 'Template não especificado' });
        return;
      }

      const { contatos } = req.body as { contatos?: any[] };
      if (!contatos || contatos.length === 0) {
        res.status(400).json({ erro: 'Contatos não fornecidos' });
        return;
      }

      const status = await lerStatus();
      if (status.ativo) {
        res.status(400).json({ erro: 'Envio já em andamento' });
        return;
      }

      try {
        // Converter contatos para formato correto
        const contatosFormatados = contatos.map((c: any) => ({
          numero: c.numero || c.telefone || '',
          mensagem: c.mensagem || '',
          link: c.link || '',
          status: 'pendente',
        }));

        // Atualizar status como ativo
        const novoStatus: BulkStatus = {
          ativo: true,
          total: contatosFormatados.length,
          enviados: 0,
          erros: 0,
          loteAtual: 0,
          totalLotes: 0,
          template,
          language: language || 'pt_BR',
          timestamp: Date.now(),
        };
        
        await salvarStatus(novoStatus);

        // Iniciar envio em background (fire and forget)
        const envio = new EnvioMassa();
        envio.executar(contatosFormatados).then(async () => {
          novoStatus.ativo = false;
          await salvarStatus(novoStatus);
          console.log('✅ Envio concluído');
        }).catch(async (err) => {
          console.error('❌ Erro no envio:', err);
          novoStatus.ativo = false;
          await salvarStatus(novoStatus);
        });

        res.json({ ok: true, mensagem: 'Envio iniciado', total: contatosFormatados.length });
      } catch (erro: any) {
        res.status(500).json({ erro: erro.message });
      }
      return;
    }

    res.status(400).json({ erro: 'Action não especificada' });
    return;
  }

  res.status(405).json({ erro: 'Método não permitido' });
}
