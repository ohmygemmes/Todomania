import type { TabKey } from "../types/task";
import { Icon } from "./Icon";
const tabs = [
  { key: "today", label: "Aujourd'hui", icon: "sun" },
  { key: "cards", label: "Cartes", icon: "cards" },
  { key: "later", label: "Plus tard", icon: "calendar" },
  { key: "notes", label: "Notes", icon: "note" },
] as const;
export function TabBar({
  active,
  onChange,
  onOpenSettings,
}: {
  active: TabKey;
  onChange: (tab: TabKey) => void;
  onOpenSettings: () => void;
}) {
  return (
    <nav className="app-navigation" aria-label="Navigation principale">
      <span className="nav-caption">MON ESPACE</span>
      <div className="nav-items">
        {tabs.map((tab, i) => (
          <button
            key={tab.key}
            className={`nav-item ${tab.key === "cards" ? "nav-cards" : ""} ${active === tab.key ? "is-active" : ""}`}
            aria-current={active === tab.key ? "page" : undefined}
            onClick={() => onChange(tab.key)}
          >
            <Icon name={tab.icon} />
            <span>{tab.label}</span>
            <kbd>{i === 1 ? 2 : i === 2 ? 3 : i + 1}</kbd>
          </button>
        ))}
      </div>
      <div className="nav-bottom">
        <div className="nav-philosophy">
          <Icon name="leaf" size={25} />
          <p>
            Une chose à la fois.
            <br />
            <span>Le reste peut attendre.</span>
          </p>
        </div>
        <button className="nav-item" onClick={onOpenSettings}>
          <Icon name="settings" />
          <span>Réglages</span>
        </button>
        <span className="nav-signature">UN PEU DE PLACE POUR SOI.</span>
      </div>
    </nav>
  );
}
