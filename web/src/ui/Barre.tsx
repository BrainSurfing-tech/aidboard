import { Link, useLocation } from 'react-router';
import type { DaemonLink } from '../data/types.js';

const DAEMON_TEXT: Record<DaemonLink, string> = {
  connecte: 'daemon local',
  reconnexion: 'reconnexion au daemon…',
  injoignable: 'daemon injoignable',
  'session-expiree': 'session expirée',
};

export type EcranId = '1-1' | '1-2' | '1-3' | 'consignes' | 'reglages';

const LIENS = [
  { id: 'accueil', to: '/', label: 'Accueil' },
  { id: 'boite', to: '/boite', label: 'Boîte de réception' },
  { id: 'consignes', to: '/consignes', label: 'Consignes' },
  { id: 'reglages', to: '/reglages', label: 'Réglages' },
] as const;

export function Barre({
  screen,
  daemon,
  waiting,
  onNewTopic,
  onPalette,
}: {
  screen: EcranId;
  daemon: DaemonLink;
  /** agents qui attendent une réponse */
  waiting: number;
  onNewTopic: () => void;
  onPalette: () => void;
}) {
  const n = (rest: string) => `${screen}.barre.${rest}`;
  const { pathname } = useLocation();
  return (
    <header className="barre" data-node={`${screen}.barre`}>
      <span
        className="marque"
        data-node={n('marque')}
        style={{ display: 'inline-flex', alignItems: 'center' }}
      >
        <svg
          viewBox="0 0 1660 490"
          aria-hidden="true"
          role="img"
          aria-label="A-I-D"
          style={{ height: '1.1em', width: 'auto' }}
        >
          <path
            d="M70 70 245 225 70 380"
            stroke="#FFFFFF"
            strokeWidth="140"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            transform="translate(20 20)"
          />
          <circle cx="430" cy="96" r="70" fill="#00D994" />
          <circle cx="430" cy="245" r="70" fill="#FFFFFF" />
          <circle cx="430" cy="395" r="70" fill="#FFFFFF" />
          <g transform="translate(545 27)" fill="#FFFFFF">
            <path
              fillRule="evenodd"
              d="M3 356 163 42Q180 0 227 0 274 0 294 44L456 356Q480 414 427 436 377 457 350 400L322 346H132L107 401Q82 455 32 436-18 418 3 356ZM177 258H282L230 130Z"
            />
            <rect x="480" width="118" height="438" rx="59" />
            <path
              fillRule="evenodd"
              d="M695 0H848C1000 0 1092 82 1092 219S1000 438 848 438H695Q648 438 648 391V47Q648 0 695 0ZM766 103V335H843C928 335 974 296 974 219S928 103 843 103Z"
            />
          </g>
        </svg>
      </span>
      <nav className="nav" data-node={n('nav')} aria-label="Navigation principale">
        {LIENS.map((l) => {
          const actif = pathname === l.to;
          return (
            <Link
              key={l.id}
              className={`nav-lien${actif ? ' est-actif' : ''}`}
              data-node={n(`nav-${l.id}`)}
              data-action={`nav.${l.id}`}
              to={l.to}
              aria-current={actif ? 'page' : undefined}
            >
              {l.label}
              {l.id === 'boite' && waiting > 0 && (
                <span
                  className="compteur"
                  data-node={n('nav-boite.compte')}
                  data-bind="resume.en_attente"
                >
                  {waiting}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="barre-droite">
        <span className="etat-daemon" data-node={n('daemon')}>
          <span
            className={`point point--${daemon === 'connecte' ? 'ok' : 'erreur'}`}
            aria-hidden="true"
          />
          <span data-node={n('daemon.texte')} data-bind="daemon.etat">
            {DAEMON_TEXT[daemon]}
          </span>
        </span>
        <button
          className="bouton-recherche"
          data-node={n('recherche')}
          data-action="palette.ouvrir"
          type="button"
          aria-label="Rechercher ou lancer une action"
          onClick={onPalette}
        >
          <svg className="icone" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <circle cx="11" cy="11" r="6" />
            <path d="M20 20l-4.5-4.5" />
          </svg>
          <span className="recherche-libelle">Rechercher ou lancer une action</span>
          <kbd className="raccourci">⌘K</kbd>
        </button>
        <button
          className="bouton bouton--primaire"
          data-node={n('nouveau-sujet')}
          data-action="sujet.creer"
          type="button"
          onClick={onNewTopic}
        >
          Nouveau sujet
        </button>
      </div>
    </header>
  );
}
