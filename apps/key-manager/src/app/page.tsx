import KeyManager from "@/components/key/KeyManager";
import {auth, signIn} from "@/auth";

export default async function Home() {
  const session = await auth();
  if (!session) {
    return signIn();
  }

  return (
      <KeyManager />
  );
}
