import { useCallback, useEffect, useRef, useState } from "react";
import {
  cloudEnabled,
  getSession,
  onAuthChange,
  pull,
  push,
  subscribeToRemoteChanges,
  type CloudState,
} from "../services/cloudSync";
import { decideSync } from "../services/syncDecision";
import type { Note, Task } from "../types/task";

/** Horodatage de la dernière modification locale, pour arbitrer avec le distant. */
const EDITED_KEY = "idayal:localEditedAt:v1";

/**
 * Relecture de secours quand le temps réel n'est pas disponible. Suspendue dès
 * que l'onglet passe en arrière-plan : inutile d'interroger le serveur pour un
 * écran que personne ne regarde.
 */
const POLL_MS = 30_000;

/** Délai avant envoi, pour ne pas écrire à chaque frappe. */
const PUSH_DEBOUNCE_MS = 1500;

export type SyncStatus = "off" | "idle" | "syncing" | "error";

interface Params {
  tasks: Task[];
  notes: Note[];
  /** Remplace l'état local par celui du serveur. */
  replaceAll: (tasks: Task[], notes: Note[]) => void;
}

export interface CloudSync {
  email: string | null;
  status: SyncStatus;
  lastError: string | null;
  lastSyncedAt: string | null;
  syncNow: () => void;
}

function readEditedAt(): number {
  const raw = localStorage.getItem(EDITED_KEY);
  return raw ? Number(raw) || 0 : 0;
}

/**
 * Synchronise l'état d'un utilisateur entre ses appareils.
 *
 * L'état complet est écrit d'un bloc et le plus récent gagne. Pour une personne
 * sur deux appareils, les modifications simultanées sont rares ; un fusionnement
 * ligne à ligne coûterait bien plus cher en complexité qu'il ne rapporte.
 *
 * Deux protections encadrent ce modèle simple :
 *  - **aucun envoi avant la première réconciliation** — sinon l'état initial,
 *    souvent vide, part sur le serveur avant même d'avoir lu ce qui s'y trouve ;
 *  - **un appareil vierge n'écrase jamais le serveur** (voir `decideSync`).
 */
export function useCloudSync({ tasks, notes, replaceAll }: Params): CloudSync {
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [status, setStatus] = useState<SyncStatus>(
    cloudEnabled ? "idle" : "off",
  );
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  /** Empreinte du dernier état échangé avec le serveur : évite les envois en boucle. */
  const syncedRef = useRef<string>("");
  /** Vrai pendant l'application d'un état distant, éventuellement normalisé par le store. */
  const applyingRef = useRef(false);
  /**
   * Faux tant que la première lecture du serveur n'a pas abouti pour ce compte.
   * Tant qu'il l'est, aucune écriture n'est permise : c'est ce qui empêche un
   * appareil fraîchement connecté d'envoyer sa liste vide.
   */
  const readyRef = useRef(false);
  const pushTimer = useRef<number | null>(null);

  // Session courante.
  useEffect(() => {
    if (!cloudEnabled) return;
    let alive = true;
    getSession().then((s) => {
      if (!alive) return;
      setEmail(s?.user.email ?? null);
      setUserId(s?.user.id ?? null);
    });
    const off = onAuthChange((s) => {
      setEmail(s?.user.email ?? null);
      setUserId(s?.user.id ?? null);
      if (!s) {
        syncedRef.current = "";
        readyRef.current = false;
        setLastSyncedAt(null);
      }
    });
    return () => {
      alive = false;
      off();
    };
  }, []);

  // Changer de compte remet le garde-fou en place.
  useEffect(() => {
    readyRef.current = false;
    syncedRef.current = "";
  }, [userId]);

  const serialize = useCallback(
    () => JSON.stringify({ tasks, notes } satisfies CloudState),
    [tasks, notes],
  );

  /** Confronte local et distant, puis adopte l'un ou envoie l'autre. */
  const reconcile = useCallback(async () => {
    if (!userId) return;
    setStatus("syncing");
    setLastError(null);
    try {
      const remote = await pull();
      const localJson = JSON.stringify({ tasks, notes } satisfies CloudState);

      const decision = decideSync({
        localJson,
        localIsEmpty: tasks.length === 0 && notes.length === 0,
        remote: remote
          ? { json: JSON.stringify(remote.data), updatedAt: remote.updatedAt }
          : null,
        lastLocalEditAt: readEditedAt(),
      });

      if (decision === "adopt" && remote) {
        // L'empreinte distante évite de réémettre une adoption identique.
        // Seule une normalisation supplémentaire du store sera une édition.
        applyingRef.current = true;
        syncedRef.current = JSON.stringify(remote.data);
        replaceAll(remote.data.tasks, remote.data.notes);
        setLastSyncedAt(remote.updatedAt);
      } else if (decision === "push") {
        const at = await push(userId, { tasks, notes });
        syncedRef.current = localJson;
        setLastSyncedAt(at);
      } else if (remote) {
        syncedRef.current = localJson;
        setLastSyncedAt(remote.updatedAt);
      }

      readyRef.current = true;
      setStatus("idle");
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }, [userId, tasks, notes, replaceAll]);

  // `reconcile` change à chaque modification locale ; les abonnements, eux,
  // ne doivent dépendre que du compte. On passe donc par une référence.
  const reconcileRef = useRef(reconcile);
  reconcileRef.current = reconcile;

  // Notification immédiate quand l'autre appareil écrit.
  useEffect(() => {
    if (!userId) return;
    let stop: (() => void) | null = null;
    let cancelled = false;
    subscribeToRemoteChanges(userId, () => void reconcileRef.current())
      .then((off) => {
        if (cancelled) off();
        else stop = off;
      })
      .catch(() => {
        // Temps réel indisponible : la relecture périodique suffit.
      });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [userId]);

  // Filet de sécurité : relecture régulière tant que l'écran est visible.
  useEffect(() => {
    if (!userId) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void reconcileRef.current();
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [userId]);

  // Réconciliation à la connexion, au retour sur l'app et au retour du réseau.
  useEffect(() => {
    if (!userId) return;
    void reconcileRef.current();
    const onVisible = () => {
      if (document.visibilityState === "visible") void reconcileRef.current();
    };
    const onOnline = () => void reconcileRef.current();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [userId]);

  // Envoi différé après une modification locale.
  useEffect(() => {
    if (!userId) return;
    // Tant que le serveur n'a pas été lu, on n'écrit rien : c'est la protection
    // contre l'écrasement par un appareil qui vient d'ouvrir l'application.
    if (!readyRef.current) return;

    const json = serialize();

    if (applyingRef.current) {
      // Une adoption identique n'est pas une édition. Le store peut toutefois
      // la normaliser (par exemple créer la prochaine occurrence d'une tâche
      // cochée dans Cockpit) : cette différence doit rejoindre le serveur.
      applyingRef.current = false;
    }
    if (json === syncedRef.current) return;

    localStorage.setItem(EDITED_KEY, String(Date.now()));

    if (pushTimer.current) window.clearTimeout(pushTimer.current);
    pushTimer.current = window.setTimeout(async () => {
      try {
        setStatus("syncing");
        const at = await push(userId, JSON.parse(json) as CloudState);
        syncedRef.current = json;
        setLastSyncedAt(at);
        setStatus("idle");
        setLastError(null);
      } catch (e) {
        setLastError(e instanceof Error ? e.message : String(e));
        setStatus("error");
      }
    }, PUSH_DEBOUNCE_MS);

    return () => {
      if (pushTimer.current) window.clearTimeout(pushTimer.current);
    };
  }, [serialize, userId]);

  return {
    email,
    status,
    lastError,
    lastSyncedAt,
    syncNow: () => void reconcile(),
  };
}
