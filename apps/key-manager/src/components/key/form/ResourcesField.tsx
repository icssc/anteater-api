import type { CreateKeyFormValues } from "@/app/actions/types";
import { FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { accessControlledResources } from "@packages/key-types";
import type React from "react";
import type { UseFormReturn } from "react-hook-form";

interface Props {
  form: UseFormReturn<CreateKeyFormValues>;
}

const ResourcesField: React.FC<Props> = ({ form }) => {
  return (
    <FormItem>
      <FormControl>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-full">Resource</TableHead>
              <TableHead>Access</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accessControlledResources.map((resource) => (
              <TableRow key={resource}>
                <TableCell>{resource}</TableCell>
                <TableCell>
                  <FormField
                    control={form.control}
                    name={`resources.${resource}`}
                    defaultValue={false}
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Switch
                            checked={field.value || false}
                            onCheckedChange={field.onChange}
                            className="data-[state=checked]:bg-destructive"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </FormControl>
      <FormMessage />
    </FormItem>
  );
};

export default ResourcesField;
