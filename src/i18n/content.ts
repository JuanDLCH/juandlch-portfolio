// Copy and data lifted from the Signal design (EN/ES). Cases, cycle, domains, etc. are built per language.
export type RawFlowNode = {
  label: string;
  meta: string;
  hot: boolean;
  kind?: 'split' | 'loop';
  parts?: string[];
};

const EN = {
  // Link previews (LinkedIn, WhatsApp, Slack…): crawlers read the English one.
  shareTitle: 'Juan Diego Londoño — AI Engineer',
  // The 404 page.
  notFoundTitle: 'Page not found',
  notFoundText: 'This page doesn’t exist, or it moved.',
  notFoundHome: 'Back to the portfolio',
  notFoundSophie: 'Talk to Sophie',
  shareDesc:
    'I build agents, realtime voice and document AI that run inside real software, on AWS. Talk to my voice agent or chat with my CV: live demos, no sign-up.',
  // The privacy note (/privacy), linked from the footer and the labs.
  privacyLink: 'Privacy',
  privacyIntro:
    'This site has no accounts, ads or tracking cookies. Here is what it keeps, and why.',
  privacyVisitsH: 'Visits',
  privacyVisits:
    'Each page view records the page, the site you came from and your country. No IP address, user agent or cookie is stored. Cloudflare Web Analytics counts visits without cookies too. Your theme and language choice stay in your browser.',
  privacyLabH: 'The AI demos',
  privacyLab:
    'What you write to “Meet my AI” and the CV chat, and what you say to Sophie (as text), is stored without your name or IP, with emails and phone numbers masked, to see what visitors ask and improve the demos (a nightly job, also on OpenAI, groups them by topic). Usage and cost per demo are counted too. All of it is deleted after 180 days. The other demos only count usage: their messages aren’t kept.',
  privacyAiH: 'Who processes it',
  privacyAi:
    'Messages, files and voice go to OpenAI to get the answers (they aren’t used to train its models). Cloudflare hosts the site and checks you’re not a bot (Turnstile). Files you give the document demo are read in your browser; only the passages and pages the AI asks for are sent.',
  privacyLimitsH: 'Limits',
  privacyLimits:
    'To keep the demos free, daily limits are counted per network with a one-way code of your IP address, held for two days and never stored with what you write.',
  privacyContactH: 'Questions or deletion',
  privacyContact:
    'Write to juandiego0329@gmail.com and tell me roughly when you used a demo, and I’ll delete what you sent.',
  navLabel: 'Primary',
  navWork: 'Work',
  navLab: 'Lab',
  navExpertise: 'Expertise',
  menu: 'Menu',
  close: 'Close',
  mobileNote: 'Best experienced on desktop',
  navAbout: 'About',
  navContact: 'Contact',
  navCv: 'My CV ↓',
  cvMenu: 'Download my CV',
  talkCv: 'Speak to my CV',
  bookCall: 'Book a call with me',
  bookCallShort: 'Book a call',
  langGroup: 'Language',
  photoAlt: 'Photo of Juan Diego Londoño',
  role: 'AI Engineer · Solutions Architect',
  langEs: 'Spanish · native',
  langEn: 'English · professional',
  degree: 'Software Engineer',
  degreeMeta: 'B.SC. · 2022',
  heroA: 'I build AI that ',
  heroB: 'listens, reasons and acts',
  heroC: ' — inside real software.',
  heroSub:
    'Software engineer first. I design and ship agents, realtime voice and document AI for companies, from the first discovery call to the AWS infrastructure they run on.',
  ctaLab: 'Try my live demos',
  ctaWork: 'Selected work',
  agentSpeaking: 'Agent speaking',
  turnLabel: 'voice.turn 04 · illustrative',
  stUser: 'USER',
  stSpeech: 'speech',
  stStt: 'partials',
  stReason: 'reasoning',
  stAgent: 'AGENT',
  stTool: 'TOOL',
  figCaption:
    'One turn of a conversation: the agent listens, transcribes, thinks, checks a system and answers — and you can interrupt it at any point.',
  aboutTitle: 'From full stack to AI at scale',
  aboutA:
    'I spent my first years shipping ERP systems, cloud backends and integrations. That is why the AI I build today comes with ',
  aboutB: 'integration with your systems, infrastructure and a cost estimate',
  aboutC: ' — not just a prompt.',
  tl1t: 'Software that runs a business',
  tl1: 'Two ERP systems, end to end',
  tl2t: 'Systems that talk to each other',
  tl2: 'APIs, integrations and data on AWS for clients',
  tl3t: 'AI that ships to production',
  tl3: 'Led the team: agents, voice, document AI and architecture on AWS',
  tl4t: 'What’s next',
  tl4: 'A new chapter starts soon',
  tlNow: 'Next',
  leadTitle: 'Leading AI projects',
  leadIntro:
    'As Lead AI Engineer I guided projects from a client’s first question to a system in production — working with a small team, sales and other engineering groups.',
  workTitle: 'Selected engineering work',
  workNote: 'Clients anonymized · diagrams recreated',
  recreated: 'Recreated · no client code',
  problem: 'The problem',
  contribution: 'My contribution',
  readCase: 'Read the case study',
  videoSlot: '[VIDEO · IF AUTHORIZED]',
  alsoLabel: 'Also ·',
  alsoBody:
    'document extraction with OCR and agents for financial services, HubSpot CRM integrations, and data pipelines on AWS.',
  labTitle: 'The Lab',
  labA: 'Don’t take my word for it. ',
  labB: 'Talk to it.',
  labSub:
    'Both run live, free and with no sign-up: talk to my voice agent or try the chat with your own files. Each visitor gets a daily allowance — plenty to see how they work.',
  lab1Tag: 'Lab 01 · Flagship',
  lab1Body:
    'Talk to Sophie, a realtime voice agent that knows my work. Interrupt her anytime; captions as she speaks.',
  lab2Tag: 'Lab 02 · Agents',
  lab2Body:
    'Text, images, documents and audio — and you see every step the agent takes, live: what it checks and what it finds.',
  labOpen: 'Open the demo',
  labLive: 'Live demo',
  labFree: 'Free · no sign-up',
  pvSim: 'Simulated preview',
  pvYou: 'You',
  pvAgent: 'Sophie',
  voiceUser: 'Has he built voice agents?',
  voiceAgent:
    'Yes. He worked on realtime voice agents that take restaurant orders…',
  chatFile: 'menu.pdf',
  chatUser: 'Which of these dishes are vegetarian?',
  toolResult: '3 matches',
  chatAgent:
    'Three of them: the garden bowl, the falafel wrap and the veggie pizza.',
  chatPlaceholder: 'Ask anything, attach a file or speak…',
  stackTitle: 'Stack',
  awsTag: 'Home ground · AWS',
  awsLeadA: 'Most of what I ship runs on AWS. ',
  awsLeadB: ' is my default for production GenAI.',
  awsBody:
    'I pick the right model for each job (Claude is my go-to) and run agents on Bedrock AgentCore, connected to automated workflows on AWS. I also gave technical support to my company’s AWS Generative AI Competency certification.',
  awsFlex:
    'AWS is my focus, not my limit — I work with whichever cloud or model provider a project requires, Google Cloud and Cloudflare among them.',
  awsIconsLabel: 'AWS services I work with',
  toolboxLabel: 'Full toolbox',
  ragTitle: 'Retrieval & RAG',
  ragA: 'Retrieval that ',
  ragB: 'earns its answers.',
  ragSub:
    'When an agent answers from a company’s documents, it first has to find the right passage. So my agents don’t get a bare top-k: every question is rewritten, searched by keywords and by meaning, reranked and checked by a validator before anything is answered.',
  ragFigTag: 'Fig. 05 · retrieval loop',
  ragFigLabel: 'RAG pipeline diagram',
  prTitle: 'Engineering principles',
  certTitle: 'Certifications',
  certNote: 'Verifiable on Credly',
  verify: 'Verify →',
  expires: 'Expires',
  locale: 'en-US',
  footA: 'Have a workflow\nthat should ',
  footB: 'think?',
  toLight: 'Switch to light mode',
  toDark: 'Switch to dark mode',
  backToTop: 'Back to top',
  sophieLabel: 'Talk to Sophie, my voice agent: ask her anything about me',
  sophieEyebrow: 'Sophie · voice agent',
  sophieCta: 'Talk to her',
  // Lines Sophie types out in her bubble, one at a time ("|" separates them).
  sophieLines:
    'Ask me anything about Juan Diego. Out loud.|Hiring an AI engineer? I can tell you if he fits.|Psst… I know his whole CV by heart.|Which clouds does he use? Just ask me.|Curious what he builds? I’ll tell you in 5 minutes.',
  // Services mode (src/lab/site.ts, switched from /admin): the landing sells
  // freelance projects instead of looking for a job. `sv` overrides the keys
  // above with the same name on services.astro; the rest is new copy.
  sv: {
    shareTitle: 'Juan Diego Londoño — AI for your business',
    shareDesc:
      'Chatbots, voice agents and AI that automates your processes, built by an AI engineer who ships to production. Try the live demos and book a call.',
    role: 'AI Engineer · Freelance projects',
    talkCv: 'Talk to my voice agent',
    heroA: 'AI for your business that ',
    heroB: 'answers, schedules and gets work done',
    heroC: ' — inside the tools you already use.',
    heroSub:
      'I design and build chatbots, voice agents and automations for companies, from the first call to the infrastructure they run on. Remote, project by project.',
    ctaWork: 'See what I can build',
    leadTitle: 'How I work with you',
    leadIntro:
      'From your first question to a system in production: I stay with the project end to end, and you know upfront what it will cost to build and to run.',
    footA: 'Have an idea or a process\nthat should ',
    footB: 'run itself?',
    sophieLines:
      'Have an idea for your business? Tell me.|Want a chatbot that takes orders? Ask me how.|I can tell you what Juan Diego has built.|Curious how AI could save you time? Ask me.|Want to talk with him? I’ll help you book a call.',
  },
  navServices: 'Services',
  servicesTitle: 'Services',
  servicesA: 'What I can build ',
  servicesB: 'for your business.',
  servicesSub:
    'Remote and project based. Every project comes with integration with your systems, the infrastructure it runs on and a cost estimate — not just a prompt.',
  servicesNote:
    'Not sure what you need? Tell me about the problem and we’ll find the right fit in a short call.',
  serviceTry: 'Try the demo',
  serviceTalk: 'Book a call',
  cvLink: 'My CV',
};

const ES: typeof EN = {
  shareTitle: 'Juan Diego Londoño — Ingeniero de IA',
  notFoundTitle: 'Página no encontrada',
  notFoundText: 'Esta página no existe, o cambió de lugar.',
  notFoundHome: 'Volver al portafolio',
  notFoundSophie: 'Habla con Sophie',
  shareDesc:
    'Construyo agentes, voz en tiempo real e IA documental que funcionan dentro de software real, en AWS. Habla con mi agente de voz o chatea con mi CV: demos en vivo, sin registro.',
  privacyLink: 'Privacidad',
  privacyIntro:
    'Este sitio no tiene cuentas, anuncios ni cookies de rastreo. Esto es lo que guarda, y para qué.',
  privacyVisitsH: 'Visitas',
  privacyVisits:
    'Cada visita registra la página, el sitio del que vienes y tu país. No se guarda tu dirección IP, tu navegador ni cookies. Cloudflare Web Analytics también cuenta visitas sin cookies. Tu tema e idioma se recuerdan solo en tu navegador.',
  privacyLabH: 'Las demos de IA',
  privacyLab:
    'Lo que escribes a “Meet my AI” y al chat del CV, y lo que le dices a Sophie (como texto), se guarda sin tu nombre ni tu IP, con correos y teléfonos ocultos, para ver qué preguntan los visitantes y mejorar las demos (un proceso nocturno, también con OpenAI, los agrupa por tema). También se cuenta el uso y el costo de cada demo. Todo se borra a los 180 días. Las demás demos solo cuentan el uso: sus mensajes no se guardan.',
  privacyAiH: 'Quién lo procesa',
  privacyAi:
    'Los mensajes, archivos y voz van a OpenAI para obtener las respuestas (no se usan para entrenar sus modelos). Cloudflare aloja el sitio y verifica que no seas un bot (Turnstile). Los archivos que le das a la demo de documentos se leen en tu navegador; solo se envían los pasajes y páginas que la IA pide.',
  privacyLimitsH: 'Límites',
  privacyLimits:
    'Para que las demos sigan siendo gratis, los límites diarios se cuentan por red con un código irreversible de tu IP, que se guarda dos días y nunca junto a lo que escribes.',
  privacyContactH: 'Preguntas o borrado',
  privacyContact:
    'Escríbeme a juandiego0329@gmail.com con la fecha aproximada en que usaste una demo y borro lo que enviaste.',
  navLabel: 'Principal',
  navWork: 'Trabajo',
  navLab: 'Lab',
  navExpertise: 'Especialidad',
  menu: 'Menú',
  close: 'Cerrar',
  mobileNote: 'Se disfruta mejor en escritorio',
  navAbout: 'Sobre mí',
  navContact: 'Contacto',
  navCv: 'Mi CV ↓',
  cvMenu: 'Descarga mi CV',
  talkCv: 'Habla con mi CV',
  bookCall: 'Agenda una llamada conmigo',
  bookCallShort: 'Agenda una llamada',
  langGroup: 'Idioma',
  photoAlt: 'Foto de Juan Diego Londoño',
  role: 'Ingeniero de IA · Arquitecto de Soluciones',
  langEs: 'Español · nativo',
  langEn: 'Inglés · profesional',
  degree: 'Ingeniero de Software',
  degreeMeta: '2022',
  heroA: 'Construyo IA que ',
  heroB: 'escucha, razona y actúa',
  heroC: ' — dentro de software real.',
  heroSub:
    'Ingeniero de software ante todo. Diseño y llevo a producción agentes, voz en tiempo real y procesamiento de documentos para empresas, desde la primera reunión de descubrimiento hasta la infraestructura en AWS donde corren.',
  ctaLab: 'Prueba mis demos en vivo',
  ctaWork: 'Trabajo seleccionado',
  agentSpeaking: 'Agente hablando',
  turnLabel: 'voice.turn 04 · ilustrativo',
  stUser: 'USUARIO',
  stSpeech: 'voz',
  stStt: 'parciales',
  stReason: 'razona',
  stAgent: 'AGENTE',
  stTool: 'HERRAMIENTA',
  figCaption:
    'Un turno de conversación: el agente escucha, transcribe, piensa, consulta un sistema y responde — y lo puedes interrumpir en cualquier momento.',
  aboutTitle: 'De full stack a IA a escala',
  aboutA:
    'Mis primeros años los pasé construyendo ERPs, backends en la nube e integraciones. Por eso la IA que construyo hoy viene con ',
  aboutB: 'conexión a tus sistemas, infraestructura y un estimado de costos',
  aboutC: ' — no solo un prompt.',
  tl1t: 'Software que mueve un negocio',
  tl1: 'Dos sistemas ERP, de principio a fin',
  tl2t: 'Sistemas que hablan entre sí',
  tl2: 'APIs, integraciones y datos en AWS para clientes',
  tl3t: 'IA que llega a producción',
  tl3: 'Lideré el equipo: agentes, voz, IA de documentos y arquitectura en AWS',
  tl4t: 'Lo que sigue',
  tl4: 'Un nuevo capítulo empieza pronto',
  tlNow: 'Pronto',
  leadTitle: 'Liderando proyectos de IA',
  leadIntro:
    'Como Lead AI Engineer guié proyectos desde la primera pregunta del cliente hasta un sistema en producción — junto a un equipo pequeño, el área comercial y otros equipos de ingeniería.',
  workTitle: 'Trabajo de ingeniería seleccionado',
  workNote: 'Clientes anonimizados · diagramas recreados',
  recreated: 'Recreado · sin código del cliente',
  problem: 'El problema',
  contribution: 'Mi aporte',
  readCase: 'Leer el caso',
  videoSlot: '[VIDEO · SI SE AUTORIZA]',
  alsoLabel: 'También ·',
  alsoBody:
    'extracción de documentos con OCR y agentes para servicios financieros, integraciones con HubSpot CRM y pipelines de datos en AWS.',
  labTitle: 'El Lab',
  labA: 'No me creas a mí. ',
  labB: 'Háblale.',
  labSub:
    'Los dos funcionan en vivo, gratis y sin registro: habla con mi agente de voz o prueba el chat con tus propios archivos. Cada visitante tiene un cupo diario — de sobra para ver cómo funcionan.',
  lab1Tag: 'Lab 01 · Principal',
  lab1Body:
    'Habla con Sophie, un agente de voz en tiempo real que conoce mi trabajo. Interrúmpela cuando quieras; subtítulos mientras habla.',
  lab2Tag: 'Lab 02 · Agentes',
  lab2Body:
    'Texto, imágenes, documentos y audio — y ves en vivo cada paso del agente: qué consulta y qué encuentra.',
  labOpen: 'Abrir la demo',
  labLive: 'Demo en vivo',
  labFree: 'Gratis · sin registro',
  pvSim: 'Vista simulada',
  pvYou: 'Tú',
  pvAgent: 'Sophie',
  voiceUser: '¿Ha construido agentes de voz?',
  voiceAgent:
    'Sí. Trabajó en agentes de voz en tiempo real que toman pedidos de restaurantes…',
  chatFile: 'menu.pdf',
  chatUser: '¿Cuáles de estos platos son vegetarianos?',
  toolResult: '3 resultados',
  chatAgent:
    'Tres: el bowl de la huerta, el wrap de falafel y la pizza vegetariana.',
  chatPlaceholder: 'Pregunta, adjunta un archivo o habla…',
  stackTitle: 'Stack',
  awsTag: 'Terreno propio · AWS',
  awsLeadA: 'Casi todo lo que llevo a producción corre en AWS. ',
  awsLeadB: ' es mi opción por defecto para GenAI en producción.',
  awsBody:
    'Elijo el modelo adecuado para cada caso (Claude es mi favorito) y monto los agentes sobre Bedrock AgentCore, conectados a procesos automáticos en AWS. También di soporte técnico a la certificación AWS Generative AI Competency de la compañía.',
  awsFlex:
    'AWS es mi enfoque, no mi límite — trabajo con la nube o el proveedor de modelos que cada proyecto requiera, Google Cloud y Cloudflare entre ellas.',
  awsIconsLabel: 'Servicios de AWS con los que trabajo',
  toolboxLabel: 'Caja de herramientas completa',
  ragTitle: 'Recuperación y RAG',
  ragA: 'Recuperación que ',
  ragB: 'se gana sus respuestas.',
  ragSub:
    'Cuando un agente responde con los documentos de una empresa, primero tiene que encontrar el pasaje correcto. Por eso mis agentes no reciben un top-k a secas: cada pregunta se reescribe, se busca por palabras clave y por significado, se reordena y un validador la revisa antes de responder.',
  ragFigTag: 'Fig. 05 · ciclo de recuperación',
  ragFigLabel: 'Diagrama del pipeline de RAG',
  prTitle: 'Principios de ingeniería',
  certTitle: 'Certificaciones',
  certNote: 'Verificables en Credly',
  verify: 'Verificar →',
  expires: 'Vence',
  locale: 'es-CO',
  footA: '¿Tienes un proceso\nque debería ',
  footB: 'pensar?',
  toLight: 'Cambiar a modo claro',
  toDark: 'Cambiar a modo oscuro',
  backToTop: 'Volver arriba',
  sophieLabel:
    'Habla con Sophie, mi agente de voz: pregúntale lo que quieras sobre mí',
  sophieEyebrow: 'Sophie · agente de voz',
  sophieCta: 'Habla con ella',
  sophieLines:
    'Pregúntame lo que quieras sobre Juan Diego. En voz alta.|¿Buscas un AI engineer? Te digo si encaja.|Psst… me sé su CV de memoria.|¿Qué nubes usa? Solo pregúntame.|¿Qué construye? Te lo cuento en 5 minutos.',
  sv: {
    shareTitle: 'Juan Diego Londoño — IA para tu negocio',
    shareDesc:
      'Chatbots, agentes de voz e IA que automatiza tus procesos, hechos por un ingeniero de IA que lleva sistemas a producción. Prueba las demos en vivo y agenda una llamada.',
    role: 'AI Engineer · Proyectos freelance',
    talkCv: 'Habla con mi agente de voz',
    heroA: 'IA para tu negocio que ',
    heroB: 'responde, agenda y resuelve',
    heroC: ' — dentro de las herramientas que ya usas.',
    heroSub:
      'Diseño y construyo chatbots, agentes de voz y automatizaciones para empresas, desde la primera llamada hasta la infraestructura en la que corren. Remoto, por proyecto.',
    ctaWork: 'Mira lo que puedo construir',
    leadTitle: 'Cómo trabajo contigo',
    leadIntro:
      'Desde tu primera pregunta hasta un sistema en producción: acompaño el proyecto de principio a fin, y sabes desde el inicio cuánto costará construirlo y operarlo.',
    footA: '¿Tienes una idea o un proceso\nque debería ',
    footB: 'andar solo?',
    sophieLines:
      '¿Tienes una idea para tu negocio? Cuéntame.|¿Quieres un chatbot que tome pedidos? Pregúntame cómo.|Te cuento lo que Juan Diego ha construido.|¿Cómo te podría ahorrar tiempo la IA? Pregúntame.|¿Quieres hablar con él? Te ayudo a agendar.',
  },
  navServices: 'Servicios',
  servicesTitle: 'Servicios',
  servicesA: 'Lo que puedo construir ',
  servicesB: 'para tu negocio.',
  servicesSub:
    'Remoto y por proyecto. Cada proyecto incluye la conexión con tus sistemas, la infraestructura en la que corre y un estimado de costos — no solo un prompt.',
  servicesNote:
    '¿No sabes bien qué necesitas? Cuéntame el problema y en una llamada corta encontramos la mejor opción.',
  serviceTry: 'Prueba la demo',
  serviceTalk: 'Agenda una llamada',
  cvLink: 'Mi CV',
};

function build(isEs: boolean) {
  const x = isEs ? ES : EN;
  const cycle = isEs
    ? [
        {
          tag: '01 · Entender',
          title: 'Entender la necesidad',
          body: 'Hablo directo con el cliente, mapeo el proceso real y separo lo que necesita IA de lo que no.',
        },
        {
          tag: '02 · Recomendar',
          title: 'Recomendar el enfoque',
          body: 'Elijo modelos y arquitectura según el caso — balanceando calidad, latencia y costo — y diagramo la solución completa.',
        },
        {
          tag: '03 · Estimar',
          title: 'Estimar costos y tiempos',
          body: 'Dimensiono infraestructura, consumo de modelos y esfuerzo para que la propuesta se sostenga después de firmada.',
        },
        {
          tag: '04 · Coordinar',
          title: 'Coordinar el trabajo',
          body: 'Divido y delego tareas en el equipo, y sumo a otras áreas cuando el proyecto lo necesita.',
        },
        {
          tag: '05 · Acompañar',
          title: 'Acompañar la entrega',
          body: 'Sigo involucrado en la implementación, reviso decisiones técnicas y defino la estrategia de desarrollo con IA.',
        },
      ]
    : [
        {
          tag: '01 · Understand',
          title: 'Understand the need',
          body: 'Talk directly with the client, map the real workflow and separate what needs AI from what doesn’t.',
        },
        {
          tag: '02 · Recommend',
          title: 'Recommend the approach',
          body: 'Choose models and architecture for the job — weighing quality, latency and cost — and diagram the solution end to end.',
        },
        {
          tag: '03 · Estimate',
          title: 'Estimate cost and time',
          body: 'Size infrastructure, model usage and effort so the proposal still holds after it is signed.',
        },
        {
          tag: '04 · Coordinate',
          title: 'Coordinate the work',
          body: 'Split and delegate tasks across the team, and bring in other teams when the project needs them.',
        },
        {
          tag: '05 · Support',
          title: 'Support delivery',
          body: 'Stay hands-on through implementation, review technical decisions and shape the AI development strategy.',
        },
      ];

  const mkFlow = function (nodes: [string, string?][]): RawFlowNode[] {
    return nodes.map(function (n: [string, string?]) {
      const hot = n[0].charAt(0) === '*';
      return { label: hot ? n[0].slice(1) : n[0], meta: n[1] || '', hot: hot };
    });
  };
  const ragFlow: RawFlowNode[] = isEs
    ? [
        ...mkFlow([
          ['Pregunta', 'usuario'],
          ['Reescritura de consulta', 'reescribir · descomponer'],
        ]),
        {
          label: 'Recuperación híbrida',
          meta: 'ranking fusionado',
          hot: false,
          kind: 'split',
          parts: ['Keyword search', 'Vector search'],
        },
        ...mkFlow([
          ['Reranking', 'top-k → top-n'],
          ['*Agente validador', '¿alcanza?'],
        ]),
        {
          label: '↺ No alcanza → reformular y buscar de nuevo',
          meta: '',
          hot: false,
          kind: 'loop',
        },
        ...mkFlow([['Respuesta', 'fundamentada']]),
      ]
    : [
        ...mkFlow([
          ['Question', 'user'],
          ['Query rewrite', 'rewrite · decompose'],
        ]),
        {
          label: 'Hybrid retrieval',
          meta: 'fused ranking',
          hot: false,
          kind: 'split',
          parts: ['Keyword search', 'Vector search'],
        },
        ...mkFlow([
          ['Reranker', 'top-k → top-n'],
          ['*Validator agent', 'enough?'],
        ]),
        {
          label: '↺ Not enough → rewrite and search again',
          meta: '',
          hot: false,
          kind: 'loop',
        },
        ...mkFlow([['Answer', 'grounded']]),
      ];

  const ragIdeas = (
    isEs
      ? [
          [
            'Reescribir antes de buscar',
            'Las preguntas ambiguas o de varias partes se reescriben o se dividen en subconsultas antes de buscar.',
          ],
          [
            'Palabras clave y significado, no uno solo',
            'Buscar por palabras clave y por significado encuentra cosas distintas; los resultados se fusionan en un solo ranking.',
          ],
          [
            'Reordenar lo recuperado',
            'Una pasada de reranking pone primero los pasajes más relevantes antes de que lleguen al agente.',
          ],
          [
            'Validar antes de responder',
            'Un agente validador decide si el contexto alcanza y devuelve la consulta cuando no.',
          ],
        ]
      : [
          [
            'Rewrite before searching',
            'Ambiguous or multi-part questions are rewritten or split into sub-queries before any search runs.',
          ],
          [
            'Keywords and meaning, not one or the other',
            'Searching by keywords and by meaning catches different things; results are fused into a single ranking.',
          ],
          [
            'Rerank what you retrieve',
            'A reranking pass puts the most relevant passages first before they reach the agent.',
          ],
          [
            'Validate before answering',
            'A validator agent decides whether the context is enough, and sends the query back when it is not.',
          ],
        ]
  ).map(function (r: string[], i: number) {
    return { n: '0' + (i + 1), title: r[0], body: r[1] };
  });

  const cases = isEs
    ? [
        {
          href: '#case-voice',
          tag: 'Caso 01 · Comida rápida · Drive-thru · IA de voz',
          title: 'Agentes de voz que toman pedidos en tiempo real',
          problem:
            'En el drive-thru, el cliente llega al parlante y habla: pide, cambia de opinión, pregunta por el menú y las promociones, y espera respuesta al instante. La operación necesitaba un agente que atendiera esas conversaciones con naturalidad en horas pico, entendiera pedidos con ruido de fondo e interrupciones, y los registrara directo en sus sistemas.',
          role: 'Desarrollé la integración de voz en tiempo real con ElevenLabs usando modelos de Claude: audio en vivo, saber cuándo el cliente terminó de hablar o lo interrumpe, recordar el pedido en curso y registrarlo en los sistemas de menú y pedidos.',
          stack: ['ElevenLabs', 'Claude', 'Deepgram', 'WebSockets', 'AWS'],
          figTag: 'Fig. 01 · turno de voz',
          figLabel: 'Diagrama del pipeline de voz',
          flow: mkFlow([
            ['Cliente en el drive-thru', 'audio en vivo'],
            ['STT en streaming', 'parciales'],
            ['*Agente de voz', 'Claude · tools'],
            ['APIs de menú y pedidos', 'tool call'],
            ['TTS en streaming', 'interrumpible'],
          ]),
        },
        {
          href: '#case-cinema',
          tag: 'Caso 02 · Cadena de cines · IA conversacional y recomendaciones',
          title: 'Un asistente de cine que conoce la cartelera',
          problem:
            'El público pregunta qué hay en cartelera, dónde, a qué hora y qué le podría gustar. El cine necesitaba un asistente en sus canales digitales que respondiera con información real y recomendara — no un bot de preguntas frecuentes.',
          role: 'Trabajé en el agente conversacional y sus integraciones: recuperación de información sobre la cartelera, lógica de recomendaciones, integraciones backend y la arquitectura en AWS que lo soporta.',
          stack: ['LLMs', 'RAG', 'Backend APIs', 'Canales digitales', 'AWS'],
          figTag: 'Fig. 02 · conversación',
          figLabel: 'Diagrama del asistente de cine',
          flow: mkFlow([
            ['Mensaje del usuario', 'canales digitales'],
            ['*Agente conversacional', 'intención · contexto'],
            ['Recuperación', 'cartelera · funciones'],
            ['Recomendaciones', 'preferencias'],
            ['Respuesta', 'en el canal'],
          ]),
        },
        {
          href: '#case-whatsapp',
          tag: 'Caso 03 · Seguros · IA conversacional',
          title: 'Un asistente de seguros en WhatsApp',
          problem:
            'Los asegurados ya escriben por WhatsApp. La aseguradora necesitaba que ahí mismo pudieran consultar su póliza, validar si un caso está cubierto y abrir una reclamación, con respuestas basadas en sus datos reales y sus reglas — no un chatbot aislado.',
          role: 'Construí y evolucioné las conversaciones sobre la API oficial de WhatsApp de Meta: recibir y procesar cada mensaje, la lógica del negocio, la conexión con los sistemas de la aseguradora y la migración de los flujos antiguos.',
          stack: [
            'WhatsApp Business Platform',
            'Meta Cloud API',
            'Webhooks',
            'LLMs',
            'AWS',
          ],
          figTag: 'Fig. 03 · conversación',
          figLabel: 'Diagrama del flujo conversacional en WhatsApp',
          flow: mkFlow([
            ['Mensaje de WhatsApp', 'Meta Cloud API'],
            ['Webhook', 'eventos'],
            ['*Orquestador conversacional', 'estado · reglas'],
            ['APIs de la aseguradora', 'pólizas · reclamos'],
            ['Respuesta en WhatsApp', 'texto · plantillas'],
          ]),
        },
        {
          href: '#case-edu',
          tag: 'Caso 04 · Educación · Automatización con IA',
          title: 'Evaluación automática de clases grabadas',
          problem:
            'Revisar grabaciones de clases a mano no escala. La plataforma necesitaba evaluaciones estructuradas y consistentes que pudiera usar dentro de su propia aplicación.',
          role: 'Participé en la arquitectura y el desarrollo: procesamiento de audio, transcripción, evaluación basada en agentes y reportes que la app del cliente usa directamente.',
          stack: ['Amazon Transcribe', 'Step Functions', 'LLMs', 'RAG'],
          figTag: 'Fig. 04 · flujo de evaluación',
          figLabel: 'Diagrama del flujo de evaluación',
          flow: mkFlow([
            ['Grabación de clase', 'audio'],
            ['Amazon Transcribe', 'texto'],
            ['Step Functions', 'orquestación'],
            ['*Agentes evaluadores', 'LLM · RAG'],
            ['Reporte JSON → app del cliente', 'API'],
          ]),
        },
      ]
    : [
        {
          href: '#case-voice',
          tag: 'Case 01 · Quick-service · Drive-thru · Voice AI',
          title: 'Voice agents that take orders in real time',
          problem:
            'At the drive-thru, customers pull up to the speaker and talk: they order, change their minds, ask about the menu and deals, and expect an answer right away. The operation needed an agent that handles those conversations naturally at rush hour, understands orders through background noise and interruptions, and puts them straight into its systems.',
          role: 'Built the realtime voice integration with ElevenLabs on Claude models: live audio, knowing when the customer has finished talking or cuts in, keeping track of the order in progress, and placing it in the menu and ordering systems.',
          stack: ['ElevenLabs', 'Claude', 'Deepgram', 'WebSockets', 'AWS'],
          figTag: 'Fig. 01 · voice turn',
          figLabel: 'Voice pipeline diagram',
          flow: mkFlow([
            ['Drive-thru customer', 'live audio'],
            ['Streaming STT', 'partials'],
            ['*Voice agent', 'Claude · tools'],
            ['Menu & order APIs', 'tool call'],
            ['Streaming TTS', 'interruptible'],
          ]),
        },
        {
          href: '#case-cinema',
          tag: 'Case 02 · Cinema chain · Conversational AI & recommendations',
          title: 'A movie assistant that knows the listings',
          problem:
            'Moviegoers ask what’s playing, where, when — and what they might enjoy. The cinema needed an assistant on its digital channels that answers from real data and recommends, not a scripted FAQ bot.',
          role: 'Worked on the conversational agent and its integrations: retrieval over the listings, recommendation logic, backend integrations and the AWS architecture behind it.',
          stack: ['LLMs', 'RAG', 'Backend APIs', 'Digital channels', 'AWS'],
          figTag: 'Fig. 02 · conversation',
          figLabel: 'Cinema assistant diagram',
          flow: mkFlow([
            ['User message', 'digital channels'],
            ['*Conversational agent', 'intent · context'],
            ['Retrieval', 'listings · showtimes'],
            ['Recommendations', 'preferences'],
            ['Answer', 'in channel'],
          ]),
        },
        {
          href: '#case-whatsapp',
          tag: 'Case 03 · Insurance · Conversational AI',
          title: 'An insurance assistant on WhatsApp',
          problem:
            'Policyholders already write on WhatsApp. The insurer needed them to check their policy, confirm whether something is covered and file a claim right there, answered from its real data and rules — not a disconnected chatbot.',
          role: 'Built and evolved the conversations on Meta’s official WhatsApp API: receiving and handling every message, the business logic, the connection to the insurer’s systems, and moving the old flows over.',
          stack: [
            'WhatsApp Business Platform',
            'Meta Cloud API',
            'Webhooks',
            'LLMs',
            'AWS',
          ],
          figTag: 'Fig. 03 · conversation',
          figLabel: 'WhatsApp conversation flow diagram',
          flow: mkFlow([
            ['WhatsApp message', 'Meta Cloud API'],
            ['Webhook', 'events'],
            ['*Conversation orchestrator', 'state · rules'],
            ['Insurer APIs', 'policies · claims'],
            ['WhatsApp reply', 'text · templates'],
          ]),
        },
        {
          href: '#case-edu',
          tag: 'Case 04 · Education · AI automation',
          title: 'Assessing recorded classes automatically',
          problem:
            'Reviewing class recordings by hand doesn’t scale. The platform needed structured, consistent evaluations it could use inside its own app.',
          role: 'Took part in the architecture and development: audio processing, transcription, agent-based evaluation and reports the client’s app uses directly.',
          stack: ['Amazon Transcribe', 'Step Functions', 'LLMs', 'RAG'],
          figTag: 'Fig. 04 · evaluation flow',
          figLabel: 'Evaluation flow diagram',
          flow: mkFlow([
            ['Class recording', 'audio'],
            ['Amazon Transcribe', 'text'],
            ['Step Functions', 'orchestration'],
            ['*Evaluation agents', 'LLM · RAG'],
            ['JSON report → client app', 'API'],
          ]),
        },
      ];

  // `icon` is the file name in src/assets/aws (resolved in Stack.astro).
  const awsIcons = [
    ['bedrock', 'Bedrock'],
    ['agentcore', 'AgentCore'],
    ['nova', 'Nova'],
    ['transcribe', 'Transcribe'],
    ['textract', 'Textract'],
    ['lambda', 'Lambda'],
    ['ec2', 'EC2'],
    ['stepfunctions', 'Step Functions'],
    ['eventbridge', 'EventBridge'],
    ['sqs', 'SQS'],
    ['sns', 'SNS'],
    ['apigateway', 'API Gateway'],
    ['cloudfront', 'CloudFront'],
    ['waf', 'WAF'],
    ['dynamodb', 'DynamoDB'],
    ['aurora', 'Aurora'],
    ['s3', 'S3'],
    ['pinpoint', 'Pinpoint'],
    ['secretsmanager', 'Secrets Manager'],
    ['cloudwatch', 'CloudWatch'],
  ].map(function (a: string[]) {
    return { icon: a[0], name: a[1] };
  });

  const domains = isEs
    ? [
        {
          title: 'Sistemas agénticos',
          body: 'Agentes que usan herramientas, recuerdan el contexto y piden aprobación, con pasos claros y revisables.',
          tools: 'LangGraph · MCP · Bedrock AgentCore · Claude',
        },
        {
          title: 'IA de voz en tiempo real',
          body: 'Agentes de voz que responden al instante y se dejan interrumpir, como una persona.',
          tools: 'Deepgram · ElevenLabs · WebSockets · WebRTC',
        },
        {
          title: 'Document AI y recuperación',
          body: 'IA que lee documentos, extrae sus datos y responde con la información del negocio.',
          tools: 'Textract · OCR · pgvector · RAG',
        },
        {
          title: 'Canales e integraciones',
          body: 'Agentes que llegan al usuario donde ya está, conectados a los sistemas existentes.',
          tools:
            'WhatsApp Business Platform · Meta Cloud API · webhooks · HubSpot',
        },
        {
          title: 'Backend y cloud',
          body: 'Lo que hay detrás: APIs, procesos automáticos y nube que escala sola.',
          tools: 'Python · TypeScript · FastAPI · AWS serverless',
        },
      ]
    : [
        {
          title: 'Agentic systems',
          body: 'Agents that use tools, remember context and ask for approval, with clear steps you can review.',
          tools: 'LangGraph · MCP · Bedrock AgentCore · Claude',
        },
        {
          title: 'Realtime voice AI',
          body: 'Voice agents that answer instantly and can be interrupted, like a person.',
          tools: 'Deepgram · ElevenLabs · WebSockets · WebRTC',
        },
        {
          title: 'Document AI & retrieval',
          body: 'AI that reads documents, pulls out their data and answers from the business’s own information.',
          tools: 'Textract · OCR · pgvector · RAG',
        },
        {
          title: 'Channels & integrations',
          body: 'Agents that meet users where they already are, wired into existing systems.',
          tools:
            'WhatsApp Business Platform · Meta Cloud API · webhooks · HubSpot',
        },
        {
          title: 'Backend & cloud',
          body: 'What runs behind it: APIs, automated workflows and cloud that scales on its own.',
          tools: 'Python · TypeScript · FastAPI · AWS serverless',
        },
      ];

  const stackGroups = [
    [
      isEs ? 'IA y agentes' : 'AI & agents',
      'Claude · OpenAI · Amazon Nova · LangGraph · LangChain · LlamaIndex · MCP · RAG · embeddings · structured outputs',
    ],
    [
      isEs ? 'Voz y documentos' : 'Voice & documents',
      'Deepgram · ElevenLabs · Amazon Transcribe · Google Cloud TTS · Twilio · WebSockets · WebRTC · Textract · Rekognition · OCR',
    ],
    [
      isEs ? 'Canales e integraciones' : 'Channels & integrations',
      'WhatsApp Business Platform · Meta Cloud API · webhooks · HubSpot · Discord · n8n · Google APIs',
    ],
    [
      'Backend',
      'Python · TypeScript · JavaScript · FastAPI · Node.js · Pydantic · Zod · REST · SSE · Java · C#',
    ],
    [
      isEs ? 'Datos' : 'Data',
      'PostgreSQL · pgvector · Aurora · DynamoDB · Redis / Valkey · MongoDB · Supabase · Redshift · Glue · DMS',
    ],
    [
      'Frontend',
      'React · Next.js · Tailwind CSS · Angular · Vue · MUI · Ant Design',
    ],
    [
      isEs ? 'LLMOps y entrega' : 'LLMOps & delivery',
      'LangSmith · CloudWatch · Docker · Terraform · AWS SAM · GitHub Actions · CI/CD · Linux · Google Cloud · Cloudflare Workers',
    ],
  ].map(function (g: string[]) {
    return { title: g[0], items: g[1] };
  });

  const principles = (
    isEs
      ? [
          [
            'Arquitectura antes que implementación',
            'Diagramo el sistema, sus datos y sus modos de falla antes de escribir código. El modelo es solo un componente entre muchos.',
          ],
          [
            'Medir latencia, costo y confiabilidad',
            'Cada funcionalidad de IA tiene un presupuesto: qué tan rápida, cuánto cuesta por solicitud y cómo falla. Agentes evaluadores prueban cada cambio automáticamente y cada llamada queda registrada con su costo. Las decisiones siguen a los números.',
            ['Evaluation agents', 'LangSmith', 'CloudWatch', 'Aurora logs'],
          ],
          [
            'Construir para producción, no para demos',
            'Seguridad, monitoreo, manejo de fallas y despliegue son parte del primer diseño, no una fase posterior.',
            ['GitHub Actions', 'Terraform', 'AWS SAM'],
          ],
          [
            'El criterio humano sigue siendo esencial',
            'La IA acelera mi trabajo — Claude Code como herramienta principal, con Cursor y ChatGPT — pero reviso cada PR a fondo y nada llega a producción sin pasar por mí. No me automatizo a mí mismo: optimizo mi trabajo.',
          ],
        ]
      : [
          [
            'Architecture before implementation',
            'I diagram the system, its data and its failure modes before writing code. The model is one component among many.',
          ],
          [
            'Measure latency, cost and reliability',
            'Every AI feature gets a budget: how fast, how much per request, how it fails. Evaluation agents test every change automatically, and every call is logged with its cost. Decisions follow the numbers.',
            ['Evaluation agents', 'LangSmith', 'CloudWatch', 'Aurora logs'],
          ],
          [
            'Build for production, not just demos',
            'Security, monitoring, failure handling and deployment are part of the first design, not a later phase.',
            ['GitHub Actions', 'Terraform', 'AWS SAM'],
          ],
          [
            'Human judgment remains essential',
            'AI speeds up my work — Claude Code as my main tool, with Cursor and ChatGPT alongside — but I review every PR thoroughly and nothing reaches production without passing through me. I don’t automate myself; I optimize my work.',
          ],
        ]
  ).map(function (p: (string | string[])[], i: number) {
    return {
      n: '0' + (i + 1),
      title: p[0] as string,
      body: p[1] as string,
      chips: (p[2] ?? []) as string[],
    };
  });

  // Services mode: what he offers (each with its live demo, or the call) and
  // the delivery cycle as he works with a client.
  const services = isEs
    ? [
        {
          tag: 'Chatbots',
          title: 'Un chatbot para tu negocio',
          body: 'En WhatsApp o en tu web: atiende a tus clientes, toma pedidos y agenda citas, conectado a tu menú, tu catálogo o tu calendario.',
          href: '/lab/chat?case=order',
        },
        {
          tag: 'Automatización',
          title: 'Automatiza un proceso',
          body: 'Reclamos, formularios, facturas o correos: IA que lee los documentos, revisa las reglas y deja el resultado en tus sistemas.',
          href: '/lab/chat?case=insurance',
        },
        {
          tag: 'Voz',
          title: 'Agentes de voz',
          body: 'Un agente que contesta llamadas, toma pedidos o agenda citas por voz, en tiempo real y en el idioma de tus clientes.',
          href: '/lab/voice',
        },
        {
          tag: 'Documentos',
          title: 'IA sobre tus documentos',
          body: 'Un asistente que responde desde tus contratos, manuales o políticas y cita la página exacta de donde sacó la respuesta.',
          href: '/lab/chat?case=documents',
        },
        {
          tag: 'Consultoría',
          title: 'Consultoría y arquitectura',
          body: '¿Tienes una idea con IA? La revisamos juntos y te propongo la arquitectura, los modelos adecuados y cuánto costará construirla y operarla.',
          href: '',
        },
      ]
    : [
        {
          tag: 'Chatbots',
          title: 'A chatbot for your business',
          body: 'On WhatsApp or your website: it answers your customers, takes orders and books appointments, connected to your menu, catalog or calendar.',
          href: '/lab/chat?case=order',
        },
        {
          tag: 'Automation',
          title: 'Automate a process',
          body: 'Claims, forms, invoices or emails: AI that reads the documents, checks the rules and files the result in your systems.',
          href: '/lab/chat?case=insurance',
        },
        {
          tag: 'Voice',
          title: 'Voice agents',
          body: 'An agent that answers calls, takes orders or books appointments by voice, in real time and in your customers’ language.',
          href: '/lab/voice',
        },
        {
          tag: 'Documents',
          title: 'AI over your documents',
          body: 'An assistant that answers from your contracts, manuals or policies and cites the exact page it took the answer from.',
          href: '/lab/chat?case=documents',
        },
        {
          tag: 'Consulting',
          title: 'Consulting & architecture',
          body: 'Have an AI idea? We review it together and I propose the architecture, the right models and what it will cost to build and run.',
          href: '',
        },
      ];
  const cycleServices = isEs
    ? [
        {
          tag: '01 · Entender',
          title: 'Entender tu necesidad',
          body: 'Hablamos de tu flujo de trabajo real y separamos lo que necesita IA de lo que no.',
        },
        {
          tag: '02 · Recomendar',
          title: 'Recomendar el enfoque',
          body: 'Elijo modelos y arquitectura para el problema — pesando calidad, latencia y costo — y diagramo la solución de punta a punta.',
        },
        {
          tag: '03 · Estimar',
          title: 'Estimar costo y tiempo',
          body: 'Sabes desde el inicio cuánto tomará construirlo y cuánto costará operarlo cada mes.',
        },
        {
          tag: '04 · Construir',
          title: 'Construir e integrar',
          body: 'Lo construyo, lo conecto con los sistemas que ya usas y lo pruebo con casos reales antes de lanzarlo.',
        },
        {
          tag: '05 · Acompañar',
          title: 'Acompañar el lanzamiento',
          body: 'Sigo contigo en la salida a producción, mido cómo funciona y lo ajusto con datos de uso real.',
        },
      ]
    : [
        {
          tag: '01 · Understand',
          title: 'Understand your need',
          body: 'We talk through your real workflow and separate what needs AI from what doesn’t.',
        },
        {
          tag: '02 · Recommend',
          title: 'Recommend the approach',
          body: 'I choose models and architecture for the job — weighing quality, latency and cost — and diagram the solution end to end.',
        },
        {
          tag: '03 · Estimate',
          title: 'Estimate cost and time',
          body: 'You know upfront what it will take to build and what it will cost to run each month.',
        },
        {
          tag: '04 · Build',
          title: 'Build and integrate',
          body: 'I build it, connect it to the systems you already use and test it with real cases before launch.',
        },
        {
          tag: '05 · Support',
          title: 'Support the launch',
          body: 'I stay with you through going live, measure how it performs and tune it with real usage data.',
        },
      ];

  return {
    x,
    cycle,
    cycleServices,
    services,
    cases,
    ragFlow,
    ragIdeas,
    awsIcons,
    domains,
    stackGroups,
    principles,
  };
}

export const content = { en: build(false), es: build(true) };
export type RawContent = ReturnType<typeof build>;
export type Lang = keyof typeof content;
