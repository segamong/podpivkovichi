import type { AudioCaptureOptions } from 'livekit-client';

export type AudioPreferences = { microphoneVolume: number; noiseSuppression: boolean; echoCancellation: boolean; autoGainControl: boolean; gateMode: 'soft' | 'noisy' };
export const defaultAudio: AudioPreferences = { microphoneVolume: 100, noiseSuppression: false, echoCancellation: true, autoGainControl: false, gateMode: 'soft' };
const key = 'podpivkovichi.audio.v1';
export function loadAudioPreferences(): AudioPreferences {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '{}');
    return { microphoneVolume: Number.isFinite(value.microphoneVolume) ? Math.max(0, Math.min(100, value.microphoneVolume)) : 100,
      noiseSuppression: typeof value.noiseSuppression === 'boolean' ? value.noiseSuppression : defaultAudio.noiseSuppression,
      echoCancellation: typeof value.echoCancellation === 'boolean' ? value.echoCancellation : defaultAudio.echoCancellation,
      autoGainControl: typeof value.autoGainControl === 'boolean' ? value.autoGainControl : defaultAudio.autoGainControl,
      gateMode: value.gateMode === 'noisy' ? 'noisy' : 'soft' };
  } catch { return { ...defaultAudio }; }
}
export function saveAudioPreferences(value: AudioPreferences) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* The current tab still applies its settings. */ }
  window.dispatchEvent(new Event('podpivkovichi-audio'));
}
export function audioCapture(value: AudioPreferences): AudioCaptureOptions {
  return { noiseSuppression: value.noiseSuppression, echoCancellation: value.echoCancellation, autoGainControl: value.autoGainControl, voiceIsolation: false, channelCount: 1 };
}
