/**
 * MotorTrack 2.0 — Módulo Auth
 *
 * Responsabilidades:
 *  - Login / logout via Firebase Auth
 *  - Carregamento e cache do perfil Firestore
 *  - Criação de usuários mantendo a sessão do admin
 *  - Helpers de permissão (isAdmin, getSetor, etc.)
 */

const Auth = (() => {
  /* ── Estado ── */
  let _usuario = null;
  let _perfil  = null;

  /* ── Login / Logout ── */
  async function login(email, senha) {
    const cred = await auth.signInWithEmailAndPassword(email, senha);
    await _carregarPerfil(cred.user.uid);
    return cred.user;
  }

  async function logout() {
    await auth.signOut();
    _usuario = null;
    _perfil  = null;
  }

  /* ── Perfil Firestore ── */
  async function _carregarPerfil(uid) {
    const doc = await db.collection('usuarios').doc(uid).get();
    _perfil = doc.exists
      ? doc.data()
      : { setor: 'administracao', nome: auth.currentUser?.email ?? '' };
  }

  /**
   * Registra listener no estado de autenticação do Firebase.
   * @param {Function} callback (user, perfil) => void
   */
  function observar(callback) {
    auth.onAuthStateChanged(async (user) => {
      _usuario = user;
      if (user) {
        await _carregarPerfil(user.uid);
      }
      callback(user, _perfil);
    });
  }

  /* ── Criação de usuários ── */
  /**
   * Cria um novo usuário e retorna à sessão do admin.
   * Fluxo: confirma senha admin → cria usuário → volta a logar como admin.
   */
  async function criarUsuario(email, senha, nome, setor) {
    const emailAdmin = _usuario.email;
    const senhaAdmin = await _solicitarSenhaAdmin();

    const cred     = await auth.createUserWithEmailAndPassword(email, senha);
    const novoUid  = cred.user.uid;

    // Mapeia setor para perfil de permissão
    const PERFIL_MAP = {
      administracao: 'admin',
      manutencao:    'tecnico',
    };
    await db.collection('usuarios').doc(novoUid).set({
      nome,
      setor,
      email,
      perfil:   PERFIL_MAP[setor] ?? 'funcionario',
      ativo:    true,
      criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
    });

    // Retorna a sessão ao administrador
    await auth.signOut();
    await auth.signInWithEmailAndPassword(emailAdmin, senhaAdmin);
  }

  /**
   * Abre o modal de confirmação de senha e retorna a senha via Promise.
   * @returns {Promise<string>}
   */
  function _solicitarSenhaAdmin() {
    return new Promise((resolve, reject) => {
      const overlay    = document.getElementById('modal-confirmar-senha');
      const campoSenha = document.getElementById('campo-confirmar-senha');
      const errEl      = document.getElementById('confirmar-senha-erro');
      const btnOk      = document.getElementById('btn-ok-confirmar-senha');
      const btnCancelar= document.getElementById('btn-cancelar-confirmar-senha');
      const btnFechar  = document.getElementById('btn-fechar-confirmar-senha');

      /* Prepara o modal */
      campoSenha.value       = '';
      errEl.style.display    = 'none';
      errEl.textContent      = '';
      overlay.classList.add('open');
      setTimeout(() => campoSenha.focus(), 100);

      function confirmar() {
        const senha = campoSenha.value;
        if (!senha) {
          errEl.textContent   = 'Digite sua senha para continuar.';
          errEl.style.display = 'block';
          return;
        }
        _fecharModal();
        resolve(senha);
      }

      function cancelar() {
        _fecharModal();
        reject(new Error('Operação cancelada pelo administrador.'));
      }

      function _fecharModal() {
        overlay.classList.remove('open');
        campoSenha.value    = '';
        errEl.style.display = 'none';
        btnOk.removeEventListener('click', confirmar);
        btnCancelar.removeEventListener('click', cancelar);
        btnFechar.removeEventListener('click', cancelar);
        campoSenha.removeEventListener('keydown', _onKeydown);
      }

      function _onKeydown(e) {
        if (e.key === 'Enter')  confirmar();
        if (e.key === 'Escape') cancelar();
      }

      btnOk.addEventListener('click', confirmar);
      btnCancelar.addEventListener('click', cancelar);
      btnFechar.addEventListener('click', cancelar);
      campoSenha.addEventListener('keydown', _onKeydown);
    });
  }

  /* ── Getters ── */
  function getUsuario() { return _usuario; }
  function getPerfil()  { return _perfil; }
  function getSetor()   { return _perfil?.setor ?? null; }
  function getNome()    { return _perfil?.nome ?? _usuario?.email ?? ''; }
  function isAdmin()    { return _perfil?.setor === 'administracao' || _perfil?.perfil === 'admin'; }
  function isAtivo()    { return _perfil?.ativo !== false; }
  function podeEditar() { return isAdmin() || getSetor() === 'manutencao'; }
  function getPerfil_() { return _perfil?.perfil ?? 'funcionario'; }

  /* ── API Pública ── */
  return {
    login,
    logout,
    observar,
    criarUsuario,
    getUsuario,
    getPerfil,
    getSetor,
    getNome,
    isAdmin,
    isAtivo,
    getPerfil_,
    podeEditar,
    // Retrocompatibilidade com chamadas App.getUser()
    getUser: getUsuario,
  };
})();
