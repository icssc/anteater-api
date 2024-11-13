import { auth, signOut } from "@/auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOutIcon } from "lucide-react";
import Image from "next/image";

const Header = async () => {
  const session = await auth();

  return (
    <header className={"px-6 my-4 flex justify-between items-center"}>
      <span className={"text-3xl font-bold"}>Anteater API</span>
      {session && session.user && (
        <DropdownMenu>
          <DropdownMenuTrigger className={"focus:outline-none"}>
            <Image
              className={"rounded-full"}
              width={40}
              height={40}
              src={session.user.image!}
              alt={session.user.email!}
            />
          </DropdownMenuTrigger>
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
