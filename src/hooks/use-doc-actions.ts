import { useState } from "react";
import { useToast } from "@/components/toast";

import { DocContent, DocEntity } from "@/components/doc-editor";

export function useDocActions(fileId: string, currentUser?: { id: string; role: string }) {
    const { toast } = useToast();
    
    // Action states
    const [isSaving, setIsSaving] = useState(false);
    const [isRegenerating, setIsRegenerating] = useState(false);
    const [regeneratingEntity, setRegeneratingEntity] = useState<number | null>(null);
    const [verifying, setVerifying] = useState(false);
    const [isApproving, setIsApproving] = useState(false);
    const [sharing, setSharing] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [translating, setTranslating] = useState(false);
    const [personaLoading, setPersonaLoading] = useState(false);

    const handleSaveDoc = async (content: DocContent, onSuccess: () => void) => {
        setIsSaving(true);
        try {
            const res = await fetch(`/api/docs/${fileId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.message || "Failed to save");
            }
            onSuccess();
        } catch (error: any) {
            console.error("Save error:", error);
            toast(error.message || "Failed to save changes", "error");
        } finally {
            setIsSaving(false);
        }
    };

    const handleRegenerateFull = async (onSuccess: (data: any) => void) => {
        setIsRegenerating(true);
        try {
            const res = await fetch(`/api/regenerate/${fileId}`, { method: "POST" });
            if (!res.ok) throw new Error("Failed to regenerate");
            const data = await res.json();
            onSuccess(data);
        } catch (error) {
            console.error("Regenerate error:", error);
            toast("Failed to regenerate documentation. AI service error.", "error");
        } finally {
            setIsRegenerating(false);
        }
    };

    const handleRegenerateEntity = async (index: number, entity: any, fileLanguage: string, onSuccess: (newDoc: string) => void) => {
        setRegeneratingEntity(index);
        try {
            const res = await fetch(`/api/regenerate-entity`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    code: entity.code,
                    language: fileLanguage,
                    type: entity.type,
                    name: entity.name,
                    fileId
                }),
            });

            if (!res.ok) throw new Error("Failed to regenerate entity");
            const data = await res.json();
            if (data.doc) onSuccess(data.doc);
        } catch (error) {
            console.error("Regenerate entity error:", error);
            toast("Failed to regenerate. AI service error.", "error");
        } finally {
            setRegeneratingEntity(null);
        }
    };

    const handleVerify = async (onSuccess: (verified: boolean, verifiedAt: string, verifiedById: string) => void) => {
        setVerifying(true);
        try {
            const res = await fetch(`/api/docs/${fileId}/verify`, { method: "POST" });
            const data = await res.json();
            if (res.ok) {
                onSuccess(data.verified, data.verifiedAt, data.verifiedById);
                toast(data.verified ? "Documentation verified!" : "Verification removed", "success");
            } else {
                toast("Verification failed", "error");
            }
        } catch (error) {
            console.error(error);
            toast("Error verifying document", "error");
        } finally {
            setVerifying(false);
        }
    };

    const handleShareToggle = async (isPublic: boolean, onSuccess: (isPublic: boolean) => void) => {
        setSharing(true);
        try {
            const res = await fetch(`/api/docs/${fileId}/share`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isPublic: !isPublic }),
            });
            const data = await res.json();

            if (res.ok) {
                onSuccess(data.isPublic);
                if (data.isPublic) {
                    navigator.clipboard.writeText(data.url);
                    toast("Link copied to clipboard! Document is now public.", "success");
                } else {
                    toast("Document is now private.", "success");
                }
            } else {
                toast(data.message || data.error || "Failed to update share settings", "error");
            }
        } catch (error) {
            console.error(error);
            toast("Error updating share settings", "error");
        } finally {
            setSharing(false);
        }
    };

    const handleApprove = async (onSuccess: (verifiedAt: string, verifiedById: string) => void) => {
        setIsApproving(true);
        try {
            const res = await fetch(`/api/docs/${fileId}/approve`, { method: "POST" });
            const data = await res.json();
            if (res.ok) {
                onSuccess(data.verifiedAt, currentUser?.id || "");
                toast("Documentation approved!", "success");
            } else {
                toast(data.error || "Approval failed", "error");
            }
        } catch (error) {
            console.error(error);
            toast("Error approving document", "error");
        } finally {
            setIsApproving(false);
        }
    };

    const handleRequestReview = async (content: DocContent, onSuccess: (status: string) => void) => {
        setIsSaving(true);
        try {
            const res = await fetch(`/api/docs/${fileId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content, status: "REVIEW" }),
            });
            if (res.ok) {
                const data = await res.json();
                onSuccess(data.status);
                toast("Review requested!", "success");
            } else {
                toast("Failed to request review", "error");
            }
        } catch (error) {
            console.error(error);
            toast("Error requesting review", "error");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteDoc = async (onSuccess: () => void) => {
        if (!confirm("Are you sure you want to delete this documentation? The source code will remain, but all AI-generated content and history for this file will be permanently removed.")) {
            return;
        }

        setIsDeleting(true);
        try {
            const res = await fetch(`/api/docs/${fileId}`, { method: "DELETE" });
            if (res.ok) {
                toast("Documentation deleted", "success");
                onSuccess();
            } else {
                const data = await res.json();
                toast(data.message || "Failed to delete documentation", "error");
            }
        } catch (error) {
            console.error("Delete error:", error);
            toast("An unexpected error occurred", "error");
        } finally {
            setIsDeleting(false);
        }
    };

    const handleTranslate = async (content: DocContent, currentLang: string, targetLang: string, onSuccess: (newContent: DocContent, newLang: string) => void) => {
        if (targetLang === currentLang) return;
        setTranslating(true);
        try {
            const summaryRes = await fetch("/api/translate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: content.summary || "", targetLang })
            });

            if (!summaryRes.ok) {
                toast("Translation failed", "error");
                return;
            }

            const summaryData = await summaryRes.json();

            const translatedEntities = await Promise.all(
                (content.entities || []).map(async (entity) => {
                    if (!entity.doc) return entity;
                    try {
                        const entityRes = await fetch("/api/translate", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ text: entity.doc, targetLang })
                        });
                        if (!entityRes.ok) return entity;
                        const entityData = await entityRes.json();
                        return { ...entity, doc: entityData.translatedText || entity.doc };
                    } catch {
                        return entity;
                    }
                })
            );

            onSuccess({
                ...content,
                summary: summaryData.translatedText || content.summary,
                entities: translatedEntities
            }, targetLang);
        } catch (e) {
            console.error(e);
            toast("Error translating", "error");
        } finally {
            setTranslating(false);
        }
    };

    const handlePersonaExplain = async (persona: string, onSuccess: (text: string) => void) => {
        setPersonaLoading(true);
        try {
            const res = await fetch("/api/explain", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ fileId, persona }),
            });

            if (res.ok) {
                const data = await res.json();
                onSuccess(data.explanation);
            } else {
                onSuccess("Failed to generate explanation.");
            }
        } catch {
            onSuccess("Error generating explanation.");
        } finally {
            setPersonaLoading(false);
        }
    };

    return {
        isSaving, isRegenerating, regeneratingEntity, verifying, isApproving, sharing, isDeleting, translating, personaLoading,
        handleSaveDoc, handleRegenerateFull, handleRegenerateEntity, handleVerify, handleShareToggle, handleApprove, handleRequestReview, handleDeleteDoc, handleTranslate, handlePersonaExplain
    };
}
