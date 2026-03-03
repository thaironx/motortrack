const Auth = (() => {
  let currentUser   = null;
  let currentPerfil = null;
  async function login(email, senha) {
    const cred = await auth.signInWithEmailAndPassword(email, senha);
    await carregarPerfil(cred.user.uid);
    return cred.user;
  }
  async function logout() {
    await auth.signOut();
    currentUser   = null;
    currentPerfil = null;
  }
  async function carregarPerfil(uid) {
    const doc = await db.collection('usuarios').doc(uid).get();
    if (doc.exists) {
      currentPerfil = doc.data();
    } else {
      currentPerfil = { setor: 'administracao', nome: auth.currentUser.email };
    }
  }
  function observar(callback) {
    auth.onAuthStateChanged(async (user) => {
      currentUser = user;
      if (user) {
        await carregarPerfil(user.uid);
      }
      callback(user, currentPerfil);
    });
  }
  async function criarUsuario(email, senha, nome, setor) {
    const adminEmail = currentUser.email;
    const adminSenha = await solicitarSenhaAdmin();
    const cred = await auth.createUserWithEmailAndPassword(email, senha);
    const novoUid = cred.user.uid;
    await db.collection('usuarios').doc(novoUid).set({
      nome:  nome,
      setor: setor,
      email: email,
      criadoEm: firebase.firestore.FieldValue.serverTimestamp()
    });
    await auth.signOut();
    await auth.signInWithEmailAndPassword(adminEmail, adminSenha);
  }
  function solicitarSenhaAdmin() {
    return new Promise((resolve, reject) => {
      const overlay  = document.getElementById('modal-confirmar-senha');
      const campo    = document.getElementById('campo-confirmar-senha');
      const errEl    = document.getElementById('confirmar-senha-erro');
      const btnOk    = document.getElementById('btn-ok-confirmar-senha');
      const btnCancelar = document.getElementById('btn-cancelar-confirmar-senha');
      const btnFechar   = document.getElementById('btn-fechar-confirmar-senha');
      campo.value = '';
      errEl.style.display = 'none';
      errEl.textContent = '';
      overlay.classList.add('open');
      setTimeout(() => campo.focus(), 100);
      function confirmar() {
        const senha = campo.value;
        if (!senha) {
          errEl.textContent = 'Digite sua senha para continuar.';
          errEl.style.display = 'block';
          return;
        }
        fechar();
        resolve(senha);
      }
      function cancelar() {
        fechar();
        reject(new Error('Operação cancelada pelo administrador.'));
      }
      function fechar() {
        overlay.classList.remove('open');
        campo.value = '';
        errEl.style.display = 'none';
        btnOk.removeEventListener('click', confirmar);
        btnCancelar.removeEventListener('click', cancelar);
        btnFechar.removeEventListener('click', cancelar);
        campo.removeEventListener('keydown', onKeydown);
      }
      function onKeydown(e) {
        if (e.key === 'Enter') confirmar();
        if (e.key === 'Escape') cancelar();
      }
      btnOk.addEventListener('click', confirmar);
      btnCancelar.addEventListener('click', cancelar);
      btnFechar.addEventListener('click', cancelar);
      campo.addEventListener('keydown', onKeydown);
    });
  }
  function getUser()   { return currentUser; }
  function getPerfil() { return currentPerfil; }
  function getSetor()  { return currentPerfil ? currentPerfil.setor : null; }
  function isAdmin()   { return currentPerfil && currentPerfil.setor === 'administracao'; }
  return { login, logout, observar, criarUsuario, getUser, getPerfil, getSetor, isAdmin };
})(); //ass