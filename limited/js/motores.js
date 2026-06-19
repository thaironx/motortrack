/**
 * MotorTrack 2.0 — Módulo Motores
 *
 * Responsabilidades:
 *  - Constantes (setores, etapas, tipos de reparo)
 *  - CRUD e operações de estado no Firestore
 *  - Cálculos auxiliares (prazo, tempos por etapa)
 *  - Listeners em tempo real
 */

const Motores = (() => {

  /* ── Constantes ── */

  const SETORES_ORIGEM = [
    { id: 'usinagem',     label: 'Usinagem'    },
    { id: 'producao',     label: 'Produção'     },
    { id: 'compressores', label: 'Compressores' },
    { id: 'caldeiraria',  label: 'Caldeiraria'  },
    { id: 'utilidades',   label: 'Utilidades'   },
    { id: 'extrusao',     label: 'Extrusão'     },
    { id: 'outro',        label: 'Outro'        },
  ];

  const ETAPAS_MANUTENCAO = [
    {
      id: 'entrada_manutencao',
      label: 'Entrada na Manutenção',
      cor: '#60a0ff',
      desc: 'Motor recebido pelo setor de manutenção',
    },
    {
      id: 'analise_tecnica',
      label: 'Análise Técnica',
      cor: '#f0a500',
      desc: 'Inspeção visual, elétrica e mecânica para identificar o problema',
    },
    {
      id: 'diagnostico',
      label: 'Diagnóstico',
      cor: '#c060ff',
      desc: 'Causa raiz identificada e plano de reparo definido',
    },
    {
      id: 'aguardando_pecas',
      label: 'Aguardando Peças',
      cor: '#ff9040',
      desc: 'Motor aguardando chegada de peças/componentes para reparo',
    },
    {
      id: 'em_reparo',
      label: 'Em Reparo',
      cor: '#ff6060',
      desc: 'Reparo em execução: troca de peças, rolamentos, rebobinamento etc.',
    },
    {
      id: 'teste_final',
      label: 'Teste Final',
      cor: '#40d0ff',
      desc: 'Motor remontado e em fase de testes operacionais',
    },
    {
      id: 'concluido',
      label: 'Concluído / Retornado',
      cor: '#00c97a',
      desc: 'Motor aprovado nos testes e devolvido ao setor de origem',
    },
  ];

  const TIPOS_REPARO = [
    'Troca de rolamento(s)',
    'Troca de vedação / retentor',
    'Substituição de bobina / rebobinamento',
    'Troca de capacitor',
    'Substituição de escovas / porta-escovas',
    'Troca de eixo',
    'Balanceamento de rotor',
    'Limpeza e lubrificação',
    'Troca de carcaça / tampa',
    'Reparo elétrico interno',
    'Substituição completa do motor',
    'Múltiplos reparos ou diversos não listados acima',
  ];

  /* ── Helpers Internos ── */

  function _agora() {
    return firebase.firestore.Timestamp.now();
  }

  function _emailAtual() {
    return Auth.getUsuario()?.email ?? 'desconhecido';
  }

  function _entradaHistorico({ etapa, tipo, obs }) {
    return firebase.firestore.FieldValue.arrayUnion({
      etapa,
      tipo,
      dataHora:    _agora(),
      responsavel: _emailAtual(),
      obs:         obs ?? '',
    });
  }

  /* ── Geração de Código OS ── */

  function gerarCodigo() {
    const data = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `MN-${data}-${rand}`;
  }

  /* ── CRUD ── */

  /**
   * Abre um chamado de manutenção.
   * @param {object} dados
   * @returns {Promise<{id:string, ...}>}
   */
  async function cadastrar(dados) {
    const codigo = gerarCodigo();
    const agora  = _agora();

    const motor = {
      codigo,
      tag:              dados.tag              || '',
      modelo:           dados.modelo,
      potencia:         dados.potencia         || '',
      tensao:           dados.tensao           || '',
      rpm:              dados.rpm              || '',
      setorOrigem:      dados.setorOrigem,
      localInstalacao:  dados.localInstalacao  || '',
      problemaRelatado: dados.problemaRelatado,
      prioridade:       dados.prioridade       || 'normal',
      dataEntrada:      dados.dataEntrada,
      prazoRetorno:     dados.prazoRetorno     || '',
      etapaAtual:       'entrada_manutencao',
      status:           'em_andamento',
      resultado:        null,
      dadosTecnicos:    {},
      diagnostico:      null,
      reparo:           null,
      testeFinal:       null,
      abertoEm:         agora,
      abertoBy:         _emailAtual(),
      atualizadoEm:     agora,
      historico: [{
        etapa:       'entrada_manutencao',
        tipo:        'movimentacao',
        dataHora:    agora,
        responsavel: _emailAtual(),
        obs: `Chamado aberto. Setor de origem: ${dados.setorOrigem}. Problema: ${dados.problemaRelatado}`,
      }],
    };

    const docRef = await db.collection('motores').add(motor);
    return { id: docRef.id, ...motor };
  }

  /**
   * Move o motor para uma nova etapa.
   * @param {string} motorId
   * @param {string} novaEtapa
   * @param {string} [obs]
   */
  async function avancarEtapa(motorId, novaEtapa, obs) {
    const etapaInfo = ETAPAS_MANUTENCAO.find(e => e.id === novaEtapa);
    const update = {
      etapaAtual:   novaEtapa,
      atualizadoEm: _agora(),
      historico:    _entradaHistorico({
        etapa: novaEtapa,
        tipo:  'movimentacao',
        obs:   obs || etapaInfo?.desc || '',
      }),
    };
    if (novaEtapa === 'concluido') {
      update.status      = 'concluido';
      update.concluidoEm = _agora();
    }
    await db.collection('motores').doc(motorId).update(update);
  }

  /**
   * Registra o diagnóstico técnico.
   */
  async function registrarDiagnostico(motorId, dados) {
    await db.collection('motores').doc(motorId).update({
      diagnostico: {
        causaRaiz:              dados.causaRaiz,
        tipoFalha:              dados.tipoFalha,
        necessitaReparo:        dados.necessitaReparo,
        pecasNecessarias:       dados.pecasNecessarias   || '',
        estimativaDias:         dados.estimativaDias     || '',
        tecnicoResponsavel:     _emailAtual(),
        registradoEm:           _agora(),
      },
      dadosTecnicos: {
        resistenciaIsolamento:  dados.resistenciaIsolamento  || '',
        resistenciaEnrolamento: dados.resistenciaEnrolamento || '',
        corrente:               dados.corrente               || '',
        temperatura:            dados.temperatura            || '',
        vibracao:               dados.vibracao               || '',
        unidadeVib:             dados.unidadeVib             || 'mm/s',
        obs:                    dados.obsMedicoes            || '',
      },
      atualizadoEm: _agora(),
      historico: _entradaHistorico({
        etapa: 'diagnostico',
        tipo:  'diagnostico',
        obs:   `Diagnóstico: ${dados.causaRaiz} | Falha: ${dados.tipoFalha} | Reparo: ${dados.necessitaReparo ? 'Sim' : 'Não'}`,
      }),
    });
  }

  /**
   * Registra o reparo executado.
   */
  async function registrarReparo(motorId, dados) {
    await db.collection('motores').doc(motorId).update({
      reparo: {
        tiposIntervencao: dados.tiposIntervencao || [],
        descricaoServico: dados.descricaoServico,
        pecasUtilizadas:  dados.pecasUtilizadas  || '',
        executadoPor:     _emailAtual(),
        executadoEm:      _agora(),
      },
      atualizadoEm: _agora(),
      historico: _entradaHistorico({
        etapa: 'em_reparo',
        tipo:  'reparo',
        obs:   `Intervenções: ${(dados.tiposIntervencao || []).join(', ') || '—'} | ${dados.descricaoServico}`,
      }),
    });
  }

  /**
   * Registra o resultado do teste final e conclui o chamado.
   */
  async function registrarTesteFinal(motorId, dados) {
    const LABELS_RESULTADO = {
      aprovado:            'Aprovado — Apto para retorno ao setor',
      reprovado_sucateado: 'Reprovado — Motor sucateado',
      substituido:         'Motor substituído por unidade nova',
    };

    await db.collection('motores').doc(motorId).update({
      testeFinal: {
        resultado:   dados.resultado,
        vibracao:    dados.vibracao    || '',
        unidadeVib:  dados.unidadeVib  || 'mm/s',
        temperatura: dados.temperatura || '',
        corrente:    dados.corrente    || '',
        observacoes: dados.observacoes || '',
        testadoPor:  _emailAtual(),
        testadoEm:   _agora(),
      },
      resultado:    dados.resultado,
      etapaAtual:   'concluido',
      status:       'concluido',
      concluidoEm:  _agora(),
      atualizadoEm: _agora(),
      historico: _entradaHistorico({
        etapa: 'concluido',
        tipo:  'conclusao',
        obs:   `${LABELS_RESULTADO[dados.resultado] || dados.resultado}. ${dados.observacoes || ''}`,
      }),
    });
  }

  /* ── Cálculos ── */

  /**
   * Calcula o status do prazo de retorno.
   * @param {string} prazoStr  'YYYY-MM-DD' ou vazio
   * @returns {{ tipo: 'ok'|'alerta'|'atrasado', label: string, dias: number|null }}
   */
  function calcularStatusPrazo(prazoStr) {
    if (!prazoStr) return { tipo: 'ok', label: 'Sem prazo definido', dias: null };

    const hoje  = new Date(); hoje.setHours(0, 0, 0, 0);
    const prazo = new Date(`${prazoStr}T00:00:00`);
    const dias  = Math.ceil((prazo - hoje) / 86_400_000);

    if (dias < 0)  return { tipo: 'atrasado', label: `${Math.abs(dias)}d em atraso`, dias };
    if (dias <= 2) return { tipo: 'alerta',   label: `${dias}d para o prazo`,        dias };
    return               { tipo: 'ok',        label: `${dias}d para o prazo`,        dias };
  }

  /**
   * Calcula o tempo gasto em cada etapa com base no histórico.
   * @param {Array} historico
   * @returns {Array<{ setor: string, horas: number }>}
   */
  function calcularTemposPorEtapa(historico) {
    if (!historico?.length) return [];

    const movimentacoes = historico.filter(h => h.tipo === 'movimentacao');
    return movimentacoes.map((h, i) => {
      const entrada = h.dataHora?.toDate?.() ?? new Date(h.dataHora);
      const saida   = movimentacoes[i + 1]
        ? (movimentacoes[i + 1].dataHora?.toDate?.() ?? new Date(movimentacoes[i + 1].dataHora))
        : new Date();
      const horas = +((saida - entrada) / 3_600_000).toFixed(1);
      return { setor: h.etapa, horas };
    });
  }

  /** Retorna o rótulo amigável de uma prioridade. */
  function labelPrioridade(p) {
    return { baixa: 'Baixa', normal: 'Normal', alta: 'Alta', urgente: 'URGENTE' }[p] ?? p;
  }

  /* ── Listeners ── */

  /**
   * Escuta a coleção motores em tempo real.
   * @param {Function} callback (motores: Array) => void
   * @returns {Function} unsubscribe
   */
  function escutarMotores(callback) {
    return db.collection('motores')
      .orderBy('atualizadoEm', 'desc')
      .onSnapshot(snap =>
        callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      );
  }

  /* ── Consultas ── */

  async function buscarPorId(id) {
    const doc = await db.collection('motores').doc(id).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : null;
  }

  async function buscarPorCodigo(codigo) {
    const snap = await db.collection('motores')
      .where('codigo', '==', codigo)
      .limit(1)
      .get();
    return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
  }

  /* ── API Pública ── */
  return {
    SETORES_ORIGEM,
    ETAPAS_MANUTENCAO,
    TIPOS_REPARO,
    gerarCodigo,
    cadastrar,
    avancarEtapa,
    registrarDiagnostico,
    registrarReparo,
    registrarTesteFinal,
    calcularStatusPrazo,
    calcularTemposPorEtapa,
    labelPrioridade,
    escutarMotores,
    buscarPorId,
    buscarPorCodigo,
  };
})();
