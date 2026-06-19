# MotorTrack 2.0

Sistema de rastreamento e gestão de manutenção de motores elétricos industriais.
Versão refatorada com arquitetura modular, código limpo e área pública completa.

---

## Estrutura do Projeto

```
mototrack2.0/
├── main.html                        ← Entrada raiz (redireciona para homepage)
│
├── shared/                          ← Compartilhado entre áreas pública e restrita
│   ├── css/
│   │   └── base.css                 ← Design tokens, reset, componentes base (botões, modais, toasts, badges)
│   └── js/
│       ├── firebase-config.js       ← Inicialização do Firebase (auth + db)
│       └── toast.js                 ← Notificações toast (sucesso, erro, aviso, info)
│
├── public/                          ← Área pública (sem autenticação)
│   ├── css/
│   │   └── public.css               ← Estilos da navbar, hero, seções, footer, responsivo
│   └── html/
│       ├── homepage.html            ← Página inicial com stats em tempo real
│       ├── services.html            ← Detalhamento de todos os serviços
│       ├── portfolio.html           ← Portfólio dinâmico com filtros por setor
│       ├── aboutus.html             ← Sobre o sistema, missão, tecnologias
│       ├── contacts.html            ← Formulário de contato
│       └── myequipment.html         ← Consulta pública de OS por código / QR Code URL
│
└── limited/                         ← Área restrita (requer login Firebase Auth)
    ├── index.html                   ← SPA principal: login + dashboard + chamados + usuários
    ├── css/
    │   └── app.css                  ← Estilos do painel: topbar, páginas, tabelas, pipeline, responsivo
    └── js/
        ├── auth.js                  ← Login, logout, perfil Firestore, criação de usuários
        ├── motores.js               ← CRUD, etapas, diagnóstico, reparo, teste final, prazo, histórico
        ├── dashboard.js             ← Renderização: stats, pipeline, tabelas, modal detalhe
        ├── qrscanner.js             ← Câmera, loop jsQR, resultado QR
        └── app.js                   ← Controlador principal: init, navegação, modais, QR print
```

---

## Funcionalidades (preservadas do mototrack-main)

### Área Restrita (`/limited/`)
- **Login/Logout** com Firebase Auth
- **Dashboard** com 4 cards de estatística e pipeline de 7 etapas em tempo real
- **Chamados** com filtros por etapa, setor, prioridade, status e busca textual
- **Abertura de Chamado** com todos os campos: modelo, tag, setor de origem, problema, prioridade, prazo
- **Fluxo de 7 Etapas**:
  1. Entrada na Manutenção
  2. Análise Técnica → formulário de diagnóstico com medições elétricas
  3. Diagnóstico
  4. Aguardando Peças
  5. Em Reparo → checklist de tipos de intervenção
  6. Teste Final → resultado, vibração, temperatura, corrente
  7. Concluído / Retornado
- **Modal de Detalhe** com histórico completo, tempo por etapa e QR Code
- **QR Code** — geração, impressão/download em alta resolução
- **Scanner QR** — câmera com loop jsQR, mira animada, resultado com detalhe
- **Gerenciamento de Usuários** (admin): criar, editar, excluir com confirmação de senha
- **Tema claro/escuro** com persistência em localStorage
- **Responsivo** total com hamburger menu

### Área Pública (`/public/`)
- **Homepage** com hero, serviços em destaque, how-it-works e stats em tempo real
- **Serviços** com descrição detalhada de todos os 6 tipos de manutenção
- **Portfólio** dinâmico com dados reais do Firestore, filtros por setor
- **Sobre** com missão, fluxo visual, diferenciais e tecnologias
- **Contato** com formulário e informações da equipe
- **Meu Equipamento** — consulta pública de OS por código com progresso visual, histórico e FAQ

---

## Melhorias da versão 2.0

| Aspecto | mototrack-main | mototrack 2.0 |
|---|---|---|
| Arquitetura | 1 HTML + 1 CSS + 4 JS | Modular: `shared/`, `public/`, `limited/` |
| CSS | 1 arquivo monolítico (~900 linhas) | `base.css` (tokens + componentes) + `app.css` + `public.css` |
| JavaScript | 4 arquivos com funções globais misturadas | 5 módulos IIFE com responsabilidade única |
| Área pública | Não existia | 6 páginas completas com conteúdo real e dados do Firebase |
| Documentação | Nenhuma | README + JSDoc em todos os módulos |
| Separação de responsabilidade | App.js fazia tudo | Auth / Motores / Dashboard / QRScanner / App separados |
| Responsivo | Básico | Hamburger menu, cards empilhados, tabela responsiva com data-label |
| Constantes | Espalhadas | Centralizadas em `Motores.SETORES_ORIGEM`, `Motores.ETAPAS_MANUTENCAO`, `Motores.TIPOS_REPARO` |
| Prazo/Status | Calculado inline | `Motores.calcularStatusPrazo()` e `calcularTemposPorEtapa()` reutilizáveis |
| Consulta pública | Via URL `?motor=` na área restrita | Página dedicada `myequipment.html` com UX completa |

---

## Configuração Firebase

As credenciais estão em `shared/js/firebase-config.js`.
O projeto usa Firebase 9.x (compat SDK).

**Coleções Firestore:**
- `usuarios` — perfis de usuário (nome, setor, email)
- `motores` — todos os chamados de manutenção

---

## Dependências externas (CDN)

| Biblioteca | Versão | Uso |
|---|---|---|
| Firebase App (compat) | 9.23.0 | Base Firebase |
| Firebase Auth (compat) | 9.23.0 | Autenticação |
| Firebase Firestore (compat) | 9.23.0 | Banco de dados |
| QRCode.js | 1.0.0 | Geração de QR Code |
| jsQR | 1.4.0 | Leitura de QR Code via câmera |
| Google Fonts | — | Plus Jakarta Sans, JetBrains Mono, Sora |

---

*SENAI Ipatinga — CFP Rinaldo Campos Soares*
