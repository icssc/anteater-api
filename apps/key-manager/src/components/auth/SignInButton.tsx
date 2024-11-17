"use client";

import { Button } from "@/components/ui/button";
import { signIn } from "next-auth/react";

const SignInButton = () => (
  <Button type="submit" onClick={() => signIn("google", { redirectTo: "/" })} className={"w-full"}>
    Sign in with Google
  </Button>
);

export default SignInButton;
