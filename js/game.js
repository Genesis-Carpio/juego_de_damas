/**
 * Controlador de interfaz y flujo de juego de Damas Clásicas.
 * Optimizado para experiencia móvil (Mobile-First), táctil y multijugador online con Firebase.
 */

const ui = {
  mode: 'local',           // 'local' | 'online' | 'ai'
  level: 'easy',           // 'easy' | 'medium' | 'hard'
  board: null,
  turn: WHITE,
  selected: null,
  forced: null,            // [r, c] de captura encadenada obligatoria
  captured: { white: 0, black: 0 },
  lastMove: null,          // { from: [r, c], to: [r, c] }
  over: false,
  winner: null,
  reason: null,
  busy: false,
  roomId: null,
  player: null,            // WHITE | BLACK | 'spectator'
  flipped: false,          // Inversión de tablero (auto para negras)
  roomRef: null,
  connected: false,
  gameId: null,
  aiTimeout: null
};

const $ = id => document.getElementById(id);

/**
 * Reconstruye una matriz 8x8 segura sin importar cómo Firebase haya serializado los nulls.
 */
function deserializeBoard(b) {
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));
  if (!b) return CheckersRules.initialBoard();

  for (let r = 0; r < 8; r++) {
    const row = b[r];
    if (!row) continue;
    for (let c = 0; c < 8; c++) {
      const cell = row[c];
      if (cell && (cell.color === WHITE || cell.color === BLACK)) {
        board[r][c] = {
          color: cell.color,
          king: Boolean(cell.king)
        };
      }
    }
  }
  return board;
}

/**
 * Retorna el nombre legible del bando o entidad.
 */
function getPlayerName(color) {
  if (ui.mode === 'ai' && color === BLACK) return 'la máquina';
  return color === WHITE ? 'las blancas' : 'las negras';
}

function getWinnerTitle(winner) {
  if (ui.mode === 'ai' && winner === BLACK) return '¡Gana la máquina!';
  return `¡Ganan ${getPlayerName(winner)}!`;
}

/**
 * Obtiene el ID del jugador para la sesión actual.
 * Usa sessionStorage para permitir abrir 2 pestañas distintas en el mismo navegador y jugar.
 */
function getPlayerId() {
  try {
    if (!sessionStorage.damasPlayerId) {
      sessionStorage.damasPlayerId = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    }
    return sessionStorage.damasPlayerId;
  } catch (e) {
    if (!window._tempPlayerId) {
      window._tempPlayerId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    }
    return window._tempPlayerId;
  }
}

/**
 * Obtiene los movimientos legales filtrados por la ficha actualmente seleccionada.
 */
function selectedMoves(legal) {
  if (!ui.selected) return [];
  return legal.filter(m => m.from[0] === ui.selected[0] && m.from[1] === ui.selected[1]);
}

/**
 * Genera el objeto de estado compartible con Firebase.
 */
function publicState() {
  return {
    board: ui.board,
    turn: ui.turn,
    forced: ui.forced || null,
    captured: ui.captured || { white: 0, black: 0 },
    lastMove: ui.lastMove || null,
    over: Boolean(ui.over),
    winner: ui.winner || null,
    reason: ui.reason || null,
    gameId: ui.gameId || null
  };
}

/**
 * Aplica el estado recibido desde Firebase y sincroniza la interfaz de forma segura.
 */
function applyRemoteState(state) {
  if (!state) return;

  const previousOver = ui.over;
  const previousLastMove = ui.lastMove;

  ui.board = deserializeBoard(state.board);
  ui.turn = state.turn === BLACK ? BLACK : WHITE;
  ui.forced = state.forced || null;
  ui.captured = state.captured || { white: 0, black: 0 };
  ui.lastMove = state.lastMove || null;
  ui.over = Boolean(state.over);
  ui.winner = state.winner || null;
  ui.reason = state.reason || null;
  ui.gameId = state.gameId || null;
  ui.selected = null;
  ui.busy = false;

  // Si recibimos un movimiento nuevo del rival, reproducir sonido
  if (state.lastMove && (!previousLastMove || state.lastMove.to[0] !== previousLastMove.to[0] || state.lastMove.to[1] !== previousLastMove.to[1])) {
    const isCapture = Math.abs(state.lastMove.from[0] - state.lastMove.to[0]) > 1;
    if (isCapture) sounds.playCapture();
    else sounds.playMove();
  }

  // Auto-flip si somos Negras
  if (ui.mode === 'online' && ui.player === BLACK) {
    ui.flipped = true;
  }

  render();

  if (ui.over) {
    sounds.playWin();
    showGameOver(ui.winner, ui.reason, false);
  } else if (previousOver) {
    // Si la partida anterior estaba finalizada y llega un nuevo estado no finalizado (reinicio remoto)
    $('resultModal').classList.add('hidden');
  }
}

/**
 * Envía el estado actual a Firebase si se está en una sala online.
 */
function sendState() {
  if (ui.mode === 'online' && ui.connected && ui.roomRef && (ui.player === WHITE || ui.player === BLACK)) {
    ui.roomRef.child('state').set(publicState()).catch(err => {
      console.error('Error al sincronizar con Firebase:', err);
      $('status').textContent = 'Error al sincronizar con el servidor.';
    });
  }
}

/**
 * Genera la URL para compartir la sala.
 */
function roomUrl() {
  const origin = location.origin === 'null' ? '' : location.origin;
  return `${origin}${location.pathname}?room=${encodeURIComponent(ui.roomId)}`;
}

function updateShare() {
  const row = $('shareRow');
  const link = $('shareLink');
  if (ui.mode === 'online' && ui.roomId) {
    link.value = roomUrl();
    row.classList.remove('hidden');
  } else {
    row.classList.add('hidden');
  }
}

/**
 * Conexión a la sala de Firebase Realtime Database.
 * Emparejamiento directo, rápido y sin transacciones que colisionen.
 */
async function connectRoom() {
  if (!window.firebaseConfig || !window.firebaseConfig.apiKey) {
    $('status').textContent = 'Configura Firebase en js/firebase-config.js.';
    return;
  }

  if (typeof firebase === 'undefined') {
    $('status').textContent = 'No se pudo cargar la librería de Firebase.';
    return;
  }

  if (!firebase.apps.length) {
    firebase.initializeApp(window.firebaseConfig);
  }

  const db = firebase.database();
  const playerId = getPlayerId();
  const roomRef = db.ref(`checkers-rooms/${ui.roomId}`);
  ui.roomRef = roomRef;

  // 1. Suscripción en tiempo real a los cambios de estado de la partida
  roomRef.child('state').on('value', snapshot => {
    const data = snapshot.val();
    if (data) {
      applyRemoteState(data);
    }
  });

  // 2. Suscripción en tiempo real a los jugadores de la sala
  roomRef.child('players').on('value', snapshot => {
    const players = snapshot.val() || {};
    if (players.white === playerId) {
      ui.player = WHITE;
      ui.flipped = false;
    } else if (players.black === playerId) {
      ui.player = BLACK;
      ui.flipped = true;
    } else {
      ui.player = 'spectator';
    }
    ui.connected = true;
    render();
  });

  // 3. Registrar o conectar a la sala
  try {
    const snap = await roomRef.once('value');
    const roomData = snap.val();

    if (!roomData || !roomData.players || !roomData.players.white) {
      // Sala nueva: nos convertimos en el anfitrión (Blancas)
      await roomRef.set({
        players: { white: playerId },
        state: publicState()
      });
      ui.player = WHITE;
      ui.flipped = false;
    } else {
      // Sala existente: comprobamos si somos anfitrión, invitado o nuevo rival
      const players = roomData.players;
      if (players.white === playerId) {
        ui.player = WHITE;
        ui.flipped = false;
      } else if (!players.black || players.black === playerId) {
        // Asignar las Negras al invitado
        await roomRef.child('players/black').set(playerId);
        ui.player = BLACK;
        ui.flipped = true;
      } else {
        ui.player = 'spectator';
      }
    }

    ui.connected = true;
    updateShare();
    render();
  } catch (error) {
    console.error('Firebase error:', error);
    $('status').textContent = 'No se pudo conectar a Firebase (revisa la conexión).';
  }
}

/**
 * Inicia o reinicia una partida.
 */
function start(isRestart = false) {
  sounds.init();

  if (ui.aiTimeout) {
    clearTimeout(ui.aiTimeout);
    ui.aiTimeout = null;
  }

  const newGameId = Date.now().toString();

  // Si estamos reiniciando en una sala online ya conectada
  if (isRestart && ui.mode === 'online' && ui.connected && ui.roomRef) {
    ui.board = CheckersRules.initialBoard();
    ui.turn = WHITE;
    ui.selected = null;
    ui.forced = null;
    ui.captured = { white: 0, black: 0 };
    ui.lastMove = null;
    ui.over = false;
    ui.winner = null;
    ui.reason = null;
    ui.busy = false;
    ui.gameId = newGameId;

    $('resultModal').classList.add('hidden');
    sendState();
    render();
    return;
  }

  if (ui.roomRef) {
    ui.roomRef.off();
    ui.roomRef = null;
  }

  Object.assign(ui, {
    board: CheckersRules.initialBoard(),
    turn: WHITE,
    selected: null,
    forced: null,
    captured: { white: 0, black: 0 },
    lastMove: null,
    over: false,
    winner: null,
    reason: null,
    busy: false,
    player: null,
    flipped: false,
    connected: false,
    gameId: newGameId
  });

  if (ui.mode === 'online') {
    ui.roomId = new URLSearchParams(location.search).get('room') ||
      (crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`).replace(/[^a-z0-9-]/gi, '');
    history.replaceState(null, '', `?room=${encodeURIComponent(ui.roomId)}`);
    connectRoom();
  } else {
    ui.roomId = null;
    if (new URLSearchParams(location.search).has('room')) {
      history.replaceState(null, '', location.pathname);
    }
  }

  document.body.classList.add('playing');
  $('setup').classList.add('hidden');
  $('game').classList.remove('hidden');
  $('resultModal').classList.add('hidden');

  updateShare();
  render();
}

/**
 * Dibuja el tablero y los paneles de estado, soportando inversión de perspectiva.
 */
function render() {
  const boardEl = $('board');
  if (!ui.board) ui.board = CheckersRules.initialBoard();

  const legal = ui.over ? [] : CheckersRules.legalSteps(ui.board, ui.turn, ui.forced);
  const moves = selectedMoves(legal);

  // Fichas con captura obligatoria
  const hasCapture = legal.some(m => Boolean(m.capture));
  const mustCaptureOrigins = hasCapture
    ? new Set(legal.filter(m => Boolean(m.capture)).map(m => `${m.from[0]},${m.from[1]}`))
    : new Set();

  boardEl.innerHTML = '';

  // Determinar orden de iteración de filas y columnas según perspectiva
  const rows = ui.flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
  const cols = ui.flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];

  for (const r of rows) {
    for (const c of cols) {
      const cell = document.createElement('button');
      const piece = ui.board[r] ? ui.board[r][c] : null;
      const isDark = (r + c) % 2 === 1;

      cell.className = `square ${isDark ? 'dark' : 'light'}`;
      cell.setAttribute('role', 'gridcell');
      cell.setAttribute('aria-label', `${String.fromCharCode(65 + c)}${8 - r}`);

      // Resaltar último movimiento (origen y destino)
      if (ui.lastMove) {
        if ((ui.lastMove.from[0] === r && ui.lastMove.from[1] === c) ||
            (ui.lastMove.to[0] === r && ui.lastMove.to[1] === c)) {
          cell.classList.add('last-move');
        }
      }

      if (ui.selected?.[0] === r && ui.selected?.[1] === c) {
        cell.classList.add('selected');
      }

      const move = moves.find(m => m.to[0] === r && m.to[1] === c);
      if (move) {
        cell.classList.add(move.capture ? 'capture' : 'target');
      }

      if (piece) {
        const pieceEl = document.createElement('span');
        const isMustCapture = piece.color === ui.turn && mustCaptureOrigins.has(`${r},${c}`);
        pieceEl.className = `piece ${piece.color} ${piece.king ? 'king' : ''} ${isMustCapture ? 'must-capture' : ''}`;
        cell.append(pieceEl);
      }

      cell.onclick = () => clickSquare(r, c);
      boardEl.append(cell);
    }
  }

  // Marcador de capturas
  $('whiteCaptured').textContent = ui.captured.white;
  $('blackCaptured').textContent = ui.captured.black;

  // Tarjetas de jugador activo e indicadores de rol
  $('whiteCard').classList.toggle('active', ui.turn === WHITE);
  $('blackCard').classList.toggle('active', ui.turn === BLACK);

  let whiteLabelText = 'Blancas';
  let blackLabelText = ui.mode === 'ai' ? 'Máquina (negras)' : 'Negras';

  if (ui.mode === 'online') {
    if (ui.player === WHITE) whiteLabelText += ' (Tú)';
    else if (ui.player === BLACK) blackLabelText += ' (Tú)';
  }

  $('whiteLabel').textContent = whiteLabelText;
  $('blackLabel').textContent = blackLabelText;

  renderStatus(legal);
}

/**
 * Actualiza el texto descriptivo del estado de la partida.
 */
function renderStatus(legal) {
  const statusEl = $('status');

  if (ui.over) {
    statusEl.textContent = 'Partida finalizada.';
    return;
  }

  if (ui.mode === 'online' && !ui.connected) {
    statusEl.textContent = 'Conectando a la sala de juego…';
    return;
  }

  if (ui.busy) {
    statusEl.textContent = 'La máquina está pensando su jugada…';
    return;
  }

  const hasCapture = legal.some(m => Boolean(m.capture));
  const captureNote = hasCapture ? ' · ¡Debes capturar!' : '';

  if (ui.mode === 'online') {
    if (ui.player === 'spectator') {
      statusEl.textContent = `Modo espectador: turno de ${getPlayerName(ui.turn)}${captureNote}`;
      return;
    }
    const isMyTurn = ui.player === ui.turn;
    statusEl.textContent = isMyTurn
      ? `Tu turno (${ui.player === WHITE ? 'blancas' : 'negras'})${captureNote}`
      : `Esperando a tu rival… (${getPlayerName(ui.turn)})`;
    return;
  }

  statusEl.textContent = `Turno de ${getPlayerName(ui.turn)}${captureNote}`;
}

/**
 * Gestión del clic / toque en una casilla del tablero.
 */
function clickSquare(r, c) {
  if (ui.over || ui.busy) return;

  // Validaciones según modo
  if (ui.mode === 'ai' && ui.turn === BLACK) return;
  if (ui.mode === 'online' && (!ui.connected || ui.player !== ui.turn)) return;

  const legal = CheckersRules.legalSteps(ui.board, ui.turn, ui.forced);
  const move = selectedMoves(legal).find(m => m.to[0] === r && m.to[1] === c);

  if (move) {
    doStep(move);
    return;
  }

  // Si la captura encadenada está forzada, no se permite cambiar de pieza
  if (ui.forced) return;

  // Deseleccionar al pulsar en la misma ficha o en una casilla vacía
  if (ui.selected && (!ui.board[r] || !ui.board[r][c] || (ui.selected[0] === r && ui.selected[1] === c))) {
    ui.selected = null;
    render();
    return;
  }

  // Seleccionar pieza propia que tenga movimientos válidos
  if (ui.board[r]?.[c]?.color === ui.turn && legal.some(m => m.from[0] === r && m.from[1] === c)) {
    ui.selected = [r, c];
    sounds.playMove();
    render();
  }
}

/**
 * Ejecuta un paso individual de un movimiento.
 */
function doStep(move) {
  const actor = ui.turn;
  const isCapture = Boolean(move.capture);

  if (isCapture) {
    ui.captured[actor]++;
    sounds.playCapture();
  } else {
    sounds.playMove();
  }

  ui.lastMove = { from: move.from, to: move.to };

  const applied = CheckersRules.apply(ui.board, move);
  ui.board = applied.board;

  if (applied.crowned) {
    sounds.playCrown();
  }

  // Comprobar captura encadenada obligatoria
  const nextCaptures = move.capture && !applied.crowned
    ? CheckersRules.legalSteps(ui.board, actor, move.to)
    : [];

  if (nextCaptures.length > 0) {
    ui.forced = move.to;
    ui.selected = move.to;
    sendState();
    render();
    return;
  }

  ui.forced = null;
  ui.selected = null;
  finishTurn();
}

/**
 * Concluye el turno del jugador activo y verifica condiciones de victoria o turno de la IA.
 */
function finishTurn() {
  ui.turn = otherColor(ui.turn);

  const hasPieces = CheckersRules.hasPieces(ui.board, ui.turn);
  const legalTurns = hasPieces ? CheckersRules.turns(ui.board, ui.turn) : [];

  if (!hasPieces || legalTurns.length === 0) {
    const winner = otherColor(ui.turn);
    const reason = !hasPieces
      ? `${getPlayerName(ui.turn)} se ha quedado sin fichas.`
      : `${getPlayerName(ui.turn)} no tiene movimientos posibles (bloqueo).`;
    endGame(winner, reason);
    return;
  }

  sendState();
  render();

  // Turno de la máquina en modo IA
  if (ui.mode === 'ai' && ui.turn === BLACK) {
    ui.busy = true;
    render();

    ui.aiTimeout = setTimeout(() => {
      ui.busy = false;
      const choice = CheckersAI.choose(ui.board, ui.level);
      if (choice) {
        executeAiSequence(choice);
      }
    }, 450);
  }
}

/**
 * Ejecuta los pasos de la IA con una pequeña animación visual fluida.
 */
function executeAiSequence(steps) {
  if (!steps || !steps.length) return;

  let index = 0;
  function nextStep() {
    if (ui.over || ui.mode !== 'ai') return;
    const currentMove = steps[index++];
    doStep(currentMove);

    if (index < steps.length && ui.forced) {
      ui.aiTimeout = setTimeout(nextStep, 280);
    }
  }

  nextStep();
}

/**
 * Concluye la partida declarando ganador y motivo.
 */
function endGame(winner, reason) {
  ui.over = true;
  ui.winner = winner;
  ui.reason = reason;

  sounds.playWin();
  sendState();
  render();
  showGameOver(winner, reason, true);
}

/**
 * Muestra el modal con el resultado de la partida.
 */
function showGameOver(winner, reason, localTrigger = false) {
  $('resultTitle').textContent = getWinnerTitle(winner);
  $('resultText').textContent = reason || '';
  $('resultModal').classList.remove('hidden');
}

/**
 * Cambia el modo de juego ('local', 'online', 'ai').
 */
function setMode(mode) {
  ui.mode = mode;
  document.querySelectorAll('[data-mode]').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.mode === mode);
  });
  $('difficultyRow').classList.toggle('hidden', mode !== 'ai');
}

/**
 * Comparte la partida usando la Web Share API nativa o copia al portapapeles como fallback.
 */
async function shareGame() {
  sounds.init();
  const url = roomUrl();
  const shareData = {
    title: '♛ Damas Clásicas',
    text: '¡Únete a mi partida de Damas en línea y juguemos ahora!',
    url: url
  };

  if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
    try {
      await navigator.share(shareData);
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }

  // Fallback a portapapeles
  const input = $('shareLink');
  try {
    await navigator.clipboard.writeText(url);
  } catch (e) {
    input.select();
    document.execCommand('copy');
  }

  const btn = $('shareBtn');
  const prevText = btn.innerHTML;
  btn.textContent = '¡Copiado al portapapeles!';
  setTimeout(() => {
    btn.innerHTML = prevText;
  }, 1600);
}

/**
 * Inicialización de eventos al cargar la página.
 */
function initEvents() {
  document.querySelectorAll('[data-mode]').forEach(button => {
    button.onclick = () => setMode(button.dataset.mode);
  });

  document.querySelectorAll('[data-level]').forEach(button => {
    button.onclick = () => {
      ui.level = button.dataset.level;
      document.querySelectorAll('[data-level]').forEach(b => {
        b.classList.toggle('selected', b === button);
      });
    };
  });

  $('startButton').onclick = () => start(false);
  $('restart').onclick = () => start(true);
  $('playAgain').onclick = () => start(true);

  // Botón de compartir nativo / copiar
  $('shareBtn').onclick = shareGame;

  // Botón para invertir perspectiva del tablero manualmente
  $('flipBtn').onclick = () => {
    sounds.init();
    ui.flipped = !ui.flipped;
    render();
  };

  // Botón de alternar sonido
  const soundBtn = $('soundBtn');
  soundBtn.textContent = sounds.enabled ? '🔊' : '🔇';
  soundBtn.onclick = () => {
    const isEnabled = sounds.toggle();
    soundBtn.textContent = isEnabled ? '🔊' : '🔇';
  };

  $('newGame').onclick = () => {
    sounds.init();
    if (ui.aiTimeout) {
      clearTimeout(ui.aiTimeout);
      ui.aiTimeout = null;
    }
    if (ui.roomRef) {
      ui.roomRef.off();
      ui.roomRef = null;
      ui.connected = false;
    }
    document.body.classList.remove('playing');
    $('game').classList.add('hidden');
    $('setup').classList.remove('hidden');
    $('resultModal').classList.add('hidden');
  };

  // Si se accede mediante enlace compartido ?room=xxx
  if (new URLSearchParams(location.search).has('room')) {
    setMode('online');
    start(false);
  }
}

if (typeof document !== 'undefined') {
  window.addEventListener('DOMContentLoaded', initEvents);
}
