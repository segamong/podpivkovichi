import { Fragment } from 'react';
// Render a small safe subset. React escapes all text; no raw HTML is accepted.
export function MessageText({ text }: { text: string }) {
  const parts=text.split(/(\[[^\]\n]{1,160}\]\(\/api\/channels\/[A-Za-z0-9_-]+\/attachments\/[a-f0-9-]+\)|https?:\/\/[^\s<>]+|`[^`\n]+`|\*\*[^*\n]+\*\*)/g);
  return <>{parts.map((part,index) => {
    const attachment=part.match(/^\[([^\]]+)\]\((\/api\/channels\/[A-Za-z0-9_-]+\/attachments\/[a-f0-9-]+)\)$/);
    if(attachment)return <a className="attachment-link" key={index} href={attachment[2]} download>📎 {attachment[1]}</a>;
    if(/^https?:\/\//.test(part))return <a key={index} href={part} target="_blank" rel="noopener noreferrer">{part}</a>;
    if(part.startsWith('`')&&part.endsWith('`'))return <code key={index}>{part.slice(1,-1)}</code>;
    if(part.startsWith('**')&&part.endsWith('**'))return <strong key={index}>{part.slice(2,-2)}</strong>;
    return <Fragment key={index}>{part}</Fragment>;
  })}</>;
}
