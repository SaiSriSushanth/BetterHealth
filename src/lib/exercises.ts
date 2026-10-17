import type { Difficulty, Equipment, Exercise, MuscleGroup } from "@/lib/types";

export const MUSCLES: MuscleGroup[] = [
  { id: "neck", label: "Neck", side: "back", area: "upper", includes: ["Sternocleidomastoid", "Neck extensors", "Scalenes"] },
  { id: "traps", label: "Traps", side: "back", area: "upper", includes: ["Upper traps", "Middle traps", "Lower traps"] },
  { id: "shoulders", label: "Shoulders", side: "front", area: "upper", includes: ["Front delts", "Side delts", "Rear delts", "Rotator cuff"] },
  { id: "chest", label: "Chest", side: "front", area: "upper", includes: ["Upper chest", "Mid chest", "Lower chest"] },
  { id: "lats", label: "Lats", side: "back", area: "upper", includes: ["Latissimus dorsi", "Rhomboids", "Teres major"] },
  { id: "lowerback", label: "Lower Back", side: "back", area: "core", includes: ["Erector spinae", "Multifidus"] },
  { id: "abs", label: "Abs", side: "front", area: "core", includes: ["Rectus abdominis", "Transverse abdominis", "Deep core"] },
  { id: "obliques", label: "Obliques", side: "front", area: "core", includes: ["Internal obliques", "External obliques", "Serratus anterior"] },
  { id: "biceps", label: "Biceps", side: "front", area: "arms", includes: ["Biceps brachii", "Brachialis"] },
  { id: "triceps", label: "Triceps", side: "back", area: "arms", includes: ["Long head", "Lateral head", "Medial head"] },
  { id: "forearms", label: "Forearms", side: "front", area: "arms", includes: ["Wrist flexors", "Wrist extensors", "Brachioradialis"] },
  { id: "glutes", label: "Glutes", side: "back", area: "lower", includes: ["Gluteus maximus", "Gluteus medius", "Gluteus minimus"] },
  { id: "quads", label: "Quads", side: "front", area: "lower", includes: ["Rectus femoris", "Vastus lateralis", "Vastus medialis", "Hip flexors"] },
  { id: "hamstrings", label: "Hamstrings", side: "back", area: "lower", includes: ["Biceps femoris", "Semitendinosus", "Semimembranosus"] },
  { id: "adductors", label: "Adductors", side: "front", area: "lower", includes: ["Inner thigh", "Abductors", "TFL"] },
  { id: "calves", label: "Calves", side: "back", area: "lower", includes: ["Gastrocnemius", "Soleus", "Tibialis anterior"] },
];

export const MUSCLE_BY_ID: Record<string, MuscleGroup> = Object.fromEntries(
  MUSCLES.map((m) => [m.id, m]),
);

type Row = [string, string, string, Equipment, Difficulty, string];

const ROWS: Row[] = [
  // neck
  ["chin-tuck", "Chin Tuck", "neck", "bodyweight", "beginner", "Draw chin straight back, making a double chin; keep eyes level."],
  ["neck-side-isometric", "Side Neck Isometric Hold", "neck", "bodyweight", "beginner", "Press head into your palm and resist; keep the neck neutral, no movement."],
  ["band-neck-extension", "Band Neck Extension", "neck", "band", "intermediate", "Anchor band behind head, extend slowly against tension without arching your back."],
  ["machine-neck-flexion", "Machine Neck Flexion", "neck", "machine", "intermediate", "Nod forward through a small range using light weight; control the return."],
  ["wrestler-bridge", "Wrestler's Bridge", "neck", "bodyweight", "advanced", "Rock gently on your head with hands for support; build time slowly."],
  // traps
  ["barbell-shrug", "Barbell Shrug", "traps", "barbell", "beginner", "Lift shoulders straight up toward ears, pause, lower; don't roll them."],
  ["dumbbell-shrug", "Dumbbell Shrug", "traps", "dumbbell", "beginner", "Stand tall, shrug straight up and hold one second at the top."],
  ["cable-face-pull", "Cable Face Pull", "traps", "cable", "intermediate", "Pull rope to forehead with elbows high, squeezing shoulder blades together."],
  ["prone-y-raise", "Prone Y Raise", "traps", "bodyweight", "beginner", "Lie face down, lift arms in a Y with thumbs up; squeeze low traps."],
  ["rack-pull", "Rack Pull", "traps", "barbell", "advanced", "Lift from knee height with a flat back and lock out by squeezing traps."],
  // shoulders
  ["overhead-press", "Barbell Overhead Press", "shoulders", "barbell", "intermediate", "Brace core, press bar overhead in a straight line, finish with ears in front of arms."],
  ["dumbbell-lateral-raise", "Dumbbell Lateral Raise", "shoulders", "dumbbell", "beginner", "Lift arms out to shoulder height with a slight elbow bend; lower slowly."],
  ["pike-push-up", "Pike Push-Up", "shoulders", "bodyweight", "intermediate", "Hips high in an inverted V, lower head toward floor between your hands."],
  ["band-pull-apart", "Band Pull-Apart", "shoulders", "band", "beginner", "Pull band to chest with straight arms, squeezing rear delts and shoulder blades."],
  ["handstand-push-up", "Wall Handstand Push-Up", "shoulders", "bodyweight", "advanced", "Keep body tight against the wall; lower head to floor and press up."],
  ["machine-shoulder-press", "Machine Shoulder Press", "shoulders", "machine", "beginner", "Set seat so handles start at shoulder level; press without shrugging."],
  // chest
  ["bench-press", "Barbell Bench Press", "chest", "barbell", "intermediate", "Retract shoulder blades, lower bar to mid-chest, press up with feet planted."],
  ["push-up", "Push-Up", "chest", "bodyweight", "beginner", "Keep a straight line from head to heels; lower chest to the floor."],
  ["dumbbell-incline-press", "Incline Dumbbell Press", "chest", "dumbbell", "intermediate", "Bench at 30 degrees; press dumbbells up and slightly together, elbows at 45 degrees."],
  ["cable-fly", "Cable Fly", "chest", "cable", "intermediate", "Arc hands together with soft elbows; feel the stretch, then squeeze the chest."],
  ["chest-dip", "Chest Dip", "chest", "bodyweight", "advanced", "Lean forward, lower until shoulders are below elbows, and press back up."],
  // lats
  ["pull-up", "Pull-Up", "lats", "bodyweight", "advanced", "Start from a dead hang, drive elbows down and chin over the bar."],
  ["lat-pulldown", "Lat Pulldown", "lats", "cable", "beginner", "Lean back slightly, pull bar to upper chest by driving elbows down."],
  ["barbell-row", "Barbell Row", "lats", "barbell", "intermediate", "Hinge to a flat back, row bar to lower ribs, squeeze shoulder blades."],
  ["one-arm-dumbbell-row", "One-Arm Dumbbell Row", "lats", "dumbbell", "beginner", "Brace on a bench, pull elbow toward hip without twisting your torso."],
  ["inverted-row", "Inverted Row", "lats", "bodyweight", "beginner", "Body straight under a bar; pull chest to bar and lower with control."],
  // lowerback
  ["back-extension", "Back Extension", "lowerback", "bodyweight", "beginner", "Hinge at the hips, rise to a straight line; don't overextend at the top."],
  ["superman", "Superman Hold", "lowerback", "bodyweight", "beginner", "Lift arms and legs together off the floor, hold briefly, keep neck neutral."],
  ["good-morning", "Barbell Good Morning", "lowerback", "barbell", "intermediate", "Soft knees, push hips back with a flat spine until hamstrings stretch."],
  ["deadlift", "Conventional Deadlift", "lowerback", "barbell", "advanced", "Brace hard, push the floor away, and keep the bar close to your legs."],
  ["band-good-morning", "Band Good Morning", "lowerback", "band", "beginner", "Stand on band, hinge hips back with a neutral spine, drive hips forward."],
  // abs
  ["crunch", "Crunch", "abs", "bodyweight", "beginner", "Curl ribs toward pelvis, lifting only shoulder blades; keep neck relaxed."],
  ["plank", "Plank", "abs", "bodyweight", "beginner", "Squeeze glutes and brace abs; keep a straight line from head to heels."],
  ["hanging-leg-raise", "Hanging Leg Raise", "abs", "bodyweight", "advanced", "Curl pelvis up as legs rise; avoid swinging."],
  ["cable-crunch", "Cable Crunch", "abs", "cable", "intermediate", "Kneel and curl spine down, bringing elbows toward knees; hips stay still."],
  ["dead-bug", "Dead Bug", "abs", "bodyweight", "beginner", "Press lower back into floor while extending opposite arm and leg slowly."],
  // obliques
  ["side-plank", "Side Plank", "obliques", "bodyweight", "beginner", "Stack feet, lift hips so body forms a straight line; hold steady."],
  ["bicycle-crunch", "Bicycle Crunch", "obliques", "bodyweight", "beginner", "Rotate ribs to bring elbow toward opposite knee; keep movement slow."],
  ["dumbbell-russian-twist", "Weighted Russian Twist", "obliques", "dumbbell", "intermediate", "Lean back with a long spine and rotate from the ribs, not the arms."],
  ["pallof-press", "Pallof Press", "obliques", "band", "intermediate", "Press band straight out and resist rotation; keep hips square."],
  ["cable-woodchop", "Cable Woodchop", "obliques", "cable", "intermediate", "Rotate through the torso diagonally, pivoting rear foot as you chop."],
  // biceps
  ["barbell-curl", "Barbell Curl", "biceps", "barbell", "beginner", "Pin elbows at your sides, curl up without swinging, lower slowly."],
  ["dumbbell-hammer-curl", "Dumbbell Hammer Curl", "biceps", "dumbbell", "beginner", "Palms face in; curl with elbows still to hit the brachialis."],
  ["incline-dumbbell-curl", "Incline Dumbbell Curl", "biceps", "dumbbell", "intermediate", "Let arms hang behind the torso for a full stretch, then curl up."],
  ["chin-up", "Chin-Up", "biceps", "bodyweight", "intermediate", "Underhand grip; pull chin over the bar leading with your chest."],
  ["band-curl", "Band Curl", "biceps", "band", "beginner", "Stand on band, curl with elbows tucked and squeeze at the top."],
  // triceps
  ["close-grip-bench-press", "Close-Grip Bench Press", "triceps", "barbell", "intermediate", "Hands shoulder-width, elbows tucked; press bar in a slight arc."],
  ["triceps-pushdown", "Cable Triceps Pushdown", "triceps", "cable", "beginner", "Pin elbows to your ribs and extend fully; control the return."],
  ["bench-dip", "Bench Dip", "triceps", "bodyweight", "beginner", "Hands on bench edge, lower until elbows reach 90 degrees, then press up."],
  ["overhead-dumbbell-extension", "Overhead Dumbbell Extension", "triceps", "dumbbell", "intermediate", "Keep elbows pointing forward; lower weight behind head, then extend."],
  ["diamond-push-up", "Diamond Push-Up", "triceps", "bodyweight", "advanced", "Hands form a diamond under chest; elbows stay close as you lower."],
  // forearms
  ["wrist-curl", "Dumbbell Wrist Curl", "forearms", "dumbbell", "beginner", "Forearms on thighs, curl weight up with wrists only; lower fully."],
  ["reverse-wrist-curl", "Reverse Wrist Curl", "forearms", "dumbbell", "beginner", "Palms down, extend wrists up slowly using light weight."],
  ["dead-hang", "Dead Hang", "forearms", "bodyweight", "intermediate", "Hang from a bar with an active grip; keep shoulders packed."],
  ["reverse-barbell-curl", "Reverse Barbell Curl", "forearms", "barbell", "intermediate", "Overhand grip, elbows fixed; curl without letting wrists bend back."],
  ["band-finger-extension", "Band Finger Extension", "forearms", "band", "beginner", "Place a band around fingers and open your hand against the resistance."],
  // glutes
  ["hip-thrust", "Barbell Hip Thrust", "glutes", "barbell", "intermediate", "Chin tucked, drive hips up to full lockout and squeeze glutes hard."],
  ["glute-bridge", "Glute Bridge", "glutes", "bodyweight", "beginner", "Press through heels, lift hips until knees, hips, shoulders align."],
  ["cable-glute-kickback", "Cable Glute Kickback", "glutes", "cable", "intermediate", "Kick straight back, squeeze glute, and avoid arching your lower back."],
  ["single-leg-hip-thrust", "Single-Leg Hip Thrust", "glutes", "bodyweight", "advanced", "Keep hips level as you thrust up on one leg; pause at the top."],
  ["dumbbell-step-up", "Dumbbell Step-Up", "glutes", "dumbbell", "beginner", "Drive through the lead heel on a high step; don't push off the back foot."],
  // quads
  ["bodyweight-squat", "Bodyweight Squat", "quads", "bodyweight", "beginner", "Sit hips back and down with chest up; keep knees tracking over toes."],
  ["goblet-squat", "Goblet Squat", "quads", "dumbbell", "beginner", "Hold weight at chest, squat deep with an upright torso."],
  ["back-squat", "Barbell Back Squat", "quads", "barbell", "advanced", "Brace, squat to at least parallel, and drive up through mid-foot."],
  ["leg-press", "Leg Press", "quads", "machine", "intermediate", "Lower until knees reach 90 degrees without lifting your hips off the pad."],
  ["walking-lunge", "Walking Lunge", "quads", "bodyweight", "intermediate", "Take long steps, drop back knee toward floor, and keep torso upright."],
  // hamstrings
  ["romanian-deadlift", "Romanian Deadlift", "hamstrings", "barbell", "intermediate", "Soft knees, push hips back until you feel a deep hamstring stretch."],
  ["lying-leg-curl", "Lying Leg Curl", "hamstrings", "machine", "beginner", "Curl heels to glutes with hips pressed down; lower slowly."],
  ["nordic-curl", "Nordic Hamstring Curl", "hamstrings", "bodyweight", "advanced", "Anchor ankles, lower your torso as slowly as possible with a straight hip line."],
  ["single-leg-rdl", "Single-Leg Romanian Deadlift", "hamstrings", "dumbbell", "intermediate", "Hinge on one leg with the back leg extended; keep hips square."],
  ["slider-leg-curl", "Slider Hamstring Curl", "hamstrings", "bodyweight", "beginner", "Bridge up, slide heels out and back while keeping hips lifted."],
  // adductors
  ["copenhagen-plank", "Copenhagen Plank", "adductors", "bodyweight", "advanced", "Top leg on bench, lift hips and hold a straight line, squeezing the inner thigh."],
  ["cable-hip-adduction", "Cable Hip Adduction", "adductors", "cable", "intermediate", "Pull the working leg across your body slowly, keeping the torso upright."],
  ["side-lying-leg-raise", "Side-Lying Leg Raise", "adductors", "bodyweight", "beginner", "Lift the top leg with toes forward, keeping hips stacked."],
  ["band-lateral-walk", "Band Lateral Walk", "adductors", "band", "beginner", "Stay in a quarter squat and step wide, keeping tension on the band."],
  ["sumo-squat", "Dumbbell Sumo Squat", "adductors", "dumbbell", "beginner", "Wide stance, toes out; squat deep and push knees over toes."],
  // calves
  ["standing-calf-raise", "Standing Calf Raise", "calves", "machine", "beginner", "Rise to full height on your toes, pause, then lower below the step."],
  ["seated-calf-raise", "Seated Calf Raise", "calves", "machine", "beginner", "Knees bent to target soleus; pause at the top and stretch fully."],
  ["bodyweight-calf-raise", "Bodyweight Calf Raise", "calves", "bodyweight", "beginner", "Rise onto the balls of your feet, hold one second, lower slowly."],
  ["single-leg-calf-raise", "Single-Leg Dumbbell Calf Raise", "calves", "dumbbell", "intermediate", "Hold a wall for balance, rise high on one foot, and lower slowly."],
  ["tibialis-raise", "Wall Tibialis Raise", "calves", "bodyweight", "intermediate", "Lean on a wall, lift toes toward shins and lower under control."],
];

export const EXERCISES: Exercise[] = ROWS.map(
  ([id, name, muscleId, equipment, difficulty, cue]) => ({ id, name, muscleId, equipment, difficulty, cue }),
);
