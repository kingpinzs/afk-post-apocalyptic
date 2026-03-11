/**
 * audio.js
 *
 * Procedural sound effects for the post-apocalyptic survival game.
 * All sounds are synthesised at runtime using the Web Audio API.
 * No external audio files are required.
 *
 * Usage:
 *   import { initAudio, playGather, playClick, toggleMute, isMuted } from './audio.js';
 *
 *   // Call initAudio() from a user-interaction handler (click, keydown, etc.)
 *   // to satisfy browser autoplay policies before calling any play* function.
 *
 *   document.getElementById('start-game').addEventListener('click', () => {
 *       initAudio();
 *       // ... other start logic
 *   });
 */

// ---------------------------------------------------------------------------
// Private module state
// ---------------------------------------------------------------------------

/** @type {AudioContext|null} */
let _audioCtx = null;

/** @type {boolean} */
let _muted = false;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Returns the shared AudioContext, or null if initAudio() has not yet been
 * called. All play* functions call this and return early on null, so they are
 * safe to call at any time without throwing.
 *
 * @returns {AudioContext|null}
 */
function _ctx() {
    return _audioCtx;
}

/**
 * Schedules a single oscillator note with an Attack-Decay-Sustain-Release
 * style amplitude envelope. The oscillator is automatically stopped and
 * disconnected after `startTime + duration` seconds.
 *
 * @param {AudioContext} ctx
 * @param {AudioNode}    destination - Node to connect the oscillator into.
 * @param {OscillatorType} type      - Oscillator waveform ('sine', 'square', 'triangle', 'sawtooth').
 * @param {number} frequency         - Frequency in Hz.
 * @param {number} startTime         - ctx.currentTime offset in seconds.
 * @param {number} duration          - Total note duration in seconds.
 * @param {number} [peakGain=0.4]    - Amplitude at the attack peak.
 * @param {number} [attackTime=0.01] - Seconds from start to peak gain.
 * @param {number} [releaseTime]     - Seconds of release tail (defaults to 40% of duration).
 */
function _scheduleNote(
    ctx,
    destination,
    type,
    frequency,
    startTime,
    duration,
    peakGain = 0.4,
    attackTime = 0.01,
    releaseTime
) {
    const release = releaseTime !== undefined ? releaseTime : duration * 0.4;
    const sustainEnd = startTime + duration - release;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, startTime);
    gain.gain.setValueAtTime(0, startTime);

    // Attack ramp
    gain.gain.linearRampToValueAtTime(peakGain, startTime + attackTime);

    // Hold at sustain level until release phase begins
    gain.gain.setValueAtTime(peakGain * 0.7, sustainEnd);

    // Release ramp to silence
    gain.gain.linearRampToValueAtTime(0, startTime + duration);

    osc.connect(gain);
    gain.connect(destination);

    osc.start(startTime);
    osc.stop(startTime + duration);

    // Disconnect after the note ends to free resources
    osc.addEventListener('ended', () => {
        osc.disconnect();
        gain.disconnect();
    });
}

/**
 * Adds a short burst of white noise useful for percussive or metallic tones.
 *
 * @param {AudioContext} ctx
 * @param {AudioNode}    destination
 * @param {number}       startTime
 * @param {number}       duration
 * @param {number}       [peakGain=0.15]
 */
function _scheduleNoise(ctx, destination, startTime, duration, peakGain = 0.15) {
    const bufferSize = Math.ceil(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    // High-pass filter to keep the noise crisp and metallic
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(1200, startTime);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(peakGain, startTime);
    gain.gain.linearRampToValueAtTime(0, startTime + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(destination);

    source.start(startTime);
    source.stop(startTime + duration);

    source.addEventListener('ended', () => {
        source.disconnect();
        filter.disconnect();
        gain.disconnect();
    });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initialises (or resumes) the shared AudioContext.
 * Must be called from within a user-interaction event handler (e.g. a click
 * or keydown callback) to satisfy browser autoplay restrictions.
 * Safe to call multiple times - subsequent calls are no-ops unless the context
 * was suspended by the browser.
 */
export function initAudio() {
    if (!_audioCtx) {
        try {
            _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (err) {
            // Web Audio API not supported in this environment - fail silently.
            console.warn('[audio] Web Audio API unavailable:', err.message);
            return;
        }
    }

    // Some browsers suspend the context after a period of inactivity.
    if (_audioCtx.state === 'suspended') {
        _audioCtx.resume().catch(() => {});
    }
}

/**
 * Toggles the global mute state.
 * When muted, all play* functions return without scheduling audio.
 *
 * @returns {boolean} The new mute state (true = muted).
 */
export function toggleMute() {
    _muted = !_muted;
    localStorage.setItem('postapoc_muted', _muted);
    return _muted;
}

/**
 * Initialises mute state from localStorage.
 * Call once at startup before rendering the sound button.
 */
export function initMuteState() {
    _muted = localStorage.getItem('postapoc_muted') === 'true';
}

/**
 * Returns the current mute state.
 *
 * @returns {boolean} True if currently muted.
 */
export function isMuted() {
    return _muted;
}

// ---------------------------------------------------------------------------
// Sound effects
// ---------------------------------------------------------------------------

/**
 * playGather - Short rising tone indicating a resource has been gathered.
 *
 * Character: Clean sine wave that rises a minor third, brief and unobtrusive.
 * Duration:  ~0.25 s
 */
export function playGather() {
    const ctx = _ctx();
    if (!ctx || _muted) return;

    const now = ctx.currentTime;
    const dest = ctx.destination;

    // Rising interval: root then minor third up
    _scheduleNote(ctx, dest, 'sine', 440, now,        0.15, 0.25, 0.005, 0.08);
    _scheduleNote(ctx, dest, 'sine', 523, now + 0.10, 0.15, 0.20, 0.005, 0.06);
}

/**
 * playStudy - Gentle chime sequence indicating study is complete.
 *
 * Character: Three soft triangle-wave tones in an ascending pentatonic step,
 *            evoking a soft notification chime.
 * Duration:  ~0.55 s
 */
export function playStudy() {
    const ctx = _ctx();
    if (!ctx || _muted) return;

    const now = ctx.currentTime;
    const dest = ctx.destination;

    // C5 - E5 - G5 pentatonic chord progression (spread over time)
    _scheduleNote(ctx, dest, 'triangle', 523, now,        0.35, 0.18, 0.008, 0.20);
    _scheduleNote(ctx, dest, 'triangle', 659, now + 0.14, 0.35, 0.18, 0.008, 0.18);
    _scheduleNote(ctx, dest, 'triangle', 784, now + 0.28, 0.35, 0.25, 0.008, 0.22);
}

/**
 * playCraft - Metallic hammering sound indicating crafting is complete.
 *
 * Character: Two square-wave "clang" hits combined with a filtered noise burst
 *            to emulate the impact of metal on metal.
 * Duration:  ~0.45 s
 */
export function playCraft() {
    const ctx = _ctx();
    if (!ctx || _muted) return;

    const now = ctx.currentTime;
    const dest = ctx.destination;

    // First hammer strike
    _scheduleNote(ctx, dest, 'square', 180, now,       0.20, 0.30, 0.003, 0.12);
    _scheduleNote(ctx, dest, 'square', 360, now,       0.20, 0.15, 0.003, 0.10);
    _scheduleNoise(ctx, dest, now, 0.12, 0.20);

    // Second lighter strike (echo)
    _scheduleNote(ctx, dest, 'square', 180, now + 0.22, 0.20, 0.22, 0.003, 0.10);
    _scheduleNoise(ctx, dest, now + 0.22, 0.10, 0.14);
}

/**
 * playUnlock - Triumphant ascending arpeggio indicating a feature has been
 *              unlocked.
 *
 * Character: Four sine tones sweep upward in a major arpeggio, with the
 *            final note held slightly longer for emphasis.
 * Duration:  ~0.65 s
 */
export function playUnlock() {
    const ctx = _ctx();
    if (!ctx || _muted) return;

    const now = ctx.currentTime;
    const dest = ctx.destination;

    // C4 - E4 - G4 - C5 major arpeggio
    const notes = [261, 329, 392, 523];
    const offsets = [0, 0.12, 0.24, 0.38];
    const durations = [0.22, 0.22, 0.22, 0.38];

    notes.forEach((freq, i) => {
        _scheduleNote(ctx, dest, 'sine', freq, now + offsets[i], durations[i], 0.35, 0.01, durations[i] * 0.5);
    });
}

/**
 * playGameOver - Descending somber tone indicating the game is over.
 *
 * Character: A slow descending minor scale passage using a sawtooth wave
 *            run through a low-pass filter simulation (via detuned layering),
 *            ending in a long fade to silence.
 * Duration:  ~0.80 s
 */
export function playGameOver() {
    const ctx = _ctx();
    if (!ctx || _muted) return;

    const now = ctx.currentTime;
    const dest = ctx.destination;

    // Descending minor tetrachord: A4 - G4 - F4 - E4
    const notes = [440, 392, 349, 330];
    const offsets = [0, 0.18, 0.36, 0.54];
    const durations = [0.25, 0.25, 0.25, 0.45];

    notes.forEach((freq, i) => {
        // Layer each note with a detuned copy to create a thick, somber texture
        _scheduleNote(ctx, dest, 'sawtooth', freq,      now + offsets[i], durations[i], 0.18, 0.015, durations[i] * 0.55);
        _scheduleNote(ctx, dest, 'sawtooth', freq * 1.005, now + offsets[i], durations[i], 0.08, 0.015, durations[i] * 0.55);
    });
}

/**
 * playClick - Subtle, crisp click for UI button presses.
 *
 * Character: Very short noise burst shaped with a fast exponential decay to
 *            emulate a physical button press. Keeps it tactile without being
 *            obtrusive during rapid clicking.
 * Duration:  ~0.07 s
 */
export function playClick() {
    const ctx = _ctx();
    if (!ctx || _muted) return;

    const now = ctx.currentTime;
    const dest = ctx.destination;

    // Ultra-short noise burst
    _scheduleNoise(ctx, dest, now, 0.07, 0.12);

    // Soft low-frequency body to give the click some weight
    _scheduleNote(ctx, dest, 'sine', 120, now, 0.07, 0.10, 0.002, 0.05);
}

/**
 * playVictory - Grand ascending chord progression for game won.
 *
 * Character: A four-chord progression (I - IV - V - I) in C major, each chord
 *            voiced as a triad of sine tones with a gentle bloom attack,
 *            evoking triumph without being overwhelming.
 * Duration:  ~1.60 s (the longest sound - reserved for the win state only)
 */
export function playVictory() {
    const ctx = _ctx();
    if (!ctx || _muted) return;

    const now = ctx.currentTime;
    const dest = ctx.destination;

    // Each chord entry: [startOffset, [freq1, freq2, freq3]]
    // I  = C4-E4-G4, IV = F4-A4-C5, V  = G4-B4-D5, I' = C5-E5-G5
    const chords = [
        { offset: 0.00, freqs: [261, 329, 392] },   // C major (I)
        { offset: 0.40, freqs: [349, 440, 523] },   // F major (IV)
        { offset: 0.80, freqs: [392, 494, 587] },   // G major (V)
        { offset: 1.20, freqs: [523, 659, 784] },   // C major high octave (I)
    ];

    const noteDuration = 0.50;

    chords.forEach(({ offset, freqs }) => {
        freqs.forEach(freq => {
            _scheduleNote(
                ctx,
                dest,
                'sine',
                freq,
                now + offset,
                noteDuration,
                0.22,   // peak gain per voice (3 voices = ~0.66 total - comfortable level)
                0.02,
                noteDuration * 0.45
            );
        });
    });
}
