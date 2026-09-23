// One chat message. Text only: React escapes the body, so HTML in a message is shown, never run.
export type ChatMessage = {
  id: string;
  sender_id: string;
  sender: string;
  body: string;
  created_at: number;
};

const time = (ms: number) =>
  new Date(ms).toLocaleTimeString('en-SG', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Singapore',
  });

export function ChatBubble({ message, mine }: { message: ChatMessage; mine: boolean }) {
  return (
    <li className={mine ? 'bubble bubble-mine' : 'bubble'}>
      <span className="bubble-meta">
        {mine ? 'You' : message.sender} · {time(message.created_at)}
      </span>
      <p className="bubble-body">{message.body}</p>
    </li>
  );
}
