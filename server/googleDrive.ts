import { google } from 'googleapis';
import { getAuthClient, getFolderId } from './googleAuth';
import { Readable } from 'stream';
import { queueGoogleApiCall } from './queueUtils';

/**
 * Uploads a file (Buffer or Base64 String) to Google Drive
 */
export async function uploadFileToDrive(
  fileName: string,
  mimeType: string,
  fileData: Buffer | string
) {
  return queueGoogleApiCall(async () => {
    const auth = getAuthClient();
    const drive = google.drive({ version: 'v3', auth });

    const buffer = Buffer.isBuffer(fileData)
      ? fileData
      : Buffer.from(
          fileData.replace(/^data:\w+\/[\w+]+;base64,/, ''),
          'base64'
        );

    const folderId = getFolderId();
    let file;

    try {
      file = await drive.files.create({
        supportsAllDrives: true,
        requestBody: {
          name: fileName,
          parents: folderId ? [folderId] : undefined,
        },
        media: {
          mimeType,
          body: Readable.from(buffer),
        },
        fields: 'id, webViewLink',
      });
    } catch (createErr) {
      console.warn(`File upload into custom folder ${folderId} failed; falling back to root Drive space creation...`, createErr);
      
      file = await drive.files.create({
        supportsAllDrives: true,
        requestBody: {
          name: fileName,
        },
        media: {
          mimeType,
          body: Readable.from(buffer),
        },
        fields: 'id, webViewLink',
      });
    }

    const fileId = file.data.id!;

    // Grant public read access so =IMAGE() formula can render signatures inside Sheets templates
    try {
      await drive.permissions.create({
        fileId: fileId,
        requestBody: {
          role: 'reader',
          type: 'anyone',
        },
      });
    } catch (permError) {
      console.error(`Warning: Failed to set public permissions on Google Drive file ${fileId}.`, permError);
    }

    return {
      fileId,
      webViewUrl: file.data.webViewLink!,
      directUrl: `https://drive.google.com/uc?id=${fileId}`,
    };
  });
}
