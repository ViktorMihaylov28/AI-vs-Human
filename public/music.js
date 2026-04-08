class MusicManager {
  constructor() {
    this.enabled = localStorage.getItem("music_enabled") !== "false";
    this.volume = parseFloat(localStorage.getItem("music_volume")) || 0.3;
    this.currentTrack = null;
    this.isPlaying = false;
    this.audioContext = null;
    this.gainNode = null;
    this.oscillators = [];
    
    this.tracks = {
      lobby: { frequency: 220, pattern: [0.25, 0.25, 0.5], tempo: 90 },
      question: { frequency: 330, pattern: [0.125, 0.125, 0.25], tempo: 120 },
      victory: { frequency: 440, pattern: [0.5, 0.25, 0.25], tempo: 140 }
    };
  }

  init() {
    if (this.enabled && !this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = this.volume;
      this.gainNode.connect(this.audioContext.destination);
    }
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    localStorage.setItem("music_enabled", enabled);
    if (!enabled) {
      this.stop();
    }
  }

  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, volume));
    localStorage.setItem("music_volume", this.volume);
    if (this.gainNode) {
      this.gainNode.gain.value = this.volume;
    }
  }

  stop() {
    this.isPlaying = false;
    this.stopAllSounds();
  }

  stopAllSounds() {
    if (this.oscillators.length > 0) {
      this.oscillators.forEach(osc => {
        try { osc.stop(); } catch (e) {}
      });
      this.oscillators = [];
    }
  }

  playLobby() {
    if (!this.enabled) return;
    this.init();
    this.stopAllSounds();
    this.isPlaying = true;
    this.playMelody(this.tracks.lobby, true);
  }

  playQuestion() {
    if (!this.enabled) return;
    this.init();
    this.stopAllSounds();
    this.isPlaying = true;
    this.playMelody(this.tracks.question, true);
  }

  playVictory(position) {
    if (!this.enabled) return;
    this.init();
    this.stopAllSounds();
    this.isPlaying = false;
    
    const notes = position === 1 ? [523, 659, 784, 1047] :
                  position === 2 ? [466, 587, 698] :
                  [392, 523, 659];
    
    notes.forEach((freq, i) => {
      setTimeout(() => this.playNote(freq, 0.4), i * 200);
    });
  }

  playMelody(track, loop = false) {
    const { frequency, pattern, tempo } = track;
    const beatDuration = 60 / tempo;
    let totalDuration = 0;
    
    pattern.forEach((duration) => {
      totalDuration += duration * beatDuration;
    });

    const playPattern = () => {
      if (!this.isPlaying) return;
      
      let time = this.audioContext.currentTime;
      const baseFreq = frequency;
      
      pattern.forEach((beatDur) => {
        const osc = this.audioContext.createOscillator();
        const noteGain = this.audioContext.createGain();
        
        osc.type = "sine";
        osc.frequency.value = baseFreq;
        
        noteGain.gain.setValueAtTime(0.3, time);
        noteGain.gain.exponentialRampToValueAtTime(0.01, time + beatDur * beatDuration * 0.9);
        
        osc.connect(noteGain);
        noteGain.connect(this.gainNode);
        
        osc.start(time);
        osc.stop(time + beatDur * beatDuration);
        
        this.oscillators.push(osc);
        time += beatDur * beatDuration;
        baseFreq *= 1.05;
      });

      if (loop && this.isPlaying) {
        setTimeout(playPattern, totalDuration * 1000);
      }
    };

    playPattern();
  }

  playNote(frequency, duration = 0.3) {
    if (!this.audioContext) return;
    
    const osc = this.audioContext.createOscillator();
    const noteGain = this.audioContext.createGain();
    
    osc.type = "sine";
    osc.frequency.value = frequency;
    
    noteGain.gain.setValueAtTime(this.volume, this.audioContext.currentTime);
    noteGain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);
    
    osc.connect(noteGain);
    noteGain.connect(this.gainNode);
    
    osc.start();
    osc.stop(this.audioContext.currentTime + duration);
  }

  speedUpForTimer(remainingSeconds, totalSeconds = 15) {
    if (!this.isPlaying || !this.audioContext) return;
    
    if (remainingSeconds <= 5 && remainingSeconds > 0) {
      const speedMultiplier = 1 + ((5 - remainingSeconds) / 5) * 0.5;
      this.gainNode.playbackRate = speedMultiplier;
    } else {
      this.gainNode.playbackRate = 1;
    }
  }

  onGameStart() {
    this.playQuestion();
  }

  onGameEnd() {
    this.stop();
  }

  onPlayerJoined() {
  }

  getState() {
    return {
      enabled: this.enabled,
      volume: this.volume,
      isPlaying: this.isPlaying
    };
  }
}

const MusicManagerInstance = new MusicManager();
