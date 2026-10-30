// Copy and data lifted from the Signal design (EN/ES). Cases, cycle, domains, etc. are built per language.
export type RawFlowNode = {
  label: string;
  meta: string;
  hot: boolean;
  kind?: 'split' | 'loop';
  parts?: string[];
};

const EN = {
  navLabel: 'Primary',
  navWork: 'Work',
  navLab: 'Lab',
  navExpertise: 'Expertise',
  menu: 'Menu',
  close: 'Close',
  mobileNote: 'Best experienced on desktop',
  navAbout: 'About',
  navContact: 'Contact',
  navCv: 'CV ↓',
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
    'Software engineer first. I design and ship agents, realtime voice and document pipelines for companies, from the first discovery call to the AWS infrastructure they run on.',
  ctaLab: 'Preview the Voice Lab',
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
    'One conversational turn — speech in, transcription, reasoning, a tool call, speech out — interruptible at every step. A live version is on its way to the Lab.',
  aboutTitle: 'From full stack to AI lead',
  aboutA:
    'I spent my first years shipping ERP systems, cloud backends and integrations. That is why the AI I build today comes with ',
  aboutB: 'APIs, state, infrastructure and a cost estimate',
  aboutC: ' — not just a prompt.',
  tl1: 'Stellion Tech — two ERP systems, end to end',
  tl2: 'Trade EC / TRD Global — APIs, integrations, data',
  tl3: 'Agents, RAG, OCR and voice in client products',
  tl4: 'Team lead, AI consulting, architecture on AWS',
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
    'Both demos are in progress: you’ll be able to watch a recording or run them live with your own API key. Keys stay in your browser session — never stored, never logged.',
  lab1Tag: 'Lab 01 · Flagship',
  lab1Body:
    'Full-duplex voice with interruptions, captions and a live latency panel.',
  lab2Tag: 'Lab 02 · Agents',
  lab2Body:
    'Text, images, documents and audio, with tool calls visible as they run.',
  labCta: 'Demo in progress',
  pvSim: 'Simulated preview',
  pvYou: 'You',
  pvAgent: 'Agent',
  voiceUser: 'Hi — can I get two combos for delivery?',
  voiceAgent: 'Sure. Which combos would you like, and what’s the address?',
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
    'Model choice across providers, Bedrock AgentCore to run agents and Amazon Nova among the options — wired into serverless pipelines with Lambda, Step Functions and EventBridge. I also gave technical support to my company’s AWS Generative AI Competency process.',
  awsFlex:
    'AWS is my focus, not my limit — I work with whichever cloud or model provider a project requires.',
  awsIconsLabel: 'AWS services I work with',
  toolboxLabel: 'Full toolbox',
  ragTitle: 'Retrieval & RAG',
  ragA: 'Retrieval that ',
  ragB: 'earns its answers.',
  ragSub:
    'My agents don’t get a bare top-k. Every question is rewritten, searched with lexical and semantic retrieval, reranked and checked by a validator before anything is answered.',
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
};

const ES: typeof EN = {
  navLabel: 'Principal',
  navWork: 'Trabajo',
  navLab: 'Lab',
  navExpertise: 'Especialidad',
  menu: 'Menú',
  close: 'Cerrar',
  mobileNote: 'Se disfruta mejor en escritorio',
  navAbout: 'Sobre mí',
  navContact: 'Contacto',
  navCv: 'CV ↓',
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
  ctaLab: 'Ver el Voice Lab',
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
    'Un turno de conversación — voz de entrada, transcripción, razonamiento, una llamada a herramienta, voz de salida — interrumpible en cada paso. La versión en vivo está en camino al Lab.',
  aboutTitle: 'De full stack a líder de IA',
  aboutA:
    'Mis primeros años los pasé construyendo ERPs, backends en la nube e integraciones. Por eso la IA que construyo hoy viene con ',
  aboutB: 'APIs, estado, infraestructura y un estimado de costos',
  aboutC: ' — no solo un prompt.',
  tl1: 'Stellion Tech — dos sistemas ERP, de principio a fin',
  tl2: 'Trade EC / TRD Global — APIs, integraciones, datos',
  tl3: 'Agentes, RAG, OCR y voz en productos de clientes',
  tl4: 'Líder de equipo, consultoría de IA, arquitectura en AWS',
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
    'Las dos demos están en construcción: podrás ver una grabación o probarlas en vivo con tu propia API key. Las llaves se quedan en tu sesión del navegador — nunca se guardan ni se registran.',
  lab1Tag: 'Lab 01 · Principal',
  lab1Body:
    'Voz bidireccional con interrupciones, subtítulos y un panel de latencia en vivo.',
  lab2Tag: 'Lab 02 · Agentes',
  lab2Body:
    'Texto, imágenes, documentos y audio, con las llamadas a herramientas visibles mientras ocurren.',
  labCta: 'Demo en construcción',
  pvSim: 'Vista simulada',
  pvYou: 'Tú',
  pvAgent: 'Agente',
  voiceUser: 'Hola — ¿me envías dos combos a domicilio?',
  voiceAgent: 'Claro. ¿Qué combos quieres y cuál es la dirección?',
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
    'Elección de modelos entre proveedores, Bedrock AgentCore para ejecutar agentes y Amazon Nova entre las opciones — integrado en pipelines serverless con Lambda, Step Functions y EventBridge. También di soporte técnico al proceso de AWS Generative AI Competency de la compañía.',
  awsFlex:
    'AWS es mi enfoque, no mi límite — trabajo con la nube o el proveedor de modelos que cada proyecto requiera.',
  awsIconsLabel: 'Servicios de AWS con los que trabajo',
  toolboxLabel: 'Caja de herramientas completa',
  ragTitle: 'Recuperación y RAG',
  ragA: 'Recuperación que ',
  ragB: 'se gana sus respuestas.',
  ragSub:
    'Mis agentes no reciben un top-k a secas. Cada pregunta se reescribe, se busca de forma léxica y semántica, se reordena y un validador la revisa antes de responder.',
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
            'Léxico y semántico, no uno solo',
            'La búsqueda por palabras clave y la vectorial encuentran cosas distintas; los resultados se fusionan en un solo ranking.',
          ],
          [
            'Reordenar lo recuperado',
            'Una pasada de reranking pone primero los fragmentos más relevantes antes de que lleguen al agente.',
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
            'Lexical and semantic, not one or the other',
            'Keyword and vector search catch different things; results are fused into a single ranking.',
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
          tag: 'Caso 01 · Restaurantes de comida rápida · IA de voz',
          title: 'Agentes de voz que toman pedidos en tiempo real',
          problem:
            'Los clientes llaman para pedir y preguntar. La operación necesitaba atender esas llamadas de forma natural, con volumen, y conectadas a sus sistemas de pedidos.',
          role: 'Trabajé en el pipeline de voz en tiempo real: STT y TTS en streaming, detección de turnos e interrupciones, estado de la conversación y llamadas a herramientas hacia los sistemas del negocio.',
          stack: ['Deepgram', 'ElevenLabs', 'WebSockets', 'OpenAI', 'AWS'],
          figTag: 'Fig. 01 · turno de voz',
          figLabel: 'Diagrama del pipeline de voz',
          flow: mkFlow([
            ['Audio del cliente', 'stream'],
            ['STT en streaming', 'parciales'],
            ['*Agente de voz', 'estado · tools'],
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
          tag: 'Caso 03 · Restaurantes y retail · IA conversacional',
          title: 'Asistentes de WhatsApp conectados al negocio',
          problem:
            'Los clientes ya escriben por WhatsApp. Los negocios necesitaban asistentes que respondieran ahí, siguieran sus reglas y actuaran sobre sus sistemas existentes — no un chatbot aislado.',
          role: 'Construí y evolucioné flujos conversacionales sobre la API de WhatsApp de Meta: manejo de webhooks y eventos, orquestación y lógica de negocio, integración con servicios existentes y migración de flujos heredados.',
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
            ['APIs del negocio', 'pedidos · CRM'],
            ['Respuesta en WhatsApp', 'texto · plantillas'],
          ]),
        },
        {
          href: '#case-edu',
          tag: 'Caso 04 · Educación · Pipeline agéntico',
          title: 'Evaluación automática de clases grabadas',
          problem:
            'Revisar grabaciones de clases a mano no escala. La plataforma necesitaba evaluaciones estructuradas y consistentes que pudiera usar dentro de su propia aplicación.',
          role: 'Participé en la arquitectura y el desarrollo: procesamiento de audio, transcripción, evaluación basada en agentes y reportes JSON integrados con el software del cliente.',
          stack: [
            'Amazon Transcribe',
            'Step Functions',
            'Aurora Serverless',
            'LLMs',
            'RAG',
          ],
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
          tag: 'Case 01 · Quick-service restaurants · Voice AI',
          title: 'Voice agents that take orders in real time',
          problem:
            'Customers call to order and ask questions. The operation needed those calls handled naturally, at volume, and connected to its ordering systems.',
          role: 'Worked on the realtime voice pipeline: streaming STT and TTS, turn detection and interruptions, conversation state, and tool calls into business systems.',
          stack: ['Deepgram', 'ElevenLabs', 'WebSockets', 'OpenAI', 'AWS'],
          figTag: 'Fig. 01 · voice turn',
          figLabel: 'Voice pipeline diagram',
          flow: mkFlow([
            ['Caller audio', 'stream'],
            ['Streaming STT', 'partials'],
            ['*Voice agent', 'state · tools'],
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
          tag: 'Case 03 · Restaurants & retail · Conversational AI',
          title: 'WhatsApp assistants wired into the business',
          problem:
            'Customers already write on WhatsApp. Businesses needed assistants that answer there, follow their rules and act on their existing systems — not a disconnected chatbot.',
          role: 'Built and evolved conversational flows on Meta’s WhatsApp Cloud API: webhook and event handling, orchestration and business logic, integrations with existing services, and migration of legacy flows.',
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
            ['Business APIs', 'orders · CRM'],
            ['WhatsApp reply', 'text · templates'],
          ]),
        },
        {
          href: '#case-edu',
          tag: 'Case 04 · Education · Agentic pipeline',
          title: 'Assessing recorded classes automatically',
          problem:
            'Reviewing class recordings by hand doesn’t scale. The platform needed structured, consistent evaluations it could use inside its own app.',
          role: 'Took part in the architecture and development: audio processing, transcription, agent-based evaluation and JSON reports integrated with the client’s software.',
          stack: [
            'Amazon Transcribe',
            'Step Functions',
            'Aurora Serverless',
            'LLMs',
            'RAG',
          ],
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
          body: 'Agentes con herramientas, memoria y aprobaciones, orquestados de forma explícita.',
          tools: 'LangGraph · MCP · Bedrock AgentCore · Claude',
        },
        {
          title: 'IA de voz en tiempo real',
          body: 'Pipelines de voz en streaming con turnos, interrupciones y baja latencia.',
          tools: 'Deepgram · ElevenLabs · WebSockets · WebRTC',
        },
        {
          title: 'Document AI y recuperación',
          body: 'Extracción estructurada, OCR y RAG sobre datos del negocio.',
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
          body: 'APIs tipadas, sistemas orientados a eventos e infraestructura serverless.',
          tools: 'Python · TypeScript · FastAPI · AWS serverless',
        },
      ]
    : [
        {
          title: 'Agentic systems',
          body: 'Agents with tools, memory and approvals, orchestrated explicitly.',
          tools: 'LangGraph · MCP · Bedrock AgentCore · Claude',
        },
        {
          title: 'Realtime voice AI',
          body: 'Streaming voice pipelines with turn-taking, interruptions and low latency.',
          tools: 'Deepgram · ElevenLabs · WebSockets · WebRTC',
        },
        {
          title: 'Document AI & retrieval',
          body: 'Structured extraction, OCR and RAG over business data.',
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
          body: 'Typed APIs, event-driven systems and serverless infrastructure.',
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
      'LangSmith · CloudWatch · Docker · Terraform · AWS SAM · GitHub Actions · CI/CD · Linux',
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
            'Cada funcionalidad de IA tiene un presupuesto: qué tan rápida, cuánto cuesta por solicitud y cómo falla. En LLMOps, agentes evaluadores prueban cada cambio en bucle y cada llamada se registra y se costea. Las decisiones siguen a los números.',
            ['Evaluation agents', 'LangSmith', 'CloudWatch', 'Aurora logs'],
          ],
          [
            'Construir para producción, no para demos',
            'Autenticación, observabilidad, reintentos, estado y despliegue son parte del primer diseño, no una fase posterior.',
            ['GitHub Actions', 'Terraform', 'AWS SAM'],
          ],
          [
            'El criterio humano sigue siendo esencial',
            'La IA acelera mi trabajo — Claude Code como herramienta principal, con Cursor y ChatGPT — pero reviso cada PR a fondo y nada llega a main ni a producción sin pasar por mí. No me automatizo a mí mismo: optimizo mi trabajo.',
          ],
        ]
      : [
          [
            'Architecture before implementation',
            'I diagram the system, its data and its failure modes before writing code. The model is one component among many.',
          ],
          [
            'Measure latency, cost and reliability',
            'Every AI feature gets a budget: how fast, how much per request, how it fails. In LLMOps terms, evaluation agents test every change in a loop and every call is logged and costed. Decisions follow the numbers.',
            ['Evaluation agents', 'LangSmith', 'CloudWatch', 'Aurora logs'],
          ],
          [
            'Build for production, not just demos',
            'Auth, observability, retries, state and deployment are part of the first design, not a later phase.',
            ['GitHub Actions', 'Terraform', 'AWS SAM'],
          ],
          [
            'Human judgment remains essential',
            'AI speeds up my work — Claude Code as my main tool, with Cursor and ChatGPT alongside — but I review every PR thoroughly and nothing reaches main or production without passing through me. I don’t automate myself; I optimize my work.',
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
  return {
    x,
    cycle,
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
