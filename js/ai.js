/**
 * Inteligencia Artificial para el juego de Damas con algoritmo Minimax y poda Alfa-Beta.
 * Compatible con navegador y entornos CommonJS (Node.js).
 */

let _CheckersRules = typeof CheckersRules !== 'undefined' ? CheckersRules : null;
let _BLACK = typeof BLACK !== 'undefined' ? BLACK : 'black';
let _WHITE = typeof WHITE !== 'undefined' ? WHITE : 'white';
let _SIZE = typeof SIZE !== 'undefined' ? SIZE : 8;

if (typeof require !== 'undefined' && !_CheckersRules) {
  try {
    const rulesModule = require('./rules.js');
    _CheckersRules = rulesModule.CheckersRules;
    _BLACK = rulesModule.BLACK;
    _WHITE = rulesModule.WHITE;
    _SIZE = rulesModule.SIZE;
  } catch (e) {
    // Entorno de navegador sin require
  }
}

class CheckersAI {
  /**
   * Selecciona el mejor turno para las Negras según el nivel de dificultad.
   * @param {Array} board - Matriz del tablero actual.
   * @param {'easy'|'medium'|'hard'} level - Nivel de dificultad.
   * @returns {Array|null} Secuencia de pasos que componen el turno elegido.
   */
  static choose(board, level) {
    const rules = typeof CheckersRules !== 'undefined' ? CheckersRules : _CheckersRules;
    const black = typeof BLACK !== 'undefined' ? BLACK : _BLACK;
    const white = typeof WHITE !== 'undefined' ? WHITE : _WHITE;

    const turns = rules.turns(board, black);
    if (!turns.length) return null;

    // Nivel fácil: 70% de decisiones aleatorias entre las legales
    if (level === 'easy' && Math.random() < 0.7) {
      return turns[Math.floor(Math.random() * turns.length)];
    }

    const depth = level === 'hard' ? 5 : 3;
    let best = -Infinity;
    let pick = turns[0];

    for (const t of turns) {
      const nextBoard = this.play(board, t);
      const val = this.minimax(nextBoard, white, depth - 1, best, Infinity);
      if (val > best) {
        best = val;
        pick = t;
      }
    }

    return pick;
  }

  /**
   * Aplica una secuencia completa de pasos a un tablero y retorna el estado final.
   */
  static play(board, turnSeq) {
    const rules = typeof CheckersRules !== 'undefined' ? CheckersRules : _CheckersRules;
    return turnSeq.reduce((state, step) => rules.apply(state, step).board, board);
  }

  /**
   * Función heurística de evaluación posicional desde la perspectiva de las Negras.
   */
  static evaluate(b) {
    const black = typeof BLACK !== 'undefined' ? BLACK : _BLACK;
    const size = typeof SIZE !== 'undefined' ? SIZE : _SIZE;

    let score = 0;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const p = b[r][c];
        if (!p) continue;

        let value = p.king ? 185 : 100;
        // Bonificación por avance hacia la coronación
        if (!p.king) {
          value += (p.color === black ? r : 7 - r) * 7;
        }
        // Bonificación por control del centro
        if (r >= 2 && r <= 5 && c >= 2 && c <= 5) {
          value += 5;
        }

        score += (p.color === black ? value : -value);
      }
    }
    return score;
  }

  /**
   * Minimax con poda Alfa-Beta y optimización en hojas.
   */
  static minimax(b, color, depth, alpha, beta) {
    // Si llegamos a la profundidad límite, evaluamos la posición estática sin generar turnos
    if (depth <= 0) {
      return this.evaluate(b);
    }

    const rules = typeof CheckersRules !== 'undefined' ? CheckersRules : _CheckersRules;
    const black = typeof BLACK !== 'undefined' ? BLACK : _BLACK;
    const white = typeof WHITE !== 'undefined' ? WHITE : _WHITE;

    const turns = rules.turns(b, color);

    // Si no hay movimientos posibles, posición terminal (derrota)
    if (!turns.length) {
      return this.evaluate(b) + (color === black ? -10000 : 10000);
    }

    if (color === black) {
      // Maximizador
      let maxEval = -Infinity;
      for (const t of turns) {
        const evalVal = this.minimax(this.play(b, t), white, depth - 1, alpha, beta);
        maxEval = Math.max(maxEval, evalVal);
        alpha = Math.max(alpha, maxEval);
        if (alpha >= beta) break; // Poda beta
      }
      return maxEval;
    } else {
      // Minimizador
      let minEval = Infinity;
      for (const t of turns) {
        const evalVal = this.minimax(this.play(b, t), black, depth - 1, alpha, beta);
        minEval = Math.min(minEval, evalVal);
        beta = Math.min(beta, minEval);
        if (alpha >= beta) break; // Poda alfa
      }
      return minEval;
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CheckersAI };
}
