/**
 * MotorTrack 2.0 — Toast (Notificações)
 * Utilitário compartilhado entre área pública e restrita.
 */

const Toast = (() => {
  const ICONS  = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const TITLES = { success: 'Sucesso', error: 'Erro', warning: 'Atenção', info: 'Informação' };
  const DURATIONS = { success: 4000, error: 5000, warning: 4500, info: 4000 };

  function show(tipo, mensagem, titulo) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const duracao = DURATIONS[tipo] ?? 4000;

    const toast     = document.createElement('div');
    const icone     = document.createElement('div');
    const conteudo  = document.createElement('div');
    const tituloEl  = document.createElement('div');
    const mensagemEl= document.createElement('div');
    const fechar    = document.createElement('button');
    const progresso = document.createElement('div');

    toast.className      = `toast toast-${tipo}`;
    icone.className      = 'toast-icon';
    conteudo.className   = 'toast-content';
    tituloEl.className   = 'toast-title';
    mensagemEl.className = 'toast-msg';
    fechar.className     = 'toast-close';
    progresso.className  = 'toast-progress';

    icone.textContent      = ICONS[tipo];
    tituloEl.textContent   = titulo || TITLES[tipo];
    mensagemEl.innerHTML   = mensagem;
    fechar.textContent     = '✕';
    fechar.onclick         = () => remover(toast);
    progresso.style.animationDuration = `${duracao}ms`;

    conteudo.append(tituloEl, mensagemEl);
    toast.append(icone, conteudo, fechar, progresso);
    container.appendChild(toast);

    setTimeout(() => remover(toast), duracao);
  }

  function remover(el) {
    el.classList.add('saindo');
    setTimeout(() => el.remove(), 300);
  }

  return {
    sucesso: (msg, titulo) => show('success', msg, titulo),
    erro:    (msg, titulo) => show('error',   msg, titulo),
    aviso:   (msg, titulo) => show('warning', msg, titulo),
    info:    (msg, titulo) => show('info',    msg, titulo),
  };
})();
