import { useEffect, useState } from 'react';
import type { StoredEvent } from '../../../src/shared/events.js';
import { AidApiError } from '../data/api.js';
import { useAid } from '../data/useAidState.js';

export interface ArchivedTopic {
  id: string;
  workspaceId: string;
  slug: string;
  title: string;
  branch: string;
  base: string;
  worktree: string;
  state: string;
  stashRef: string | null;
  createdAt: string;
  updatedAt: string;
}

export type Oubli = 'repos' | 'en-cours' | 'fait' | 'refuse';

// /api/state exclut les sujets archivés par défaut (06.10) : une fois le sujet absent de
// l'instantané vivant, on relit son journal à part (pas de nouvelle table, D21/écran 2.9).
export function useArchive(topicId: string, present: boolean) {
  const { call } = useAid();
  const [topic, setTopic] = useState<ArchivedTopic | null>(null);
  const [events, setEvents] = useState<StoredEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [oubli, setOubli] = useState<Oubli>('repos');
  const [oubliMessage, setOubliMessage] = useState<string | null>(null);

  useEffect(() => {
    if (present) return;
    let cancelled = false;
    call<{ topic: ArchivedTopic; events: StoredEvent[] }>('GET', `/api/topics/${topicId}/events`)
      .then((r) => {
        if (cancelled) return;
        setTopic(r.topic);
        setEvents(r.events);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
    // call() change d'identité à chaque rendu (useAid le reconstruit à chaque fois) :
    // le suivre ici redéclencherait la lecture à chaque interaction de l'écran, sans bénéfice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [present, topicId]);

  async function oublierStash() {
    setOubli('en-cours');
    try {
      const r = await call<{ found: boolean }>(
        'POST',
        `/api/topics/${topicId}/actions/archive.oublier-stash`,
      );
      setTopic((t) => (t ? { ...t, stashRef: null } : t));
      setOubliMessage(r.found ? 'Stash supprimé.' : 'Stash déjà introuvable : mention retirée.');
      setOubli('fait');
    } catch (err) {
      setOubliMessage(err instanceof AidApiError ? err.message : String(err));
      setOubli('refuse');
    }
  }

  return { topic, events, loaded, oubli, oubliMessage, oublierStash };
}
