import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { api } from './api';
type Result = { id: number; username: string; content: string; createdAt: number };
export function MessageSearch({ channelId }: { channelId: string }) {
  const [query,setQuery]=useState(''), [results,setResults]=useState<Result[]>([]), [error,setError]=useState('');
  useEffect(() => {
    setResults([]); setError(''); if(query.trim().length<2) return;
    let cancelled=false;
    const timer=setTimeout(() => { void api<{messages:Result[]}>(`/channels/${channelId}/search?q=${encodeURIComponent(query.trim())}`).then(data => { if(!cancelled)setResults(data.messages); }).catch(e => {if(!cancelled)setError(e.message);}); },350);
    return () => {cancelled=true;clearTimeout(timer);};
  },[query,channelId]);
  return <><h2><Search size={23}/> Поиск по каналу</h2><label>Что найти?<input autoFocus value={query} onChange={e => setQuery(e.target.value)} maxLength={100} placeholder="Введите хотя бы 2 символа"/></label>{error&&<p role="alert">{error}</p>}<div className="search-results">{results.map(m => <article key={m.id}><strong>{m.username}</strong><time>{new Date(m.createdAt).toLocaleString('ru-RU')}</time><p>{m.content}</p></article>)}</div>{query.length>=2&&!results.length&&!error&&<p>Сообщения не найдены.</p>}</>;
}
