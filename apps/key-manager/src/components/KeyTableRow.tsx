import React, { SetStateAction } from "react";
import { KeyData } from "@/../../api/src/types/keys";
import { TableCell, TableRow } from "@/components/ui/table";
import DeleteKey from "@/components/DeleteKey";
import { Button } from "@/components/ui/button";
import { PencilIcon } from "lucide-react";
import Key from "@/components/Key";
import EditKey from "@/components/EditKey";

interface Props {
  apiKey: string;
  apiKeyData: KeyData;
  isPending: boolean;
  apiKeys: Record<string, KeyData>;
  setApiKeys: React.Dispatch<SetStateAction<Record<string, KeyData>>>;
}

const KeyTableRow: React.FC<Props> = ({
  apiKey,
  apiKeyData,
  isPending,
  apiKeys,
  setApiKeys,
}) => {
  const abbreviatedKey = "..." + apiKey.substring(apiKey.indexOf(".") + 1);

  return (
    <TableRow>
      <TableCell className={"max-w-0 overflow-x-hidden"}>
        {apiKeyData.name}
      </TableCell>
      <TableCell>{new Date(apiKeyData.createdAt).toDateString()}</TableCell>
      <TableCell>
        <Key keyText={abbreviatedKey} copyText={apiKey}/>
      </TableCell>
      <TableCell>
        <div className={"flex justify-end space-x-4"}>
          <EditKey
            apiKeys={apiKeys}
            setApiKeys={setApiKeys}
            isPending={isPending}
            editKey={apiKey}
            editKeyData={apiKeyData}
          >
            <Button variant={"secondary"}>
              <PencilIcon />
              <div>Edit</div>
            </Button>
          </EditKey>
          <DeleteKey
            apiKey={apiKey}
            apiKeyData={apiKeyData}
            apiKeys={apiKeys}
            isPending={isPending}
            setApiKeys={setApiKeys}
          />
        </div>
      </TableCell>
    </TableRow>
  );
};

export default KeyTableRow;
