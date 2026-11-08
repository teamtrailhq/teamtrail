import type { ProjectAttentionItem } from '@teamtrail/core';
import { MetaLine, Row } from '../../components/ui';
import { ago } from '../../lib';
import { KIND_LABEL } from '../attention/attentionLabels';
import { detailReasons, edgeFor } from '../attention/rowText';
import { AnswerInline } from './AnswerInline';

/** One item of the queue across projects: the project leads the context line; questions answer in place. */
export function MergedAttentionRow(props: {
  item: ProjectAttentionItem;
  now: number;
  onOpen: () => void;
  onAnswer?: (text: string) => Promise<unknown>;
}) {
  const { item } = props;
  const reasons = detailReasons(item);
  const kind = item.kind === 'question' && item.agent ? `${item.agent} asks` : KIND_LABEL[item.kind];
  const urgency = item.urgency === 'blocking' && { text: 'Blocking', urgent: true, className: 'urgency-tag' };
  return (
    <Row
      as="li"
      className={`att-item pj-item k-${item.kind}`}
      edge={edgeFor(item, item.interrupting)}
      title={item.title.split('\n')[0]}
      titleText={item.title}
      context={<MetaLine parts={[urgency, { text: item.project, strong: true }, kind]} />}
      detail={reasons.length > 0 && reasons.join(' · ')}
      detailText={reasons.join('\n')}
      trailing={ago(props.now - item.since)}
      onOpen={props.onOpen}
      below={props.onAnswer && <AnswerInline onAnswer={props.onAnswer} />}
    />
  );
}
