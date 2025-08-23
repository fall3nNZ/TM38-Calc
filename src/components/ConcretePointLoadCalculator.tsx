import React, { useState, useEffect, useCallback } from 'react';
import { Calculator, FileText, AlertTriangle, CheckCircle } from 'lucide-react';
import { Inputs, CalculationResult } from '../types';

const ConcretePointLoadCalculator: React.FC = () => {
  // State for input values
  const [inputs, setInputs] = useState<Inputs>({
    // Ground conditions
    cbrValue: 0,
    scalaValue: '',
    groundAssessmentType: 'cbr', // 'cbr' or 'scala'
    
    // Sub-base
    hasSubbase: true,
    subbaseThickness: 100,
    
    // Concrete properties
    concreteStrength: 32,
    isPrestressed: false,
    residualStrength: 0.5,
    assessmentAge: 28, // 28 or 90 days
    
    // Joint details
    jointType: 'dowel', // 'dowel', 'tied', 'non_dowel'
    
    // Loading details
    loadPosition: 'interior', // 'interior', 'edge', 'corner'
    rackSpacingX: 1.0, // Longitudinal spacing
    rackSpacingY: 0.8, // Transverse spacing
    isBackToBack: false,
    backToBackSpacing: 0.1, // Spacing between back-to-back racks
    baseplateX: 50,
    baseplateY: 50,
    wheelLoading: 1,
    
    // Load repetitions
    loadRepetitions: 8000
  });

  // State for results
  const [results, setResults] = useState({
    modulus: 0,
    allowableStress: 0,
    interior: {
      equivalentRadius: 0,
      radiusOfStiffness: 0,
      stress: 0,
      thickness: 0,
      isAdequate: false
    },
    edge: {
      equivalentRadius: 0,
      radiusOfStiffness: 0,
      stress: 0,
      thickness: 0,
      isAdequate: false
    },
    corner: {
      equivalentRadius: 0,
      radiusOfStiffness: 0,
      stress: 0,
      thickness: 0,
      isAdequate: false
    }
  });

  // Convert CBR to modulus of subgrade reaction
  const cbrToModulus = (cbr: number): number => {
    // From Figure 1.2 in TM38 - approximate relationship
    if (cbr <= 2) return 15;
    if (cbr <= 5) return 37;
    if (cbr <= 10) return 54;
    if (cbr <= 20) return 68;
    if (cbr <= 40) return 82;
    return 109;
  };

  // Convert Scala penetrometer to CBR
  const scalaToCBR = (scala: string): number => {
    const scalaNum = parseFloat(scala);
    if (scalaNum >= 100) return 2;
    if (scalaNum >= 50) return 3;
    if (scalaNum >= 20) return 5;
    if (scalaNum >= 10) return 8;
    if (scalaNum >= 5) return 12;
    if (scalaNum >= 2) return 20;
    if (scalaNum >= 1) return 30;
    return 50;
  };

  // Enhance modulus for sub-base (from Figure 3.1)
  const enhanceModulusForSubbase = useCallback((k: number, thickness: number): number => {
    if (!inputs.hasSubbase || thickness < 100) return k;
    
    // Approximate enhancement from Figure 3.1
    const enhancement = 1 + (thickness / 300) * 0.5;
    return Math.min(k * enhancement, k * 2); // Cap at double
  }, [inputs.hasSubbase]);

  // Calculate modulus of rupture
  const calculateModulusOfRupture = (fc: number, age: number, repetitions: number): number => {
    // From Equation 3.1 in TM38
    const k1 = age >= 90 ? 1.1 : 1.0;
    
    // Load repetition factor k2
    let k2 = 1.0;
    if (repetitions >= 400000) k2 = 0.77;
    else if (repetitions >= 300000) k2 = 0.78;
    else if (repetitions >= 200000) k2 = 0.81;
    else if (repetitions >= 100000) k2 = 0.84;
    else if (repetitions >= 50000) k2 = 0.89;
    else if (repetitions >= 30000) k2 = 0.90;
    else if (repetitions >= 10000) k2 = 0.96;
    
    return 0.456 * k1 * k2 * Math.pow(fc, 0.66);
  };

  // Define base calculations first
  const calculateRadiusOfStiffness = useCallback((
    E: number,
    h: number,
    k: number,
    mu: number = 0.15
  ): number => {
    const denominator = 12 * (1 - Math.pow(mu, 2)) * k * 1000;
    return Math.pow((E * Math.pow(h, 3)) / denominator, 0.25);
  }, []);

  const calculateEquivalentRadius = useCallback((
    baseX: number,
    baseY: number,
    h: number,
    isBackToBack: boolean,
    backToBackSpacing: number
  ): number => {
    let area = (baseX * baseY) / 1000000;
    if (isBackToBack) {
      area *= 2;
    }
    return Math.sqrt(area / Math.PI);
  }, []);

  const calculateStress = useCallback((
    P: number,
    h: number,
    l: number,
    b: number,
    position: string,
    hasLoadTransfer: boolean,
    isBackToBack: boolean,
    backToBackSpacing: number
  ): number => {
    const mu = 0.15; // Poisson's ratio
    
    // Adjust load for back-to-back configuration
    let effectiveLoad = P;
    if (isBackToBack && backToBackSpacing < 2 * h) {
      // Combined loading effect when racks are close together
      effectiveLoad = P * 2; // Double the load for combined effect
    }
    
    if (position === 'interior') {
      // Equation 3.2 - Interior loading
      const stress = (effectiveLoad * 1000 / Math.pow(h, 2)) * (0.70 * (1 + mu) * Math.log(l / b) + 1.069);
      return stress * Math.pow(10, 6) / 1000; // Convert to kPa
    } else if (position === 'edge') {
      // Equation 3.5 - Edge loading
      let stress = 5.19 * (1 + 0.54 * mu) * (effectiveLoad * 1000 / Math.pow(h, 2)) * 
                   (4 * Math.log(l / b) + Math.log(b / 25.4));
      stress = stress * Math.pow(10, 6) / 1000; // Convert to kPa
      return hasLoadTransfer ? stress * 0.85 : stress;
    } else if (position === 'corner') {
      // Equation 3.6 - Corner loading
      let stress = 41.2 * (effectiveLoad * 1000 / Math.pow(h, 2)) * 
                   (1 - Math.pow(b / l, 0.5)) / (0.925 + 0.22 * (b / l));
      stress = stress * Math.pow(10, 6) / 1000; // Convert to kPa
      return hasLoadTransfer ? stress * 0.7 : stress;
    }
    
    return 0;
  }, []);

  // Now define dependent calculations
  const calculateThicknessForPosition = useCallback((
    position: string,
    modulus: number,
    hasLoadTransfer: boolean,
    allowableStress: number
  ): CalculationResult => {
    let thickness = 125; // Starting minimum thickness
    const maxIterations = 20;
    let iteration = 0;
    
    while (iteration < maxIterations) {
      // Calculate concrete modulus of elasticity
      const E = 5000 * Math.sqrt(inputs.concreteStrength) * 1000; // Convert to kPa
      
      // Calculate radius of relative stiffness
      const radiusOfStiffness = calculateRadiusOfStiffness(E, thickness, modulus);
      
      // Calculate equivalent radius
      const equivalentRadius = calculateEquivalentRadius(
        inputs.baseplateX, 
        inputs.baseplateY, 
        thickness,
        inputs.isBackToBack,
        inputs.backToBackSpacing
      );
      
      // Calculate stress
      const stress = calculateStress(
        inputs.wheelLoading,
        thickness,
        equivalentRadius,
        radiusOfStiffness,
        position,
        hasLoadTransfer,
        inputs.isBackToBack,
        inputs.backToBackSpacing
      );
      
      // Apply load factor
      const designStress = stress * 1.5;
      
      // Check if adequate
      const isAdequate = designStress <= allowableStress;
      
      if (isAdequate) {
        return {
          equivalentRadius,
          radiusOfStiffness,
          stress: designStress,
          thickness,
          isAdequate: true
        };
      }
      
      // Increase thickness and try again
      thickness += 25;
      iteration++;
    }
    
    // If no adequate solution found, return last calculated values
    const E = 5000 * Math.sqrt(inputs.concreteStrength) * 1000;
    const radiusOfStiffness = calculateRadiusOfStiffness(E, thickness, modulus);
    const equivalentRadius = calculateEquivalentRadius(
      inputs.baseplateX, 
      inputs.baseplateY, 
      thickness,
      inputs.isBackToBack,
      inputs.backToBackSpacing
    );
    const stress = calculateStress(
      inputs.wheelLoading,
      thickness,
      radiusOfStiffness,
      equivalentRadius,
      position,
      hasLoadTransfer,
      inputs.isBackToBack,
      inputs.backToBackSpacing
    ) * 1.5;
    
    return {
      equivalentRadius,
      radiusOfStiffness,
      stress,
      thickness,
      isAdequate: false
    };
  }, [
    calculateStress, 
    calculateEquivalentRadius, 
    calculateRadiusOfStiffness,
    inputs.concreteStrength,
    inputs.baseplateX,
    inputs.baseplateY,
    inputs.isBackToBack,
    inputs.backToBackSpacing,
    inputs.wheelLoading
  ]);

  // Main calculation function
  useEffect(() => {
    try {
      // Determine CBR value
      let cbrValue = inputs.cbrValue;
      if (inputs.groundAssessmentType === 'scala' && inputs.scalaValue) {
        cbrValue = scalaToCBR(inputs.scalaValue);
      }

      // Get base modulus
      let modulus = cbrToModulus(cbrValue);
      
      // Enhance for sub-base if applicable
      if (inputs.hasSubbase) {
        modulus = enhanceModulusForSubbase(modulus, inputs.subbaseThickness);
      }

      // Calculate allowable stress
      let allowableStress = calculateModulusOfRupture(
        inputs.concreteStrength,
        inputs.assessmentAge,
        inputs.loadRepetitions
      ) * 1000; // Convert to kPa
      
      // Add prestress if applicable
      if (inputs.isPrestressed) {
        allowableStress += inputs.residualStrength * 1000;
      }

      // Determine if load transfer exists
      const hasLoadTransfer = inputs.jointType === 'dowel' || inputs.jointType === 'tied';

      // Calculate thickness for all three positions
      const interiorResults = calculateThicknessForPosition('interior', modulus, hasLoadTransfer, allowableStress);
      const edgeResults = calculateThicknessForPosition('edge', modulus, hasLoadTransfer, allowableStress);
      const cornerResults = calculateThicknessForPosition('corner', modulus, hasLoadTransfer, allowableStress);

      // Update results with all calculations
      setResults({
        modulus,
        allowableStress,
        interior: interiorResults as CalculationResult,
        edge: edgeResults as CalculationResult,
        corner: cornerResults as CalculationResult
      });
    } catch (error) {
      console.error('Calculation error:', error);
    }
  }, [inputs, calculateThicknessForPosition, enhanceModulusForSubbase]);

  // Update handleInputChange to accept correct types
  const handleInputChange = (field: keyof Inputs, value: string | number | boolean): void => {
    setInputs(prev => ({
      ...prev,
      [field]: value
    }));
  };

  return (
    <div className="max-w-6xl mx-auto p-6 bg-white">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-4">
          <Calculator className="w-8 h-8 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-800">
            Concrete Ground Floor Point Load Calculator
          </h1>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <FileText className="w-4 h-4" />
          <span>Based on TM38 - CCANZ Design Guidelines</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Panel */}
        <div className="space-y-6">
          {/* Ground Assessment */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="font-semibold text-gray-800 mb-4">Ground Assessment</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Assessment Method
                </label>
                <select
                  value={inputs.groundAssessmentType}
                  onChange={(e) => handleInputChange('groundAssessmentType', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="cbr">CBR Value</option>
                  <option value="scala">Scala Penetrometer</option>
                </select>
              </div>

              {inputs.groundAssessmentType === 'cbr' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    CBR Value (%)
                  </label>
                  <input
                    type="number"
                    value={inputs.cbrValue}
                    onChange={(e) => handleInputChange('cbrValue', parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min="1"
                    max="100"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Scala Penetrometer (mm per blow)
                  </label>
                  <input
                    type="number"
                    value={inputs.scalaValue}
                    onChange={(e) => handleInputChange('scalaValue', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min="0.1"
                    step="0.1"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Sub-base */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="font-semibold text-gray-800 mb-4">Sub-base</h3>
            
            <div className="space-y-4">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={inputs.hasSubbase}
                  onChange={(e) => handleInputChange('hasSubbase', e.target.checked)}
                  className="mr-2"
                />
                <label className="text-sm font-medium text-gray-700">
                  Granular sub-base present
                </label>
              </div>

              {inputs.hasSubbase && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Sub-base Thickness (mm)
                  </label>
                  <input
                    type="number"
                    value={inputs.subbaseThickness}
                    onChange={(e) => handleInputChange('subbaseThickness', parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min="100"
                    max="500"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Concrete Properties */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="font-semibold text-gray-800 mb-4">Concrete Properties</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Concrete Strength f'c (MPa)
                </label>
                <input
                  type="number"
                  value={inputs.concreteStrength}
                  onChange={(e) => handleInputChange('concreteStrength', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  min="20"
                  max="50"
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={inputs.isPrestressed}
                  onChange={(e) => handleInputChange('isPrestressed', e.target.checked)}
                  className="mr-2"
                />
                <label className="text-sm font-medium text-gray-700">
                  Post-tensioned concrete
                </label>
              </div>

              {inputs.isPrestressed && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Residual Prestress (MPa)
                  </label>
                  <input
                    type="number"
                    value={inputs.residualStrength}
                    onChange={(e) => handleInputChange('residualStrength', parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min="0.5"
                    max="5.0"
                    step="0.1"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Assessment Age
                </label>
                <select
                  value={inputs.assessmentAge}
                  onChange={(e) => handleInputChange('assessmentAge', parseInt(e.target.value))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value={28}>28 days</option>
                  <option value={90}>90 days</option>
                </select>
              </div>
            </div>
          </div>

          {/* Joint Details */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="font-semibold text-gray-800 mb-4">Joint Details</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Joint Type
                </label>
                <select
                  value={inputs.jointType}
                  onChange={(e) => handleInputChange('jointType', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="dowel">Dowel joints (load transfer)</option>
                  <option value="tied">Tied joints (aggregate interlock)</option>
                  <option value="non_dowel">Non-dowel joints (no load transfer)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Load Position (for stress display)
                </label>
                <select
                  value={inputs.loadPosition}
                  onChange={(e) => handleInputChange('loadPosition', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="interior">Interior of slab</option>
                  <option value="edge">Edge of slab</option>
                  <option value="corner">Corner of slab</option>
                </select>
                <p className="text-xs text-gray-600 mt-1">
                  Note: Thickness is calculated for all positions below
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Loading Details and Results */}
        <div className="space-y-6">
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="font-semibold text-gray-800 mb-4">Loading Details</h3>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Rack Spacing X (m) - Longitudinal
                  </label>
                  <input
                    type="number"
                    value={inputs.rackSpacingX}
                    onChange={(e) => handleInputChange('rackSpacingX', parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min="1.0"
                    max="5.0"
                    step="0.1"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Rack Spacing Y (m) - Transverse
                  </label>
                  <input
                    type="number"
                    value={inputs.rackSpacingY}
                    onChange={(e) => handleInputChange('rackSpacingY', parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min="0.8"
                    max="2.0"
                    step="0.1"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={inputs.isBackToBack}
                    onChange={(e) => handleInputChange('isBackToBack', e.target.checked)}
                    className="mr-2"
                  />
                  <label className="text-sm font-medium text-gray-700">
                    Back-to-back rack configuration
                  </label>
                </div>

                {inputs.isBackToBack && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Spacing Between Back-to-Back Racks (m)
                    </label>
                    <input
                      type="number"
                      value={inputs.backToBackSpacing}
                      onChange={(e) => handleInputChange('backToBackSpacing', parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      min="0.1"
                      max="2.0"
                      step="0.1"
                    />
                    <p className="text-xs text-gray-600 mt-1">
                      When &#60; {results.interior.thickness > 0 ? (results.interior.thickness * 2 / 1000).toFixed(2) : '0.30'}m (2×thickness), loads are combined for analysis
                    </p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Baseplate X (mm)
                  </label>
                  <input
                    type="number"
                    value={inputs.baseplateX}
                    onChange={(e) => handleInputChange('baseplateX', parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min="50"
                    max="500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Baseplate Y (mm)
                  </label>
                  <input
                    type="number"
                    value={inputs.baseplateY}
                    onChange={(e) => handleInputChange('baseplateY', parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min="50"
                    max="500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Point Load (kN)
                </label>
                <input
                  type="number"
                  value={inputs.wheelLoading}
                  onChange={(e) => handleInputChange('wheelLoading', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="1"
                  max="500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Load Repetitions
                </label>
                <select
                  value={inputs.loadRepetitions}
                  onChange={(e) => handleInputChange('loadRepetitions', parseInt(e.target.value))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value={8000}>&#60; 8,000 (static loading)</option>
                  <option value={10000}>10,000</option>
                  <option value={30000}>30,000</option>
                  <option value={50000}>50,000</option>
                  <option value={100000}>100,000</option>
                  <option value={200000}>200,000</option>
                  <option value={300000}>300,000</option>
                  <option value={400000}>400,000+</option>
                </select>
              </div>
            </div>
          </div>

          {/* Results Panel */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-6 rounded-lg border">
            <div className="flex items-center gap-3 mb-4">
              <Calculator className="w-6 h-6 text-blue-600" />
              <h3 className="text-lg font-semibold text-gray-800">
                Calculation Results - All Load Positions
              </h3>
            </div>

            {/* Common Parameters */}
            <div className="bg-white p-4 rounded-lg mb-4">
              <h4 className="font-medium text-gray-800 mb-3">Common Design Parameters</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Enhanced Modulus (k):</span>
                  <p className="font-medium text-gray-800">
                    {results.modulus.toFixed(0)} MN/m³
                  </p>
                </div>
                <div>
                  <span className="text-gray-600">Allowable Stress:</span>
                  <p className="font-medium text-gray-800">
                    {results.allowableStress.toFixed(0)} kPa
                  </p>
                </div>
              </div>
            </div>

            {/* Results for each position */}
            <div className="space-y-4">
              {/* Interior Loading */}
              <div className="bg-white p-4 rounded-lg border-l-4 border-green-400">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-gray-800">Interior Loading</h4>
                  {results.interior.isAdequate ? (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                  )}
                </div>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Required Thickness:</span>
                    <p className="font-bold text-lg text-blue-600">
                      {results.interior.thickness} mm
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-600">Design Stress:</span>
                    <p className="font-medium text-gray-800">
                      {results.interior.stress.toFixed(0)} kPa
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-600">Stress Ratio:</span>
                    <p className="font-medium text-gray-800">
                      {results.allowableStress > 0 ? ((results.interior.stress / results.allowableStress) * 100).toFixed(1) : 0}%
                    </p>
                  </div>
                </div>
              </div>

              {/* Edge Loading */}
              <div className="bg-white p-4 rounded-lg border-l-4 border-yellow-400">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-gray-800">Edge Loading</h4>
                  {results.edge.isAdequate ? (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                  )}
                </div>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Required Thickness:</span>
                    <p className="font-bold text-lg text-blue-600">
                      {results.edge.thickness} mm
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-600">Design Stress:</span>
                    <p className="font-medium text-gray-800">
                      {results.edge.stress.toFixed(0)} kPa
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-600">Stress Ratio:</span>
                    <p className="font-medium text-gray-800">
                      {results.allowableStress > 0 ? ((results.edge.stress / results.allowableStress) * 100).toFixed(1) : 0}%
                    </p>
                  </div>
                </div>
              </div>

              {/* Corner Loading */}
              <div className="bg-white p-4 rounded-lg border-l-4 border-red-400">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-gray-800">Corner Loading</h4>
                  {results.corner.isAdequate ? (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                  )}
                </div>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Required Thickness:</span>
                    <p className="font-bold text-lg text-blue-600">
                      {results.corner.thickness} mm
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-600">Design Stress:</span>
                    <p className="font-medium text-gray-800">
                      {results.corner.stress.toFixed(0)} kPa
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-600">Stress Ratio:</span>
                    <p className="font-medium text-gray-800">
                      {results.allowableStress > 0 ? ((results.corner.stress / results.allowableStress) * 100).toFixed(1) : 0}%
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Overall Design Summary */}
            <div className="mt-4 p-4 bg-white rounded-lg border-2 border-blue-200">
              <h4 className="font-medium text-gray-800 mb-2">Design Summary</h4>
              <div className="text-sm">
                <p className="font-medium text-blue-800">
                  Recommended Minimum Thickness: {Math.max(results.interior.thickness, results.edge.thickness, results.corner.thickness)} mm
                </p>
                <p className="text-gray-600 mt-1">
                  Governed by: {
                    results.corner.thickness >= results.edge.thickness && results.corner.thickness >= results.interior.thickness ? 'Corner Loading' :
                    results.edge.thickness >= results.interior.thickness ? 'Edge Loading' : 'Interior Loading'
                  }
                </p>
              </div>
            </div>
          </div>

          {/* Design Notes */}
          <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
            <h4 className="font-medium text-yellow-800 mb-2">Design Notes:</h4>
            <ul className="text-sm text-yellow-700 space-y-1">
              <li>• Load factor of 1.5 applied to design loads</li>
              <li>• Minimum slab thickness typically 125mm for industrial floors</li>
              <li>• Consider durability requirements for concrete strength selection</li>
              <li>• Edge and corner loadings require higher thickness than interior</li>
              <li>• Fatigue considerations reduce allowable stress for high repetition loads</li>
              <li>• Back-to-back racks with close spacing (&#60;2×thickness) combine loading effects</li>
              <li>• Typical rack spacings: X=2.4-2.7m longitudinal, Y=0.8-1.2m transverse</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConcretePointLoadCalculator;