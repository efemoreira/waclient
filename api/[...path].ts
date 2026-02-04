import { VercelRequest, VercelResponse } from '@vercel/node';
import { readFileSync, existsSync } from 'fs';
import path from 'path';

const mimeTypes: { [key: string]: string } = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};

/**
 * Catch-all handler para arquivos estáticos
 */
export default function handler(req: VercelRequest, res: VercelResponse) {
  try {
    let pathname = req.url || '/';
    pathname = pathname.split('?')[0]; // Remove query string

    // Tentar carregar arquivo estático
    const filePath = path.join(process.cwd(), 'public', pathname === '/' ? 'index.html' : pathname);
    
    // Segurança: verificar que está dentro de public/
    if (!filePath.includes('public')) {
      servindoIndex(res);
      return;
    }

    // Se for um arquivo que existe
    if (existsSync(filePath)) {
      const content = readFileSync(filePath, 'utf-8');
      const ext = path.extname(filePath);
      const mimeType = mimeTypes[ext] || 'text/plain';

      res.setHeader('Content-Type', mimeType);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.status(200).send(content);
      return;
    }

    // Se for arquivo .html que não existe, redirecionar para index (SPA)
    if (pathname !== '/' && !pathname.includes('.')) {
      servindoIndex(res);
      return;
    }

    // Se for rota de API, deixar passar
    if (pathname.startsWith('/api/')) {
      res.status(404).json({ erro: 'API não encontrada' });
      return;
    }

    // Fallback: servir index.html
    servindoIndex(res);
  } catch (error) {
    console.error('Erro ao servir arquivo:', error);
    servindoIndex(res);
  }
}

function servindoIndex(res: VercelResponse) {
  try {
    const indexPath = path.join(process.cwd(), 'public', 'index.html');
    const content = readFileSync(indexPath, 'utf-8');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.status(200).send(content);
  } catch {
    res.status(404).json({ 
      erro: 'index.html não encontrado',
      info: 'Verifique se os arquivos públicos foram copiados para dist/public/'
    });
  }
}
