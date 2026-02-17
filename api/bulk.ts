import { VercelRequest, VercelResponse } from '@vercel/node';
import { EnvioMassa } from '../src/bulk/envio-massa';
import { config, validateConfig } from '../src/config';
import { normalizarNumero } from '../src/utils/phone-normalizer';
import { parseCsv } from '../src/utils/csv-parser';
import { validarNumerosWhatsApp } from '../src/utils/whatsapp-validator';
import {
  lerStatus,
  salvarStatus,
  lerFila,
  salvarFila,
  salvarStop,
  deveParar,
  type BulkStatus,
} from '../src/utils/bulk-file-operations';

if (!validateConfig()) {
  console.error('❌ Configuração inválida');
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
          filaTotal: contatosFormatados.length,
          filaIndex: 0,
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
      status.filaTotal = fila.contatos.length;
      status.filaIndex = inicio;
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
