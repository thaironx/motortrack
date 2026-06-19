/**
 * MotorTrack 2.0 — App (Controlador Principal)
 *
 * Responsabilidades:
 *  - Inicialização e roteamento de páginas
 *  - Login / logout
 *  - Modais de cadastro, detalhe, ação, usuários
 *  - Impressão de QR Code
 *  - Verificação de QR Code via URL
 */

const App = (() => {
  let _motorAtualId = null;

  /* ── Helpers de Modal ── */

  function abrirModal(id)  { document.getElementById(id)?.classList.add('open'); }
  function fecharModal(id) { document.getElementById(id)?.classList.remove('open'); }

  function _limparModal(id) {
    document.querySelectorAll(`#${id} input:not([type="hidden"]), #${id} select, #${id} textarea`)
      .forEach(el => { el.value = ''; });
    document.querySelectorAll(`#${id} input[type="checkbox"]`)
      .forEach(el => { el.checked = false; });
  }

  function _valor(id)        { return document.getElementById(id)?.value ?? ''; }
  function _setText(id, txt) { const el = document.getElementById(id); if (el) el.textContent = txt; }
  function _setBtnCarregando(btn, texto) { btn.textContent = texto; btn.disabled = true; }
  function _resetBtn(btn, texto)         { btn.textContent = texto; btn.disabled = false; }

  /* ── Inicialização ── */

  function init() {
    Auth.observar((usuario, perfil) => {
      if (usuario) {
        _mostrarApp(perfil, usuario);
      } else {
        _mostrarLogin();
      }
    });

    document.getElementById('btn-login')?.addEventListener('click', fazerLogin);
    document.getElementById('campo-senha')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') fazerLogin();
    });
  }

  function _mostrarApp(perfil, usuario) {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').style.display          = 'block';

    _setText('user-nome',  perfil?.nome  || usuario.email);
    _setText('user-setor', perfil?.setor || '—');
    _ajustarMenuPorSetor(perfil?.setor);

    Dashboard.iniciar();
    navegarPara('dashboard');
    _verificarQRCodeURL();
  }

  function _mostrarLogin() {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('app').style.display          = 'none';
    Dashboard.parar();
  }

  /* ── Login / Logout ── */

  async function fazerLogin() {
    const email = document.getElementById('campo-email').value.trim();
    const senha = document.getElementById('campo-senha').value;
    const errEl = document.getElementById('login-erro');

    errEl.textContent   = '';
    errEl.style.display = 'none';

    if (!email || !senha) {
      errEl.textContent   = 'Preencha e-mail e senha.';
      errEl.style.display = 'block';
      return;
    }

    const btn = document.getElementById('btn-login');
    _setBtnCarregando(btn, 'ENTRANDO...');

    try {
      await Auth.login(email, senha);
    } catch (e) {
      _resetBtn(btn, 'ENTRAR');

      const MSGS_ERRO = {
        'auth/user-not-found':     'Usuário não encontrado.',
        'auth/wrong-password':     'Senha incorreta.',
        'auth/invalid-email':      'E-mail inválido.',
        'auth/invalid-credential': 'E-mail ou senha incorretos.',
        'auth/too-many-requests':  'Muitas tentativas. Aguarde alguns minutos.',
      };
      errEl.textContent   = MSGS_ERRO[e.code] ?? 'E-mail ou senha incorretos.';
      errEl.style.display = 'block';

      const campoSenha = document.getElementById('campo-senha');
      campoSenha.style.borderColor = 'var(--red)';
      campoSenha.style.animation   = 'shakeInput 0.4s ease';
      setTimeout(() => {
        campoSenha.style.animation   = '';
        campoSenha.style.borderColor = '';
      }, 1500);
    }
  }

  async function fazerLogout() {
    await Auth.logout();
  }

  /* ── Navegação ── */

  function navegarPara(pagina) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

    document.getElementById(`page-${pagina}`)?.classList.add('active');
    document.querySelector(`[data-page="${pagina}"]`)?.classList.add('active');

    if (pagina === 'dashboard') Dashboard.renderizarDashboard();
    if (pagina === 'motores')   Dashboard.renderizarTabelaMotores();
    if (pagina === 'usuarios' && Auth.isAdmin()) _renderizarUsuarios();
    if (pagina === 'pecas')    Pecas.iniciar();
    if (pagina === 'relatorios') { /* dados carregados sob demanda */ }
  }

  function filtrarEIr(tipo, valor) {
    // Limpa todos os filtros
    ['filtro-busca','filtro-etapa','filtro-origem','filtro-prioridade','filtro-status','filtro-prazo']
      .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });

    const MAPA_FILTRO = {
      etapa:        { campo: 'filtro-etapa',      valor },
      em_andamento: { campo: 'filtro-status',     valor: 'em_andamento' },
      urgente:      { campo: 'filtro-prioridade', valor: 'urgente' },
      alerta:       { campo: 'filtro-prazo',      valor: 'alerta' },
    };

    const alvo = MAPA_FILTRO[tipo];
    if (alvo) {
      const el = document.getElementById(alvo.campo);
      if (el) el.value = alvo.valor;
    }

    navegarPara('motores');
  }

  function _ajustarMenuPorSetor(setor) {
    const elUsers = document.getElementById('menu-usuarios');
    if (elUsers) elUsers.style.display = setor === 'administracao' ? 'inline-block' : 'none';

    // Peças: admin e técnicos veem
    const elPecas = document.getElementById('menu-pecas');
    if (elPecas) elPecas.style.display = 'inline-block';

    // Relatórios: apenas admin
    const elRel = document.getElementById('menu-relatorios');
    if (elRel) elRel.style.display = setor === 'administracao' ? 'inline-block' : 'none';
  }

  /* ── Modal Cadastro de Chamado ── */

  function abrirCadastro() {
    _limparModal('modal-cadastro');
    document.getElementById('cad-dataentrada').value = new Date().toISOString().slice(0, 10);

    const sel = document.getElementById('cad-setororigem');
    if (sel && sel.options.length <= 1) {
      Motores.SETORES_ORIGEM.forEach(s => {
        const opt = new Option(s.label, s.id);
        sel.appendChild(opt);
      });
    }
    abrirModal('modal-cadastro');
  }

  async function salvarCadastro() {
    const dados = {
      tag:              _valor('cad-tag'),
      modelo:           _valor('cad-modelo'),
      potencia:         _valor('cad-potencia'),
      tensao:           _valor('cad-tensao'),
      rpm:              _valor('cad-rpm'),
      setorOrigem:      _valor('cad-setororigem'),
      localInstalacao:  _valor('cad-local'),
      problemaRelatado: _valor('cad-problema'),
      prioridade:       _valor('cad-prioridade'),
      dataEntrada:      _valor('cad-dataentrada'),
      prazoRetorno:     _valor('cad-prazo'),
    };

    if (!dados.modelo)           { Toast.aviso('Informe o Modelo do Motor.',               'Campo obrigatório'); return; }
    if (!dados.setorOrigem)      { Toast.aviso('Selecione o Setor de Origem.',             'Campo obrigatório'); return; }
    if (!dados.problemaRelatado) { Toast.aviso('Descreva o Problema Relatado.',            'Campo obrigatório'); return; }
    if (!dados.dataEntrada)      { Toast.aviso('Informe a Data de Entrada na Manutenção.', 'Campo obrigatório'); return; }

    const btn = document.getElementById('btn-salvar-cadastro');
    _setBtnCarregando(btn, 'Salvando...');
    try {
      const motor = await Motores.cadastrar(dados);
      fecharModal('modal-cadastro');
      Toast.sucesso(`Código: <strong>${motor.codigo}</strong>`, 'Chamado aberto!');
    } catch (e) {
      Toast.erro(`Erro ao abrir chamado: ${e.message}`);
    } finally {
      _resetBtn(btn, 'Abrir Chamado');
    }
  }

  /* ── Modal Detalhe ── */

  async function abrirDetalhe(motorId) {
    _motorAtualId = motorId;
    const motor = await Motores.buscarPorId(motorId);
    if (!motor) { Toast.erro('Chamado não encontrado.'); return; }

    _setText('modal-detalhe-titulo', motor.codigo);
    Dashboard.renderizarDetalhe(motor, 'modal-detalhe-body');
    abrirModal('modal-detalhe');

    const btnR = document.getElementById('btn-registrar-detalhe');
    if (btnR) {
      btnR.style.display = (Auth.podeEditar() && motor.status !== 'concluido')
        ? 'inline-block' : 'none';
    }
  }

  function abrirAcaoDeDetalhe() {
    if (!_motorAtualId) return;
    fecharModal('modal-detalhe');
    abrirAcao(_motorAtualId);
  }

  /* ── Modal Registrar Ação ── */

  async function abrirAcao(motorId) {
    _motorAtualId = motorId;
    const motor   = await Motores.buscarPorId(motorId);
    if (!motor) return;

    const etapa     = motor.etapaAtual;
    const etapaInfo = Motores.ETAPAS_MANUTENCAO.find(e => e.id === etapa);

    document.querySelectorAll('.acao-form').forEach(f => f.style.display = 'none');
    _limparModal('modal-acao');

    _setText('modal-acao-titulo', `Registrar: ${etapaInfo?.label ?? etapa}`);
    _setText('acao-etapa-atual',  etapaInfo?.label ?? etapa);

    const ETAPA_FORM = {
      entrada_manutencao: () => { _mostrarForm('form-avancar');      _preencherProximasEtapas(etapa); },
      analise_tecnica:    () => { _mostrarForm('form-diagnostico');                                   },
      diagnostico:        () => { _mostrarForm('form-avancar');      _preencherProximasEtapas(etapa); },
      aguardando_pecas:   () => { _mostrarForm('form-avancar');      _preencherProximasEtapas(etapa); },
      em_reparo:          () => { _mostrarForm('form-reparo');       _montarChecksTiposReparo();       },
      teste_final:        () => { _mostrarForm('form-teste');                                         },
    };

    const montar = ETAPA_FORM[etapa];
    if (montar) {
      montar();
    } else {
      _mostrarForm('form-avancar');
      _preencherProximasEtapas(etapa);
    }

    abrirModal('modal-acao');
  }

  function _mostrarForm(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'block';
  }

  function _preencherProximasEtapas(etapaAtual) {
    const sel = document.getElementById('avancar-proxima-etapa');
    if (!sel) return;
    sel.innerHTML = '<option value="">Selecione a próxima etapa...</option>';
    const idx = Motores.ETAPAS_MANUTENCAO.findIndex(e => e.id === etapaAtual);
    Motores.ETAPAS_MANUTENCAO.slice(idx + 1).forEach(e => {
      sel.appendChild(new Option(e.label, e.id));
    });
  }

  function _montarChecksTiposReparo() {
    const container = document.getElementById('tipos-reparo-checks');
    if (!container) return;
    container.innerHTML = '';
    Motores.TIPOS_REPARO.forEach(tipo => {
      const label = document.createElement('label');
      label.className = 'check-label';

      const input = document.createElement('input');
      input.type  = 'checkbox';
      input.value = tipo;

      const box = document.createElement('span');
      box.className = 'check-box';

      label.append(input, box, ` ${tipo}`);
      container.appendChild(label);
    });

    // Reseta tags de peças do reparo
    _repPecasSelecionadas = [];
    _renderizarTagsRepPecas();
    const buscaEl = document.getElementById('rep-pecas-resultados');
    if (buscaEl) buscaEl.innerHTML = '';
  }

  /* ── Seleção de peças no formulário de Reparo (tags) ── */

  let _repPecasSelecionadas = []; // [{ id, codigoPeca, nome, valor, qtd }]

  function _renderizarTagsRepPecas() {
    const container = document.getElementById('rep-pecas-tags');
    const vazioMsg  = document.getElementById('rep-pecas-vazio');
    const hiddenIds = document.getElementById('rep-pecas-ids');
    if (!container) return;

    if (!_repPecasSelecionadas.length) {
      container.innerHTML = '<span style="font-size:12px;color:var(--text2);" id="rep-pecas-vazio">Nenhuma peça adicionada ainda.</span>';
    } else {
      container.innerHTML = _repPecasSelecionadas.map((p, i) => `
        <span style="display:inline-flex;align-items:center;gap:6px;background:var(--surface);
                     border:1px solid var(--accent);border-radius:16px;padding:5px 10px 5px 12px;font-size:12px;">
          <span style="font-family:var(--mono);color:var(--accent);">${p.codigoPeca}</span>
          <span>${p.nome}</span>
          <span style="color:var(--text2);">×${p.qtd}</span>
          <button type="button" onclick="App._removerTagRepPeca(${i})"
            style="background:none;border:none;color:var(--text2);cursor:pointer;font-size:14px;line-height:1;padding:0 2px;">✕</button>
        </span>`).join('');
    }

    if (hiddenIds) hiddenIds.value = JSON.stringify(_repPecasSelecionadas);
  }

  function _removerTagRepPeca(indice) {
    _repPecasSelecionadas.splice(indice, 1);
    _renderizarTagsRepPecas();
  }

  async function buscarPecaParaReparo() {
    const texto = document.getElementById('rep-pecas-busca')?.value.trim();
    const resEl = document.getElementById('rep-pecas-resultados');
    if (!texto || !resEl) return;

    resEl.innerHTML = '<div style="font-size:12px;color:var(--text2);">Buscando...</div>';
    const lista = await Pecas.buscarPorTexto(texto);

    if (!lista.length) {
      resEl.innerHTML = '<div style="font-size:12px;color:var(--text2);">Nenhuma peça encontrada.</div>';
      return;
    }

    resEl.innerHTML = lista.slice(0, 8).map(p => `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;
                  background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:8px 10px;flex-wrap:wrap;">
        <span style="font-size:12px;">
          <span style="font-family:var(--mono);color:var(--accent);">${p.codigoPeca}</span>
          &nbsp;${p.nome}
          <span style="color:var(--text2);">— Estoque: ${p.estoque}</span>
        </span>
        ${p.estoque > 0
          ? `<button type="button" class="action-btn" onclick='App._adicionarTagRepPeca(${JSON.stringify(p).replace(/'/g, "&#39;")})'>+ Adicionar</button>`
          : '<span style="font-size:11px;color:var(--red);">Sem estoque</span>'}
      </div>`).join('');
  }

  function _adicionarTagRepPeca(peca) {
    const jaExiste = _repPecasSelecionadas.find(p => p.id === peca.id);
    if (jaExiste) {
      if (jaExiste.qtd < peca.estoque) jaExiste.qtd++;
      else Toast.aviso('Estoque insuficiente para adicionar mais unidades.', 'Atenção');
    } else {
      _repPecasSelecionadas.push({
        id: peca.id, codigoPeca: peca.codigoPeca, nome: peca.nome,
        valor: peca.valor, qtd: 1, estoqueDisponivel: peca.estoque,
      });
    }
    _renderizarTagsRepPecas();
    document.getElementById('rep-pecas-busca').value = '';
    document.getElementById('rep-pecas-resultados').innerHTML = '';
  }

  /* Chamado pelo QRScanner quando o modo é 'peca_reparo' */
  function _adicionarPecaViaScanner(peca) {
    _adicionarTagRepPeca(peca);
  }

  async function salvarAcao() {
    const motor = await Motores.buscarPorId(_motorAtualId);
    if (!motor) return;

    const btn = document.getElementById('btn-salvar-acao');
    _setBtnCarregando(btn, 'Salvando...');

    try {
      await _executarAcaoPorEtapa(motor.etapaAtual);
      fecharModal('modal-acao');
      Toast.sucesso('Etapa registrada com sucesso!', 'Atualizado');
    } catch (e) {
      if (e.message !== '_validation') Toast.erro(`Erro ao salvar: ${e.message}`);
    } finally {
      _resetBtn(btn, 'Salvar');
    }
  }

  async function _executarAcaoPorEtapa(etapa) {
    if (etapa === 'analise_tecnica') {
      const dados = {
        causaRaiz:              _valor('diag-causa'),
        tipoFalha:              _valor('diag-tipo'),
        necessitaReparo:        _valor('diag-necessita') === 'sim',
        pecasNecessarias:       _valor('diag-pecas'),
        estimativaDias:         _valor('diag-estimativa'),
        resistenciaIsolamento:  _valor('diag-ri'),
        resistenciaEnrolamento: _valor('diag-re'),
        corrente:               _valor('diag-corrente'),
        temperatura:            _valor('diag-temp'),
        vibracao:               _valor('diag-vib'),
        unidadeVib:             _valor('diag-unidade'),
        obsMedicoes:            _valor('diag-obs'),
      };
      if (!dados.causaRaiz)          { Toast.aviso('Informe a Causa Raiz do problema.',  'Campo obrigatório'); throw new Error('_validation'); }
      if (!dados.tipoFalha)          { Toast.aviso('Selecione o Tipo de Falha.',          'Campo obrigatório'); throw new Error('_validation'); }
      if (!_valor('diag-necessita')) { Toast.aviso('Informe se necessita reparo.',        'Campo obrigatório'); throw new Error('_validation'); }

      await Motores.registrarDiagnostico(_motorAtualId, dados);
      await Motores.avancarEtapa(_motorAtualId, 'diagnostico', `Diagnóstico concluído: ${dados.causaRaiz}`);

    } else if (etapa === 'em_reparo') {
      const checks = [...document.querySelectorAll('#tipos-reparo-checks input:checked')].map(c => c.value);
      const dados  = {
        tiposIntervencao: checks,
        descricaoServico: _valor('rep-descricao'),
        pecasUtilizadas:  _repPecasSelecionadas.map(p => `${p.qtd}x ${p.nome} (${p.codigoPeca})`).join(', '),
      };
      if (!dados.descricaoServico) { Toast.aviso('Descreva o Serviço Executado.', 'Campo obrigatório'); throw new Error('_validation'); }

      await Motores.registrarReparo(_motorAtualId, dados);

      // Lança cada peça selecionada no orçamento da OS (dá baixa de estoque automaticamente)
      if (_repPecasSelecionadas.length) {
        const orc = await Orcamento.obterOuCriar(_motorAtualId);
        for (const p of _repPecasSelecionadas) {
          await Orcamento.adicionarPeca(orc.id, p, p.qtd);
        }
      }

      await Motores.avancarEtapa(_motorAtualId, 'teste_final', 'Reparo concluído. Motor encaminhado para teste final.');
      _repPecasSelecionadas = [];

    } else if (etapa === 'teste_final') {
      const dados = {
        resultado:   _valor('teste-resultado'),
        vibracao:    _valor('teste-vib'),
        unidadeVib:  _valor('teste-unidade'),
        temperatura: _valor('teste-temp'),
        corrente:    _valor('teste-corrente'),
        observacoes: _valor('teste-obs'),
      };
      if (!dados.resultado) { Toast.aviso('Selecione o Resultado do teste final.', 'Campo obrigatório'); throw new Error('_validation'); }

      await Motores.registrarTesteFinal(_motorAtualId, dados);

    } else {
      const novaEtapa = _valor('avancar-proxima-etapa');
      const obs       = _valor('avancar-obs');
      if (!novaEtapa) { Toast.aviso('Selecione a próxima etapa.', 'Campo obrigatório'); throw new Error('_validation'); }

      await Motores.avancarEtapa(_motorAtualId, novaEtapa, obs);
    }
  }

  /* ── Peças ── */

  function abrirCadastrarPeca() {
    document.querySelectorAll('#modal-peca input, #modal-peca select, #modal-peca textarea')
      .forEach(el => { el.value = ''; });
    document.getElementById('peca-codigo').value = Pecas.gerarCodigoPeca();
    abrirModal('modal-peca');
  }

  async function salvarPeca() {
    const dados = {
      codigoPeca:  document.getElementById('peca-codigo')?.value.trim(),
      nome:        document.getElementById('peca-nome')?.value.trim(),
      categoria:   document.getElementById('peca-categoria')?.value,
      fabricante:  document.getElementById('peca-fabricante')?.value.trim(),
      descricao:   document.getElementById('peca-descricao')?.value.trim(),
      valor:       document.getElementById('peca-valor')?.value,
      estoque:     document.getElementById('peca-estoque')?.value,
      estoqueMin:  document.getElementById('peca-estoque-min')?.value,
      localizacao: document.getElementById('peca-localizacao')?.value.trim(),
    };

    if (!dados.nome)    { Toast.aviso('Informe o Nome da Peça.', 'Campo obrigatório'); return; }
    if (!dados.valor)   { Toast.aviso('Informe o Valor Unitário.', 'Campo obrigatório'); return; }

    const btn = document.getElementById('btn-salvar-peca');
    _setBtnCarregando(btn, 'Salvando...');
    try {
      const peca = await Pecas.cadastrar(dados);
      fecharModal('modal-peca');
      Toast.sucesso(`Peça <strong>${peca.codigoPeca}</strong> cadastrada!`, 'Peça cadastrada');
      // Gera e salva QR no Firestore (URL do código)
      _salvarQRPeca(peca.id, peca.codigoPeca);
    } catch (e) {
      Toast.erro(`Erro: ${e.message}`);
    } finally {
      _resetBtn(btn, 'Cadastrar Peça');
    }
  }

  function _salvarQRPeca(pecaId, codigoPeca) {
    // Salva a URL como qrCodeURL no Firestore (o QR renderiza o código)
    const url = `${location.origin}${location.pathname}?peca=${codigoPeca}`;
    db.collection('pecas').doc(pecaId).update({ qrCodeURL: url }).catch(() => {});
  }

  async function abrirDetalhe_Peca(pecaId) {
    const peca = await Pecas.buscarPorId(pecaId);
    if (!peca) { Toast.erro('Peça não encontrada.'); return; }

    document.getElementById('modal-peca-detalhe-titulo').textContent = `${peca.codigoPeca} — ${peca.nome}`;

    const body = document.getElementById('modal-peca-detalhe-body');
    body.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px 20px;font-size:13px;margin-bottom:16px;">
        <div><span style="color:var(--text2);font-size:11px;">CÓDIGO</span><br>
          <strong style="font-family:var(--mono);color:var(--accent);">${peca.codigoPeca}</strong></div>
        <div><span style="color:var(--text2);font-size:11px;">NOME</span><br><strong>${peca.nome}</strong></div>
        <div><span style="color:var(--text2);font-size:11px;">CATEGORIA</span><br>${peca.categoria || '—'}</div>
        <div><span style="color:var(--text2);font-size:11px;">FABRICANTE</span><br>${peca.fabricante || '—'}</div>
        <div><span style="color:var(--text2);font-size:11px;">VALOR UNITÁRIO</span><br>
          <strong style="font-family:var(--mono);">${Pecas.formatarMoeda(peca.valor)}</strong></div>
        <div><span style="color:var(--text2);font-size:11px;">ESTOQUE</span><br>
          <strong style="color:${peca.estoque === 0 ? 'var(--red)' : 'inherit'};">${peca.estoque ?? 0} un.</strong></div>
        <div><span style="color:var(--text2);font-size:11px;">ESTOQUE MÍN.</span><br>${peca.estoqueMin ?? 0} un.</div>
        <div><span style="color:var(--text2);font-size:11px;">LOCALIZAÇÃO</span><br>${peca.localizacao || '—'}</div>
      </div>
      ${peca.descricao ? `<div style="background:var(--surface2);border-radius:8px;padding:12px;font-size:12px;color:var(--text2);">${peca.descricao}</div>` : ''}
      <div style="margin-top:16px;" id="qr-peca-container-${pecaId}"></div>`;

    // Gera QR no modal
    setTimeout(() => {
      const qrEl = document.getElementById(`qr-peca-container-${pecaId}`);
      if (qrEl && typeof QRCode === 'function') {
        qrEl.innerHTML = '';
        new QRCode(qrEl, {
          text: peca.codigoPeca,
          width: 128, height: 128,
          colorDark: '#000000', colorLight: '#ffffff',
        });
      }
    }, 100);

    if (Auth.isAdmin()) {
      const btnEdit = document.getElementById('btn-editar-peca-detalhe');
      if (btnEdit) {
        btnEdit.style.display = 'inline-flex';
        btnEdit.onclick = () => { fecharModal('modal-peca-detalhe'); abrirEditarPeca(pecaId); };
      }
    }

    const btnQR = document.getElementById('btn-qr-peca-detalhe');
    if (btnQR) btnQR.onclick = () => imprimirQRPeca(pecaId, peca.codigoPeca);

    abrirModal('modal-peca-detalhe');
  }

  async function abrirEditarPeca(pecaId) {
    const peca = await Pecas.buscarPorId(pecaId);
    if (!peca) { Toast.erro('Peça não encontrada.'); return; }

    document.getElementById('edit-peca-id').value            = pecaId;
    document.getElementById('edit-peca-nome').value          = peca.nome || '';
    document.getElementById('edit-peca-categoria').value     = peca.categoria || '';
    document.getElementById('edit-peca-fabricante').value    = peca.fabricante || '';
    document.getElementById('edit-peca-descricao').value     = peca.descricao || '';
    document.getElementById('edit-peca-valor').value         = peca.valor || '';
    document.getElementById('edit-peca-estoque-min').value   = peca.estoqueMin || '';
    document.getElementById('edit-peca-localizacao').value   = peca.localizacao || '';

    abrirModal('modal-editar-peca');
  }

  async function salvarEdicaoPeca() {
    const pecaId = document.getElementById('edit-peca-id')?.value;
    const dados = {
      nome:        document.getElementById('edit-peca-nome')?.value.trim(),
      categoria:   document.getElementById('edit-peca-categoria')?.value,
      fabricante:  document.getElementById('edit-peca-fabricante')?.value.trim(),
      descricao:   document.getElementById('edit-peca-descricao')?.value.trim(),
      valor:       document.getElementById('edit-peca-valor')?.value,
      estoqueMin:  document.getElementById('edit-peca-estoque-min')?.value,
      localizacao: document.getElementById('edit-peca-localizacao')?.value.trim(),
    };

    if (!dados.nome) { Toast.aviso('Informe o Nome.', 'Campo obrigatório'); return; }

    const btn = document.getElementById('btn-salvar-editar-peca');
    _setBtnCarregando(btn, 'Salvando...');
    try {
      await Pecas.atualizar(pecaId, dados);
      fecharModal('modal-editar-peca');
      Toast.sucesso('Peça atualizada com sucesso!', 'Salvo');
    } catch (e) {
      Toast.erro(`Erro: ${e.message}`);
    } finally {
      _resetBtn(btn, 'Salvar Alterações');
    }
  }

  function imprimirQRPeca(pecaId, codigoPeca) {
    const W = 1536, H = 2048;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    const pad = Math.round(W * 0.035);
    ctx.strokeStyle = '#cccccc';
    ctx.lineWidth   = Math.round(W * 0.005);
    _roundRect(ctx, pad, pad, W - pad * 2, H - pad * 2, Math.round(W * 0.035));
    ctx.stroke();

    ctx.fillStyle    = '#888888';
    ctx.font         = `700 ${Math.round(W * 0.033)}px Arial`;
    ctx.textAlign    = 'center';
    ctx.fillText('MOTORTRACK — PEÇA', W / 2, Math.round(H * 0.1));

    ctx.fillStyle    = '#111111';
    ctx.font         = `900 ${Math.round(W * 0.058)}px monospace`;
    ctx.fillText(codigoPeca, W / 2, Math.round(H * 0.16));

    // Gera QR via QRCode.js em canvas temporário
    const tmpDiv = document.createElement('div');
    tmpDiv.style.display = 'none';
    document.body.appendChild(tmpDiv);

    const qrSize = Math.round(W * 0.75);
    const qrX    = (W - qrSize) / 2;
    const qrY    = Math.round(H * 0.21);

    if (typeof QRCode === 'function') {
      new QRCode(tmpDiv, {
        text: codigoPeca,
        width: qrSize, height: qrSize,
        colorDark: '#000000', colorLight: '#ffffff',
      });
      setTimeout(() => {
        const qrCanvas = tmpDiv.querySelector('canvas');
        if (qrCanvas) {
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);
        }
        document.body.removeChild(tmpDiv);
        _abrirJanelaImpressao(cv, codigoPeca);
      }, 300);
    } else {
      document.body.removeChild(tmpDiv);
      _abrirJanelaImpressao(cv, codigoPeca);
    }
  }

  /* ── Orçamento (aba dentro do chamado) ── */

  async function _renderizarOrcamento(motorId, container) {
    container.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text2);">Carregando orçamento...</div>';
    try {
      const orc = await Orcamento.obterOuCriar(motorId);

      const itensHTML = (orc.itens || []).length
        ? `<table style="width:100%;border-collapse:collapse;margin-top:12px;">
            <thead><tr>
              <th style="text-align:left;padding:8px;font-size:10px;letter-spacing:1px;border-bottom:1px solid var(--border);">CÓDIGO</th>
              <th style="text-align:left;padding:8px;font-size:10px;letter-spacing:1px;border-bottom:1px solid var(--border);">PEÇA</th>
              <th style="text-align:right;padding:8px;font-size:10px;letter-spacing:1px;border-bottom:1px solid var(--border);">QTD</th>
              <th style="text-align:right;padding:8px;font-size:10px;letter-spacing:1px;border-bottom:1px solid var(--border);">UNIT.</th>
              <th style="text-align:right;padding:8px;font-size:10px;letter-spacing:1px;border-bottom:1px solid var(--border);">SUBTOTAL</th>
              ${Auth.podeEditar() ? '<th style="padding:8px;border-bottom:1px solid var(--border);"></th>' : ''}
            </tr></thead>
            <tbody>
              ${orc.itens.map((item, i) => `<tr>
                <td style="padding:8px;font-family:var(--mono);font-size:12px;color:var(--accent);">${item.codigoPeca}</td>
                <td style="padding:8px;font-size:13px;">${item.nomePeca}</td>
                <td style="padding:8px;text-align:right;font-weight:700;">${item.quantidade}</td>
                <td style="padding:8px;text-align:right;font-family:var(--mono);">${Pecas.formatarMoeda(item.valorUnitario)}</td>
                <td style="padding:8px;text-align:right;font-family:var(--mono);font-weight:600;">${Pecas.formatarMoeda(item.subtotal)}</td>
                ${Auth.podeEditar() ? `<td style="padding:8px;"><button class="action-btn" style="color:var(--red);" onclick="App.removerItemOrcamento('${orc.id}',${i})">✕</button></td>` : ''}
              </tr>`).join('')}
            </tbody>
          </table>`
        : '<div style="color:var(--text2);font-size:13px;padding:12px 0;">Nenhuma peça adicionada ao orçamento.</div>';

      container.innerHTML = `
        <div id="orcamento-body">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
            <div style="font-size:11px;font-family:var(--mono);color:var(--text2);">OS: ${orc.codigoOS} &nbsp;|&nbsp; ${orc.status === 'em_aberto' ? 'Em aberto' : 'Concluído'}</div>
            ${Auth.podeEditar() ? `<div style="display:flex;gap:8px;flex-wrap:wrap;">
              <button class="btn-secondary" onclick="App.abrirScannerQR('peca','${orc.id}')">📷 Ler QR da Peça</button>
              <button class="btn-secondary" onclick="App.abrirBuscarPeca('${orc.id}')">🔍 Buscar Peça</button>
            </div>` : ''}
          </div>

          ${itensHTML}

          <div style="margin-top:16px;border-top:1px solid var(--border);padding-top:16px;">
            ${Auth.podeEditar() ? `<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
              <label style="font-size:12px;color:var(--text2);">Mão de obra (R$):</label>
              <input type="number" id="campo-mao-obra" value="${orc.maoDeObra || 0}" min="0" step="0.01"
                style="width:140px;padding:6px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text);font-family:var(--mono);">
              <button class="action-btn" onclick="App.salvarMaoDeObra('${orc.id}')">Salvar</button>
            </div>` : ''}
            <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:14px;max-width:280px;margin-left:auto;">
              <div style="display:flex;justify-content:space-between;font-size:13px;padding:3px 0;">
                <span style="color:var(--text2);">Total Peças</span>
                <span style="font-family:var(--mono);">${Pecas.formatarMoeda(orc.totalPecas)}</span>
              </div>
              <div style="display:flex;justify-content:space-between;font-size:13px;padding:3px 0;">
                <span style="color:var(--text2);">Mão de Obra</span>
                <span style="font-family:var(--mono);">${Pecas.formatarMoeda(orc.maoDeObra)}</span>
              </div>
              <div style="display:flex;justify-content:space-between;font-size:15px;font-weight:700;padding:8px 0 3px;border-top:1px solid var(--border);margin-top:6px;">
                <span>Total Geral</span>
                <span style="font-family:var(--mono);">${Pecas.formatarMoeda(orc.totalGeral)}</span>
              </div>
            </div>
          </div>

          <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;">
            <button class="btn-secondary" onclick="App.imprimirOrcamento('${orc.id}','${motorId}')">🖨️ Imprimir Orçamento</button>
          </div>
        </div>`;
    } catch (e) {
      container.innerHTML = `<p style="color:var(--red);">Erro ao carregar orçamento: ${e.message}</p>`;
    }
  }

  async function removerItemOrcamento(orcId, indice) {
    try {
      await Orcamento.removerItem(orcId, indice);
      Toast.sucesso('Item removido do orçamento.', 'Removido');
      const orcBody = document.getElementById('orcamento-body');
      if (orcBody && _motorAtualId) _renderizarOrcamento(_motorAtualId, orcBody.parentElement);
    } catch (e) {
      Toast.erro(`Erro: ${e.message}`);
    }
  }

  async function salvarMaoDeObra(orcId) {
    const val = parseFloat(document.getElementById('campo-mao-obra')?.value || '0');
    try {
      await Orcamento.atualizarMaoDeObra(orcId, val);
      Toast.sucesso('Mão de obra atualizada!', 'Salvo');
      atualizarOrcamento();
    } catch (e) {
      Toast.erro(`Erro: ${e.message}`);
    }
  }

  async function imprimirOrcamento(orcId, motorId) {
    const [orc, motorDoc] = await Promise.all([
      Orcamento.buscarPorId(orcId),
      Motores.buscarPorId(motorId),
    ]);
    if (orc) Orcamento.imprimir(orc, motorDoc);
  }

  /* ── Busca de peça por texto para adicionar ao orçamento ── */

  function abrirBuscarPeca(orcId) {
    document.getElementById('buscar-peca-orcid').value = orcId;
    document.getElementById('buscar-peca-input').value = '';
    document.getElementById('buscar-peca-resultados').innerHTML = '';
    abrirModal('modal-buscar-peca');
  }

  async function executarBuscaPeca() {
    const texto   = document.getElementById('buscar-peca-input')?.value.trim();
    const orcId   = document.getElementById('buscar-peca-orcid')?.value;
    const resEl   = document.getElementById('buscar-peca-resultados');
    if (!texto || !resEl) return;

    resEl.innerHTML = '<div style="color:var(--text2);font-size:12px;">Buscando...</div>';
    const lista = await Pecas.buscarPorTexto(texto);

    if (!lista.length) {
      resEl.innerHTML = '<div style="color:var(--text2);font-size:12px;">Nenhuma peça encontrada.</div>';
      return;
    }

    resEl.innerHTML = lista.map(p => `
      <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:10px 12px;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
        <div>
          <span style="font-family:var(--mono);color:var(--accent);font-size:12px;">${p.codigoPeca}</span>
          <span style="font-weight:600;font-size:13px;margin-left:8px;">${p.nome}</span>
          <span style="color:var(--text2);font-size:11px;margin-left:6px;">${Pecas.formatarMoeda(p.valor)} | Estoque: ${p.estoque}</span>
        </div>
        ${p.estoque > 0
          ? `<button class="btn-success" style="font-size:12px;padding:6px 12px;"
              onclick="App._adicionarPecaAoOrc('${p.id}','${orcId}')">+ Adicionar</button>`
          : '<span style="font-size:11px;color:var(--red);">Sem estoque</span>'}
      </div>`).join('');
  }

  async function _adicionarPecaAoOrc(pecaId, orcId) {
    const peca = await Pecas.buscarPorId(pecaId);
    if (!peca) return;
    const qtdStr = prompt(`Quantidade de "${peca.nome}" (disponível: ${peca.estoque}):`, '1');
    if (qtdStr === null) return;
    const qtd = parseInt(qtdStr, 10);
    if (!qtd || qtd <= 0 || qtd > peca.estoque) {
      Toast.aviso('Quantidade inválida ou estoque insuficiente.', 'Atenção');
      return;
    }
    try {
      await Orcamento.adicionarPeca(orcId, peca, qtd);
      Toast.sucesso(`${qtd}x ${peca.nome} adicionada!`, 'Adicionado');
      fecharModal('modal-buscar-peca');
      atualizarOrcamento();
    } catch (e) {
      Toast.erro(`Erro: ${e.message}`);
    }
  }

  function abrirCriarUsuario() {
    _limparModal('modal-usuario');
    abrirModal('modal-usuario');
  }

  async function salvarUsuario() {
    const email = _valor('usr-email');
    const senha = _valor('usr-senha');
    const nome  = _valor('usr-nome');
    const setor = _valor('usr-setor');

    if (!nome)            { Toast.aviso('Informe o Nome Completo.',                 'Campo obrigatório'); return; }
    if (!email)           { Toast.aviso('Informe o E-mail.',                        'Campo obrigatório'); return; }
    if (!senha)           { Toast.aviso('Defina uma Senha.',                        'Campo obrigatório'); return; }
    if (!setor)           { Toast.aviso('Selecione o Setor / Perfil.',              'Campo obrigatório'); return; }
    if (senha.length < 6) { Toast.aviso('A senha deve ter ao menos 6 caracteres.', 'Senha fraca');       return; }

    const btn = document.getElementById('btn-salvar-usuario');
    _setBtnCarregando(btn, 'Criando...');
    try {
      await Auth.criarUsuario(email, senha, nome, setor);
      fecharModal('modal-usuario');
      Toast.sucesso(`Usuário <strong>${nome}</strong> criado!`, 'Usuário criado');
    } catch (e) {
      if (e.message !== 'Operação cancelada pelo administrador.') {
        Toast.erro(`Erro ao criar usuário: ${e.message}`);
      }
    } finally {
      _resetBtn(btn, 'Criar Usuário');
    }
  }

  async function _renderizarUsuarios() {
    const tbody = document.getElementById('tbody-usuarios');
    if (!tbody) return;
    try {
      const snap = await db.collection('usuarios').get();
      tbody.innerHTML = snap.docs.map(d => {
        const u          = d.data();
        const dadosEnc   = encodeURIComponent(JSON.stringify({
          nome: u.nome ?? '', email: u.email ?? '', setor: u.setor ?? '',
        }));
        return `<tr>
          <td data-label="Nome">${u.nome || '—'}</td>
          <td data-label="E-mail" style="font-family:var(--mono);font-size:12px;">${u.email || '—'}</td>
          <td data-label="Setor">
            <span class="setor-badge" style="border-color:var(--border);color:var(--text2);">${u.setor || '—'}</span>
          </td>
          <td data-label="Ações">
            <button class="action-btn"
              onclick="App.abrirEditarUsuario('${d.id}','${dadosEnc}')">Editar</button>
          </td>
        </tr>`;
      }).join('');
    } catch (e) {
      console.warn('Sem permissão para listar usuários:', e.message);
    }
  }

  function abrirEditarUsuario(uid, dadosEncodado) {
    const u = JSON.parse(decodeURIComponent(dadosEncodado));
    document.getElementById('edit-usr-uid').value   = uid;
    document.getElementById('edit-usr-nome').value  = u.nome  ?? '';
    document.getElementById('edit-usr-email').value = u.email ?? '';
    document.getElementById('edit-usr-setor').value = u.setor ?? '';
    document.getElementById('edit-usr-senha').value = '';
    document.getElementById('edit-usr-erro').style.display = 'none';

    const btnDel = document.getElementById('btn-deletar-usuario');
    if (btnDel) btnDel.style.display = Auth.isAdmin() ? 'inline-flex' : 'none';

    abrirModal('modal-editar-usuario');
  }

  async function salvarEdicaoUsuario() {
    const uid   = _valor('edit-usr-uid');
    const nome  = _valor('edit-usr-nome').trim();
    const email = _valor('edit-usr-email').trim();
    const senha = _valor('edit-usr-senha');
    const setor = _valor('edit-usr-setor');

    if (!nome)  { Toast.aviso('Informe o Nome.',   'Campo obrigatório'); return; }
    if (!email) { Toast.aviso('Informe o E-mail.', 'Campo obrigatório'); return; }
    if (!setor) { Toast.aviso('Selecione o Setor.','Campo obrigatório'); return; }
    if (senha && senha.length < 6) {
      Toast.aviso('A senha deve ter ao menos 6 caracteres.', 'Senha fraca');
      return;
    }

    const btn = document.getElementById('btn-salvar-editar-usuario');
    _setBtnCarregando(btn, 'Salvando...');
    try {
      await db.collection('usuarios').doc(uid).update({ nome, email, setor });
      fecharModal('modal-editar-usuario');
      Toast.sucesso(`Usuário <strong>${nome}</strong> atualizado!`, 'Dados salvos');
      _renderizarUsuarios();
    } catch (e) {
      Toast.erro(`Erro ao salvar: ${e.message}`);
    } finally {
      _resetBtn(btn, 'Salvar Alterações');
    }
  }

  function pedirExcluirUsuario() {
    if (!Auth.isAdmin()) { Toast.erro('Apenas administradores podem excluir usuários.'); return; }
    const uid  = _valor('edit-usr-uid');
    const nome = document.getElementById('edit-usr-nome')?.value || 'este usuário';
    document.getElementById('excluir-usr-uid').value        = uid;
    document.getElementById('excluir-usr-nome-label').textContent = nome;
    fecharModal('modal-editar-usuario');
    abrirModal('modal-confirmar-exclusao');
  }

  async function confirmarExcluirUsuario() {
    const uid = _valor('excluir-usr-uid');
    if (!uid) return;
    const btn = document.getElementById('btn-confirmar-exclusao');
    _setBtnCarregando(btn, 'Excluindo...');
    try {
      await db.collection('usuarios').doc(uid).delete();
      fecharModal('modal-confirmar-exclusao');
      Toast.sucesso('Usuário removido do sistema.', 'Excluído');
      _renderizarUsuarios();
    } catch (e) {
      Toast.erro(`Erro ao excluir: ${e.message}`);
    } finally {
      _resetBtn(btn, 'Excluir Usuário');
    }
  }

  /* ── QR Code ── */

  function abrirScannerQR(modo, orcId) { QRScanner.abrir(modo || 'motor', orcId || null); }
  function fecharScannerQR() { QRScanner.fechar(); }
  function reiniciarScannerQR() { QRScanner.reiniciar(); }

  function atualizarOrcamento() {
    // Recarrega aba de orçamento se estiver aberta
    const orcBody = document.getElementById('orcamento-body');
    if (orcBody && _motorAtualId) {
      _renderizarOrcamento(_motorAtualId, orcBody);
    }
  }

  function _verificarQRCodeURL() {
    const codigo = new URLSearchParams(location.search).get('motor');
    if (codigo) {
      Motores.buscarPorCodigo(codigo).then(m => { if (m) abrirDetalhe(m.id); });
    }
  }

  /* ── Impressão de QR Code ── */

  function imprimirQRCode(motorId, motorCodigo) {
    const container = document.getElementById(`qrcode-container-${motorId}`);
    let qrImg = null;

    if (container) {
      const canvas = container.querySelector('canvas');
      const img    = container.querySelector('img');
      if (canvas) {
        const i = new Image(); i.src = canvas.toDataURL('image/png'); qrImg = i;
      } else if (img) {
        qrImg = img;
      }
    }

    function _gerarEAbrir(imgEl) {
      const W = 1536, H = 2048;
      const cv  = document.createElement('canvas');
      cv.width  = W; cv.height = H;
      const ctx = cv.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Fundo branco
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);

      // Borda arredondada
      const pad = Math.round(W * 0.035);
      ctx.strokeStyle = '#cccccc';
      ctx.lineWidth   = Math.round(W * 0.005);
      _roundRect(ctx, pad, pad, W - pad * 2, H - pad * 2, Math.round(W * 0.035));
      ctx.stroke();

      // Cabeçalho
      ctx.fillStyle    = '#888888';
      ctx.font         = `700 ${Math.round(W * 0.033)}px Arial`;
      ctx.letterSpacing= `${Math.round(W * 0.006)}px`;
      ctx.textAlign    = 'center';
      ctx.fillText('MOTORTRACK — QR CODE', W / 2, Math.round(H * 0.1));

      // Código
      ctx.fillStyle    = '#111111';
      ctx.font         = `900 ${Math.round(W * 0.058)}px monospace`;
      ctx.letterSpacing= `${Math.round(W * 0.003)}px`;
      ctx.fillText(motorCodigo, W / 2, Math.round(H * 0.16));

      // Imagem QR
      const qrSize = Math.round(W * 0.75);
      const qrX    = (W - qrSize) / 2;
      const qrY    = Math.round(H * 0.21);

      if (imgEl) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(imgEl, qrX, qrY, qrSize, qrSize);
        ctx.imageSmoothingEnabled = true;
      } else {
        ctx.fillStyle = '#eeeeee';
        ctx.fillRect(qrX, qrY, qrSize, qrSize);
        ctx.fillStyle = '#aaaaaa';
        ctx.font      = `${Math.round(W * 0.03)}px Arial`;
        ctx.fillText('QR não disponível', W / 2, qrY + qrSize / 2);
      }

      // Separador
      const sepY = Math.round(H * 0.86);
      ctx.strokeStyle = '#eeeeee';
      ctx.lineWidth   = Math.round(W * 0.002);
      ctx.beginPath();
      ctx.moveTo(pad + Math.round(W * 0.04), sepY);
      ctx.lineTo(W - pad - Math.round(W * 0.04), sepY);
      ctx.stroke();

      // Rodapé (logo ou texto)
      const logoImg = new Image();
      logoImg.onload = () => {
        const maxW = Math.round(W * 0.5), maxH = Math.round(H * 0.08);
        let lw = logoImg.width, lh = logoImg.height;
        const sc = Math.min(maxW / lw, maxH / lh);
        lw *= sc; lh *= sc;
        ctx.drawImage(logoImg, (W - lw) / 2, sepY + Math.round((H - sepY - lh) / 2), lw, lh);
        _abrirJanelaImpressao(cv, motorCodigo);
      };
      logoImg.onerror = () => {
        ctx.fillStyle    = '#f0a500';
        ctx.font         = `700 ${Math.round(W * 0.045)}px Arial`;
        ctx.letterSpacing= `${Math.round(W * 0.003)}px`;
        ctx.textAlign    = 'center';
        ctx.fillText('⚙ MotorTrack', W / 2, sepY + Math.round((H - sepY) * 0.5));
        ctx.fillStyle = '#aaaaaa';
        ctx.font      = `${Math.round(W * 0.028)}px Arial`;
        ctx.fillText('Manutenção Industrial', W / 2, sepY + Math.round((H - sepY) * 0.75));
        _abrirJanelaImpressao(cv, motorCodigo);
      };
      logoImg.src = '../logo.png';
    }

    if (qrImg && !qrImg.complete) {
      qrImg.onload = () => _gerarEAbrir(qrImg);
    } else {
      _gerarEAbrir(qrImg);
    }
  }

  function _abrirJanelaImpressao(canvas, codigo) {
    const dataUrl = canvas.toDataURL('image/png');
    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>QR Code — ${codigo}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:Arial,sans-serif;background:#f5f5f5;display:flex;flex-direction:column;
      align-items:center;justify-content:center;min-height:100vh;gap:20px;padding:24px}
    img.card{max-width:420px;width:100%;border-radius:14px;box-shadow:0 4px 24px rgba(0,0,0,.12)}
    .btns{display:flex;gap:12px}
    .btn{padding:11px 26px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;border:none}
    .btn-print{background:#111;color:#fff}
    .btn-dl{background:#f0a500;color:#fff}
    .btn:hover{opacity:.85}
    @media print{.btns{display:none}body{background:#fff;padding:0}}
  </style>
</head>
<body>
  <img class="card" id="card" src="${dataUrl}" alt="QR Code ${codigo}">
  <div class="btns">
    <button class="btn btn-print" onclick="window.print()">🖨️ Imprimir</button>
    <button class="btn btn-dl" onclick="dl()">⬇ Baixar PNG</button>
  </div>
  <script>
    function dl(){
      const a=document.createElement('a');
      a.href=document.getElementById('card').src;
      a.download='QR-${codigo}.png';
      a.click();
    }
  <\/script>
</body>
</html>`);
    win.document.close();
  }

  function _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  /* ── API Pública ── */
  return {
    init,
    fazerLogout,
    navegarPara,
    filtrarEIr,
    abrirCadastro,
    salvarCadastro,
    abrirDetalhe,
    abrirAcaoDeDetalhe,
    abrirAcao,
    salvarAcao,
    abrirCriarUsuario,
    salvarUsuario,
    abrirEditarUsuario,
    salvarEdicaoUsuario,
    pedirExcluirUsuario,
    confirmarExcluirUsuario,
    abrirScannerQR,
    fecharScannerQR,
    reiniciarScannerQR,
    imprimirQRCode,
    fecharModal,
    abrirModal,
    // Peças
    abrirCadastrarPeca,
    salvarPeca,
    abrirDetalhe_Peca,
    abrirEditarPeca,
    salvarEdicaoPeca,
    imprimirQRPeca,
    // Orçamento
    atualizarOrcamento,
    removerItemOrcamento,
    salvarMaoDeObra,
    imprimirOrcamento,
    abrirBuscarPeca,
    executarBuscaPeca,
    _adicionarPecaAoOrc,
    _renderizarOrcamento,
    // Tags de peças no reparo
    buscarPecaParaReparo,
    _adicionarTagRepPeca,
    _removerTagRepPeca,
    _adicionarPecaViaScanner,
  };
})();

document.addEventListener('DOMContentLoaded', () => App.init());
