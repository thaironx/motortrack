const Dashboard = (() => {
  let todosMotores  = [];
  let unsubMotores  = null;

  function iniciar() {
    if (unsubMotores) unsubMotores();
    unsubMotores = Motores.escutarMotores((motores) => {
      todosMotores = motores;
      renderizarTudo();
    });
  }
  function parar() {
    if (unsubMotores) { unsubMotores(); unsubMotores = null; }
  }
  function renderizarTudo() {
    const paginaAtiva = document.querySelector('.page.active')?.id;
    if (paginaAtiva === 'page-dashboard') renderizarDashboard();
    if (paginaAtiva === 'page-motores')   renderizarTabelaMotores();
  }
  function renderizarDashboard() {
    const ativos = todosMotores.filter(m => m.status !== 'concluido');
    let nAlerta = 0, nAtrasado = 0, nUrgente = 0;
    ativos.forEach(m => {
      const p = Motores.calcularStatusPrazo(m.prazoRetorno);
      if (p.tipo === 'alerta')        nAlerta++;
      else if (p.tipo === 'atrasado') nAtrasado++;
      if (m.prioridade === 'urgente') nUrgente++;
    });
    setEl('stat-total',     todosMotores.length);
    setEl('stat-andamento', ativos.length);
    setEl('stat-alerta',    nAlerta + nAtrasado); 
    setEl('stat-urgente',   nUrgente);         
    Motores.ETAPAS_MANUTENCAO.forEach(s => {
      const fonte = s.id === 'concluido' ? todosMotores : ativos;
      const count = fonte.filter(m => m.etapaAtual === s.id).length;
      const el = document.getElementById(`pipe-${s.id}`);
      if (el) el.textContent = count;
    });
    const recentes = [...todosMotores].slice(0, 10);
    renderizarTabela('tbody-recentes', recentes);
  }
  function renderizarTabelaMotores() {
    const filtroEtapa      = document.getElementById('filtro-etapa')?.value      || '';
    const filtroOrigem     = document.getElementById('filtro-origem')?.value     || '';
    const filtroPrioridade = document.getElementById('filtro-prioridade')?.value || '';
    const filtroStatus     = document.getElementById('filtro-status')?.value     || '';
    const filtroPrazo      = document.getElementById('filtro-prazo')?.value      || '';
    const filtroBusca      = (document.getElementById('filtro-busca')?.value     || '').toLowerCase();
    let lista = [...todosMotores];
    if (filtroEtapa)      lista = lista.filter(m => m.etapaAtual === filtroEtapa);
    if (filtroOrigem)     lista = lista.filter(m => m.setorOrigem === filtroOrigem);
    if (filtroPrioridade) lista = lista.filter(m => m.prioridade === filtroPrioridade);
    if (filtroStatus)     lista = lista.filter(m => m.status === filtroStatus);
    if (filtroPrazo === 'alerta') {
      lista = lista.filter(m => {
        const p = Motores.calcularStatusPrazo(m.prazoRetorno);
        return p.tipo === 'alerta' || p.tipo === 'atrasado';
      });
    }
    if (filtroBusca) {
      lista = lista.filter(m =>
        (m.codigo        || '').toLowerCase().includes(filtroBusca) ||
        (m.modelo        || '').toLowerCase().includes(filtroBusca) ||
        (m.tag           || '').toLowerCase().includes(filtroBusca) ||
        (m.setorOrigem   || '').toLowerCase().includes(filtroBusca)
      );
    }
    renderizarTabela('tbody-motores', lista);
  }
  function renderizarTabela(tbodyId, lista) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    if (lista.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--text2);padding:40px;font-family:var(--mono);font-size:12px;">Nenhum motor encontrado</td></tr>`;
      return;
    }
    tbody.innerHTML = lista.map(m => {
      const prazo   = Motores.calcularStatusPrazo(m.prazoRetorno);
      const etapa   = Motores.ETAPAS_MANUTENCAO.find(s => s.id === m.etapaAtual);
      const prazoStr = m.prazoRetorno || '—';
      const motorTag = m.tag ? `${m.tag} — ${m.modelo}` : m.modelo;
      const setorOrigemLabel = Motores.SETORES_ORIGEM.find(s => s.id === m.setorOrigem)?.label || m.setorOrigem || '—';
      const statusClass  = prazo.tipo === 'ok' ? 'status-ok' : prazo.tipo === 'alerta' ? 'status-alerta' : 'status-atrasado';
      const etapaClass   = `setor-${m.etapaAtual}`;
      const prioLabel    = Motores.labelPrioridade(m.prioridade);
      const situacaoLabel = m.status === 'concluido' ? 'Concluído' : 'Em andamento';
      return `<tr>
        <td data-label="Código OS"><span class="motor-code">${m.codigo}</span></td>
        <td data-label="Motor / Tag">${motorTag}</td>
        <td data-label="Setor de Origem">${setorOrigemLabel}</td>
        <td data-label="Etapa"><span class="setor-badge ${etapaClass}">${etapa?.label || m.etapaAtual}</span></td>
        <td data-label="Prioridade">${prioLabel}</td>
        <td data-label="Prazo">${prazoStr}</td>
        <td data-label="Status"><span class="status-dot ${statusClass}">${prazo.label}</span></td>
        <td data-label="Situação">${situacaoLabel}</td>
        <td data-label="Ações">
          <button class="action-btn" onclick="App.abrirDetalhe('${m.id}')">Detalhe</button>
          ${(Auth.isAdmin() || Auth.getSetor() === 'manutencao') && m.status !== 'concluido'
            ? `<button class="action-btn" onclick="App.abrirAcao('${m.id}')">Registrar</button>`
            : ''}
        </td>
      </tr>`;
    }).join('');
  }
  function renderizarDetalhe(motor, containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const prazo  = Motores.calcularStatusPrazo(motor.prazoRetorno);
    const etapa  = Motores.ETAPAS_MANUTENCAO.find(s => s.id === motor.etapaAtual);
    const tempos = Motores.calcularTemposPorEtapa(motor.historico || []);
    const historico = [...(motor.historico || [])].reverse().map(h => {
      const data = h.dataHora?.toDate ? h.dataHora.toDate() : new Date(h.dataHora);
      const etapaInfo = Motores.ETAPAS_MANUTENCAO.find(s => s.id === h.etapa);
      return `<div class="timeline-item">
        <div class="timeline-time">${formatarDataHora(data)} — <strong>${h.responsavel}</strong></div>
        <div class="timeline-text">
          <span class="setor-badge setor-${h.etapa}" style="font-size:10px;padding:2px 8px;">
            ${etapaInfo?.label || h.etapa}
          </span>
          ${h.obs ? `<span style="margin-left:8px;color:var(--text2);">${h.obs}</span>` : ''}
        </div>
      </div>`;
    }).join('');
    const temposHTML = tempos.map(t => {
      const etapaInfo = Motores.ETAPAS_MANUTENCAO.find(s => s.id === t.setor);
      return `<div class="tempo-item">
        <span class="setor-badge setor-${t.setor}">${etapaInfo?.label || t.setor}</span>
        <span style="font-family:var(--mono);font-size:12px;margin-left:12px;">
          ${t.horas < 1 ? Math.round(t.horas * 60) + ' min' : t.horas + ' h'}
        </span>
      </div>`;
    }).join('');
    const tec = motor.dadosTecnicos || {};
    const statusClass = prazo.tipo === 'ok' ? 'status-ok' : prazo.tipo === 'alerta' ? 'status-alerta' : 'status-atrasado';
    const motorTag = motor.tag ? `${motor.tag} — ${motor.modelo}` : motor.modelo;
    const setorOrigemLabel = Motores.SETORES_ORIGEM.find(s => s.id === motor.setorOrigem)?.label || motor.setorOrigem || '—';
    el.innerHTML = `
      <div class="detail-header">
        <div>
          <div class="detail-code">${motor.codigo}</div>
          <div class="detail-cliente">${motorTag}</div>
        </div>
        <div style="text-align:right;">
          <span class="setor-badge setor-${motor.etapaAtual}" style="font-size:13px;padding:6px 14px;">
            ${etapa?.label || motor.etapaAtual}
          </span>
          <br><br>
          <span class="status-dot ${statusClass}">${prazo.label}</span>
        </div>
      </div>
      <div class="detail-grid">
        <div class="detail-block">
          <div class="block-title">Informações do Motor</div>
          <div class="info-row"><span>Modelo</span><strong>${motor.modelo}</strong></div>
          <div class="info-row"><span>Tag / Patrimônio</span><strong>${motor.tag || '—'}</strong></div>
          <div class="info-row"><span>Potência</span><strong>${motor.potencia || '—'}</strong></div>
          <div class="info-row"><span>Setor de Origem</span><strong>${setorOrigemLabel}</strong></div>
          <div class="info-row"><span>Prioridade</span><strong>${Motores.labelPrioridade(motor.prioridade)}</strong></div>
          <div class="info-row"><span>Data de Entrada</span><strong>${motor.dataEntrada || '—'}</strong></div>
          <div class="info-row"><span>Prazo de Retorno</span><strong>${motor.prazoRetorno || '—'}</strong></div>
          ${motor.problemaRelatado ? `<div class="info-row"><span>Problema Relatado</span><strong>${motor.problemaRelatado}</strong></div>` : ''}
        </div>
        <div class="detail-block">
          <div class="block-title">Dados Técnicos</div>
          ${tec.vibracao != null && tec.vibracao !== ''
            ? `<div class="info-row"><span>Vibração</span><strong>${tec.vibracao} ${tec.unidadeVib || 'mm/s'}</strong></div>
               <div class="info-row"><span>Temperatura</span><strong>${tec.temperatura} °C</strong></div>
               ${motor.testeFinal?.resultado
                 ? `<div class="info-row"><span>Teste Final</span>
                      <strong class="${motor.testeFinal.resultado === 'aprovado' ? 'status-ok' : 'status-atrasado'}">
                        ${motor.testeFinal.resultado === 'aprovado' ? '✔ Aprovado' : '✘ Reprovado'}
                      </strong>
                    </div>`
                 : ''}
               ${tec.obs ? `<div class="info-row"><span>Observações</span><strong>${tec.obs}</strong></div>` : ''}`
            : `<div style="color:var(--text2);font-size:12px;padding:12px 0;">Nenhum dado técnico registrado</div>`
          }
        </div>
      </div>
      <div class="detail-block" style="margin-top:16px;">
        <div class="block-title">Tempo por Etapa</div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:8px;">${temposHTML || '<span style="color:var(--text2);font-size:12px;">Sem dados</span>'}</div>
      </div>
      <div class="detail-block" style="margin-top:16px;">
        <div class="block-title">Histórico de Movimentações</div>
        <div class="timeline" style="margin-top:16px;">${historico || '<span style="color:var(--text2);">Sem histórico</span>'}</div>
      </div>
      <div id="qrcode-container-${motor.id}" style="margin-top:20px;text-align:center;padding:20px;background:white;display:inline-block;border-radius:8px;"></div>
      <div style="margin-top:10px;text-align:center;">
        <button class="btn-imprimir-qr action-btn" onclick="App.imprimirQRCode('${motor.id}','${motor.codigo}')"
          style="background:var(--surface2);border:1.5px solid var(--border);color:var(--text);padding:8px 18px;border-radius:var(--radius);font-size:12px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:6px;transition:border-color .2s,background .2s;">
          🖨️ Imprimir / Baixar QR Code
        </button>
      </div>
    `;
    setTimeout(() => {
      const qrEl = document.getElementById(`qrcode-container-${motor.id}`);
      if (qrEl && qrEl.children.length === 0) {
        new QRCode(qrEl, {
          text: `${window.location.origin}${window.location.pathname}?motor=${motor.codigo}`,
          width:  128,
          height: 128,
          colorDark:  '#000000',
          colorLight: '#ffffff'
        });
        const label = document.createElement('div');
        label.style.cssText = 'font-family:monospace;font-size:11px;color:#333;margin-top:8px;';
        label.textContent = motor.codigo;
        qrEl.appendChild(label);
      }
    }, 100);
  }
  function setEl(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }
  function formatarDataHora(d) {
    if (!d) return '—';
    return d.toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
  }
  return { iniciar, parar, renderizarTudo, renderizarTabelaMotores, renderizarDetalhe };
})();