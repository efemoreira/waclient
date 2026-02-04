import { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import { config, validateConfig } from '../src/config';

function mapGraphError(err: any, idType: 'phoneNumber' | 'businessAccount') {
  const raw = err?.response?.data?.error?.message || err?.message || 'Erro desconhecido';
  const lower = String(raw).toLowerCase();
  
  // Extrair o ID da mensagem e remover a barra
  const idMatch = raw.match(/\/(\d+)/);
  const extractedId = idMatch ? idMatch[1] : '';

  if (lower.includes('unknown path components')) {
    return {
      message: `ID inválido para ${idType === 'phoneNumber' ? 'Phone Number ID' : 'WhatsApp Business Account ID'}: ${extractedId}`,
      hint: 'Verifique se você copiou o ID correto no Business Manager (WABA/Phone Number ID). Não copie da URL, copie direto do Business Manager.',
      raw,
    };
  }

  if (lower.includes('unsupported get request')) {
    return {
      message: `ID inválido ou sem permissão para ${idType === 'phoneNumber' ? 'Phone Number ID' : 'Business Account ID'}.`,
      hint: 'Confirme se o token pertence ao mesmo Business e tem as permissões corretas.',
      raw,
    };
  }

  if (lower.includes('invalid oauth access token') || lower.includes('oauth')) {
    return {
      message: 'Token inválido ou expirado.',
      hint: 'Gere um novo token com as permissões whatsapp_business_management e whatsapp_business_messaging.',
      raw,
    };
  }

  return {
    message: 'Erro ao validar na Graph API.',
    hint: 'Verifique token, permissões e IDs informados.',
    raw,
  };
}

// Capture logs globally
const logs: string[] = [];
const originalLog = console.log;
const originalError = console.error;

function addLog(level: string, ...args: any[]) {
  const message = args.map(arg => 
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
  ).join(' ');
  logs.push(`[${new Date().toISOString()}] ${level}: ${message}`);
  // Also output to actual console
  if (level === 'ERROR') {
    originalError(...args);
  } else {
    originalLog(...args);
  }
}

console.log = (...args: any[]) => addLog('LOG', ...args);
console.error = (...args: any[]) => addLog('ERROR', ...args);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ erro: 'Método não permitido' });
    return;
  }

  console.log('\n========== HEALTH CHECK START ==========');
  console.log('Timestamp:', new Date().toISOString());

  const basicConfigOk = validateConfig();
  console.log('Basic config valid:', basicConfigOk);

  const checks: any = {
    config: {
      ok: basicConfigOk,
      token: Boolean(config.whatsapp.token),
      numberId: Boolean(config.whatsapp.numberId),
      accountId: Boolean(config.whatsapp.accountId),
      webhookToken: Boolean(config.whatsapp.webhookToken),
      apiVersion: `v${config.whatsapp.apiVersion}`,
    },
    phoneNumber: null as any,
    businessAccount: null as any,
    webhook: {
      ok: Boolean(config.whatsapp.webhookToken),
      note: 'Não é possível validar webhook automaticamente sem App ID/assinatura.',
    },
  };

  const token = config.whatsapp.token;
  const numberId = config.whatsapp.numberId;
  const accountId = config.whatsapp.accountId;
  const apiVersion = config.whatsapp.apiVersion;

  console.log('\n--- CONFIG VALUES ---');
  console.log('Token present:', !!token);
  if (token) {
    console.log('Token length:', token.length);
    console.log('Token preview:', token.substring(0, 20) + '...');
  }
  console.log('Number ID:', numberId);
  console.log('Account ID:', accountId);
  console.log('API Version:', apiVersion);

  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

  const requests: Promise<any>[] = [];

  if (token && numberId) {
    console.log('\n--- PHONE NUMBER REQUEST ---');
    const phoneUrl = `https://graph.facebook.com/v${apiVersion}/${numberId}`;
    console.log('URL:', phoneUrl);
    console.log('Fields: display_phone_number,verified_name,code_verification_status,quality_rating,platform_type,throughput,webhook_configuration');

    requests.push(
      axios
        .get(phoneUrl, {
          headers,
          params: {
            fields: 'display_phone_number,verified_name,code_verification_status,quality_rating,platform_type,throughput,webhook_configuration',
          },
        })
        .then((resp) => {
          console.log('✅ Phone Number request successful');
          console.log('Response data:', JSON.stringify(resp.data, null, 2));

          const webhookUrl = resp.data?.webhook_configuration?.application;
          const webhookMatch = webhookUrl === 'https://waclient-puce.vercel.app/api/webhook';

          console.log('Webhook URL:', webhookUrl);
          console.log('Webhook match (expected URL):', webhookMatch);

          checks.phoneNumber = {
            ok: true,
            id: resp.data?.id,
            display_phone_number: resp.data?.display_phone_number,
            verified_name: resp.data?.verified_name,
            code_verification_status: resp.data?.code_verification_status,
            quality_rating: resp.data?.quality_rating,
            platform_type: resp.data?.platform_type,
            throughput: resp.data?.throughput,
            webhook_configuration: resp.data?.webhook_configuration,
            webhookUrl: webhookUrl,
            webhookOk: webhookMatch,
            webhookMessage: webhookMatch
              ? '✅ Webhook configurado corretamente'
              : webhookUrl
              ? '⚠️ Webhook configurado em URL diferente'
              : '❌ Webhook não configurado',
          };
        })
        .catch((err) => {
          console.log('❌ Phone Number request failed');
          console.log('Error status:', err?.response?.status);
          console.log('Error data:', JSON.stringify(err?.response?.data, null, 2));
          console.log('Error message:', err?.message);

          const mapped = mapGraphError(err, 'phoneNumber');
          checks.phoneNumber = {
            ok: false,
            erro: mapped.message,
            dica: mapped.hint,
            detalhe: mapped.raw,
          };
        })
    );
  } else {
    console.log('❌ Skipping Phone Number request: token=' + !!token + ', numberId=' + !!numberId);
    checks.phoneNumber = { ok: false, erro: 'Token ou Number ID ausente' };
  }

  if (token && accountId) {
    console.log('\n--- BUSINESS ACCOUNT REQUEST ---');
    const accountUrl = `https://graph.facebook.com/v${apiVersion}/${accountId}`;
    console.log('URL:', accountUrl);
    console.log('Fields: id,name,timezone_id,message_template_namespace');

    requests.push(
      axios
        .get(accountUrl, {
          headers,
          params: { fields: 'id,name,timezone_id,message_template_namespace' },
        })
        .then((resp) => {
          console.log('✅ Business Account request successful');
          console.log('Response data:', JSON.stringify(resp.data, null, 2));

          checks.businessAccount = {
            ok: true,
            id: resp.data?.id,
            name: resp.data?.name,
            timezone_id: resp.data?.timezone_id,
            message_template_namespace: resp.data?.message_template_namespace,
          };
        })
        .catch((err) => {
          console.log('❌ Business Account request failed');
          console.log('Error status:', err?.response?.status);
          console.log('Error data:', JSON.stringify(err?.response?.data, null, 2));
          console.log('Error message:', err?.message);

          const mapped = mapGraphError(err, 'businessAccount');
          checks.businessAccount = {
            ok: false,
            erro: mapped.message,
            dica: mapped.hint,
            detalhe: mapped.raw,
          };
        })
    );
  } else {
    console.log('❌ Skipping Business Account request: token=' + !!token + ', accountId=' + !!accountId);
    checks.businessAccount = { ok: false, erro: 'Token ou Business Account ID ausente' };
  }

  console.log('\n--- AWAITING REQUESTS ---');
  await Promise.allSettled(requests);
  console.log('✅ All requests completed');

  const ok =
    checks.config.ok &&
    checks.phoneNumber?.ok === true &&
    checks.businessAccount?.ok === true &&
    checks.webhook.ok === true;

  console.log('\n--- FINAL RESULT ---');
  console.log('Overall status (ok):', ok);
  console.log('Full response:', JSON.stringify({ ok, checks }, null, 2));
  console.log('========== HEALTH CHECK END ==========\n');

  res.json({ ok, checks, logs });
}
