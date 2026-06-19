/**
 * MotorTrack 2.0 — Módulo QR Scanner (expandido)
 *
 * Responsabilidades:
 *  - Abrir/fechar o modal de leitura QR
 *  - Acessar a câmera do dispositivo
 *  - Processar frames com jsQR
 *  - Reconhecer QR de MOTOR e QR de PEÇA
 *  - Exibir resultado e oferecer ações contextuais
 */

const QRScanner = (() => {
  let _stream    = null;
  let _animFrame = null;
  let _motorId   = null;

  // Modo: 'motor' (padrão) ou 'peca' (para adicionar ao orçamento)
  let _modo       = 'motor';
  let _orcamentoId = null;

  /* ── Abrir / Fechar ── */

  function abrir(modo, orcamentoId) {
    _modo        = modo || 'motor';
    _orcamentoId = orcamentoId || null;
    _motorId     = null;
    _resetarUI();
    document.getElementById('modal-scanner-qr')?.classList.add('open');

    // Atualiza texto de instrução conforme modo
    const statusEl = document.getElementById('qr-status');
    if (statusEl) {
      statusEl.textContent = (_modo === 'peca' || _modo === 'peca_reparo')
        ? 'Aponte para o QR code da peça...'
        : 'Aponte para o QR code do motor...';
    }

    _iniciarCamera();
  }

  function fechar() {
    _pararCamera();
    document.getElementById('modal-scanner-qr')?.classList.remove('open');
    _motorId     = null;
    _orcamentoId = null;
    _resetarUI();
  }

  function reiniciar() {
    _motorId = null;
    _resetarUI();
    _iniciarCamera();
  }

  /* ── Camera ── */

  async function _iniciarCamera() {
    const statusEl = document.getElementById('qr-status');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width:  { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      _stream = stream;

      const video = document.getElementById('qr-video');
      video.srcObject = stream;
      await video.play();

      if (statusEl) {
        statusEl.textContent = (_modo === 'peca' || _modo === 'peca_reparo')
          ? 'Aponte para o QR code da peça...'
          : 'Aponte para o QR code do motor...';
      }
      _tick();
    } catch (e) {
      if (statusEl) statusEl.textContent = `⚠ Sem acesso à câmera: ${e.message}`;
    }
  }

  function _pararCamera() {
    if (_animFrame) { cancelAnimationFrame(_animFrame); _animFrame = null; }
    if (_stream)    { _stream.getTracks().forEach(t => t.stop()); _stream = null; }
  }

  /* ── Loop de Leitura ── */

  function _tick() {
    const video  = document.getElementById('qr-video');
    const canvas = document.getElementById('qr-canvas');
    if (!video || !canvas) return;

    if (video.readyState < 2) {
      _animFrame = requestAnimationFrame(_tick);
      return;
    }

    canvas.width  = video.videoWidth  || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    let code = null;
    try {
      if (typeof jsQR === 'function') {
        code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert',
        });
      }
    } catch (_) { /* jsQR falhou — ignora */ }

    if (code?.data) {
      _processar(code.data);
      return;
    }
    _animFrame = requestAnimationFrame(_tick);
  }

  /* ── Processamento do QR ── */

  async function _processar(texto) {
    _pararCamera();

    _setDisplay('qr-video',  'none');
    _setDisplay('qr-frame',  'none');
    _setTexto('qr-status', '✔ QR lido! Buscando...');

    // Extrai código do texto (pode ser URL ou código direto)
    let codigo = texto;
    try {
      const url = new URL(texto);
      // Suporta ?motor=XXX ou ?peca=XXX
      codigo = url.searchParams.get('peca') || url.searchParams.get('motor') || texto;
    } catch (_) { /* não é URL — usa texto diretamente */ }

    // Decide qual coleção buscar
    if (_modo === 'peca' || _modo === 'peca_reparo') {
      await _processarPeca(codigo);
    } else {
      await _processarMotor(codigo);
    }
  }

  async function _processarMotor(codigo) {
    let motor = null;
    try { motor = await Motores.buscarPorCodigo(codigo); } catch (_) {}
    if (!motor) {
      try { motor = await Motores.buscarPorId(codigo); } catch (_) {}
    }

    // Tenta como peça caso não ache motor
    if (!motor) {
      const peca = await Pecas.buscarPorCodigo(codigo).catch(() => null);
      if (peca) {
        // Era QR de peça — redireciona
        _setTexto('qr-status', '✔ Peça encontrada!');
        _renderizarResultadoPeca(peca);
        return;
      }

      _setTexto('qr-status', `⚠ Não encontrado: ${codigo}`);
      setTimeout(() => {
        _setDisplay('qr-video', 'block');
        _setDisplay('qr-frame', 'flex');
        _setTexto('qr-status', 'Aponte para o QR code...');
        _iniciarCamera();
      }, 2500);
      return;
    }

    _motorId = motor.id;
    _renderizarResultadoMotor(motor);
  }

  async function _processarPeca(codigo) {
    let peca = null;
    try { peca = await Pecas.buscarPorCodigo(codigo); } catch (_) {}
    if (!peca) {
      try { peca = await Pecas.buscarPorId(codigo); } catch (_) {}
    }

    if (!peca) {
      _setTexto('qr-status', `⚠ Peça não encontrada: ${codigo}`);
      setTimeout(() => {
        _setDisplay('qr-video', 'block');
        _setDisplay('qr-frame', 'flex');
        _setTexto('qr-status', 'Aponte para o QR code da peça...');
        _iniciarCamera();
      }, 2500);
      return;
    }

    _setTexto('qr-status', '✔ Peça encontrada!');
    _renderizarResultadoPeca(peca);
  }

  /* ── Renderização Motor ── */

  function _renderizarResultadoMotor(m) {
    const prazo    = Motores.calcularStatusPrazo(m.prazoRetorno);
    const etapa    = Motores.ETAPAS_MANUTENCAO.find(s => s.id === m.etapaAtual);
    const motorTag = m.tag ? `${m.tag} — ${m.modelo}` : m.modelo;
    const statusCl = { ok: 'status-ok', alerta: 'status-alerta', atrasado: 'status-atrasado' }[prazo.tipo];

    const historico  = m.historico ?? [];
    const ultimaObs  = historico.length ? [...historico].reverse()[0] : null;
    const ultimaData = ultimaObs?.dataHora?.toDate
      ? ultimaObs.dataHora.toDate().toLocaleString('pt-BR', {
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit',
        })
      : '—';

    const ultimaHTML = ultimaObs
      ? `<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);">
           <div style="font-size:10px;color:var(--text2);font-family:var(--mono);letter-spacing:1px;margin-bottom:4px;">ÚLTIMA MOVIMENTAÇÃO</div>
           <div style="font-size:12px;">${ultimaData} — <strong>${ultimaObs.responsavel ?? '—'}</strong></div>
           ${ultimaObs.obs ? `<div style="font-size:11px;color:var(--text2);margin-top:3px;">${ultimaObs.obs}</div>` : ''}
         </div>`
      : '';

    document.getElementById('qr-resultado-body').innerHTML = `
      <div style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);padding:16px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
          <div>
            <div style="font-family:var(--mono);font-size:13px;color:var(--accent);font-weight:600;">${m.codigo}</div>
            <div style="font-size:15px;font-weight:700;color:var(--text);margin-top:2px;">${motorTag}</div>
          </div>
          <span class="setor-badge setor-${m.etapaAtual}" style="font-size:11px;">
            ${etapa?.label ?? m.etapaAtual}
          </span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;font-size:12px;">
          <div><span style="color:var(--text2);">Potência</span><br><strong>${m.potencia || '—'}</strong></div>
          <div><span style="color:var(--text2);">Prioridade</span><br><strong>${Motores.labelPrioridade(m.prioridade)}</strong></div>
          <div><span style="color:var(--text2);">Prazo de retorno</span><br><strong>${m.prazoRetorno || '—'}</strong></div>
          <div><span style="color:var(--text2);">Status prazo</span><br>
            <span class="status-dot ${statusCl}" style="font-size:11px;">${prazo.label}</span>
          </div>
        </div>
        ${ultimaHTML}
      </div>`;

    _setDisplay('qr-scanner-area', 'none');
    _setDisplay('qr-resultado',    'block');

    // Remove botão adicionar ao orçamento se existir
    const btnAdd = document.getElementById('btn-qr-add-orcamento');
    if (btnAdd) btnAdd.style.display = 'none';

    const btnVer = document.getElementById('btn-qr-ver-detalhe');
    if (btnVer) {
      btnVer.textContent = 'Ver Detalhe Completo →';
      btnVer.style.display = 'inline-flex';
      btnVer.onclick = () => {
        const id = _motorId;
        fechar();
        if (id) App.abrirDetalhe(id);
      };
    }
  }

  /* ── Renderização Peça ── */

  function _renderizarResultadoPeca(p) {
    const semEstoque = p.estoque === 0;
    const estoqueMin = p.estoqueMin > 0 && p.estoque <= p.estoqueMin;

    document.getElementById('qr-resultado-body').innerHTML = `
      <div style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);padding:16px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
          <div>
            <div style="font-family:var(--mono);font-size:13px;color:var(--accent);font-weight:600;">${p.codigoPeca}</div>
            <div style="font-size:15px;font-weight:700;color:var(--text);margin-top:2px;">${p.nome}</div>
          </div>
          <span class="setor-badge" style="border-color:var(--border);color:var(--text2);font-size:11px;">${p.categoria || '—'}</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;font-size:12px;">
          <div><span style="color:var(--text2);">Fabricante</span><br><strong>${p.fabricante || '—'}</strong></div>
          <div><span style="color:var(--text2);">Valor Unitário</span><br><strong style="font-family:var(--mono);">${Pecas.formatarMoeda(p.valor)}</strong></div>
          <div><span style="color:var(--text2);">Estoque</span><br>
            <strong style="color:${semEstoque ? 'var(--red)' : estoqueMin ? 'var(--yellow,#f0a500)' : 'inherit'};">
              ${p.estoque ?? 0} un.
              ${semEstoque ? '⚠ SEM ESTOQUE' : estoqueMin ? '⚠ BAIXO' : ''}
            </strong>
          </div>
          <div><span style="color:var(--text2);">Localização</span><br><strong>${p.localizacao || '—'}</strong></div>
        </div>
        ${p.descricao ? `<div style="margin-top:10px;font-size:11px;color:var(--text2);">${p.descricao}</div>` : ''}
      </div>`;

    _setDisplay('qr-scanner-area', 'none');
    _setDisplay('qr-resultado',    'block');

    // Botão "Ver Detalhe"
    const btnVer = document.getElementById('btn-qr-ver-detalhe');
    if (btnVer) {
      btnVer.textContent = 'Ver Ficha da Peça →';
      btnVer.style.display = 'inline-flex';
      btnVer.onclick = () => {
        fechar();
        App.abrirDetalhe_Peca(p.id);
      };
    }

    // Botão "Adicionar ao Orçamento" (orçamento já aberto via tela de orçamento)
    let btnAdd = document.getElementById('btn-qr-add-orcamento');
    if (!btnAdd) {
      btnAdd = document.createElement('button');
      btnAdd.id = 'btn-qr-add-orcamento';
      btnAdd.className = 'btn-success';
      const actionsEl = document.querySelector('#qr-resultado .form-actions');
      if (actionsEl) actionsEl.insertBefore(btnAdd, actionsEl.firstChild);
    }

    if (_modo === 'peca_reparo' && !semEstoque) {
      // Adiciona direto como tag no formulário de reparo (sem precisar de orçamento já existente)
      btnAdd.textContent = '+ Adicionar como Peça Utilizada';
      btnAdd.style.display = 'inline-flex';
      btnAdd.onclick = () => {
        App._adicionarPecaViaScanner(p);
        Toast.sucesso(`${p.nome} adicionada à lista de peças.`, 'Peça adicionada');
        fechar();
      };
    } else if (_orcamentoId && !semEstoque) {
      btnAdd.textContent = '+ Adicionar ao Orçamento';
      btnAdd.style.display = 'inline-flex';
      btnAdd.onclick = () => _confirmarAdicionarPeca(p, _orcamentoId);
    } else {
      btnAdd.style.display = 'none';
    }
  }

  function _confirmarAdicionarPeca(peca, orcId) {
    const qtdStr = prompt(`Adicionar "${peca.nome}" ao orçamento.\n\nQuantidade (disponível: ${peca.estoque}):`, '1');
    if (qtdStr === null) return;
    const qtd = parseInt(qtdStr, 10);
    if (!qtd || qtd <= 0) { alert('Quantidade inválida.'); return; }
    if (qtd > peca.estoque) { alert(`Estoque insuficiente. Disponível: ${peca.estoque}`); return; }

    Orcamento.adicionarPeca(orcId, peca, qtd)
      .then(() => {
        Toast.sucesso(`${qtd}x ${peca.nome} adicionada ao orçamento.`, 'Peça adicionada');
        fechar();
        App.atualizarOrcamento();
      })
      .catch(e => Toast.erro(`Erro: ${e.message}`));
  }

  /* ── UI Helpers ── */

  function _resetarUI() {
    _setDisplay('qr-scanner-area', 'block');
    _setDisplay('qr-video',        'block');
    _setDisplay('qr-frame',        'flex');
    _setDisplay('qr-resultado',    'none');
    _setTexto('qr-status', 'Iniciando câmera...');
    const btnAdd = document.getElementById('btn-qr-add-orcamento');
    if (btnAdd) btnAdd.style.display = 'none';
  }

  function _setDisplay(id, valor) {
    const el = document.getElementById(id);
    if (el) el.style.display = valor;
  }

  function _setTexto(id, valor) {
    const el = document.getElementById(id);
    if (el) el.textContent = valor;
  }

  /* ── API Pública ── */
  return { abrir, fechar, reiniciar };
})();
