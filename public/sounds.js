const SoundManager = (function() {
  const STORAGE_KEY = 'ai_human_sound_muted';
  
  let audioContext = null;
  let muted = localStorage.getItem(STORAGE_KEY) === 'true';
  let initialized = false;

  function init() {
    if (initialized) return;
    
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      initialized = true;
      updateToggleUI();
    } catch (e) {
      console.warn('Web Audio API not supported:', e);
    }
  }

  function getAudioContext() {
    if (!audioContext) {
      init();
    }
    if (audioContext && audioContext.state === 'suspended') {
      audioContext.resume();
    }
    return audioContext;
  }

  function playTone(frequency, duration, type = 'sine', volume = 0.3) {
    if (muted) return;
    
    try {
      const ctx = getAudioContext();
      if (!ctx) return;

      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.frequency.value = frequency;
      oscillator.type = type;

      gainNode.gain.setValueAtTime(volume, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);

      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + duration);
    } catch (e) {
      console.warn('Error playing tone:', e);
    }
  }

  function playSuccessSound() {
    if (muted) return;
    
    try {
      const ctx = getAudioContext();
      if (!ctx) return;

      const notes = [523.25, 659.25, 783.99];
      const duration = 0.15;
      
      notes.forEach((freq, i) => {
        setTimeout(() => {
          playTone(freq, duration, 'sine', 0.25);
        }, i * 100);
      });
    } catch (e) {
      console.warn('Error playing success sound:', e);
    }
  }

  function playErrorSound() {
    if (muted) return;
    
    try {
      playTone(200, 0.3, 'sawtooth', 0.15);
      setTimeout(() => playTone(150, 0.3, 'sawtooth', 0.15), 150);
    } catch (e) {
      console.warn('Error playing error sound:', e);
    }
  }

  function playQuestionStartSound() {
    if (muted) return;
    
    try {
      const ctx = getAudioContext();
      if (!ctx) return;

      playTone(440, 0.1, 'sine', 0.2);
      setTimeout(() => playTone(880, 0.15, 'sine', 0.25), 100);
    } catch (e) {
      console.warn('Error playing question start sound:', e);
    }
  }

  function playGameEndSound() {
    if (muted) return;
    
    try {
      const ctx = getAudioContext();
      if (!ctx) return;

      const melody = [
        { freq: 523.25, time: 0, dur: 0.15 },
        { freq: 659.25, time: 150, dur: 0.15 },
        { freq: 783.99, time: 300, dur: 0.15 },
        { freq: 1046.50, time: 450, dur: 0.3 }
      ];

      melody.forEach(note => {
        setTimeout(() => {
          playTone(note.freq, note.dur, 'sine', 0.25);
        }, note.time);
      });
    } catch (e) {
      console.warn('Error playing game end sound:', e);
    }
  }

  function playTickSound() {
    if (muted) return;
    
    try {
      playTone(800, 0.05, 'square', 0.1);
    } catch (e) {
      console.warn('Error playing tick sound:', e);
    }
  }

  function playCountdownBeep() {
    if (muted) return;
    
    try {
      playTone(600, 0.1, 'sine', 0.15);
    } catch (e) {
      console.warn('Error playing countdown beep:', e);
    }
  }

  function playTimeUpSound() {
    if (muted) return;
    
    try {
      playTone(300, 0.4, 'sawtooth', 0.2);
      setTimeout(() => playTone(200, 0.5, 'sawtooth', 0.15), 200);
    } catch (e) {
      console.warn('Error playing time up sound:', e);
    }
  }

  function playButtonClickSound() {
    if (muted) return;
    
    try {
      playTone(500, 0.05, 'sine', 0.1);
    } catch (e) {
      console.warn('Error playing button click sound:', e);
    }
  }

  function toggle() {
    muted = !muted;
    localStorage.setItem(STORAGE_KEY, muted);
    updateToggleUI();
    return muted;
  }

  function setMuted(value) {
    muted = value;
    localStorage.setItem(STORAGE_KEY, muted);
    updateToggleUI();
  }

  function isMuted() {
    return muted;
  }

  function updateToggleUI() {
    const btn = document.getElementById('soundToggle');
    if (btn) {
      btn.classList.toggle('muted', muted);
      btn.setAttribute('aria-label', muted ? 'Включи звука' : 'Изключи звука');
      
      const waves = btn.querySelectorAll('.sound-waves');
      waves.forEach(wave => {
        wave.style.display = muted ? 'none' : 'block';
      });
    }
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
      init();
      
      const soundBtn = document.getElementById('soundToggle');
      if (soundBtn) {
        soundBtn.addEventListener('click', () => {
          init();
          toggle();
        });
        
        soundBtn.addEventListener('touchstart', () => {
          init();
        }, { passive: true });
      }
    });

    document.addEventListener('click', () => {
      init();
    }, { once: true });
  }

  return {
    init,
    toggle,
    setMuted,
    isMuted,
    playSuccessSound,
    playErrorSound,
    playQuestionStartSound,
    playGameEndSound,
    playTickSound,
    playCountdownBeep,
    playTimeUpSound,
    playButtonClickSound
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SoundManager;
}
