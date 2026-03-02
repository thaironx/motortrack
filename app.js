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
    if (!email || !senha) { errEl.textContent = 'Preencha e-mail e senha.'; return; }

    const btn = document.getElementById('btn-login');
    btn.textContent = 'ENTRANDO...'; btn.disabled = true;

    try {
      await Auth.login(email, senha);
    } catch (e) {
      btn.textContent = 'ENTRAR'; btn.disabled = false;
      const msgs = {
        'auth/user-not-found':   'Usuário não encontrado.',
        'auth/wrong-password':   'Senha incorreta.',
        'auth/invalid-email':    'E-mail inválido.',
        'auth/too-many-requests':'Muitas tentativas. Aguarde.'
      };
      errEl.textContent = msgs[e.code] || 'Erro ao entrar. Tente novamente.';
    }
  }

  async function fazerLogout() { await Auth.logout(); }

  function navegarPara(pagina) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`page-${pagina}`)?.classList.add('active');
    document.querySelector(`[data-page="${pagina}"]`)?.classList.add('active');

    if (pagina === 'dashboard') Dashboard.renderizarTudo();
    if (pagina === 'motores')   Dashboard.renderizarTabelaMotores();
    if (pagina === 'usuarios' && Auth.isAdmin()) renderizarUsuarios();
  }

  function ajustarMenuPorSetor(setor) {
    const el = document.getElementById('menu-usuarios');
    if (el) el.style.display = setor === 'administracao' ? 'inline-block' : 'none';
  }

  function abrirCadastro() {
    limparModal('modal-cadastro');
    const hoje = new Date().toISOString().slice(0, 10);
    document.getElementById('cad-dataentrada').value = hoje;

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

    // Validações de campos obrigatórios
    if (!dados.modelo)           { alert('Campo obrigatório: informe o Modelo do Motor.');              return; }
    if (!dados.setorOrigem)      { alert('Campo obrigatório: selecione o Setor de Origem.');            return; }
    if (!dados.problemaRelatado) { alert('Campo obrigatório: descreva o Problema Relatado.');           return; }
    if (!dados.dataEntrada)      { alert('Campo obrigatório: informe a Data de Entrada na Manutenção.');return; }

    const btn = document.getElementById('btn-salvar-cadastro');
    btn.textContent = 'Salvando...'; btn.disabled = true;

    try {
      const motor = await Motores.cadastrar(dados);
      fecharModal('modal-cadastro');
      alert(`Chamado aberto com sucesso!\nCódigo: ${motor.codigo}`);
    } catch (e) {
      alert('Erro ao abrir chamado: ' + e.message);
    } finally {
      btn.textContent = 'Abrir Chamado'; btn.disabled = false;
    }
  }

  async function abrirDetalhe(motorId) {
    motorAtualId = motorId;
    const motor  = await Motores.buscarPorId(motorId);
    if (!motor) { alert('Chamado não encontrado.'); return; }

    document.getElementById('modal-detalhe-titulo').textContent = motor.codigo;
    Dashboard.renderizarDetalhe(motor, 'modal-detalhe-body');
    abrirModal('modal-detalhe');

    const canEdit = Auth.isAdmin() || Auth.getSetor() === 'manutencao';
    const btnRegistrar = document.getElementById('btn-registrar-detalhe');
    if (btnRegistrar) {
      btnRegistrar.style.display = (canEdit && motor.status !== 'concluido') ? 'inline-block' : 'none';
    }
  }

  function abrirAcaoDeDetalhe() {
    if (!motorAtualId) return;
    fecharModal('modal-detalhe');
    abrirAcao(motorAtualId);
  }

  async function abrirAcao(motorId) {
    motorAtualId = motorId;
    const motor  = await Motores.buscarPorId(motorId);
    if (!motor) return;

    const etapa = motor.etapaAtual;

    document.querySelectorAll('.acao-form').forEach(f => f.style.display = 'none');
    limparModal('modal-acao');

    const tituloEtapa = Motores.ETAPAS_MANUTENCAO.find(e => e.id === etapa)?.label || etapa;
    document.getElementById('modal-acao-titulo').textContent = `Registrar: ${tituloEtapa}`;
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
      if (container && container.children.length === 0) {
        Motores.TIPOS_REPARO.forEach(t => {
          const label = document.createElement('label');
          label.className = 'check-label';
          label.innerHTML = `<input type="checkbox" value="${t}"> ${t}`;
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
    const proximas = Motores.ETAPAS_MANUTENCAO.slice(idx + 1);
    proximas.forEach(e => {
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
        // BUG FIX: era "!dados.necessitaReparo === undefined" (sempre falso)
        // Validação correta: verificar os campos obrigatórios individualmente
        if (!dados.causaRaiz)  { alert('Campo obrigatório: informe a Causa Raiz do problema.');   return; }
        if (!dados.tipoFalha)  { alert('Campo obrigatório: selecione o Tipo de Falha.');           return; }
        if (!getVal('diag-necessita')) { alert('Campo obrigatório: informe se necessita reparo.'); return; }

        await Motores.registrarDiagnostico(motorAtualId, dados);
        await Motores.avancarEtapa(motorAtualId, 'diagnostico', `Diagnóstico concluído: ${dados.causaRaiz}`);

      } else if (etapa === 'em_reparo') {
        const checks = [...document.querySelectorAll('#tipos-reparo-checks input:checked')].map(c => c.value);
        const dados = {
          tiposIntervencao: checks,
          descricaoServico: getVal('rep-descricao'),
          pecasUtilizadas:  getVal('rep-pecas')
        };
        if (!dados.descricaoServico) { alert('Campo obrigatório: descreva o Serviço Executado.'); return; }
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
        if (!dados.resultado) { alert('Campo obrigatório: selecione o Resultado do teste final.'); return; }
        await Motores.registrarTesteFinal(motorAtualId, dados);

      } else {
        const novaEtapa = getVal('avancar-proxima-etapa');
        const obs       = getVal('avancar-obs');
        if (!novaEtapa) { alert('Campo obrigatório: selecione a próxima etapa.'); return; }
        await Motores.avancarEtapa(motorAtualId, novaEtapa, obs);
      }

      fecharModal('modal-acao');
    } catch (e) {
      alert('Erro: ' + e.message);
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

    if (!nome)  { alert('Campo obrigatório: informe o Nome Completo.');       return; }
    if (!email) { alert('Campo obrigatório: informe o E-mail.');               return; }
    if (!senha) { alert('Campo obrigatório: defina uma Senha.');               return; }
    if (!setor) { alert('Campo obrigatório: selecione o Setor / Perfil.');     return; }
    if (senha.length < 6) { alert('A senha deve ter ao menos 6 caracteres.'); return; }

    const btn = document.getElementById('btn-salvar-usuario');
    btn.textContent = 'Criando...'; btn.disabled = true;

    try {
      await Auth.criarUsuario(email, senha, nome, setor);
      fecharModal('modal-usuario');
      alert('Usuário criado com sucesso!');
    } catch (e) {
      alert('Erro: ' + e.message);
    } finally {
      btn.textContent = 'Criar Usuário'; btn.disabled = false;
    }
  }

  function verificarQRCodeURL() {
    const codigo = new URLSearchParams(window.location.search).get('motor');
    if (codigo) {
      Motores.buscarPorCodigo(codigo).then(m => { if (m) abrirDetalhe(m.id); });
    }
  }

  async function renderizarUsuarios() {
    try {
      const snap  = await db.collection('usuarios').get();
      const tbody = document.getElementById('tbody-usuarios');
      if (!tbody) return;
      tbody.innerHTML = snap.docs.map(d => {
        const u = d.data();
        return `<tr>
          <td>${u.nome}</td>
          <td style="font-family:var(--mono);font-size:12px;">${u.email}</td>
          <td><span class="etapa-badge" style="border-color:var(--border);color:var(--text2);">${u.setor}</span></td>
        </tr>`;
      }).join('');
    } catch (e) {
      console.warn('Sem permissão para listar usuários:', e.message);
    }
  }

  function abrirModal(id)  { document.getElementById(id)?.classList.add('open'); }
  function fecharModal(id) { document.getElementById(id)?.classList.remove('open'); }
  function limparModal(id) {
    document.querySelectorAll(`#${id} input, #${id} select, #${id} textarea`).forEach(el => el.value = '');
    document.querySelectorAll(`#${id} input[type="checkbox"]`).forEach(el => el.checked = false);
  }
  function getVal(id) { return document.getElementById(id)?.value || ''; }

  return {
    init,
    fazerLogout,
    navegarPara,
    abrirCadastro,
    salvarCadastro,
    abrirDetalhe,
    abrirAcaoDeDetalhe,
    abrirAcao,
    salvarAcao,
    abrirCriarUsuario,
    salvarUsuario,
    fecharModal
  };
})();

document.addEventListener('DOMContentLoaded', () => App.init());
