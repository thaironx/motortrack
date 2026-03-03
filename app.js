const Toast = (() => {
  const icons = { success:'✅', error:'❌', warning:'⚠️', info:'ℹ️' };
  const ttls  = { success:'Sucesso', error:'Erro', warning:'Atenção', info:'Informação' };
  const durs  = { success:4000, error:5000, warning:4500, info:4000 };
  function show(tipo, msg, titulo) {
    const c = document.getElementById('toast-container');
    if (!c) return;
    const dur = durs[tipo] || 4000;
    const el  = document.createElement('div'); el.className = 'toast toast-' + tipo;
    const ic  = document.createElement('div'); ic.className = 'toast-icon'; ic.textContent = icons[tipo];
    const ct  = document.createElement('div'); ct.className = 'toast-content';
    const tl  = document.createElement('div'); tl.className = 'toast-title'; tl.textContent = titulo || ttls[tipo];
    const bd  = document.createElement('div'); bd.className = 'toast-msg';   bd.innerHTML = msg;
    const cl  = document.createElement('button'); cl.className = 'toast-close'; cl.textContent = '✕';
    cl.onclick = () => el.remove();
    const pg  = document.createElement('div'); pg.className = 'toast-progress';
    pg.style.animationDuration = dur + 'ms';
    ct.append(tl, bd); el.append(ic, ct, cl, pg);
    c.appendChild(el);
    setTimeout(() => { el.classList.add('saindo'); setTimeout(() => el.remove(), 300); }, dur);
  }
  return {
    sucesso: (m, t) => show('success', m, t),
    erro:    (m, t) => show('error',   m, t),
    aviso:   (m, t) => show('warning', m, t),
    info:    (m, t) => show('info',    m, t),
  };
})();
const App = (() => {
  let motorAtualId = null;
  function init() {
    Auth.observar((user, perfil) => {
      if (user) {
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('app').style.display = 'block';
        document.getElementById('user-nome').textContent  = perfil?.nome  || user.email;
        document.getElementById('user-setor').textContent = perfil?.setor || '—';
        ajustarMenuPorSetor(perfil?.setor);
        Dashboard.iniciar();
        navegarPara('dashboard');
        verificarQRCodeURL();
      } else {
        document.getElementById('login-screen').style.display = 'flex';
        document.getElementById('app').style.display = 'none';
        Dashboard.parar();
      }
    });
    document.getElementById('btn-login').addEventListener('click', fazerLogin);
    document.getElementById('campo-senha').addEventListener('keydown', e => {
      if (e.key === 'Enter') fazerLogin();
    });
  }
  async function fazerLogin() {
    const email = document.getElementById('campo-email').value.trim();
    const senha = document.getElementById('campo-senha').value;
    const errEl = document.getElementById('login-erro');
    errEl.textContent = '';
    errEl.style.display = 'none';
    if (!email || !senha) {
      errEl.textContent = 'Preencha e-mail e senha.';
      errEl.style.display = 'block';
      return;
    }
    const btn = document.getElementById('btn-login');
    btn.textContent = 'ENTRANDO...'; btn.disabled = true;
    try {
      await Auth.login(email, senha);
    } catch (e) {
      btn.textContent = 'ENTRAR'; btn.disabled = false;
      const msgs = {
        'auth/user-not-found':    'Usuário não encontrado.',
        'auth/wrong-password':    'Senha incorreta.',
        'auth/invalid-email':     'E-mail inválido.',
        'auth/invalid-credential':'E-mail ou senha incorretos.',
        'auth/too-many-requests': 'Muitas tentativas. Aguarde.'
      };
      errEl.textContent = msgs[e.code] || 'E-mail ou senha incorretos.';
      errEl.style.display = 'block';
      const campoSenha = document.getElementById('campo-senha');
      campoSenha.style.borderColor = 'var(--red)';
      campoSenha.style.animation = 'shakeInput 0.4s ease';
      setTimeout(() => { campoSenha.style.animation = ''; campoSenha.style.borderColor = ''; }, 1500);
    }
  }
  async function fazerLogout() { await Auth.logout(); }
  function navegarPara(pagina) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('page-' + pagina)?.classList.add('active');
    document.querySelector('[data-page="' + pagina + '"]')?.classList.add('active');
    if (pagina === 'dashboard') Dashboard.renderizarTudo();
    if (pagina === 'motores')   Dashboard.renderizarTabelaMotores();
    if (pagina === 'usuarios' && Auth.isAdmin()) renderizarUsuarios();
  }
  function filtrarEIr(tipo, valor) {
    ['filtro-busca','filtro-etapa','filtro-origem','filtro-prioridade','filtro-status','filtro-prazo']
      .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });

    if (tipo === 'etapa') {
      const el = document.getElementById('filtro-etapa');
      if (el) el.value = valor;
    } else if (tipo === 'em_andamento') {
      const el = document.getElementById('filtro-status');
      if (el) el.value = 'em_andamento';
    } else if (tipo === 'urgente') {
      const el = document.getElementById('filtro-prioridade');
      if (el) el.value = 'urgente';
    } else if (tipo === 'alerta') {
      const el = document.getElementById('filtro-prazo');
      if (el) el.value = 'alerta';
    }
    navegarPara('motores');
  }
  function ajustarMenuPorSetor(setor) {
    const el = document.getElementById('menu-usuarios');
    if (el) el.style.display = setor === 'administracao' ? 'inline-block' : 'none';
  }
  function abrirCadastro() {
    limparModal('modal-cadastro');
    document.getElementById('cad-dataentrada').value = new Date().toISOString().slice(0, 10);
    const sel = document.getElementById('cad-setororigem');
    if (sel && sel.options.length <= 1) {
      Motores.SETORES_ORIGEM.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id; opt.textContent = s.label;
        sel.appendChild(opt);
      });
    }
    abrirModal('modal-cadastro');
  }
  async function salvarCadastro() {
    const dados = {
      tag:              getVal('cad-tag'),
      modelo:           getVal('cad-modelo'),
      potencia:         getVal('cad-potencia'),
      tensao:           getVal('cad-tensao'),
      rpm:              getVal('cad-rpm'),
      setorOrigem:      getVal('cad-setororigem'),
      localInstalacao:  getVal('cad-local'),
      problemaRelatado: getVal('cad-problema'),
      prioridade:       getVal('cad-prioridade'),
      dataEntrada:      getVal('cad-dataentrada'),
      prazoRetorno:     getVal('cad-prazo')
    };
    if (!dados.modelo)           { Toast.aviso('Informe o Modelo do Motor.',               'Campo obrigatório'); return; }
    if (!dados.setorOrigem)      { Toast.aviso('Selecione o Setor de Origem.',             'Campo obrigatório'); return; }
    if (!dados.problemaRelatado) { Toast.aviso('Descreva o Problema Relatado.',            'Campo obrigatório'); return; }
    if (!dados.dataEntrada)      { Toast.aviso('Informe a Data de Entrada na Manutenção.', 'Campo obrigatório'); return; }
    const btn = document.getElementById('btn-salvar-cadastro');
    btn.textContent = 'Salvando...'; btn.disabled = true;
    try {
      const motor = await Motores.cadastrar(dados);
      fecharModal('modal-cadastro');
      Toast.sucesso('Código: <strong>' + motor.codigo + '</strong>', 'Chamado aberto!');
    } catch (e) {
      Toast.erro('Erro ao abrir chamado: ' + e.message);
    } finally {
      btn.textContent = 'Abrir Chamado'; btn.disabled = false;
    }
  }
  async function abrirDetalhe(motorId) {
    motorAtualId = motorId;
    const motor = await Motores.buscarPorId(motorId);
    if (!motor) { Toast.erro('Chamado não encontrado.'); return; }
    document.getElementById('modal-detalhe-titulo').textContent = motor.codigo;
    Dashboard.renderizarDetalhe(motor, 'modal-detalhe-body');
    abrirModal('modal-detalhe');
    const canEdit = Auth.isAdmin() || Auth.getSetor() === 'manutencao';
    const btnR = document.getElementById('btn-registrar-detalhe');
    if (btnR) btnR.style.display = (canEdit && motor.status !== 'concluido') ? 'inline-block' : 'none';
  }
  function abrirAcaoDeDetalhe() {
    if (!motorAtualId) return;
    fecharModal('modal-detalhe');
    abrirAcao(motorAtualId);
  }
  async function abrirAcao(motorId) {
    motorAtualId = motorId;
    const motor = await Motores.buscarPorId(motorId);
    if (!motor) return;
    const etapa = motor.etapaAtual;
    document.querySelectorAll('.acao-form').forEach(f => f.style.display = 'none');
    limparModal('modal-acao');
    const tituloEtapa = Motores.ETAPAS_MANUTENCAO.find(e => e.id === etapa)?.label || etapa;
    document.getElementById('modal-acao-titulo').textContent = 'Registrar: ' + tituloEtapa;
    document.getElementById('acao-etapa-atual').textContent  = tituloEtapa;
    if (etapa === 'entrada_manutencao' || etapa === 'aguardando_pecas') {
      document.getElementById('form-avancar').style.display = 'block';
      preencherProximasEtapas(etapa);
    } else if (etapa === 'analise_tecnica') {
      document.getElementById('form-diagnostico').style.display = 'block';
    } else if (etapa === 'diagnostico') {
      document.getElementById('form-avancar').style.display = 'block';
      preencherProximasEtapas(etapa);
    } else if (etapa === 'em_reparo') {
      document.getElementById('form-reparo').style.display = 'block';
      const container = document.getElementById('tipos-reparo-checks');
      if (container) {
        container.innerHTML = '';
        Motores.TIPOS_REPARO.forEach(function(t) {
          const label = document.createElement('label');
          label.className = 'check-label';
          const input = document.createElement('input');
          input.type = 'checkbox';
          input.value = t;
          label.appendChild(input);
          label.appendChild(document.createTextNode(' ' + t));
          container.appendChild(label);
        });
      }
    } else if (etapa === 'teste_final') {
      document.getElementById('form-teste').style.display = 'block';
    } else {
      document.getElementById('form-avancar').style.display = 'block';
      preencherProximasEtapas(etapa);
    }
    abrirModal('modal-acao');
  }
  function preencherProximasEtapas(etapaAtual) {
    const sel = document.getElementById('avancar-proxima-etapa');
    if (!sel) return;
    sel.innerHTML = '<option value="">Selecione a próxima etapa...</option>';
    const idx = Motores.ETAPAS_MANUTENCAO.findIndex(e => e.id === etapaAtual);
    Motores.ETAPAS_MANUTENCAO.slice(idx + 1).forEach(e => {
      const opt = document.createElement('option');
      opt.value = e.id; opt.textContent = e.label;
      sel.appendChild(opt);
    });
  }
  async function salvarAcao() {
    const motor = await Motores.buscarPorId(motorAtualId);
    if (!motor) return;
    const etapa = motor.etapaAtual;
    const btn = document.getElementById('btn-salvar-acao');
    btn.textContent = 'Salvando...'; btn.disabled = true;
    try {
      if (etapa === 'analise_tecnica') {
        const dados = {
          causaRaiz:              getVal('diag-causa'),
          tipoFalha:              getVal('diag-tipo'),
          necessitaReparo:        getVal('diag-necessita') === 'sim',
          pecasNecessarias:       getVal('diag-pecas'),
          estimativaDias:         getVal('diag-estimativa'),
          resistenciaIsolamento:  getVal('diag-ri'),
          resistenciaEnrolamento: getVal('diag-re'),
          corrente:               getVal('diag-corrente'),
          temperatura:            getVal('diag-temp'),
          vibracao:               getVal('diag-vib'),
          unidadeVib:             getVal('diag-unidade'),
          obsMedicoes:            getVal('diag-obs')
        };
        if (!dados.causaRaiz)          { Toast.aviso('Informe a Causa Raiz do problema.',   'Campo obrigatório'); return; }
        if (!dados.tipoFalha)          { Toast.aviso('Selecione o Tipo de Falha.',           'Campo obrigatório'); return; }
        if (!getVal('diag-necessita')) { Toast.aviso('Informe se necessita reparo.',         'Campo obrigatório'); return; }
        await Motores.registrarDiagnostico(motorAtualId, dados);
        await Motores.avancarEtapa(motorAtualId, 'diagnostico', 'Diagnóstico concluído: ' + dados.causaRaiz);

      } else if (etapa === 'em_reparo') {
        const checks = [...document.querySelectorAll('#tipos-reparo-checks input:checked')].map(c => c.value);
        const dados = {
          tiposIntervencao: checks,
          descricaoServico: getVal('rep-descricao'),
          pecasUtilizadas:  getVal('rep-pecas')
        };
        if (!dados.descricaoServico) { Toast.aviso('Descreva o Serviço Executado.', 'Campo obrigatório'); return; }
        await Motores.registrarReparo(motorAtualId, dados);
        await Motores.avancarEtapa(motorAtualId, 'teste_final', 'Reparo concluído. Motor encaminhado para teste final.');

      } else if (etapa === 'teste_final') {
        const dados = {
          resultado:   getVal('teste-resultado'),
          vibracao:    getVal('teste-vib'),
          unidadeVib:  getVal('teste-unidade'),
          temperatura: getVal('teste-temp'),
          corrente:    getVal('teste-corrente'),
          observacoes: getVal('teste-obs')
        };
        if (!dados.resultado) { Toast.aviso('Selecione o Resultado do teste final.', 'Campo obrigatório'); return; }
        await Motores.registrarTesteFinal(motorAtualId, dados);

      } else {
        const novaEtapa = getVal('avancar-proxima-etapa');
        const obs       = getVal('avancar-obs');
        if (!novaEtapa) { Toast.aviso('Selecione a próxima etapa.', 'Campo obrigatório'); return; }
        await Motores.avancarEtapa(motorAtualId, novaEtapa, obs);
      }

      fecharModal('modal-acao');
      Toast.sucesso('Etapa registrada com sucesso!', 'Atualizado');
    } catch (e) {
      Toast.erro('Erro ao salvar: ' + e.message);
    } finally {
      btn.textContent = 'Salvar'; btn.disabled = false;
    }
  }
  function abrirCriarUsuario() {
    limparModal('modal-usuario');
    abrirModal('modal-usuario');
  }
  async function salvarUsuario() {
    const email = getVal('usr-email');
    const senha = getVal('usr-senha');
    const nome  = getVal('usr-nome');
    const setor = getVal('usr-setor');
    if (!nome)            { Toast.aviso('Informe o Nome Completo.',              'Campo obrigatório'); return; }
    if (!email)           { Toast.aviso('Informe o E-mail.',                     'Campo obrigatório'); return; }
    if (!senha)           { Toast.aviso('Defina uma Senha.',                     'Campo obrigatório'); return; }
    if (!setor)           { Toast.aviso('Selecione o Setor / Perfil.',           'Campo obrigatório'); return; }
    if (senha.length < 6) { Toast.aviso('A senha deve ter ao menos 6 caracteres.', 'Senha fraca');    return; }
    const btn = document.getElementById('btn-salvar-usuario');
    btn.textContent = 'Criando...'; btn.disabled = true;
    try {
      await Auth.criarUsuario(email, senha, nome, setor);
      fecharModal('modal-usuario');
      Toast.sucesso('Usuário <strong>' + nome + '</strong> criado!', 'Usuário criado');
    } catch (e) {
      if (e.message !== 'Operação cancelada pelo administrador.') {
        Toast.erro('Erro ao criar usuário: ' + e.message);
      }
    } finally {
      btn.textContent = 'Criar Usuário'; btn.disabled = false;
    }
  }
  function verificarQRCodeURL() {
    const codigo = new URLSearchParams(window.location.search).get('motor');
    if (codigo) Motores.buscarPorCodigo(codigo).then(m => { if (m) abrirDetalhe(m.id); });
  }
  async function renderizarUsuarios() {
    try {
      const snap  = await db.collection('usuarios').get();
      const tbody = document.getElementById('tbody-usuarios');
      if (!tbody) return;
      tbody.innerHTML = snap.docs.map(d => {
        const u = d.data();
        return '<tr>' +
          '<td data-label="Nome">' + u.nome + '</td>' +
          '<td data-label="E-mail" style="font-family:var(--mono);font-size:12px;">' + u.email + '</td>' +
          '<td data-label="Setor"><span class="etapa-badge" style="border-color:var(--border);color:var(--text2);">' + u.setor + '</span></td>' +
          '</tr>';
      }).join('');
    } catch (e) {
      console.warn('Sem permissão para listar usuários:', e.message);
    }
  }
  function abrirModal(id)  { document.getElementById(id)?.classList.add('open'); }
  function fecharModal(id) { document.getElementById(id)?.classList.remove('open'); }
  function limparModal(id) {
    document.querySelectorAll('#' + id + ' input, #' + id + ' select, #' + id + ' textarea')
      .forEach(el => { if (el.type !== 'hidden') el.value = ''; });
    document.querySelectorAll('#' + id + ' input[type="checkbox"]')
      .forEach(el => el.checked = false);
  }
  function getVal(id) { return document.getElementById(id)?.value || ''; }
  return {
    init, fazerLogout, navegarPara, filtrarEIr,
    abrirCadastro, salvarCadastro,
    abrirDetalhe, abrirAcaoDeDetalhe, abrirAcao, salvarAcao,
    abrirCriarUsuario, salvarUsuario, fecharModal
  };
})();
document.addEventListener('DOMContentLoaded', () => App.init());
//ass