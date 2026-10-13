import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";

export default async function LoginPage() {
	const session = await auth();
	if (session?.user?.id) redirect("/");
	return <AuthForm />;
}
