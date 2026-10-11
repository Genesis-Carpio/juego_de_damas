const assert = require('assert');
const { CheckersRules, WHITE, BLACK } = require('../js/rules.js');
const { CheckersAI } = require('../js/ai.js');

console.log('--- Iniciando suite de pruebas de Damas Clásicas ---');

// 1. Movimientos simples de peón
{
  const b = Array.from({ length: 8 }, () => Array(8).fill(null));
  b[4][3] = { color: WHITE, king: false };
  assert.deepStrictEqual(
    CheckersRules.simple(b, 4, 3).map(m => m.to),
    [[3, 2], [3, 4]],
    'El peón blanco debe avanzar solo hacia sus dos diagonales delanteras.'
  );

  b[4][3] = { color: BLACK, king: false };
  assert.deepStrictEqual(
    CheckersRules.simple(b, 4, 3).map(m => m.to),
    [[5, 2], [5, 4]],
    'El peón negro debe avanzar solo hacia sus dos diagonales delanteras.'
  );
  console.log('✔ Test 1 superado: Movimientos simples de peones.');
}

// 2. Movimientos simples de dama voladora (recorrer toda la diagonal)
{
  const b = Array.from({ length: 8 }, () => Array(8).fill(null));
  // Dama blanca en [3, 3] en tablero vacío
  b[3][3] = { color: WHITE, king: true };
  const moves = CheckersRules.simple(b, 3, 3);

  // En [3,3] debe tener:
  // Arriba-Izq: [2,2], [1,1], [0,0] (3)
  // Arriba-Der: [2,4], [1,5], [0,6] (3)
  // Abajo-Izq: [4,2], [5,1], [6,0] (3)
  // Abajo-Der: [4,4], [5,5], [6,6], [7,7] (4)
  // Total: 13 casillas
  assert.strictEqual(moves.length, 13, `La dama voladora debe tener 13 casillas de movimiento simple libre, se obtuvieron ${moves.length}`);

  // Con un obstáculo amigo en [1, 1] y enemigo en [5, 5]:
  b[1][1] = { color: WHITE, king: false };
  b[5][5] = { color: BLACK, king: false };
  const movesWithObstacles = CheckersRules.simple(b, 3, 3);
  const targets = movesWithObstacles.map(m => `${m.to[0]},${m.to[1]}`);

  assert.ok(targets.includes('2,2'), 'Debe alcanzar la casilla antes del aliado');
  assert.ok(!targets.includes('1,1'), 'No puede ocupar la casilla del aliado');
  assert.ok(!targets.includes('0,0'), 'No puede saltar sobre el aliado en movimiento simple');
  assert.ok(targets.includes('4,4'), 'Debe alcanzar la casilla antes del enemigo');
  assert.ok(!targets.includes('5,5'), 'No puede ocupar la casilla del enemigo en movimiento simple');
  assert.ok(!targets.includes('6,6'), 'No puede traspasar al enemigo en movimiento simple');
  console.log('✔ Test 2 superado: Movimientos simples de dama voladora a lo largo de diagonales.');
}

// 3. Captura simple y a distancia de dama voladora
{
  const b = Array.from({ length: 8 }, () => Array(8).fill(null));
  b[0][0] = { color: WHITE, king: true };
  b[2][2] = { color: BLACK, king: false }; // Enemigo

  const caps = CheckersRules.captures(b, 0, 0);
  // Puede aterrizar en [3,3], [4,4], [5,5], [6,6], [7,7]
  assert.strictEqual(caps.length, 5, 'La dama voladora debe poder aterrizar en cualquiera de las 5 casillas vacías tras el enemigo.');
  caps.forEach(c => {
    assert.deepStrictEqual(c.capture, [2, 2], 'La pieza capturada debe ser [2, 2].');
  });

  console.log('✔ Test 3 superado: Capturas de dama voladora con aterrizaje múltiple.');
}

// 4. Captura obligatoria
{
  const b = Array.from({ length: 8 }, () => Array(8).fill(null));
  b[4][3] = { color: WHITE, king: false }; // Puede hacer movimiento simple
  b[5][2] = { color: WHITE, king: false };
  b[4][1] = { color: BLACK, king: false }; // Puede ser capturada por [5,2] saltando a [3,0]

  const legal = CheckersRules.legalSteps(b, WHITE);
  assert.ok(legal.every(m => Boolean(m.capture)), 'Cuando hay una captura disponible, solo deben permitirse capturas.');
  assert.strictEqual(legal.length, 1, 'Solo debe permitirse la captura de [5,2] sobre [4,1].');
  console.log('✔ Test 4 superado: Obligatoriedad de capturas.');
}

// 5. Coronación de peón
{
  const b = Array.from({ length: 8 }, () => Array(8).fill(null));
  b[1][2] = { color: WHITE, king: false };
  const applied = CheckersRules.apply(b, { from: [1, 2], to: [0, 1], capture: null });
  assert.strictEqual(applied.crowned, true, 'El peón debe coronar al llegar a la fila 0.');
  assert.strictEqual(applied.board[0][1].king, true, 'La ficha debe ser rey (dama).');
  console.log('✔ Test 5 superado: Coronación.');
}

// 6. Inteligencia Artificial (CheckersAI)
{
  const initial = CheckersRules.initialBoard();
  const choice = CheckersAI.choose(initial, 'hard');
  assert.ok(Array.isArray(choice) && choice.length > 0, 'La IA debe generar un turno válido.');
  console.log('✔ Test 6 superado: Selección de jugadas de la IA.');
}

console.log('\n--- TODOS LOS TESTS PASARON EXITOSAMENTE (6/6) ---');
