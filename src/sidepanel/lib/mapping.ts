export type Section = 'HPI' | 'ROS' | 'EXAM' | 'PLAN';
export type Strategy = 'value' | 'execCommand' | 'clipboard';
export type FieldMapping = {
  section: Section;
  selector: string;
  strategy: Strategy;
  verified: boolean;
  // For same-origin iframes: index path from top window to target frame
  framePath?: number[];
  // Target context: main page, iframe, or popup window
  target?: 'page' | 'iframe' | 'popup';
  // Popup targeting hints (optional): used when target === 'popup'
  popupUrlPattern?: string;       // e.g., 'https://ehr.example.com/editor*'
  popupTitleIncludes?: string;    // e.g., 'Plan Editor'
  fallbackSelectors?: string[];
};

export async function loadProfile(hostname: string) {
  try {
    const key = `MAP_${hostname}`;
    const store = await chrome.storage.local.get([key]);
    return (store[key] || {}) as Record<Section, FieldMapping>;
  } catch {
    return {} as Record<Section, FieldMapping>;
  }
}

export async function saveProfile(hostname: string, profile: Record<Section, FieldMapping>) {
  const key = `MAP_${hostname}`;
  await chrome.storage.local.set({ [key]: profile });
}
