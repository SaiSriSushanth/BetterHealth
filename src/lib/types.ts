export type Sex = "female" | "male" | "other";
export type Goal = "lose" | "maintain" | "gain";
export type Activity = "sedentary" | "light" | "moderate" | "high";
export type Equipment = "bodyweight" | "dumbbell" | "barbell" | "cable" | "machine" | "band";
export type Difficulty = "beginner" | "intermediate" | "advanced";
export type Meal = "breakfast" | "lunch" | "dinner" | "snack";

export interface Profile {
  name: string;
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  goal: Goal;
  activity: Activity;
  equipment: Equipment[];
  units: "metric" | "imperial";
  reminders?: Reminders;
}

export interface Targets {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
}

export interface Nutrients {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  sugarG: number;
  sodiumMg: number;
  potassiumMg: number;
  calciumMg: number;
  ironMg: number;
  vitCMg: number;
}

export interface FoodLog extends Nutrients {
  id: string;
  /** user's local date, YYYY-MM-DD */
  day: string;
  meal: Meal;
  name: string;
  /** human label, e.g. "2 eggs" */
  portion: string;
  grams: number;
  source: "table" | "ai" | "manual" | "custom" | "barcode" | "photo";
}

export interface WorkoutSet {
  reps: number;
  weightKg: number;
}
export interface WorkoutEntry {
  exerciseId: string;
  name: string;
  muscleId: string;
  sets: WorkoutSet[];
}
export interface WorkoutLog {
  id: string;
  day: string;
  title: string;
  entries: WorkoutEntry[];
}

/** Per-100g nutrition row in the built-in table. */
export interface FoodEntry {
  name: string;
  aliases: string[];
  per100: Nutrients;
  /** default serving */
  serving: { label: string; grams: number };
  /** grams for one countable piece (egg, banana, slice), if countable */
  pieceGrams?: number;
}

export interface MuscleGroup {
  id: string;
  label: string;
  side: "front" | "back";
  /** body area, for grouping in lists */
  area: "upper" | "arms" | "core" | "lower";
  /** specific muscles included, shown as helper text */
  includes: string[];
}

export interface Exercise {
  id: string;
  name: string;
  muscleId: string;
  equipment: Equipment;
  difficulty: Difficulty;
  cue: string;
}

export interface WeightLog {
  id: string;
  /** user's local date, YYYY-MM-DD; one entry per day */
  day: string;
  kg: number;
}

export interface CustomFoodItem {
  name: string;
  grams: number;
  nutrients: Nutrients;
}

/** A food or whole meal the user saved to log again in one tap. */
export interface CustomFood {
  id: string;
  name: string;
  portion: string;
  grams: number;
  /** totals for the saved portion */
  nutrients: Nutrients;
  favorite: boolean;
  kind: "food" | "meal";
  /** for kind "meal": what it is made of */
  items?: CustomFoodItem[];
}

/** Times are local "HH:MM" strings; null means that reminder is off. */
export interface Reminders {
  enabled: boolean;
  breakfast: string | null;
  lunch: string | null;
  dinner: string | null;
  workout: string | null;
  weighIn: string | null;
  water: boolean;
}
