import { auth } from "@/auth";
import SignInButton from "@/components/auth/SignInButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { redirect } from "next/navigation";

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
          <SignInButton />
        </CardContent>
      </Card>
    </div>
  );
}
