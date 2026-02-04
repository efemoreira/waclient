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
    
    const { action, template, language, mission, csvPath } = req.body as {
      action?: string;
      template?: string;
      language?: string;
      mission?: string;
      csvPath?: string;
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
        const linhas = csv.split('\n').filter(l => l.trim());
        console.log(`  Linhas do CSV: ${linhas.length}`);
        
        if (linhas.length < 2) {
          console.log('  ❌ CSV vazio ou inválido');
          console.log('='.repeat(50) + '\n');
          res.status(400).json({ erro: 'CSV vazio ou inválido' });
          return;
        }

        const headers = linhas[0].split(',').map(h => h.trim().toLowerCase());
        console.log(`  Colunas: ${headers.join(', ')}`);
        
        const dados = linhas.slice(1).map(linha => {
          const valores = linha.split(',');
          const obj: any = {};
          headers.forEach((h, i) => {
            obj[h] = valores[i]?.trim() || '';
          });
          return obj;
        }).filter(obj => obj.telefone);

        console.log(`  ✅ Registros válidos: ${dados.length}`);
        console.log('='.repeat(50) + '\n');
        
        res.json({
          ok: true,
          total: dados.length,
          preview: dados.slice(0, 3),
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

      const { contatos } = req.body as { contatos?: any[] };
      if (!contatos || contatos.length === 0) {
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
        console.log(`  📞 Total de contatos: ${contatos.length}`);
        
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
