import { redirect } from "next/navigation";

// Legacy signin page — redirect to the canonical login page
export default function SignInRedirect() {
    redirect("/auth/login");
}
