"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "./ui/separator";

const formSchema = z.object({
  slabWidth: z.coerce.number().min(0.1, "Must be positive"),
  slabLength: z.coerce.number().min(0.1, "Must be positive"),
  slabDepth: z.coerce.number().min(50, "Must be at least 50mm"),
  concreteStrength: z.coerce.number().min(10, "Must be at least 10 MPa"),
  rebarStrength: z.coerce.number().min(200, "Must be at least 200 MPa"),
  pointLoad: z.coerce.number().min(0, "Cannot be negative"),
});

type FormValues = z.infer<typeof formSchema>;

export type CalculationResults = {
  inputs: FormValues;
  momentCapacity: number;
  momentDemand: number;
  shearCapacity: number;
  shearDemand: number;
  status: "Pass" | "Fail";
};

interface CalculatorFormProps {
  onCalculate: (data: FormValues) => void;
  isCalculating: boolean;
}

export function CalculatorForm({ onCalculate, isCalculating }: CalculatorFormProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      slabWidth: 3,
      slabLength: 3,
      slabDepth: 150,
      concreteStrength: 25,
      rebarStrength: 500,
      pointLoad: 10,
    },
  });

  function onSubmit(values: FormValues) {
    onCalculate(values);
  }

  return (
    <Card className="shadow-2xl shadow-primary/10">
      <CardHeader>
        <CardTitle className="text-2xl">Load Parameters</CardTitle>
        <CardDescription>
          Enter the parameters for your concrete slab and point load.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-primary">Slab Dimensions</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="slabWidth"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Width</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="3.0" {...field} />
                      </FormControl>
                      <FormDescription>meters (m)</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="slabLength"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Length</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="3.0" {...field} />
                      </FormControl>
                      <FormDescription>meters (m)</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="slabDepth"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Depth</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="150" {...field} />
                      </FormControl>
                      <FormDescription>millimeters (mm)</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
               <h3 className="text-lg font-medium text-primary">Material Properties</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="concreteStrength"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Concrete Strength (f'c)</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="25" {...field} />
                      </FormControl>
                      <FormDescription>Megapascals (MPa)</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="rebarStrength"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Rebar Yield Strength (fy)</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="500" {...field} />
                      </FormControl>
                      <FormDescription>Megapascals (MPa)</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
            
            <Separator />

            <div className="space-y-4">
              <h3 className="text-lg font-medium text-primary">Loading</h3>
               <FormField
                control={form.control}
                name="pointLoad"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Point Load</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="10" {...field} />
                    </FormControl>
                    <FormDescription>kilonewtons (kN)</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Button type="submit" size="lg" className="w-full bg-accent hover:bg-accent/90 text-accent-foreground" disabled={isCalculating}>
              {isCalculating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Calculating...
                </>
              ) : (
                "Build Load Card"
              )}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
