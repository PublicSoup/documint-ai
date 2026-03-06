"use client";

import { useEffect, useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Users, Loader2, X, AlertTriangle } from "lucide-react";
import { createTeam, type FormState } from "@/app/dashboard/actions";

interface CreateTeamModalProps {
  onClose: () => void;
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {pending && <Loader2 className="w-4 h-4 animate-spin" />}
      {pending ? "Creating..." : "Create Team"}
    </button>
  );
}

export default function CreateTeamModal({ onClose }: CreateTeamModalProps) {
  const initialState: FormState = { message: "", success: false };
  const [state, formAction] = useFormState(createTeam, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      onClose();
    }
  }, [state.success, onClose]);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in-fast">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-zoom-in-fast">
        <div className="p-6 border-b flex justify-between items-center bg-gray-50">
          <h3 className="font-bold text-zinc-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" />
            Create New Team
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form ref={formRef} action={formAction} className="p-6 space-y-4">
          {!state.success && state.message && (
            <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {state.message}
            </div>
          )}

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Team Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="e.g. Acme Corp Engineering"
              required
              minLength={2}
              maxLength={100}
            />
            <p className="text-xs text-gray-400 mt-1">
              This will create a shared workspace for your team.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium"
            >
              Cancel
            </button>
            <SubmitButton />
          </div>
        </form>
      </div>
    </div>
  );
}
