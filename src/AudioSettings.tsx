import { useEffect, useRef, useState } from 'react';
import { loadAudioPreferences, saveAudioPreferences, type AudioPreferences } from './audioPreferences';

export function AudioSettingsInline() {
  const [value, setValue] = useState(loadAudioPreferences);
  function update(patch: Partial<AudioPreferences>) { const next = { ...value, ...patch }; setValue(next); saveAudioPreferences(next); }
  return <section className="audio-preferences" aria-label="Обработка микрофона">
    <h3>Обработка микрофона</h3><p>Мягкий порог, фильтр низких частот, компрессор и ограничитель из Coherent.</p>
    <label>Уровень микрофона — {value.microphoneVolume}%<input type="range" min="0" max="100" value={value.microphoneVolume} onChange={e => update({ microphoneVolume: Number(e.target.value) })}/></label>
    <label>Подавление пауз<select value={value.gateMode} onChange={e => update({ gateMode: e.target.value as 'soft' | 'noisy' })}><option value="soft">Мягкое · тихие слоги сохраняются</option><option value="noisy">Шумная комната · подавление щелчков</option></select></label>
    {(['echoCancellation', 'noiseSuppression', 'autoGainControl'] as const).map(key => <label className="audio-toggle" key={key}><span>{({ echoCancellation: 'Подавление эха', noiseSuppression: 'Шумоподавление браузера', autoGainControl: 'Автоматическое усиление' })[key]}</span><input type="checkbox" checked={value[key]} onChange={e => update({ [key]: e.target.checked })}/></label>)}
  </section>;
}

export function MicrophoneTest() {
  const [active, setActive] = useState(false), [level, setLevel] = useState(0), [error, setError] = useState('');
  const running = useRef<{ stream: MediaStream; context: AudioContext; timer: number } | null>(null);
  const generation = useRef(0);
  function stop() { generation.current++; const run = running.current; running.current = null; if (run) { run.stream.getTracks().forEach(t => t.stop()); clearInterval(run.timer); void run.context.close(); } setActive(false); setLevel(0); }
  useEffect(() => () => { generation.current++; const run = running.current; if (run) { run.stream.getTracks().forEach(t => t.stop()); clearInterval(run.timer); void run.context.close(); } }, []);
  async function start() {
    const current = ++generation.current;
    try {
      setError('');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (generation.current !== current) { stream.getTracks().forEach(t => t.stop()); return; }
      const context = new AudioContext(), analyser = context.createAnalyser(); analyser.fftSize = 256;
      context.createMediaStreamSource(stream).connect(analyser);
      const samples = new Uint8Array(analyser.frequencyBinCount);
      const timer = window.setInterval(() => { analyser.getByteTimeDomainData(samples); const rms = Math.sqrt(samples.reduce((sum, v) => sum + ((v - 128) / 128) ** 2, 0) / samples.length); setLevel(Math.min(100, rms * 400)); }, 70);
      running.current = { stream, context, timer }; setActive(true);
    } catch { setError('Не удалось открыть микрофон. Проверьте разрешение браузера.'); }
  }
  return <section className="mic-test"><h3>Проверка микрофона</h3><p>Измеритель входного сигнала. Звук остаётся на вашем устройстве.</p><meter min="0" max="100" value={level} aria-label="Уровень сигнала микрофона"/><button className="secondary" onClick={() => active ? stop() : void start()}>{active ? 'Остановить проверку' : 'Проверить микрофон'}</button>{error && <p role="alert">{error}</p>}</section>;
}
