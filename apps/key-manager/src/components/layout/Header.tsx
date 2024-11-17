import { auth } from "@/auth";
import SignOutButton from "@/components/auth/SignOutButton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Image from "next/image";
import Link from "next/link";

const Header = async () => {
  const session = await auth();

  return (
    <header className={"px-6 my-4 flex justify-between items-center"}>
      <Link href={"/"} className={"text-3xl font-bold"}>
        Anteater API
      </Link>
      {session?.user && (
        <DropdownMenu>
          <div className={"flex items-center space-x-4"}>
            {session.user.isAdmin && (
              <p className={"text-destructive text-xl select-none"}>ADMIN</p>
            )}
            <DropdownMenuTrigger className={"focus:outline-none"}>
              {session.user.image && session.user.email && (
                <Image
                  className={"rounded-full"}
                  width={40}
                  height={40}
                  src={session.user.image}
                  alt={session.user.email}
                />
              )}
            </DropdownMenuTrigger>
          </div>
          <DropdownMenuContent align={"end"}>
            <SignOutButton />
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </header>
  );
};

export default Header;
