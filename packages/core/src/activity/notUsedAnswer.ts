import type { AnswerHow } from '../model/answerVia';

/** An answer that came after the one used: kept in the conversation, marked not used. */
export interface NotUsedAnswer {
  text: string;
  author: string;
  how: AnswerHow;
}
