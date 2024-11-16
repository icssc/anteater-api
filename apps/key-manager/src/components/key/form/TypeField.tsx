import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import React from "react";
import { CreateKeyFormValues } from "@/app/actions/types";
import { UseFormReturn } from "react-hook-form";
import { GlobeIcon, LockIcon } from "lucide-react";

interface Props {
  form: UseFormReturn<CreateKeyFormValues>;
  disabled?: boolean;
}

const TypeField: React.FC<Props> = ({ form, disabled }) => {
  return (
    <FormField
      control={form.control}
      name="_type"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Type</FormLabel>
          <Select
            onValueChange={field.onChange}
            defaultValue={field.value}
            disabled={disabled}
          >
            <FormControl>
              <SelectTrigger>
                <SelectValue placeholder="Key Type" />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              <SelectItem value="publishable">
                <div className={"flex items-center space-x-2"}>
                  <GlobeIcon className={"size-4"}/>
                  <p>publishable</p>
                </div>
              </SelectItem>
              <SelectItem value="secret">
                <div className={"flex items-center space-x-2"}>
                  <LockIcon className={"size-4"}/>
                  <p>secret</p>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
          <FormMessage/>
        </FormItem>
      )}
    />
  );
};

export default TypeField;
