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
    return new Promise((resolve) => {
      const senha = prompt("Para criar o usuário, confirme sua senha de administrador:");
      resolve(senha);
    });
  }
  
  function getUser()   { return currentUser; }
  function getPerfil() { return currentPerfil; }
  function getSetor()  { return currentPerfil ? currentPerfil.setor : null; }
  function isAdmin()   { return currentPerfil && currentPerfil.setor === 'administracao'; }

  return { login, logout, observar, criarUsuario, getUser, getPerfil, getSetor, isAdmin };
})();