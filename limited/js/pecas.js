/**
 * MotorTrack 2.0 — Módulo Peças + Estoque
 *
 * Responsabilidades:
 *  - CRUD de peças no Firestore (coleção `pecas`)
 *  - Geração automática de QR Code ao cadastrar
 *  - Busca por código ou nome
 *  - Movimentação de estoque (baixa ao usar em orçamento)
 *  - Renderização da página de peças
 */

const Pecas = (() => {

  /* ── Helpers ── */

  function _agora()      { return firebase.firestore.Timestamp.now(); }
  function _emailAtual() { return Auth.getUsuario()?.email ?? 'desconhecido'; }
  function _valor(id)    { return document.getElementById(id)?.value ?? ''; }
  function _setText(id, txt) { const el = document.getElementById(id); if (el) el.textContent = txt; }

  /* ── Geração de Código de Peça ── */

  function gerarCodigoPeca() {
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `P-${rand}`;
  }

  /* ── CRUD ── */

  async function cadastrar(dados) {
    const codigoPeca = dados.codigoPeca || gerarCodigoPeca();

    // Verifica duplicidade
    const existe = await buscarPorCodigo(codigoPeca);
    if (existe) throw new Error(`Código ${codigoPeca} já cadastrado.`);

    const peca = {
      codigoPeca,
      nome:        dados.nome,
      categoria:   dados.categoria    || '',
      fabricante:  dados.fabricante   || '',
      descricao:   dados.descricao    || '',
      valor:       parseFloat(dados.valor) || 0,
      estoque:     parseInt(dados.estoque, 10) || 0,
      estoqueMin:  parseInt(dados.estoqueMin, 10) || 0,
      localizacao: dados.localizacao  || '',
      qrCodeURL:   '',          // preenchido após salvar + gerar QR
      criadoPor:   _emailAtual(),
      criadoEm:    _agora(),
      atualizadoEm: _agora(),
    };

    const docRef = await db.collection('pecas').add(peca);
    return { id: docRef.id, ...peca };
  }

  async function atualizar(pecaId, dados) {
    await db.collection('pecas').doc(pecaId).update({
      nome:        dados.nome,
      categoria:   dados.categoria    || '',
      fabricante:  dados.fabricante   || '',
      descricao:   dados.descricao    || '',
      valor:       parseFloat(dados.valor) || 0,
      estoqueMin:  parseInt(dados.estoqueMin, 10) || 0,
      localizacao: dados.localizacao  || '',
      atualizadoEm: _agora(),
    });
  }

  async function excluir(pecaId) {
    await db.collection('pecas').doc(pecaId).delete();
  }

  /**
   * Baixa do estoque ao usar em orçamento.
   * Registra na subcoleção `movimentacoes`.
   */
  async function baixarEstoque(pecaId, quantidade, orcamentoId, codigoOS) {
    const doc = await db.collection('pecas').doc(pecaId).get();
    if (!doc.exists) throw new Error('Peça não encontrada.');
    const atual = doc.data().estoque || 0;
    if (atual < quantidade) throw new Error(`Estoque insuficiente. Disponível: ${atual}`);

    await db.collection('pecas').doc(pecaId).update({
      estoque: firebase.firestore.FieldValue.increment(-quantidade),
      atualizadoEm: _agora(),
    });

    // Registra movimentação
    await db.collection('pecas').doc(pecaId)
      .collection('movimentacoes').add({
        tipo:        'baixa',
        quantidade,
        orcamentoId: orcamentoId || '',
        codigoOS:    codigoOS   || '',
        realizadoPor: _emailAtual(),
        realizadoEm:  _agora(),
      });
  }

  /* ── Consultas ── */

  async function buscarPorId(id) {
    const doc = await db.collection('pecas').doc(id).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : null;
  }

  async function buscarPorCodigo(codigo) {
    const snap = await db.collection('pecas')
      .where('codigoPeca', '==', codigo)
      .limit(1)
      .get();
    return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
  }

  async function buscarPorTexto(texto) {
    // Firestore não tem full-text search nativo;
    // carregamos todas e filtramos no cliente (volume pequeno)
    const snap = await db.collection('pecas').orderBy('nome').get();
    const t = texto.toLowerCase();
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(p =>
        p.nome?.toLowerCase().includes(t) ||
        p.codigoPeca?.toLowerCase().includes(t) ||
        p.categoria?.toLowerCase().includes(t) ||
        p.fabricante?.toLowerCase().includes(t)
      );
  }

  function escutarPecas(callback) {
    return db.collection('pecas')
      .orderBy('nome')
      .onSnapshot(snap =>
        callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      );
  }

  /* ── Formatação ── */

  function formatarMoeda(valor) {
    return (valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  /* ── Renderização da Página ── */

  let _pecas  = [];
  let _unsub  = null;
  let _filtro = '';

  function iniciar() {
    if (_unsub) return;
    _unsub = escutarPecas(pecas => {
      _pecas = pecas;
      _renderizarTabela();
      _atualizarAlertaEstoque();
    });
  }

  function parar() {
    if (_unsub) { _unsub(); _unsub = null; }
    _pecas = [];
  }

  function _atualizarAlertaEstoque() {
    const baixo = _pecas.filter(p => p.estoque <= (p.estoqueMin || 0) && p.estoqueMin > 0);
    const badge = document.getElementById('badge-estoque-baixo');
    if (badge) {
      badge.textContent = baixo.length || '';
      badge.style.display = baixo.length ? 'inline-flex' : 'none';
    }
  }

  function filtrar(texto) {
    _filtro = (texto || '').toLowerCase();
    _renderizarTabela();
  }

  function _renderizarTabela() {
    const tbody = document.getElementById('tbody-pecas');
    if (!tbody) return;

    let lista = [..._pecas];
    if (_filtro) {
      lista = lista.filter(p =>
        p.nome?.toLowerCase().includes(_filtro) ||
        p.codigoPeca?.toLowerCase().includes(_filtro) ||
        p.categoria?.toLowerCase().includes(_filtro)
      );
    }

    if (!lista.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="empty-row">
        ${_filtro ? 'Nenhuma peça encontrada para a busca.' : 'Nenhuma peça cadastrada.'}
      </td></tr>`;
      return;
    }

    tbody.innerHTML = lista.map(p => {
      const semEstoque = p.estoque === 0;
      const estoqueMin = p.estoqueMin > 0 && p.estoque <= p.estoqueMin;
      const estoqueClass = semEstoque ? 'style="color:var(--red);font-weight:700;"'
        : estoqueMin ? 'style="color:var(--yellow);font-weight:700;"' : '';
      const estoqueBadge = semEstoque
        ? '<span style="font-size:9px;background:var(--red-dim);color:var(--red);padding:2px 6px;border-radius:10px;margin-left:4px;">SEM ESTOQUE</span>'
        : estoqueMin
        ? '<span style="font-size:9px;background:var(--yellow-dim,#2a2000);color:var(--yellow,#f0a500);padding:2px 6px;border-radius:10px;margin-left:4px;">BAIXO</span>'
        : '';

      return `<tr>
        <td data-label="Código">
          <span style="font-family:var(--mono);color:var(--accent);font-weight:600;">${p.codigoPeca}</span>
        </td>
        <td data-label="Nome">${p.nome || '—'}</td>
        <td data-label="Categoria"><span class="setor-badge" style="border-color:var(--border);color:var(--text2);">${p.categoria || '—'}</span></td>
        <td data-label="Valor" style="font-family:var(--mono);">${formatarMoeda(p.valor)}</td>
        <td data-label="Estoque" ${estoqueClass}>${p.estoque ?? 0}${estoqueBadge}</td>
        <td data-label="Ações" style="display:flex;gap:6px;flex-wrap:wrap;">
          <button class="action-btn" onclick="App.abrirDetalhe_Peca('${p.id}')">Ver</button>
          ${Auth.isAdmin() ? `<button class="action-btn" onclick="App.abrirEditarPeca('${p.id}')">Editar</button>` : ''}
          <button class="action-btn" onclick="App.imprimirQRPeca('${p.id}','${p.codigoPeca}')">QR</button>
        </td>
      </tr>`;
    }).join('');
  }

  /* ── API Pública ── */
  return {
    gerarCodigoPeca,
    cadastrar,
    atualizar,
    excluir,
    baixarEstoque,
    buscarPorId,
    buscarPorCodigo,
    buscarPorTexto,
    escutarPecas,
    formatarMoeda,
    iniciar,
    parar,
    filtrar,
    getPecas: () => _pecas,
  };
})();
