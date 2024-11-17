"use client";

import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { LogOutIcon } from "lucide-react";
import { signOut } from "next-auth/react";

const SignOutButton = () => (
  <DropdownMenuItem onClick={() => signOut({ redirectTo: "/login" })} className={"cursor-pointer"}>
    <LogOutIcon />
    <span>Log Out</span>
  </DropdownMenuItem>
);

export default SignOutButton;
