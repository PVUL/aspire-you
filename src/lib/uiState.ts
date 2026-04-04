export type UiState = {
  activeDate?: string;
  sidebarOpen?: boolean;
  sidebarWidth?: number;
  settingsOpen?: boolean;
  dashboardExpanded?: boolean;
  debugOpen?: boolean;
  debugHeight?: number;
};

export function getUiState(): UiState {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem("aspire_ui_state");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function patchUiState(updates: Partial<UiState>) {
  if (typeof window === "undefined") return;
  const current = getUiState();
  localStorage.setItem("aspire_ui_state", JSON.stringify({ ...current, ...updates }));
}
