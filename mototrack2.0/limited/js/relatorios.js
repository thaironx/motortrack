/**
 * MotorTrack 2.0 — Módulo Relatórios
 *
 * Responsabilidades:
 *  - Relatório de peças mais utilizadas
 *  - Gastos por setor
 *  - OS finalizadas por período
 *  - Alerta de estoque baixo
 *  - Exportação CSV
 */

const Relatorios = (() => {

  function _valor(id) { return document.getElementById(id)?.value ?? ''; }

  /* ── Coleta de Dados ── */

  async function _carregarOrcamentos(de, ate) {
    let query = db.collection('orcamentos').orderBy('criadoEm', 'desc');
    const snap = await query.get();
    const orcamentos = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (!de && !ate) return orcamentos;

    return orcamentos.filter(o => {
      const dt = o.criadoEm?.toDate ? o.criadoEm.toDate() : null;
      if (!dt) return true;
      if (de  && dt < new Date(de))  return false;
      if (ate && dt > new Date(ate + 'T23:59:59')) return false;
      return true;
    });
  }

  async function _carregarMotores(de, ate) {
    const snap = await db.collection('motores').orderBy('abertoEm', 'desc').get();
    const motores = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    return motores.filter(m => {
      const dt = m.abertoEm?.toDate ? m.abertoEm.toDate() : null;
      if (!dt) return true;
      if (de  && dt < new Date(de))  return false;
      if (ate && dt > new Date(ate + 'T23:59:59')) return false;
      return true;
    });
  }

  /* ── Geração de Relatórios ── */

  async function gerarRelatorio() {
    const tipo = _valor('rel-tipo');
    const de   = _valor('rel-de');
    const ate  = _valor('rel-ate');

    const container = document.getElementById('rel-resultado');
    if (!container) return;
    container.innerHTML = `<div style="text-align:center;padding:32px;color:var(--text2);">Carregando...</div>`;

    try {
      switch (tipo) {
        case 'pecas_utilizadas': await _relPecasUtilizadas(container, de, ate); break;
        case 'gastos_setor':     await _relGastosSetor(container, de, ate);     break;
        case 'os_finalizadas':   await _relOSFinalizadas(container, de, ate);   break;
        case 'estoque_baixo':    await _relEstoqueBaixo(container);              break;
        default:
          container.innerHTML = '<p style="color:var(--text2);">Selecione um tipo de relatório.</p>';
      }
    } catch (e) {
      container.innerHTML = `<p style="color:var(--red);">Erro ao gerar relatório: ${e.message}</p>`;
    }
  }

  async function _relPecasUtilizadas(container, de, ate) {
    const orcamentos = await _carregarOrcamentos(de, ate);

    // Agrega itens de todos os orçamentos
    const mapa = {};
    orcamentos.forEach(o => {
      (o.itens || []).forEach(item => {
        const key = item.codigoPeca;
        if (!mapa[key]) {
          mapa[key] = { codigo: item.codigoPeca, nome: item.nomePeca, qtd: 0, total: 0 };
        }
        mapa[key].qtd   += item.quantidade || 0;
        mapa[key].total += item.subtotal   || 0;
      });
    });

    const lista = Object.values(mapa).sort((a, b) => b.qtd - a.qtd);

    if (!lista.length) {
      container.innerHTML = '<p style="color:var(--text2);">Nenhuma peça utilizada no período.</p>';
      return;
    }

    container.innerHTML = `
      <div class="table-wrapper" style="margin-top:0;">
        <div class="table-header">
          <div class="table-header-title">Peças Mais Utilizadas</div>
          <button class="btn-secondary" onclick="Relatorios.exportarCSV('pecas')">⬇ Exportar CSV</button>
        </div>
        <table>
          <thead><tr>
            <th>Código</th><th>Peça</th>
            <th>Qtd Utilizada</th><th>Total Gasto</th>
          </tr></thead>
          <tbody>
            ${lista.map((p, i) => `<tr>
              <td style="font-family:var(--mono);color:var(--accent);">${p.codigo}</td>
              <td>${p.nome}</td>
              <td style="font-weight:700;">${p.qtd}</td>
              <td style="font-family:var(--mono);">${Pecas.formatarMoeda(p.total)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;

    // Guarda para exportação
    window._relatorioAtual = { tipo: 'pecas', dados: lista };
  }

  async function _relGastosSetor(container, de, ate) {
    const orcamentos = await _carregarOrcamentos(de, ate);

    const mapa = {};
    orcamentos.forEach(o => {
      const setor = o.setorOrigem || 'Não informado';
      if (!mapa[setor]) mapa[setor] = { setor, totalPecas: 0, maoDeObra: 0, totalGeral: 0, qtdOS: 0 };
      mapa[setor].totalPecas += o.totalPecas || 0;
      mapa[setor].maoDeObra  += o.maoDeObra  || 0;
      mapa[setor].totalGeral += o.totalGeral  || 0;
      mapa[setor].qtdOS++;
    });

    const lista = Object.values(mapa).sort((a, b) => b.totalGeral - a.totalGeral);

    if (!lista.length) {
      container.innerHTML = '<p style="color:var(--text2);">Nenhum dado no período.</p>';
      return;
    }

    container.innerHTML = `
      <div class="table-wrapper" style="margin-top:0;">
        <div class="table-header">
          <div class="table-header-title">Gastos por Setor</div>
          <button class="btn-secondary" onclick="Relatorios.exportarCSV('setor')">⬇ Exportar CSV</button>
        </div>
        <table>
          <thead><tr>
            <th>Setor</th><th>Nº de OS</th>
            <th>Total Peças</th><th>Mão de Obra</th><th>Total Geral</th>
          </tr></thead>
          <tbody>
            ${lista.map(s => `<tr>
              <td><span class="setor-badge" style="border-color:var(--border);color:var(--text2);">${s.setor}</span></td>
              <td>${s.qtdOS}</td>
              <td style="font-family:var(--mono);">${Pecas.formatarMoeda(s.totalPecas)}</td>
              <td style="font-family:var(--mono);">${Pecas.formatarMoeda(s.maoDeObra)}</td>
              <td style="font-family:var(--mono);font-weight:700;">${Pecas.formatarMoeda(s.totalGeral)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;

    window._relatorioAtual = { tipo: 'setor', dados: lista };
  }

  async function _relOSFinalizadas(container, de, ate) {
    const motores = await _carregarMotores(de, ate);
    const concluidos = motores.filter(m => m.status === 'concluido');

    if (!concluidos.length) {
      container.innerHTML = '<p style="color:var(--text2);">Nenhuma OS finalizada no período.</p>';
      return;
    }

    container.innerHTML = `
      <div class="table-wrapper" style="margin-top:0;">
        <div class="table-header">
          <div class="table-header-title">OS Finalizadas (${concluidos.length})</div>
          <button class="btn-secondary" onclick="Relatorios.exportarCSV('os')">⬇ Exportar CSV</button>
        </div>
        <table>
          <thead><tr>
            <th>Código</th><th>Modelo</th><th>Setor</th>
            <th>Data Entrada</th><th>Concluído em</th><th>Resultado</th>
          </tr></thead>
          <tbody>
            ${concluidos.map(m => {
              const dtConc = m.concluidoEm?.toDate
                ? m.concluidoEm.toDate().toLocaleDateString('pt-BR')
                : '—';
              const RESULTADOS = {
                aprovado:            'Aprovado',
                reprovado_sucateado: 'Sucateado',
                substituido:         'Substituído',
              };
              return `<tr>
                <td style="font-family:var(--mono);color:var(--accent);">${m.codigo}</td>
                <td>${m.modelo || '—'}</td>
                <td>${m.setorOrigem || '—'}</td>
                <td>${m.dataEntrada || '—'}</td>
                <td>${dtConc}</td>
                <td>${RESULTADOS[m.resultado] || m.resultado || '—'}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;

    window._relatorioAtual = { tipo: 'os', dados: concluidos };
  }

  async function _relEstoqueBaixo(container) {
    const snap = await db.collection('pecas').get();
    const pecas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const baixo = pecas.filter(p => p.estoqueMin > 0 && p.estoque <= p.estoqueMin);

    if (!baixo.length) {
      container.innerHTML = `<div style="text-align:center;padding:32px;color:var(--green,#00c97a);">
        ✔ Nenhuma peça com estoque abaixo do mínimo.
      </div>`;
      return;
    }

    container.innerHTML = `
      <div class="table-wrapper" style="margin-top:0;">
        <div class="table-header">
          <div class="table-header-title">⚠ Estoque Baixo (${baixo.length} peças)</div>
        </div>
        <table>
          <thead><tr>
            <th>Código</th><th>Peça</th><th>Estoque Atual</th><th>Estoque Mínimo</th><th>Situação</th>
          </tr></thead>
          <tbody>
            ${baixo.map(p => {
              const zerado = p.estoque === 0;
              return `<tr>
                <td style="font-family:var(--mono);color:var(--accent);">${p.codigoPeca}</td>
                <td>${p.nome}</td>
                <td style="color:${zerado ? 'var(--red)' : 'var(--yellow,#f0a500)'};font-weight:700;">${p.estoque}</td>
                <td>${p.estoqueMin}</td>
                <td>
                  <span style="font-size:9px;padding:2px 8px;border-radius:10px;font-weight:700;
                    background:${zerado ? 'var(--red-dim)' : 'var(--yellow-dim,#2a2000)'};
                    color:${zerado ? 'var(--red)' : 'var(--yellow,#f0a500)'};">
                    ${zerado ? 'SEM ESTOQUE' : 'ESTOQUE BAIXO'}
                  </span>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  /* ── Exportação CSV ── */

  function exportarCSV(tipo) {
    const rel = window._relatorioAtual;
    if (!rel || rel.tipo !== tipo) { alert('Gere o relatório antes de exportar.'); return; }

    let csv = '';
    let nome = '';

    if (tipo === 'pecas') {
      csv  = 'Código,Peça,Qtd Utilizada,Total Gasto\n';
      csv += rel.dados.map(p => `${p.codigo},"${p.nome}",${p.qtd},${p.total.toFixed(2)}`).join('\n');
      nome = 'relatorio_pecas.csv';
    } else if (tipo === 'setor') {
      csv  = 'Setor,Nº OS,Total Peças,Mão de Obra,Total Geral\n';
      csv += rel.dados.map(s =>
        `"${s.setor}",${s.qtdOS},${s.totalPecas.toFixed(2)},${s.maoDeObra.toFixed(2)},${s.totalGeral.toFixed(2)}`
      ).join('\n');
      nome = 'relatorio_gastos_setor.csv';
    } else if (tipo === 'os') {
      csv  = 'Código OS,Modelo,Setor,Data Entrada,Concluído em,Resultado\n';
      csv += rel.dados.map(m => {
        const dtConc = m.concluidoEm?.toDate ? m.concluidoEm.toDate().toLocaleDateString('pt-BR') : '';
        return `${m.codigo},"${m.modelo || ''}","${m.setorOrigem || ''}",${m.dataEntrada || ''},${dtConc},${m.resultado || ''}`;
      }).join('\n');
      nome = 'relatorio_os_finalizadas.csv';
    }

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = nome;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ── API Pública ── */
  return {
    gerarRelatorio,
    exportarCSV,
  };
})();
