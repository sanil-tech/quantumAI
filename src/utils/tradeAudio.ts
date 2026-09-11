// Web Audio API Synthesizer for Institutional-Grade Trading Feedback
// 100% native, zero external asset dependencies, zero network requests

class TradeAudioManager {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;

  constructor() {
    // Check if user previously muted
    try {
      this.isMuted = localStorage.getItem('quantum_trading_sound_muted') === 'true';
    } catch {}
  }

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    try {
      localStorage.setItem('quantum_trading_sound_muted', String(this.isMuted));
    } catch {}
    return this.isMuted;
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  public play(type: 'OPEN' | 'CLOSE' | 'TP_HIT' | 'SL_HIT' | 'RADAR_SCAN') {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      if (type === 'OPEN') {
        // High-tech institutional execution double-tone
        this.playTone(ctx, 587.33, now, 0.12, 'sine', 0.15); // D5
        this.playTone(ctx, 880.00, now + 0.08, 0.18, 'triangle', 0.18); // A5
      } else if (type === 'CLOSE') {
        // Crisp resolving chime
        this.playTone(ctx, 659.25, now, 0.10, 'sine', 0.12); // E5
        this.playTone(ctx, 523.25, now + 0.06, 0.16, 'sine', 0.12); // C5
      } else if (type === 'TP_HIT') {
        // Harmonic triumphant triad
        this.playTone(ctx, 523.25, now, 0.10, 'triangle', 0.15); // C5
        this.playTone(ctx, 659.25, now + 0.08, 0.12, 'triangle', 0.18); // E5
        this.playTone(ctx, 1046.50, now + 0.16, 0.25, 'sine', 0.20); // C6
      } else if (type === 'RADAR_SCAN') {
        // Soft sonar ping
        this.playTone(ctx, 987.77, now, 0.08, 'sine', 0.05); // B5
      }
    } catch {
      // Audio autoplay policy fallback
    }
  }

  private playTone(
    ctx: AudioContext,
    freq: number,
    startTime: number,
    duration: number,
    type: OscillatorType,
    maxGain: number
  ) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);

    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.exponentialRampToValueAtTime(maxGain, startTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.05);
  }
}

export const tradeAudio = new TradeAudioManager();
