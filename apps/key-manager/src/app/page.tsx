import { CopyIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { auth, signIn } from "@/auth";

export default async function Home() {
  const session = await auth();
  if (!session) return signIn();

  const key = "TheQuickBrownFoxJumpedOverTheLazyDog1234567890";

  return (
    <div className=" max-w-3xl mx-auto p-6 space-y-2">
      <h1 className={"text-3xl"}>Your API Key</h1>
      <hr />
      <div
        className={"bg-gray-800 p-2 rounded flex items-center justify-between"}
      >
        <pre className={"overflow-hidden"}>{key}</pre>
        <CopyIcon className={"cursor-pointer"} />
      </div>
      <Button variant={"destructive"}>Delete Key</Button>
    </div>
  );
}
