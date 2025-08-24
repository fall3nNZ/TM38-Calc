export interface PointLoad {
    magnitude: number;
    position: number;
}

export interface CalculatorProps {
    loads: PointLoad[];
    onLoadChange: (loads: PointLoad[]) => void;
}

export interface CalculatorState {
    totalLoad: number;
    loadPositions: number[];
}
export interface Inputs {
  groundAssessmentType: string;
  cbrValue: number;
  scalaValue: string;
  hasSubbase: boolean;
  subbaseThickness: number;
  concreteStrength: number;
  isPrestressed: boolean;
  residualStrength: number;
  assessmentAge: number;
  jointType: string;
  loadPosition: string;
  rackSpacingX: number;
  rackSpacingY: number;
  baseplateX: number;
  baseplateY: number;
  wheelLoading: number;
  loadRepetitions: number;
  isBackToBack: boolean;
  backToBackSpacing: number;
}

export interface CalculationResult {
  equivalentRadius: number;
  radiusOfStiffness: number;
  stress: number;
  thickness: number;
  isAdequate: boolean;
}