/**
 * MotorTrack 2.0 — Módulo Dashboard
 *
 * Responsabilidades:
 *  - Gerenciar o listener em tempo real dos motores
 *  - Renderizar estatísticas, pipeline e tabelas
 *  - Renderizar o modal de detalhe de um chamado
 */

const Dashboard = (() => {
  let _motores   = [];
  let _unsub     = null;

  /* ── Ciclo de vida ── */

  function iniciar() {
    if (_unsub) _unsub();
    _unsub = Motores.escutarMotores((motores) => {
      _motores = motores;
      _renderizarPaginaAtiva();
    });
  }

  function parar() {
    if (_unsub) { _unsub(); _unsub = null; }
    _motores = [];
  }

  function _renderizarPaginaAtiva() {
    const paginaAtiva = document.querySelector('.page.active')?.id;
    if (paginaAtiva === 'page-dashboard') renderizarDashboard();
    if (paginaAtiva === 'page-motores')   renderizarTabelaMotores();
  }

  /* ── Dashboard Principal ── */

  function renderizarDashboard() {
    const ativos = _motores.filter(m => m.status !== 'concluido');

    let nAlerta  = 0;
    let nAtrasado = 0;
    let nUrgente  = 0;

    ativos.forEach(m => {
      const prazo = Motores.calcularStatusPrazo(m.prazoRetorno);
      if (prazo.tipo === 'alerta')        nAlerta++;
      else if (prazo.tipo === 'atrasado') nAtrasado++;
      if (m.prioridade === 'urgente')     nUrgente++;
    });

    _setTexto('stat-total',     _motores.length);
    _setTexto('stat-andamento', ativos.length);
    _setTexto('stat-alerta',    nAlerta + nAtrasado);
    _setTexto('stat-urgente',   nUrgente);

    Motores.ETAPAS_MANUTENCAO.forEach(etapa => {
      const fonte = etapa.id === 'concluido' ? _motores : ativos;
      const count = fonte.filter(m => m.etapaAtual === etapa.id).length;
      const el    = document.getElementById(`pipe-${etapa.id}`);
      if (el) el.textContent = count;
    });

    renderizarTabela('tbody-recentes', _motores.slice(0, 10));
  }

  /* ── Tabela de Chamados ── */

  function renderizarTabelaMotores() {
    const filtros = {
      etapa:      _valor('filtro-etapa'),
      origem:     _valor('filtro-origem'),
      prioridade: _valor('filtro-prioridade'),
      status:     _valor('filtro-status'),
      prazo:      _valor('filtro-prazo'),
      busca:      _valor('filtro-busca').toLowerCase(),
    };

    let lista = [..._motores];

    if (filtros.etapa)      lista = lista.filter(m => m.etapaAtual    === filtros.etapa);
    if (filtros.origem)     lista = lista.filter(m => m.setorOrigem   === filtros.origem);
    if (filtros.prioridade) lista = lista.filter(m => m.prioridade    === filtros.prioridade);
    if (filtros.status)     lista = lista.filter(m => m.status        === filtros.status);

    if (filtros.prazo === 'alerta') {
      lista = lista.filter(m => {
        const p = Motores.calcularStatusPrazo(m.prazoRetorno);
        return p.tipo === 'alerta' || p.tipo === 'atrasado';
      });
    }

    if (filtros.busca) {
      lista = lista.filter(m =>
        (m.codigo      || '').toLowerCase().includes(filtros.busca) ||
        (m.modelo      || '').toLowerCase().includes(filtros.busca) ||
        (m.tag         || '').toLowerCase().includes(filtros.busca) ||
        (m.setorOrigem || '').toLowerCase().includes(filtros.busca)
      );
    }

    renderizarTabela('tbody-motores', lista);
  }

  /**
   * Renderiza linhas de tabela no tbody especificado.
   */
  function renderizarTabela(tbodyId, lista) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    if (!lista.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" class="empty-row">Nenhum motor encontrado</td>
        </tr>`;
      return;
    }

    tbody.innerHTML = lista.map(m => _linhaTabela(m)).join('');
  }

  function _linhaTabela(m) {
    const prazo     = Motores.calcularStatusPrazo(m.prazoRetorno);
    const etapa     = Motores.ETAPAS_MANUTENCAO.find(s => s.id === m.etapaAtual);
    const setor     = Motores.SETORES_ORIGEM.find(s => s.id === m.setorOrigem);
    const motorTag  = m.tag ? `${m.tag} — ${m.modelo}` : m.modelo;
    const statusCls = { ok: 'status-ok', alerta: 'status-alerta', atrasado: 'status-atrasado' }[prazo.tipo];

    const podeEditar = Auth.podeEditar() && m.status !== 'concluido';

    return `
      <tr>
        <td data-label="Código OS">
          <span class="motor-code">${m.codigo}</span>
        </td>
        <td data-label="Motor / Tag">${motorTag}</td>
        <td data-label="Setor de Origem">${setor?.label ?? m.setorOrigem ?? '—'}</td>
        <td data-label="Etapa Atual">
          <span class="setor-badge setor-${m.etapaAtual}">
            ${etapa?.label ?? m.etapaAtual}
          </span>
        </td>
        <td data-label="Prioridade">${Motores.labelPrioridade(m.prioridade)}</td>
        <td data-label="Prazo">${m.prazoRetorno || '—'}</td>
        <td data-label="Status Prazo">
          <span class="status-dot ${statusCls}">${prazo.label}</span>
        </td>
        <td data-label="Situação">
          ${m.status === 'concluido' ? 'Concluído' : 'Em andamento'}
        </td>
        <td data-label="Ações">
          <button class="action-btn" onclick="App.abrirDetalhe('${m.id}')">Detalhe</button>
          ${podeEditar
            ? `<button class="action-btn" onclick="App.abrirAcao('${m.id}')">Registrar</button>`
            : ''}
        </td>
      </tr>`;
  }

  /* ── Modal de Detalhe ── */

  function renderizarDetalhe(motor, containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;

    const prazo   = Motores.calcularStatusPrazo(motor.prazoRetorno);
    const etapa   = Motores.ETAPAS_MANUTENCAO.find(s => s.id === motor.etapaAtual);
    const tempos  = Motores.calcularTemposPorEtapa(motor.historico ?? []);
    const tec     = motor.dadosTecnicos ?? {};
    const setor   = Motores.SETORES_ORIGEM.find(s => s.id === motor.setorOrigem);
    const motorTag= motor.tag ? `${motor.tag} — ${motor.modelo}` : motor.modelo;
    const statusCls = { ok: 'status-ok', alerta: 'status-alerta', atrasado: 'status-atrasado' }[prazo.tipo];

    const historicoHTML = [...(motor.historico ?? [])].reverse().map(h => {
      const data      = h.dataHora?.toDate?.() ?? new Date(h.dataHora);
      const etapaInfo = Motores.ETAPAS_MANUTENCAO.find(s => s.id === h.etapa);
      return `
        <div class="timeline-item">
          <div class="timeline-time">${_formatarDataHora(data)} — <strong>${h.responsavel}</strong></div>
          <div class="timeline-text">
            <span class="setor-badge setor-${h.etapa}" style="font-size:10px;padding:2px 8px;">
              ${etapaInfo?.label ?? h.etapa}
            </span>
            ${h.obs ? `<span style="margin-left:8px;color:var(--text2);">${h.obs}</span>` : ''}
          </div>
        </div>`;
    }).join('');

    const temposHTML = tempos.map(t => {
      const etapaInfo = Motores.ETAPAS_MANUTENCAO.find(s => s.id === t.setor);
      const tempoLabel = t.horas < 1 ? `${Math.round(t.horas * 60)} min` : `${t.horas} h`;
      return `
        <div class="tempo-item">
          <span class="setor-badge setor-${t.setor}">${etapaInfo?.label ?? t.setor}</span>
          <span style="font-family:var(--mono);font-size:12px;margin-left:12px;">${tempoLabel}</span>
        </div>`;
    }).join('');

    const dadosTecnicosHTML = (tec.vibracao != null && tec.vibracao !== '')
      ? `
        <div class="info-row"><span>Vibração</span><strong>${tec.vibracao} ${tec.unidadeVib ?? 'mm/s'}</strong></div>
        <div class="info-row"><span>Temperatura</span><strong>${tec.temperatura} °C</strong></div>
        ${motor.testeFinal?.resultado
          ? `<div class="info-row">
               <span>Teste Final</span>
               <strong class="${motor.testeFinal.resultado === 'aprovado' ? 'status-ok' : 'status-atrasado'}">
                 ${motor.testeFinal.resultado === 'aprovado' ? '✔ Aprovado' : '✘ Reprovado'}
               </strong>
             </div>`
          : ''}
        ${tec.obs ? `<div class="info-row"><span>Obs.</span><strong>${tec.obs}</strong></div>` : ''}`
      : `<div style="color:var(--text2);font-size:12px;padding:12px 0;">Nenhum dado técnico registrado</div>`;

    el.innerHTML = `
      <div class="detail-header">
        <div>
          <div class="detail-code">${motor.codigo}</div>
          <div class="detail-cliente">${motorTag}</div>
        </div>
        <div style="text-align:right;">
          <span class="setor-badge setor-${motor.etapaAtual}" style="font-size:13px;padding:6px 14px;">
            ${etapa?.label ?? motor.etapaAtual}
          </span>
          <br><br>
          <span class="status-dot ${statusCls}">${prazo.label}</span>
        </div>
      </div>

      <div class="detail-grid">
        <div class="detail-block">
          <div class="block-title">Informações do Motor</div>
          <div class="info-row"><span>Modelo</span>         <strong>${motor.modelo}</strong></div>
          <div class="info-row"><span>Tag / Patrimônio</span><strong>${motor.tag || '—'}</strong></div>
          <div class="info-row"><span>Potência</span>       <strong>${motor.potencia || '—'}</strong></div>
          <div class="info-row"><span>Setor de Origem</span><strong>${setor?.label ?? motor.setorOrigem ?? '—'}</strong></div>
          <div class="info-row"><span>Prioridade</span>     <strong>${Motores.labelPrioridade(motor.prioridade)}</strong></div>
          <div class="info-row"><span>Data de Entrada</span><strong>${motor.dataEntrada || '—'}</strong></div>
          <div class="info-row"><span>Prazo de Retorno</span><strong>${motor.prazoRetorno || '—'}</strong></div>
          ${motor.problemaRelatado
            ? `<div class="info-row"><span>Problema Relatado</span><strong>${motor.problemaRelatado}</strong></div>`
            : ''}
        </div>
        <div class="detail-block">
          <div class="block-title">Dados Técnicos</div>
          ${dadosTecnicosHTML}
        </div>
      </div>

      <div class="detail-block" style="margin-top:16px;">
        <div class="block-title">Tempo por Etapa</div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:8px;">
          ${temposHTML || '<span style="color:var(--text2);font-size:12px;">Sem dados</span>'}
        </div>
      </div>

      <div class="detail-block" style="margin-top:16px;">
        <div class="block-title">Histórico de Movimentações</div>
        <div class="timeline" style="margin-top:16px;">
          ${historicoHTML || '<span style="color:var(--text2);">Sem histórico</span>'}
        </div>
      </div>

      <!-- QR Code -->
      <div id="qrcode-container-${motor.id}"
           style="margin-top:20px;text-align:center;padding:20px;background:white;display:inline-block;border-radius:8px;">
      </div>
      <div style="margin-top:10px;text-align:center;">
        <button class="btn-secondary"
                onclick="App.imprimirQRCode('${motor.id}','${motor.codigo}')"
                style="display:inline-flex;align-items:center;gap:6px;">
          🖨️ Imprimir / Baixar QR Code
        </button>
      </div>

      <!-- Aba Orçamento -->
      <div class="detail-block" style="margin-top:24px;">
        <div class="block-title" style="display:flex;align-items:center;justify-content:space-between;">
          <span>💰 Orçamento da OS</span>
        </div>
        <div id="orcamento-render-${motor.id}">
          <div style="color:var(--text2);font-size:12px;padding:8px 0;">Carregando orçamento...</div>
        </div>
      </div>
    `;

    // Gera o QR Code
    setTimeout(() => {
      const qrEl = document.getElementById(`qrcode-container-${motor.id}`);
      if (qrEl && !qrEl.children.length) {
        new QRCode(qrEl, {
          text:       `${location.origin}${location.pathname}?motor=${motor.codigo}`,
          width:      128,
          height:     128,
          colorDark:  '#000000',
          colorLight: '#ffffff',
        });
        const label = document.createElement('div');
        label.style.cssText = 'font-family:monospace;font-size:11px;color:#333;margin-top:8px;';
        label.textContent   = motor.codigo;
        qrEl.appendChild(label);
      }

      // Carrega orçamento
      const orcEl = document.getElementById(`orcamento-render-${motor.id}`);
      if (orcEl && typeof App !== 'undefined' && App._renderizarOrcamento) {
        App._renderizarOrcamento(motor.id, orcEl);
      }
    }, 100);
  }

  /* ── Utilitários ── */

  function _setTexto(id, valor) {
    const el = document.getElementById(id);
    if (el) el.textContent = valor;
  }

  function _valor(id) {
    return document.getElementById(id)?.value ?? '';
  }

  function _formatarDataHora(d) {
    if (!d) return '—';
    return d.toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  /* ── API Pública ── */
  return {
    iniciar,
    parar,
    renderizarDashboard,
    renderizarTabelaMotores,
    renderizarTabela,
    renderizarDetalhe,
  };
})();
