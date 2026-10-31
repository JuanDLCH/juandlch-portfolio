// Copy of the Voice Lab (src/components/lab/VoiceApp.tsx). ES is typed as EN,
// so add every string to both. `greeting` is also the script of the recorded
// greeting (scripts/voice-greeting.mjs): regenerate the audio if it changes.
const EN = {
  title: 'Voice Lab',
  home: 'Home',
  homeLabel: 'Back to the home page',
  tag: 'Lab 01 · Realtime voice',
  heading: 'Talk to Sophie',
  sub: 'Ask out loud about my experience, projects and stack. Sophie answers from my CV and portfolio, in English or Spanish, and you can interrupt her anytime.',
  greeting:
    'Hi, I’m Sophie! I can tell you anything you’d like to know about Juan Diego: what he does, the projects he’s built and the technologies he works with. Press Start and ask me anything. I’ll answer right away.',
  hearGreeting: 'Hear Sophie',
  replay: 'Replay greeting',
  start: 'Start',
  connecting: 'Connecting…',
  end: 'End call',
  mute: 'Mute microphone',
  unmute: 'Unmute microphone',
  muted: 'Muted',
  status: {
    idle: 'Ready',
    greeting: 'Speaking',
    connecting: 'Connecting',
    listening: 'Listening',
    user: 'Hearing you',
    thinking: 'Thinking',
    speaking: 'Speaking',
    ended: 'Call ended',
  },
  timeLeft: 'Time left',
  you: 'You',
  agent: 'Sophie',
  tryAsking: 'Try asking',
  ideas: [
    'What does he do?',
    'What experience does he have with AWS?',
    'Has he built voice agents?',
    'How can I contact him?',
  ],
  fine: '3 minutes per call · 3 calls a day · audio is not recorded',
  stack: 'GPT Realtime · WebRTC',
  ended: {
    time: 'That’s the 3 minutes. Thanks for talking with Sophie!',
    user: 'Call ended. Thanks for talking with Sophie!',
    dropped: 'The call dropped.',
  },
  errors: {
    limit_ip:
      'You’ve used today’s 3 calls. Come back tomorrow, or keep asking in the text chat.',
    limit_day:
      'Sophie has talked a lot today and is out of calls. Come back tomorrow, or ask in the text chat.',
    busy: 'You already have a call open, maybe in another tab. End it and try again.',
    captcha: 'We couldn’t check that you’re not a bot. Try again.',
    unavailable: 'Sophie can’t connect right now. Try again in a moment.',
    mic: 'Sophie needs your microphone to hear you. Allow it in your browser and try again.',
    network: 'No connection. Check your network and try again.',
  },
  again: 'Talk again',
  textChat: 'Chat with my CV',
  reachOut: 'Want to keep talking? Reach Juan Diego directly:',
};

const ES: typeof EN = {
  title: 'Voice Lab',
  home: 'Inicio',
  homeLabel: 'Volver al inicio',
  tag: 'Lab 01 · Voz en tiempo real',
  heading: 'Habla con Sophie',
  sub: 'Pregunta en voz alta por mi experiencia, proyectos y stack. Sophie responde desde mi CV y mi portafolio, en español o en inglés, y puedes interrumpirla cuando quieras.',
  greeting:
    '¡Hola, soy Sophie! Puedo contarte lo que quieras saber sobre Juan Diego: a qué se dedica, qué proyectos ha construido y con qué tecnologías trabaja. Presiona Empezar y pregúntame lo que quieras. Te respondo al instante.',
  hearGreeting: 'Escuchar a Sophie',
  replay: 'Repetir saludo',
  start: 'Empezar',
  connecting: 'Conectando…',
  end: 'Colgar',
  mute: 'Silenciar micrófono',
  unmute: 'Activar micrófono',
  muted: 'Silenciado',
  status: {
    idle: 'Lista',
    greeting: 'Hablando',
    connecting: 'Conectando',
    listening: 'Escuchando',
    user: 'Te escucho',
    thinking: 'Pensando',
    speaking: 'Hablando',
    ended: 'Llamada terminada',
  },
  timeLeft: 'Tiempo restante',
  you: 'Tú',
  agent: 'Sophie',
  tryAsking: 'Prueba a preguntar',
  ideas: [
    '¿A qué se dedica?',
    '¿Qué experiencia tiene con AWS?',
    '¿Ha construido agentes de voz?',
    '¿Cómo lo contacto?',
  ],
  fine: '3 minutos por llamada · 3 llamadas al día · el audio no se graba',
  stack: 'GPT Realtime · WebRTC',
  ended: {
    time: 'Se cumplieron los 3 minutos. ¡Gracias por hablar con Sophie!',
    user: 'Llamada terminada. ¡Gracias por hablar con Sophie!',
    dropped: 'Se cayó la llamada.',
  },
  errors: {
    limit_ip:
      'Ya usaste las 3 llamadas de hoy. Vuelve mañana o sigue preguntando en el chat de texto.',
    limit_day:
      'Sophie habló mucho hoy y se quedó sin llamadas. Vuelve mañana o pregunta en el chat de texto.',
    busy: 'Ya tienes una llamada abierta, quizá en otra pestaña. Ciérrala y vuelve a intentarlo.',
    captcha: 'No pudimos comprobar que no eres un bot. Vuelve a intentarlo.',
    unavailable:
      'Sophie no puede conectarse ahora. Inténtalo de nuevo en un momento.',
    mic: 'Sophie necesita tu micrófono para escucharte. Permítelo en el navegador y vuelve a intentarlo.',
    network: 'Sin conexión. Revisa tu red y vuelve a intentarlo.',
  },
  again: 'Hablar de nuevo',
  textChat: 'Chatear con mi CV',
  reachOut:
    '¿Quieres seguir la conversación? Escríbele a Juan Diego directamente:',
};

export const VOICE = { en: EN, es: ES };
export type VoiceCopy = typeof EN;
