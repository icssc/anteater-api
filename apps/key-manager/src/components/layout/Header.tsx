import { auth, signOut } from "@/auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOutIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

const Header = async () => {
  const session = await auth();

  return (
    <header className={"px-6 my-4 flex justify-between items-center"}>
      <Link href={"/"} className={"text-3xl font-bold"}>
        Anteater API
      </Link>
      {session && session.user && (
        <DropdownMenu>
          <div className={"flex items-center space-x-4"}>
            {session.user.isAdmin && (
              <p className={"text-destructive text-xl select-none"}>ADMIN</p>
            )}
            <DropdownMenuTrigger className={"focus:outline-none"}>
              <Image
                className={"rounded-full"}
                width={40}
                height={40}
                src={session.user.image!}
                alt={session.user.email!}
              />
            </DropdownMenuTrigger>
          </div>
          <DropdownMenuContent align={"end"}>
            <DropdownMenuItem
              onClick={async () => {
                "use server";
                await signOut();
              }}
              className={"cursor-pointer"}
            >
              <LogOutIcon />
              <span>Log Out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </header>
  );
};

export default Header;
