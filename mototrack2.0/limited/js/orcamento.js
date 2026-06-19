/**
 * MotorTrack 2.0 — Módulo Orçamentos
 *
 * Responsabilidades:
 *  - CRUD de orçamentos no Firestore (coleção `orcamentos`)
 *  - Adição/remoção de peças e serviços ao orçamento
 *  - Cálculo automático de totais
 *  - Registro de histórico de alterações
 *  - Impressão de orçamento em PDF (via janela de impressão)
 */

const Orcamento = (() => {

  /* ── Helpers ── */

  function _agora()      { return firebase.firestore.Timestamp.now(); }
  function _emailAtual() { return Auth.getUsuario()?.email ?? 'desconhecido'; }
  function _valor(id)    { return document.getElementById(id)?.value ?? ''; }

  /* ── CRUD de Orçamento ── */

  /**
   * Cria ou retorna o orçamento existente de um motor (OS).
   */
  async function obterOuCriar(motorId) {
    const snap = await db.collection('orcamentos')
      .where('motorId', '==', motorId)
      .limit(1)
      .get();

    if (!snap.empty) {
      return { id: snap.docs[0].id, ...snap.docs[0].data() };
    }

    // Busca dados do motor para preencher codigoOS
    const motorDoc = await db.collection('motores').doc(motorId).get();
    const motor    = motorDoc.exists ? motorDoc.data() : {};

    const novoOrc = {
      motorId,
      codigoOS:     motor.codigo    || '',
      modeloMotor:  motor.modelo    || '',
      setorOrigem:  motor.setorOrigem || '',
      itens:        [],
      maoDeObra:    0,
      totalPecas:   0,
      totalGeral:   0,
      status:       'em_aberto',
      historico:    [],
      criadoPor:    _emailAtual(),
      criadoEm:     _agora(),
      atualizadoEm: _agora(),
    };

    const docRef = await db.collection('orcamentos').add(novoOrc);

    // Vincula referência no motor
    await db.collection('motores').doc(motorId).update({
      orcamentoId: docRef.id,
    });

    return { id: docRef.id, ...novoOrc };
  }

  async function buscarPorId(orcId) {
    const doc = await db.collection('orcamentos').doc(orcId).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : null;
  }

  async function buscarPorMotor(motorId) {
    const snap = await db.collection('orcamentos')
      .where('motorId', '==', motorId)
      .limit(1)
      .get();
    return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
  }

  /* ── Gerenciamento de Itens ── */

  /**
   * Adiciona uma peça ao orçamento.
   * @param {string} orcId   - ID do orçamento
   * @param {object} peca    - { id, codigoPeca, nome, valor }
   * @param {number} qtd     - Quantidade
   */
  async function adicionarPeca(orcId, peca, qtd) {
    const orc = await buscarPorId(orcId);
    if (!orc) throw new Error('Orçamento não encontrado.');

    const subtotal = peca.valor * qtd;
    const novoItem = {
      pecaId:       peca.id,
      codigoPeca:   peca.codigoPeca,
      nomePeca:     peca.nome,
      valorUnitario: peca.valor,
      quantidade:   qtd,
      subtotal,
      adicionadoPor: _emailAtual(),
      adicionadoEm:  _agora(),
    };

    const novosItens     = [...(orc.itens || []), novoItem];
    const novoTotalPecas = novosItens.reduce((s, i) => s + (i.subtotal || 0), 0);
    const novoTotal      = novoTotalPecas + (orc.maoDeObra || 0);

    const entrada = {
      acao: 'adicionou peça',
      descricao: `${_emailAtual()} adicionou ${qtd}x ${peca.nome} (${peca.codigoPeca})`,
      dataHora: _agora(),
      por: _emailAtual(),
    };

    await db.collection('orcamentos').doc(orcId).update({
      itens:        novosItens,
      totalPecas:   novoTotalPecas,
      totalGeral:   novoTotal,
      atualizadoEm: _agora(),
      historico:    firebase.firestore.FieldValue.arrayUnion(entrada),
    });

    // Baixa estoque
    await Pecas.baixarEstoque(peca.id, qtd, orcId, orc.codigoOS);
  }

  /**
   * Remove um item do orçamento pelo índice.
   */
  async function removerItem(orcId, indice) {
    const orc = await buscarPorId(orcId);
    if (!orc) throw new Error('Orçamento não encontrado.');

    const itens = [...(orc.itens || [])];
    const removido = itens.splice(indice, 1)[0];
    const novoTotalPecas = itens.reduce((s, i) => s + (i.subtotal || 0), 0);
    const novoTotal      = novoTotalPecas + (orc.maoDeObra || 0);

    const entrada = {
      acao: 'removeu peça',
      descricao: `${_emailAtual()} removeu ${removido?.nomePeca || '—'} do orçamento`,
      dataHora: _agora(),
      por: _emailAtual(),
    };

    await db.collection('orcamentos').doc(orcId).update({
      itens:        itens,
      totalPecas:   novoTotalPecas,
      totalGeral:   novoTotal,
      atualizadoEm: _agora(),
      historico:    firebase.firestore.FieldValue.arrayUnion(entrada),
    });
  }

  /**
   * Atualiza valor de mão de obra.
   */
  async function atualizarMaoDeObra(orcId, valor) {
    const orc = await buscarPorId(orcId);
    if (!orc) throw new Error('Orçamento não encontrado.');

    const novoTotal = (orc.totalPecas || 0) + valor;
    const entrada = {
      acao: 'atualizou mão de obra',
      descricao: `${_emailAtual()} atualizou mão de obra para ${Pecas.formatarMoeda(valor)}`,
      dataHora: _agora(),
      por: _emailAtual(),
    };

    await db.collection('orcamentos').doc(orcId).update({
      maoDeObra:    valor,
      totalGeral:   novoTotal,
      atualizadoEm: _agora(),
      historico:    firebase.firestore.FieldValue.arrayUnion(entrada),
    });
  }

  /* ── Impressão ── */

  function imprimir(orc, motor) {
    const itensHTML = (orc.itens || []).map((item, i) => `
      <tr>
        <td>${i + 1}</td>
        <td style="font-family:monospace;">${item.codigoPeca}</td>
        <td>${item.nomePeca}</td>
        <td>${item.quantidade}</td>
        <td>${Pecas.formatarMoeda(item.valorUnitario)}</td>
        <td>${Pecas.formatarMoeda(item.subtotal)}</td>
      </tr>`).join('');

    const historicoHTML = (orc.historico || []).slice(-10).map(h => {
      const dt = h.dataHora?.toDate ? h.dataHora.toDate().toLocaleString('pt-BR') : '—';
      return `<div style="font-size:11px;padding:4px 0;border-bottom:1px solid #eee;">
        <span style="color:#888;">${dt}</span> — ${h.descricao}
      </div>`;
    }).join('');

    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Orçamento — ${orc.codigoOS}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:Arial,sans-serif;font-size:13px;color:#111;padding:32px;max-width:900px;margin:auto}
    h1{font-size:20px;margin-bottom:4px}
    .sub{color:#555;font-size:12px;margin-bottom:24px}
    .grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px}
    .card{border:1px solid #ddd;border-radius:6px;padding:14px}
    .card-title{font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#888;margin-bottom:8px}
    .card-row{display:flex;justify-content:space-between;font-size:12px;padding:3px 0;border-bottom:1px solid #f5f5f5}
    table{width:100%;border-collapse:collapse;margin-bottom:20px}
    th{background:#f5f5f5;text-align:left;padding:8px;font-size:11px;text-transform:uppercase;letter-spacing:.5px}
    td{padding:8px;border-bottom:1px solid #f0f0f0;font-size:12px}
    .total-box{border:2px solid #111;border-radius:6px;padding:14px;max-width:320px;margin-left:auto}
    .total-row{display:flex;justify-content:space-between;padding:4px 0;font-size:13px}
    .total-row.final{font-weight:700;font-size:15px;border-top:1px solid #ddd;margin-top:6px;padding-top:8px}
    .hist-title{font-size:11px;font-weight:700;letter-spacing:1px;color:#888;margin:20px 0 8px;text-transform:uppercase}
    @media print{body{padding:16px}}
  </style>
</head>
<body>
  <h1>⚙ MotorTrack — Orçamento de Manutenção</h1>
  <p class="sub">OS: ${orc.codigoOS} &nbsp;|&nbsp; Gerado em ${new Date().toLocaleString('pt-BR')}</p>

  <div class="grid2">
    <div class="card">
      <div class="card-title">Motor</div>
      <div class="card-row"><span>Modelo</span><span>${motor?.modelo || orc.modeloMotor || '—'}</span></div>
      <div class="card-row"><span>Tag</span><span>${motor?.tag || '—'}</span></div>
      <div class="card-row"><span>Setor</span><span>${orc.setorOrigem || '—'}</span></div>
      <div class="card-row"><span>Potência</span><span>${motor?.potencia || '—'}</span></div>
    </div>
    <div class="card">
      <div class="card-title">Orçamento</div>
      <div class="card-row"><span>Código OS</span><span>${orc.codigoOS}</span></div>
      <div class="card-row"><span>Status</span><span>${orc.status === 'em_aberto' ? 'Em aberto' : 'Concluído'}</span></div>
      <div class="card-row"><span>Criado por</span><span>${orc.criadoPor}</span></div>
      <div class="card-row"><span>Atualizado</span><span>${orc.atualizadoEm?.toDate ? orc.atualizadoEm.toDate().toLocaleString('pt-BR') : '—'}</span></div>
    </div>
  </div>

  <table>
    <thead><tr>
      <th>#</th><th>Código</th><th>Peça</th><th>Qtd</th><th>Valor Unit.</th><th>Subtotal</th>
    </tr></thead>
    <tbody>
      ${itensHTML || '<tr><td colspan="6" style="text-align:center;color:#888;padding:16px;">Nenhuma peça adicionada.</td></tr>'}
    </tbody>
  </table>

  <div class="total-box">
    <div class="total-row"><span>Total Peças</span><span>${Pecas.formatarMoeda(orc.totalPecas)}</span></div>
    <div class="total-row"><span>Mão de Obra</span><span>${Pecas.formatarMoeda(orc.maoDeObra)}</span></div>
    <div class="total-row final"><span>TOTAL GERAL</span><span>${Pecas.formatarMoeda(orc.totalGeral)}</span></div>
  </div>

  ${orc.historico?.length ? `<div class="hist-title">Histórico de Alterações</div>${historicoHTML}` : ''}

  <div style="margin-top:40px;display:flex;gap:40px;justify-content:center;">
    <div style="text-align:center;border-top:1px solid #999;padding-top:8px;width:220px;font-size:11px;">
      Responsável pela OS
    </div>
    <div style="text-align:center;border-top:1px solid #999;padding-top:8px;width:220px;font-size:11px;">
      Autorização
    </div>
  </div>

  <script>window.onload=()=>window.print();<\/script>
</body>
</html>`);
    win.document.close();
  }

  /* ── Relatórios ── */

  async function listarTodos() {
    const snap = await db.collection('orcamentos')
      .orderBy('criadoEm', 'desc')
      .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  /* ── API Pública ── */
  return {
    obterOuCriar,
    buscarPorId,
    buscarPorMotor,
    adicionarPeca,
    removerItem,
    atualizarMaoDeObra,
    imprimir,
    listarTodos,
  };
})();
