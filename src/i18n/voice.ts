// Copy of the Voice Lab (src/components/lab/VoiceApp.tsx), from the Voice
// board of the design canvas. ES is typed as EN, so add every string to both.
// `greeting` is also the script of the recorded greeting
// (scripts/voice-greeting.mjs): regenerate the audio if it changes.
const EN = {
  back: 'Lab',
  backLabel: 'Back to the Lab',
  title: 'Realtime Voice Lab',
  subtitle: 'Lab 01 · Flagship · speech-to-speech',
  scenario: 'Talk to Sophie · ask about Juan Diego',
  phase: {
    idle: 'Ready',
    greeting: 'Sophie speaking',
    connecting: 'Connecting',
    listening: 'Listening',
    user: 'Hearing you',
    thinking: 'Thinking',
    speaking: 'Sophie speaking',
    muted: 'Muted',
    ended: 'Call ended',
    sad: 'Couldn’t connect',
  },
  orb: 'Sophie, the voice agent',
  you: 'You',
  agent: 'Sophie',
  start: 'Start conversation',
  connecting: 'Connecting…',
  end: 'End',
  again: 'Talk again',
  mute: 'Mute microphone',
  unmute: 'Unmute microphone',
  idleCaption: 'Press start and ask me anything about Juan Diego.',
  greeting:
    'Hi, I’m Sophie! I can tell you anything you’d like to know about Juan Diego: what he does, the projects he’s built and the technologies he works with. Press Start and ask me anything. I’ll answer right away.',
  hearGreeting: 'Hear Sophie',
  replay: 'Replay greeting',
  stopGreeting: 'Stop greeting',
  transcript: 'Transcript',
  transcriptBtn: 'Show the transcript',
  close: 'Close',
  emptyTranscript:
    'The conversation will appear here as it happens, with tool calls and interruptions.',
  turns: 'turns',
  latency: 'Live metrics',
  lastTurn: 'this call · max 5:00',
  metrics: ['CONNECT', 'LAST TURN', 'BARGE-INS', 'SESSION'],
  pipeline: ['Mic · WebRTC', 'OpenAI Realtime', 'Tool calls', 'Audio out'],
  bargeIn: 'visitor interrupted · Sophie stopped',
  toolShown: 'buttons shown',
  ended: {
    time: 'That’s the 5 minutes. Thanks for talking with Sophie!',
    user: 'Call ended. Thanks for talking with Sophie!',
    dropped: 'The call dropped.',
  },
  errors: {
    limit_ip:
      'You’ve used today’s call. Come back tomorrow, or keep asking in the text chat.',
    limit_day:
      'Sophie has talked a lot today and is out of calls. Come back tomorrow, or ask in the text chat.',
    busy: 'You already have a call open, maybe in another tab. End it and try again.',
    captcha: 'We couldn’t check that you’re not a bot. Try again.',
    unavailable: 'Sophie can’t connect right now. Try again in a moment.',
    mic: 'Sophie needs your microphone to hear you. Allow it in your browser and try again.',
    network: 'No connection. Check your network and try again.',
  },
  // Under Start, before a call. Keep in sync with MAX_PER_IP and SESSION_S
  // (wrangler.jsonc) and the 30 min a resume is kept (worker/call.ts).
  limits: '1 call a day · up to 5 min · pause and resume within 30 min',
  // Under the limits (worker/metrics.ts keeps what the visitor says).
  stored: 'What you ask is stored anonymously to improve this demo',
  resume: 'Resume',
  startOver: 'Start over',
  resumedNote: 'call resumed · left',
  paused:
    'Call paused. You have {t} left: resume whenever you want, Sophie remembers the conversation.',
  droppedPaused:
    'The call dropped. You still have {t}: resume and Sophie picks up where you left off.',
  textChat: 'Chat with my CV',
  reachOut: 'Want to keep talking? Reach Juan Diego directly:',
};

const ES: typeof EN = {
  back: 'Lab',
  backLabel: 'Volver al Lab',
  title: 'Realtime Voice Lab',
  subtitle: 'Lab 01 · Principal · speech-to-speech',
  scenario: 'Habla con Sophie · pregunta por Juan Diego',
  phase: {
    idle: 'Lista',
    greeting: 'Sophie hablando',
    connecting: 'Conectando',
    listening: 'Escuchando',
    user: 'Te escucho',
    thinking: 'Pensando',
    speaking: 'Sophie hablando',
    muted: 'Silenciado',
    ended: 'Llamada terminada',
    sad: 'No se pudo conectar',
  },
  orb: 'Sophie, la agente de voz',
  you: 'Tú',
  agent: 'Sophie',
  start: 'Iniciar conversación',
  connecting: 'Conectando…',
  end: 'Terminar',
  again: 'Hablar de nuevo',
  mute: 'Silenciar micrófono',
  unmute: 'Activar micrófono',
  idleCaption: 'Pulsa iniciar y pregúntame lo que quieras sobre Juan Diego.',
  greeting:
    '¡Hola, soy Sophie! Puedo contarte lo que quieras saber sobre Juan Diego: a qué se dedica, qué proyectos ha construido y con qué tecnologías trabaja. Presiona Iniciar y pregúntame lo que quieras. Te respondo al instante.',
  hearGreeting: 'Escuchar a Sophie',
  replay: 'Repetir saludo',
  stopGreeting: 'Detener saludo',
  transcript: 'Transcripción',
  transcriptBtn: 'Ver la transcripción',
  close: 'Cerrar',
  emptyTranscript:
    'La conversación aparecerá aquí mientras ocurre, con llamadas a herramientas e interrupciones.',
  turns: 'turnos',
  latency: 'Métricas en vivo',
  lastTurn: 'esta llamada · máx 5:00',
  metrics: ['CONEXIÓN', 'ÚLTIMO TURNO', 'INTERRUPC.', 'SESIÓN'],
  pipeline: ['Mic · WebRTC', 'OpenAI Realtime', 'Tool calls', 'Salida audio'],
  bargeIn: 'el visitante interrumpió · Sophie se detuvo',
  toolShown: 'botones visibles',
  ended: {
    time: 'Se cumplieron los 5 minutos. ¡Gracias por hablar con Sophie!',
    user: 'Llamada terminada. ¡Gracias por hablar con Sophie!',
    dropped: 'Se cayó la llamada.',
  },
  errors: {
    limit_ip:
      'Ya usaste tu llamada de hoy. Vuelve mañana o sigue preguntando en el chat de texto.',
    limit_day:
      'Sophie habló mucho hoy y se quedó sin llamadas. Vuelve mañana o pregunta en el chat de texto.',
    busy: 'Ya tienes una llamada abierta, quizá en otra pestaña. Ciérrala y vuelve a intentarlo.',
    captcha: 'No pudimos comprobar que no eres un bot. Vuelve a intentarlo.',
    unavailable:
      'Sophie no puede conectarse ahora. Inténtalo de nuevo en un momento.',
    mic: 'Sophie necesita tu micrófono para escucharte. Permítelo en el navegador y vuelve a intentarlo.',
    network: 'Sin conexión. Revisa tu red y vuelve a intentarlo.',
  },
  limits: '1 llamada al día · hasta 5 min · pausa y reanuda en 30 min',
  stored: 'Lo que preguntas se guarda de forma anónima para mejorar esta demo',
  resume: 'Reanudar',
  startOver: 'Empezar de cero',
  resumedNote: 'llamada reanudada · quedan',
  paused:
    'Llamada en pausa. Te quedan {t}: reanuda cuando quieras, Sophie recuerda la conversación.',
  droppedPaused:
    'Se cayó la llamada. Aún te quedan {t}: reanuda y Sophie sigue donde iban.',
  textChat: 'Chatear con mi CV',
  reachOut:
    '¿Quieres seguir la conversación? Escríbele a Juan Diego directamente:',
};

export const VOICE = { en: EN, es: ES };
export type VoiceCopy = typeof EN;
