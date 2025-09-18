export type Section = 'HPI' | 'ROS' | 'EXAM' | 'PLAN';
export type Strategy = 'value' | 'execCommand' | 'clipboard';
export type FieldMapping = {
  section: Section;
  selector: string;
  strategy: Strategy;
  verified: boolean;
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
