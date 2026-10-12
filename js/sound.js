/**
 * Gestor de efectos de sonido sintetizados (Web Audio API) y feedback háptico.
 * 100% nativo, ultra-ligero y compatible con iOS Safari y Android Chrome.
 */

class SoundEffects {
  constructor() {
    this.ctx = null;
    this.enabled = localStorage.getItem('damasSound') !== 'false';
    this.unlocked = false;

    // Desbloquear audio automáticamente con el primer toque / clic del usuario
    const unlock = () => {
      this.init();
      window.removeEventListener('click', unlock);
      window.removeEventListener('touchstart', unlock);
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('click', unlock, { once: true, passive: true });
      window.addEventListener('touchstart', unlock, { once: true, passive: true });
    }
  }

  init() {
    if (!this.ctx && (window.AudioContext || window.webkitAudioContext)) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    this.unlocked = true;
  }

  toggle() {
    this.enabled = !this.enabled;
    localStorage.setItem('damasSound', this.enabled ? 'true' : 'false');
    if (this.enabled) {
      this.init();
      this.playMove();
    }
    return this.enabled;
  }

  // Sonido de movimiento de madera
  playMove() {
    this.vibrate(20);
    if (!this.enabled) return;

    try {
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(30, now + 0.08);

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.08);
    } catch (e) {}
  }

  // Sonido de captura (más percusivo y con rebote)
  playCapture() {
    this.vibrate([35, 40, 35]);
    if (!this.enabled) return;

    try {
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;

      // Golpe 1
      const osc1 = this.ctx.createOscillator();
      const gain1 = this.ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(300, now);
      osc1.frequency.exponentialRampToValueAtTime(50, now + 0.12);
      gain1.gain.setValueAtTime(0.45, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc1.connect(gain1);
      gain1.connect(this.ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.12);

      // Golpe 2 (rebote)
      const osc2 = this.ctx.createOscillator();
      const gain2 = this.ctx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(240, now + 0.04);
      osc2.frequency.exponentialRampToValueAtTime(45, now + 0.14);
      gain2.gain.setValueAtTime(0.3, now + 0.04);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      osc2.connect(gain2);
      gain2.connect(this.ctx.destination);
      osc2.start(now + 0.04);
      osc2.stop(now + 0.14);
    } catch (e) {}
  }

  // Sonido al coronar dama (arpegio mágico)
  playCrown() {
    this.vibrate([40, 40, 60]);
    if (!this.enabled) return;

    try {
      this.init();
      if (!this.ctx) return;

      const notes = [330, 440, 554, 659];
      const now = this.ctx.currentTime;

      notes.forEach((freq, i) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const time = now + i * 0.07;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, time);

        gain.gain.setValueAtTime(0.25, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.25);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(time);
        osc.stop(time + 0.25);
      });
    } catch (e) {}
  }

  // Sonido triunfal de fin de partida
  playWin() {
    this.vibrate([80, 50, 120]);
    if (!this.enabled) return;

    try {
      this.init();
      if (!this.ctx) return;

      const chord = [261.63, 329.63, 392.00, 523.25];
      const now = this.ctx.currentTime;

      chord.forEach(freq => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0.28, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.9);
      });
    } catch (e) {}
  }

  vibrate(pattern) {
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(pattern);
      }
    } catch (e) {}
  }
}

const sounds = new SoundEffects();
