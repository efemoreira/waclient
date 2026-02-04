import { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import { config, validateConfig } from '../src/config';

export default async function handler(req: VercelRequest, res: VercelResponse) {
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

  console.log('\n========== DEBUG INFO ==========');
  console.log('Timestamp:', new Date().toISOString());

  const basicConfigOk = validateConfig();
  const token = config.whatsapp.token;
  const numberId = config.whatsapp.numberId;
  const accountId = config.whatsapp.accountId;
  const apiVersion = config.whatsapp.apiVersion;

  const debug: any = {
    timestamp: new Date().toISOString(),
    config: {
      ok: basicConfigOk,
      hasToken: !!token,
      hasNumberId: !!numberId,
      hasAccountId: !!accountId,
      apiVersion,
      tokenLength: token?.length || 0,
      tokenPreview: token ? token.substring(0, 20) + '...' : 'MISSING',
      numberIdValue: numberId,
      accountIdValue: accountId,
    },
  };

  // Test Phone Number endpoint
  if (token && numberId) {
    console.log('\nTesting Phone Number endpoint...');
    try {
      const phoneUrl = `https://graph.facebook.com/v${apiVersion}/${numberId}`;
      const response = await axios.get(phoneUrl, {
        headers: { Authorization: `Bearer ${token}` },
        params: { fields: 'id,display_phone_number' },
      });

      console.log('✅ Phone Number test OK');
      debug.phoneNumberTest = {
        ok: true,
        url: phoneUrl,
        response: response.data,
      };
    } catch (err: any) {
      console.log('❌ Phone Number test FAILED');
      console.log('Error:', err?.response?.data || err?.message);
      debug.phoneNumberTest = {
        ok: false,
        url: `https://graph.facebook.com/v${apiVersion}/${numberId}`,
        status: err?.response?.status,
        error: err?.response?.data?.error,
        message: err?.message,
      };
    }
  }

  // Test Business Account endpoint
  if (token && accountId) {
    console.log('\nTesting Business Account endpoint...');
    try {
      const accountUrl = `https://graph.facebook.com/v${apiVersion}/${accountId}`;
      const response = await axios.get(accountUrl, {
        headers: { Authorization: `Bearer ${token}` },
        params: { fields: 'id,name' },
      });

      console.log('✅ Business Account test OK');
      debug.businessAccountTest = {
        ok: true,
        url: accountUrl,
        response: response.data,
      };
    } catch (err: any) {
      console.log('❌ Business Account test FAILED');
      console.log('Error:', err?.response?.data || err?.message);
      debug.businessAccountTest = {
        ok: false,
        url: `https://graph.facebook.com/v${apiVersion}/${accountId}`,
        status: err?.response?.status,
        error: err?.response?.data?.error,
        message: err?.message,
      };
    }
  }

  // Test message sending (IMPORTANT: this will consume a message quota!)
  if (token && numberId && process.env.TEST_MESSAGE_NUMBER) {
    console.log('\nTesting message send...');
    const testNumber = process.env.TEST_MESSAGE_NUMBER;
    
    try {
      const messageUrl = `https://graph.facebook.com/v${apiVersion}/${numberId}/messages`;
      const payload = {
        messaging_product: 'whatsapp',
        to: testNumber,
        type: 'text',
        text: {
          preview_url: false,
          body: 'Test message from waclient',
        },
      };

      console.log('Sending to:', testNumber);
      console.log('URL:', messageUrl);
      console.log('Payload:', JSON.stringify(payload, null, 2));

      const response = await axios.post(messageUrl, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });

      console.log('✅ Message test OK');
      debug.messageTest = {
        ok: true,
        url: messageUrl,
        testNumber,
        response: response.data,
      };
    } catch (err: any) {
      console.log('❌ Message test FAILED');
      console.log('Status:', err?.response?.status);
      console.log('Error:', JSON.stringify(err?.response?.data, null, 2));
      debug.messageTest = {
        ok: false,
        url: `https://graph.facebook.com/v${apiVersion}/${numberId}/messages`,
        testNumber,
        status: err?.response?.status,
        error: err?.response?.data?.error,
        message: err?.message,
      };
    }
  } else if (!process.env.TEST_MESSAGE_NUMBER) {
    debug.messageTest = {
      ok: false,
      message: 'TEST_MESSAGE_NUMBER not configured',
      note: 'Set TEST_MESSAGE_NUMBER environment variable to test message sending',
    };
  }

  console.log('\n========== DEBUG RESPONSE ==========');
  console.log(JSON.stringify(debug, null, 2));
  console.log('==================================\n');

  res.json(debug);
}
