import { google } from 'googleapis';

/**
 * Extracts a Google resource ID from a URL or raw ID string.
 */
function cleanAndExtractId(value: string, type: 'folder' | 'document' | 'spreadsheet'): string {
  let cleaned = (value || '').replace(/^['"]|['"]$/g, '').trim();
  if (!cleaned) return '';

  if (cleaned.includes('/') || cleaned.includes('http')) {
    try {
      const withoutQuery = cleaned.split('?')[0];
      if (type === 'folder') {
        const folderMatch = withoutQuery.match(/\/folders\/([a-zA-Z0-9-_]+)/);
        if (folderMatch && folderMatch[1]) {
          return folderMatch[1];
        }
      } else {
        const dMatch = withoutQuery.match(/\/d\/([a-zA-Z0-9-_]+)/);
        if (dMatch && dMatch[1]) {
          return dMatch[1];
        }
      }

      // Slashes fallback (e.g. last segment check)
      const segments = withoutQuery.split('/').filter(Boolean);
      if (segments.length > 0) {
        let candidate = segments[segments.length - 1];
        if ((candidate === 'edit' || candidate === 'view' || candidate === 'sharing') && segments.length > 1) {
          candidate = segments[segments.length - 2];
        }
        return candidate;
      }
    } catch (err) {
      console.warn('Error parsing Google URL:', err);
    }
  }
  return cleaned;
}

export function getFolderId(): string {
  let folderId = process.env.GOOGLE_DRIVE_FOLDER_ID || '';
  folderId = cleanAndExtractId(folderId, 'folder');
  if (!folderId || folderId === 'YOUR_GOOGLE_DRIVE_FOLDER_ID') {
    return '1qpA8DI33HDfA7u_IrikPl_unGMMIOd1I';
  }
  return folderId;
}

export function getTemplateId(): string {
  let templateId = process.env.GOOGLE_SHEETS_PRF_TEMPLATE_ID || '';
  templateId = cleanAndExtractId(templateId, 'spreadsheet');
  if (!templateId || templateId === 'YOUR_GOOGLE_SHEETS_PRF_TEMPLATE_ID') {
    return '13ZV_pgpNNHBpeB-rSfMBM6_uuwipGu8AMarD3b3WG1U';
  }
  return templateId;
}

export function getDocTemplateId(): string {
  let templateId = process.env.GOOGLE_DOCS_PRF_TEMPLATE_ID || '';
  templateId = cleanAndExtractId(templateId, 'document');
  if (!templateId || templateId === 'YOUR_GOOGLE_DOCS_PRF_TEMPLATE_ID') {
    return '13ojZ-OC-ajw_THt6gQ2YNQPf6Bs5zxQH85oahnb2jg0';
  }
  return templateId;
}

// Memory caching for Firestore configuration overrides
let cachedGoogleConfig: {
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
} = {};

export function updateCachedGoogleConfig(config: { clientId?: string; clientSecret?: string; refreshToken?: string }) {
  cachedGoogleConfig = { ...cachedGoogleConfig, ...config };
}

export async function initGoogleAuthFromFirestore(db: any) {
  try {
    const configSnap = await db.collection('config').doc('google_auth').get();
    if (configSnap.exists) {
      const data = configSnap.data();
      if (data?.GOOGLE_REFRESH_TOKEN) {
        cachedGoogleConfig = {
          clientId: data.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID,
          clientSecret: data.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET,
          refreshToken: data.GOOGLE_REFRESH_TOKEN,
        };
        console.log('Successfully loaded Google Auth overrides from Firestore config cache.');
      }
    }
  } catch (err) {
    console.warn('Could not read Google Auth config cache from Firestore:', err);
  }
}

export function getAuthClient() {
  const clientId = cachedGoogleConfig.clientId || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = cachedGoogleConfig.clientSecret || process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = cachedGoogleConfig.refreshToken || process.env.GOOGLE_REFRESH_TOKEN;

  const auth = new google.auth.OAuth2(
    clientId,
    clientSecret
  );
  auth.setCredentials({
    refresh_token: refreshToken,
  });
  return auth;
}

export function validateGoogleConfig(): boolean {
  const folderId = getFolderId();
  const clientId = cachedGoogleConfig.clientId || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = cachedGoogleConfig.clientSecret || process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = cachedGoogleConfig.refreshToken || process.env.GOOGLE_REFRESH_TOKEN;

  return !!(
    clientId &&
    clientSecret &&
    refreshToken &&
    folderId &&
    folderId !== 'YOUR_GOOGLE_DRIVE_FOLDER_ID'
  );
}
