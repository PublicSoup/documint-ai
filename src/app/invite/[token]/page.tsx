"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession, signIn } from "next-auth/react";
import { Loader2, CheckCircle, XCircle, Users, ArrowRight } from "lucide-react";
import Link from "next/link";

interface InviteDetails {
    teamName: string;
    email: string;
    role: string;
    expiresAt: string;
}

export default function AcceptInvitePage() {
    const { token } = useParams();
    const router = useRouter();
    const { data: session, status } = useSession();

    const [loading, setLoading] = useState(true);
    const [accepting, setAccepting] = useState(false);
    const [invite, setInvite] = useState<InviteDetails | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<{ teamName: string; teamId: string } | null>(null);

    useEffect(() => {
        const fetchInvite = async () => {
            try {
                const res = await fetch(`/api/invites/${token}`);
                const data = await res.json();

                if (res.ok) {
                    setInvite(data);
                } else {
                    setError(data.error || "Invalid invitation");
                }
            } catch {
                setError("Failed to load invitation");
            } finally {
                setLoading(false);
            }
        };

        if (token) fetchInvite();
    }, [token]);

    const handleAccept = async () => {
        setAccepting(true);
        try {
            const res = await fetch(`/api/invites/${token}`, {
                method: "POST"
            });
            const data = await res.json();

            if (res.ok) {
                setSuccess({ teamName: data.teamName, teamId: data.teamId });
            } else {
                setError(data.error || "Failed to accept invitation");
            }
        } catch {
            setError("Something went wrong");
        } finally {
            setAccepting(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-white" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <XCircle className="w-8 h-8 text-red-600" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">Invitation Error</h1>
                    <p className="text-gray-600 mb-6">{error}</p>
                    <Link
                        href="/"
                        className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        Go to Homepage
                    </Link>
                </div>
            </div>
        );
    }

    if (success) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckCircle className="w-8 h-8 text-green-600" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">Welcome to the Team!</h1>
                    <p className="text-gray-600 mb-6">
                        You've successfully joined <strong>{success.teamName}</strong>.
                    </p>
                    <button
                        onClick={() => router.push(`/dashboard?team=${success.teamId}`)}
                        className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        Go to Dashboard <ArrowRight className="w-4 h-4" />
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">
                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Users className="w-8 h-8 text-blue-600" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">Team Invitation</h1>
                    <p className="text-gray-600">
                        You've been invited to join a team on DocuMint AI
                    </p>
                </div>

                {invite && (
                    <div className="bg-gray-50 rounded-xl p-4 mb-6 space-y-3">
                        <div className="flex justify-between">
                            <span className="text-gray-500">Team</span>
                            <span className="font-semibold text-gray-900">{invite.teamName}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-500">Role</span>
                            <span className="font-medium text-blue-600">{invite.role}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-500">Invited Email</span>
                            <span className="text-gray-700">{invite.email}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-500">Expires</span>
                            <span className="text-gray-700">
                                {new Date(invite.expiresAt).toLocaleDateString()}
                            </span>
                        </div>
                    </div>
                )}

                {status === "loading" ? (
                    <div className="flex justify-center py-4">
                        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                    </div>
                ) : session ? (
                    <div className="space-y-4">
                        <p className="text-sm text-gray-600 text-center">
                            Logged in as <strong>{session.user?.email}</strong>
                        </p>
                        <button
                            onClick={handleAccept}
                            disabled={accepting}
                            className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {accepting ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Joining Team...
                                </>
                            ) : (
                                <>
                                    Accept Invitation
                                    <ArrowRight className="w-4 h-4" />
                                </>
                            )}
                        </button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <p className="text-sm text-gray-600 text-center">
                            Please sign in to accept this invitation
                        </p>
                        <button
                            onClick={() => signIn(undefined, { callbackUrl: window.location.href })}
                            className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                        >
                            Sign In to Continue
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
