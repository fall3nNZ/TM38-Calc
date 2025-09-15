"use client";

import React, { useState, useMemo } from 'react';
import Image from 'next/image';
import { Loader2, ArrowLeft } from 'lucide-react';
import { calculateEc, calculateAllowableStress, calculateRForPointLoad, findMinThickness } from '../utils/calculations';

// --- UI Components (could be moved to a shared UI file if used elsewhere) ---
const ReturnButton = ({ onClick }: { onClick: any }) => (<button onClick={onClick} className="flex items-center bg-gray-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-gray-700 transition duration-300"><ArrowLeft className="mr-2" /> Return to Input Parameters</button>);
const ResultCard = ({ title, thickness, ultimateStrength, factoredStress, isLoading, isCritical, imgSrc }: { title: string, thickness: any, ultimateStrength: any, factoredStress: any, isLoading: boolean, isCritical: boolean, imgSrc?: string }) => (<div className={`bg-white p-4 rounded-lg shadow-md border ${isCritical ? 'border-red-500 border-2' : 'border-gray-200'}`}><h4 className="font-bold text-gray-700 text-center mb-2">{title}</h4> {imgSrc && <Image src={imgSrc} alt={title} className="mx-auto h-16 mb-2 object-contain" width={64} height={64} data-ai-hint="technical drawing" />} {isLoading ? (<div className="flex justify-center items-center h-24"><Loader2 className="animate-spin h-8 w-8 text-indigo-600" /></div>) : thickness ? (<div className="text-center space-y-1"><div><p className="text-xs text-gray-500">Slab Thickness</p><p className="font-bold text-2xl text-indigo-600">{thickness} <span className="text-sm">mm</span></p></div><div><p className="text-xs text-gray-500">Ultimate Strength</p><p className="font-semibold text-gray-600">{ultimateStrength} <span className="text-xs">MPa</span></p></div><div><p className="text-xs text-gray-500">Factored Stress</p><p className="font-semibold text-gray-600">{factoredStress} <span className="text-xs">MPa</span></p></div></div>) : (<div className="text-center text-gray-500 pt-8 pb-4"><p className="text-sm">Run calculation</p></div>)}</div>);

export default function BackToBackRackCalculator({ sharedInputs, setPage }: { sharedInputs: any, setPage: any }) {
    const [inputs, setInputs] = useState({ x: 800, y: 2700, z: 500, p: 60, basePlate_a: 125, basePlate_b: 125, loadCycles: '< 8000' });
    const [outputs, setOutputs] = useState<any>({});
    const [isLoading, setIsLoading] = useState(false);
    const handleInputChange = (e: any) => { const { name, value } = e.target; setInputs(prev => ({ ...prev, [name]: value })); };

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
            interior: [{ dist: parseFloat(x), type: 'interior' }, { dist: parseFloat(y), type: 'interior' }, { dist: parseFloat(y), type: 'interior' }, { dist: dist_z_center, type: 'interior' }],
            edgeLong: [{ dist: parseFloat(y), type: 'edgeLong' }, { dist: parseFloat(y), type: 'edgeLong' }, { dist: parseFloat(x), type: 'interior' }],
            edgeShort: [{ dist: parseFloat(x), type: 'edgeShort' }, { dist: dist_z_center, type: 'edgeShort' }, { dist: parseFloat(y), type: 'interior' }],
            corner: [{ dist: parseFloat(x), type: 'edgeShort' }, { dist: parseFloat(y), type: 'edgeLong' }, { dist: Math.sqrt(parseFloat(x) * parseFloat(x) + parseFloat(y) * parseFloat(y)), type: 'interior' },]
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
