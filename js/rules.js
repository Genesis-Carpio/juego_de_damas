/**
 * Motor de reglas para Damas Clásicas (8x8) con Damas Voladoras.
 * Compatible con navegadores y Node.js para testing.
 */

const SIZE = 8;
const WHITE = 'white';
const BLACK = 'black';

const DIRS = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1]
];

function otherColor(color) {
  return color === WHITE ? BLACK : WHITE;
}

function isInside(r, c) {
  return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
}

function cloneBoard(board) {
  return board.map(row => row.map(cell => (cell ? { ...cell } : null)));
}

class CheckersRules {
  /**
   * Crea el tablero inicial 8x8 con 12 fichas por bando en casillas oscuras.
   */
  static initialBoard() {
    const b = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if ((r + c) % 2 === 1 && (r < 3 || r > 4)) {
          b[r][c] = {
            color: r < 3 ? BLACK : WHITE,
            king: false
          };
        }
      }
    }
    return b;
  }

  /**
   * Direcciones frontales de avance de peones.
   */
  static forwardDirs(piece) {
    const dr = piece.color === WHITE ? -1 : 1;
    return DIRS.filter(([dRow]) => dRow === dr);
  }

  /**
   * Genera los movimientos simples (sin captura) válidos para una pieza en (r, c).
   * - Los peones solo avanzan 1 casilla diagonalmente.
   * - Las damas voladoras pueden recorrer cualquier cantidad de casillas libres en las 4 diagonales.
   */
  static simple(b, r, c) {
    const p = b[r][c];
    if (!p) return [];

    const out = [];

    if (!p.king) {
      // Peón: 1 casilla hacia adelante
      for (const [dr, dc] of this.forwardDirs(p)) {
        const tr = r + dr;
        const tc = c + dc;
        if (isInside(tr, tc) && !b[tr][tc]) {
          out.push({ from: [r, c], to: [tr, tc], capture: null });
        }
      }
    } else {
      // Dama voladora: recorre toda la diagonal hasta encontrar un obstáculo o el borde
      for (const [dr, dc] of DIRS) {
        let n = 1;
        while (true) {
          const tr = r + dr * n;
          const tc = c + dc * n;
          if (!isInside(tr, tc) || b[tr][tc]) break;
          out.push({ from: [r, c], to: [tr, tc], capture: null });
          n++;
        }
      }
    }

    return out;
  }

  /**
   * Genera las capturas disponibles para una pieza en (r, c).
   * - Los peones capturan saltando 1 casilla sobre un enemigo hacia una casilla vacía contigua.
   * - Las damas voladoras pueden saltar a distancia y elegir cualquier casilla vacía tras el enemigo.
   */
  static captures(b, r, c) {
    const p = b[r][c];
    if (!p) return [];

    const out = [];
    const enemyColor = otherColor(p.color);

    if (!p.king) {
      // Peón: captura en las 4 diagonales adyacentes
      for (const [dr, dc] of DIRS) {
        const mr = r + dr;
        const mc = c + dc;
        const tr = r + 2 * dr;
        const tc = c + 2 * dc;
        if (isInside(tr, tc) && b[mr]?.[mc]?.color === enemyColor && !b[tr][tc]) {
          out.push({ from: [r, c], to: [tr, tc], capture: [mr, mc] });
        }
      }
      return out;
    }

    // Dama voladora: busca a lo largo de las 4 diagonales
    for (const [dr, dc] of DIRS) {
      let n = 1;
      let enemy = null;

      while (true) {
        const tr = r + dr * n;
        const tc = c + dc * n;
        if (!isInside(tr, tc)) break;

        const cell = b[tr][tc];

        if (!enemy) {
          if (!cell) {
            n++;
            continue;
          }
          if (cell.color === p.color) {
            // Pieza aliada bloquea el paso
            break;
          }
          // Encontró primera pieza enemiga
          enemy = [tr, tc];
          n++;
          continue;
        }

        // Si ya encontramos un enemigo en esta diagonal:
        // Si hay otra pieza (amiga o enemiga) inmediatamente o después, se bloquea el salto
        if (cell) break;

        // Casilla vacía detrás del enemigo: casilla de aterrizaje válida
        out.push({ from: [r, c], to: [tr, tc], capture: enemy });
        n++;
      }
    }

    return out;
  }

  /**
   * Retorna los pasos legales para el jugador actual.
   * Si 'forced' está definido, solo evalúa capturas encadenadas para esa pieza.
   * Si hay capturas disponibles, solo permite capturas (captura obligatoria).
   */
  static legalSteps(b, color, forced = null) {
    if (forced) {
      return this.captures(b, forced[0], forced[1]);
    }

    const caps = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (b[r][c]?.color === color) {
          caps.push(...this.captures(b, r, c));
        }
      }
    }

    if (caps.length > 0) return caps;

    const simpleMoves = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (b[r][c]?.color === color) {
          simpleMoves.push(...this.simple(b, r, c));
        }
      }
    }

    return simpleMoves;
  }

  /**
   * Aplica un paso al tablero y retorna el nuevo tablero y si hubo coronación.
   */
  static apply(b, m) {
    const next = cloneBoard(b);
    const piece = next[m.from[0]][m.from[1]];
    next[m.from[0]][m.from[1]] = null;
    next[m.to[0]][m.to[1]] = piece;

    if (m.capture) {
      next[m.capture[0]][m.capture[1]] = null;
    }

    const crowned = !piece.king && m.to[0] === (piece.color === WHITE ? 0 : 7);
    if (crowned) {
      piece.king = true;
    }

    return { board: next, crowned };
  }

  /**
   * Genera todos los turnos completos posibles (secuencias de pasos) para un color.
   */
  static turns(b, color) {
    const result = [];

    const grow = (board, step, seq) => {
      const next = this.apply(board, step);
      const all = seq.concat(step);
      // Si hubo captura y la pieza NO acaba de coronar en este paso, comprueba saltos subsiguientes
      const follow = step.capture && !next.crowned ? this.legalSteps(next.board, color, step.to) : [];

      if (follow.length > 0) {
        follow.forEach(s => grow(next.board, s, all));
      } else {
        result.push(all);
      }
    };

    this.legalSteps(b, color).forEach(step => grow(b, step, []));
    return result;
  }

  /**
   * Comprueba si un bando tiene piezas en el tablero.
   */
  static hasPieces(b, color) {
    return b.some(row => row.some(cell => cell?.color === color));
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SIZE,
    WHITE,
    BLACK,
    otherColor,
    isInside,
    cloneBoard,
    CheckersRules
  };
}
