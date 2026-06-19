/**
 * MotorTrack 2.0 — Scanner QR (área pública)
 *
 * Responsabilidades:
 *  - Abrir/fechar o modal de leitura QR nas páginas públicas
 *  - Acessar a câmera do dispositivo e ler com jsQR
 *  - Extrair o código da OS do conteúdo lido (texto puro ou URL com ?motor=)
 *  - Se estiver em myequipment.html: preencher o campo de busca e buscar direto
 *  - Em qualquer outra página pública: redirecionar para myequipment.html?motor=CODIGO
 */

const QRPublic = (() => {
  let _stream    = null;
  let _animFrame = null;

  function abrir() {
    _injetarModal();
    document.getElementById('modal-scanner-qr-pub')?.classList.add('open');
    _resetarUI();
    _iniciarCamera();
  }

  function fechar() {
    _pararCamera();
    document.getElementById('modal-scanner-qr-pub')?.classList.remove('open');
  }

  function reiniciar() {
    _resetarUI();
    _iniciarCamera();
  }

  /* ── Camera ── */

  async function _iniciarCamera() {
    const statusEl = document.getElementById('qr-status-pub');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width:  { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      _stream = stream;

      const video = document.getElementById('qr-video-pub');
      video.srcObject = stream;
      await video.play();

      if (statusEl) statusEl.textContent = 'Aponte para o QR code do motor...';
      _tick();
    } catch (e) {
      if (statusEl) statusEl.textContent = `⚠ Sem acesso à câmera: ${e.message}`;
    }
  }

  function _pararCamera() {
    if (_animFrame) { cancelAnimationFrame(_animFrame); _animFrame = null; }
    if (_stream)    { _stream.getTracks().forEach(t => t.stop()); _stream = null; }
  }

  /* ── Loop de leitura ── */

  function _tick() {
    const video  = document.getElementById('qr-video-pub');
    const canvas = document.getElementById('qr-canvas-pub');
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

  /* ── Processamento ── */

  function _processar(texto) {
    _pararCamera();
    _setTexto('qr-status-pub', '✔ QR lido!');

    let codigo = texto;
    try {
      const url = new URL(texto);
      codigo = url.searchParams.get('motor') || texto;
    } catch (_) { /* não é URL — usa texto direto */ }
    codigo = codigo.trim().toUpperCase();

    const naMyEquipment = !!document.getElementById('campo-busca-os');

    if (naMyEquipment) {
      fechar();
      document.getElementById('campo-busca-os').value = codigo;
      if (typeof buscarOS === 'function') buscarOS();
    } else {
      window.location.href = `myequipment.html?motor=${encodeURIComponent(codigo)}`;
    }
  }

  /* ── UI helpers ── */

  function _resetarUI() {
    _setDisplay('qr-video-pub', 'block');
    _setDisplay('qr-frame-pub', 'flex');
    _setTexto('qr-status-pub', 'Iniciando câmera...');
  }

  function _setDisplay(id, valor) {
    const el = document.getElementById(id);
    if (el) el.style.display = valor;
  }

  function _setTexto(id, valor) {
    const el = document.getElementById(id);
    if (el) el.textContent = valor;
  }

  /* ── Injeta o modal no DOM (uma vez só) ── */

  function _injetarModal() {
    if (document.getElementById('modal-scanner-qr-pub')) return;

    const div = document.createElement('div');
    div.innerHTML = `
<div class="modal-overlay" id="modal-scanner-qr-pub">
  <div class="modal" style="width:480px;">
    <div class="modal-header">
      <div>
        <span class="modal-title">📷 Escanear QR Code</span>
        <div style="font-family:var(--mono);font-size:10px;color:var(--text2);margin-top:2px;">
          Aponte a câmera para o QR code do motor
        </div>
      </div>
      <button class="modal-close" onclick="QRPublic.fechar()">✕</button>
    </div>
    <div class="modal-body" style="padding:0;">
      <div id="qr-scanner-area-pub">
        <video id="qr-video-pub" playsinline autoplay muted></video>
        <canvas id="qr-canvas-pub" style="display:none;"></canvas>
        <div style="position:absolute;inset:0;pointer-events:none;display:flex;align-items:center;justify-content:center;">
          <div id="qr-frame-pub">
            <span style="top:0;left:0;border-top:3px solid var(--accent);border-left:3px solid var(--accent);border-radius:4px 0 0 0;"></span>
            <span style="top:0;right:0;border-top:3px solid var(--accent);border-right:3px solid var(--accent);border-radius:0 4px 0 0;"></span>
            <span style="bottom:0;left:0;border-bottom:3px solid var(--accent);border-left:3px solid var(--accent);border-radius:0 0 0 4px;"></span>
            <span style="bottom:0;right:0;border-bottom:3px solid var(--accent);border-right:3px solid var(--accent);border-radius:0 0 4px 0;"></span>
            <div id="qr-scan-line-pub"></div>
          </div>
        </div>
        <div id="qr-status-pub">Iniciando câmera...</div>
      </div>
      <div class="form-actions" style="padding:16px 20px;">
        <button class="btn-secondary" onclick="QRPublic.reiniciar()">↺ Ler outro</button>
      </div>
    </div>
  </div>
</div>`;
    document.body.appendChild(div.firstElementChild);
  }

  /* ── API pública ── */
  return { abrir, fechar, reiniciar };
})();
