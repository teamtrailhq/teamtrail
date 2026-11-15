import type { AnswerVia } from './answerVia';
import type { Person } from './person';

export interface ChatMessage {
  id: string;
  sessionId: string;
  ticketId?: string;
  from: 'agent' | 'human';
  author: string;
  text: string;
  at: number;
  /** Set on agent questions; the question is open until answered. */
  questionId?: string;
  /** On the human's answers: how it was given (answerVia.ts), and for `chat` the agent whose chat it was. */
  via?: AnswerVia;
  chatOf?: string;
  /** On the human's answers: who gave it, when the sign-in named them (model/person.ts). */
  by?: Person;
}
