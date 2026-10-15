import { Barre } from './ui/Barre.js';
import { Shell } from './ui/Shell.js';

export function App() {
  return (
    <Shell>
      <Barre screen="1-1" daemon="connecte" onNewTopic={() => undefined} />
      <main className="page" />
    </Shell>
  );
}
