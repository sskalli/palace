import { getSession } from "@/lib/http";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";

export default async function WorkspaceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
	const session = await getSession();

	if (!session?.user?.id) {
		redirect("/login");
	}

	return (
		<AppShell key={session.user.id} userId={session.user.id} email={session.user.email ?? ""}>
			{children}
		</AppShell>
	);
}
