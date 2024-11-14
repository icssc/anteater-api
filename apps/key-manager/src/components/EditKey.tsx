import { Button } from "@/components/ui/button";
import { editUserApiKey } from "@/app/actions/keys";
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
import { KeyData } from "@/../../api/src/types/keys";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, CheckIcon } from "lucide-react";
import Key from "@/components/Key";
import EditOrigins from "@/components/EditOrigins";

interface Props {
  apiKeys: Record<string, KeyData>;
  setApiKeys: React.Dispatch<SetStateAction<Record<string, KeyData>>>;
  isPending: boolean;
  children: React.ReactNode;
  editKey: string;
  editKeyData: KeyData;
}

const EditKey: React.FC<Props> = ({
  setApiKeys,
  apiKeys,
  isPending,
  children,
  editKey,
  editKeyData,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);

  // Form values
  const keyType = editKeyData._type;
  const [keyName, setKeyName] = useState<string | null>();
  const [validOrigins, setValidOrigins] = useState<string[]>([""]);

  const setDefaultValues = () => {
    setKeyName(editKeyData.name);
    setValidOrigins(
      editKeyData._type == "publishable"
        ? Object.keys(editKeyData.origins)
        : [""],
    );
  };

  React.useEffect(() => {
    if (isOpen) {
      setDefaultValues();
    }
  }, [isOpen]);

  const handleEditKey = () => {
    startTransition(async () => {
      try {
        const keyEditData = {
          _type: keyType,
          name: keyName ?? undefined,
          createdAt: new Date(),
          origins: keyType === "publishable" ? validOrigins : undefined,
        } as Partial<KeyData>;

        const keyData = await editUserApiKey(editKey, keyEditData);

        const editedApiKeys = { ...apiKeys };
        editedApiKeys[editKey] = keyData;
        setApiKeys(editedApiKeys);

        setError(null);
        setIsSaved(true);
        setTimeout(() => setIsSaved(false), 1000);
      } catch (err: any) {
        const jsonError = JSON.parse(err.message);
        if (typeof jsonError === "object") {
          setError(jsonError.map((e: any) => e.message).join(", "));
        } else {
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
      <DialogContent className={"max-w-4xl"}>
        <DialogHeader>
          <DialogTitle>Edit API Key</DialogTitle>
        </DialogHeader>
        <div className={"space-y-4"}>
          {/* Key */}
          <Key keyText={editKey} copyText={editKey} background={true} />

          {/* Name */}
          <Input
            placeholder={"Name"}
            value={keyName ?? ""}
            onChange={(e) => setKeyName(e.target.value)}
          />

          {/* Type */}
          <Select value={keyType} disabled={true}>
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
                onClick={handleEditKey}
                disabled={isPending || isSaved}
              >
                Save
                {isSaved && <CheckIcon className="size-5 text-green-700" />}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditKey;
