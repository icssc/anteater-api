import { auth, signIn } from "@/auth";
import ApiKeyManager from "@/components/ApiKeyManager";
import { SessionProvider } from "next-auth/react";

export default async function Home() {
  const session = await auth();
  if (!session) return signIn();

  return (
    <SessionProvider>
      <ApiKeyManager />
    </SessionProvider>
  );
}
