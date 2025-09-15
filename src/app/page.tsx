"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { HelpCircle, AlertTriangle, ArrowLeft, ChevronsRight, Loader2 } from 'lucide-react';
import Image from 'next/image';

// --- Helper & Calculation Functions based on TM38 ---

// Constants
const POISSON_RATIO = 0.15;
const LOAD_FACTOR = 1.5;

// --- SOIL & SUBGRADE CALCULATIONS ---

const calculateKFromCBR = (cbr: number) => {
    if (cbr <= 0) return 0;
    if (cbr < 30) {
        return 22.5 * Math.log(cbr) + 1.4305;
    } else {
        return 109.2 * Math.log(cbr) - 293.32;
    }
};

const calculateCBRFromScala = (scala: number) => {
    if (scala <= 0) return 0;
    return 318.15 * Math.pow(scala, -1.0788);
};

const calculateModifiedK = (k_subgrade: number, subbase_thickness: number) => {
    if (subbase_thickness <= 0) return k_subgrade;
    if (k_subgrade <= 0) return 0;
    const term1 = subbase_thickness * (0.0612 * Math.log(k_subgrade) - 0.1029);
    const term2 = (0.8752 * k_subgrade) - 1.453;
    return term1 + term2;
};

// --- CONCRETE & STRESS CALCULATIONS ---

const calculateEc = (fc: number) => fc > 0 ? 3320 * Math.sqrt(fc) + 6900 : 0;

// k1 factor from TM38 for load application time
const getK1 = (days: number) => days >= 90 ? 1.1 : 1.0;

// k2 factor from TM38 for load repetitions
const getK2 = (repetitionsStr: string) => {
    const repetitions = parseFloat(repetitionsStr);

    if (isNaN(repetitions) || repetitions < 8000) return 1.0;
    if (repetitionsStr === 'Unlimited') return 0.75;
    
    if (repetitions >= 8000 && repetitions <= 400000) {
        const k2_calculated = 1.5 * (0.73 - 0.0846 * (Math.log10(repetitions) - 3));
        return Math.max(0.75, Math.min(1.0, k2_calculated));
    }

    if (repetitions > 400000) return 0.77; 
    return 1.0;
};

// Allowable stress for calculation check. Includes fatigue factor k2.
const calculateAllowableStress = (fc: number, days: number, repetitions: string, postTensionStress = 0) => {
    if (!fc || fc <= 0) return 0;
    const baseFr = 0.456 * getK1(days) * getK2(repetitions) * Math.pow(fc, 0.66);
    return baseFr + parseFloat(postTensionStress.toString());
};


const calculateL = (Ec: number, h: number, k: number) => {
    if (!Ec || Ec <= 0 || !h || h <= 0 || !k || k <= 0) return 0;
    const numerator = Ec * Math.pow(h, 3) * 1000;
    const denominator = 12 * (1 - Math.pow(POISSON_RATIO, 2)) * k;
    return Math.pow(numerator / denominator, 0.25);
};

const calculateRForPointLoad = (shape: string, dim1: number, dim2: number) => {
    if (shape === 'circular') return dim1 / 2;
    return Math.sqrt(dim1 * dim2 / Math.PI);
};


const calculateB = (r: number, h: number) => {
    if (r === 0 || h === 0) return 0;
    return r >= 1.72 * h ? r : Math.sqrt(1.6 * r * r + h * h) - 0.675 * h;
};

// Aligned with TM38 Worked Examples & original XLSM File
const calculateSingleInteriorStress = (P_tonnes: number, h: number, l: number, b: number) => {
    if (h <= 0 || l <= 0 || b <= 0) return 0;
    const P_N = P_tonnes * 9810;
    const stress = (0.275 * (1 + POISSON_RATIO) * P_N / (h * h)) * Math.log(l / b); // Natural Log
    return stress > 0 ? stress : 0;
};

// Aligned with TM38 Worked Examples & original XLSM File
const calculateSingleEdgeStress = (P_tonnes: number, h: number, l: number, b: number, jointType: string) => {
    if (h <= 0 || l <= 0 || b <= 0) return 0;
    const P_N = P_tonnes * 9810;
    let stress = (0.529 * (1 + 0.54 * POISSON_RATIO) * P_N / (h * h)) * Math.log(l / b); // Natural Log
    if (jointType !== 'No Load Transfer') stress *= 0.85;
    return stress > 0 ? stress : 0;
};

// Aligned with TM38 Worked Examples & original XLSM File
const calculateSingleCornerStress = (P_tonnes: number, h: number, l: number, r: number, jointType: string) => {
    if (h <= 0 || l <= 0 || r <= 0) return 0;
    const P_N = P_tonnes * 9810;
    let stress = (3 * P_N / (h * h)) * (1 - Math.pow((r * Math.sqrt(2) / l), 0.6));
    if (jointType !== 'No Load Transfer') stress *= 0.7;
    return stress > 0 ? stress : 0;
};


// --- Stress Distribution & Superposition ---
const interpolate = (points: number[][], x: number) => {
    if (x <= points[0][0]) return points[0][1];
    if (x >= points[points.length - 1][0]) return points[points.length - 1][1];
    for (let i = 0; i < points.length - 1; i++) {
        if (x >= points[i][0] && x <= points[i + 1][0]) {
            const x1 = points[i][0], y1 = points[i][1];
            const x2 = points[i + 1][0], y2 = points[i + 1][1];
            return y1 + (y2 - y1) * (x - x1) / (x2 - x1);
        }
    }
    return points[points.length - 1][1];
};

const interiorRadialPoints = [[0,100], [0.5,60], [1,25], [1.5,5], [2,-5], [3,-8], [4,-5], [5,-2], [6,0]];
const interiorTangentialPoints = [[0,100], [0.5,80], [1,55], [1.5,35], [2,20], [3,8], [4,2], [5,0], [6,0]];
const edgeRadialPoints = [[0,100], [0.5,50], [1,20], [1.5,5], [2,-5], [3,-10], [4,-8], [5,-4], [6,0]];

const getStressContribution = (distOverL: number, baseStress: number, type: string) => {
    let points;
    if (type === 'interior-radial') points = interiorRadialPoints;
    else if (type === 'interior-tangential') points = interiorTangentialPoints;
    else if (type === 'edge-radial') points = edgeRadialPoints;
    else return 0;
    return baseStress * interpolate(points, distOverL) / 100;
};

// Calculates total stress, then applies load factor at the end.
const calculateTotalFactoredStress = (P_tonnes_unfactored: number, h: number, l: number, jointType: string, distances: any[], loadCase: string, r_contact: number) => {
    const r_int = r_contact;
    const r_edge = r_contact * Math.sqrt(2);
    
    let baseStress = 0;

    if (loadCase.includes('edge')) {
        const b_base = calculateB(r_edge, h);
        baseStress = calculateSingleEdgeStress(P_tonnes_unfactored, h, l, b_base, jointType);
    } else if (loadCase === 'corner') {
        baseStress = calculateSingleCornerStress(P_tonnes_unfactored, h, l, r_int, jointType);
    } else { // interior
        const b_base = calculateB(r_int, h);
        baseStress = calculateSingleInteriorStress(P_tonnes_unfactored, h, l, b_base);
    }
    
    let totalUnfactoredStress = baseStress;

    distances.forEach(d => {
        if (d.dist > 0) {
            const distOverL = d.dist / l;
            let adjacentStress = 0;
            let stressType = '';
            
            if (d.type === 'interior') {
                const b_adj = calculateB(r_int, h);
                adjacentStress = calculateSingleInteriorStress(P_tonnes_unfactored, h, l, b_adj);
                stressType = 'interior-tangential'; 
            } else if (d.type.includes('edge')) {
                const b_adj = calculateB(r_edge, h);
                adjacentStress = calculateSingleEdgeStress(P_tonnes_unfactored, h, l, b_adj, jointType);
                stressType = 'edge-radial';
            }
            totalUnfactoredStress += getStressContribution(distOverL, adjacentStress, stressType);
        }
    });

    return totalUnfactoredStress * LOAD_FACTOR;
};


const generateStressGraphData = (l: number, P_tonnes: number, h: number, b: number, r: number, jointType: string) => {
    if (!l || l <= 0) return { internalData: [], edgeData: [] };
    const sigma_i_base = calculateSingleInteriorStress(P_tonnes, h, l, b);
    const sigma_e_base = calculateSingleEdgeStress(P_tonnes, h, l, b, jointType);
    const internalData: any[] = [], edgeData: any[] = [];
    const maxDist = 4 * l;
    for (let d = 0; d <= maxDist; d += maxDist / 100) {
        const distOverL = d / l;
        internalData.push({ distance: d.toFixed(0), radial: getStressContribution(distOverL, sigma_i_base, 'interior-radial'), tangential: getStressContribution(distOverL, sigma_i_base, 'interior-tangential') });
        edgeData.push({ distance: d.toFixed(0), radial: getStressContribution(distOverL, sigma_e_base, 'edge-radial')});
    }
    return { internalData, edgeData };
};

// Universal iterative function to find minimum thickness
const findMinThickness = (loadCase: string, allowableStress: number, Ec: number, k: number, P_tonnes_unfactored: number, jointType: string, distances: any[], r_contact: number) => {
    let h = 100; // Start thickness at 100mm minimum
    while (h <= 800) {
        const l = calculateL(Ec, h, k);
        const factoredStress = calculateTotalFactoredStress(P_tonnes_unfactored, h, l, jointType, distances, loadCase, r_contact);
        
        if (factoredStress <= allowableStress) {
            return { thickness: h, stress: factoredStress };
        }
        h++;
    }
    return { thickness: '>800', stress: null };
};


// --- UI Components ---
const NavButton = ({ onClick, children }: {onClick: any, children: React.ReactNode}) => (<button onClick={onClick} className="w-full flex justify-between items-center bg-indigo-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-indigo-700 transition duration-300">{children} <ChevronsRight /></button>);
const ReturnButton = ({ onClick }: {onClick: any}) => (<button onClick={onClick} className="flex items-center bg-gray-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-gray-700 transition duration-300"><ArrowLeft className="mr-2" /> Return to Input Parameters</button>);
const CustomTooltip = ({ active, payload, label }: any) => { if (active && payload && payload.length) { return (<div className="p-2 bg-gray-700 text-white rounded-md border border-gray-600 text-sm"><p className="label">{`Distance : ${label} mm`}</p>{payload.map((p: any, i: number) => ( <p key={i} style={{ color: p.color }}>{`${p.name} : ${p.value.toFixed(2)} MPa`}</p> ))}</div>); } return null; };
const StressChart = ({ data, title, lines }: {data: any, title: string, lines: any[]}) => ( <div className="w-full h-64 mt-4"><h3 className="text-lg font-semibold text-center text-gray-700">{title}</h3><ResponsiveContainer><LineChart data={data} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="distance" label={{ value: 'Distance from load (mm)', position: 'insideBottom', offset: -5 }} /><YAxis label={{ value: 'Stress (MPa)', angle: -90, position: 'insideLeft' }} domain={['auto', 'auto']} /><Tooltip content={<CustomTooltip />} /><Legend />{lines.map(line => (<Line key={line.dataKey} type="monotone" dataKey={line.dataKey} name={line.name} stroke={line.color} strokeWidth={2} dot={false} />))}</LineChart></ResponsiveContainer></div>);

// --- Page Components ---

const InputParameters = ({ sharedInputs, setSharedInputs, setPage }: {sharedInputs: any, setSharedInputs: any, setPage: any}) => {
    const handleInputChange = (e: any) => {
        const { name, value, type, checked } = e.target;
        setSharedInputs((prev: any) => ({...prev, [name]: type === 'checkbox' ? checked : value }));
    };

    useEffect(() => {
        let cbr = 0;
        if (sharedInputs.stiffnessMethod === 'CBR') {
            cbr = parseFloat(sharedInputs.cbrValue);
        } else {
            cbr = calculateCBRFromScala(parseFloat(sharedInputs.scalaValue));
        }
        
        if (!isNaN(cbr) && cbr > 0) {
            const k_subgrade = calculateKFromCBR(cbr);
            let finalModulus = k_subgrade;
            
            if(sharedInputs.useSubbase) {
                const k_modified = calculateModifiedK(k_subgrade, parseFloat(sharedInputs.subbaseThickness));
                 if (!isNaN(k_modified)) {
                    finalModulus = k_modified;
                }
            }
            setSharedInputs((prevInputs: any) => ({
                ...prevInputs,
                subgradeModulus: k_subgrade.toFixed(2),
                finalModulus: finalModulus.toFixed(2)
            }));
        }
    }, [sharedInputs.stiffnessMethod, sharedInputs.cbrValue, sharedInputs.scalaValue, sharedInputs.useSubbase, sharedInputs.subbaseThickness, setSharedInputs]);


    return (
      <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-6">
                 <div className="bg-white p-6 rounded-lg shadow">
                    <h3 className="text-xl font-bold mb-4 text-gray-800">Soil Properties</h3>
                    <div className="space-y-4">
                        <label className="block"><span className="text-gray-700 font-medium">Stiffness estimated using:</span>
                            <select name="stiffnessMethod" value={sharedInputs.stiffnessMethod} onChange={handleInputChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm">
                                <option value="CBR">CBR</option>
                                <option value="Scala">Scala Penetrometer</option>
                            </select>
                        </label>
                        {sharedInputs.stiffnessMethod === 'CBR' ? (
                            <label className="block"><span className="text-gray-700 font-medium">CBR Results (%)</span><input type="number" name="cbrValue" value={sharedInputs.cbrValue} onChange={handleInputChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" /></label>
                        ) : (
                            <label className="block"><span className="text-gray-700 font-medium">Scala Penetrometer Results (mm per blow)</span><input type="number" name="scalaValue" value={sharedInputs.scalaValue} onChange={handleInputChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" /></label>
                        )}
                         <div className="bg-gray-100 p-2 rounded">Sub-grade Modulus: <span className="font-bold">{sharedInputs.subgradeModulus} MN/m³</span></div>
                         <label className="flex items-center space-x-2">
                            <input type="checkbox" name="useSubbase" checked={sharedInputs.useSubbase} onChange={handleInputChange} className="rounded border-gray-300 text-indigo-600 shadow-sm focus:border-indigo-300 focus:ring focus:ring-offset-0 focus:ring-indigo-200 focus:ring-opacity-50" />
                            <span className="text-gray-700">Modify Sub-grade Modulus with Granular Subbase</span>
                        </label>
                        {sharedInputs.useSubbase && (
                            <label className="block"><span className="text-gray-700 font-medium">Thickness of Granular Subbase (mm)</span><input type="number" name="subbaseThickness" value={sharedInputs.subbaseThickness} onChange={handleInputChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" /></label>
                        )}
                        <div className="bg-green-100 p-3 rounded border border-green-200">Final Modified Sub-grade Modulus (k'): <span className="font-bold text-xl text-green-800">{sharedInputs.finalModulus} MN/m³</span></div>
                    </div>
                </div>
                 <div className="bg-white p-6 rounded-lg shadow">
                    <h3 className="text-xl font-bold mb-4 text-gray-800">Concrete & Joint Properties</h3>
                     <div className="space-y-4">
                        <label className="block"><span className="text-gray-700 font-medium">28 Day Compressive Strength (MPa)</span><input type="number" name="compressiveStrength" value={sharedInputs.compressiveStrength} onChange={handleInputChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" /></label>
                        
                        <div>
                            <span className="text-gray-700 font-medium">Full Design Load Applied at</span>
                            <div className="mt-2 flex rounded-md shadow-sm">
                                <button type="button" onClick={() => handleInputChange({ target: { name: 'loadApplicationTime', value: 28 } })} className={`relative inline-flex items-center px-4 py-2 rounded-l-md border border-gray-300 text-sm font-medium ${sharedInputs.loadApplicationTime == 28 ? 'bg-indigo-600 text-white z-10' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>28 Days</button>
                                <button type="button" onClick={() => handleInputChange({ target: { name: 'loadApplicationTime', value: 90 } })} className={`-ml-px relative inline-flex items-center px-4 py-2 rounded-r-md border border-gray-300 text-sm font-medium ${sharedInputs.loadApplicationTime == 90 ? 'bg-indigo-600 text-white z-10' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>90 Days</button>
                            </div>
                        </div>

                        <label className="block"><span className="text-gray-700 font-medium">Joint Detail</span>
                            <select name="jointType" value={sharedInputs.jointType} onChange={handleInputChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm">
                                <option>Dowel Joints</option><option>Tied Joints</option><option>No Load Transfer</option>
                            </select>
                        </label>
                         <label className="block"><span className="text-gray-700 font-medium">Residual Post-Tension Stress (MPa)</span><input type="number" name="postTensionStress" value={sharedInputs.postTensionStress} onChange={handleInputChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" /></label>
                    </div>
                 </div>
            </div>

             <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-xl font-bold mb-4 text-gray-800">Select Calculator</h3>
                 <div className="space-y-3">
                    <NavButton onClick={() => setPage('point')}>Point Loading</NavButton>
                    <NavButton onClick={() => setPage('singleRack')}>Rack Loads - Single Line</NavButton>
                    <NavButton onClick={() => setPage('backToBackRack')}>Rack Loads - Back-to-Back</NavButton>
                    <NavButton onClick={() => setPage('wheel')}>Wheel Loads</NavButton>
                </div>
            </div>
      </div>
    );
};


const PointLoadCalculator = ({ sharedInputs, setPage }: {sharedInputs: any, setPage: any}) => {
    const [inputs, setInputs] = useState({ appliedLoad: 200, loadedShape: 'circular', dim1: 125, dim2: 125, slabThickness: 200 });
    const [outputs, setOutputs] = useState<any>(null);
    const handleInputChange = (e: any) => { const { name, value } = e.target; setInputs(prev => ({ ...prev, [name]: value })); };
    
    const isFormValid = useMemo(() => {
        const fieldsToValidate: {[key: string]: any} = {
            appliedLoad: inputs.appliedLoad,
            slabThickness: inputs.slabThickness,
            dim1: inputs.dim1,
        };
        if (inputs.loadedShape === 'rectangular') {
            fieldsToValidate.dim2 = inputs.dim2;
        }
        return Object.values(fieldsToValidate).every(
            val => val !== '' && !isNaN(parseFloat(val)) && parseFloat(val) > 0
        );
    }, [inputs]);

    const handleCalculate = () => {
        if (!isFormValid) return;
        const { appliedLoad, loadedShape, dim1, dim2, slabThickness } = inputs;
        const { finalModulus, compressiveStrength, loadApplicationTime, jointType, postTensionStress } = sharedInputs;
        const P_tonnes = (parseFloat(appliedLoad) / 9.81);
        const h = parseFloat(slabThickness); const fc = parseFloat(compressiveStrength); const k = parseFloat(finalModulus); const days = parseInt(loadApplicationTime);
        const Ec = calculateEc(fc);
        const fr = calculateAllowableStress(fc, days, '<8000', postTensionStress);
        const l = calculateL(Ec, h, k);
        const r_interior = calculateRForPointLoad(loadedShape, parseFloat(dim1), parseFloat(dim2));
        const b_interior = calculateB(r_interior, h);
        const r_edge = Math.sqrt(2 * Math.PI * r_interior * r_interior / Math.PI);
        const b_edge = calculateB(r_edge, h);
        const sigma_i = calculateSingleInteriorStress(P_tonnes, h, l, b_interior) * LOAD_FACTOR;
        const sigma_e = calculateSingleEdgeStress(P_tonnes, h, l, b_edge, jointType) * LOAD_FACTOR;
        const sigma_c = calculateSingleCornerStress(P_tonnes, h, l, r_interior, jointType) * LOAD_FACTOR;
        const { internalData, edgeData } = generateStressGraphData(l, P_tonnes, h, b_interior, r_interior, jointType);
        setOutputs({ fr, sigma_i, sigma_e, sigma_c, internalData, edgeData });
    };

     return (
        <div className="p-4 md:p-6">
            <div className="mb-6"><ReturnButton onClick={() => setPage('inputs')} /></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                 <div className="bg-yellow-50 p-6 rounded-lg shadow-md border border-yellow-200">
                    <h2 className="text-2xl font-bold mb-4 text-gray-800 border-b pb-2">Inputs: Point Loading</h2>
                    <div className="space-y-4">
                        <label className="block"><span className="text-gray-700 font-medium">Unfactored Applied Loading (kN)</span><input type="number" name="appliedLoad" value={inputs.appliedLoad} onChange={handleInputChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" /></label>
                        <label className="block"><span className="text-gray-700 font-medium">Loaded Shape</span>
                            <select name="loadedShape" value={inputs.loadedShape} onChange={handleInputChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm">
                                <option value="circular">Circular Pad</option><option value="square">Square Pad</option><option value="rectangular">Rectangular Pad</option>
                            </select>
                        </label>
                        {inputs.loadedShape === 'circular' && (<label className="block"><span className="text-gray-700 font-medium">Diameter (mm)</span><input type="number" name="dim1" value={inputs.dim1} onChange={handleInputChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" /></label>)}
                        {inputs.loadedShape === 'square' && (<label className="block"><span className="text-gray-700 font-medium">Side Length (mm)</span><input type="number" name="dim1" value={inputs.dim1} onChange={handleInputChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" /></label>)}
                        {inputs.loadedShape === 'rectangular' && (<div className="flex space-x-2"><label className="block w-1/2"><span className="text-gray-700 font-medium">Width (mm)</span><input type="number" name="dim1" value={inputs.dim1} onChange={handleInputChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" /></label><label className="block w-1/2"><span className="text-gray-700 font-medium">Length (mm)</span><input type="number" name="dim2" value={inputs.dim2} onChange={handleInputChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" /></label></div>)}
                        <label className="block"><span className="text-gray-700 font-medium">Slab Thickness (mm)</span><input type="number" name="slabThickness" value={inputs.slabThickness} onChange={handleInputChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" /></label>
                     </div>
                    <button onClick={handleCalculate} disabled={!isFormValid} className="mt-6 w-full bg-green-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-green-700 transition duration-300 disabled:bg-gray-400">Calculate Stresses</button>
                    {!isFormValid && <p className="text-sm text-red-600 mt-2">Please fill all fields with valid numbers greater than zero.</p>}
                 </div>
                 <div className="bg-blue-50 p-6 rounded-lg shadow-md border border-blue-200">
                    <h2 className="text-2xl font-bold mb-4 text-gray-800 border-b pb-2">Outputs</h2>
                    {outputs ? (
                        <div>
                            <div className="grid grid-cols-2 gap-4 mb-4 text-center">
                                <div className="bg-white p-3 rounded-lg shadow"><p className="text-sm text-gray-600">Allowable Stress (fr)</p><p className="text-xl font-bold text-green-600">{outputs.fr.toFixed(2)} MPa</p></div>
                                <div className="bg-white p-3 rounded-lg shadow"><p className="text-sm text-gray-600">Load Factor</p><p className="text-xl font-bold text-gray-700">{LOAD_FACTOR}</p></div>
                            </div>
                            <h3 className="text-lg font-semibold text-gray-700 mb-2">Factored Stresses</h3>
                            <div className="space-y-2">
                                {[{ name: 'Interior', value: outputs.sigma_i }, { name: 'Edge', value: outputs.sigma_e }, { name: 'Corner', value: outputs.sigma_c }].map(stress => (<div key={stress.name} className={`flex justify-between items-center p-3 rounded-lg ${stress.value > outputs.fr ? 'bg-red-100' : 'bg-green-100'}`}><span className="font-medium text-gray-800">{stress.name} Stress:</span><div className="flex items-center gap-2"><span className={`font-bold text-lg ${stress.value > outputs.fr ? 'text-red-600' : 'text-green-700'}`}>{stress.value.toFixed(2)} MPa</span>{stress.value > outputs.fr && <AlertTriangle className="text-red-500" size={20} />}</div></div>))}
                            </div>
                            <div className="mt-6">
                                <StressChart data={outputs.internalData} title="Internal Stress Distribution" lines={[{ dataKey: 'radial', name: 'Radial Stress', color: '#ff0000' }, { dataKey: 'tangential', name: 'Tangential Stress', color: '#000000' }]} />
                                <StressChart data={outputs.edgeData} title="Edge Stress Distribution" lines={[{ dataKey: 'radial', name: 'Radial Stress', color: '#ff0000' }]} />
                            </div>
                        </div>
                    ) : (<div className="text-center text-gray-500 mt-10"><HelpCircle className="mx-auto h-12 w-12 text-gray-400" /><p className="mt-2">Enter input values and click "Calculate" to see the results.</p></div>)}
                 </div>
            </div>
        </div>
    );
};

const ResultCard = ({ title, thickness, ultimateStrength, factoredStress, isLoading, isCritical, imgSrc }: {title: string, thickness: any, ultimateStrength: any, factoredStress: any, isLoading: boolean, isCritical: boolean, imgSrc?: string}) => ( <div className={`bg-white p-4 rounded-lg shadow-md border ${isCritical ? 'border-red-500 border-2' : 'border-gray-200'}`}><h4 className="font-bold text-gray-700 text-center mb-2">{title}</h4> {imgSrc && <Image src={imgSrc} alt={title} className="mx-auto h-16 mb-2 object-contain" width={64} height={64} data-ai-hint="technical drawing" />} {isLoading ? (<div className="flex justify-center items-center h-24"><Loader2 className="animate-spin h-8 w-8 text-indigo-600" /></div>) : thickness ? (<div className="text-center space-y-1"><div><p className="text-xs text-gray-500">Slab Thickness</p><p className="font-bold text-2xl text-indigo-600">{thickness} <span className="text-sm">mm</span></p></div><div><p className="text-xs text-gray-500">Ultimate Strength</p><p className="font-semibold text-gray-600">{ultimateStrength} <span className="text-xs">MPa</span></p></div><div><p className="text-xs text-gray-500">Factored Stress</p><p className="font-semibold text-gray-600">{factoredStress} <span className="text-xs">MPa</span></p></div></div>) : (<div className="text-center text-gray-500 pt-8 pb-4"><p className="text-sm">Run calculation</p></div>)}</div>);

const SingleRackCalculator = ({ sharedInputs, setPage }: {sharedInputs: any, setPage: any}) => {
    const [inputs, setInputs] = useState({ x: 800, y: 2700, p: 60, basePlate_a: 125, basePlate_b: 125, loadCycles: '< 8000'});
    const [outputs, setOutputs] = useState<any>({});
    const [isLoading, setIsLoading] = useState(false);
    const handleInputChange = (e: any) => { const { name, value } = e.target; setInputs(prev => ({ ...prev, [name]: value }));};

    const handleCalculateThickness = async () => {
        setIsLoading(true);
        setOutputs({});
        const { compressiveStrength, loadApplicationTime, postTensionStress, finalModulus, jointType } = sharedInputs;
        const { p, loadCycles, basePlate_a, basePlate_b, x, y } = inputs;
        const fc = parseFloat(compressiveStrength); const k = parseFloat(finalModulus); 
        const P_tonnes_unfactored = (parseFloat(p) / 9.81);
        const designStrength = calculateAllowableStress(fc, parseInt(loadApplicationTime), loadCycles, postTensionStress);
        const Ec = calculateEc(fc);
        const r_contact = calculateRForPointLoad('rectangular', parseFloat(basePlate_a), parseFloat(basePlate_b));
        
        const singleRackDistances = {
            interior: [{ dist: parseFloat(x), type: 'interior' }, { dist: parseFloat(y), type: 'interior' },{ dist: parseFloat(y), type: 'interior' }],
            edge: [{ dist: parseFloat(y), type: 'edge' }, { dist: parseFloat(y), type: 'edge' }],
            corner: [{ dist: parseFloat(x), type: 'edge' }, { dist: parseFloat(y), type: 'edge' }, { dist: Math.sqrt(x*x + y*y), type: 'interior'}],
        };

        setTimeout(() => {
            const commonArgs: [number, number, number, number, string] = [designStrength, Ec, k, P_tonnes_unfactored, jointType];
            const interiorResult = findMinThickness('interior', ...commonArgs, singleRackDistances.interior, r_contact);
            setOutputs((prev: any) => ({ ...prev, interior: { ...interiorResult, ultimateStrength: designStrength } }));
            const edgeResult = findMinThickness('edge', ...commonArgs, singleRackDistances.edge, r_contact);
             setOutputs((prev: any) => ({ ...prev, edge: { ...edgeResult, ultimateStrength: designStrength } }));
            const cornerResult = findMinThickness('corner', ...commonArgs, singleRackDistances.corner, r_contact);
            setOutputs((prev: any) => ({ ...prev, corner: { ...cornerResult, ultimateStrength: designStrength } }));
            setIsLoading(false);
        }, 100);
    };
    
    const criticalLoadCase = useMemo(() => {
        const results = Object.entries(outputs).filter(([_, val]) => val && (val as any).thickness);
        if (results.length === 0) return null;
        let maxThickness = 0; 
        let criticalCaseName = null;
        results.forEach(([key, val]) => { 
            const thickness = parseFloat((val as any).thickness); 
            if (!isNaN(thickness) && thickness > maxThickness) { 
                maxThickness = thickness; 
                criticalCaseName = key; 
            } 
        });
        return criticalCaseName;
    }, [outputs]);

    return (
        <div className="p-4 md:p-6">
             <div className="mb-6"><ReturnButton onClick={() => setPage('inputs')} /></div>
            <h2 className="text-3xl font-bold mb-6 text-gray-800 text-center">Rack Loads - Single Line of Racks</h2>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                <div className="lg:col-span-1">
                    <div className="bg-white p-4 rounded-lg shadow-md flex justify-center items-center border mb-4">
                        <Image src="/single-rack.svg" alt="Single Line Rack Layout" className="max-w-full h-auto" width={300} height={150} data-ai-hint="rack layout" />
                    </div>
                    <div className="bg-yellow-50 p-6 rounded-lg shadow-md border border-yellow-200">
                    <h3 className="text-xl font-bold mb-4 text-gray-800 border-b pb-2">Inputs</h3>
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-2"><label className="block"><span className="text-gray-700 font-medium">x (mm)</span><input type="number" name="x" value={inputs.x} onChange={handleInputChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" /></label><label className="block"><span className="text-gray-700 font-medium">y (mm)</span><input type="number" name="y" value={inputs.y} onChange={handleInputChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" /></label></div>
                        <label className="block"><span className="text-gray-700 font-medium">Unfactored Foot Load (P) (kN)</span><input type="number" name="p" value={inputs.p} onChange={handleInputChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" /></label>
                        <div className="grid grid-cols-2 gap-2"><label className="block"><span className="text-gray-700 font-medium">Base Plate a (mm)</span><input type="number" name="basePlate_a" value={inputs.basePlate_a} onChange={handleInputChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" /></label><label className="block"><span className="text-gray-700 font-medium">Base Plate b (mm)</span><input type="number" name="basePlate_b" value={inputs.basePlate_b} onChange={handleInputChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" /></label></div>
                        <label className="block"><span className="text-gray-700 font-medium">No. of Load Cycles</span><select name="loadCycles" value={inputs.loadCycles} onChange={handleInputChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"><option>&lt; 8000</option><option>10000</option><option>30000</option><option>50000</option><option>100000</option><option>200000</option><option>300000</option><option>400000</option></select></label>
                    </div>
                     <button onClick={handleCalculateThickness} disabled={isLoading} className="mt-6 w-full bg-green-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-green-700 transition duration-300 disabled:bg-gray-400 flex items-center justify-center">{isLoading && <Loader2 className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" />}{isLoading ? 'Calculating...' : 'Calculate Thickness'}</button>
                    </div>
                </div>
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-blue-50 p-6 rounded-lg shadow-md border border-blue-200">
                         <h3 className="text-xl font-bold mb-4 text-gray-800 border-b pb-2">Outputs</h3>
                         <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                             <ResultCard title="Interior" isLoading={isLoading} thickness={outputs.interior?.thickness} ultimateStrength={outputs.interior?.ultimateStrength?.toFixed(2)} factoredStress={outputs.interior?.stress?.toFixed(2)} isCritical={criticalLoadCase === 'interior'} />
                            <ResultCard title="Edge" isLoading={isLoading} thickness={outputs.edge?.thickness} ultimateStrength={outputs.edge?.ultimateStrength?.toFixed(2)} factoredStress={outputs.edge?.stress?.toFixed(2)} isCritical={criticalLoadCase === 'edge'} />
                            <ResultCard title="Corner" isLoading={isLoading} thickness={outputs.corner?.thickness} ultimateStrength={outputs.corner?.ultimateStrength?.toFixed(2)} factoredStress={outputs.corner?.stress?.toFixed(2)} isCritical={criticalLoadCase === 'corner'} />
                         </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const BackToBackRackCalculator = ({ sharedInputs, setPage }: {sharedInputs: any, setPage: any}) => {
     const [inputs, setInputs] = useState({ x: 800, y: 2700, z: 500, p: 60, basePlate_a: 125, basePlate_b: 125, loadCycles: '< 8000'});
    const [outputs, setOutputs] = useState<any>({});
    const [isLoading, setIsLoading] = useState(false);
    const handleInputChange = (e: any) => { const { name, value } = e.target; setInputs(prev => ({ ...prev, [name]: value }));};
    
    const handleCalculateThickness = async () => {
        setIsLoading(true);
        setOutputs({});
        const { compressiveStrength, loadApplicationTime, postTensionStress, finalModulus, jointType } = sharedInputs;
        const { x, y, z, p, basePlate_a, basePlate_b, loadCycles } = inputs;
        
        const fc = parseFloat(compressiveStrength); const k = parseFloat(finalModulus); 
        const P_tonnes_unfactored = (parseFloat(p) / 9.81);
        const designStrength = calculateAllowableStress(fc, parseInt(loadApplicationTime), loadCycles, postTensionStress);
        const Ec = calculateEc(fc);
        const r_contact = calculateRForPointLoad('rectangular', parseFloat(basePlate_a), parseFloat(basePlate_b));

        const dist_z_center = parseFloat(z) + parseFloat(basePlate_a);

        const distances = {
            interior: [ { dist: parseFloat(x), type: 'interior' }, { dist: parseFloat(y), type: 'interior' }, { dist: parseFloat(y), type: 'interior' }, { dist: dist_z_center, type: 'interior' } ],
            edgeLong: [ { dist: parseFloat(y), type: 'edgeLong' }, { dist: parseFloat(y), type: 'edgeLong' }, { dist: parseFloat(x), type: 'interior' } ],
            edgeShort: [ { dist: parseFloat(x), type: 'edgeShort' }, { dist: dist_z_center, type: 'edgeShort' }, { dist: parseFloat(y), type: 'interior' } ],
            corner: [ { dist: parseFloat(x), type: 'edgeShort' }, { dist: parseFloat(y), type: 'edgeLong' }, { dist: Math.sqrt(parseFloat(x)*parseFloat(x) + parseFloat(y)*parseFloat(y)), type: 'interior' }, ]
        };

        setTimeout(() => {
            const commonArgs: [number, number, number, number, string] = [designStrength, Ec, k, P_tonnes_unfactored, jointType];
            const interiorResult = findMinThickness('interior', ...commonArgs, distances.interior, r_contact);
            setOutputs((prev: any) => ({ ...prev, interior: { ...interiorResult, ultimateStrength: designStrength } }));
            
            const edgeLongResult = findMinThickness('edgeLong', ...commonArgs, distances.edgeLong, r_contact);
            setOutputs((prev: any) => ({ ...prev, edgeLong: { ...edgeLongResult, ultimateStrength: designStrength } }));
            
            const edgeShortResult = findMinThickness('edgeShort', ...commonArgs, distances.edgeShort, r_contact);
            setOutputs((prev: any) => ({ ...prev, edgeShort: { ...edgeShortResult, ultimateStrength: designStrength } }));
            
            const cornerResult = findMinThickness('corner', ...commonArgs, distances.corner, r_contact);
            setOutputs((prev: any) => ({ ...prev, corner: { ...cornerResult, ultimateStrength: designStrength } }));
            
            setIsLoading(false);
        }, 100);
    };

    const criticalLoadCase = useMemo(() => {
        const results = Object.entries(outputs).filter(([_, val]) => val && (val as any).thickness);
        if (results.length === 0) return null;
        let maxThickness = 0;
        let criticalCaseName = null;
        results.forEach(([key, val]) => { 
            const thickness = parseFloat((val as any).thickness); 
            if (!isNaN(thickness) && thickness > maxThickness) { 
                maxThickness = thickness; 
                criticalCaseName = key; 
            }
        });
        return criticalCaseName;
    }, [outputs]);


    return (
        <div className="p-4 md:p-6">
            <div className="mb-6"><ReturnButton onClick={() => setPage('inputs')} /></div>
            <h2 className="text-3xl font-bold mb-6 text-gray-800 text-center">Rack Loads - Back-to-Back Racks</h2>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                <div className="lg:col-span-1 bg-yellow-50 p-6 rounded-lg shadow-md border border-yellow-200">
                    <h3 className="text-xl font-bold mb-4 text-gray-800 border-b pb-2">Inputs</h3>
                    <div className="space-y-4">
                        <label className="block"><span className="text-gray-700 font-medium">Short Leg Spacing (x) (mm)</span><input type="number" name="x" value={inputs.x} onChange={handleInputChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" /></label>
                        <label className="block"><span className="text-gray-700 font-medium">Long Leg Spacing (y) (mm)</span><input type="number" name="y" value={inputs.y} onChange={handleInputChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" /></label>
                        <label className="block"><span className="text-gray-700 font-medium">Clear spacing between legs (z) (mm)</span><input type="number" name="z" value={inputs.z} onChange={handleInputChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" /></label>
                        <label className="block"><span className="text-gray-700 font-medium">Unfactored Foot Load (P) (kN)</span><input type="number" name="p" value={inputs.p} onChange={handleInputChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" /></label>
                        <div className="grid grid-cols-2 gap-2"><label className="block"><span className="text-gray-700 font-medium">Base Plate a (mm)</span><input type="number" name="basePlate_a" value={inputs.basePlate_a} onChange={handleInputChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" /></label><label className="block"><span className="text-gray-700 font-medium">Base Plate b (mm)</span><input type="number" name="basePlate_b" value={inputs.basePlate_b} onChange={handleInputChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" /></label></div>
                        <label className="block"><span className="text-gray-700 font-medium">No. of Load Cycles</span><select name="loadCycles" value={inputs.loadCycles} onChange={handleInputChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"><option>&lt; 8000</option><option>10000</option><option>30000</option><option>50000</option><option>100000</option><option>200000</option><option>300000</option><option>400000</option></select></label>
                    </div>
                    <button onClick={handleCalculateThickness} disabled={isLoading} className="mt-6 w-full bg-green-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-green-700 transition duration-300 disabled:bg-gray-400 flex items-center justify-center">{isLoading && <Loader2 className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" />}{isLoading ? 'Calculating...' : 'Calculate Thickness'}</button>
                </div>
             <div className="lg:col-span-2 space-y-6">
                 <div className="bg-white p-4 rounded-lg shadow-md flex justify-center items-center border"><Image src="/backtoback-rack.svg" alt="Back-to-Back Rack Layout" className="max-w-xs" width={300} height={200} data-ai-hint="rack layout" /></div>
                <div className="bg-blue-50 p-6 rounded-lg shadow-md border border-blue-200">
                         <h3 className="text-xl font-bold mb-4 text-gray-800 border-b pb-2">Outputs</h3>
                         <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <ResultCard title="Interior" isLoading={isLoading} thickness={outputs.interior?.thickness} ultimateStrength={outputs.interior?.ultimateStrength?.toFixed(2)} factoredStress={outputs.interior?.stress?.toFixed(2)} isCritical={criticalLoadCase === 'interior'} />
                            <ResultCard title="Edge (Long)" isLoading={isLoading} thickness={outputs.edgeLong?.thickness} ultimateStrength={outputs.edgeLong?.ultimateStrength?.toFixed(2)} factoredStress={outputs.edgeLong?.stress?.toFixed(2)} isCritical={criticalLoadCase === 'edgeLong'} />
                            <ResultCard title="Edge (Short)" isLoading={isLoading} thickness={outputs.edgeShort?.thickness} ultimateStrength={outputs.edgeShort?.ultimateStrength?.toFixed(2)} factoredStress={outputs.edgeShort?.stress?.toFixed(2)} isCritical={criticalLoadCase === 'edgeShort'} />
                            <ResultCard title="Corner" isLoading={isLoading} thickness={outputs.corner?.thickness} ultimateStrength={outputs.corner?.ultimateStrength?.toFixed(2)} factoredStress={outputs.corner?.stress?.toFixed(2)} isCritical={criticalLoadCase === 'corner'} />
                         </div>
                    </div>
                </div>
            </div>
        </div>
    );
};


const WheelLoadCalculator = ({ sharedInputs, setPage }: {sharedInputs: any, setPage: any}) => {
    const [inputs, setInputs] = useState({ s: 2000, s_a: 700, tyrePressure: 700, axleLoad: 400, loadCycles: '< 8000', wheelType: 'single', tc: 300 });
    const [outputs, setOutputs] = useState<any>({});
    const [isLoading, setIsLoading] = useState(false);
    const handleInputChange = (e: any) => { const { name, value } = e.target; setInputs(prev => ({ ...prev, [name]: value })); };

    const handleCalculateThickness = async () => {
        setIsLoading(true);
        setOutputs({});
        const { compressiveStrength, loadApplicationTime, postTensionStress, subgradeModulus, jointType } = sharedInputs;
        const { s, axleLoad, tyrePressure, loadCycles, wheelType, tc } = inputs;

        const fc = parseFloat(compressiveStrength);
        const k = parseFloat(subgradeModulus); // Use subgrade modulus directly for wheel loads
        const designStrength = calculateAllowableStress(fc, parseInt(loadApplicationTime), loadCycles, postTensionStress);
        const Ec = calculateEc(fc);
        
        const P_wheel_kN = parseFloat(axleLoad) / 2;
        const P_wheel_tonnes_unfactored = P_wheel_kN / 9.81;
        const tyrePressure_MPa = parseFloat(tyrePressure) / 1000;
        
        let r_contact;

        if (wheelType === 'dual') {
            const P_tyre_N = P_wheel_kN * 1000 / 2;
            const contactArea_tyre_mm2 = P_tyre_N / tyrePressure_MPa;
            const r_tyre = Math.sqrt(contactArea_tyre_mm2 / Math.PI);
            r_contact = Math.sqrt(Math.pow(r_tyre, 2) + (2 * parseFloat(tc) * r_tyre) / Math.PI);
        } else {
            const contactArea_mm2 = (P_wheel_kN * 1000) / tyrePressure_MPa;
            r_contact = Math.sqrt(contactArea_mm2 / Math.PI);
        }

        const wheel_spacing = parseFloat(s);

        const distances = {
            interior: [{ dist: wheel_spacing, type: 'interior' }],
            edgePerp: [{ dist: wheel_spacing, type: 'interior' }],
            edgePara: [{ dist: wheel_spacing, type: 'edge' }],
            corner: [{ dist: wheel_spacing, type: 'edge' }],
        };

        setTimeout(() => {
            const commonArgs: [number, number, number, number, string] = [designStrength, Ec, k, P_wheel_tonnes_unfactored, jointType];
            const interiorResult = findMinThickness('interior', ...commonArgs, distances.interior, r_contact);
            setOutputs((prev: any) => ({ ...prev, interior: { ...interiorResult, ultimateStrength: designStrength } }));
            
            const edgePerpResult = findMinThickness('edge', ...commonArgs, distances.edgePerp, r_contact);
            setOutputs((prev: any) => ({ ...prev, edgePerp: { ...edgePerpResult, ultimateStrength: designStrength } }));
            
            const edgeParaResult = findMinThickness('edge', ...commonArgs, distances.edgePara, r_contact);
            setOutputs((prev: any) => ({ ...prev, edgePara: { ...edgeParaResult, ultimateStrength: designStrength } }));
            
            const cornerResult = findMinThickness('corner', ...commonArgs, distances.corner, r_contact);
            setOutputs((prev: any) => ({ ...prev, corner: { ...cornerResult, ultimateStrength: designStrength } }));
            
            setIsLoading(false);
        }, 100);
    };
    
     const criticalLoadCase = useMemo(() => {
        const results = Object.entries(outputs).filter(([_, val]) => val && (val as any).thickness);
        if (results.length === 0) return null;
        let maxThickness = 0; 
        let criticalCaseName = null;
        results.forEach(([key, val]) => { 
            const thickness = parseFloat((val as any).thickness); 
            if (!isNaN(thickness) && thickness > maxThickness) { 
                maxThickness = thickness; 
                criticalCaseName = key; 
            }
        });
        return criticalCaseName;
    }, [outputs]);

    return (
        <div className="p-4 md:p-6">
            <div className="mb-6"><ReturnButton onClick={() => setPage('inputs')} /></div>
            <h2 className="text-3xl font-bold mb-6 text-gray-800 text-center">Wheel Loads - Single or Dual Wheeled</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                 <div className="bg-yellow-50 p-6 rounded-lg shadow-md border border-yellow-200">
                    <h3 className="text-xl font-bold mb-4 text-gray-800 border-b pb-2">Inputs</h3>
                    <div className="flex flex-col md:flex-row gap-4">
                        <Image src="/wheel-loads.svg" alt="Wheel Loads" className="w-48 h-auto object-contain border bg-white p-2 rounded" width={192} height={192} data-ai-hint="wheel load" />
                        <div className="flex-grow space-y-4">
                            <label className="block"><span className="text-gray-700 font-medium">Wheel Type</span><select name="wheelType" value={inputs.wheelType} onChange={handleInputChange} className="mt-1 block w-full"><option value="single">Single</option><option value="dual">Dual</option></select></label>
                            {inputs.wheelType === 'dual' && (<label className="block"><span className="text-gray-700 font-medium">TC = Dual Wheel Spacing (mm)</span><input type="number" name="tc" value={inputs.tc} onChange={handleInputChange} className="mt-1 block w-full" /></label>)}
                            <label className="block"><span className="text-gray-700 font-medium">s = Wheel Spacing (mm)</span><input type="number" name="s" value={inputs.s} onChange={handleInputChange} className="mt-1 block w-full" /></label>
                            <label className="block"><span className="text-gray-700 font-medium">sₐ = Axle Spacing (mm)</span><input type="number" name="s_a" value={inputs.s_a} onChange={handleInputChange} className="mt-1 block w-full" /></label>
                            <label className="block"><span className="text-gray-700 font-medium">Tyre Pressure (kPa)</span><input type="number" name="tyrePressure" value={inputs.tyrePressure} onChange={handleInputChange} className="mt-1 block w-full" /></label>
                            <label className="block"><span className="text-gray-700 font-medium">Axle Load (kN)</span><input type="number" name="axleLoad" value={inputs.axleLoad} onChange={handleInputChange} className="mt-1 block w-full" /></label>
                             <label className="block"><span className="text-gray-700 font-medium">No. of Load Cycles</span><select name="loadCycles" value={inputs.loadCycles} onChange={handleInputChange} className="mt-1 block w-full"><option>&lt; 8000</option><option>10000</option><option>30000</option><option>50000</option><option>100000</option><option>200000</option><option>300000</option><option>400000</option></select></label>
                        </div>
                    </div>
                     <button onClick={handleCalculateThickness} disabled={isLoading} className="mt-6 w-full bg-green-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-green-700 disabled:bg-gray-400 flex items-center justify-center">{isLoading && <Loader2 className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" />}{isLoading ? 'Calculating...' : 'Calculate Thickness'}</button>
                </div>
                 <div className="bg-blue-50 p-6 rounded-lg shadow-md border border-blue-200">
                    <h3 className="text-xl font-bold mb-4 text-gray-800 border-b pb-2">Outputs</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <ResultCard title="Interior" isLoading={isLoading} imgSrc="https://storage.googleapis.com/stedi-studio-app-assets/user/clvxw4k0i0001mo08e3u9n27j/wheel-interior.png" thickness={outputs.interior?.thickness} ultimateStrength={outputs.interior?.ultimateStrength?.toFixed(2)} factoredStress={outputs.interior?.stress?.toFixed(2)} isCritical={criticalLoadCase === 'interior'} />
                        <ResultCard title="Edge (Perpendicular)" isLoading={isLoading} imgSrc="https://storage.googleapis.com/stedi-studio-app-assets/user/clvxw4k0i0001mo08e3u9n27j/wheel-edge-perp.png" thickness={outputs.edgePerp?.thickness} ultimateStrength={outputs.edgePerp?.ultimateStrength?.toFixed(2)} factoredStress={outputs.edgePerp?.stress?.toFixed(2)} isCritical={criticalLoadCase === 'edgePerp'} />
                        <ResultCard title="Edge (Parallel)" isLoading={isLoading} imgSrc="https://storage.googleapis.com/stedi-studio-app-assets/user/clvxw4k0i0001mo08e3u9n27j/wheel-edge-para.png" thickness={outputs.edgePara?.thickness} ultimateStrength={outputs.edgePara?.ultimateStrength?.toFixed(2)} factoredStress={outputs.edgePara?.stress?.toFixed(2)} isCritical={criticalLoadCase === 'edgePara'} />
                        <ResultCard title="Corner" isLoading={isLoading} imgSrc="https://storage.googleapis.com/stedi-studio-app-assets/user/clvxw4k0i0001mo08e3u9n27j/wheel-corner.png" thickness={outputs.corner?.thickness} ultimateStrength={outputs.corner?.ultimateStrength?.toFixed(2)} factoredStress={outputs.corner?.stress?.toFixed(2)} isCritical={criticalLoadCase === 'corner'} />
                    </div>
                </div>
            </div>
        </div>
    );
};

// Main App Component
export default function App() {
    const [page, setPage] = useState('inputs');
    const [sharedInputs, setSharedInputs] = useState({ stiffnessMethod: 'CBR', cbrValue: 10, scalaValue: 10, subgradeModulus: '54.00', useSubbase: true, subbaseThickness: 150, finalModulus: '65.00', compressiveStrength: 35, loadApplicationTime: 90, jointType: 'Dowel Joints', postTensionStress: 0 });
    
    const renderPage = () => {
        switch (page) {
            case 'point': return <PointLoadCalculator sharedInputs={sharedInputs} setPage={setPage} />;
            case 'singleRack': return <SingleRackCalculator sharedInputs={sharedInputs} setPage={setPage} />;
            case 'backToBackRack': return <BackToBackRackCalculator sharedInputs={sharedInputs} setPage={setPage} />;
            case 'wheel': return <WheelLoadCalculator sharedInputs={sharedInputs} setPage={setPage} />;
            case 'inputs':
            default:
                return <InputParameters sharedInputs={sharedInputs} setSharedInputs={setSharedInputs} setPage={setPage} />;
        }
    };

    return (
        <div className="min-h-screen bg-gray-100 font-sans text-gray-900">
            <header className="bg-white shadow-md"><div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4"><h1 className="text-3xl font-bold text-gray-800">TM38 Concrete Slab on Ground Calculator</h1><p className="text-gray-600">Design tool for point load calculations based on CCANZ TM38.</p></div></header>
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8"><div className="bg-white rounded-lg shadow-xl overflow-hidden">{renderPage()}</div></main>
             <footer className="text-center py-4 text-sm text-gray-500"><p>Disclaimer: This programme does not check for punching shear or bearing capacity. The designer must confirm that these comply with NZS3101.</p></footer>
        </div>
    );
}
