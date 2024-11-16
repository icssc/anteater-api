import React from "react";
import { UseFormReturn, useFieldArray } from "react-hook-form";
import { CreateKeyFormValues } from "@/app/actions/types";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TrashIcon, PlusIcon } from "lucide-react";

interface Props {
  form: UseFormReturn<CreateKeyFormValues>;
}

const OriginsField: React.FC<Props> = ({ form }) => {
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "origins",
  });

  return (
    <FormItem>
      <FormLabel>Authorized Origins</FormLabel>
      <FormControl>
        <div className="space-y-2">
          {fields.map((field, index) => (
            <FormField
              key={field.id}
              control={form.control}
              name={`origins.${index}.url`}
              render={({ field: fieldInput }) => (
                <FormItem>
                  <FormLabel>Origin {index + 1}</FormLabel>
                  <div className="flex space-x-2 items-center justify-between">
                    <Input
                      {...fieldInput}
                      className={"w-11/12"}
                      onChange={(e) => {
                        fieldInput.onChange(e);
                        form.trigger("origins");
                      }}
                    />
                    {index !== 0 && (
                      <Button variant="ghost" onClick={() => remove(index)}>
                        <TrashIcon className="size-5" />
                      </Button>
                    )}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          ))}

          <Button
            variant="link"
            className="px-0"
            onClick={() => append({ url: "" })}
            type="button"
          >
            <PlusIcon />
            <div>Add Origin</div>
          </Button>
        </div>
      </FormControl>
      <FormMessage />
    </FormItem>
  );
};

export default OriginsField;
