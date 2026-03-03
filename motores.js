const Motores = (() => {
  const SETORES_ORIGEM = [
    { id: 'usinagem',     label: 'Usinagem'      },
    { id: 'producao',     label: 'Produção'       },
    { id: 'compressores', label: 'Compressores'   },
    { id: 'caldeiraria',  label: 'Caldeiraria'    },
    { id: 'utilidades',   label: 'Utilidades'     },
    { id: 'extrusao',     label: 'Extrusão'       },
    { id: 'outro',        label: 'Outro'          }
  ];
  const ETAPAS_MANUTENCAO = [
    { id: 'entrada_manutencao', label: 'Entrada na Manutenção', cor: '#60a0ff',
      desc: 'Motor recebido pelo setor de manutenção' },
    { id: 'analise_tecnica',    label: 'Análise Técnica',       cor: '#f0a500',
      desc: 'Inspeção visual, elétrica e mecânica para identificar o problema' },
    { id: 'diagnostico',        label: 'Diagnóstico',           cor: '#c060ff',
      desc: 'Causa raiz identificada e plano de reparo definido' },
    { id: 'aguardando_pecas',   label: 'Aguardando Peças',      cor: '#ff9040',
      desc: 'Motor aguardando chegada de peças/componentes para reparo' },
    { id: 'em_reparo',          label: 'Em Reparo',             cor: '#ff6060',
      desc: 'Reparo em execução: troca de peças, rolamentos, rebobinamento etc.' },
    { id: 'teste_final',        label: 'Teste Final',           cor: '#40d0ff',
      desc: 'Motor remontado e em fase de testes operacionais' },
    { id: 'concluido',          label: 'Concluído / Retornado', cor: '#00c97a',
      desc: 'Motor aprovado nos testes e devolvido ao setor de origem' }
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
    'Múltiplos Reparos ou diversos não listados acima)'
  ];
  function gerarCodigo() {
    const agora = new Date();
    const data  = agora.toISOString().slice(0,10).replace(/-/g,'');
    const rand  = Math.floor(1000 + Math.random() * 9000);
    return `MN-${data}-${rand}`;
  }
  async function cadastrar(dados) {
    const codigo = gerarCodigo();
    const agora  = firebase.firestore.Timestamp.now();
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
      prazoRetorno:     dados.prazoRetorno      || '',
      etapaAtual:       'entrada_manutencao',
      status:           'em_andamento',
      resultado:        null,
      dadosTecnicos:    {},
      reparo:           null,
      testeFinal:       null,
      diagnostico:      null,
      abertoEm:         agora,
      abertoBy:         Auth.getUser().email,
      atualizadoEm:     agora,
      historico: [{
        etapa:       'entrada_manutencao',
        tipo:        'movimentacao',
        dataHora:    agora,
        responsavel: Auth.getUser().email,
        obs: `Chamado aberto. Setor de origem: ${dados.setorOrigem}. Problema relatado: ${dados.problemaRelatado}`
      }]
    };
    const docRef = await db.collection('motores').add(motor);
    return { id: docRef.id, ...motor };
  }
  async function avancarEtapa(motorId, novaEtapa, obs) {
    const agora     = firebase.firestore.Timestamp.now();
    const etapaInfo = ETAPAS_MANUTENCAO.find(e => e.id === novaEtapa);
    const update = {
      etapaAtual:   novaEtapa,
      atualizadoEm: agora,
      historico: firebase.firestore.FieldValue.arrayUnion({
        etapa:       novaEtapa,
        tipo:        'movimentacao',
        dataHora:    agora,
        responsavel: Auth.getUser().email,
        obs:         obs || etapaInfo?.desc || ''
      })
    };
    if (novaEtapa === 'concluido') {
      update.status      = 'concluido';
      update.concluidoEm = agora;
    }
    await db.collection('motores').doc(motorId).update(update);
  }
  async function registrarDiagnostico(motorId, dados) {
    const agora = firebase.firestore.Timestamp.now();
    await db.collection('motores').doc(motorId).update({
      diagnostico: {
        causaRaiz:          dados.causaRaiz,
        tipoFalha:          dados.tipoFalha,
        necessitaReparo:    dados.necessitaReparo,
        pecasNecessarias:   dados.pecasNecessarias   || '',
        estimativaDias:     dados.estimativaDias      || '',
        tecnicoResponsavel: Auth.getUser().email,
        registradoEm:       agora
      },
      dadosTecnicos: {
        resistenciaIsolamento:  dados.resistenciaIsolamento  || '',
        resistenciaEnrolamento: dados.resistenciaEnrolamento || '',
        corrente:               dados.corrente               || '',
        temperatura:            dados.temperatura            || '',
        vibracao:               dados.vibracao               || '',
        unidadeVib:             dados.unidadeVib             || 'mm/s',
        obs:                    dados.obsMedicoes            || ''
      },
      atualizadoEm: agora,
      historico: firebase.firestore.FieldValue.arrayUnion({
        etapa:       'diagnostico',
        tipo:        'diagnostico',
        dataHora:    agora,
        responsavel: Auth.getUser().email,
        obs: `Diagnóstico: ${dados.causaRaiz} | Falha: ${dados.tipoFalha} | Reparo necessário: ${dados.necessitaReparo ? 'Sim' : 'Não'}`
      })
    });
  }
  async function registrarReparo(motorId, dados) {
    const agora = firebase.firestore.Timestamp.now();
    await db.collection('motores').doc(motorId).update({
      reparo: {
        tiposIntervencao: dados.tiposIntervencao || [],
        descricaoServico: dados.descricaoServico,
        pecasUtilizadas:  dados.pecasUtilizadas  || '',
        executadoPor:     Auth.getUser().email,
        executadoEm:      agora
      },
      atualizadoEm: agora,
      historico: firebase.firestore.FieldValue.arrayUnion({
        etapa:       'em_reparo',
        tipo:        'reparo',
        dataHora:    agora,
        responsavel: Auth.getUser().email,
        obs: `Intervenções: ${(dados.tiposIntervencao || []).join(', ') || '—'} | ${dados.descricaoServico}`
      })
    });
  }
  async function registrarTesteFinal(motorId, dados) {
    const agora = firebase.firestore.Timestamp.now();
    const labels = {
      'aprovado':            'Aprovado — Apto para retorno ao setor',
      'reprovado_sucateado': 'Reprovado — Motor sucateado',
      'substituido':         'Motor substituído por unidade nova'
    };
    await db.collection('motores').doc(motorId).update({
      testeFinal: {
        resultado:    dados.resultado,
        vibracao:     dados.vibracao    || '',
        unidadeVib:   dados.unidadeVib  || 'mm/s',
        temperatura:  dados.temperatura || '',
        corrente:     dados.corrente    || '',
        observacoes:  dados.observacoes || '',
        testadoPor:   Auth.getUser().email,
        testadoEm:    agora
      },
      resultado:     dados.resultado,
      etapaAtual:    'concluido',
      status:        'concluido',
      concluidoEm:   agora,
      atualizadoEm:  agora,
      historico: firebase.firestore.FieldValue.arrayUnion({
        etapa:       'concluido',
        tipo:        'conclusao',
        dataHora:    agora,
        responsavel: Auth.getUser().email,
        obs: `${labels[dados.resultado] || dados.resultado}. ${dados.observacoes || ''}`
      })
    });
  }
  function calcularStatusPrazo(prazoStr) {
    if (!prazoStr) return { tipo: 'ok', label: 'Sem prazo definido', dias: null };
    const hoje   = new Date(); hoje.setHours(0,0,0,0);
    const prazo  = new Date(prazoStr + 'T00:00:00');
    const dias   = Math.ceil((prazo - hoje) / 86400000);
    if (dias < 0)  return { tipo: 'atrasado', label: `${Math.abs(dias)}d em atraso`, dias };
    if (dias <= 2) return { tipo: 'alerta',   label: `${dias}d para o prazo`,        dias };
    return              { tipo: 'ok',        label: `${dias}d para o prazo`,         dias };
  }
  function calcularTemposPorEtapa(historico) {
    if (!historico || historico.length === 0) return [];
    const movs = historico.filter(h => h.tipo === 'movimentacao');
    return movs.map((h, i) => {
      const entrada = h.dataHora?.toDate ? h.dataHora.toDate() : new Date(h.dataHora);
      const saida   = movs[i + 1]
        ? (movs[i + 1].dataHora?.toDate ? movs[i + 1].dataHora.toDate() : new Date(movs[i + 1].dataHora))
        : new Date();
      const horas = +((saida - entrada) / 3600000).toFixed(1);
      return { setor: h.etapa, horas };
    });
  }
  function labelPrioridade(p) {
    return { baixa:'Baixa', normal:'Normal', alta:'Alta', urgente:'URGENTE' }[p] || p;
  }
  function escutarMotores(callback) {
    return db.collection('motores')
      .orderBy('atualizadoEm', 'desc')
      .onSnapshot(snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }
  async function buscarPorId(id) {
    const doc = await db.collection('motores').doc(id).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : null;
  }
  async function buscarPorCodigo(codigo) {
    const snap = await db.collection('motores').where('codigo', '==', codigo).limit(1).get();
    return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
  }
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
    buscarPorCodigo
  };
})(); //ass