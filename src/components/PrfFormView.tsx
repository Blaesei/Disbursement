import React, { useState, useEffect } from 'react';
import { PrfRequest, PrfLineItem, UserProfile } from '../types';
import { ChevronLeft, Plus, Trash2, ShieldAlert, CheckCircle, Save, Send, Copy } from 'lucide-react';
import SignaturePad from './SignaturePad';

interface PrfFormViewProps {
  existingPrf?: PrfRequest | null;
  existingLineItems?: PrfLineItem[];
  onBack: () => void;
  onSubmit: (formData: any, lineItems: Omit<PrfLineItem, 'id' | 'prfRequestId'>[], signatureDataUrl: string | null, previewDocumentData?: { id: string, url: string }, signatureDataUrl2?: string | null) => Promise<void>;
  currentUser: UserProfile | null;
  nextPrfNumber: string;
}

export default function PrfFormView({
  existingPrf = null,
  existingLineItems = [],
  onBack,
  onSubmit,
  currentUser,
  nextPrfNumber
}: PrfFormViewProps) {
  const [department, setDepartment] = useState('Operations');
  const [clientName, setClientName] = useState('');
  const [bank, setBank] = useState('');
  const [billable, setBillable] = useState(true);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  
  // Line Items state
  const [lineItems, setLineItems] = useState<Omit<PrfLineItem, 'id' | 'prfRequestId'>[]>([]);
  const [lineDate, setLineDate] = useState(new Date().toISOString().split('T')[0]);
  const [lineDesc, setLineDesc] = useState('');
  const [lineAmt, setLineAmt] = useState('');

  // Secondary form state
  const [hasSecondaryForm, setHasSecondaryForm] = useState(false);
  const [department2, setDepartment2] = useState('Accounting');
  const [clientName2, setClientName2] = useState('');
  const [bank2, setBank2] = useState('');
  const [billable2, setBillable2] = useState(true);
  const [date2, setDate2] = useState(new Date().toISOString().split('T')[0]);
  const [lineItems2, setLineItems2] = useState<Omit<PrfLineItem, 'id' | 'prfRequestId'>[]>([]);
  const [lineDate2, setLineDate2] = useState(new Date().toISOString().split('T')[0]);
  const [lineDesc2, setLineDesc2] = useState('');
  const [lineAmt2, setLineAmt2] = useState('');

  const handleDuplicateFromPrimary = () => {
    setDepartment2(department);
    setClientName2(clientName);
    setBank2(bank);
    setBillable2(billable);
    setDate2(date);
    setLineItems2(lineItems.map(item => ({ ...item })));
  };

  // Signature state
  const [signatureBase64, setSignatureBase64] = useState<string | null>(null);
  const [signatureBase64_2, setSignatureBase64_2] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Preview Mode
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<{ id: string, url: string } | null>(null);
  const [previewTimeLeft, setPreviewTimeLeft] = useState<number | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (previewTimeLeft !== null && previewTimeLeft > 0 && isPreviewMode) {
      timer = setTimeout(() => setPreviewTimeLeft(previewTimeLeft - 1), 1000);
    } else if (previewTimeLeft === 0 && isPreviewMode) {
      handleCancelPreview();
    }
    return () => clearTimeout(timer);
  }, [previewTimeLeft, isPreviewMode]);

  const handleCancelPreview = async () => {
    setIsPreviewMode(false);
    setPreviewTimeLeft(null);
    if (previewDoc) {
      try {
        await fetch('/api/prf/cancel-doc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ documentId: previewDoc.id }),
        });
      } catch (err) {
        console.error('Failed to clear preview doc', err);
      }
      setPreviewDoc(null);
    }
  };

  const handleSatisfiedPreview = async () => {
    // Treat as "Save as Draft" but keep the preview document internally
    setIsPreviewMode(false);
    setPreviewTimeLeft(null);
    await handleSubmit('draft');
  };

  const handlePreviewDisbursement = async () => {
    setErrorMsg(null);
    if (!clientName.trim() || !bank.trim()) {
      setErrorMsg('Client Name and Bank Details are required to generate preview.');
      return;
    }

    let finalLineItems = [...lineItems];
    if (lineDesc.trim() && lineAmt.trim() && Number(lineAmt) > 0) {
      if (finalLineItems.length >= 8) {
        setErrorMsg('Max 8 line items allowed.');
        return;
      }
      finalLineItems.push({
        date: lineDate,
        description: lineDesc.trim(),
        amount: parseFloat(lineAmt)
      });
    }

    if (finalLineItems.length === 0) {
      setErrorMsg('At least one particulars line item must be attached before previewing.');
      return;
    }

    setIsPreviewLoading(true);
    try {
      if (previewDoc) {
        // Clear previous doc if it exists
        await fetch('/api/prf/cancel-doc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ documentId: previewDoc.id }),
        });
      }

      let finalLineItems2 = [...lineItems2];
      if (hasSecondaryForm && lineDesc2.trim() && lineAmt2.trim() && Number(lineAmt2) > 0) {
        if (finalLineItems2.length >= 8) {
          setErrorMsg('Max 8 line items allowed in secondary form.');
          setIsPreviewLoading(false);
          return;
        }
        finalLineItems2.push({
          date: lineDate2,
          description: lineDesc2.trim(),
          amount: parseFloat(lineAmt2)
        });
      }

      if (hasSecondaryForm && finalLineItems2.length === 0) {
        setErrorMsg('At least one line item must be attached in secondary form before previewing.');
        setIsPreviewLoading(false);
        return;
      }

      const totalAmt = finalLineItems.reduce((acc, curr) => acc + curr.amount, 0);
      
      const prfData: any = {
        prfNumber: existingPrf?.prfNumber || nextPrfNumber,
        department,
        clientName: clientName.trim(),
        bank: bank.trim(),
        billable,
        date,
        totalAmount: totalAmt,
        requestorName: currentUser?.displayName,
        lineItems: finalLineItems,
        
        hasSecondaryForm,
        department2,
        clientName2: clientName2.trim(),
        bank2: bank2.trim(),
        billable2,
        date2,
        lineItems2: finalLineItems2
      };

      const res = await fetch('/api/prf/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prfData })
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Preview failed to generate');
      }

      const result = await res.json();
      setPreviewDoc({ id: result.documentId, url: result.webViewUrl });
      setIsPreviewMode(true);
      setPreviewTimeLeft(5 * 60); // 5 minutes timer
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Payment request preview failed.');
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const existingPrfId = existingPrf?.id || '';
  const existingLineItemsCount = existingLineItems?.length || 0;

  useEffect(() => {
    if (existingPrf) {
      setDepartment(existingPrf.department);
      setClientName(existingPrf.clientName);
      setBank(existingPrf.bank);
      setBillable(existingPrf.billable);
      setDate(existingPrf.date);
      setLineItems((existingLineItems || []).filter(li => !li.isSecondary).map(li => ({
        date: li.date,
        description: li.description,
        amount: li.amount
      })));
      
      setHasSecondaryForm(existingPrf.hasSecondaryForm || false);
      setDepartment2(existingPrf.department2 || 'Accounting');
      setClientName2(existingPrf.clientName2 || '');
      setBank2(existingPrf.bank2 || '');
      setBillable2(existingPrf.billable2 || false);
      setDate2(existingPrf.date2 || new Date().toISOString().split('T')[0]);
      setLineItems2((existingLineItems || []).filter(li => li.isSecondary).map(li => ({
        date: li.date,
        description: li.description,
        amount: li.amount
      })));
    } else {
      setDepartment('Operations');
      setClientName('');
      setBank('');
      setBillable(true);
      setDate(new Date().toISOString().split('T')[0]);
      setLineItems([]);
      
      setHasSecondaryForm(false);
      setDepartment2('Accounting');
      setClientName2('');
      setBank2('');
      setBillable2(true);
      setDate2(new Date().toISOString().split('T')[0]);
      setLineItems2([]);
    }
  }, [existingPrfId, existingLineItemsCount]);

  const addLineItem = () => {
    if (lineItems.length >= 8) {
      setErrorMsg('A maximum of 8 row items is allowed on the voucher particulars.');
      return;
    }
    if (!lineDesc.trim() || !lineAmt.trim() || Number(lineAmt) <= 0) {
      setErrorMsg('Particulars description must be set and expense value must be positive.');
      return;
    }
    setErrorMsg(null);
    setLineItems([
      ...lineItems,
      {
        date: lineDate,
        description: lineDesc.trim(),
        amount: parseFloat(lineAmt)
      }
    ]);
    setLineDesc('');
    setLineAmt('');
  };

  const removeLineItem = (index: number) => {
    setLineItems(lineItems.filter((_, idx) => idx !== index));
  };

  const currentTotal = lineItems.reduce((acc, current) => acc + current.amount, 0);
  const displayedTotal = currentTotal + (parseFloat(lineAmt) || 0);

  const handleSubmit = async (submitAction: 'draft' | 'submit') => {
    setErrorMsg(null);
    if (!clientName.trim()) {
      setErrorMsg('Client / Entity Name must be specified.');
      return;
    }
    if (!bank.trim()) {
      setErrorMsg('Bank Details must be filled out for physical payments receipt.');
      return;
    }

    // Auto-append if there is a pending line item in the inputs
    let finalLineItems = [...lineItems];
    if (lineDesc.trim() && lineAmt.trim() && Number(lineAmt) > 0) {
      if (finalLineItems.length >= 8) {
        setErrorMsg('A maximum of 8 row items is allowed on the voucher particulars.');
        return;
      }
      finalLineItems.push({
        date: lineDate,
        description: lineDesc.trim(),
        amount: parseFloat(lineAmt)
      });
    }

    if (finalLineItems.length === 0) {
      setErrorMsg('At least one particulars line item must be attached before submitting.');
      return;
    }

    if (finalLineItems.length > 8) {
      setErrorMsg('A maximum of 8 row items is allowed on the voucher particulars.');
      return;
    }

    // Secondary form line items check
    let finalLineItems2 = [...lineItems2];
    if (hasSecondaryForm && lineDesc2.trim() && lineAmt2.trim() && Number(lineAmt2) > 0) {
      if (finalLineItems2.length >= 8) {
        setErrorMsg('A maximum of 8 row items is allowed on the secondary voucher particulars.');
        return;
      }
      finalLineItems2.push({
        date: lineDate2,
        description: lineDesc2.trim(),
        amount: parseFloat(lineAmt2)
      });
    }

    if (hasSecondaryForm && finalLineItems2.length === 0) {
      setErrorMsg('At least one particulars line item must be attached for the secondary form.');
      return;
    }

    // Standard submission requires drawing requestor's signature
    if (submitAction === 'submit' && !signatureBase64 && !currentUser?.signatureUrl) {
      setErrorMsg('Please draw and apply your sign-off signature below to authenticate workflow propagation.');
      return;
    }
    
    if (submitAction === 'submit' && hasSecondaryForm && !signatureBase64_2) {
      setErrorMsg('Please draw and apply your sign-off signature for the secondary form below to authenticate workflow propagation.');
      return;
    }

    setIsSubmitting(true);
    try {
      const formPayload = {
        prfNumber: existingPrf?.prfNumber || nextPrfNumber,
        department,
        clientName: clientName.trim(),
        bank: bank.trim(),
        billable,
        date,
        totalAmount: finalLineItems.reduce((acc, current) => acc + current.amount, 0),
        
        hasSecondaryForm,
        department2,
        clientName2: clientName2.trim(),
        bank2: bank2.trim(),
        billable2,
        date2,
        lineItems2: finalLineItems2,

        submitAction // 'draft' or 'submit'
      };

      await onSubmit(formPayload, finalLineItems, signatureBase64, previewDoc || undefined, hasSecondaryForm ? signatureBase64_2 : undefined);
      setLineDesc('');
      setLineAmt('');
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Payment request saving failed. Review system diagnostics.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full max-w-4xl mx-auto p-4 md:p-6 pb-24 font-sans text-slate-800">
      
      {/* 1. Header Toolbar */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-3 py-1.8 bg-white border border-slate-200 hover:bg-slate-50 transition rounded-lg text-xs font-bold text-slate-600 shadow-3xs cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" /> Return to Dashboard
        </button>
        <div>
          <h2 className="text-sm font-bold text-[#1E2D5A] uppercase tracking-wider text-right">
            {existingPrf ? `EDIT DRAFT ${existingPrf.prfNumber}` : 'DRAW NEW PAYMENT REQUEST'}
          </h2>
          <p className="text-[10px] text-slate-400 mt-0.5 text-right font-mono">Assigned Number: {existingPrf?.prfNumber || nextPrfNumber}</p>
        </div>
      </div>

      {errorMsg && (
        <div className="flex items-start gap-2.5 p-3 px-4 border border-rose-200 bg-rose-50 text-rose-900 text-xs rounded-xl shadow-3xs">
          <ShieldAlert className="w-4.5 h-4.5 text-rose-600 shrink-0" />
          <div className="font-medium">{errorMsg}</div>
        </div>
      )}

      {/* 2. Structured Metadata Deck */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 p-5 border border-slate-200 bg-white rounded-2xl shadow-3xs">
        
        {/* Left Grid Section */}
        <div className="flex flex-col gap-3.5">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] uppercase tracking-wider font-extrabold text-[#1E2D5A] select-none">Client / Target Entity</label>
            <input
              type="text"
              placeholder="e.g. Acme Corp Inc"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-200 hover:border-slate-300 focus:border-[#1E2D5A] focus:bg-white rounded-lg px-3 py-2 text-slate-800 focus:outline-hidden transition"
              required
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] uppercase tracking-wider font-extrabold text-[#1E2D5A] select-none">Bank</label>
            <input
              type="text"
              placeholder="e.g. BDO - 006328035545"
              value={bank}
              onChange={(e) => setBank(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-200 hover:border-slate-300 focus:border-[#1E2D5A] focus:bg-white rounded-lg px-3 py-2 text-slate-800 focus:outline-hidden transition"
              required
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] uppercase tracking-wider font-extrabold text-[#1E2D5A] select-none">Requestor Name</label>
            <input
              type="text"
              value={currentUser?.displayName || 'Active Account Profile'}
              disabled
              className="text-xs bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 text-slate-500 font-medium select-none cursor-not-allowed"
            />
          </div>
        </div>

        {/* Right Grid Section */}
        <div className="flex flex-col gap-3.5">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] uppercase tracking-wider font-extrabold text-[#1E2D5A] select-none">Department</label>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-200 hover:border-slate-300 focus:border-[#1E2D5A] focus:bg-white rounded-lg px-3 py-2 text-slate-800 focus:outline-hidden transition"
            >
              <option value="Accounting">Accounting</option>
              <option value="Corporate">Corporate</option>
              <option value="CAVD">CAVD</option>
              <option value="Litigation">Litigation</option>
              <option value="CCT">CCT</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] uppercase tracking-wider font-extrabold text-[#1E2D5A] select-none">Date Requested</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-200 hover:border-slate-300 focus:border-[#1E2D5A] focus:bg-white rounded-lg px-3 py-2 text-slate-800 focus:outline-hidden transition"
            />
          </div>

          <div className="flex flex-col gap-1 select-none">
            <label className="text-[11px] uppercase tracking-wider font-extrabold text-[#1E2D5A]">Payment billability</label>
            <div className="flex items-center gap-3 mt-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg">
              <input
                type="checkbox"
                id="billable_box"
                checked={billable}
                onChange={(e) => setBillable(e.target.checked)}
                className="w-4.5 h-4.5 text-[#1E2D5A] border-slate-300 rounded focus:ring-[#1E2D5A] cursor-pointer"
              />
              <label htmlFor="billable_box" className="text-xs font-semibold text-slate-600 cursor-pointer">
                The transaction value is billable back to the Client
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Transaction Items Builder */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
        <div className="px-5 py-3 border-b border-slate-150 bg-slate-50 text-xs font-extrabold text-[#1E2D5A] uppercase tracking-wider">
          PARTICULARS & EXPENSE BREAKDOWN
        </div>
        
        {/* Flat builder tools */}
        <div className="p-4 bg-slate-50/50 border-b border-slate-150 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
          <div className="sm:col-span-3 flex flex-col gap-1">
            <label className="text-[10px] uppercase font-bold text-slate-500 select-none">Date</label>
            <input
              type="date"
              value={lineDate}
              onChange={(e) => setLineDate(e.target.value)}
              className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.8 text-slate-800 focus:outline-hidden"
            />
          </div>
          <div className="sm:col-span-6 flex flex-col gap-1">
            <label className="text-[10px] uppercase font-bold text-slate-500 select-none">Detailed Description & Purpose of Transaction</label>
            <input
              type="text"
              placeholder="e.g. Remote cloud server subscriptions - AWS AWS7"
              value={lineDesc}
              onChange={(e) => setLineDesc(e.target.value)}
              className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.8 text-slate-800 focus:outline-hidden"
            />
          </div>
          <div className="sm:col-span-2 flex flex-col gap-1">
            <label className="text-[10px] uppercase font-bold text-slate-500 select-none">Amount</label>
            <input
              type="number"
              placeholder="0.00"
              value={lineAmt}
              onChange={(e) => setLineAmt(e.target.value)}
              className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.8 text-slate-800 focus:outline-hidden font-mono"
            />
          </div>
          <button
            type="button"
            onClick={addLineItem}
            className="sm:col-span-1 flex items-center justify-center p-2 rounded-lg bg-[#1E2D5A] text-white hover:bg-[#2b3c72] transition shadow-3xs cursor-pointer h-9 w-full sm:w-auto"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        {/* Existing ledger items list */}
        {lineItems.length === 0 ? (
          <div className="p-10 text-center text-slate-400 italic text-xs">
            No particulars active. Add at least one transaction row using the tools above.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left col-collapse border-b border-slate-100">
              <thead>
                <tr className="border-b border-slate-150 bg-slate-50/50 text-slate-500 font-bold text-[10px] uppercase select-none">
                  <th className="px-5 py-2">Date</th>
                  <th className="px-5 py-2">Detailed Description & Purpose of Transaction</th>
                  <th className="px-5 py-2 text-right">Amount</th>
                  <th className="px-5 py-2 text-center h-4 w-12">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {lineItems.map((li, index) => (
                  <tr key={index} className="hover:bg-slate-50/20">
                    <td className="px-5 py-2.5 font-mono text-slate-500">{li.date}</td>
                    <td className="px-5 py-2.5 font-medium text-slate-700">{li.description}</td>
                    <td className="px-5 py-2.5 font-mono text-right font-bold text-slate-800">
                      ₱{Number(li.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-5 py-2.5 text-center">
                      <button
                        type="button"
                        onClick={() => removeLineItem(index)}
                        className="text-rose-500 hover:text-rose-600 hover:bg-rose-50 p-1.5 rounded-md transition cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-250 flex items-center justify-between text-xs">
          <span className="font-extrabold text-[#1E2D5A] uppercase tracking-wider">TOTAL DISBURSEMENT VALUE</span>
          <span className="font-bold text-lg text-slate-900 font-mono">
            ₱{displayedTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      <div className="flex flex-row items-center gap-3 mb-4">
        <button
          type="button"
          onClick={() => setHasSecondaryForm(!hasSecondaryForm)}
          className="self-start flex items-center justify-center gap-2 px-4 py-2 border border-slate-300 bg-white hover:bg-slate-50 text-[#1E2D5A] font-bold text-xs rounded-xl shadow-3xs cursor-pointer active:scale-95 transition"
        >
          {hasSecondaryForm ? <Trash2 className="w-4 h-4 text-rose-500" /> : <Plus className="w-4 h-4" />}
          {hasSecondaryForm ? 'REMOVE SECONDARY DISBURSEMENT FORM' : 'ADD SECONDARY DISBURSEMENT FORM'}
        </button>

        {hasSecondaryForm && (
          <button
            type="button"
            onClick={() => {
              setDepartment2(department);
              setClientName2(clientName);
              setBank2(bank);
              setBillable2(billable);
              setDate2(date);
              // Make a deepish copy of lineItems to prevent reference issues
              setLineItems2(lineItems.map(item => ({ ...item })));
            }}
            className="self-start flex items-center justify-center gap-2 px-4 py-2 border border-slate-300 bg-white hover:bg-slate-50 text-[#1E2D5A] font-bold text-xs rounded-xl shadow-3xs cursor-pointer active:scale-95 transition"
          >
            <Copy className="w-4 h-4" />
            DUPLICATE PRIMARY FORM
          </button>
        )}
      </div>

      {hasSecondaryForm && (
        <>
          {/* Secondary Form Metadata Deck */}
          <div className="bg-[#1E2D5A]/5 rounded-xl border border-[#1E2D5A]/20 p-5 grid grid-cols-1 md:grid-cols-2 gap-5 mb-6 relative">
            <div className="absolute -top-3 left-6 px-3 bg-[#f3f5f9] text-[10px] font-black uppercase text-[#1E2D5A] tracking-widest border border-[#1E2D5A]/20 rounded-full">
              Secondary Disbursement Form
            </div>
            {/* Left Grid Section */}
            <div className="flex flex-col gap-3.5 mt-2">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] uppercase tracking-wider font-extrabold text-[#1E2D5A] select-none">Client / Target Entity</label>
                <input
                  type="text"
                  placeholder="e.g. Acme Corp Inc"
                  value={clientName2}
                  onChange={(e) => setClientName2(e.target.value)}
                  className="text-xs bg-white border border-slate-200 hover:border-slate-300 focus:border-[#1E2D5A] rounded-lg px-3 py-2 text-slate-800 focus:outline-hidden transition shadow-3xs"
                  required
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] uppercase tracking-wider font-extrabold text-[#1E2D5A] select-none">Bank</label>
                <input
                  type="text"
                  placeholder="e.g. BDO - 006328035545"
                  value={bank2}
                  onChange={(e) => setBank2(e.target.value)}
                  className="text-xs bg-white border border-slate-200 hover:border-slate-300 focus:border-[#1E2D5A] rounded-lg px-3 py-2 text-slate-800 focus:outline-hidden transition shadow-3xs"
                  required
                />
              </div>
            </div>

            {/* Right Grid Section */}
            <div className="flex flex-col gap-3.5 mt-2">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] uppercase tracking-wider font-extrabold text-[#1E2D5A] select-none">Department</label>
                <select
                  value={department2}
                  onChange={(e) => setDepartment2(e.target.value)}
                  className="text-xs bg-white border border-slate-200 hover:border-slate-300 focus:border-[#1E2D5A] rounded-lg px-3 py-2 text-slate-800 focus:outline-hidden transition shadow-3xs cursor-pointer"
                >
                  <option value="Accounting">Accounting</option>
                  <option value="Corporate">Corporate</option>
                  <option value="CAVD">CAVD</option>
                  <option value="Litigation">Litigation</option>
                  <option value="CCT">CCT</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] uppercase tracking-wider font-extrabold text-[#1E2D5A] select-none">Date Requested</label>
                <input
                  type="date"
                  value={date2}
                  onChange={(e) => setDate2(e.target.value)}
                  className="text-xs bg-white border border-slate-200 hover:border-slate-300 focus:border-[#1E2D5A] rounded-lg px-3 py-2 text-slate-800 focus:outline-hidden transition shadow-3xs"
                />
              </div>

              <div className="flex flex-col gap-1 select-none">
                <label className="text-[11px] uppercase tracking-wider font-extrabold text-[#1E2D5A] opacity-0 h-0">Billable space</label>
                <div className="flex items-center gap-3 px-3 py-2 bg-white border border-slate-200 rounded-lg shadow-3xs">
                  <input
                    type="checkbox"
                    id="billable_box2"
                    checked={billable2}
                    onChange={(e) => setBillable2(e.target.checked)}
                    className="w-4.5 h-4.5 text-[#1E2D5A] border-slate-300 rounded focus:ring-[#1E2D5A] cursor-pointer"
                  />
                  <label htmlFor="billable_box2" className="text-xs font-semibold text-slate-600 cursor-pointer">
                    The transaction value is billable back to the Client
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Secondary Form Items Builder */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col mb-6">
            <div className="px-5 py-3 border-b border-slate-150 bg-slate-50 text-xs font-extrabold text-[#1E2D5A] uppercase tracking-wider">
              SECONDARY PARTICULARS & EXPENSE BREAKDOWN
            </div>
            
            {/* Flat builder tools */}
            <div className="p-4 bg-slate-50/50 border-b border-slate-150 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
              <div className="sm:col-span-3 flex flex-col gap-1">
                <label className="text-[10px] uppercase font-bold text-slate-500 select-none">Date</label>
                <input
                  type="date"
                  value={lineDate2}
                  onChange={(e) => setLineDate2(e.target.value)}
                  className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.8 text-slate-800 focus:outline-hidden"
                />
              </div>
              <div className="sm:col-span-6 flex flex-col gap-1">
                <label className="text-[10px] uppercase font-bold text-slate-500 select-none">Detailed Description & Purpose of Transaction</label>
                <input
                  type="text"
                  placeholder="e.g. Secondary server subscriptions"
                  value={lineDesc2}
                  onChange={(e) => setLineDesc2(e.target.value)}
                  className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.8 text-slate-800 focus:outline-hidden"
                />
              </div>
              <div className="sm:col-span-2 flex flex-col gap-1">
                <label className="text-[10px] uppercase font-bold text-slate-500 select-none">Amount</label>
                <input
                  type="number"
                  placeholder="0.00"
                  value={lineAmt2}
                  onChange={(e) => setLineAmt2(e.target.value)}
                  className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.8 text-slate-800 focus:outline-hidden font-mono"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  if (lineDesc2.trim() && lineAmt2 && parseFloat(lineAmt2) > 0) {
                    if (lineItems2.length >= 8) { return setErrorMsg('Max 8 rows in secondary form'); }
                    setLineItems2([...lineItems2, { date: lineDate2, description: lineDesc2, amount: parseFloat(lineAmt2) }]);
                    setLineDesc2(''); setLineAmt2(''); setErrorMsg(null);
                  }
                }}
                className="sm:col-span-1 flex items-center justify-center p-2 rounded-lg bg-[#1E2D5A] text-white hover:bg-[#2b3c72] transition shadow-3xs cursor-pointer h-9 w-full sm:w-auto"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>

            {/* Existing secondary ledger items list */}
            {lineItems2.length === 0 ? (
              <div className="p-10 text-center text-slate-400 italic text-xs">
                No particulars active for secondary form.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left col-collapse border-b border-slate-100">
                  <thead>
                    <tr className="border-b border-slate-150 bg-slate-50/50 text-slate-500 font-bold text-[10px] uppercase select-none">
                      <th className="px-5 py-2">Date</th>
                      <th className="px-5 py-2">Detailed Description & Purpose of Transaction</th>
                      <th className="px-5 py-2 text-right">Amount</th>
                      <th className="px-5 py-2 text-center h-4 w-12">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {lineItems2.map((li, index) => (
                      <tr key={`sec-${index}`} className="hover:bg-slate-50/20">
                        <td className="px-5 py-2.5 font-mono text-slate-500">{li.date}</td>
                        <td className="px-5 py-2.5 font-medium text-slate-700">{li.description}</td>
                        <td className="px-5 py-2.5 font-mono text-right font-bold text-slate-800">
                          ₱{Number(li.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-5 py-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => setLineItems2(lineItems2.filter((_, idx) => idx !== index))}
                            className="text-rose-500 hover:text-rose-600 hover:bg-rose-50 p-1.5 rounded-md transition cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-250 flex items-center justify-between text-xs">
              <span className="font-extrabold text-[#1E2D5A] uppercase tracking-wider">SECONDARY FORM TOTAL</span>
              <span className="font-bold text-lg text-slate-900 font-mono">
                ₱{(lineItems2.reduce((acc, curr) => acc + curr.amount, 0) + (parseFloat(lineAmt2) || 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </>
      )}

      {/* 4. Document Submission Verification Box */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start mt-2">
        
        {/* Left: signature and explanation columns */}
        <div className="md:col-span-7 flex flex-col gap-4">
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
            <h4 className="text-xs font-bold text-slate-700 uppercase flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-amber-500" /> Integrity sign-off policy
            </h4>
            <p className="text-[11px] text-slate-600/90 leading-relaxed mt-1.5">
              By drawing your signature or submitting this Payment Request Form (PRF), you verify that the expenses described are authentic disbursements conducted on behalf of STLAF and its relevant client structures.
            </p>
          </div>

          {/* Canvas Signator */}
          <div className="flex flex-col gap-4">
            {currentUser?.signatureUrl ? (
              <div className="flex items-center gap-3 p-4 border border-emerald-200 bg-emerald-50 rounded-xl">
                <span className="p-1.5 bg-emerald-100 text-emerald-700 rounded-full">
                  <CheckCircle className="w-5 h-5" />
                </span>
                <div className="text-xs text-emerald-950 font-medium">
                  <span className="font-bold">Signature Verified:</span> Your user profile already contains an active authentic signature link. We will overlay it automatically as your primary signature.
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] uppercase tracking-widest font-extrabold text-[#1E2D5A] select-none">Authenticate Primary Signature Draw</label>
                <SignaturePad onSave={(b64) => setSignatureBase64(b64)} />
                {signatureBase64 && (
                  <div className="text-[10px] text-emerald-600 font-bold bg-emerald-50 border border-emerald-100 px-2 py-1 rounded-md mt-1 w-max">
                    ✓ Primary signature drawn and applied.
                  </div>
                )}
              </div>
            )}
            
            {hasSecondaryForm && (
              <div className="mt-2 flex flex-col gap-1.5 border-t border-slate-200 pt-4">
                <label className="text-[11px] uppercase tracking-widest font-extrabold text-[#1E2D5A] select-none">Authenticate Secondary Signature Draw (Dual Form Requirement)</label>
                <div className="p-2 border border-amber-250 bg-amber-50 text-amber-900 rounded-lg text-[11px] mb-1 leading-relaxed">
                  <strong>Secondary Signature Required:</strong> Since you have added a secondary disbursement form, you must draw a second signature for the second placeholder document.
                </div>
                <SignaturePad onSave={(b64) => setSignatureBase64_2(b64)} />
                {signatureBase64_2 && (
                  <div className="text-[10px] text-emerald-600 font-bold bg-emerald-50 border border-emerald-100 px-2 py-1 rounded-md mt-1 w-max">
                    ✓ Secondary signature drawn and applied.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: Submit actions columns */}
        <div className="md:col-span-5 flex flex-col gap-3">
          <div className="text-xs font-bold text-slate-500 border-b border-slate-200 pb-1 uppercase select-none">Action Controls</div>
          
          <button
            type="button"
            onClick={() => handleSubmit('submit')}
            disabled={isSubmitting}
            className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-[#1E2D5A] border border-[#1E2D5A] hover:bg-[#2e4073] active:scale-98 text-white rounded-xl text-xs font-black transition shadow-md disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <Send className="w-4 h-4" /> SUBMIT FOR APPROVAL
          </button>

          <button
            type="button"
            onClick={() => handleSubmit('draft')}
            disabled={isSubmitting || isPreviewLoading}
            className="w-full flex items-center justify-center gap-2 px-5 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 transition active:scale-98 text-slate-700 rounded-xl text-xs font-semibold shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <Save className="w-4 h-4" /> SAVE AS TEMPORARY DRAFT
          </button>
          
          <button
            type="button"
            onClick={handlePreviewDisbursement}
            disabled={isSubmitting || isPreviewLoading}
            className="w-full flex items-center justify-center gap-2 px-5 py-2.5 bg-slate-50 border border-slate-200 hover:bg-indigo-50 hover:text-indigo-700 transition active:scale-98 text-slate-700 rounded-xl text-xs font-semibold shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isPreviewLoading ? (
              <div className="w-4 h-4 border-2 border-slate-400 border-t-indigo-600 rounded-full animate-spin"></div>
            ) : null}
            PREVIEW DISBURSEMENT
          </button>
          
          <p className="text-[10px] text-slate-400 leading-normal text-center italic font-serif">
            Note: Saving as draft will protect edits locally but will not notify approvers or advance the voucher chain.
          </p>
        </div>
      </div>

      {/* 5. Embedded Web App Preview Mode */}
      {isPreviewMode && previewDoc && (
        <div className="mt-8 border border-slate-200 bg-white rounded-2xl shadow-3xs overflow-hidden flex flex-col">
          <div className="px-5 py-3 bg-[#1E2D5A] text-white flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-[10px] uppercase font-bold tracking-widest bg-amber-500 text-amber-950 px-2 py-0.5 rounded-sm select-none">Preview Mode</span>
              <span className="text-xs font-medium">Review your generated proposal below. Please click Satisfied to confirm.</span>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="text-xs flex flex-col items-end">
                <span className="text-[9px] uppercase tracking-wider text-indigo-200">Auto-Cancels In</span>
                <span className="font-mono font-bold text-sm tracking-wider">
                  {previewTimeLeft ? `${Math.floor(previewTimeLeft / 60)}:${String(previewTimeLeft % 60).padStart(2, '0')}` : '0:00'}
                </span>
              </div>
              
              <div className="h-8 border-l border-indigo-400/50 mx-2"></div>
              
              <button 
                type="button" 
                onClick={handleCancelPreview}
                className="text-xs font-bold text-rose-200 hover:text-white transition"
              >
                Cancel
              </button>
              
              <button
                type="button"
                onClick={handleSatisfiedPreview}
                className="text-xs font-bold bg-white text-[#1E2D5A] px-4 py-1.5 rounded-lg hover:bg-slate-100 transition shadow-sm cursor-pointer"
              >
                Satisfied
              </button>
            </div>
          </div>
          
          <div className="bg-slate-100 p-6 flex flex-col items-center border-t border-slate-200 relative">
            <div className="w-full text-center mb-3">
               <span className="text-[10px] uppercase font-extrabold tracking-widest text-[#1E2D5A] select-none">Generated Document Preview</span>
            </div>
            <div className="w-full h-screen max-h-[800px] border border-slate-300 rounded-lg shadow-sm bg-white overflow-hidden">
               <iframe 
                 src={previewDoc.url}
                 className="w-full h-full border-none"
                 title="Google Doc Preview"
               />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
