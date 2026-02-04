import { VercelRequest, VercelResponse } from '@vercel/node';
import path from 'path';

/**
 * Servir frontend estático
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Servir index.html
  if (req.url === '/' || req.url === '') {
    const filePath = path.join(process.cwd(), 'public/index.html');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    
    try {
      const fs = await import('fs/promises');
      const content = await fs.readFile(filePath, 'utf-8');
      res.status(200).send(content);
    } catch (e) {
      res.status(404).json({ erro: 'index.html não encontrado' });
    }
    return;
  }

  res.status(404).json({ erro: 'Não encontrado' });
}
