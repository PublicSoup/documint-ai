import { DefaultSession } from "next-auth";

declare module "next-auth" {
    interface Session {
        user: {
            id: string;
            role?: string;
        } & DefaultSession["user"]
    }

    interface User {
        id: string;
        role?: string;
        password?: string | null;
    }
}

declare module "next-auth/jwt" {
    interface JWT {
        id: string;
        role?: string;
    }
}
