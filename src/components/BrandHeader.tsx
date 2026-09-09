import { Wordmark } from "./Wordmark";
import { Icon } from "./Icon";
export function BrandHeader({
  onOpenSettings,
  onSearch,
}: {
  onOpenSettings: () => void;
  onSearch: () => void;
}) {
  return (
    <header className="brand-header">
      <div className="brand-lockup">
        <Wordmark height={32} className="text-[#16255B] dark:text-white" />
        <span>ma journée idéale</span>
      </div>
      <div className="header-tools">
        <button
          className="icon-button search-trigger"
          aria-label="Rechercher des tâches et des notes"
          onClick={onSearch}
        >
          <Icon name="search" />
        </button>
        <button
          className="icon-button mobile-settings"
          aria-label="Réglages"
          onClick={onOpenSettings}
        >
          <Icon name="settings" />
        </button>
      </div>
    </header>
  );
}
