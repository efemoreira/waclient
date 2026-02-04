import { VercelRequest, VercelResponse } from '@vercel/node';
import { promises as fs } from 'fs';
import path from 'path';

const mimeTypes: { [key: string]: string } = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
};

/**
 * Servir frontend estático
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    let pathname = new URL(req.url || '/', 'http://localhost').pathname;
    
    // Remover query string
    pathname = pathname.split('?')[0];

    let filePath: string;

    // Se for requisição para arquivo estático ou pasta pública
    if (pathname.startsWith('/public/')) {
      filePath = pathname.substring(1); // Remove a barra inicial
    } else if (
      pathname.includes('.css') ||
      pathname.includes('.js') ||
      pathname.includes('.html') ||
      pathname.includes('.json')
    ) {
      // Procurar na pasta public
      filePath = path.join('public', pathname);
    } else {
      // Fallback para index.html
      filePath = 'public/index.html';
    }

    // Ler arquivo
    const fullPath = path.join(process.cwd(), filePath);
    
    // Validar que não está tentando acessar fora do diretório
    if (!fullPath.includes('public')) {
      filePath = 'public/index.html';
    }

    const content = await fs.readFile(fullPath, 'utf-8');

    // Determinar MIME type
    const ext = path.extname(filePath);
    const mimeType = mimeTypes[ext] || 'text/plain';

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.status(200).send(content);
  } catch (e) {
    // Se arquivo não encontrado, servir index.html (SPA fallback)
    try {
      const indexPath = path.join(process.cwd(), 'public/index.html');
      const content = await fs.readFile(indexPath, 'utf-8');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.status(200).send(content);
    } catch {
      res.status(404).json({ erro: 'Arquivo não encontrado' });
    }
  }
}


