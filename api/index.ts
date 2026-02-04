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
    const url = req.url || '/';
    let filePath: string;

    // Mapear URLs para arquivos
    if (url === '/' || url === '') {
      filePath = 'public/index.html';
    } else if (url === '/styles.css') {
      filePath = 'public/styles.css';
    } else if (url === '/app.js') {
      filePath = 'public/app.js';
    } else if (url === '/bulk-messaging.js') {
      filePath = 'public/bulk-messaging.js';
    } else if (url === '/bulk-messaging.html') {
      filePath = 'public/bulk-messaging.html';
    } else if (url === '/config.html') {
      filePath = 'public/config.html';
    } else {
      // Fallback para index.html
      filePath = 'public/index.html';
    }

    // Ler arquivo
    const fullPath = path.join(process.cwd(), filePath);
    const content = await fs.readFile(fullPath, 'utf-8');

    // Determinar MIME type
    const ext = path.extname(filePath);
    const mimeType = mimeTypes[ext] || 'text/plain';

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.status(200).send(content);
  } catch (e) {
    res.status(404).json({ erro: 'Arquivo não encontrado' });
  }
}

