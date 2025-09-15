"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { CalculationResults } from "./calculator-form";
import { Skeleton } from "./ui/skeleton";
import { CheckCircle2, XCircle, BarChart, Zap, Scale } from "lucide-react";

interface ResultsCardProps {
  results: CalculationResults | null;
  isLoading: boolean;
}

const ResultRow = ({ icon, label, value, unit }: { icon: React.ReactNode, label: string, value: string, unit: string }) => (
  <div className="flex justify-between items-center text-sm py-2 border-b border-border/50 last:border-b-0">
    <div className="flex items-center gap-2 text-muted-foreground">
      {icon}
      <span>{label}</span>
    </div>
    <span className="font-mono font-medium text-foreground">{value} <span className="text-xs text-muted-foreground">{unit}</span></span>
  </div>
);

export function ResultsCard({ results, isLoading }: ResultsCardProps) {
  if (isLoading) {
    return (
      <Card className="sticky top-8">
        <CardHeader>
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!results) {
    return (
      <Card className="sticky top-8 text-center flex flex-col justify-center items-center h-96 border-dashed">
        <CardHeader>
          <CardTitle>Awaiting Calculation</CardTitle>
          <CardDescription>Your results card will appear here.</CardDescription>
        </CardHeader>
        <CardContent>
          <BarChart className="w-16 h-16 text-muted-foreground/50 mx-auto" />
        </CardContent>
      </Card>
    );
  }

  const { status, momentCapacity, momentDemand, shearCapacity, shearDemand } = results;

  return (
    <Card className="sticky top-8 shadow-2xl shadow-primary/10">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Results Card</span>
          {status === "Pass" ? (
            <Badge className="bg-chart-2 hover:bg-chart-2/90 text-primary-foreground border-transparent">
              <CheckCircle2 className="mr-2 h-4 w-4" /> Pass
            </Badge>
          ) : (
            <Badge variant="destructive">
              <XCircle className="mr-2 h-4 w-4" /> Fail
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Analysis of the concrete slab under the specified load.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h4 className="font-semibold text-primary mb-2">Bending Moment</h4>
          <ResultRow icon={<Scale className="w-4 h-4"/>} label="Capacity (Mc)" value={momentCapacity.toFixed(2)} unit="kNm" />
          <ResultRow icon={<Zap className="w-4 h-4"/>} label="Demand (M*)" value={momentDemand.toFixed(2)} unit="kNm" />
        </div>
        <div>
          <h4 className="font-semibold text-primary mb-2">Shear Force</h4>
          <ResultRow icon={<Scale className="w-4 h-4"/>} label="Capacity (Vc)" value={shearCapacity.toFixed(2)} unit="kN" />
          <ResultRow icon={<Zap className="w-4 h-4"/>} label="Demand (V*)" value={shearDemand.toFixed(2)} unit="kN" />
        </div>
      </CardContent>
    </Card>
  );
}
