import { headers } from "next/headers";
import { AuthForm } from "@/components/auth-form";
import { Workspace } from "@/components/workspace";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return <AuthForm />;
  return (
    <Workspace
      user={{
        name: session.user.name,
        email: session.user.email,
      }}
    />
  );
}
