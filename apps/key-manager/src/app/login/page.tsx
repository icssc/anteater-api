import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function LogIn() {
  const session = await auth();
  if (session) return redirect("/");

  return (
    <div className="flex items-center justify-center flex-0">
      <Card>
        <CardHeader>
          <CardTitle>Sign in to manage API keys</CardTitle>
        </CardHeader>
        <CardContent>
          <Button
            type="submit"
            onClick={async () => {
              "use server";
              await signIn("google");
            }}
          >
            Sign in with Google
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
