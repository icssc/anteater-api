"use client";

import { LogOutIcon } from "lucide-react";
import { signOut } from "next-auth/react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

export default function SignOut() {
  function handleSignOut() {
    signOut({
      redirect: true,
      redirectTo: "/login",
    });
  }

  return (
    <DropdownMenuItem onClick={handleSignOut} className={"cursor-pointer"}>
      <LogOutIcon />
      <span>Log Out</span>
    </DropdownMenuItem>
  );
}
