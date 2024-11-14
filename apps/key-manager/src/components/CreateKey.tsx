import { Button } from "@/components/ui/button";
import { createUserApiKey } from "@/app/actions/keys";
import React, { SetStateAction, startTransition, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  type AccessControlledResource,
  accessControlledResources,
  KeyData,
  KeyType,
} from "@/../../api/src/types/keys";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import EditOrigins from "@/components/EditOrigins";
import { useSession } from "next-auth/react";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";

interface Props {
  apiKeys: Record<string, KeyData>;
  setApiKeys: React.Dispatch<SetStateAction<Record<string, KeyData>>>;
  isPending: boolean;
  children: React.ReactNode;
}

const CreateKey: React.FC<Props> = ({
  setApiKeys,
  apiKeys,
  isPending,
  children,
}) => {
  const { data: session } = useSession();

  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form values
  const [keyType, setKeyType] = useState<KeyType | null>();
  const [keyName, setKeyName] = useState<string | null>();
  const [validOrigins, setValidOrigins] = useState<string[]>([""]);

  // Admin
  const [resources, setResources] = useState<
    Record<AccessControlledResource, boolean> | undefined
  >(undefined);
  const [rateLimitOverride, setRateLimitOverride] = useState<
    number | undefined
  >(undefined);

  const setDefaultValues = () => {
    setKeyType(null);
    setKeyName(null);
    setValidOrigins([""]);

    if (session?.user?.isAdmin) {
      setResources(
        Object.fromEntries(
          accessControlledResources.map((resource) => [resource, false]),
        ),
      );
    }
  };

  React.useEffect(() => {
    if (isOpen) {
      setDefaultValues();
    }
  }, [isOpen]);

  const handleCreateKey = () => {
    startTransition(async () => {
      try {
        const createKey = {
          _type: keyType ?? undefined,
          name: keyName ?? undefined,
          createdAt: new Date(),
          origins: keyType === "publishable" ? validOrigins : undefined,
        } as Partial<KeyData>;

        const { key, keyData } = await createUserApiKey(createKey);

        const newApiKeys = { ...apiKeys };
        newApiKeys[key] = keyData;
        setApiKeys(newApiKeys);

        setError(null);
        setIsOpen(false);
      } catch (err: any) {
        try {
          const jsonError = JSON.parse(err.message);
          setError(jsonError.map((e: any) => e.message).join(", "));
        } catch {
          setError(err.message);
        }
      }
    });
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) setError(null);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className={"max-w-3xl"}>
        <DialogHeader>
          <DialogTitle>Create API Key</DialogTitle>
        </DialogHeader>

        <div className={"space-y-4"}>
          {/* Name */}
          <Input
            placeholder={"Name"}
            value={keyName ?? ""}
            onChange={(e) => setKeyName(e.target.value)}
          />

          {/* Type */}
          <Select
            value={keyType || undefined}
            onValueChange={(value) => setKeyType(value as KeyType)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Key Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="publishable">publishable</SelectItem>
              <SelectItem value="secret">secret</SelectItem>
            </SelectContent>
          </Select>

          {/* Origins */}
          {keyType === "publishable" && (
            <EditOrigins
              validOrigins={validOrigins}
              setValidOrigins={setValidOrigins}
            />
          )}

          {/* Admin */}
          {session?.user?.isAdmin && (
            <div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className={"w-full"}>Resource</TableHead>
                    <TableHead>Access</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(resources ?? {}).map(([resource, hasAccess]) => (
                    <TableRow key={resource}>
                      <TableCell>{resource}</TableCell>
                      <TableCell>
                        <Switch
                          checked={hasAccess}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <DialogFooter>
          <div className={"w-full space-y-4"}>
            {error && (
              <Alert variant={"destructive"}>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className={"flex justify-between w-full"}>
              <Button
                variant="secondary"
                onClick={() => setIsOpen(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button
                variant="default"
                onClick={handleCreateKey}
                disabled={isPending}
              >
                Create
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateKey;
