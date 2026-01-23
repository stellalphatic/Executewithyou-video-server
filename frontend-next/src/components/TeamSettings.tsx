'use client';


import React, { useState } from 'react';
import { 
    CreditCard, Users, HardDrive, Clock, Info, 
    MapPin, FileText, Edit2, CheckCircle2, AlertCircle,
    Download, Plus, Loader2, ArrowUpRight, Search, Filter,
    ChevronDown
} from 'lucide-react';
import { Button } from './Button';
import { Invoice, PaymentMethod } from '@/types';

interface TeamSettingsProps {
    onNavigateToPricing: () => void;
}

export const TeamSettings: React.FC<TeamSettingsProps> = ({ onNavigateToPricing }) => {
    const [activeTab, setActiveTab] = useState<'general' | 'billing' | 'invoices'>('billing');
    const [isUpdatingPayment, setIsUpdatingPayment] = useState(false);
    const [invoiceSearch, setInvoiceSearch] = useState('');
    const [invoiceFilter, setInvoiceFilter] = useState<'all' | 'paid' | 'pending'>('all');
    const [downloadingId, setDownloadingId] = useState<string | null>(null);
    
    // Mock Data
    const invoices: Invoice[] = [
        { id: 'INV-2024-001', date: 'Oct 01, 2024', amount: '$29.00', status: 'paid', pdfUrl: '#' },
        { id: 'INV-2024-002', date: 'Sep 01, 2024', amount: '$29.00', status: 'paid', pdfUrl: '#' },
        { id: 'INV-2024-003', date: 'Aug 01, 2024', amount: '$29.00', status: 'paid', pdfUrl: '#' },
        { id: 'INV-2024-004', date: 'Jul 01, 2024', amount: '$29.00', status: 'pending', pdfUrl: '#' },
    ];

    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>({
        brand: 'Visa',
        last4: '4242',
        expiry: '12/25'
    });

    const [billingInfo, setBillingInfo] = useState({
        name: 'ALLSTRM Inc.',
        address: '123 Stream Ave, Tech City',
        country: 'Pakistan'
    });

    const [isEditingBilling, setIsEditingBilling] = useState(false);
    const [isSavingBilling, setIsSavingBilling] = useState(false);

    const handleSaveBilling = (e: React.FormEvent) => {
        e.preventDefault();
        setIsSavingBilling(true);
        setTimeout(() => {
            setIsSavingBilling(false);
            setIsEditingBilling(false);
        }, 1000);
    };

    const handleDownloadInvoice = (id: string) => {
        setDownloadingId(id);
        setTimeout(() => {
            setDownloadingId(null);
            // In real app, trigger download here
        }, 1500);
    };

    const filteredInvoices = invoices.filter(inv => {
        const matchesSearch = inv.id.toLowerCase().includes(invoiceSearch.toLowerCase());
        const matchesFilter = invoiceFilter === 'all' || inv.status === invoiceFilter;
        return matchesSearch && matchesFilter;
    });

    return (
        <div className="flex-1 flex flex-col h-full relative animate-fade-in bg-app-bg">
             {/* Header */}
             <header className="h-20 border-b border-app-border flex items-center justify-between px-8 bg-app-bg/80 backdrop-blur-xl z-10 shrink-0">
                <div>
                    <h1 className="text-xl font-bold tracking-tight text-content-high">Team settings</h1>
                    <div className="flex items-center gap-2 text-[10px] font-mono text-content-medium uppercase tracking-widest mt-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-app-accent" />
                        <span>Configuration</span>
                        <span className="text-content-low">|</span>
                        <span>My Team</span>
                    </div>
                </div>
            </header>

            {/* Tab Navigation */}
            <div className="px-8 border-b border-app-border bg-app-bg sticky top-0 z-10 flex gap-8">
                {['general', 'billing', 'invoices'].map((tab) => (
                    <button 
                        key={tab}
                        onClick={() => setActiveTab(tab as any)}
                        className={`py-4 text-sm font-medium border-b-2 transition-colors capitalize ${activeTab === tab ? 'border-indigo-500 text-indigo-500' : 'border-transparent text-content-medium hover:text-content-high'}`}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                <div className="max-w-3xl space-y-8 animate-slide-up">
                    
                    {activeTab === 'billing' && (
                        <>
                            {/* Plan Section */}
                            <section className="bg-app-surface/30 border border-app-border rounded-xl p-6 shadow-sm">
                                <div className="flex justify-between items-start mb-6">
                                    <div>
                                        <h3 className="text-base font-bold text-content-high mb-1">Current Plan</h3>
                                        <p className="text-sm text-content-medium">You are currently on the <span className="text-indigo-400 font-semibold">Pro Plan</span>.</p>
                                    </div>
                                    <div className="px-3 py-1 bg-indigo-500/10 rounded-full border border-indigo-500/20 text-indigo-500 text-xs font-bold uppercase tracking-wider">
                                        Active
                                    </div>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-4 mb-6">
                                    <div className="p-4 bg-app-bg border border-app-border rounded-lg">
                                        <div className="text-xs text-content-medium uppercase font-bold mb-2">Next Payment</div>
                                        <div className="text-lg font-bold text-content-high">$29.00 <span className="text-sm font-normal text-content-medium">on Nov 1, 2024</span></div>
                                    </div>
                                    <div className="p-4 bg-app-bg border border-app-border rounded-lg">
                                        <div className="text-xs text-content-medium uppercase font-bold mb-2">Payment Interval</div>
                                        <div className="text-lg font-bold text-content-high">Monthly</div>
                                    </div>
                                </div>

                                <div className="flex gap-3">
                                    <Button onClick={onNavigateToPricing} className="bg-content-high text-app-bg hover:bg-content-medium">
                                        Manage Plan
                                    </Button>
                                    <Button variant="secondary" onClick={onNavigateToPricing}>
                                        Add Seats
                                    </Button>
                                </div>
                            </section>

                            {/* Resource Usage */}
                            <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="bg-app-surface/30 border border-app-border rounded-xl p-6">
                                    <div className="flex justify-between items-center mb-4">
                                        <div className="flex items-center gap-2">
                                            <Users className="w-4 h-4 text-indigo-500" />
                                            <h3 className="text-sm font-bold text-content-high">Seats</h3>
                                        </div>
                                        <span className="text-xs font-mono text-content-medium">3 / 5</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-app-surface rounded-full overflow-hidden mb-2">
                                        <div className="h-full bg-indigo-500 w-[60%] rounded-full" />
                                    </div>
                                    <p className="text-[10px] text-content-medium">2 seats remaining</p>
                                </div>

                                <div className="bg-app-surface/30 border border-app-border rounded-xl p-6">
                                    <div className="flex justify-between items-center mb-4">
                                        <div className="flex items-center gap-2">
                                            <HardDrive className="w-4 h-4 text-emerald-500" />
                                            <h3 className="text-sm font-bold text-content-high">Storage</h3>
                                        </div>
                                        <span className="text-xs font-mono text-content-medium">12GB / 100GB</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-app-surface rounded-full overflow-hidden mb-2">
                                        <div className="h-full bg-emerald-500 w-[12%] rounded-full" />
                                    </div>
                                    <p className="text-[10px] text-content-medium">88GB available</p>
                                </div>
                            </section>

                            {/* Payment Method */}
                            <section className="bg-app-surface/30 border border-app-border rounded-xl p-6">
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="text-sm font-bold text-content-high">Payment Method</h3>
                                    <Button variant="ghost" size="sm" className="text-indigo-500 hover:text-indigo-400" onClick={() => setIsUpdatingPayment(!isUpdatingPayment)}>
                                        Update
                                    </Button>
                                </div>
                                
                                <div className="flex items-center gap-4 p-4 bg-app-bg border border-app-border rounded-lg">
                                    <div className="w-12 h-8 bg-white rounded border border-gray-200 flex items-center justify-center">
                                        <span className="text-blue-600 font-bold italic text-xs">VISA</span>
                                    </div>
                                    <div className="flex-1">
                                        <div className="text-sm font-bold text-content-high">•••• •••• •••• {paymentMethod.last4}</div>
                                        <div className="text-xs text-content-medium">Expires {paymentMethod.expiry}</div>
                                    </div>
                                    <div className="px-2 py-1 bg-emerald-500/10 text-emerald-500 text-[10px] font-bold uppercase rounded border border-emerald-500/20">Default</div>
                                </div>

                                {isUpdatingPayment && (
                                    <div className="mt-4 p-4 border border-dashed border-app-border rounded-lg bg-app-bg/50 animate-fade-in">
                                        <p className="text-xs text-content-medium mb-3">Redirecting to secure payment processor...</p>
                                        <Button size="sm" isLoading={true} className="w-full">Connecting Stripe</Button>
                                    </div>
                                )}
                            </section>

                            {/* Billing Info Form */}
                            <section className="bg-app-surface/30 border border-app-border rounded-xl p-6">
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="text-sm font-bold text-content-high">Billing Details</h3>
                                    {!isEditingBilling && (
                                        <button onClick={() => setIsEditingBilling(true)} className="p-2 hover:bg-app-surface rounded text-content-medium hover:text-content-high transition-colors">
                                            <Edit2 className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>

                                {isEditingBilling ? (
                                    <form onSubmit={handleSaveBilling} className="space-y-4 animate-fade-in">
                                        <div>
                                            <label className="text-xs font-bold text-content-medium uppercase">Company Name</label>
                                            <input type="text" value={billingInfo.name} onChange={(e) => setBillingInfo({...billingInfo, name: e.target.value})} className="w-full bg-app-bg border border-app-border rounded-lg px-3 py-2 text-sm text-content-high mt-1 focus:border-indigo-500 outline-none" />
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-content-medium uppercase">Address</label>
                                            <input type="text" value={billingInfo.address} onChange={(e) => setBillingInfo({...billingInfo, address: e.target.value})} className="w-full bg-app-bg border border-app-border rounded-lg px-3 py-2 text-sm text-content-high mt-1 focus:border-indigo-500 outline-none" />
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-content-medium uppercase">Country</label>
                                            <input type="text" value={billingInfo.country} onChange={(e) => setBillingInfo({...billingInfo, country: e.target.value})} className="w-full bg-app-bg border border-app-border rounded-lg px-3 py-2 text-sm text-content-high mt-1 focus:border-indigo-500 outline-none" />
                                        </div>
                                        <div className="flex gap-2 justify-end pt-2">
                                            <Button type="button" variant="ghost" size="sm" onClick={() => setIsEditingBilling(false)}>Cancel</Button>
                                            <Button type="submit" size="sm" isLoading={isSavingBilling}>Save Changes</Button>
                                        </div>
                                    </form>
                                ) : (
                                    <div className="text-sm text-content-medium space-y-1">
                                        <p className="font-bold text-content-high">{billingInfo.name}</p>
                                        <p>{billingInfo.address}</p>
                                        <p>{billingInfo.country}</p>
                                    </div>
                                )}
                            </section>
                        </>
                    )}

                    {activeTab === 'invoices' && (
                        <div className="space-y-4">
                            {/* Toolbar */}
                            <div className="flex items-center gap-3">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-medium" />
                                    <input 
                                        type="text" 
                                        placeholder="Search invoice ID..." 
                                        className="w-full bg-app-surface/50 border border-app-border rounded-lg pl-9 pr-4 py-2 text-sm text-content-high focus:outline-none focus:border-indigo-500"
                                        value={invoiceSearch}
                                        onChange={(e) => setInvoiceSearch(e.target.value)}
                                    />
                                </div>
                                <div className="relative">
                                    <select 
                                        className="appearance-none bg-app-surface/50 border border-app-border rounded-lg pl-4 pr-10 py-2 text-sm text-content-high focus:outline-none focus:border-indigo-500 cursor-pointer"
                                        value={invoiceFilter}
                                        onChange={(e) => setInvoiceFilter(e.target.value as any)}
                                    >
                                        <option value="all">All Status</option>
                                        <option value="paid">Paid</option>
                                        <option value="pending">Pending</option>
                                    </select>
                                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-medium pointer-events-none" />
                                </div>
                            </div>

                            <section className="bg-app-surface/30 border border-app-border rounded-xl overflow-hidden shadow-sm">
                                <div className="grid grid-cols-12 px-6 py-4 bg-app-surface/50 border-b border-app-border text-xs font-bold text-content-medium uppercase tracking-wider">
                                    <div className="col-span-4">Invoice</div>
                                    <div className="col-span-3">Date</div>
                                    <div className="col-span-2">Amount</div>
                                    <div className="col-span-2">Status</div>
                                    <div className="col-span-1"></div>
                                </div>
                                <div className="divide-y divide-app-border/50">
                                    {filteredInvoices.length === 0 ? (
                                        <div className="p-8 text-center text-content-medium text-sm">
                                            No invoices found matching your criteria.
                                        </div>
                                    ) : (
                                        filteredInvoices.map((inv) => (
                                            <div key={inv.id} className="grid grid-cols-12 px-6 py-4 items-center hover:bg-app-surface/60 transition-colors group text-sm text-content-high cursor-default">
                                                <div className="col-span-4 font-medium flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded bg-app-surface border border-app-border flex items-center justify-center">
                                                        <FileText className="w-4 h-4 text-indigo-500" />
                                                    </div>
                                                    <span>{inv.id}</span>
                                                </div>
                                                <div className="col-span-3 text-content-medium">{inv.date}</div>
                                                <div className="col-span-2 font-mono">{inv.amount}</div>
                                                <div className="col-span-2">
                                                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                                                        inv.status === 'paid' 
                                                            ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' 
                                                            : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                                                    }`}>
                                                        {inv.status}
                                                    </span>
                                                </div>
                                                <div className="col-span-1 flex justify-end">
                                                    <button 
                                                        onClick={() => handleDownloadInvoice(inv.id)}
                                                        disabled={downloadingId === inv.id}
                                                        className="p-2 text-content-medium hover:text-indigo-500 transition-colors rounded-lg hover:bg-indigo-500/10 active:scale-95 disabled:opacity-50"
                                                        title="Download PDF"
                                                    >
                                                        {downloadingId === inv.id ? (
                                                            <Loader2 className="w-4 h-4 animate-spin" />
                                                        ) : (
                                                            <Download className="w-4 h-4" />
                                                        )}
                                                    </button>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </section>
                        </div>
                    )}

                    {activeTab === 'general' && (
                         <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in border border-dashed border-app-border rounded-xl">
                            <div className="w-16 h-16 rounded-full bg-app-surface border border-app-border flex items-center justify-center mb-6">
                                <AlertCircle className="w-8 h-8 text-content-low" />
                            </div>
                            <h3 className="text-lg font-bold text-content-high mb-2">General Settings</h3>
                            <p className="text-content-medium text-sm max-w-md">
                                Organization slug, logo, and public display settings. <br/>
                                <span className="text-indigo-500 cursor-pointer hover:underline">Read documentation</span>
                            </p>
                         </div>
                    )}
                </div>
            </div>
        </div>
    );
};
