/**
 * Gerenciador de Envio em Massa (Frontend)
 */

const bulkState = {
  csvFile: null,
  template: 'hello_world',
  language: 'pt_BR',
  mission: 'Missão',
  enviando: false,
};

// Elementos
const csvFileInput = document.getElementById('csvFile');
const templateSelect = document.getElementById('templateSelect');
const customTemplate = document.getElementById('customTemplate');
const languageSelect = document.getElementById('languageSelect');
const missionInput = document.getElementById('missionName');
const startBulkBtn = document.getElementById('startBulkBtn');
const bulkStatus = document.getElementById('bulkStatus');

// Event Listeners
if (csvFileInput) {
  csvFileInput.addEventListener('change', (e) => {
    bulkState.csvFile = e.target.files?.[0];
  });
}

if (templateSelect) {
  templateSelect.addEventListener('change', (e) => {
    if (e.target.value === 'custom') {
      customTemplate.style.display = 'block';
      customTemplate.required = true;
    } else {
      customTemplate.style.display = 'none';
      customTemplate.required = false;
      bulkState.template = e.target.value;
    }
  });
}

if (customTemplate) {
  customTemplate.addEventListener('change', (e) => {
    bulkState.template = e.target.value;
  });
}

if (languageSelect) {
  languageSelect.addEventListener('change', (e) => {
    bulkState.language = e.target.value;
  });
}

if (missionInput) {
  missionInput.addEventListener('change', (e) => {
    bulkState.mission = e.target.value;
  });
}

if (startBulkBtn) {
  startBulkBtn.addEventListener('click', iniciarEnvio);
}

/**
 * Iniciar envio em massa
 */
async function iniciarEnvio() {
  if (!bulkState.csvFile) {
    alert('❌ Selecione um arquivo CSV');
    return;
  }

  if (!bulkState.template) {
    alert('❌ Selecione um template');
    return;
  }

  startBulkBtn.disabled = true;
  startBulkBtn.textContent = '⏳ Enviando...';

  try {
    // 1. Upload do CSV
    const formData = new FormData();
    formData.append('file', bulkState.csvFile);

    console.log('📤 Enviando arquivo...');
    const uploadRes = await fetch('/api/bulk/upload', {
      method: 'POST',
      body: formData,
    });

    if (!uploadRes.ok) {
      const err = await uploadRes.json();
      throw new Error(err.erro || 'Erro ao enviar arquivo');
    }

    const uploadData = await uploadRes.json();
    console.log(`✅ ${uploadData.total} contatos encontrados`);

    // 2. Iniciar envio
    const startRes = await fetch('/api/bulk/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        template: bulkState.template,
        language: bulkState.language,
        mission: bulkState.mission,
      }),
    });

    if (!startRes.ok) {
      const err = await startRes.json();
      throw new Error(err.erro || 'Erro ao iniciar envio');
    }

    bulkState.enviando = true;
    if (bulkStatus) bulkStatus.classList.remove('hidden');

    // 3. Monitorar status
    monitorarEnvio();
  } catch (erro) {
    console.error('❌ Erro:', erro);
    alert(`Erro: ${erro.message}`);
    startBulkBtn.disabled = false;
    startBulkBtn.textContent = '🚀 Iniciar Envio';
  }
}

/**
 * Monitorar status do envio
 */
async function monitorarEnvio() {
  const interval = setInterval(async () => {
    try {
      const res = await fetch('/api/bulk/status');
      const status = await res.json();

      // Atualizar UI
      if (document.getElementById('statusTotal')) {
        document.getElementById('statusTotal').textContent = status.total;
        document.getElementById('statusSucesso').textContent = status.enviados;
        document.getElementById('statusErros').textContent = status.erros;

        const taxa =
          status.total > 0
            ? ((status.enviados / status.total) * 100).toFixed(2)
            : '0';
        document.getElementById('statusTaxa').textContent = `${taxa}%`;

        const progress = (status.enviados / (status.total || 1)) * 100;
        if (document.getElementById('progressFill')) {
          document.getElementById('progressFill').style.width = `${progress}%`;
        }

        const lote =
          status.loteAtual > 0
            ? ` - Lote ${status.loteAtual}/${status.totalLotes}`
            : '';
        if (document.getElementById('statusText')) {
          document.getElementById('statusText').textContent = `Enviando...${lote}`;
        }
      }

      // Se terminou
      if (!status.ativo && bulkState.enviando) {
        clearInterval(interval);
        bulkState.enviando = false;
        startBulkBtn.disabled = false;
        startBulkBtn.textContent = '🚀 Iniciar Envio';

        if (document.getElementById('statusText')) {
          document.getElementById('statusText').textContent = '✅ Envio concluído!';
        }
      }
    } catch (erro) {
      console.error('Erro ao monitorar:', erro);
      clearInterval(interval);
    }
  }, 1000); // Atualizar a cada 1 segundo
}

console.log('📨 Módulo de Bulk Messaging carregado');
