import { google } from 'googleapis';
import { getAuthClient, getFolderId, getDocTemplateId } from './googleAuth';
import { queueGoogleApiCall } from './queueUtils';
import { PRFSyncPayload } from '../src/types';

interface TextMatch {
  startIndex: number;
  endIndex: number;
}

interface IndexedOp {
  index: number;
  /** Within the same index, lower order runs first (0 = delete, 1 = insert) */
  order: number;
  request: any;
}

/**
 * Helper to extract plain text from a table cell
 */
function getCellText(cell: any): string {
  if (!cell || !cell.content) return '';
  return cell.content
    .map((content: any) => {
      if (content.paragraph) {
        return (content.paragraph.elements || [])
          .map((el: any) => el.textRun?.content || '')
          .join('');
      }
      return '';
    })
    .join('')
    .trim();
}

/**
 * Recursively searches the document body for a placeholder string in paragraphs and tables.
 */
function findTextOccurrences(doc: any, searchText: string): TextMatch[] {
  const matches: TextMatch[] = [];

  function traverse(element: any) {
    if (!element) return;

    if (element.paragraph) {
      for (const el of element.paragraph.elements || []) {
        if (el.textRun?.content?.includes(searchText)) {
          const idx = el.textRun.content.indexOf(searchText);
          const start = el.startIndex + idx;
          matches.push({ startIndex: start, endIndex: start + searchText.length });
        }
      }
    }

    if (element.table) {
      for (const row of element.table.tableRows || []) {
        for (const cell of row.tableCells || []) {
          for (const cellElement of cell.content || []) {
            traverse(cellElement);
          }
        }
      }
    }
  }

  for (const element of doc.body?.content || []) {
    traverse(element);
  }

  return matches;
}

/**
 * Format date string safely to YYYY-MM-DD
 */
function formatDateToYMD(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const cleaned = dateStr.trim();
  if (!cleaned) return '';
  try {
    const d = new Date(cleaned);
    if (!isNaN(d.getTime())) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  } catch (err) {
    console.warn(`Error formatting date for docs: ${dateStr}`, err);
  }
  return cleaned;
}

/**
 * Returns the best insert index for a table cell:
 * uses the startIndex of the first text element inside the paragraph,
 * falling back to the paragraph structural element's startIndex.
 */
function getCellInsertIndex(cell: any): number | null {
  if (!cell?.content?.[0]) return null;
  const para = cell.content[0].paragraph;
  if (para?.elements?.[0]?.startIndex != null) {
    return para.elements[0].startIndex; 
  }
  if (cell.content[0].startIndex != null) {
    return cell.content[0].startIndex; 
  }
  return null;
}

/**
 * Builds index-based requests (table cell insertions + signature replacements)
 * from a freshly fetched document snapshot.
 *
 * IMPORTANT: Must be called AFTER the replaceAllText batch has been committed,
 * because replaceAllText changes the document length and shifts every character
 * index. Using pre-batch indices here would cause "insertion index out of bounds".
 */
function buildIndexBasedRequests(doc: any, prfData: PRFSyncPayload): any[] {
  const ops: IndexedOp[] = [];

  // ── Diagnostic: log lineItems received ─────────────────────────────────────
  console.log(`[buildIndexBasedRequests] lineItems received: ${JSON.stringify(prfData.lineItems)}`);
  console.log(`[buildIndexBasedRequests] totalAmount: ${prfData.totalAmount}`);

  // ── Table cell line-item insertions ────────────────────────────────────────
  const bodyContent: any[] = doc.body?.content || [];
  let tableCount = 0;
  let itemsTableFoundCount = 0;

  for (const element of bodyContent) {
    if (!element.table?.tableRows) continue;

    const rows = element.table.tableRows;
    tableCount++;

    // Log every table found so we can see what the header cells say
    const row0 = rows[0];
    const h0 = getCellText(row0?.tableCells?.[0]);
    const h1 = getCellText(row0?.tableCells?.[1]);
    const h2 = getCellText(row0?.tableCells?.[2]);
    console.log(`[Table ${tableCount}] rows=${rows.length} | col0="${h0}" | col1="${h1}" | col2="${h2}"`);

    if (rows.length < 2) {
      console.log(`[Table ${tableCount}] Skipped: fewer than 2 rows`);
      continue;
    }

    const isItemsTable =
      h0.toUpperCase().includes('DATE') &&
      (h1.toUpperCase().includes('DESCRIPTION') || h1.toUpperCase().includes('PURPOSE'));

    if (!isItemsTable) {
      console.log(`[Table ${tableCount}] Skipped: header mismatch`);
      continue;
    }

    // Determine which line items to use
    let lineItemsToUse = itemsTableFoundCount === 0 ? (prfData.lineItems || []) : (prfData.lineItems2 || []);
    
    // If we're on the second table but no secondary form was enabled, skip it entirely
    if (itemsTableFoundCount === 1 && !prfData.hasSecondaryForm) {
      console.log(`[Table ${tableCount}] Skipped: secondary form unused`);
      itemsTableFoundCount++;
      continue;
    }
    
    itemsTableFoundCount++;
    console.log(`[Table ${tableCount}] ✓ Identified as line-items table`);

    // rows[0] = header, rows[1..length-2] = data rows, rows[length-1] = TOTAL
    const maxDataRows = Math.min(8, rows.length - 2);
    console.log(`[Table ${tableCount}] maxDataRows=${maxDataRows}, lineItemsToUse.length=${lineItemsToUse.length}`);

    for (let i = 0; i < maxDataRows; i++) {
      const item = lineItemsToUse[i];
      const targetRow = rows[i + 1];
      if (!targetRow?.tableCells) continue;

      const [cellDate, cellDesc, cellAmount] = targetRow.tableCells;

      const idxDate   = getCellInsertIndex(cellDate);
      const idxDesc   = getCellInsertIndex(cellDesc);
      const idxAmount = getCellInsertIndex(cellAmount);

      console.log(`[Table ${tableCount}] Row ${i + 1}: idxDate=${idxDate} idxDesc=${idxDesc} idxAmount=${idxAmount} | item=${JSON.stringify(item)}`);

      if (!item) {
        console.log(`[Table ${tableCount}] Row ${i + 1}: no item, skipping`);
        continue;
      }

      const amtNum =
        typeof item.amount === 'number' ? item.amount : parseFloat(item.amount || '0');
      const formattedAmt = amtNum.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

      if (idxDate != null) {
        ops.push({
          index: idxDate,
          order: 1,
          request: { insertText: { text: item.date || '', location: { index: idxDate } } },
        });
      } else {
        console.warn(`[Table ${tableCount}] Row ${i + 1}: date cell has no valid startIndex`);
      }

      if (idxDesc != null) {
        ops.push({
          index: idxDesc,
          order: 1,
          request: { insertText: { text: item.description || '', location: { index: idxDesc } } },
        });
      } else {
        console.warn(`[Table ${tableCount}] Row ${i + 1}: desc cell has no valid startIndex`);
      }

      if (idxAmount != null) {
        ops.push({
          index: idxAmount,
          order: 1,
          request: { insertText: { text: formattedAmt, location: { index: idxAmount } } },
        });
      } else {
        console.warn(`[Table ${tableCount}] Row ${i + 1}: amount cell has no valid startIndex`);
      }
    }

    // ── TOTAL row (last row, amount in 3rd cell) ────────────────────────────
    const totalRow  = rows[rows.length - 1];
    const totalCell = totalRow?.tableCells?.[2];
    const idxTotal  = getCellInsertIndex(totalCell);
    
    // Calculate total dynamically for the current table
    const totalNum = lineItemsToUse.reduce((sum, item) => sum + (typeof item.amount === 'number' ? item.amount : parseFloat(item.amount || '0')), 0);

    const formattedTotal = totalNum.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    console.log(`[Table ${tableCount}] TOTAL row: idxTotal=${idxTotal} value="${formattedTotal}"`);

    if (idxTotal != null) {
      ops.push({
        index: idxTotal,
        order: 1,
        request: { insertText: { text: formattedTotal, location: { index: idxTotal } } },
      });
    } else {
      console.warn(`[Table ${tableCount}] TOTAL cell has no valid startIndex`);
    }
  }

  if (itemsTableFoundCount === 0) {
    console.error(
      '[buildIndexBasedRequests] ⚠ Items table NOT found. ' +
      'Check that the header row contains "Date" in col 0 and "Description"/"Purpose" in col 1.',
    );
  }

  // ── Signature replacements ──────────────────────────────────────────────────
  const signatureSlots = [
    { placeholder: '{{Signature1}}', url: prfData.requestorSignatureUrl },
    { placeholder: '{{Signature2}}', url: prfData.approverSignatureUrl },
    { placeholder: '{{Signature3}}', url: prfData.receiverSignatureUrl },
    // Secondary signatures
    { placeholder: '{{Signature01}}', url: prfData.hasSecondaryForm ? (prfData.requestorSignatureUrl2 || prfData.requestorSignatureUrl) : null },
    { placeholder: '{{Signature02}}', url: prfData.hasSecondaryForm ? prfData.approverSignatureUrl : null },
    { placeholder: '{{Signature03}}', url: prfData.hasSecondaryForm ? prfData.receiverSignatureUrl : null },
  ];

  for (const { placeholder, url } of signatureSlots) {
    if (url) {
      const matches = findTextOccurrences(doc, placeholder);
      console.log(`[Signature] ${placeholder}: found ${matches.length} match(es), url="${url}"`);
      for (const m of matches) {
        // Delete must run BEFORE insert at the same index (order: 0 vs 1)
        ops.push({
          index: m.startIndex,
          order: 0,
          request: {
            deleteContentRange: {
              range: { startIndex: m.startIndex, endIndex: m.endIndex },
            },
          },
        });
        ops.push({
          index: m.startIndex,
          order: 1,
          request: {
            insertInlineImage: {
              uri: url,
              location: { index: m.startIndex },
              objectSize: {
                height: { magnitude: 24, unit: 'PT' },
                width: { magnitude: 60, unit: 'PT' },
              },
            },
          },
        });
      }
    }
  }

  // Sort descending by index so that inserting at a higher position never shifts
  // indices of lower positions not yet processed.
  // For the same index, deletes (order 0) run before inserts (order 1).
  ops.sort((a, b) =>
    a.index !== b.index ? b.index - a.index : a.order - b.order,
  );

  console.log(`[buildIndexBasedRequests] Total pure indexOps built: ${ops.length}`);

  return ops.map((o) => o.request);
}

/**
 * Creates and customizes the PRF layout Google Doc based on the template.
 *
 * Uses TWO sequential batchUpdate calls to avoid index drift:
 *   Batch 1 — replaceAllText ops (changes document length → shifts all indices)
 *   Re-fetch  — get updated character indices from the now-modified doc
 *   Batch 2 — insertText / deleteContentRange / insertInlineImage ops
 */
export async function createPrfDoc(prfData: PRFSyncPayload) {
  return queueGoogleApiCall(async () => {
    const auth = getAuthClient();
    const drive = google.drive({ version: 'v3', auth });
    const docs = google.docs({ version: 'v1', auth });

    const TEMPLATE_ID = getDocTemplateId();
    const FOLDER_ID = getFolderId();

    let documentId = '';

    // 1. Copy the template
    try {
      console.log(`Cloning Doc Template ID: ${TEMPLATE_ID} to target folder...`);
      const copy = await drive.files.copy({
        fileId: TEMPLATE_ID,
        supportsAllDrives: true,
        requestBody: {
          name: `PRF_Voucher_${prfData.prfNumber}`,
          parents: FOLDER_ID ? [FOLDER_ID] : undefined,
        },
      });
      documentId = copy.data.id!;
      console.log(`Doc Cloned successfully: ${documentId}`);
    } catch (copyErr: any) {
      console.warn('Google Drive Doc template copy failed. Creating fallback document...', copyErr);
      const newDoc = await docs.documents.create({
        requestBody: { title: `PRF_Voucher_${prfData.prfNumber}` },
      });
      documentId = newDoc.data.documentId!;
    }

    // 2. Set permissions
    try {
      await drive.permissions.create({
        fileId: documentId,
        supportsAllDrives: true,
        requestBody: { role: 'reader', type: 'anyone' },
      });
    } catch (permError) {
      console.error('Warning: Failed to set public permissions on Google Doc:', permError);
    }

    // ── BATCH 1: replaceAllText only ───────────────────────────────────────────
    // These ops replace placeholder tokens with real values. Because each
    // replacement can be a different length than the placeholder, the document's
    // total character count changes, shifting every index after the replaced text.
    // Keeping these in a separate batch ensures Batch 2 reads correct indices.
    // ──────────────────────────────────────────────────────────────────────────
    const checkmarkValue = prfData.billable ? '☑' : '☐';
    const checkmarkValue2 = prfData.hasSecondaryForm ? (prfData.billable2 ? '☑' : '☐') : '';

    const replaceRequests: any[] = [
      { replaceAllText: { containsText: { text: '{{Department}}',     matchCase: true }, replaceText: prfData.department        || '' } },
      { replaceAllText: { containsText: { text: '{{Client}}',         matchCase: true }, replaceText: prfData.clientName        || '' } },
      { replaceAllText: { containsText: { text: '{{Bank}}',           matchCase: true }, replaceText: prfData.bank              || '' } },
      { replaceAllText: { containsText: { text: '{{Date}}',           matchCase: true }, replaceText: prfData.date              || '' } },
      { replaceAllText: { containsText: { text: '{{PRF}}',            matchCase: true }, replaceText: prfData.prfNumber         || '' } },
      { replaceAllText: { containsText: { text: '{{Checkbox}}',       matchCase: true }, replaceText: checkmarkValue                  } },
      { replaceAllText: { containsText: { text: '{{Billable}}',       matchCase: true }, replaceText: checkmarkValue                  } },
      { replaceAllText: { containsText: { text: '{{Requestor_Name}}', matchCase: true }, replaceText: prfData.requestorName    || '' } },
      { replaceAllText: { containsText: { text: '{{Date1}}',          matchCase: true }, replaceText: formatDateToYMD(prfData.requestorSignedAt) } },
      { replaceAllText: { containsText: { text: '{{Approver_Name}}',  matchCase: true }, replaceText: prfData.approverName     || '' } },
      { replaceAllText: { containsText: { text: '{{Date2}}',          matchCase: true }, replaceText: formatDateToYMD(prfData.approverSignedAt)  } },
      { replaceAllText: { containsText: { text: '{{Received_By}}',    matchCase: true }, replaceText: prfData.receiverName     || '' } },
      { replaceAllText: { containsText: { text: '{{Date3}}',          matchCase: true }, replaceText: formatDateToYMD(prfData.receiverSignedAt)  } },
      
      // Secondary form replacements
      { replaceAllText: { containsText: { text: '{{Department1}}',     matchCase: true }, replaceText: prfData.hasSecondaryForm ? (prfData.department2 || '') : '' } },
      { replaceAllText: { containsText: { text: '{{Client1}}',         matchCase: true }, replaceText: prfData.hasSecondaryForm ? (prfData.clientName2 || '') : '' } },
      { replaceAllText: { containsText: { text: '{{Bank1}}',           matchCase: true }, replaceText: prfData.hasSecondaryForm ? (prfData.bank2 || '') : '' } },
      { replaceAllText: { containsText: { text: '{{Date00}}',          matchCase: true }, replaceText: prfData.hasSecondaryForm ? (prfData.date2 || '') : '' } },
      { replaceAllText: { containsText: { text: '{{PRF1}}',            matchCase: true }, replaceText: prfData.hasSecondaryForm ? (prfData.prfNumber || '') : '' } },
      { replaceAllText: { containsText: { text: '{{Billable1}}',       matchCase: true }, replaceText: prfData.hasSecondaryForm ? checkmarkValue2 : '' } },
      { replaceAllText: { containsText: { text: '{{Requestor_Name1}}', matchCase: true }, replaceText: prfData.hasSecondaryForm ? (prfData.requestorName || '') : '' } },
      { replaceAllText: { containsText: { text: '{{Date01}}',          matchCase: true }, replaceText: prfData.hasSecondaryForm ? formatDateToYMD(prfData.requestorSignedAt) : '' } },
      { replaceAllText: { containsText: { text: '{{Approver_Name1}}',  matchCase: true }, replaceText: prfData.hasSecondaryForm ? (prfData.approverName || '') : '' } },
      { replaceAllText: { containsText: { text: '{{Date02}}',          matchCase: true }, replaceText: prfData.hasSecondaryForm ? formatDateToYMD(prfData.approverSignedAt) : '' } },
      { replaceAllText: { containsText: { text: '{{Received_By1}}',    matchCase: true }, replaceText: prfData.hasSecondaryForm ? (prfData.receiverName || '') : '' } },
      { replaceAllText: { containsText: { text: '{{Date03}}',          matchCase: true }, replaceText: prfData.hasSecondaryForm ? formatDateToYMD(prfData.receiverSignedAt) : '' } },
    ];

    // For any signature slots that do NOT have a URL yet, replace them with a space
    // in Batch 1 so we don't do length-changing replaces in Batch 2.
    const signatureSlots = [
      { placeholder: '{{Signature1}}', url: prfData.requestorSignatureUrl },
      { placeholder: '{{Signature2}}', url: prfData.approverSignatureUrl },
      { placeholder: '{{Signature3}}', url: prfData.receiverSignatureUrl },
      // Secondary signatures
      { placeholder: '{{Signature01}}', url: prfData.hasSecondaryForm ? (prfData.requestorSignatureUrl2 || prfData.requestorSignatureUrl) : null },
      { placeholder: '{{Signature02}}', url: prfData.hasSecondaryForm ? prfData.approverSignatureUrl : null },
      { placeholder: '{{Signature03}}', url: prfData.hasSecondaryForm ? prfData.receiverSignatureUrl : null },
    ];

    for (const { placeholder, url } of signatureSlots) {
      if (!url) {
        console.log(`[Signature] ${placeholder} placeholder cleared/blanked space in Batch 1`);
        replaceRequests.push({
          replaceAllText: {
            containsText: { text: placeholder, matchCase: true },
            replaceText: ' ',
          },
        });
      }
    }

    console.log(`Batch 1: Executing ${replaceRequests.length} replaceAllText requests...`);
    await docs.documents.batchUpdate({
      documentId,
      requestBody: { requests: replaceRequests },
    });
    console.log('Batch 1: Complete.');

    // ── Re-fetch doc with updated indices ──────────────────────────────────────
    // After Batch 1 the document structure has changed. We must read fresh
    // startIndex values before building any insertText / image operations.
    // ──────────────────────────────────────────────────────────────────────────
    console.log('Re-fetching document for updated indices...');
    const updatedDoc = await docs.documents.get({ documentId });
    console.log('Re-fetch complete.');

    // ── BATCH 2: index-based ops ───────────────────────────────────────────────
    // Table cell insertions and signature image replacements, all using indices
    // sourced from the post-Batch-1 document snapshot.
    // ──────────────────────────────────────────────────────────────────────────
    const indexRequests = buildIndexBasedRequests(updatedDoc.data, prfData);

    if (indexRequests.length > 0) {
      console.log(`Batch 2: Executing ${indexRequests.length} index-based requests...`);
      await docs.documents.batchUpdate({
        documentId,
        requestBody: { requests: indexRequests },
      });
      console.log('Batch 2: Complete.');
    } else {
      console.log('Batch 2: No index-based requests to execute.');
    }

    const webViewUrl = `https://docs.google.com/document/d/${documentId}/edit`;
    return { documentId, webViewUrl };
  });
}

/**
 * Syncs the document: deletes the old document and creates a fresh updated clone.
 */
export async function syncPrfDoc(prfData: PRFSyncPayload, existingDocId?: string) {
  if (existingDocId) {
    try {
      await queueGoogleApiCall(async () => {
        const auth = getAuthClient();
        const drive = google.drive({ version: 'v3', auth });
        await drive.files.delete({ fileId: existingDocId, supportsAllDrives: true });
        console.log(`Deleted outdated google doc document ${existingDocId} to sync fresh copy.`);
      });
    } catch (deleteErr) {
      console.warn(
        `Could not delete outdated document ${existingDocId} (may have been removed manually). Producing fresh document...`,
        deleteErr,
      );
    }
  }

  return createPrfDoc(prfData);
}
