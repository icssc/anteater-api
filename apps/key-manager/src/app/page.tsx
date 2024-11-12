import { auth, signIn } from "@/auth";
import ApiKeyManager from "@/components/ApiKeyManager";

export default async function Home() {
  const session = await auth();
  if (!session) return signIn();

  return <ApiKeyManager />;
}
