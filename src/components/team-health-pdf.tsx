"use client";

import { useState } from "react";
import { FileDown, Loader2, FileText, CheckCircle2, AlertTriangle, ShieldCheck } from "lucide-react";
import { Button } from "./ui/button";
import { useToast } from "./toast";

export function TeamHealthPDFExport({ teamId, teamName }: { teamId: string, teamName: string }) {
    const { toast } = useToast();
    const [exporting, setExporting] = useState(false);

    const handleExport = async () => {
        setExporting(true);
        try {
            // 1. Fetch data
            const res = await fetch(`/api/teams/${teamId}/health-data`);
            if (!res.ok) throw new Error("Failed to fetch report data");
            const data = await res.json();

            // 2. Dynamic import html2pdf
            // @ts-ignore
            const html2pdf = (await import("html2pdf.js")).default;

            // 3. Create report HTML element
            const element = document.createElement("div");
            element.style.padding = "40px";
            element.style.fontFamily = "Arial, sans-serif";
            element.style.color = "#333";
            element.style.backgroundColor = "white";
            
            element.innerHTML = `
                <div style="border-bottom: 4px solid #4f46e5; padding-bottom: 20px; margin-bottom: 30px;">
                    <h1 style="margin: 0; color: #111; font-size: 28px;">Documentation Health Report</h1>
                    <p style="margin: 5px 0 0; color: #666; font-size: 14px;">${teamName} • ${new Date().toLocaleDateString()}</p>
                </div>

                <div style="display: flex; justify-content: space-between; margin-bottom: 40px; gap: 20px;">
                    <div style="flex: 1; padding: 20px; background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; text-align: center;">
                        <div style="font-size: 12px; color: #64748b; font-weight: bold; text-transform: uppercase;">Coverage</div>
                        <div style="font-size: 32px; font-weight: 800; color: #4f46e5;">${data.stats.coverage}%</div>
                        <div style="font-size: 11px; color: #94a3b8;">Target: ${data.stats.coverageGoal}%</div>
                    </div>
                    <div style="flex: 1; padding: 20px; background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; text-align: center;">
                        <div style="font-size: 12px; color: #64748b; font-weight: bold; text-transform: uppercase;">Verified</div>
                        <div style="font-size: 32px; font-weight: 800; color: #10b981;">${data.stats.verifiedCount}</div>
                        <div style="font-size: 11px; color: #94a3b8;">Of ${data.stats.documentedFiles} docs</div>
                    </div>
                    <div style="flex: 1; padding: 20px; background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; text-align: center;">
                        <div style="font-size: 12px; color: #64748b; font-weight: bold; text-transform: uppercase;">Stale</div>
                        <div style="font-size: 32px; font-weight: 800; color: ${data.stats.staleCount > 0 ? '#ef4444' : '#10b981'};">${data.stats.staleCount}</div>
                        <div style="font-size: 11px; color: #94a3b8;">Out of sync</div>
                    </div>
                </div>

                <h2 style="font-size: 18px; border-bottom: 1px solid #eee; padding-bottom: 10px; margin-bottom: 20px;">File Inventory (${data.files.length})</h2>
                <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 40px;">
                    <thead>
                        <tr style="background: #f1f5f9; text-align: left;">
                            <th style="padding: 10px; border-bottom: 1px solid #e2e8f0;">Filename</th>
                            <th style="padding: 10px; border-bottom: 1px solid #e2e8f0;">Lang</th>
                            <th style="padding: 10px; border-bottom: 1px solid #e2e8f0;">Status</th>
                            <th style="padding: 10px; border-bottom: 1px solid #e2e8f0;">Verified</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.files.map((f: any) => `
                            <tr>
                                <td style="padding: 10px; border-bottom: 1px solid #f1f5f9;">${f.name}</td>
                                <td style="padding: 10px; border-bottom: 1px solid #f1f5f9;">${f.lang}</td>
                                <td style="padding: 10px; border-bottom: 1px solid #f1f5f9;">
                                    <span style="color: ${f.status === 'APPROVED' ? '#10b981' : f.status === 'REVIEW' ? '#3b82f6' : '#f59e0b'}">${f.status}</span>
                                </td>
                                <td style="padding: 10px; border-bottom: 1px solid #f1f5f9;">${f.isVerified ? '✅' : '—'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>

                ${data.criticalUndocumented.length > 0 ? `
                    <h2 style="font-size: 18px; color: #ef4444; border-bottom: 1px solid #fee2e2; padding-bottom: 10px; margin-bottom: 20px;">Critical Documentation Debt</h2>
                    <div style="background: #fef2f2; border-radius: 12px; border: 1px solid #fee2e2; padding: 20px;">
                        <p style="font-size: 13px; color: #991b1b; margin-top: 0; margin-bottom: 15px; font-weight: bold;">
                            The following high-complexity components are missing documentation and represent significant technical risk:
                        </p>
                        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                            <thead>
                                <tr style="text-align: left; color: #991b1b; border-bottom: 1px solid #fee2e2;">
                                    <th style="padding: 8px;">Component</th>
                                    <th style="padding: 8px;">Size (Bytes)</th>
                                    <th style="padding: 8px;">Impact</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${data.criticalUndocumented.map((f: any) => `
                                    <tr>
                                        <td style="padding: 8px; border-bottom: 1px solid #fecaca; font-family: monospace;">${f.name}</td>
                                        <td style="padding: 8px; border-bottom: 1px solid #fecaca;">${f.size.toLocaleString()}</td>
                                        <td style="padding: 8px; border-bottom: 1px solid #fecaca; font-weight: bold;">HIGH</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                ` : ''}

                <div style="margin-top: 50px; padding: 20px; background: #fffbeb; border-radius: 8px; border: 1px solid #fde68a;">
                    <h3 style="margin-top: 0; font-size: 14px; color: #92400e;">Security & Compliance Note</h3>
                    <p style="font-size: 11px; color: #b45309; margin-bottom: 0;">
                        This report was generated by DocuMint AI. All verification actions are recorded in the immutable audit trail with SHA-256 integrity hashing.
                    </p>
                </div>
            `;

            // 4. Options
            const opt = {
                margin: 10,
                filename: `${teamName.toLowerCase().replace(/\s+/g, '-')}-health-report.pdf`,
                image: { type: 'jpeg' as const, quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true },
                jsPDF: { unit: 'mm' as const, format: 'a4' as const, orientation: 'portrait' as const }
            };

            // 5. Generate and save
            await html2pdf().set(opt).from(element).save();
            toast("Report exported successfully", "success");

        } catch (error) {
            console.error(error);
            toast("Failed to export PDF", "error");
        } finally {
            setExporting(false);
        }
    };

    return (
        <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={exporting}
            className="h-8 text-[10px] font-bold gap-2 bg-white/5 hover:bg-white/10 border-white/10"
        >
            {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
            Export Health PDF
        </Button>
    );
}
