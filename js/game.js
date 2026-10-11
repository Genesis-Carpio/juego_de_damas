/**
 * Controlador de interfaz y flujo de juego de Damas Clásicas.
 * Soporta modos: local (dos jugadores), online (Firebase) e IA (Minimax).
 */

const ui = {
  mode: 'local',           // 'local' | 'online' | 'ai'
  level: 'easy',           // 'easy' | 'medium' | 'hard'
  board: null,
  turn: WHITE,
  selected: null,
  forced: null,            // [r, c] de captura encadenada obligatoria
  captured: { white: 0, black: 0 },
  over: false,
  winner: null,
  reason: null,
  busy: false,
  roomId: null,
  player: null,            // WHITE | BLACK | 'spectator'
  roomRef: null,
  connected: false,
  gameId: null,
  aiTimeout: null
};

const $ = id => document.getElementById(id);

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
    forced: ui.forced,
    captured: ui.captured,
    over: ui.over,
    winner: ui.winner,
    reason: ui.reason,
    gameId: ui.gameId
  };
}

/**
 * Aplica el estado recibido desde Firebase y sincroniza la interfaz.
 */
function applyRemoteState(state) {
  if (!state) return;

  const previousOver = ui.over;
  ui.board = state.board;
  ui.turn = state.turn;
  ui.forced = state.forced;
  ui.captured = state.captured || { white: 0, black: 0 };
  ui.over = Boolean(state.over);
  ui.winner = state.winner || null;
  ui.reason = state.reason || null;
  ui.gameId = state.gameId || null;
  ui.selected = null;
  ui.busy = false;

  render();

  if (ui.over) {
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
 */
async function connectRoom() {
  if (!window.firebaseConfig || window.firebaseConfig.apiKey.startsWith('REEMPLAZA')) {
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
  ui.roomRef = db.ref(`checkers-rooms/${ui.roomId}`);

  try {
    // Asignación transaccional de roles (blancas / negras / espectador)
    const result = await ui.roomRef.transaction(room => {
      room = room || { state: publicState(), players: {} };
      room.players = room.players || {};

      if (!room.players[playerId]) {
        const occupied = Object.values(room.players);
        if (!occupied.includes(WHITE)) {
          room.players[playerId] = WHITE;
        } else if (!occupied.includes(BLACK)) {
          room.players[playerId] = BLACK;
        } else {
          room.players[playerId] = 'spectator';
        }
      }
      return room;
    });

    if (!result.committed || !result.snapshot) {
      $('status').textContent = 'No se pudo conectar a la sala.';
      return;
    }

    const roomData = result.snapshot.val();
    ui.player = roomData?.players?.[playerId] || 'spectator';
    ui.connected = true;

    // Escuchar cambios de estado en tiempo real
    ui.roomRef.child('state').on('value', snapshot => {
      const data = snapshot.val();
      if (data) {
        applyRemoteState(data);
      }
    });

    updateShare();
    render();
  } catch (error) {
    console.error('Firebase error:', error);
    $('status').textContent = 'No se pudo conectar a Firebase (revisa la conexión y reglas).';
  }
}

/**
 * Inicia o reinicia una partida.
 */
function start(isRestart = false) {
  // Cancelar temporizadores activos de IA
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

  // Limpiar conexión previa si existía
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
    over: false,
    winner: null,
    reason: null,
    busy: false,
    player: null,
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

  $('setup').classList.add('hidden');
  $('game').classList.remove('hidden');
  $('resultModal').classList.add('hidden');

  updateShare();
  render();
}

/**
 * Dibuja el tablero y los paneles de estado.
 */
function render() {
  const boardEl = $('board');
  const legal = ui.over ? [] : CheckersRules.legalSteps(ui.board, ui.turn, ui.forced);
  const moves = selectedMoves(legal);

  boardEl.innerHTML = '';

  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const cell = document.createElement('button');
      const piece = ui.board[r][c];
      const isDark = (r + c) % 2 === 1;

      cell.className = `square ${isDark ? 'dark' : 'light'}`;
      cell.setAttribute('role', 'gridcell');
      cell.setAttribute('aria-label', `${String.fromCharCode(65 + c)}${8 - r}`);

      if (ui.selected?.[0] === r && ui.selected?.[1] === c) {
        cell.classList.add('selected');
      }

      const move = moves.find(m => m.to[0] === r && m.to[1] === c);
      if (move) {
        cell.classList.add(move.capture ? 'capture' : 'target');
      }

      if (piece) {
        const pieceEl = document.createElement('span');
        pieceEl.className = `piece ${piece.color} ${piece.king ? 'king' : ''}`;
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

  // Mensaje de estado superior
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
  const captureNote = hasCapture ? ' · ¡Captura obligatoria!' : '';

  if (ui.mode === 'online') {
    if (ui.player === 'spectator') {
      statusEl.textContent = `Modo espectador: turno de ${getPlayerName(ui.turn)}${captureNote}`;
      return;
    }
    const isMyTurn = ui.player === ui.turn;
    statusEl.textContent = isMyTurn
      ? `Tu turno (${ui.player === WHITE ? 'blancas' : 'negras'})${captureNote}`
      : `Esperando al rival… (${getPlayerName(ui.turn)})`;
    return;
  }

  statusEl.textContent = `Turno de ${getPlayerName(ui.turn)}${captureNote}`;
}

/**
 * Gestión del clic en una casilla del tablero.
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

  // Seleccionar o deseleccionar pieza propia que tenga movimientos válidos
  if (ui.board[r][c]?.color === ui.turn && legal.some(m => m.from[0] === r && m.from[1] === c)) {
    if (ui.selected?.[0] === r && ui.selected?.[1] === c) {
      ui.selected = null;
    } else {
      ui.selected = [r, c];
    }
    render();
  }
}

/**
 * Ejecuta un paso individual de un movimiento.
 */
function doStep(move) {
  const actor = ui.turn;
  if (move.capture) {
    ui.captured[actor]++;
  }

  const applied = CheckersRules.apply(ui.board, move);
  ui.board = applied.board;

  // Si hubo captura y no acaba de coronar en este paso, comprueba saltos adicionales obligatorios
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

  // Comprobar si el nuevo jugador tiene piezas o movimientos disponibles
  const hasPieces = CheckersRules.hasPieces(ui.board, ui.turn);
  const legalTurns = hasPieces ? CheckersRules.turns(ui.board, ui.turn) : [];

  if (!hasPieces || legalTurns.length === 0) {
    const winner = otherColor(ui.turn);
    const reason = !hasPieces
      ? `${getPlayerName(ui.turn)} no tiene fichas restantes.`
      : `${getPlayerName(ui.turn)} no tiene movimientos legales disponibles (bloqueado).`;
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
    }, 400);
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
      ui.aiTimeout = setTimeout(nextStep, 260);
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

  $('copyLink').onclick = async () => {
    const input = $('shareLink');
    try {
      await navigator.clipboard.writeText(input.value);
    } catch (e) {
      input.select();
      document.execCommand('copy');
    }
    const btn = $('copyLink');
    btn.textContent = '¡Copiado!';
    setTimeout(() => {
      btn.textContent = 'Copiar enlace';
    }, 1500);
  };

  $('newGame').onclick = () => {
    if (ui.aiTimeout) {
      clearTimeout(ui.aiTimeout);
      ui.aiTimeout = null;
    }
    if (ui.roomRef) {
      ui.roomRef.off();
      ui.roomRef = null;
      ui.connected = false;
    }
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
