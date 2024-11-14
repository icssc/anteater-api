import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import React from "react";
import { PlusIcon, TrashIcon } from "lucide-react";

interface Props {
  validOrigins: string[];
  setValidOrigins: React.Dispatch<React.SetStateAction<string[]>>;
}

const EditOrigins: React.FC<Props> = ({ validOrigins, setValidOrigins }) => {
  const deleteOrigin = (index: number) => {
    const newOrigins = [...validOrigins];
    newOrigins.splice(index, 1);
    setValidOrigins(newOrigins);
  };

  const addOrigin = () => {
    setValidOrigins([...validOrigins, ""]);
  };

  return (
    <div className={"space-y-2"}>
      <p>Authorized Origins</p>
      {validOrigins.map((origin, i) => (
        <div key={i} className={"flex space-x-2 items-center"}>
          <Input
            value={origin}
            onChange={(e) => {
              const newOrigins = [...validOrigins];
              newOrigins[i] = e.target.value;
              setValidOrigins(newOrigins);
            }}
          />
          <Button variant={"ghost"} onClick={() => deleteOrigin(i)}>
            <TrashIcon className={"size-5"} />
          </Button>
        </div>
      ))}
      <Button variant={"link"} className={"px-0"} onClick={addOrigin}>
        <PlusIcon />
        <div>Add Origin</div>
      </Button>
    </div>
  );
};

export default EditOrigins;
