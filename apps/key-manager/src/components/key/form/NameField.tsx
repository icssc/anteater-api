import type { CreateKeyFormValues } from "@/app/actions/types";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import type React from "react";
import type { UseFormReturn } from "react-hook-form";

interface Props {
  form: UseFormReturn<CreateKeyFormValues>;
}

const NameField: React.FC<Props> = ({ form }) => {
  return (
    <FormField
      control={form.control}
      name="name"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Name</FormLabel>
          <FormControl>
            <Input placeholder="Name" {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
};

export default NameField;
