import { getProviders, signIn } from "next-auth/react";

export default function OAuthSignin() {
    return (
        <div className="flex flex-col space-y-2">
            <button
                onClick={() => signIn("auth0")}
                className="flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
            >
                Sign in with Auth0
            </button>
        </div>
    );
}
