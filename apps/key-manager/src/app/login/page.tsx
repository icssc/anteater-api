import { auth, signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { redirect } from "next/navigation";

export default async function LogIn() {
  const session = await auth();
  if (session) return redirect("/");

  return (
    <div className="flex items-center justify-center flex-0">
      <Card>
        <CardHeader className="text-center">
          <CardTitle>Sign in to manage API keys</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          <Button
            type="submit"
            onClick={async () => {
              "use server";
              await signIn("icssc");
            }}
            className={"w-full"}
          >
            Sign in with ICSSC
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
