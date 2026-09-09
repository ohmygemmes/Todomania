import { useDialogFocus } from "../hooks/useDialogFocus";
import { toLocalISODate } from "../services/localDate";
import { useEffect, useRef, useState } from "react";
import {
  isNotificationSupported,
  requestNotificationPermission,
} from "../services/notificationService";
import type { Settings } from "../types/task";
import { SyncSection } from "./SyncSection";
import type { CloudSync } from "../hooks/useCloudSync";

interface Props {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  onUpdateSettings: (patch: Partial<Settings>) => void;
  onCleanCompleted: () => number;
  onExport: () => string;
  onImport: (json: string) => boolean;
  appVersion: string;
  sync: CloudSync;
}

export function SettingsModal({
  open,
  onClose,
  settings,
  onUpdateSettings,
  onCleanCompleted,
  onExport,
  onImport,
  appVersion,
  sync,
}: Props) {
  const dialogRef = useDialogFocus(open, onClose);
  const [feedback, setFeedback] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!feedback) return;
    const id = window.setTimeout(() => setFeedback(null), 2500);
    return () => window.clearTimeout(id);
  }, [feedback]);

  const toggleNotifications = async () => {
    if (!settings.notificationsEnabled) {
      const perm = await requestNotificationPermission();
      if (perm === "granted") {
        onUpdateSettings({ notificationsEnabled: true });
        setFeedback("Notifications activées.");
      } else {
        setFeedback("Permission refusée.");
      }
    } else {
      onUpdateSettings({ notificationsEnabled: false });
    }
  };

  const handleClean = () => {
    if (
      !window.confirm("Supprimer les tâches complétées de plus de 30 jours ?")
    )
      return;
    const removed = onCleanCompleted();
    setFeedback(
      `${removed} tâche${removed !== 1 ? "s" : ""} supprimée${removed !== 1 ? "s" : ""}.`,
    );
  };

  const handleExport = () => {
    const json = onExport();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `idayal-${toLocalISODate(new Date())}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportClick = () => fileRef.current?.click();

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const ok = onImport(text);
    setFeedback(ok ? "Import réussi." : "Échec de l'import (JSON invalide).");
    e.target.value = "";
  };

  const setTheme = (mode: Settings["themeMode"]) => {
    onUpdateSettings({ themeMode: mode });
  };

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 z-50 ${open ? "pointer-events-auto" : "pointer-events-none"}`}
      role="dialog"
      aria-modal="true"
      aria-label="Réglages"
      ref={dialogRef}
      tabIndex={-1}
    >
      <div
        className={`absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />
      <div
        className={`settings-sheet absolute left-1/2 -translate-x-1/2 bottom-0 w-full max-w-app bg-idayal-bg dark:bg-idayal-bg-dark rounded-t-[28px] shadow-2xl transition-transform duration-300 ease-out ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
        style={{
          maxHeight: "90vh",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {/* Handle visuel en haut */}
        <div className="flex justify-center pt-2.5 pb-1">
          <div className="w-9 h-1 rounded-full bg-idayal-border dark:bg-idayal-border-dark" />
        </div>
        <div className="flex items-center justify-between px-5 pt-1 pb-3">
          <h2 className="text-[20px] font-bold text-idayal-text dark:text-zinc-100 tracking-tight2">
            Réglages
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="w-9 h-9 rounded-full bg-zinc-100 dark:bg-zinc-800 text-idayal-text-secondary dark:text-zinc-300 flex items-center justify-center active:scale-90 transition"
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div
          className="overflow-y-auto px-5 pb-6"
          style={{ maxHeight: "calc(90vh - 60px)" }}
        >
          <SyncSection sync={sync} />

          {/* Notifications */}
          <section className="mb-5">
            <div className="flex items-center justify-between bg-idayal-bg-elev dark:bg-idayal-bg-dark-elev border border-idayal-border dark:border-idayal-border-dark rounded-row px-4 py-3 shadow-sm">
              <div>
                <p className="text-idayal-text dark:text-zinc-100 font-medium">
                  Notifications
                </p>
                <p className="text-xs text-idayal-text-secondary dark:text-zinc-400 mt-0.5">
                  Résumé matin + alertes horaires.
                </p>
              </div>
              <button
                type="button"
                onClick={toggleNotifications}
                className={`relative w-12 h-7 rounded-full transition-colors ${
                  settings.notificationsEnabled
                    ? "bg-idayal-blue"
                    : "bg-zinc-300 dark:bg-zinc-700"
                }`}
                aria-label="Activer les notifications"
                aria-pressed={settings.notificationsEnabled}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white transition-transform ${
                    settings.notificationsEnabled ? "translate-x-5" : ""
                  }`}
                />
              </button>
            </div>
            {!isNotificationSupported() && (
              <p className="text-xs text-idayal-orange mt-2 px-1">
                Ton navigateur ne supporte pas les notifications.
              </p>
            )}
            <p className="text-xs text-idayal-text-secondary dark:text-zinc-500 mt-2 px-1 leading-relaxed">
              Sur iPhone, les notifications fonctionnent uniquement si l'app est
              installée via « Ajouter à l'écran d'accueil » dans Safari.
            </p>
          </section>

          {/* Heure du résumé */}
          <section className="mb-5">
            <div className="flex items-center justify-between bg-idayal-bg-elev dark:bg-idayal-bg-dark-elev border border-idayal-border dark:border-idayal-border-dark rounded-row px-4 py-3 shadow-sm">
              <p className="text-idayal-text dark:text-zinc-100 font-medium">
                Résumé du matin
              </p>
              <input
                type="time"
                value={settings.morningSummaryTime}
                onChange={(e) =>
                  onUpdateSettings({ morningSummaryTime: e.target.value })
                }
                className="bg-transparent text-idayal-blue font-medium outline-none"
              />
            </div>
          </section>

          {/* Thème */}
          <section className="mb-5">
            <p className="text-xs uppercase tracking-wide text-idayal-text-secondary dark:text-zinc-500 px-1 mb-2">
              Apparence
            </p>
            <div className="flex gap-2">
              {(["system", "light", "dark"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setTheme(m)}
                  className={`flex-1 py-2 rounded-row text-sm font-medium transition ${
                    settings.themeMode === m
                      ? "bg-idayal-blue text-white"
                      : "bg-white dark:bg-zinc-900 text-idayal-text dark:text-zinc-200"
                  }`}
                >
                  {m === "system" ? "Auto" : m === "light" ? "Clair" : "Sombre"}
                </button>
              ))}
            </div>
          </section>

          {/* Données */}
          <section className="mb-5">
            <p className="text-xs uppercase tracking-wide text-idayal-text-secondary dark:text-zinc-500 px-1 mb-2">
              Données
            </p>
            <button
              type="button"
              onClick={handleClean}
              className="w-full text-left bg-idayal-bg-elev dark:bg-idayal-bg-dark-elev border border-idayal-border dark:border-idayal-border-dark rounded-row px-4 py-3 shadow-sm text-idayal-text dark:text-zinc-100 mb-2 active:scale-[0.99]"
            >
              Supprimer les tâches complétées (+ 30 jours)
            </button>
            <button
              type="button"
              onClick={handleExport}
              className="w-full text-left bg-idayal-bg-elev dark:bg-idayal-bg-dark-elev border border-idayal-border dark:border-idayal-border-dark rounded-row px-4 py-3 shadow-sm text-idayal-text dark:text-zinc-100 mb-2 active:scale-[0.99]"
            >
              Exporter mes tâches (JSON)
            </button>
            <button
              type="button"
              onClick={handleImportClick}
              className="w-full text-left bg-idayal-bg-elev dark:bg-idayal-bg-dark-elev border border-idayal-border dark:border-idayal-border-dark rounded-row px-4 py-3 shadow-sm text-idayal-text dark:text-zinc-100 active:scale-[0.99]"
            >
              Importer des tâches (JSON)
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={handleImportFile}
            />
          </section>

          {feedback && (
            <p className="text-center text-sm text-idayal-blue mb-3">
              {feedback}
            </p>
          )}

          <p className="text-center text-xs text-idayal-text-secondary dark:text-zinc-500 mt-4">
            iDayal · v{appVersion}
          </p>
        </div>
      </div>
    </div>
  );
}
