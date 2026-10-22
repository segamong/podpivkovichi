// Local visual regression fixture. No accounts, network calls or media capture.
import { useCallback, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MonitorUp, Settings2 } from 'lucide-react';
import { AudioSettingsInline } from '../src/AudioSettings';
import CallMediaLayout from '../src/CallMediaLayout';
import CallSettingsDrawer from '../src/CallSettingsDrawer';
import ScreenShareFrame from '../src/ScreenShareFrame';
import '../src/styles.css';
import '../src/discord.css';
import '../src/call-layout.css';

function Fixture() {
  const [open, setOpen] = useState(false), [screen, setScreen] = useState('Алексей');
  const [sharing, setSharing] = useState(true), [clicks, setClicks] = useState(0);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const switcher = <div className="share-switcher" role="group" aria-label="Переключить демонстрацию экрана">{['Алексей','Михаил','Елена'].map(name => <button type="button" key={name} className={screen === name ? 'active' : ''} aria-label={`Смотреть экран ${name}`} aria-pressed={screen === name} onClick={() => setScreen(name)}><MonitorUp size={14}/><span>{name}</span></button>)}</div>;
  return <main style={{ maxWidth: 1180, margin:'24px auto', padding:'0 12px' }}>
    <h1 style={{ fontSize:22, marginBottom:12 }}>Проверка интерфейса звонка</h1>
    <section className={`call-stage${sharing ? ' has-share' : ''}`} aria-label="Тестовый звонок">
      <div className="call-heading"><h2>Гостиная</h2><span className="call-count">8 / 10 участников</span></div>
      <CallMediaLayout screen={sharing ? <ScreenShareFrame username={screen} fullscreenControls={switcher} onError={console.error}>
        <div className="share-video-wrap"><div data-testid="selected-screen" style={{width:'100%',height:'100%',minHeight:150,display:'grid',placeItems:'center',background:screen === 'Алексей'?'linear-gradient(135deg,#19223d,#404878)':'linear-gradient(135deg,#18423e,#28313c)',color:'#e7e9ff',fontSize:'clamp(16px,3vw,36px)'}}>Экран: {screen}</div></div>
      </ScreenShareFrame> : undefined} screenSwitcher={switcher} participants={['Алексей','Михаил','Елена','Иван','Сергей','Ольга','Анна','Дмитрий'].map((name,index) => <article key={name} className={`participant-tile${sharing?' compact':''}${index===0?' speaking':''}`}><div className="participant-avatar" style={{background:['#5865f2','#3688bc','#aa687e'][index%3]}}>{name[0]}</div><div className="participant-caption">{name}</div></article>)}/>
      <div className="call-toolbar"><div className="toolbar-main"><button ref={trigger} className={`call-control${open?' active':''}`} aria-label="Настройки звука и видео" aria-expanded={open} aria-controls="fixture-settings" onClick={() => setOpen(value => !value)}><Settings2/></button><button onClick={() => setSharing(value => !value)}>{sharing?'Убрать трансляцию':'Показать трансляцию'}</button></div></div>
    </section>
    <button className="secondary" style={{margin:'18px 0'}} onClick={() => setClicks(value => value+1)}>Вне настроек — нажатий: {clicks}</button>
    <label>Сообщение вне настроек<input placeholder="Написать сообщение"/></label>
    <CallSettingsDrawer id="fixture-settings" open={open} triggerRef={trigger} onClose={close}>
      <label>Микрофон<select defaultValue="default"><option value="default">По умолчанию</option><option value="headset">Гарнитура</option></select></label>
      <AudioSettingsInline/>
      <h3>Трансляция экрана</h3><label>Частота<select><option>30 кадров/с</option><option>60 кадров/с</option></select></label>
      <p>Внутренние элементы не закрывают панель. Клик снаружи и Esc закрывают её.</p>
    </CallSettingsDrawer>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
