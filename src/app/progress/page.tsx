"use client";
import Link from "next/link";
import { useApp } from "@/components/AppProvider";
import { WeekHero } from "@/components/progress/WeekHero";
import { WeightSection } from "@/components/progress/WeightSection";
import { CaloriesSection } from "@/components/progress/CaloriesSection";
import { TrainingSection } from "@/components/progress/TrainingSection";
import { cleanWeights } from "@/lib/progress";

export default function ProgressPage() {
  const { ready, today, profile, targets, food, workouts, weights, setWeight, deleteWeight, error } = useApp();
  if (!ready || !today) return <div role="status" aria-label="Loading" className="block block-tangerine h-72 animate-pulse" />;
  if (error) return <p role="alert" className="block block-bubble p-5 font-semibold">{error}</p>;
  if (!profile || !targets) {
    return (
      <div className="block block-sun grid gap-4 p-6 md:p-10">
        <h1>Progress</h1>
        <p className="max-w-md text-lg font-semibold">Set up your profile first so we know your targets. Then your weight, food and training show up here.</p>
        <div><Link href="/" className="btn">Set up my profile</Link></div>
      </div>
    );
  }
  const latest = cleanWeights(weights).at(-1)?.kg ?? profile.weightKg;

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-10 md:gap-14">
      <WeekHero profile={profile} targets={targets} food={food} workouts={workouts} weights={weights} today={today} />
      <WeightSection profile={profile} today={today} weights={weights} setWeight={setWeight} deleteWeight={deleteWeight} />
      <CaloriesSection profile={profile} targets={targets} food={food} today={today} weightKg={latest} />
      <TrainingSection profile={profile} workouts={workouts} today={today} />
    </div>
  );
}
