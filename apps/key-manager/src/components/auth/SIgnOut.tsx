"use client";

import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { LogOutIcon } from "lucide-react";
import { signOut } from "next-auth/react";

export default function SingOut() {
  function handleSignOut() {
    signOut({
      redirect: true,
      redirectTo: "/",
    });
  }

  return (
    <DropdownMenuItem onClick={handleSignOut} className={"cursor-pointer"}>
      <LogOutIcon />
      <span>Log Out</span>
    </DropdownMenuItem>
  );
}
