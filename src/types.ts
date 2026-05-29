export type PrfStatus = 'Draft' | 'Pending Approval' | 'Approved' | 'Received' | 'Completed' | 'Rejected';

export type UserRole = 'Requestor' | 'Approver' | 'Receiver' | 'Administrator';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  roles?: UserRole[];
  signatureUrl: string | null; // direct google drive link or data URL
  isActive: boolean;
  createdAt: string;
}

export interface PrfRequest {
  id: string;
  prfNumber: string;
  department: string;
  clientName: string;
  bank: string;
  billable: boolean;
  date: string;
  status: PrfStatus;
  totalAmount: number;
  createdAt: string;
  updatedAt?: string;
  
  // Requestor block
  requestorId: string;
  requestorName: string;
  requestorSignedAt: string | null;
  requestorSignatureUrl: string | null;
  
  // Approver block
  approverId: string | null;
  approverName: string | null;
  approverSignedAt: string | null;
  approverSignatureUrl: string | null;
  approverSignatureUrl2?: string | null;
  
  // Receiver block
  receiverId: string | null;
  receiverName: string | null;
  receiverSignedAt: string | null;
  receiverSignatureUrl: string | null;
  receiverSignatureUrl2?: string | null;
  
  pdfDriveUrl: string | null;
  googleSheetId: string | null;
  spreadsheetUrl: string | null;
  
  hasSecondaryForm?: boolean;
  department2?: string;
  clientName2?: string;
  bank2?: string;
  billable2?: boolean;
  date2?: string;
}

export interface PrfLineItem {
  id: string;
  prfRequestId: string;
  isSecondary?: boolean; // True if it belongs to the second form
  date: string;
  description: string;
  amount: number;
}

export interface PrfComment {
  id: string;
  prfRequestId: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  content: string;
  createdAt: string;
}

export interface PrfNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  isRead: boolean;
  prfId: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  action: string;
  details: string;
  previousValue: string | null;
  newValue: string | null;
  timestamp: string;
}

// Payload for Google Drive and Spreadsheet synchronization
export interface PRFSyncPayload {
  prfNumber: string;
  department: string;
  clientName: string;
  bank: string;
  billable: boolean;
  date: string;
  status: PrfStatus;
  totalAmount: number;
  
  requestorName: string;
  requestorSignatureUrl: string | null;
  requestorSignatureUrl2?: string | null;
  requestorSignedAt: string | null;
  
  approverName: string | null;
  approverSignatureUrl: string | null;
  approverSignatureUrl2?: string | null;
  approverSignedAt: string | null;
  
  receiverName: string | null;
  receiverSignatureUrl: string | null;
  receiverSignatureUrl2?: string | null;
  receiverSignedAt: string | null;
  
  hasSecondaryForm?: boolean;
  department2?: string;
  clientName2?: string;
  bank2?: string;
  billable2?: boolean;
  date2?: string;
  
  lineItems: Omit<PrfLineItem, 'id' | 'prfRequestId'>[];
  lineItems2?: Omit<PrfLineItem, 'id' | 'prfRequestId'>[];
}
