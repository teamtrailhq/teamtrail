import { RECOMMENDED_STYLE, type ScoutStyleId } from '../src/scout';
import { WORDMARK } from './content';
import { Banner } from './views/Banner';
import { BannerLoop } from './views/BannerLoop';
import { BrandSquare } from './views/BrandSquare';
import { Demo } from './views/Demo';
import { Favicon } from './views/Favicon';
import { Lockup } from './views/Lockup';
import { Options } from './views/Options';
import { Playground } from './views/Playground';
import { States } from './views/States';

export function App() {
  const q = new URLSearchParams(location.search);
  const view = q.get('view');
  const variant = (q.get('variant') as ScoutStyleId) || RECOMMENDED_STYLE;
  if (view === 'options') return <Options />;
  if (view === 'states') return <States variant={variant} />;
  if (view === 'demo') return <Demo variant={variant} />;
  if (view === 'square')
    return (
      <BrandSquare
        n={Number(q.get('n') || 512)}
        who={(['scout', 'wordmark'] as const).find((w) => w === q.get('who')) ?? 'logo'}
        theme={q.get('theme') === 'light' ? 'light' : 'dark'}
      />
    );
  if (view === 'favicon')
    return <Favicon px={Number(q.get('px') || 64)} theme={q.get('theme') === 'dark' ? 'dark' : 'light'} />;
  if (view === 'lockup')
    return (
      <Lockup
        w={Number(q.get('w') || 960)}
        h={Number(q.get('h') || 240)}
        wordmark={q.get('wordmark') || WORDMARK}
        light={!!q.get('light')}
      />
    );
  if (view === 'banner' && q.get('loop'))
    return (
      <BannerLoop
        w={Number(q.get('w') || 1280)}
        h={Number(q.get('h') || 640)}
        wordmark={q.get('wordmark') || WORDMARK}
      />
    );
  if (view === 'banner')
    return (
      <Banner
        w={Number(q.get('w') || 1280)}
        h={Number(q.get('h') || 640)}
        layout={(q.get('layout') as 'card' | 'header') || 'card'}
        wordmark={q.get('wordmark') || WORDMARK}
      />
    );
  return <Playground />;
}
