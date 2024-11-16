import { auth, signIn } from "@/auth";
import KeyManager from "@/components/key/KeyManager";

export default async function Home() {
  const session = await auth();
  if (!session) {
    return signIn();
  }

  return <KeyManager />;
}
