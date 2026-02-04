import { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import { config, validateConfig } from '../src/config';

function mapGraphError(err: any, idType: 'phoneNumber' | 'businessAccount') {
  const raw = err?.response?.data?.error?.message || err?.message || 'Erro desconhecido';
  const lower = String(raw).toLowerCase();

  if (lower.includes('unknown path components')) {
    return {
      message: `ID inválido para ${idType === 'phoneNumber' ? 'Phone Number ID' : 'WhatsApp Business Account ID'}.`,
      hint: 'Verifique se você copiou o ID correto no Business Manager (WABA/Phone Number ID).',
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

  const basicConfigOk = validateConfig();

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

  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

  const requests: Promise<any>[] = [];

  if (token && numberId) {
    requests.push(
      axios
        .get(`https://graph.facebook.com/v${apiVersion}/${numberId}`, {
          headers,
          params: { fields: 'display_phone_number,verified_name' },
        })
        .then((resp) => {
          checks.phoneNumber = {
            ok: true,
            displayPhoneNumber: resp.data?.display_phone_number,
            verifiedName: resp.data?.verified_name,
          };
        })
        .catch((err) => {
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
    checks.phoneNumber = { ok: false, erro: 'Token ou Number ID ausente' };
  }

  if (token && accountId) {
    requests.push(
      axios
        .get(`https://graph.facebook.com/v${apiVersion}/${accountId}`, {
          headers,
          params: { fields: 'name' },
        })
        .then((resp) => {
          checks.businessAccount = {
            ok: true,
            name: resp.data?.name,
          };
        })
        .catch((err) => {
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
    checks.businessAccount = { ok: false, erro: 'Token ou Business Account ID ausente' };
  }

  await Promise.allSettled(requests);

  const ok =
    checks.config.ok &&
    checks.phoneNumber?.ok === true &&
    checks.businessAccount?.ok === true &&
    checks.webhook.ok === true;

  res.json({ ok, checks });
}
