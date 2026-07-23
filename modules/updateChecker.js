const REMOTE_MANIFEST_URL = 'https://raw.githubusercontent.com/waiyanminthant/JATTUMNN/main/manifest.json';
const UPDATE_STORAGE_KEY = 'updateCheck';

function semverCompare(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
}

export async function checkForUpdate() {
  try {
    const response = await fetch(REMOTE_MANIFEST_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const remoteManifest = await response.json();
    const latestVersion = remoteManifest.version;
    const currentVersion = chrome.runtime.getManifest().version;

    const result = {
      checkedAt: Date.now(),
      latestVersion,
      currentVersion,
      updateAvailable: semverCompare(latestVersion, currentVersion) > 0,
    };

    await chrome.storage.local.set({ [UPDATE_STORAGE_KEY]: result });
    return result;
  } catch (error) {
    console.error('[JATTUMNN] Update check failed:', error);
    const errorResult = { error: error.message, checkedAt: Date.now() };
    await chrome.storage.local.set({ [UPDATE_STORAGE_KEY]: errorResult });
    return errorResult;
  }
}

export async function getUpdateStatus() {
  const { [UPDATE_STORAGE_KEY]: status } = await chrome.storage.local.get(UPDATE_STORAGE_KEY);
  return status || null;
}
