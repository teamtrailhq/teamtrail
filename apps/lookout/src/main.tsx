import { createRoot } from 'react-dom/client';
import './fonts';
import './styles/index.css';
import { App } from './App';
import { MarkSheet, TooltipLayer } from './components/ui';
import { SignInGate } from './features/sign-in';
import { applyTheme, loadPrefs } from './lib';

applyTheme(loadPrefs().theme);

const sheet = import.meta.env.DEV && new URLSearchParams(location.search).has('mark-sheet');
createRoot(document.getElementById('root')!).render(
  sheet ? (
    <MarkSheet />
  ) : (
    <SignInGate>
      <App />
      <TooltipLayer />
    </SignInGate>
  ),
);
