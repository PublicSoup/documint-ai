import { redirect } from "next/navigation";

export default function DiagramsPage() {
  redirect("/dashboard?tab=architecture");
}
