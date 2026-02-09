"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Download, FileText, Loader2, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Invoice {
    id: string;
    amount: number;
    currency: string;
    status: string;
    date: string;
    pdfUrl: string;
    number: string;
}

export default function InvoiceHistory() {
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchInvoices();
    }, []);

    const fetchInvoices = async () => {
        try {
            const res = await fetch("/api/billing/invoices");
            if (res.ok) {
                const data = await res.json();
                setInvoices(data.invoices || []);
            } else {
                setError("Failed to load invoices");
            }
        } catch (err) {
            setError("Could not connect to billing service");
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center p-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="text-center p-8 text-muted-foreground text-sm flex flex-col items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                {error}
            </div>
        );
    }

    if (invoices.length === 0) {
        return null; // Don't show if no invoices
    }

    return (
        <Card className="glass-card bg-black/40 border-white/5">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                    <FileText className="w-4 h-4 text-primary" />
                    Invoice History
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="space-y-1">
                    {invoices.map((invoice) => (
                        <div
                            key={invoice.id}
                            className="flex items-center justify-between p-3 rounded-lg hover:bg-white/5 transition-colors group"
                        >
                            <div className="flex items-center gap-4">
                                <div className="p-2 rounded bg-white/5 text-muted-foreground group-hover:text-white transition-colors">
                                    <FileText className="w-4 h-4" />
                                </div>
                                <div>
                                    <div className="font-medium text-white text-sm">{invoice.number}</div>
                                    <div className="text-xs text-muted-foreground">
                                        {format(new Date(invoice.date), "MMM d, yyyy")}
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="text-right">
                                    <div className="font-bold text-white text-sm">
                                        {(invoice.amount / 100).toLocaleString(undefined, {
                                            style: "currency",
                                            currency: invoice.currency.toUpperCase(),
                                        })}
                                    </div>
                                    <div className={`text-[10px] uppercase font-bold ${invoice.status === 'paid' ? 'text-green-400' : 'text-amber-400'}`}>
                                        {invoice.status}
                                    </div>
                                </div>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={() => window.open(invoice.pdfUrl, "_blank")}
                                >
                                    <Download className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
